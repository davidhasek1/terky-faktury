import { updateSession } from "@/lib/supabase/proxy"
import type { NextRequest } from "next/server"

/**
 * Next 16 přejmenoval konvenci `middleware` na `proxy`. Chování zůstává
 * stejné: běží před každým požadavkem podle `matcher` níže a stará se
 * o obnovu Supabase session a o přesměrování nepřihlášených uživatelů.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
