import { sumScaled, toDecimal, type Scaled } from "@/lib/money"
import type { Activity, ActivityService, ActivityStatus, Customer } from "@/lib/types"
import type { ActivityInput, ActivityListFilters } from "@/lib/validation/activities"

import type { ServiceContext } from "./context"
import { getCustomer } from "./customers"
import { ServiceError, toServiceError } from "./errors"

/** Deník služeb (úklid, prádlo, servis apartmánu) vedený k zákazníkovi. */

const ACTIVITY_COLUMNS =
  "id, user_id, customer_id, activity_date, status, total_amount, created_at, updated_at"

export interface ActivityWithCustomer extends Activity {
  customer: Customer | null
}

export interface ActivityDetail extends ActivityWithCustomer {
  services: ActivityService[]
}

export async function listActivities(
  ctx: ServiceContext,
  filters: ActivityListFilters,
): Promise<ActivityWithCustomer[]> {
  let query = ctx.supabase
    .from("activities")
    .select(`${ACTIVITY_COLUMNS}, customer:customers(*)`)
    .eq("user_id", ctx.userId)
    .order("activity_date", { ascending: false })
    .range(filters.offset, filters.offset + filters.limit - 1)

  if (filters.customer_id) query = query.eq("customer_id", filters.customer_id)
  if (filters.status !== "all") query = query.eq("status", filters.status)
  if (filters.date_from) query = query.gte("activity_date", filters.date_from)
  if (filters.date_to) query = query.lte("activity_date", filters.date_to)

  const { data, error } = await query.returns<ActivityWithCustomer[]>()
  if (error) throw toServiceError(error, "Nepodařilo se načíst aktivity")
  return data ?? []
}

export async function getActivity(
  ctx: ServiceContext,
  activityId: string,
): Promise<ActivityDetail> {
  const { data, error } = await ctx.supabase
    .from("activities")
    .select(`${ACTIVITY_COLUMNS}, customer:customers(*)`)
    .eq("id", activityId)
    .maybeSingle<ActivityWithCustomer>()

  if (error) throw toServiceError(error, "Nepodařilo se načíst aktivitu")
  if (!data) throw new ServiceError("ACTIVITY_NOT_FOUND", "Aktivita nebyla nalezena.")

  return { ...data, services: await getActivityServices(ctx, activityId) }
}

export async function getActivityServices(
  ctx: ServiceContext,
  activityId: string,
): Promise<ActivityService[]> {
  const { data, error } = await ctx.supabase
    .from("activity_services")
    .select("id, activity_id, service_type, price, note")
    .eq("activity_id", activityId)
    .returns<ActivityService[]>()

  if (error) throw toServiceError(error, "Nepodařilo se načíst služby aktivity")
  return data ?? []
}

export function activityTotal(services: readonly { price: Scaled }[]): Scaled {
  return sumScaled(services.map((service) => service.price))
}

export async function createActivity(
  ctx: ServiceContext,
  input: ActivityInput,
): Promise<ActivityDetail> {
  // Aktivitu lze založit jen k vlastnímu zákazníkovi; cizí customer_id
  // by prošlo cizím klíčem, ale ne přes RLS čtení zákazníka.
  await getCustomer(ctx, input.customer_id)

  const total = activityTotal(input.services)
  const { data: activity, error } = await ctx.supabase
    .from("activities")
    .insert({
      user_id: ctx.userId,
      customer_id: input.customer_id,
      activity_date: input.activity_date,
      status: "unpaid",
      total_amount: toDecimal(total),
    })
    .select(ACTIVITY_COLUMNS)
    .single<Activity>()

  if (error) throw toServiceError(error, "Nepodařilo se vytvořit aktivitu")

  const { error: servicesError } = await ctx.supabase
    .from("activity_services")
    .insert(serviceRows(input, activity.id))

  if (servicesError) {
    await ctx.supabase.from("activities").delete().eq("id", activity.id)
    throw toServiceError(servicesError, "Nepodařilo se uložit služby aktivity")
  }

  return { ...activity, customer: null, services: await getActivityServices(ctx, activity.id) }
}

export async function updateActivity(
  ctx: ServiceContext,
  activityId: string,
  input: ActivityInput,
): Promise<ActivityDetail> {
  await getActivity(ctx, activityId)
  await getCustomer(ctx, input.customer_id)

  const total = activityTotal(input.services)
  const { data: activity, error } = await ctx.supabase
    .from("activities")
    .update({
      customer_id: input.customer_id,
      activity_date: input.activity_date,
      total_amount: toDecimal(total),
      updated_at: new Date().toISOString(),
    })
    .eq("id", activityId)
    .select(ACTIVITY_COLUMNS)
    .maybeSingle<Activity>()

  if (error) throw toServiceError(error, "Nepodařilo se uložit aktivitu")
  if (!activity) throw new ServiceError("ACTIVITY_NOT_FOUND", "Aktivita nebyla nalezena.")

  const { error: deleteError } = await ctx.supabase
    .from("activity_services")
    .delete()
    .eq("activity_id", activityId)

  if (deleteError) throw toServiceError(deleteError, "Nepodařilo se aktualizovat služby aktivity")

  const { error: insertError } = await ctx.supabase
    .from("activity_services")
    .insert(serviceRows(input, activityId))

  if (insertError) throw toServiceError(insertError, "Nepodařilo se uložit služby aktivity")

  return { ...activity, customer: null, services: await getActivityServices(ctx, activityId) }
}

export async function setActivityStatus(
  ctx: ServiceContext,
  activityId: string,
  status: ActivityStatus,
): Promise<Activity> {
  const { data, error } = await ctx.supabase
    .from("activities")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", activityId)
    .select(ACTIVITY_COLUMNS)
    .maybeSingle<Activity>()

  if (error) throw toServiceError(error, "Nepodařilo se změnit stav aktivity")
  if (!data) throw new ServiceError("ACTIVITY_NOT_FOUND", "Aktivita nebyla nalezena.")
  return data
}

export async function deleteActivity(ctx: ServiceContext, activityId: string): Promise<void> {
  const { error } = await ctx.supabase.from("activities").delete().eq("id", activityId)
  if (error) throw toServiceError(error, "Nepodařilo se smazat aktivitu")
}

function serviceRows(input: ActivityInput, activityId: string) {
  return input.services.map((service) => ({
    activity_id: activityId,
    service_type: service.service_type,
    price: toDecimal(service.price),
    note: service.note,
  }))
}
