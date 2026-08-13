import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"

import { corsHeaders } from "@/lib/oauth/http"
import { createUserScopedClient, getAccountEmail } from "@/lib/supabase/user-scoped"

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
  /** E-mail účtu pro výstup nástrojů. Bere se ze stejné cache jako token. */
  resolveEmail: typeof getAccountEmail
}

const defaultDeps: McpHandlerDeps = {
  createClient: createUserScopedClient,
  resolveEmail: getAccountEmail,
}

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

  // Vydání Supabase session sahá po síti (Auth Admin API), takže selhat může.
  // Bez ošetření by z toho byla holá 500: klient by hlásil nedostupný konektor
  // a do auditu by se nezapsalo nic, protože sem obal nástrojů ještě nesahá.
  let ctx
  try {
    const supabase = await deps.createClient(auth.identity.userId)
    const accountEmail = await deps.resolveEmail(auth.identity.userId)
    ctx = createMcpContext({ ...auth.identity, accountEmail, supabase })
  } catch (error) {
    console.error("[mcp] Nepodařilo se vydat Supabase session:", error)
    return jsonRpcError(
      requestId(body),
      "Nepodařilo se ověřit identitu u databáze. Zkus to prosím za chvíli znovu.",
    )
  }

  const server = createMcpServer(ctx)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  // Log na úrovni transportu: audit se zapisuje až uvnitř obalu nástroje, takže
  // volání odmítnuté dřív (třeba validací vstupu v SDK) po sobě nenechá stopu.
  // Bez tohohle řádku nejde poznat, jestli požadavek vůbec dorazil.
  logIncoming(body, auth.identity.userId)

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

/** Zaznamená, co dorazilo — bez argumentů, ať se do logu nedostanou osobní údaje. */
function logIncoming(body: unknown, userId: string): void {
  if (!body || typeof body !== "object") return

  const message = body as { method?: unknown; params?: { name?: unknown } }
  if (typeof message.method !== "string") return

  const tool = typeof message.params?.name === "string" ? ` ${message.params.name}` : ""
  console.log(`[mcp] ${userId} → ${message.method}${tool}`)
}

/** Id požadavku pro chybovou odpověď; u dávky nebo nečitelného těla `null`. */
function requestId(body: unknown): string | number | null {
  if (body && typeof body === "object" && "id" in body) {
    const id = (body as { id: unknown }).id
    if (typeof id === "string" || typeof id === "number") return id
  }
  return null
}

/**
 * Chyba ve tvaru JSON-RPC. Klient ji umí zobrazit jako selhání konkrétního
 * volání místo toho, aby celý konektor prohlásil za nedostupný.
 */
function jsonRpcError(id: string | number | null, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32603, message } }),
    { status: 200, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
  )
}

function errorResponse(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({ success: false, error: { code, message, retryable: false } }),
    { status, headers: { ...corsHeaders(), "Content-Type": "application/json" } },
  )
}
