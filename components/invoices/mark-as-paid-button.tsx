"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { createBrowserServiceContext } from "@/lib/services/browser-context"
import { setInvoicePayment } from "@/lib/services/invoices"
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

    try {
      await setInvoicePayment(await createBrowserServiceContext(), invoiceId, paidDate)

      toast.success("Faktura byla označena jako zaplacená")
      setIsDialogOpen(false)
      if (onSuccess) {
        onSuccess()
      } else {
        router.refresh()
      }
    } catch (err) {
      console.error("[invoices] Nepodařilo se označit fakturu jako zaplacenou:", err)
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
          <AlertDialogDescription>Vyber datum proplacení faktury:</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex justify-center py-4">
          <Input
            type="date"
            value={paidDate}
            onChange={(e) => setPaidDate(e.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Zrušit</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              onClick={(e) => {
                e.preventDefault()
                void handleMarkAsPaid()
              }}
              loading={isLoading}
            >
              <CheckCircle />
              Potvrdit
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
