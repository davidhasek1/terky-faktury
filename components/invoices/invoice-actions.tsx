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
import {
  CheckCircle,
  Download,
  FileText,
  Loader2,
  Mail,
  MoreHorizontal,
  Pencil,
  Trash2,
  XCircle,
} from "lucide-react"
import { createBrowserServiceContext } from "@/lib/services/browser-context"
import { deleteInvoice, setInvoicePayment } from "@/lib/services/invoices"
import { MarkAsPaidButton } from "./mark-as-paid-button"
import { toast } from "sonner"

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

    try {
      await deleteInvoice(await createBrowserServiceContext(), invoiceId)

      toast.success("Faktura byla úspěšně smazána")
      setShowDeleteDialog(false)
      router.push("/invoices")
    } catch (err) {
      console.error("[invoices] Nepodařilo se smazat fakturu:", err)
      toast.error("Nepodařilo se smazat fakturu: " + (err instanceof Error ? err.message : "Neznámá chyba"))
    } finally {
      setIsDeleting(false)
    }
  }

  const handleUnmarkAsPaid = async () => {
    setIsUpdatingPayment(true)

    try {
      await setInvoicePayment(await createBrowserServiceContext(), invoiceId, null)

      toast.success("Platba faktury byla zrušena")
      setShowUnmarkPaidDialog(false)
      router.push("/invoices")
    } catch (err) {
      console.error("[invoices] Nepodařilo se zrušit platbu:", err)
      toast.error("Nepodařilo se zrušit platbu faktury")
    } finally {
      setIsUpdatingPayment(false)
    }
  }

  const handleDownloadPDF = () => {
    window.open(`/api/invoices/${invoiceId}/pdf`, "_blank")
  }

  const handleSendEmail = async () => {
    if (!customerEmail) {
      toast.error("Zákazník nemá vyplněný email")
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

      toast.success("Email byl úspěšně odeslán!")
      router.refresh()
    } catch (err) {
      console.error("[invoices] Nepodařilo se odeslat email:", err)
      toast.error(err instanceof Error ? err.message : "Nepodařilo se odeslat email")
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
            {isSendingEmail ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Mail className="mr-2 h-4 w-4" />
            )}
            Odeslat email
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
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={(e) => {
                  e.preventDefault()
                  void handleUnmarkAsPaid()
                }}
                loading={isUpdatingPayment}
              >
                <XCircle />
                Zrušit platbu
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opravdu chceš smazat fakturu?</AlertDialogTitle>
            <AlertDialogDescription>
              Tato akce je nevratná. Faktura a všechny její položky budou trvale smazány.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Zrušit</AlertDialogCancel>
            <AlertDialogAction asChild>
              {/* preventDefault drží dialog otevřený, dokud mazání běží —
                  jinak zmizí dřív, než je spinner vidět. */}
              <Button
                variant="destructive"
                onClick={(e) => {
                  e.preventDefault()
                  void handleDelete()
                }}
                loading={isDeleting}
              >
                <Trash2 />
                Smazat
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
