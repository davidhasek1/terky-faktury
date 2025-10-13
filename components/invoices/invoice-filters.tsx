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
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Filtrovat podle stavu" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Všechny faktury</SelectItem>
        <SelectItem value="paid">Zaplacené</SelectItem>
        <SelectItem value="unpaid">Nezaplacené</SelectItem>
        <SelectItem value="overdue">Po splatnosti</SelectItem>
      </SelectContent>
    </Select>
  )
}
