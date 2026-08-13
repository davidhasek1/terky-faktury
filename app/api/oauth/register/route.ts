import { z } from "zod"

import { DEFAULT_SCOPE, normalizeScope } from "@/lib/oauth/config"
import { jsonResponse, oauthError, preflightResponse, withOAuthErrors } from "@/lib/oauth/http"
import { registerClient } from "@/lib/oauth/store"

/**
 * Dynamická registrace klienta (RFC 7591).
 *
 * ChatGPT si při přidávání konektoru zaregistruje klienta sám, proto je
 * endpoint otevřený. Chráníme ho tvarem vstupu: redirect URI musí být HTTPS
 * (nebo localhost pro vývoj), bez fragmentu, a je jich nejvýše pět.
 * Registrace sama o sobě k ničemu nepouští — bez souhlasu uživatele
 * na autorizační obrazovce klient žádný token nedostane.
 */
export const dynamic = "force-dynamic"

const MAX_REDIRECT_URIS = 5

const redirectUriSchema = z
  .string()
  .url("redirect_uri musí být absolutní URL")
  .max(2048)
  .refine((value) => {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return false
    }
    if (url.hash !== "") return false
    if (url.protocol === "https:") return true
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")
  }, "redirect_uri musí být HTTPS (localhost smí HTTP) a bez fragmentu")

const registrationSchema = z.object({
  client_name: z.string().trim().min(1).max(200).default("MCP klient"),
  redirect_uris: z.array(redirectUriSchema).min(1).max(MAX_REDIRECT_URIS),
  grant_types: z
    .array(z.enum(["authorization_code", "refresh_token"]))
    .default(["authorization_code", "refresh_token"]),
  response_types: z.array(z.literal("code")).default(["code"]),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_post", "client_secret_basic"])
    .default("none"),
  scope: z.string().max(200).optional(),
})

export async function POST(request: Request) {
  return withOAuthErrors("register", () => register(request))
}

async function register(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return oauthError("invalid_client_metadata", "Tělo požadavku není platný JSON")
  }

  const parsed = registrationSchema.safeParse(body)
  if (!parsed.success) {
    return oauthError(
      "invalid_client_metadata",
      parsed.error.issues[0]?.message ?? "Neplatná metadata klienta",
    )
  }

  const { client, clientSecret } = await registerClient({
    client_name: parsed.data.client_name,
    redirect_uris: parsed.data.redirect_uris,
    grant_types: parsed.data.grant_types,
    token_endpoint_auth_method: parsed.data.token_endpoint_auth_method,
    scope: normalizeScope(parsed.data.scope ?? DEFAULT_SCOPE),
  })

  return jsonResponse(
    {
      client_id: client.client_id,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client.client_name,
      redirect_uris: client.redirect_uris,
      grant_types: client.grant_types,
      response_types: ["code"],
      token_endpoint_auth_method: client.token_endpoint_auth_method,
      scope: client.scope,
    },
    { status: 201 },
  )
}

export function OPTIONS() {
  return preflightResponse()
}
