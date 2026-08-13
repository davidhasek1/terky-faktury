import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Cesty dostupné bez přihlášení. Jediný seznam pro obě větve `updateSession`,
 * ať se nestane, že se nová veřejná cesta doplní jen do jedné z nich.
 *
 *  - /auth/*                       přihlášení, registrace, reset hesla
 *  - /invoices/download/*          veřejná stránka s fakturou (odkaz z e-mailu)
 *  - /api/invoices/download/*      veřejné PDF
 *  - /api/invoices/public/*        veřejná data faktury pro tu stránku
 *  - /mcp                          MCP endpoint — autorizuje se Bearer tokenem
 *                                  (přesná shoda, ne prefix)
 *  - /.well-known/*, /api/well-known/*   OAuth metadata (RFC 8414 / 9728)
 *  - /api/oauth/{token,register,revoke}  volají se bez session, jménem klienta
 *
 * /api/oauth/authorize veřejná NENÍ — vyžaduje přihlášeného uživatele
 * a middleware ho podle toho pošle na login.
 */
const PUBLIC_PATH_PREFIXES = [
  "/auth",
  "/invoices/download/",
  "/api/invoices/download/",
  "/api/invoices/public/",
  "/.well-known/",
  "/api/well-known/",
  "/api/oauth/token",
  "/api/oauth/register",
  "/api/oauth/revoke",
] as const

/** Cesty veřejné jen jako celek — prefix by otevřel i sousední adresy. */
const PUBLIC_EXACT_PATHS = ["/mcp"] as const

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_EXACT_PATHS.some((path) => pathname === path) ||
    PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  )
}

/**
 * Přesměrování na login si nese cíl, aby se uživatel po přihlášení vrátil tam,
 * kam mířil. Důležité pro `/api/oauth/authorize`, kde by ztráta parametrů
 * rozbila celé připojení konektoru.
 */
function loginRedirect(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone()
  const target = `${request.nextUrl.pathname}${request.nextUrl.search}`
  url.pathname = "/auth/login"
  url.search = ""
  url.searchParams.set("redirect_to", target)
  return NextResponse.redirect(url)
}

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[proxy] Chybí Supabase proměnné prostředí")

    if (isPublicPath(request.nextUrl.pathname)) {
      return NextResponse.next({ request })
    }

    return loginRedirect(request)
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
        },
      },
    })

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user && !isPublicPath(request.nextUrl.pathname)) {
      return loginRedirect(request)
    }

    return supabaseResponse
  } catch (error) {
    // Nikdy neshoď celý web na 500. Když
    // ověření session selže (síť, Edge, špatná konfigurace), pusť request
    // dál — jednotlivé stránky si auth pohlídají samy.
    console.error("[proxy] session check failed:", error)
    return supabaseResponse
  }
}
