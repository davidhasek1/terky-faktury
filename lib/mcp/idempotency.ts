import { hashParams } from "@/lib/oauth/crypto"
import { ServiceError } from "@/lib/services/errors"

import { callRpc, type McpContext } from "./context"
import type { ToolPayload } from "./output"

/**
 * Idempotence zápisových nástrojů.
 *
 * Když model zopakuje volání se stejným `idempotency_key`, nesmí vzniknout
 * druhá faktura ani odejít druhý e-mail — vrátí se původní výsledek.
 * Stejný klíč s jinými parametry je naopak chyba: znamená to, že si model
 * plete dvě různé operace.
 */

type BeginState =
  | { state: "fresh" }
  | { state: "in_progress" }
  | { state: "conflict" }
  | { state: "replay"; result: ToolPayload }

export interface IdempotentOutcome {
  payload: ToolPayload
  replayed: boolean
}

export async function withIdempotency(
  ctx: McpContext,
  toolName: string,
  key: string | undefined,
  params: unknown,
  run: () => Promise<ToolPayload>,
): Promise<IdempotentOutcome> {
  if (!key) {
    return { payload: await run(), replayed: false }
  }

  const requestHash = await hashParams(params)
  const begin = await callRpc<BeginState>(ctx, "mcp_begin_idempotent", {
    p_tool: toolName,
    p_key: key,
    p_request_hash: requestHash,
  })

  if (begin.state === "replay") {
    return { payload: begin.result, replayed: true }
  }

  if (begin.state === "conflict") {
    throw new ServiceError(
      "IDEMPOTENCY_KEY_REUSED",
      "Stejný idempotency key už byl použit pro jinou operaci. Použij nový klíč.",
    )
  }

  if (begin.state === "in_progress") {
    throw new ServiceError(
      "CONFLICT",
      "Stejná operace právě probíhá. Počkej na její dokončení.",
    )
  }

  try {
    const payload = await run()
    await callRpc<null>(ctx, "mcp_complete_idempotent", {
      p_tool: toolName,
      p_key: key,
      p_result: payload,
    })
    return { payload, replayed: false }
  } catch (error) {
    // Rezervaci klíče uvolníme, ať jde volání po opravě vstupu zopakovat.
    await callRpc<null>(ctx, "mcp_release_idempotent", {
      p_tool: toolName,
      p_key: key,
    }).catch(() => undefined)
    throw error
  }
}
