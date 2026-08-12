import { z } from "zod"

import { SERVICE_LABELS } from "@/components/activities/service-labels"
import { toDecimal, parseDecimal } from "@/lib/money"
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
import { activityInputSchema, MAX_ACTIVITY_SERVICES } from "@/lib/validation/activities"
import { idempotencyKeySchema } from "@/lib/validation/common"

import { consumeConfirmation, createConfirmation } from "@/lib/mcp/confirmations"
import { defineTool } from "@/lib/mcp/define-tool"
import { withIdempotency } from "@/lib/mcp/idempotency"
import { safeText } from "@/lib/mcp/output"
import { amountFields, presentActivity } from "@/lib/mcp/present"

/** Nástroje pro deník služeb (aktivity) vedený k jednotlivým zákazníkům. */

const serviceTypeDescription = Object.entries(SERVICE_LABELS)
  .map(([value, label]) => `${value} = ${label}`)
  .join(", ")

const activityServiceShape = z.object({
  service_type: z.enum(["cleaning", "laundry", "apartment_service"]).describe(serviceTypeDescription),
  price: z.union([z.string(), z.number()]).describe("Cena služby v EUR jako řetězec, např. \"25\"."),
  note: z
    .string()
    .trim()
    .max(200)
    .nullish()
    .describe("Krátká poznámka ke službě. Když žádná není, pošli null."),
})

const activityFields = {
  customer_id: z
    .string()
    .uuid()
    .describe("Identifikátor zákazníka ze search_customers."),
  activity_date: z.string().describe("Datum aktivity ve tvaru RRRR-MM-DD."),
  services: z
    .array(activityServiceShape)
    .min(1)
    .max(MAX_ACTIVITY_SERVICES)
    .describe("Provedené služby. Alespoň jedna."),
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

function confirmationPayload(args: ActivityArgs) {
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
    date_from: z.string().optional().describe("Od data (RRRR-MM-DD)."),
    date_to: z.string().optional().describe("Do data (RRRR-MM-DD)."),
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

export const prepareActivityTool = defineTool({
  name: "prepare_activity",
  title: "Připravit aktivitu",
  description:
    "Připraví záznam do deníku služeb a vrátí souhrn s potvrzovacím tokenem. Nic neukládá. " +
    "Souhrn ukaž uživateli, vyžádej si souhlas a pak zavolej create_activity nebo update_activity " +
    "s argumenty z execute_arguments.",
  inputSchema: {
    ...activityFields,
    activity_id: z.string().uuid().optional().describe("Vyplň jen při úpravě existující aktivity."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "call",
  handler: async (args, ctx) => {
    const customer = await getCustomer(ctx.service, args.customer_id)
    const input = toServiceInput(args)
    const payload = confirmationPayload(args)
    const total = activityTotal(input.services)

    const summary = {
      mode: args.activity_id ? "update" : "create",
      customer: { id: customer.id, name: safeText(customer.name, 200) },
      activity_date: args.activity_date,
      services: input.services.map((service) => ({
        service_type: service.service_type,
        label: SERVICE_LABELS[service.service_type],
        price: amountFields(service.price),
        note: safeText(service.note, 200),
      })),
      total: amountFields(total),
    }

    const confirmation = await createConfirmation(ctx, "prepare_activity", payload, summary)

    return {
      payload: {
        summary,
        confirmation_token: confirmation.token,
        expires_at: confirmation.expiresAt,
        execute_arguments: payload,
        next_step: `Po souhlasu uživatele zavolej ${
          args.activity_id ? "update_activity" : "create_activity"
        } s hodnotami z execute_arguments a s confirmation_token.`,
      },
      resourceType: "activity",
      resourceId: args.activity_id ?? null,
    }
  },
})

export const createActivityTool = defineTool({
  name: "create_activity",
  title: "Zapsat aktivitu",
  description:
    "Zapíše novou aktivitu do deníku služeb. Vyžaduje potvrzovací token z prepare_activity " +
    "se shodnými parametry.",
  inputSchema: {
    ...activityFields,
    confirmation_token: z.string().min(1).describe("Token z prepare_activity."),
    idempotency_key: idempotencyKeySchema
      .optional()
      .describe("Volitelný klíč proti dvojímu zápisu při opakovaném volání."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const payload = confirmationPayload(args)
    const confirmationId = await consumeConfirmation(
      ctx,
      "prepare_activity",
      args.confirmation_token,
      payload,
    )

    const outcome = await withIdempotency(
      ctx,
      "create_activity",
      args.idempotency_key,
      payload,
      async () => {
        const activity = await createActivity(ctx.service, toServiceInput(args))
        return { activity: presentActivity(activity, activity.services) }
      },
    )

    return {
      payload: { ...outcome.payload, replayed: outcome.replayed },
      resourceType: "activity",
      confirmationId,
      idempotencyKey: args.idempotency_key ?? null,
    }
  },
})

export const updateActivityTool = defineTool({
  name: "update_activity",
  title: "Upravit aktivitu",
  description:
    "Přepíše aktivitu včetně všech jejích služeb. Vyžaduje potvrzovací token z prepare_activity " +
    "se shodnými parametry.",
  inputSchema: {
    ...activityFields,
    activity_id: z.string().uuid().describe("Identifikátor upravované aktivity."),
    confirmation_token: z.string().min(1).describe("Token z prepare_activity."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const payload = confirmationPayload(args)
    const confirmationId = await consumeConfirmation(
      ctx,
      "prepare_activity",
      args.confirmation_token,
      payload,
    )

    const activity = await updateActivity(ctx.service, args.activity_id, toServiceInput(args))

    return {
      payload: { activity: presentActivity(activity, activity.services) },
      resourceType: "activity",
      resourceId: activity.id,
      confirmationId,
    }
  },
})

function statusPayload(args: { activity_id: string; status: "paid" | "unpaid" }) {
  return { activity_id: args.activity_id, status: args.status }
}

export const prepareActivityStatusTool = defineTool({
  name: "prepare_activity_status",
  title: "Připravit změnu stavu aktivity",
  description:
    "Připraví změnu stavu úhrady aktivity a vrátí souhrn s potvrzovacím tokenem. Nic nemění.",
  inputSchema: {
    activity_id: z.string().uuid().describe("Identifikátor aktivity."),
    status: z.enum(["paid", "unpaid"]).describe("Cílový stav úhrady."),
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "call",
  handler: async (args, ctx) => {
    const activity = await getActivity(ctx.service, args.activity_id)
    const payload = statusPayload(args)
    const confirmation = await createConfirmation(ctx, "prepare_activity_status", payload, {
      activity_date: activity.activity_date,
      status: args.status,
    })

    return {
      payload: {
        summary: {
          activity_date: activity.activity_date,
          customer_name: safeText(activity.customer?.name, 200),
          total: amountFields(parseDecimal(activity.total_amount)),
          current_status: activity.status,
          new_status: args.status,
        },
        warnings:
          activity.status === args.status ? ["Aktivita už v tomto stavu je, operace nic nezmění."] : [],
        confirmation_token: confirmation.token,
        expires_at: confirmation.expiresAt,
        execute_arguments: payload,
        next_step:
          "Po souhlasu uživatele zavolej set_activity_status s hodnotami z execute_arguments " +
          "a s confirmation_token.",
      },
      resourceType: "activity",
      resourceId: activity.id,
    }
  },
})

export const setActivityStatusTool = defineTool({
  name: "set_activity_status",
  title: "Změnit stav aktivity",
  description:
    "Označí aktivitu jako zaplacenou nebo nezaplacenou. Vyžaduje potvrzovací token " +
    "z prepare_activity_status se shodnými parametry.",
  inputSchema: {
    activity_id: z.string().uuid(),
    status: z.enum(["paid", "unpaid"]),
    confirmation_token: z.string().min(1).describe("Token z prepare_activity_status."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  scope: "invoices:write",
  rateLimit: "write",
  handler: async (args, ctx) => {
    const payload = statusPayload(args)
    const confirmationId = await consumeConfirmation(
      ctx,
      "prepare_activity_status",
      args.confirmation_token,
      payload,
    )

    const activity = await setActivityStatus(ctx.service, args.activity_id, args.status)
    const services = await getActivityServices(ctx.service, args.activity_id)

    return {
      payload: { activity: presentActivity({ ...activity, customer: null }, services) },
      resourceType: "activity",
      resourceId: activity.id,
      confirmationId,
    }
  },
})
