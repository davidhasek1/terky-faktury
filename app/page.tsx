import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { FileText, Users, Plus, ArrowUpRight, AlertCircle } from "lucide-react"
import Link from "next/link"
import { formatCurrency, cn } from "@/lib/utils"
import { SectionLabel } from "@/components/layout/section-label"

export default async function HomePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: invoices } = await supabase.from("invoices").select("*").eq("user_id", user.id)
  const { data: customers } = await supabase.from("customers").select("*").eq("user_id", user.id)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const stats = {
    totalInvoices: invoices?.length || 0,
    totalCustomers: customers?.length || 0,
    paidInvoices: invoices?.filter((inv) => inv.paid_date).length || 0,
    overdueInvoices:
      invoices?.filter((inv) => {
        if (inv.paid_date) return false
        const dueDate = new Date(inv.due_date)
        dueDate.setHours(0, 0, 0, 0)
        return dueDate < today
      }).length || 0,
    totalRevenue: invoices?.filter((inv) => inv.paid_date).reduce((sum, inv) => sum + inv.total, 0) || 0,
    pendingRevenue: invoices?.filter((inv) => !inv.paid_date).reduce((sum, inv) => sum + inv.total, 0) || 0,
  }

  const today_formatted = new Intl.DateTimeFormat("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date())

  const statItems = [
    {
      label: "Celkové tržby",
      value: formatCurrency(stats.totalRevenue),
      meta: `${stats.paidInvoices} zaplacených faktur`,
      tone: "positive" as const,
    },
    {
      label: "Čeká na platbu",
      value: formatCurrency(stats.pendingRevenue),
      meta: `${stats.totalInvoices - stats.paidInvoices} nezaplacených faktur`,
      tone: "pending" as const,
    },
    {
      label: "Po splatnosti",
      value: stats.overdueInvoices.toString(),
      meta: stats.overdueInvoices > 0 ? "Vyžaduje pozornost" : "Vše v pořádku",
      tone: stats.overdueInvoices > 0 ? ("danger" as const) : ("neutral" as const),
    },
    {
      label: "Zákazníci",
      value: stats.totalCustomers.toString(),
      meta: "Aktivní protistrany",
      tone: "neutral" as const,
    },
  ]

  return (
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-6xl">
      {/* Hero / Masthead */}
      <header className="mb-16 sm:mb-24">
        <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-6">
          {today_formatted}
        </p>
        <h1 className="font-serif text-5xl sm:text-7xl leading-[1.05] tracking-tight text-foreground mb-6">
          Vítej zpátky,
          <br />
          <span className="italic text-primary">Terko.</span>
        </h1>
        <p className="text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
          Vytvářej faktury, sleduj platby a piš zákazníkům — všechno na jednom místě.
        </p>
      </header>

      {/* 01 — Přehled */}
      <section className="mb-16 sm:mb-20">
        <SectionLabel number="01" title="Přehled" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border">
          {statItems.map((item) => (
            <div key={item.label} className="bg-card px-6 py-8 sm:px-8 sm:py-10">
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-4">
                {item.label}
              </p>
              <p
                className={cn(
                  "font-serif text-3xl sm:text-4xl leading-none mb-3 tabular-nums",
                  toneClass(item.tone),
                )}
              >
                {item.value}
              </p>
              <p className="text-xs text-muted-foreground">{item.meta}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 02 — Rychlé akce */}
      <section className="mb-16 sm:mb-20">
        <SectionLabel number="02" title="Rychlé akce" />
        <div className="grid gap-px bg-border border border-border grid-cols-1 md:grid-cols-2">
          <ActionPanel
            icon={<FileText className="h-4 w-4" />}
            eyebrow="Fakturace"
            title="Nová faktura"
            description="Vytvořte fakturu pro existujícího nebo nového zákazníka."
            primaryHref="/invoices/new"
            primaryLabel="Vystavit fakturu"
            secondaryHref="/invoices"
            secondaryLabel="Všechny faktury"
          />
          <ActionPanel
            icon={<Users className="h-4 w-4" />}
            eyebrow="Adresář"
            title="Nový zákazník"
            description="Přidejte protistranu, ať ji máte po ruce při fakturaci."
            primaryHref="/customers/new"
            primaryLabel="Přidat zákazníka"
            secondaryHref="/customers"
            secondaryLabel="Všichni zákazníci"
          />
        </div>
      </section>

      {/* 03 — Upozornění */}
      {stats.overdueInvoices > 0 && (
        <section className="mb-8">
          <SectionLabel number="03" title="Upozornění" />
          <div className="border border-border bg-card px-6 py-8 sm:px-10 sm:py-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-primary" />
                Po splatnosti
              </p>
              <p className="font-serif text-4xl sm:text-5xl text-foreground leading-none mb-3">
                <span className="italic text-primary">{stats.overdueInvoices}</span>{" "}
                {stats.overdueInvoices === 1 ? "faktura" : "faktur"}
              </p>
              <p className="text-sm text-muted-foreground max-w-md">
                Tyto faktury překročily datum splatnosti. Pošli připomínku nebo označ jako zaplacené.
              </p>
            </div>
            <Button asChild variant="outline" className="self-start sm:self-end bg-transparent text-[11px] uppercase tracking-[0.22em]">
              <Link href="/invoices?status=overdue">
                Zobrazit
                <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

function toneClass(tone: "positive" | "pending" | "danger" | "neutral") {
  switch (tone) {
    case "positive":
      return "text-emerald-700"
    case "pending":
      return "text-amber-700"
    case "danger":
      return "text-rose-700 italic"
    default:
      return "text-foreground"
  }
}

function ActionPanel({
  icon,
  eyebrow,
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  icon: React.ReactNode
  eyebrow: string
  title: string
  description: string
  primaryHref: string
  primaryLabel: string
  secondaryHref: string
  secondaryLabel: string
}) {
  return (
    <div className="bg-card px-6 py-8 sm:px-10 sm:py-10 flex flex-col gap-6">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="text-primary">{icon}</span>
        <span className="text-[10px] uppercase tracking-[0.25em]">{eyebrow}</span>
      </div>
      <div>
        <h3 className="font-serif text-3xl sm:text-4xl text-foreground leading-tight mb-3">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-sm">{description}</p>
      </div>
      <div className="flex flex-wrap gap-3 mt-auto pt-2">
        <Button asChild className="text-[11px] uppercase tracking-[0.22em] shadow-none">
          <Link href={primaryHref}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            {primaryLabel}
          </Link>
        </Button>
        <Button asChild variant="ghost" className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground">
          <Link href={secondaryHref}>
            {secondaryLabel}
            <ArrowUpRight className="ml-2 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
