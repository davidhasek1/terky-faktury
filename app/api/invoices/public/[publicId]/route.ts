import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function GET(request: Request, { params }: { params: { publicId: string } }) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Fetch invoice by public_id
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*, customer:customers(*)")
      .eq("public_id", params.publicId)
      .single()

    if (invoiceError || !invoice) {
      console.error("[v0] Error fetching invoice:", invoiceError)
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 })
    }

    // Fetch invoice items
    const { data: items, error: itemsError } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: true })

    if (itemsError) {
      console.error("[v0] Error fetching items:", itemsError)
      return NextResponse.json({ error: "Error al cargar los artículos" }, { status: 500 })
    }

    // Fetch company details
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
    console.error("[v0] Error in public invoice endpoint:", error)
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 })
  }
}
