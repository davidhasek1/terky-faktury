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
      <SelectTrigger className="w-[200px] text-sm border-border bg-transparent shadow-none">
        <SelectValue placeholder="Filtr" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all" className="text-sm">
          Všechny faktury
        </SelectItem>
        <SelectItem value="paid" className="text-sm">
          Zaplacené
        </SelectItem>
        <SelectItem value="unpaid" className="text-sm">
          Nezaplacené
        </SelectItem>
        <SelectItem value="overdue" className="text-sm">
          Po splatnosti
        </SelectItem>
      </SelectContent>
    </Select>
  )
}
