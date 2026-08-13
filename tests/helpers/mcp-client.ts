import type { SupabaseClient } from "@supabase/supabase-js"

import { handleMcpRequest } from "@/lib/mcp/handler"
import { issueAccessToken } from "@/lib/oauth/tokens"

import { createFakeSupabaseClient, type FakeDatabase } from "./fake-supabase"

/**
 * Testovací klient pro MCP endpoint.
 *
 * Jde skutečnou cestou — vydá opravdový access token, sestaví HTTP požadavek
 * a nechá ho projít obsluhou včetně ověření, rate limitu a auditu. Nahrazuje
 * se jediná věc: tvorba Supabase klienta, aby testy nepotřebovaly databázi.
 */

export const MCP_URL = "https://faktury.test/mcp"

export interface JsonRpcResponse {
  jsonrpc: "2.0"
  id: number | string | null
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

export interface ToolEnvelopeResult {
  success: boolean
  data?: Record<string, unknown>
  error?: { code: string; message: string; retryable: boolean }
}

export async function tokenFor(
  userId: string,
  scope = "invoices:read invoices:write",
): Promise<string> {
  const { token } = await issueAccessToken({ userId, clientId: "test-client", scope })
  return token
}

export function mcpRequest(body: unknown, token?: string): Request {
  return new Request(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

export const TEST_ACCOUNT_EMAIL = "terka@example.test"

export function fakeDeps(db: FakeDatabase) {
  return {
    createClient: async (userId: string): Promise<SupabaseClient> =>
      createFakeSupabaseClient(db, userId),
    resolveEmail: async (): Promise<string | null> => TEST_ACCOUNT_EMAIL,
  }
}

let nextId = 1

/** Pošle jednu JSON-RPC zprávu a vrátí odpověď. */
export async function rpc(
  db: FakeDatabase,
  token: string | undefined,
  method: string,
  params?: Record<string, unknown>,
): Promise<{ status: number; body: JsonRpcResponse | null; response: Response }> {
  const response = await handleMcpRequest(
    mcpRequest({ jsonrpc: "2.0", id: nextId++, method, params }, token),
    fakeDeps(db),
  )

  const text = await response.text()
  let body: JsonRpcResponse | null = null
  try {
    body = JSON.parse(text) as JsonRpcResponse
  } catch {
    body = null
  }

  return { status: response.status, body, response }
}

/** Zavolá nástroj a vrátí rozbalenou obálku výsledku. */
export async function callTool(
  db: FakeDatabase,
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolEnvelopeResult> {
  const { body } = await rpc(db, token, "tools/call", { name, arguments: args })
  const structured = body?.result?.structuredContent

  if (!structured) {
    throw new Error(`Nástroj ${name} nevrátil strukturovaný výsledek: ${JSON.stringify(body)}`)
  }

  return structured as ToolEnvelopeResult
}
