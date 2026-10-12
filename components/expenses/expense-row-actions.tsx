"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"

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
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createBrowserServiceContext } from "@/lib/services/browser-context"
import { deleteExpense } from "@/lib/services/expenses"

export function ExpenseRowActions({ expenseId }: { expenseId: string }) {
  const router = useRouter()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await deleteExpense(await createBrowserServiceContext(), expenseId)
      toast.success("Náklad smazán")
      setShowDeleteDialog(false)
      router.refresh()
    } catch (err) {
      console.error("[expenses] Nepodařilo se smazat náklad:", err)
      toast.error("Nepodařilo se smazat náklad")
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
            <span className="sr-only">Otevřít menu nákladu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/expenses/${expenseId}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Upravit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Smazat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opravdu chceš smazat náklad?</AlertDialogTitle>
            <AlertDialogDescription>
              Tato akce je nevratná. Náklad zmizí i z výkazu za období.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Zrušit</AlertDialogCancel>
            <AlertDialogAction asChild>
              {/* preventDefault drží dialog otevřený, dokud mazání běží. */}
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
