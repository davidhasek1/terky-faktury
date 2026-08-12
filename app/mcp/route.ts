import { handleMcpRequest } from "@/lib/mcp/handler"
import { corsHeaders, preflightResponse } from "@/lib/oauth/http"

/**
 * Veřejná MCP adresa aplikace: `https://<doména>/mcp`.
 *
 * Tuhle URL zadáš v ChatGPT při přidávání konektoru. Autorizace probíhá
 * Bearer tokenem z vestavěného OAuth serveru — middleware sem pouští
 * i nepřihlášené požadavky právě proto, že přihlášení řeší token, ne cookie.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export function POST(request: Request) {
  return handleMcpRequest(request)
}

/**
 * Bezstavový server neposílá zprávy z vlastní iniciativy, takže GET (otevření
 * SSE streamu) ani DELETE (ukončení session) nemá co obsloužit.
 */
export function GET() {
  return methodNotAllowed()
}

export function DELETE() {
  return methodNotAllowed()
}

export function OPTIONS() {
  return preflightResponse()
}

function methodNotAllowed(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    }),
    {
      status: 405,
      headers: { ...corsHeaders(), "Content-Type": "application/json", Allow: "POST, OPTIONS" },
    },
  )
}
