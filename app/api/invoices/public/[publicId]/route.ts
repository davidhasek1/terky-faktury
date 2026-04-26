import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(_request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  try {
    const { publicId } = await params
    const supabase = await createClient()

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*, customer:customers(*)")
      .eq("public_id", publicId)
      .single()

    if (invoiceError || !invoice) {
      console.error("Error fetching invoice:", invoiceError)
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    const { data: items, error: itemsError } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: true })

    if (itemsError) {
      console.error("Error fetching items:", itemsError)
      return NextResponse.json({ error: "Error al cargar los artículos" }, { status: 500 })
    }

    const { data: companyDetails } = await supabase
      .from("company_details")
      .select("*")
      .eq("user_id", invoice.user_id)
      .maybeSingle()

    return NextResponse.json({
      invoice,
      items: items || [],
      companyDetails,
    })
  } catch (error) {
    console.error("Error in public invoice endpoint:", error)
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 })
  }
}
