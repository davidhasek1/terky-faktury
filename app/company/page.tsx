import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { CompanyForm } from "@/components/company/company-form"
import { PageHeader } from "@/components/layout/page-header"

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
    <div className="container mx-auto px-4 sm:px-8 py-10 sm:py-16 max-w-4xl">
      <PageHeader
        eyebrow="Vystavovatel"
        title={
          <>
            Moje <span className="italic text-primary">údaje</span>
          </>
        }
        description="Tyto údaje se zobrazí na všech vašich fakturách jako informace o vystavovateli."
      />

      <CompanyForm companyDetails={companyDetails} userId={user.id} />
    </div>
  )
}
