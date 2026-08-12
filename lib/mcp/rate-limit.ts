import { ServiceError } from "@/lib/services/errors"

import { callRpc, type McpContext } from "./context"

/**
 * Rate limit počítaný v databázi, ne v paměti procesu — na serverless běhu
 * by se paměťový čítač resetoval s každou instancí.
 *
 * Dva koše: obecný strop na všechna volání a přísnější na zápisy, aby
 * zacyklený model nevystavil sto faktur.
 */

export const RATE_LIMITS = {
  call: { bucket: "mcp:call", limit: 120, windowSeconds: 60 },
  write: { bucket: "mcp:write", limit: 20, windowSeconds: 60 },
  email: { bucket: "mcp:email", limit: 10, windowSeconds: 3600 },
} as const

export type RateLimitKind = keyof typeof RATE_LIMITS

export async function enforceRateLimit(ctx: McpContext, kind: RateLimitKind): Promise<void> {
  const { bucket, limit, windowSeconds } = RATE_LIMITS[kind]

  const allowed = await callRpc<boolean>(ctx, "mcp_consume_rate_limit", {
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })

  if (!allowed) {
    throw new ServiceError(
      "RATE_LIMITED",
      "Příliš mnoho požadavků za sebou. Zkus to prosím za chvíli znovu.",
      { limit, window_seconds: windowSeconds },
    )
  }
}
