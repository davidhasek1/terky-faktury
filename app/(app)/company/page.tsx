import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { CompanyForm } from "@/components/company/company-form"
import { Topbar } from "@/components/app-shell/topbar"
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
      <Topbar asHeading title="Moje údaje" />
      <PageShell width="form">
        <CompanyForm companyDetails={companyDetails} />
      </PageShell>
    </>
  )
}
