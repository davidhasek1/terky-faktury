import { ChevronDown, Download, FileSpreadsheet, FileText, Receipt } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * Exporty výkazu v jednom menu. Pět tlačítek vedle sebe by na mobilu
 * přeteklo a ani na desktopu by nebylo poznat, co je hlavní.
 */
export function ExportMenu({ query }: { query: string }) {
  const item = (href: string, icon: React.ReactNode, label: string) => (
    <DropdownMenuItem asChild>
      <a href={`${href}?${query}`} download>
        {icon}
        {label}
      </a>
    </DropdownMenuItem>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm">
          <Download className="size-4" />
          Stáhnout
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Celý výkaz</DropdownMenuLabel>
        {item("/api/report/xlsx", <FileSpreadsheet className="mr-2 h-4 w-4" />, "Excel (souhrn, faktury, náklady)")}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>PDF</DropdownMenuLabel>
        {item("/api/report/invoices-pdf", <FileText className="mr-2 h-4 w-4" />, "Faktury (PDF)")}
        {item("/api/report/expenses-pdf", <Receipt className="mr-2 h-4 w-4" />, "Náklady (PDF)")}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>CSV</DropdownMenuLabel>
        {item("/api/report/invoices", <FileText className="mr-2 h-4 w-4" />, "Faktury (CSV)")}
        {item("/api/report/expenses", <Receipt className="mr-2 h-4 w-4" />, "Náklady (CSV)")}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
