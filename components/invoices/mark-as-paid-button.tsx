"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { CheckCircle, CalendarIcon } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { formatDate } from "@/lib/utils"
import { cn } from "@/lib/utils"

interface MarkAsPaidButtonProps {
  invoiceId: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSuccess?: () => void
}

export function MarkAsPaidButton({ invoiceId, open, onOpenChange, onSuccess }: MarkAsPaidButtonProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [paidDate, setPaidDate] = useState<Date>(new Date())
  const [internalOpen, setInternalOpen] = useState(false)
  const isDialogOpen = open !== undefined ? open : internalOpen
  const setIsDialogOpen = onOpenChange || setInternalOpen

  const handleMarkAsPaid = async () => {
    setIsLoading(true)
    const supabase = createClient()

    try {
      const { error } = await supabase
        .from("invoices")
        .update({ paid_date: paidDate.toISOString().split("T")[0] })
        .eq("id", invoiceId)

      if (error) throw error

      setIsDialogOpen(false)
      if (onSuccess) {
        onSuccess()
      } else {
        router.refresh()
      }
    } catch (err) {
      console.error("[v0] Error marking invoice as paid:", err)
      alert("Nepodařilo se označit fakturu jako zaplacenou")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      {open === undefined && (
        <AlertDialogTrigger asChild>
          <Button variant="outline">
            <CheckCircle className="mr-2 h-4 w-4" />
            Označit jako zaplaceno
          </Button>
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Označit fakturu jako zaplacenou?</AlertDialogTitle>
          <AlertDialogDescription>Vyberte datum proplacení faktury:</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex justify-center py-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn("w-full justify-start text-left font-normal", !paidDate && "text-muted-foreground")}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {paidDate ? formatDate(paidDate.toISOString()) : "Vyberte datum"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-popover" align="start">
              <Calendar mode="single" selected={paidDate} onSelect={(date) => date && setPaidDate(date)} initialFocus />
            </PopoverContent>
          </Popover>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Zrušit</AlertDialogCancel>
          <AlertDialogAction onClick={handleMarkAsPaid} disabled={isLoading}>
            {isLoading ? "Ukládám..." : "Potvrdit"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
