"use client"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { LogOut, Home, Users, FileText, Building2, Menu, User, ClipboardList, Plug } from "lucide-react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useState, useEffect } from "react"

export function Header() {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    const loadUser = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user?.email) {
        setUserEmail(user.email)
      }
    }
    loadUser()
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
  }

  const navItems = [
    { href: "/", label: "Přehled", icon: Home },
    { href: "/customers", label: "Zákazníci", icon: Users },
    { href: "/activities", label: "Aktivity", icon: ClipboardList },
    { href: "/invoices", label: "Faktury", icon: FileText },
    { href: "/company", label: "Moje údaje", icon: Building2 },
    { href: "/connect", label: "Připojení", icon: Plug },
  ]

  return (
    <header className="border-b border-border/70 bg-background/85 backdrop-blur-sm sticky top-0 z-40">
      <div className="container mx-auto px-4 sm:px-8 py-5 flex items-center justify-between gap-6">
        <Link href="/" className="group flex items-baseline gap-3 shrink-0">
          <span className="font-serif font-bold text-2xl leading-none text-foreground transition-colors group-hover:text-primary">
            Terky
          </span>
          <span className="hidden sm:inline-block text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            fakturační udělátko
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => {
            const isActive =
              item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/")
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative text-[11px] uppercase tracking-[0.22em] font-medium transition-colors py-1",
                  isActive
                    ? "text-foreground after:absolute after:-bottom-[20px] after:left-0 after:right-0 after:h-px after:bg-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-3">
          {userEmail && (
            <span className="hidden lg:inline-block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {userEmail}
            </span>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="hidden md:inline-flex text-[10px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
          >
            Odhlásit
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Otevřít menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <SheetHeader className="text-left">
                <SheetTitle className="font-serif font-semibold text-xl">Menu</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 mt-8">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive =
                    item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(item.href + "/")
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 text-sm font-medium transition-colors px-3 py-3 border-b border-border/50",
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="uppercase tracking-[0.18em] text-[11px]">{item.label}</span>
                    </Link>
                  )
                })}
                <div className="pt-6 mt-6 border-t border-border/50">
                  {userEmail && (
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground mb-4 px-3">
                      <User className="h-3.5 w-3.5" />
                      <span className="normal-case tracking-normal text-xs">{userEmail}</span>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleLogout}
                    className="w-full justify-start text-[11px] uppercase tracking-[0.22em]"
                  >
                    <LogOut className="mr-2 h-3.5 w-3.5" />
                    Odhlásit se
                  </Button>
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
