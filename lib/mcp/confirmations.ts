import { hashParams } from "@/lib/oauth/crypto"
import { ServiceError } from "@/lib/services/errors"

import { callRpc, type McpContext } from "./context"

/**
 * Potvrzovací tokeny pro zápisové operace.
 *
 * `prepare_*` nástroj spočítá přesně to, co se stane, uloží otisk parametrů
 * a vrátí token. Zapisující nástroj token spotřebuje — a databáze ověří, že
 * patří témuž uživateli, témuž nástroji a nezměněným parametrům.
 *
 * Prostý příznak `confirmed: true` by nestačil: ten si model umí vyplnit sám.
 * Token vzniká výhradně na serveru, je jednorázový a po změně jakéhokoli
 * parametru přestává platit.
 */

const CONFIRMATION_TTL_SECONDS = 300
const TOKEN_PREFIX = "cnf_"

export interface Confirmation {
  token: string
  expiresAt: string
}

export async function createConfirmation(
  ctx: McpContext,
  toolName: string,
  params: unknown,
  summary: Record<string, unknown>,
): Promise<Confirmation> {
  const id = await callRpc<string>(ctx, "mcp_create_confirmation", {
    p_tool: toolName,
    p_params_hash: await hashParams(params),
    p_summary: summary,
    p_ttl_seconds: CONFIRMATION_TTL_SECONDS,
  })

  return {
    token: `${TOKEN_PREFIX}${id}`,
    expiresAt: new Date(Date.now() + CONFIRMATION_TTL_SECONDS * 1000).toISOString(),
  }
}

/**
 * Ověří a jednorázově spotřebuje potvrzovací token.
 *
 * @param toolName jméno nástroje, pro který byl token vydán (typicky ten
 *                 `prepare_*`, ne ten zapisující)
 * @throws {ServiceError} když token chybí, nesedí, vypršel nebo už byl použit
 */
export async function consumeConfirmation(
  ctx: McpContext,
  toolName: string,
  token: string,
  params: unknown,
): Promise<string> {
  if (!token.startsWith(TOKEN_PREFIX)) {
    throw new ServiceError("CONFIRMATION_INVALID", "Potvrzovací token má neplatný tvar.")
  }

  const id = token.slice(TOKEN_PREFIX.length)
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new ServiceError("CONFIRMATION_INVALID", "Potvrzovací token má neplatný tvar.")
  }

  const result = await callRpc<string>(ctx, "mcp_consume_confirmation", {
    p_id: id,
    p_tool: toolName,
    p_params_hash: await hashParams(params),
  })

  switch (result) {
    case "ok":
      return id
    case "expired":
      throw new ServiceError(
        "CONFIRMATION_EXPIRED",
        "Potvrzení vypršelo. Připrav operaci znovu a nech ji potvrdit.",
      )
    case "already_used":
      throw new ServiceError(
        "CONFIRMATION_ALREADY_USED",
        "Potvrzení už bylo použito. Operace se neopakuje.",
      )
    case "mismatch":
      throw new ServiceError(
        "CONFIRMATION_MISMATCH",
        "Parametry se od potvrzeného návrhu liší. Připrav operaci znovu.",
      )
    default:
      throw new ServiceError(
        "CONFIRMATION_INVALID",
        "Potvrzovací token nebyl nalezen. Připrav operaci znovu.",
      )
  }
}
