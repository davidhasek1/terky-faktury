"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle, MoreHorizontal, Pencil, Trash2, XCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { createBrowserServiceContext } from "@/lib/services/browser-context"
import { deleteActivity, setActivityStatus } from "@/lib/services/activities"
import type { ActivityStatus } from "@/lib/types"

interface ActivityRowActionsProps {
  customerId: string
  activityId: string
  status: ActivityStatus
}

/**
 * Akce nad jednou aktivitou.
 *
 * Přepnutí stavu sem přišlo z dřívějšího klikacího štítku, který vypadal
 * jako popisek. Tady sedí vedle Upravit a Smazat — stejně jako u faktur,
 * takže na obou místech se platba mění na jednom a tomtéž místě.
 */
export function ActivityRowActions({
  customerId,
  activityId,
  status,
}: ActivityRowActionsProps) {
  const router = useRouter()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isChangingStatus, setIsChangingStatus] = useState(false)

  const isPaid = status === "paid"

  const handleToggleStatus = async () => {
    if (isChangingStatus) return
    const next: ActivityStatus = isPaid ? "unpaid" : "paid"

    setIsChangingStatus(true)
    try {
      await setActivityStatus(await createBrowserServiceContext(), activityId, next)
      toast.success(next === "paid" ? "Označeno jako zaplacené" : "Označeno jako nezaplacené")
      router.refresh()
    } catch (err) {
      console.error("[activities] Nepodařilo se změnit stav aktivity:", err)
      toast.error("Nepodařilo se změnit stav aktivity")
    } finally {
      setIsChangingStatus(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteActivity(await createBrowserServiceContext(), activityId)
      toast.success("Aktivita smazána")
      setShowDeleteDialog(false)
      router.refresh()
    } catch (err) {
      console.error("[activities] Nepodařilo se smazat aktivitu:", err)
      toast.error("Nepodařilo se smazat aktivitu")
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Otevřít menu aktivity</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleToggleStatus} disabled={isChangingStatus}>
            {isPaid ? (
              <XCircle className="mr-2 h-4 w-4" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            {isPaid ? "Označit jako nezaplacené" : "Označit jako zaplacené"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => router.push(`/activities/${customerId}/${activityId}/edit`)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Upravit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Smazat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opravdu chceš smazat aktivitu?</AlertDialogTitle>
            <AlertDialogDescription>
              Tato akce je nevratná. Aktivita a všechny její služby budou trvale smazány.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Zrušit</AlertDialogCancel>
            <AlertDialogAction asChild>
              {/* preventDefault drží dialog otevřený, dokud mazání běží —
                  jinak zmizí dřív, než je spinner vidět, a při chybě by se
                  hláška objevila nad zavřeným dialogem. */}
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
