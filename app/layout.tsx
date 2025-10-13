import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { Header } from "@/components/layout/header"
import { Footer } from "@/components/layout/footer"
import { createClient } from "@/lib/supabase/server"
import { Suspense } from "react"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "Fakturační systém",
  description: "Systém pro vytváření a správu faktur",
  generator: "v0.app",
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
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable} flex flex-col min-h-screen`}>
        <Suspense>{user && <Header />}</Suspense>
        <main className="flex-1">{children}</main>
        <Suspense>{user && <Footer />}</Suspense>
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
