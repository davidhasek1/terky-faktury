import { NextResponse } from "next/server"

/**
 * Sdílené odpovědi OAuth a MCP endpointů.
 *
 * Metadata i token endpoint volají klienti z cizích původů (ChatGPT, MCP
 * Inspector), takže potřebují CORS. Vracíme jen to, co protokol vyžaduje.
 */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-protocol-version, mcp-session-id, last-event-id",
  "Access-Control-Expose-Headers": "mcp-session-id, www-authenticate",
  "Access-Control-Max-Age": "86400",
}

export function corsHeaders(): Record<string, string> {
  return { ...CORS_HEADERS }
}

export function preflightResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export function jsonResponse(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { ...corsHeaders(), ...(init?.headers as Record<string, string> | undefined) },
  })
}

/** Chybová odpověď v podobě, kterou předepisuje OAuth 2.1 (RFC 6749 §5.2). */
export function oauthError(
  error: string,
  description: string,
  status = 400,
  extraHeaders?: Record<string, string>,
): NextResponse {
  return jsonResponse(
    { error, error_description: description },
    { status, headers: extraHeaders },
  )
}
