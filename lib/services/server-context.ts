import { createClient } from "@/lib/supabase/server"

import type { ServiceContext } from "./context"
import { ServiceError, type ServiceErrorCode } from "./errors"

/**
 * Kontext servisní vrstvy pro serverové komponenty a API routy.
 * Identita se bere z cookie session, nikdy z parametrů požadavku.
 */
export async function createServerServiceContext(): Promise<ServiceContext> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new ServiceError("UNAUTHENTICATED", "Musíte být přihlášeni")
  }

  return { supabase, userId: user.id }
}

/** Mapování doménových chyb na HTTP status pro API routy. */
export function serviceErrorStatus(code: ServiceErrorCode): number {
  switch (code) {
    case "UNAUTHENTICATED":
      return 401
    case "FORBIDDEN":
      return 403
    case "CUSTOMER_NOT_FOUND":
    case "INVOICE_NOT_FOUND":
    case "ACTIVITY_NOT_FOUND":
      return 404
    case "VALIDATION_ERROR":
    case "CUSTOMER_EMAIL_MISSING":
    case "UNSUPPORTED_CURRENCY":
      return 400
    case "CONFLICT":
      return 409
    case "RATE_LIMITED":
      return 429
    default:
      return 500
  }
}
