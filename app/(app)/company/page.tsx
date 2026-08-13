import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { CompanyForm } from "@/components/company/company-form"
import { Topbar } from "@/components/app-shell/topbar"
import { PageHeader } from "@/components/patterns/page-header"
import { PageShell } from "@/components/patterns/page-shell"

export default async function CompanyPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/auth/login")
  }

  const { data: companyDetails } = await supabase
    .from("company_details")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle()

  return (
    <>
      <Topbar title="Moje údaje" />
      <PageShell width="narrow">
        <PageHeader
          eyebrow="Vystavovatel"
          title="Moje údaje"
          description="Tyto údaje se zobrazí na všech tvých fakturách jako informace o vystavovateli."
        />

        <CompanyForm companyDetails={companyDetails} />
      </PageShell>
    </>
  )
}
