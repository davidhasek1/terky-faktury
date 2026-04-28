import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, ArrowUpRight } from "lucide-react"
import Link from "next/link"
import { CustomerActions } from "@/components/customers/customer-actions"
import { PageHeader } from "@/components/layout/page-header"

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
    console.error("[v0] Error fetching customers:", error)
  }

  const count = customers?.length || 0
  const countLabel = count === 1 ? "záznam" : count >= 2 && count <= 4 ? "záznamy" : "záznamů"

  return (
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-6xl">
      <PageHeader
        eyebrow={`${count} ${countLabel}`}
        title={
          <>
            Adresář <span className="italic text-primary">zákazníků</span>
          </>
        }
        description="Spravujte protistrany — adresy, daňová čísla a kontaktní údaje, které se promítnou do faktur."
        actions={
          <Button asChild className="text-[11px] uppercase tracking-[0.22em] shadow-none">
            <Link href="/customers/new">
              <Plus className="mr-2 h-3.5 w-3.5" />
              Nový zákazník
            </Link>
          </Button>
        }
      />

      {!customers || customers.length === 0 ? (
        <div className="border border-border bg-card px-6 py-20 text-center">
          <p className="font-serif italic text-2xl text-muted-foreground mb-6">Zatím prázdno.</p>
          <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto leading-relaxed">
            Přidejte prvního zákazníka, ať ho máte po ruce při vystavování faktur.
          </p>
          <Button asChild variant="outline" className="bg-transparent text-[11px] uppercase tracking-[0.22em]">
            <Link href="/customers/new">
              Přidat prvního zákazníka
              <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="border border-border bg-card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <Th>Název</Th>
                <Th>Email</Th>
                <Th>Telefon</Th>
                <Th>NIE</Th>
                <Th>NIF</Th>
                <Th>Typ</Th>
                <Th align="right">Akce</Th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer, idx) => (
                <tr
                  key={customer.id}
                  className={idx !== customers.length - 1 ? "border-b border-border/60" : ""}
                >
                  <Td>
                    <span className="font-serif text-lg text-foreground">{customer.name}</span>
                  </Td>
                  <Td>{customer.email || <Dash />}</Td>
                  <Td>{customer.phone || <Dash />}</Td>
                  <Td className="font-mono text-xs">{customer.ico || <Dash />}</Td>
                  <Td className="font-mono text-xs">{customer.dic || <Dash />}</Td>
                  <Td>
                    {customer.is_business ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] uppercase tracking-[0.18em] font-medium"
                      >
                        Podnikatel
                      </Badge>
                    ) : (
                      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        Soukromá
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    <CustomerActions customerId={customer.id} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={
        "text-[10px] uppercase tracking-[0.22em] font-medium text-muted-foreground py-4 px-5 " +
        (align === "right" ? "text-right" : "text-left")
      }
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align,
  className = "",
}: {
  children: React.ReactNode
  align?: "right"
  className?: string
}) {
  return (
    <td
      className={
        "py-5 px-5 text-sm text-foreground " +
        (align === "right" ? "text-right " : "") +
        className
      }
    >
      {children}
    </td>
  )
}

function Dash() {
  return <span className="text-muted-foreground/50">—</span>
}
