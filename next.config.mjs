/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
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
