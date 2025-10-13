"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
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
import { CheckCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"

interface MarkAsPaidButtonProps {
  invoiceId: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onSuccess?: () => void
}

export function MarkAsPaidButton({ invoiceId, open, onOpenChange, onSuccess }: MarkAsPaidButtonProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [paidDate, setPaidDate] = useState<string>(new Date().toISOString().split("T")[0])
  const [internalOpen, setInternalOpen] = useState(false)
  const isDialogOpen = open !== undefined ? open : internalOpen
  const setIsDialogOpen = onOpenChange || setInternalOpen

  const handleMarkAsPaid = async () => {
    setIsLoading(true)
    const supabase = createClient()

    try {
      const { error } = await supabase.from("invoices").update({ paid_date: paidDate }).eq("id", invoiceId)

      if (error) throw error

      toast.success("Faktura byla označena jako zaplacená")
      setIsDialogOpen(false)
      if (onSuccess) {
        onSuccess()
      } else {
        router.refresh()
      }
    } catch (err) {
      console.error("[v0] Error marking invoice as paid:", err)
      toast.error("Nepodařilo se označit fakturu jako zaplacenou")
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
          <input
            type="date"
            value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
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
