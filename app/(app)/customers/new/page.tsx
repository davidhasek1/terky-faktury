import { CustomerForm } from "@/components/customers/customer-form"
import { Topbar } from "@/components/app-shell/topbar"
import { PageShell } from "@/components/patterns/page-shell"

export default function NewCustomerPage() {
  return (
    <>
      <Topbar asHeading title="Nový zákazník" />
      <PageShell width="form">
        <CustomerForm />
      </PageShell>
    </>
  )
}
