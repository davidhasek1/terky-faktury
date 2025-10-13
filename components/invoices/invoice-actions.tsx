"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { MoreHorizontal, Pencil, Trash2, FileText, Download, CheckCircle, XCircle, Mail } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { MarkAsPaidButton } from "./mark-as-paid-button"

interface InvoiceActionsProps {
  invoiceId: string
  isPaid?: boolean
  customerEmail?: string
}

export function InvoiceActions({ invoiceId, isPaid = false, customerEmail }: InvoiceActionsProps) {
  const router = useRouter()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false)
  const [showUnmarkPaidDialog, setShowUnmarkPaidDialog] = useState(false)
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false)
  const [isSendingEmail, setIsSendingEmail] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    const supabase = createClient()

    try {
      const { error } = await supabase.from("invoices").delete().eq("id", invoiceId)

      if (error) throw error

      router.refresh()
      setShowDeleteDialog(false)
    } catch (err) {
      console.error("[v0] Error deleting invoice:", err)
      alert("Nepodařilo se smazat fakturu")
    } finally {
      setIsDeleting(false)
    }
  }

  const handleUnmarkAsPaid = async () => {
    setIsUpdatingPayment(true)
    const supabase = createClient()

    try {
      const { error } = await supabase.from("invoices").update({ paid_date: null }).eq("id", invoiceId)

      if (error) throw error

      router.refresh()
      setShowUnmarkPaidDialog(false)
    } catch (err) {
      console.error("[v0] Error unmarking invoice as paid:", err)
      alert("Nepodařilo se zrušit platbu faktury")
    } finally {
      setIsUpdatingPayment(false)
    }
  }

  const handleDownloadPDF = () => {
    window.open(`/api/invoices/${invoiceId}/pdf`, "_blank")
  }

  const handleSendEmail = async () => {
    if (!customerEmail) {
      alert("Zákazník nemá vyplněný email")
      return
    }

    setIsSendingEmail(true)
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/send-email`, {
        method: "POST",
      })

      if (!response.ok) {
        let errorMessage = "Nepodařilo se odeslat email"
        try {
          const error = await response.json()
          errorMessage = error.error || errorMessage
        } catch {
          // Pokud odpověď není JSON, použij status text
          errorMessage = `${errorMessage} (${response.status} ${response.statusText})`
        }
        throw new Error(errorMessage)
      }

      const result = await response.json()
      console.log("[v0] Email sent successfully:", result)
      alert("Email byl úspěšně odeslán!")
    } catch (err) {
      console.error("[v0] Error sending email:", err)
      alert(err instanceof Error ? err.message : "Nepodařilo se odeslat email")
    } finally {
      setIsSendingEmail(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Otevřít menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-popover">
          <DropdownMenuItem onClick={() => router.push(`/invoices/${invoiceId}/view`)}>
            <FileText className="mr-2 h-4 w-4" />
            Zobrazit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDownloadPDF}>
            <Download className="mr-2 h-4 w-4" />
            Stáhnout PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleSendEmail} disabled={!customerEmail || isSendingEmail}>
            <Mail className="mr-2 h-4 w-4" />
            {isSendingEmail ? "Odesílám..." : "Odeslat email"}
          </DropdownMenuItem>
          {!isPaid ? (
            <DropdownMenuItem onClick={() => setShowMarkPaidDialog(true)}>
              <CheckCircle className="mr-2 h-4 w-4" />
              Označit jako zaplaceno
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setShowUnmarkPaidDialog(true)}>
              <XCircle className="mr-2 h-4 w-4" />
              Zrušit platbu
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => router.push(`/invoices/${invoiceId}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Upravit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Smazat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MarkAsPaidButton
        invoiceId={invoiceId}
        open={showMarkPaidDialog}
        onOpenChange={setShowMarkPaidDialog}
        onSuccess={() => router.refresh()}
      />

      <AlertDialog open={showUnmarkPaidDialog} onOpenChange={setShowUnmarkPaidDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zrušit platbu faktury?</AlertDialogTitle>
            <AlertDialogDescription>
              Tato akce odstraní datum proplacení a faktura bude opět označena jako nezaplacená.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdatingPayment}>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnmarkAsPaid}
              disabled={isUpdatingPayment}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isUpdatingPayment ? "Ukládám..." : "Zrušit platbu"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opravdu chcete smazat fakturu?</AlertDialogTitle>
            <AlertDialogDescription>
              Tato akce je nevratná. Faktura a všechny její položky budou trvale smazány.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Zrušit</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Mažu..." : "Smazat"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
