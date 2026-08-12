import { createServiceRoleClient } from "@/lib/supabase/service-role"
import type { CompanyDetails, Customer, Invoice, InvoiceItem } from "@/lib/types"

/**
 * Veřejné zobrazení faktury podle neuhodnutelného `public_id` (odkaz z e-mailu).
 *
 * Dřív se sem chodilo anon klíčem přes RLS politiky „public_id IS NOT NULL“,
 * jenže ta podmínka platila pro každou fakturu — anon klíč tak viděl data všech
 * uživatelů (viz migrace 015). Teď čte service-role klient, ale výhradně jedním
 * dotazem přišpendleným na konkrétní token, takže se nedá rozšířit na cizí data.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface PublicInvoice {
  invoice: Invoice & { customer: Customer | null }
  items: InvoiceItem[]
  companyDetails: CompanyDetails | null
}

export async function getPublicInvoice(publicId: string): Promise<PublicInvoice | null> {
  if (!UUID_PATTERN.test(publicId)) return null

  const supabase = createServiceRoleClient()

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("*, customer:customers(*)")
    .eq("public_id", publicId)
    .maybeSingle<Invoice & { customer: Customer | null }>()

  if (error) {
    console.error("[public-invoice] Nepodařilo se načíst fakturu:", error.code ?? error.message)
    return null
  }

  if (!invoice) return null

  const [{ data: items }, { data: companyDetails }] = await Promise.all([
    supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: true })
      .returns<InvoiceItem[]>(),
    supabase
      .from("company_details")
      .select("*")
      .eq("user_id", invoice.user_id)
      .maybeSingle<CompanyDetails>(),
  ])

  return { invoice, items: items ?? [], companyDetails: companyDetails ?? null }
}
