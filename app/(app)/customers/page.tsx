import Link from "next/link"
import { Plus, Users } from "lucide-react"

import { Topbar } from "@/components/app-shell/topbar"
import { CustomerActions } from "@/components/customers/customer-actions"
import { DataTable, Dash, TableCell, TableHead } from "@/components/patterns/data-table"
import { EmptyState } from "@/components/patterns/empty-state"
import { PageHeader } from "@/components/patterns/page-header"
import { PageShell } from "@/components/patterns/page-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"

export default async function CustomersPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: customers, error } = await supabase
    .from("customers")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[customers] Nepodařilo se načíst zákazníky:", error)
  }

  const rows = customers ?? []
  const count = rows.length
  const countLabel = count === 1 ? "záznam" : count >= 2 && count <= 4 ? "záznamy" : "záznamů"

  return (
    <>
      <Topbar
        title="Zákazníci"
        action={
          <Button asChild size="sm">
            <Link href="/customers/new">
              <Plus className="size-4" />
              Nový zákazník
            </Link>
          </Button>
        }
      />
      <PageShell>
        <PageHeader
          eyebrow={`${count} ${countLabel}`}
          title="Adresář zákazníků"
          description="Spravuj protistrany — adresy, daňová čísla a kontaktní údaje, které se promítnou do faktur."
        />

        {rows.length === 0 ? (
          <EmptyState
            icon={<Users className="size-8" />}
            title="Zatím žádní zákazníci."
            description="Přidej prvního zákazníka, ať ho máš po ruce při vystavování faktur."
            action={
              <Button asChild>
                <Link href="/customers/new">
                  <Plus className="size-4" />
                  Přidat zákazníka
                </Link>
              </Button>
            }
          />
        ) : (
          <DataTable
            head={
              <>
                <TableHead>Název</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>NIE</TableHead>
                <TableHead>NIF</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead align="right">Akce</TableHead>
              </>
            }
          >
            {rows.map((customer) => (
              <tr key={customer.id} className="border-b border-border/60 last:border-0">
                <TableCell>
                  <span className="font-display text-base text-foreground">{customer.name}</span>
                </TableCell>
                <TableCell>{customer.email || <Dash />}</TableCell>
                <TableCell>{customer.phone || <Dash />}</TableCell>
                <TableCell className="font-ident text-xs">{customer.ico || <Dash />}</TableCell>
                <TableCell className="font-ident text-xs">{customer.dic || <Dash />}</TableCell>
                <TableCell>
                  {customer.is_business ? (
                    <Badge variant="secondary">Podnikatel</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Soukromá</span>
                  )}
                </TableCell>
                <TableCell align="right">
                  <CustomerActions customerId={customer.id} />
                </TableCell>
              </tr>
            ))}
          </DataTable>
        )}
      </PageShell>
    </>
  )
}
