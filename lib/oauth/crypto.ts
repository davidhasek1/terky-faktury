/**
 * Kryptografické pomůcky pro OAuth vrstvu. Používá Web Crypto, aby stejný kód
 * fungoval v Node i na Edge runtime.
 */

const encoder = new TextEncoder()

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** Náhodný neuhodnutelný řetězec (256 bitů entropie). */
export function randomToken(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)))
}

export async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value))
  return base64UrlEncode(new Uint8Array(digest))
}

/**
 * Ověření PKCE. Podporujeme výhradně S256 — `plain` je v OAuth 2.1 zakázaný.
 */
export async function verifyPkce(
  codeVerifier: string,
  codeChallenge: string,
  method: string,
): Promise<boolean> {
  if (method !== "S256") return false
  if (codeVerifier.length < 43 || codeVerifier.length > 128) return false
  if (!/^[A-Za-z0-9\-._~]+$/.test(codeVerifier)) return false
  return timingSafeEqual(await sha256Base64Url(codeVerifier), codeChallenge)
}

/** Porovnání odolné vůči časovému postrannímu kanálu. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Stabilní otisk parametrů operace. Klíče se řadí, takže na pořadí v JSONu
 * nezáleží — potvrzovací token pak nelze obejít přeházením polí.
 */
export async function hashParams(value: unknown): Promise<string> {
  return sha256Base64Url(canonicalize(value))
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)

  return `{${entries.join(",")}}`
}
