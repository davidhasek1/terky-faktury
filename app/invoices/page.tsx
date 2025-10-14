import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, FileText } from "lucide-react"
import Link from "next/link"
import { InvoiceActions } from "@/components/invoices/invoice-actions"
import { formatCurrency, formatDate } from "@/lib/utils"
import { InvoiceFilters } from "@/components/invoices/invoice-filters"
import { DateTimeDisplay } from "@/components/ui/date-time-display"

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  let query = supabase
    .from("invoices")
    .select(
      `
      *,
      customer:customers(name, email)
    `,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  // Filter by payment status
  if (params.status === "paid") {
    query = query.not("paid_date", "is", null)
  } else if (params.status === "unpaid") {
    query = query.is("paid_date", null)
  } else if (params.status === "overdue") {
    query = query.is("paid_date", null).lt("due_date", new Date().toISOString().split("T")[0])
  }

  const { data: invoices, error } = await query

  if (error) {
    console.error("[v0] Error fetching invoices:", error)
  }

  const { data: allInvoices } = await supabase.from("invoices").select("*").eq("user_id", user.id)
  const stats = {
    total: allInvoices?.length || 0,
    paid: allInvoices?.filter((inv) => inv.paid_date).length || 0,
    unpaid: allInvoices?.filter((inv) => !inv.paid_date).length || 0,
    overdue: allInvoices?.filter((inv) => !inv.paid_date && new Date(inv.due_date) < new Date()).length || 0,
    totalAmount: allInvoices?.reduce((sum, inv) => sum + inv.total, 0) || 0,
    paidAmount: allInvoices?.filter((inv) => inv.paid_date).reduce((sum, inv) => sum + inv.total, 0) || 0,
    unpaidAmount: allInvoices?.filter((inv) => !inv.paid_date).reduce((sum, inv) => sum + inv.total, 0) || 0,
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Faktury</h1>
          <p className="text-muted-foreground mt-2">Správa všech faktur</p>
        </div>
        <Button asChild>
          <Link href="/invoices/new">
            <Plus className="mr-2 h-4 w-4" />
            Nová faktura
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Celkem faktur</CardDescription>
            <CardTitle className="text-3xl">{stats.total}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{formatCurrency(stats.totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Zaplaceno</CardDescription>
            <CardTitle className="text-3xl text-green-600">{stats.paid}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{formatCurrency(stats.paidAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Nezaplaceno</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{stats.unpaid}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{formatCurrency(stats.unpaidAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Po splatnosti</CardDescription>
            <CardTitle className="text-3xl text-red-600">{stats.overdue}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Vyžaduje pozornost</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Seznam faktur</CardTitle>
              <CardDescription>Všechny vytvořené faktury</CardDescription>
            </div>
            <InvoiceFilters currentStatus={params.status} />
          </div>
        </CardHeader>
        <CardContent>
          {!invoices || invoices.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                {params.status ? "Žádné faktury pro tento filtr" : "Zatím nemáte žádné faktury"}
              </p>
              <Button asChild variant="outline">
                <Link href="/invoices/new">Vytvořit první fakturu</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Číslo faktury</TableHead>
                  <TableHead>Zákazník</TableHead>
                  <TableHead>Datum vystavení</TableHead>
                  <TableHead>Datum splatnosti</TableHead>
                  <TableHead>Proplaceno</TableHead>
                  <TableHead>Email odeslán</TableHead>
                  <TableHead>Částka</TableHead>
                  <TableHead>Stav</TableHead>
                  <TableHead className="text-right">Akce</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>{invoice.customer?.name || "-"}</TableCell>
                    <TableCell>{formatDate(invoice.issue_date)}</TableCell>
                    <TableCell>{formatDate(invoice.due_date)}</TableCell>
                    <TableCell>{invoice.paid_date ? formatDate(invoice.paid_date) : "-"}</TableCell>
                    <TableCell>
                      {invoice.email_sent_at ? <DateTimeDisplay date={invoice.email_sent_at} /> : "-"}
                    </TableCell>
                    <TableCell>{formatCurrency(invoice.total)}</TableCell>
                    <TableCell>
                      {invoice.paid_date ? (
                        <Badge variant="default" className="bg-green-600">
                          Zaplaceno
                        </Badge>
                      ) : new Date(invoice.due_date) < new Date() ? (
                        <Badge variant="destructive">Po splatnosti</Badge>
                      ) : (
                        <Badge variant="secondary">Nezaplaceno</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <InvoiceActions
                        invoiceId={invoice.id}
                        isPaid={!!invoice.paid_date}
                        customerEmail={invoice.customer?.email}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
