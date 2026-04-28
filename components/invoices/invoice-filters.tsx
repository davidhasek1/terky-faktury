"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface InvoiceFiltersProps {
  currentStatus?: string
}

export function InvoiceFilters({ currentStatus }: InvoiceFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handleStatusChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value === "all") {
      params.delete("status")
    } else {
      params.set("status", value)
    }
    router.push(`/invoices?${params.toString()}`)
  }

  return (
    <Select value={currentStatus || "all"} onValueChange={handleStatusChange}>
      <SelectTrigger className="w-[200px] text-[11px] uppercase tracking-[0.18em] border-border bg-transparent shadow-none">
        <SelectValue placeholder="Filtr" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all" className="text-[11px] uppercase tracking-[0.18em]">
          Všechny faktury
        </SelectItem>
        <SelectItem value="paid" className="text-[11px] uppercase tracking-[0.18em]">
          Zaplacené
        </SelectItem>
        <SelectItem value="unpaid" className="text-[11px] uppercase tracking-[0.18em]">
          Nezaplacené
        </SelectItem>
        <SelectItem value="overdue" className="text-[11px] uppercase tracking-[0.18em]">
          Po splatnosti
        </SelectItem>
      </SelectContent>
    </Select>
  )
}
