import { z } from "zod"

import {
  countInvoicesByCustomer,
  createCustomer,
  getCustomer,
  searchCustomers,
  updateCustomer,
} from "@/lib/services/customers"
import { idempotencyKeySchema } from "@/lib/validation/common"
import { customerInputSchema } from "@/lib/validation/customers"

import { defineTool } from "@/lib/mcp/define-tool"
import { withIdempotency } from "@/lib/mcp/idempotency"
import { safeText } from "@/lib/mcp/output"
import { presentCustomer, presentCustomerCandidate } from "@/lib/mcp/present"
import { CONFIRMATION_TOKEN_HINT, twoPhase } from "@/lib/mcp/two-phase"

/** Nástroje pro práci se zákazníky. */

/**
 * Volitelná pole jsou `nullish`: model je běžně posílá jako `null`, když je
 * uživatel neuvedl. Se samotným `optional()` by takové volání spadlo na
 * validaci ještě před obalem nástroje, takže by po něm nezůstala ani stopa
 * v auditu.
 */
const customerFields = {
  name: z.string().trim().min(1).max(200).describe("Název zákazníka nebo jméno osoby."),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .nullish()
    .describe("E-mail pro odesílání faktur. Když žádný není, vynech nebo pošli null."),
  phone: z.string().trim().max(40).nullish().describe("Telefonní číslo."),
  address: z.string().trim().max(500).nullish().describe("Fakturační adresa."),
  nie: z.string().trim().max(40).nullish().describe("Identifikační číslo NIE."),
  nif: z.string().trim().max(40).nullish().describe("Daňové číslo NIF."),
  is_business: z
    .boolean()
    .optional()
    .describe(
      "Zda jde o podnikající subjekt. Ovlivňuje výchozí retención na fakturách (15 % místo 0 %).",
    ),
  confirmation_token: z.string().min(1).optional().describe(CONFIRMATION_TOKEN_HINT),
}

type CustomerArgs = {
  name: string
  email?: string | null
  phone?: string | null
  address?: string | null
  nie?: string | null
  nif?: string | null
  is_business?: boolean
  customer_id?: string
}

/** Normalizované parametry pro otisk potvrzení. Ven se nikdy neposílají. */
function canonicalParams(args: CustomerArgs) {
  return {
    customer_id: args.customer_id ?? null,
    name: args.name.trim(),
    email: args.email?.trim() || null,
    phone: args.phone?.trim() || null,
    address: args.address?.trim() || null,
    nie: args.nie?.trim() || null,
    nif: args.nif?.trim() || null,
    is_business: args.is_business ?? false,
  }
}

function toServiceInput(args: CustomerArgs) {
  return customerInputSchema.parse({
    name: args.name,
    email: args.email,
    phone: args.phone,
    address: args.address,
    ico: args.nie,
    dic: args.nif,
    is_business: args.is_business ?? false,
  })
}

function summaryOf(args: CustomerArgs) {
  return {
    name: safeText(args.name, 200),
    email: args.email ?? null,
    phone: args.phone ?? null,
    address: safeText(args.address, 500),
    nie: args.nie ?? null,
    nif: args.nif ?? null,
    is_business: args.is_business ?? false,
  }
}

export const searchCustomersTool = defineTool({
  name: "search_customers",
  title: "Najít zákazníky",
  description:
    "Vyhledá zákazníky podle jména, e-mailu, NIE nebo NIF. Použij vždy, když uživatel označí " +
    "zákazníka jménem — vrací seznam kandidátů s rozlišujícími údaji. Když je výsledků víc, " +
    "zeptej se uživatele, kterého myslel. Nikdy nevybírej prvního z pořadí sám.",
  inputSchema: {
    query: z.string().trim().min(2).max(100).describe("Hledaný výraz, alespoň dva znaky."),
    limit: z.number().int().min(1).max(25).default(10).describe("Maximální počet kandidátů."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:read",
  rateLimit: "call",
  handler: async (args, ctx) => {
    const customers = await searchCustomers(ctx.service, {
      query: args.query,
      limit: args.limit,
      offset: 0,
    })
    const counts = await countInvoicesByCustomer(
      ctx.service,
      customers.map((customer) => customer.id),
    )

    return {
      payload: {
        account: { email: ctx.accountEmail },
        candidates: customers.map((customer) =>
          presentCustomerCandidate(customer, counts.get(customer.id) ?? 0),
        ),
        count: customers.length,
        ambiguous: customers.length > 1,
        next_step:
          customers.length > 1
            ? "Zeptej se uživatele, kterého z kandidátů myslí, a použij jeho id."
            : customers.length === 0
              ? "Žádný zákazník neodpovídá. Nabídni vytvoření nového přes create_customer."
              : "Potvrď s uživatelem, že jde o tohoto zákazníka, a použij jeho id.",
      },
      resourceType: "customer",
    }
  },
})

export const getCustomerTool = defineTool({
  name: "get_customer",
  title: "Detail zákazníka",
  description:
    "Vrátí úplné údaje jednoho zákazníka podle id. Použij po search_customers, když potřebuješ " +
    "ověřit kontaktní nebo fakturační údaje.",
  inputSchema: {
    customer_id: z.string().uuid().describe("Identifikátor zákazníka z search_customers."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:read",
  rateLimit: "call",
  handler: async (args, ctx) => {
    const customer = await getCustomer(ctx.service, args.customer_id)
    return {
      payload: { customer: presentCustomer(customer) },
      resourceType: "customer",
      resourceId: customer.id,
    }
  },
})

export const createCustomerTool = defineTool({
  name: "create_customer",
  title: "Vytvořit zákazníka",
  description:
    "Založí zákazníka. Probíhá na dva kroky: zavolej nejdřív BEZ confirmation_token — vrátí se " +
    "návrh a nic se neuloží. Ukaž ho uživateli, a po jeho souhlasu zavolej tentýž nástroj znovu " +
    "se stejnými argumenty a s tokenem z návrhu.",
  inputSchema: {
    ...customerFields,
    idempotency_key: idempotencyKeySchema
      .optional()
      .describe("Volitelný klíč proti duplicitnímu založení při opakovaném volání."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const params = canonicalParams(args)

    return twoPhase(ctx, {
      tool: "create_customer",
      token: args.confirmation_token,
      params,
      status: "NÁVRH — zákazník zatím NEBYL vytvořen",
      summary: summaryOf(args),
      resourceType: "customer",
      execute: async (confirmationId) => {
        const outcome = await withIdempotency(
          ctx,
          "create_customer",
          args.idempotency_key,
          params,
          async () => ({
            customer: presentCustomer(await createCustomer(ctx.service, toServiceInput(args))),
          }),
        )

        return {
          payload: { saved: true, ...outcome.payload, replayed: outcome.replayed },
          resourceType: "customer",
          confirmationId,
          idempotencyKey: args.idempotency_key ?? null,
        }
      },
    })
  },
})

export const updateCustomerTool = defineTool({
  name: "update_customer",
  title: "Upravit zákazníka",
  description:
    "Přepíše údaje existujícího zákazníka. Neuvedená pole se vymažou, takže posílej kompletní " +
    "údaje. Dvoufázové: nejdřív bez confirmation_token pro návrh, po souhlasu uživatele znovu " +
    "se stejnými argumenty a s tokenem.",
  inputSchema: {
    ...customerFields,
    customer_id: z.string().uuid().describe("Identifikátor upravovaného zákazníka."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const current = await getCustomer(ctx.service, args.customer_id)
    const params = canonicalParams(args)

    return twoPhase(ctx, {
      tool: "update_customer",
      token: args.confirmation_token,
      params,
      status: "NÁVRH — zákazník zatím NEBYL upraven",
      summary: { ...summaryOf(args), current: presentCustomer(current) },
      resourceType: "customer",
      resourceId: args.customer_id,
      execute: async (confirmationId) => {
        const customer = await updateCustomer(ctx.service, args.customer_id, toServiceInput(args))

        return {
          payload: { saved: true, customer: presentCustomer(customer) },
          resourceType: "customer",
          resourceId: customer.id,
          confirmationId,
        }
      },
    })
  },
})
