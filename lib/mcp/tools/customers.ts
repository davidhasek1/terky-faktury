import { z } from "zod"

import {
  countInvoicesByCustomer,
  createCustomer,
  getCustomer,
  searchCustomers,
  updateCustomer,
} from "@/lib/services/customers"
import { customerInputSchema } from "@/lib/validation/customers"
import { idempotencyKeySchema } from "@/lib/validation/common"

import { consumeConfirmation, createConfirmation, preparePayload } from "@/lib/mcp/confirmations"
import { defineTool } from "@/lib/mcp/define-tool"
import { withIdempotency } from "@/lib/mcp/idempotency"
import { safeText } from "@/lib/mcp/output"
import { presentCustomer, presentCustomerCandidate } from "@/lib/mcp/present"

/** Nástroje pro práci se zákazníky. */

/**
 * Volitelná pole jsou `nullish`, ne jen `optional`: `prepare_customer` vrací
 * nevyplněné hodnoty jako `null` a model je má do zapisujícího nástroje předat
 * beze změny. Se samotným `optional()` by takový průchod skončil na validaci.
 */
const customerFields = {
  name: z.string().trim().min(1).max(200).describe("Název zákazníka nebo jméno osoby."),
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .nullish()
    .describe("E-mail pro odesílání faktur. Když žádný není, pošli null."),
  phone: z.string().trim().max(40).nullish().describe("Telefonní číslo, jinak null."),
  address: z.string().trim().max(500).nullish().describe("Fakturační adresa, jinak null."),
  nie: z.string().trim().max(40).nullish().describe("Identifikační číslo NIE, jinak null."),
  nif: z.string().trim().max(40).nullish().describe("Daňové číslo NIF, jinak null."),
  is_business: z
    .boolean()
    .optional()
    .describe(
      "Zda jde o podnikající subjekt. Ovlivňuje výchozí retención na fakturách (15 % místo 0 %).",
    ),
}

type CustomerFields = z.infer<z.ZodObject<typeof customerFields>>

/**
 * Kanonická podoba parametrů pro potvrzovací token. `prepare_customer`
 * i zapisující nástroje ji skládají stejně, takže otisk sedí jen tehdy,
 * když se opravdu nic nezměnilo.
 */
function confirmationPayload(args: CustomerFields & { customer_id?: string }) {
  return {
    customer_id: args.customer_id ?? null,
    name: args.name,
    email: args.email ?? null,
    phone: args.phone ?? null,
    address: args.address ?? null,
    nie: args.nie ?? null,
    nif: args.nif ?? null,
    is_business: args.is_business ?? false,
  }
}

function toServiceInput(args: CustomerFields) {
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
        candidates: customers.map((customer) =>
          presentCustomerCandidate(customer, counts.get(customer.id) ?? 0),
        ),
        count: customers.length,
        ambiguous: customers.length > 1,
        next_step:
          customers.length > 1
            ? "Zeptej se uživatele, kterého z kandidátů myslí, a použij jeho id."
            : customers.length === 0
              ? "Žádný zákazník neodpovídá. Nabídni vytvoření nového přes prepare_customer."
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

export const prepareCustomerTool = defineTool({
  name: "prepare_customer",
  title: "Připravit zákazníka (neukládá)",
  description:
    "NIC NEUKLÁDÁ. Jen připraví vytvoření nebo úpravu zákazníka a vrátí návrh s potvrzovacím " +
    "tokenem; zákazník vznikne až voláním create_customer. Souhrn ukaž uživateli, vyžádej si výslovný souhlas a teprve pak zavolej " +
    "create_customer nebo update_customer se stejnými parametry a tímto tokenem.",
  inputSchema: {
    ...customerFields,
    customer_id: z
      .string()
      .uuid()
      .optional()
      .describe("Vyplň jen při úpravě existujícího zákazníka."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "call",
  handler: async (args, ctx) => {
    const payload = confirmationPayload(args)
    const mode = args.customer_id ? "update" : "create"
    const current = args.customer_id ? await getCustomer(ctx.service, args.customer_id) : null

    const confirmation = await createConfirmation(ctx, "prepare_customer", payload, {
      mode,
      customer: payload,
    })

    return {
      payload: preparePayload({
        status:
          mode === "create"
            ? "NÁVRH — zákazník zatím NEBYL vytvořen"
            : "NÁVRH — zákazník zatím NEBYL upraven",
        executeTool: mode === "create" ? "create_customer" : "update_customer",
        confirmation,
        executeArguments: payload,
        summary: {
          mode,
          name: safeText(args.name, 200),
          email: args.email ?? null,
          phone: args.phone ?? null,
          address: safeText(args.address, 500),
          nie: args.nie ?? null,
          nif: args.nif ?? null,
          is_business: args.is_business ?? false,
          current: current ? presentCustomer(current) : null,
        },
      }),
      resourceType: "customer",
      resourceId: args.customer_id ?? null,
    }
  },
})

export const createCustomerTool = defineTool({
  name: "create_customer",
  title: "Vytvořit zákazníka",
  description:
    "Vytvoří nového zákazníka. Vyžaduje potvrzovací token z prepare_customer se shodnými " +
    "parametry. Volej až po výslovném souhlasu uživatele.",
  inputSchema: {
    ...customerFields,
    confirmation_token: z.string().min(1).describe("Token z prepare_customer."),
    idempotency_key: idempotencyKeySchema
      .optional()
      .describe("Volitelný klíč proti duplicitnímu založení při opakovaném volání."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const payload = confirmationPayload(args)
    const confirmationId = await consumeConfirmation(
      ctx,
      "prepare_customer",
      args.confirmation_token,
      payload,
    )

    const outcome = await withIdempotency(
      ctx,
      "create_customer",
      args.idempotency_key,
      payload,
      async () => {
        const customer = await createCustomer(ctx.service, toServiceInput(args))
        return { customer: presentCustomer(customer) }
      },
    )

    return {
      payload: { ...outcome.payload, replayed: outcome.replayed },
      resourceType: "customer",
      resourceId: readId(outcome.payload.customer),
      confirmationId,
      idempotencyKey: args.idempotency_key ?? null,
    }
  },
})

export const updateCustomerTool = defineTool({
  name: "update_customer",
  title: "Upravit zákazníka",
  description:
    "Přepíše údaje existujícího zákazníka. Vyžaduje potvrzovací token z prepare_customer " +
    "se shodnými parametry. Neuvedená pole se vymažou — vždy posílej kompletní údaje.",
  inputSchema: {
    ...customerFields,
    customer_id: z.string().uuid().describe("Identifikátor upravovaného zákazníka."),
    confirmation_token: z.string().min(1).describe("Token z prepare_customer."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const payload = confirmationPayload(args)
    const confirmationId = await consumeConfirmation(
      ctx,
      "prepare_customer",
      args.confirmation_token,
      payload,
    )

    const customer = await updateCustomer(ctx.service, args.customer_id, toServiceInput(args))

    return {
      payload: { customer: presentCustomer(customer) },
      resourceType: "customer",
      resourceId: customer.id,
      confirmationId,
    }
  },
})

/** Bezpečné vytažení id z už sestaveného výstupu (může jít o přehrané volání). */
function readId(value: unknown): string | null {
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id: unknown }).id
    if (typeof id === "string") return id
  }
  return null
}

