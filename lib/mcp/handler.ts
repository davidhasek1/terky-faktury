import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"

import { corsHeaders } from "@/lib/oauth/http"
import { createUserScopedClient } from "@/lib/supabase/user-scoped"

import { authenticateRequest } from "./auth"
import { createMcpContext } from "./context"
import { createMcpServer } from "./server"

/**
 * Obsluha MCP endpointu (Streamable HTTP).
 *
 * Server je bezstavový: pro každý požadavek vzniká nová instance i transport,
 * takže mezi uživateli nemůže přetéct žádný stav ani na serverless běhu.
 * Odpovídá se JSON‑em (ne SSE) — nástroje nic dlouhodobě nestreamují.
 *
 * Logika je v samostatném modulu, aby šla testovat bez Next.js routeru.
 */

/** Strop na velikost těla požadavku (~256 kB stačí i na fakturu s 50 položkami). */
export const MAX_REQUEST_BYTES = 256 * 1024

export interface McpHandlerDeps {
  /** Vytvoří Supabase klienta jménem ověřeného uživatele. V testech se nahrazuje. */
  createClient: typeof createUserScopedClient
}

const defaultDeps: McpHandlerDeps = { createClient: createUserScopedClient }

export async function handleMcpRequest(
  request: Request,
  deps: McpHandlerDeps = defaultDeps,
): Promise<Response> {
  const auth = await authenticateRequest(request)
  if (!auth.authenticated) return auth.response

  const raw = await request.text()
  if (raw.length > MAX_REQUEST_BYTES) {
    return errorResponse(413, "PAYLOAD_TOO_LARGE", "Požadavek je příliš velký.")
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return errorResponse(400, "INVALID_JSON", "Tělo požadavku není platný JSON.")
  }

  const supabase = await deps.createClient(auth.identity.userId)
  const ctx = createMcpContext({ ...auth.identity, supabase })

  const server = createMcpServer(ctx)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  try {
    await server.connect(transport)

    const response = await transport.handleRequest(request, {
      parsedBody: body,
      authInfo: {
        token: auth.token,
        clientId: auth.identity.clientId,
        scopes: auth.identity.scope.split(/\s+/).filter(Boolean),
      },
    })

    // Tělo si přečteme dřív, než transport zavřeme, ať se nezavře i stream.
    const payload = await response.text()

    return new Response(payload, {
      status: response.status,
      headers: { ...corsHeaders(), ...headersToObject(response.headers) },
    })
  } finally {
    await transport.close().catch(() => undefined)
    await server.close().catch(() => undefined)
  }
}

function headersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((value, key) => {
    result[key] = value
  })
  return result
}

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code, message, retryable: false } }),
    { status, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
  )
}
