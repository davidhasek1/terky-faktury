import { jsonResponse, preflightResponse, withOAuthErrors } from "@/lib/oauth/http"
import { findRefreshToken, revokeRefreshTokenFamily } from "@/lib/oauth/store"

/**
 * Odvolání tokenu (RFC 7009).
 *
 * Odvoláváme celou rotační rodinu, takže jedním voláním konektor o přístup
 * přijde natrvalo. Už vydaný access token doběhne do své expirace (30 minut) —
 * to je cena za bezstavové ověřování JWT.
 *
 * Podle RFC vracíme 200 i pro neznámý token, aby endpoint neprozradil,
 * které tokeny existují.
 */
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  return withOAuthErrors("revoke", () => revoke(request))
}

async function revoke(request: Request) {
  let token: FormDataEntryValue | null = null

  try {
    token = (await request.formData()).get("token")
  } catch {
    return jsonResponse({}, { status: 200 })
  }

  if (typeof token === "string" && token !== "") {
    const record = await findRefreshToken(token)
    if (record) await revokeRefreshTokenFamily(record.family_id)
  }

  return jsonResponse({}, { status: 200 })
}

export function OPTIONS() {
  return preflightResponse()
}
