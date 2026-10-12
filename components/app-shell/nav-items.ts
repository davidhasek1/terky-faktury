import {
  Building2,
  ChartColumn,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Plug,
  Receipt,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Přehled", icon: LayoutDashboard },
  { href: "/invoices", label: "Faktury", icon: FileText },
  { href: "/customers", label: "Zákazníci", icon: Users },
  { href: "/activities", label: "Aktivity", icon: ClipboardList },
  { href: "/expenses", label: "Náklady", icon: Receipt },
  { href: "/report", label: "Výkaz", icon: ChartColumn },
  { href: "/company", label: "Moje údaje", icon: Building2 },
  { href: "/connect", label: "Připojení", icon: Plug },
]

/** Kde se nav položka počítá jako aktivní. Přehled jen přesnou shodou. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}
