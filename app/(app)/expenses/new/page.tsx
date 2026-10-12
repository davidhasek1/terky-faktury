import { Topbar } from "@/components/app-shell/topbar"
import { ExpenseForm } from "@/components/expenses/expense-form"
import { PageShell } from "@/components/patterns/page-shell"

export default function NewExpensePage() {
  return (
    <>
      <Topbar asHeading title="Nový náklad" />
      <PageShell width="form">
        <ExpenseForm />
      </PageShell>
    </>
  )
}
