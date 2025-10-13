import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[v0] Missing Supabase environment variables in middleware")
    console.error("[v0] NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl ? "present" : "missing")
    console.error("[v0] NEXT_PUBLIC_SUPABASE_ANON_KEY:", supabaseAnonKey ? "present" : "missing")

    const isPublicDownloadPage = request.nextUrl.pathname.startsWith("/invoices/download/")
    const isPublicDownloadAPI = request.nextUrl.pathname.startsWith("/api/invoices/download/")
    const isPublicAPI = request.nextUrl.pathname.startsWith("/api/invoices/public/")
    const isAuthPage = request.nextUrl.pathname.startsWith("/auth")

    if (isPublicDownloadPage || isPublicDownloadAPI || isPublicAPI || isAuthPage) {
      return NextResponse.next({ request })
    }

    // Redirect to login for protected routes
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

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

  const isPublicDownloadPage = request.nextUrl.pathname.startsWith("/invoices/download/")
  const isPublicDownloadAPI = request.nextUrl.pathname.startsWith("/api/invoices/download/")
  const isPublicAPI = request.nextUrl.pathname.startsWith("/api/invoices/public/")
  const isAuthPage = request.nextUrl.pathname.startsWith("/auth")

  if (!user && !isPublicDownloadPage && !isPublicDownloadAPI && !isPublicAPI && !isAuthPage) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
