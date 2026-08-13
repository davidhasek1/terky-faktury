import { z } from "zod"

import { SERVICE_LABELS } from "@/components/activities/service-labels"
import { parseDecimal, toDecimal } from "@/lib/money"
import {
  activityTotal,
  createActivity,
  getActivity,
  getActivityServices,
  listActivities,
  setActivityStatus,
  updateActivity,
} from "@/lib/services/activities"
import { getCustomer } from "@/lib/services/customers"
import { MAX_ACTIVITY_SERVICES, activityInputSchema } from "@/lib/validation/activities"
import { idempotencyKeySchema } from "@/lib/validation/common"

import { defineTool } from "@/lib/mcp/define-tool"
import { withIdempotency } from "@/lib/mcp/idempotency"
import { safeText } from "@/lib/mcp/output"
import { amountFields, presentActivity } from "@/lib/mcp/present"
import { CONFIRMATION_TOKEN_HINT, twoPhase } from "@/lib/mcp/two-phase"

/** Nástroje pro deník služeb (aktivity) vedený k jednotlivým zákazníkům. */

const serviceTypeDescription = Object.entries(SERVICE_LABELS)
  .map(([value, label]) => `${value} = ${label}`)
  .join(", ")

const activityServiceShape = z.object({
  service_type: z.enum(["cleaning", "laundry", "apartment_service"]).describe(serviceTypeDescription),
  price: z.union([z.string(), z.number()]).describe("Cena služby v EUR, např. \"25\"."),
  note: z.string().trim().max(200).nullish().describe("Krátká poznámka ke službě."),
})

const activityFields = {
  customer_id: z.string().uuid().describe("Identifikátor zákazníka ze search_customers."),
  activity_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum musí být ve tvaru RRRR-MM-DD").describe("Datum aktivity."),
  services: z
    .array(activityServiceShape)
    .min(1)
    .max(MAX_ACTIVITY_SERVICES)
    .describe("Provedené služby. Alespoň jedna."),
  confirmation_token: z.string().min(1).optional().describe(CONFIRMATION_TOKEN_HINT),
}

type ActivityArgs = {
  customer_id: string
  activity_date: string
  services: {
    service_type: "cleaning" | "laundry" | "apartment_service"
    price: string | number
    note?: string | null
  }[]
  activity_id?: string
}

function canonicalParams(args: ActivityArgs) {
  return {
    activity_id: args.activity_id ?? null,
    customer_id: args.customer_id,
    activity_date: args.activity_date,
    services: args.services.map((service) => ({
      service_type: service.service_type,
      price: toDecimal(parseDecimal(service.price)).toFixed(2),
      note: service.note?.trim() || null,
    })),
  }
}

function toServiceInput(args: ActivityArgs) {
  return activityInputSchema.parse({
    customer_id: args.customer_id,
    activity_date: args.activity_date,
    services: args.services,
  })
}

export const listActivitiesTool = defineTool({
  name: "list_activities",
  title: "Seznam aktivit",
  description:
    "Vrátí záznamy z deníku služeb (úklid, praní, servis apartmánu) s možností filtrovat podle " +
    "zákazníka, stavu úhrady a období. Použij na dotazy typu „co jsme dělali pro klienta X v květnu“.",
  inputSchema: {
    customer_id: z.string().uuid().optional().describe("Omezení na jednoho zákazníka."),
    status: z.enum(["all", "paid", "unpaid"]).default("all"),
    date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum musí být ve tvaru RRRR-MM-DD").optional().describe("Od data."),
    date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum musí být ve tvaru RRRR-MM-DD").optional().describe("Do data."),
    limit: z.number().int().min(1).max(50).default(20),
    offset: z.number().int().min(0).max(10_000).default(0),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:read",
  rateLimit: "call",
  handler: async (args, ctx) => {
    const activities = await listActivities(ctx.service, args)

    return {
      payload: {
        account: { email: ctx.accountEmail },
        activities: activities.map((activity) => ({
          id: activity.id,
          customer_id: activity.customer_id,
          customer_name: safeText(activity.customer?.name, 200),
          activity_date: activity.activity_date,
          status: activity.status,
          total: amountFields(parseDecimal(activity.total_amount)),
        })),
        count: activities.length,
        has_more: activities.length === args.limit,
        next_offset: args.offset + activities.length,
      },
      resourceType: "activity",
    }
  },
})

export const getActivityTool = defineTool({
  name: "get_activity",
  title: "Detail aktivity",
  description: "Vrátí jednu aktivitu včetně jednotlivých služeb a jejich cen.",
  inputSchema: { activity_id: z.string().uuid().describe("Identifikátor aktivity.") },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:read",
  rateLimit: "call",
  handler: async (args, ctx) => {
    const activity = await getActivity(ctx.service, args.activity_id)
    return {
      payload: { activity: presentActivity(activity, activity.services) },
      resourceType: "activity",
      resourceId: activity.id,
    }
  },
})

function activitySummary(args: ActivityArgs, customerName: string | null) {
  const input = toServiceInput(args)

  return {
    customer: { id: args.customer_id, name: customerName },
    activity_date: args.activity_date,
    services: input.services.map((service) => ({
      service_type: service.service_type,
      label: SERVICE_LABELS[service.service_type],
      price: amountFields(service.price),
      note: safeText(service.note, 200),
    })),
    total: amountFields(activityTotal(input.services)),
  }
}

export const createActivityTool = defineTool({
  name: "create_activity",
  title: "Zapsat aktivitu",
  description:
    "Zapíše aktivitu do deníku služeb. Dvoufázové: nejdřív zavolej BEZ confirmation_token pro " +
    "návrh, ukaž ho uživateli a po souhlasu zavolej znovu se stejnými argumenty a s tokenem.",
  inputSchema: {
    ...activityFields,
    idempotency_key: idempotencyKeySchema
      .optional()
      .describe("Volitelný klíč proti dvojímu zápisu při opakovaném volání."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const customer = await getCustomer(ctx.service, args.customer_id)
    const params = canonicalParams(args)

    return twoPhase(ctx, {
      tool: "create_activity",
      token: args.confirmation_token,
      params,
      status: "NÁVRH — aktivita zatím NEBYLA zapsána",
      summary: activitySummary(args, safeText(customer.name, 200)),
      resourceType: "activity",
      execute: async (confirmationId) => {
        const outcome = await withIdempotency(
          ctx,
          "create_activity",
          args.idempotency_key,
          params,
          async () => {
            const activity = await createActivity(ctx.service, toServiceInput(args))
            return { activity: presentActivity(activity, activity.services) }
          },
        )

        return {
          payload: { saved: true, ...outcome.payload, replayed: outcome.replayed },
          resourceType: "activity",
          confirmationId,
          idempotencyKey: args.idempotency_key ?? null,
        }
      },
    })
  },
})

export const updateActivityTool = defineTool({
  name: "update_activity",
  title: "Upravit aktivitu",
  description:
    "Přepíše aktivitu včetně všech jejích služeb. Dvoufázové: nejdřív bez confirmation_token " +
    "pro návrh, po souhlasu uživatele znovu se stejnými argumenty a s tokenem.",
  inputSchema: {
    ...activityFields,
    activity_id: z.string().uuid().describe("Identifikátor upravované aktivity."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const customer = await getCustomer(ctx.service, args.customer_id)
    await getActivity(ctx.service, args.activity_id)
    const params = canonicalParams(args)

    return twoPhase(ctx, {
      tool: "update_activity",
      token: args.confirmation_token,
      params,
      status: "NÁVRH — aktivita zatím NEBYLA upravena",
      summary: activitySummary(args, safeText(customer.name, 200)),
      resourceType: "activity",
      resourceId: args.activity_id,
      execute: async (confirmationId) => {
        const activity = await updateActivity(ctx.service, args.activity_id, toServiceInput(args))

        return {
          payload: { saved: true, activity: presentActivity(activity, activity.services) },
          resourceType: "activity",
          resourceId: activity.id,
          confirmationId,
        }
      },
    })
  },
})

export const setActivityStatusTool = defineTool({
  name: "set_activity_status",
  title: "Změnit stav aktivity",
  description:
    "Označí aktivitu jako zaplacenou nebo nezaplacenou. Dvoufázové: nejdřív bez " +
    "confirmation_token pro návrh, po souhlasu uživatele znovu s tokenem.",
  inputSchema: {
    activity_id: z.string().uuid().describe("Identifikátor aktivity."),
    status: z.enum(["paid", "unpaid"]).describe("Cílový stav úhrady."),
    confirmation_token: z.string().min(1).optional().describe(CONFIRMATION_TOKEN_HINT),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const activity = await getActivity(ctx.service, args.activity_id)
    const params = { activity_id: args.activity_id, status: args.status }

    return twoPhase(ctx, {
      tool: "set_activity_status",
      token: args.confirmation_token,
      params,
      status: "NÁVRH — stav aktivity zatím NEBYL změněn",
      warnings:
        activity.status === args.status
          ? ["Aktivita už v tomto stavu je, operace nic nezmění."]
          : [],
      summary: {
        activity_date: activity.activity_date,
        customer_name: safeText(activity.customer?.name, 200),
        total: amountFields(parseDecimal(activity.total_amount)),
        current_status: activity.status,
        new_status: args.status,
      },
      resourceType: "activity",
      resourceId: args.activity_id,
      execute: async (confirmationId) => {
        const updated = await setActivityStatus(ctx.service, args.activity_id, args.status)
        const services = await getActivityServices(ctx.service, args.activity_id)

        return {
          payload: {
            saved: true,
            activity: presentActivity({ ...updated, customer: null }, services),
          },
          resourceType: "activity",
          resourceId: updated.id,
          confirmationId,
        }
      },
    })
  },
})
