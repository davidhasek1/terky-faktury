import type { ReactNode } from "react"

import { Sidebar } from "@/components/app-shell/sidebar"
import { createClient } from "@/lib/supabase/server"

/**
 * Shell pro přihlášenou část aplikace. Nepřihlášené sem proxy nepustí,
 * takže se tu na uživatele nemusí ptát podmínkou — stačí e-mail do menu.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen">
      <Sidebar email={user?.email ?? null} />
      <div className="lg:pl-[var(--sidebar-width)]">{children}</div>
    </div>
  )
}
