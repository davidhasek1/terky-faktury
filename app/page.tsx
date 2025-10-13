import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FileText, Users, Plus, TrendingUp, AlertCircle } from "lucide-react"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"

export default async function HomePage() {
  const supabase = await createClient()

  const { data: invoices } = await supabase.from("invoices").select("*")
  const { data: customers } = await supabase.from("customers").select("*")

  const stats = {
    totalInvoices: invoices?.length || 0,
    totalCustomers: customers?.length || 0,
    paidInvoices: invoices?.filter((inv) => inv.paid_date).length || 0,
    overdueInvoices: invoices?.filter((inv) => !inv.paid_date && new Date(inv.due_date) < new Date()).length || 0,
    totalRevenue: invoices?.filter((inv) => inv.paid_date).reduce((sum, inv) => sum + inv.total, 0) || 0,
    pendingRevenue: invoices?.filter((inv) => !inv.paid_date).reduce((sum, inv) => sum + inv.total, 0) || 0,
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight mb-2">Fakturační systém</h1>
        <p className="text-muted-foreground text-lg">Vytvářejte a spravujte faktury jednoduše</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Celkové tržby</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(stats.totalRevenue)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <span>{stats.paidInvoices} zaplacených faktur</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Čeká na platbu</CardDescription>
            <CardTitle className="text-2xl">{formatCurrency(stats.pendingRevenue)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {stats.totalInvoices - stats.paidInvoices} nezaplacených faktur
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Po splatnosti</CardDescription>
            <CardTitle className="text-2xl text-red-600">{stats.overdueInvoices}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span>Vyžaduje pozornost</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardDescription>Zákazníci</CardDescription>
            <CardTitle className="text-2xl">{stats.totalCustomers}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Aktivní protistrany</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Faktury
            </CardTitle>
            <CardDescription>Vytvářejte a spravujte faktury</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button asChild className="flex-1">
                <Link href="/invoices/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Nová faktura
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/invoices">Zobrazit vše</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Zákazníci
            </CardTitle>
            <CardDescription>Spravujte své zákazníky</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button asChild className="flex-1">
                <Link href="/customers/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Nový zákazník
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/customers">Zobrazit vše</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Upozornění
            </CardTitle>
            <CardDescription>Faktury vyžadující pozornost</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.overdueInvoices > 0 ? (
                <>
                  <p className="text-sm">
                    <span className="font-medium text-red-600">{stats.overdueInvoices}</span> faktur po splatnosti
                  </p>
                  <Button asChild variant="outline" size="sm" className="w-full bg-transparent">
                    <Link href="/invoices?status=overdue">Zobrazit faktury</Link>
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Žádné faktury po splatnosti</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
