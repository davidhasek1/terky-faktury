"use client"

import { LogOut } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"

export function UserMenu({ email, collapsed }: { email: string | null; collapsed: boolean }) {
  const router = useRouter()

  const signOut = async () => {
    await createClient().auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  return (
    <div className={cn("rounded-md bg-sidebar-accent/40 p-2", collapsed && "bg-transparent p-0")}>
      {!collapsed && email && (
        <p className="truncate px-1 pb-2 font-ident text-[11px] text-sidebar-foreground/70">
          {email}
        </p>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={signOut}
        className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <LogOut className="size-4" />
        <span className={cn(collapsed && "sr-only")}>Odhlásit se</span>
      </Button>
    </div>
  )
}
