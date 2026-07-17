import type React from "react"
import type { Metadata } from "next"
import { GeistMono } from "geist/font/mono"
import { Inter, Poppins } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body",
  display: "swap",
})

const poppins = Poppins({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
})

import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { createClient } from "@/lib/supabase/server"
import { Suspense } from "react"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "Terky fakturační udělátko",
  description: "Systém pro vytváření a správu faktur",
  generator: "v0.app",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Faktury",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <html lang="cs">
      <body className={`font-sans ${GeistMono.variable} ${inter.variable} ${poppins.variable} flex flex-col min-h-screen`}>
        <Suspense>{user && <Header />}</Suspense>
        <main className="flex-1">{children}</main>
        <Suspense>{user && <Footer />}</Suspense>
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
