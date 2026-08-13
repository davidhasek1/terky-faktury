import { z } from "zod"

import { isServiceError, type ServiceErrorCode } from "@/lib/services/errors"
import { firstIssueMessage } from "@/lib/validation/common"

/**
 * Jednotný tvar odpovědi MCP nástroje.
 *
 * Model dostane vždycky stejnou obálku, takže si nemusí domýšlet, jak
 * poznat chybu. Do `data` patří jen to, co je pro výsledek potřeba —
 * nikdy celé databázové řádky, tokeny ani interní konfigurace.
 */

export const toolOutputShape = {
  success: z.boolean(),
  data: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      retryable: z.boolean(),
    })
    .optional(),
}

export type ToolPayload = Record<string, unknown>

/**
 * Zapsáno jako `type`, ne `interface` — jen tak má obálka implicitní index
 * signaturu a projde jako `structuredContent` v odpovědi MCP SDK.
 */
export type ToolEnvelope = {
  success: boolean
  data?: ToolPayload
  error?: { code: string; message: string; retryable: boolean }
}

export function ok(data: ToolPayload): ToolEnvelope {
  return { success: true, data }
}

export function fail(
  code: ServiceErrorCode,
  message: string,
  retryable = false,
): ToolEnvelope {
  return { success: false, error: { code, message, retryable } }
}

/**
 * Převede chybu na obálku. Neznámé chyby nikdy neprosakují ven — do odpovědi
 * jde obecná hláška, detail zůstane v logu.
 */
export function toEnvelope(error: unknown, toolName: string): ToolEnvelope {
  // Schémata se validují dvakrát: na vstupu nástroje a znovu v servisní vrstvě.
  // Když projde to první a padne až druhé (typicky formát data), je to pořád
  // chyba vstupu — bez tohohle by se z ní stala neurčitá interní chyba a model
  // by uživateli hlásil jen „konektor selhal".
  if (error instanceof z.ZodError) {
    return fail("VALIDATION_ERROR", firstIssueMessage(error))
  }

  if (isServiceError(error)) {
    return { success: false, error: { code: error.code, message: error.message, retryable: error.retryable } }
  }

  console.error(`[mcp] Neošetřená chyba v nástroji ${toolName}:`, error)
  return fail("INTERNAL_ERROR", "Operaci se nepodařilo dokončit.", true)
}

const MAX_TEXT_LENGTH = 500

/**
 * Text pocházející z databáze je nedůvěryhodný vstup — uživatel si do názvu
 * zákazníka nebo do poznámky může napsat cokoli včetně pokynů pro model.
 * Do výstupu proto jde jen jako datová hodnota: bez řídicích znaků a zkrácený.
 *
 * Skutečnou ochranou zůstává, že o autorizaci a potvrzování rozhoduje backend,
 * ne obsah těchto polí.
 */
export function safeText(
  value: string | null | undefined,
  maxLength = MAX_TEXT_LENGTH,
): string | null {
  if (value === null || value === undefined) return null

  // Řídicí znaky pryč — v datové hodnotě nemají co dělat.
  const cleaned = value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim()
  if (cleaned === "") return null

  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned
}

/** Zamaskuje e-mail pro seznamy kandidátů (rozliší zákazníky, ale neodhalí adresu). */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null
  const [local, domain] = email.split("@")
  if (!domain) return null
  const visible = local.slice(0, 2)
  return `${visible}${local.length > 2 ? "…" : ""}@${domain}`
}
