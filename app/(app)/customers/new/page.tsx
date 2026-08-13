import { CustomerForm } from "@/components/customers/customer-form"
import { PageHeader } from "@/components/layout/page-header"

export default function NewCustomerPage() {
  return (
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-3xl">
      <PageHeader
        eyebrow="Nový záznam"
        title={
          <>
            Nový <span className="text-primary">zákazník</span>
          </>
        }
        description="Přidejte protistranu — adresa, daňová čísla a kontakt se objeví na faktuře."
      />
      <CustomerForm />
    </div>
  )
}
