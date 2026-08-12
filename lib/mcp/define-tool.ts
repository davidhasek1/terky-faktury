import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js"
import type { z, ZodRawShape } from "zod"

import { hasScope, type OAuthScope } from "@/lib/oauth/config"
import { ServiceError } from "@/lib/services/errors"

import { writeAudit } from "./audit"
import type { McpContext } from "./context"
import { ok, toEnvelope, toolOutputShape, type ToolEnvelope, type ToolPayload } from "./output"
import { enforceRateLimit, type RateLimitKind } from "./rate-limit"

/**
 * Společný obal všech MCP nástrojů.
 *
 * Nástroj sám řeší jen svoji doménu; kontrolu oprávnění, rate limit, převod
 * chyb do bezpečné obálky a audit dělá tenhle wrapper na jednom místě.
 * Nový nástroj tak nemůže omylem některý z těch kroků vynechat.
 */

export interface ToolResult {
  payload: ToolPayload
  /** Pro audit: čeho se operace týkala. */
  resourceType?: string
  resourceId?: string | null
  confirmationId?: string | null
  idempotencyKey?: string | null
}

export interface ToolDefinition<Shape extends ZodRawShape> {
  name: string
  title: string
  description: string
  inputSchema: Shape
  annotations: ToolAnnotations
  /** Oprávnění, které musí mít access token. */
  scope: OAuthScope
  rateLimit: RateLimitKind
  handler: (args: z.infer<z.ZodObject<Shape>>, ctx: McpContext) => Promise<ToolResult>
}

/** Zachová odvození typů ze schématu při zápisu definice. */
export function defineTool<Shape extends ZodRawShape>(
  definition: ToolDefinition<Shape>,
): ToolDefinition<Shape> {
  return definition
}

/**
 * Podpis `registerTool` s konkrétním tvarem callbacku.
 *
 * SDK odvozuje typ argumentů callbacku z konkrétního schématu. Uvnitř generické
 * funkce, kde je `Shape` ještě neznámý, to TypeScript spojit neumí, takže si
 * registraci podepisujeme sami. Není to únik do `any` — tvar zůstává popsaný
 * a hodnoty stejně validuje zod uvnitř SDK dřív, než se handler zavolá.
 */
type RegisterToolFn = (
  name: string,
  config: {
    title: string
    description: string
    inputSchema: ZodRawShape
    outputSchema: ZodRawShape
    annotations: ToolAnnotations
  },
  callback: (args: Record<string, unknown>) => Promise<CallToolResult>,
) => unknown

export function registerTool<Shape extends ZodRawShape>(
  server: McpServer,
  ctx: McpContext,
  definition: ToolDefinition<Shape>,
): void {
  const register = server.registerTool.bind(server) as unknown as RegisterToolFn

  register(
    definition.name,
    {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: toolOutputShape,
      annotations: definition.annotations,
    },
    async (rawArgs) => {
      const args = rawArgs as z.infer<z.ZodObject<Shape>>
      const startedAt = Date.now()
      let result: ToolResult | undefined
      let envelope: ToolEnvelope

      try {
        if (!hasScope(ctx.scope, definition.scope)) {
          throw new ServiceError(
            "FORBIDDEN",
            "Připojená aplikace nemá oprávnění pro tuto operaci.",
            { required_scope: definition.scope },
          )
        }

        await enforceRateLimit(ctx, definition.rateLimit)

        result = await definition.handler(args, ctx)
        envelope = ok(result.payload)
      } catch (error) {
        envelope = toEnvelope(error, definition.name)
      }

      await writeAudit(ctx, {
        toolName: definition.name,
        outcome: envelope.success ? "success" : "error",
        errorCode: envelope.error?.code ?? null,
        resourceType: result?.resourceType ?? null,
        resourceId: result?.resourceId ?? null,
        idempotencyKey: result?.idempotencyKey ?? null,
        confirmationId: result?.confirmationId ?? null,
        durationMs: Date.now() - startedAt,
      })

      return {
        content: [{ type: "text" as const, text: JSON.stringify(envelope) }],
        structuredContent: envelope,
        isError: !envelope.success,
      }
    },
  )
}
