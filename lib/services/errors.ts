/**
 * Doménové chyby sdílené UI, API routami i MCP vrstvou.
 *
 * Kód je stabilní strojově čitelný identifikátor (používá ho MCP výstup),
 * zpráva je česká a určená koncovému uživateli. Nikdy do zprávy nedávej
 * interní detaily (SQL, stack trace, konfiguraci) — ty patří do logu.
 */

export const SERVICE_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "CUSTOMER_NOT_FOUND",
  "CUSTOMER_AMBIGUOUS",
  "CUSTOMER_EMAIL_MISSING",
  "INVOICE_NOT_FOUND",
  "ACTIVITY_NOT_FOUND",
  "COMPANY_PROFILE_MISSING",
  "UNSUPPORTED_CURRENCY",
  "CONFIRMATION_REQUIRED",
  "CONFIRMATION_INVALID",
  "CONFIRMATION_EXPIRED",
  "CONFIRMATION_ALREADY_USED",
  "CONFIRMATION_MISMATCH",
  "IDEMPOTENCY_KEY_REUSED",
  "EMAIL_SEND_FAILED",
  "CONFLICT",
  "DATABASE_ERROR",
  "INTERNAL_ERROR",
] as const

export type ServiceErrorCode = (typeof SERVICE_ERROR_CODES)[number]

/** Chyby, u kterých má smysl operaci zopakovat beze změny vstupu. */
const RETRYABLE_CODES: ReadonlySet<ServiceErrorCode> = new Set([
  "RATE_LIMITED",
  "DATABASE_ERROR",
  "EMAIL_SEND_FAILED",
])

export class ServiceError extends Error {
  readonly code: ServiceErrorCode
  readonly retryable: boolean
  /** Bezpečné doplňující údaje pro model — nikdy ne osobní ani interní data. */
  readonly details?: Record<string, string | number | boolean>

  constructor(
    code: ServiceErrorCode,
    message: string,
    details?: Record<string, string | number | boolean>,
  ) {
    super(message)
    this.name = "ServiceError"
    this.code = code
    this.retryable = RETRYABLE_CODES.has(code)
    this.details = details
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError
}

/**
 * Převede libovolnou chybu (typicky z supabase-js) na doménovou chybu.
 * Původní zpráva se do výstupu nedostane — může obsahovat názvy sloupců,
 * SQL nebo části dotazu.
 */
export function toServiceError(error: unknown, fallbackMessage: string): ServiceError {
  if (isServiceError(error)) return error
  return new ServiceError("DATABASE_ERROR", fallbackMessage)
}
