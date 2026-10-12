import { notFound } from "next/navigation"

import { Topbar } from "@/components/app-shell/topbar"
import { ExpenseForm } from "@/components/expenses/expense-form"
import { PageShell } from "@/components/patterns/page-shell"
import { isServiceError } from "@/lib/services/errors"
import { getExpense } from "@/lib/services/expenses"
import { createServerServiceContext } from "@/lib/services/server-context"
import { uuidSchema } from "@/lib/validation/common"

export default async function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) notFound()

  const ctx = await createServerServiceContext()

  const expense = await getExpense(ctx, id).catch((error: unknown) => {
    if (isServiceError(error) && error.code === "EXPENSE_NOT_FOUND") notFound()
    throw error
  })

  return (
    <>
      <Topbar asHeading title="Upravit náklad" />
      <PageShell width="form">
        <ExpenseForm expense={expense} />
      </PageShell>
    </>
  )
}
