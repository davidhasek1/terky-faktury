"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { NAV_ITEMS, isActive } from "./nav-items"
import { UserMenu } from "./user-menu"

const STORAGE_KEY = "tf-sidebar-collapsed"

function NavList({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1 px-3">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 px-6 py-5">
      <span className="font-display text-lg font-bold text-sidebar-accent-foreground">
        {collapsed ? "T" : "Terky"}
      </span>
      {!collapsed && (
        <span className="font-ident text-[10px] text-sidebar-foreground/60">faktury</span>
      )}
    </Link>
  )
}

export function Sidebar({ email }: { email: string | null }) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1")
  }, [])

  const toggle = () => {
    setCollapsed((prev) => {
      window.localStorage.setItem(STORAGE_KEY, prev ? "0" : "1")
      return !prev
    })
  }

  return (
    <>
      {/* Mobil — spouštěč v rohu, obsah v Sheetu */}
      <div className="fixed left-3 top-3 z-30 lg:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon-sm">
              <Menu className="size-4" />
              <span className="sr-only">Otevřít menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[17rem] bg-sidebar p-0">
            <SheetTitle className="sr-only">Hlavní menu</SheetTitle>
            <Brand collapsed={false} />
            <NavList collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <div className="mt-auto p-3">
              <UserMenu email={email} collapsed={false} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop — trvalý hřbet */}
      <aside
        style={{
          width: collapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width)",
        }}
        className="fixed inset-y-0 left-0 z-20 hidden shrink-0 flex-col bg-sidebar transition-[width] duration-200 lg:flex"
      >
        <Brand collapsed={collapsed} />
        <NavList collapsed={collapsed} />
        <div className="mt-auto flex flex-col gap-2 p-3">
          <UserMenu email={email} collapsed={collapsed} />
          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            aria-label={collapsed ? "Rozbalit menu" : "Sbalit menu"}
            className="justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <>
                <PanelLeftClose className="size-4" />
                Sbalit
              </>
            )}
          </Button>
        </div>
      </aside>
    </>
  )
}
