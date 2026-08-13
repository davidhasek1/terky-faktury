import { CustomerForm } from "@/components/customers/customer-form"
import { Topbar } from "@/components/app-shell/topbar"
import { PageHeader } from "@/components/patterns/page-header"
import { PageShell } from "@/components/patterns/page-shell"

export default function NewCustomerPage() {
  return (
    <>
      <Topbar title="Nový zákazník" />
      <PageShell width="narrow">
        <PageHeader
          eyebrow="Nový záznam"
          title="Nový zákazník"
          description="Přidej protistranu — adresa, daňová čísla a kontakt se objeví na faktuře."
        />
        <CustomerForm />
      </PageShell>
    </>
  )
}
