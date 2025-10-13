import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { CompanyForm } from "@/components/company/company-form"

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
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Údaje vystavovatele</h1>
        <p className="text-muted-foreground">
          Tyto údaje se zobrazí na všech vašich fakturách jako informace o vystavovateli.
        </p>
      </div>

      <CompanyForm companyDetails={companyDetails} userId={user.id} />
    </div>
  )
}
