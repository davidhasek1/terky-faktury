import { z } from "zod"

import { amountSchema, dateSchema, paginationSchema, textSchema, uuidSchema } from "./common"

/** Hodnoty musí sedět na enum `service_type` z migrace 011. */
export const serviceTypeSchema = z.enum(["cleaning", "laundry", "apartment_service"])

export const MAX_ACTIVITY_SERVICES = 20

export const activityServiceInputSchema = z.object({
  service_type: serviceTypeSchema,
  price: amountSchema,
  note: textSchema(200, "Poznámka")
    .transform((value) => (value === "" ? null : value))
    .nullish()
    .transform((value) => value ?? null),
})

export const activityInputSchema = z.object({
  customer_id: uuidSchema,
  activity_date: dateSchema,
  services: z
    .array(activityServiceInputSchema)
    .min(1, "Aktivita musí mít alespoň jednu službu")
    .max(MAX_ACTIVITY_SERVICES, `Aktivita může mít nejvýše ${MAX_ACTIVITY_SERVICES} služeb`),
})

export type ActivityInput = z.infer<typeof activityInputSchema>

export const activityListSchema = paginationSchema.extend({
  customer_id: uuidSchema.optional(),
  status: z.enum(["all", "paid", "unpaid"]).default("all"),
  date_from: dateSchema.optional(),
  date_to: dateSchema.optional(),
})

export type ActivityListFilters = z.infer<typeof activityListSchema>
