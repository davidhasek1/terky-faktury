/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Písmo pro PDF přehledy se čte ze souboru za běhu; bez tohohle by se
  // do serverless funkcí na Vercelu nepřibalilo.
  outputFileTracingIncludes: {
    "/api/report/invoices-pdf": ["./lib/fonts/**"],
    "/api/report/expenses-pdf": ["./lib/fonts/**"],
  },
  // App Router neumí složky začínající tečkou, takže OAuth metadata bydlí pod
  // /api/well-known a sem se jen přepisují. Varianty s příponou (např.
  // /.well-known/oauth-protected-resource/mcp) posílají někteří klienti podle
  // RFC 9728 — obsluhuje je stejná routa.
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/well-known/oauth-protected-resource",
      },
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/api/well-known/oauth-protected-resource",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/well-known/oauth-authorization-server",
      },
      {
        source: "/.well-known/oauth-authorization-server/:path*",
        destination: "/api/well-known/oauth-authorization-server",
      },
    ]
  },
}

export default nextConfig
