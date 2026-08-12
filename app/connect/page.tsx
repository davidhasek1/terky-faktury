import { AlertTriangle } from "lucide-react"

import { PageHeader } from "@/components/layout/page-header"
import { SectionLabel } from "@/components/layout/section-label"
import { CopyField } from "@/components/mcp/copy-field"
import { McpTokenManager } from "@/components/mcp/mcp-token-manager"

/**
 * Stránka „Připojení" — jediné místo, kde uživatel zjistí, jak appku napojit
 * na ChatGPT nebo jiného MCP klienta, a kde si vygeneruje osobní token.
 *
 * Adresu serveru bereme z `NEXT_PUBLIC_SITE_URL`, protože z ní se skládají
 * i OAuth metadata. Když nesedí s doménou, kterou uživatel zadá do ChatGPT,
 * konektor se nepřipojí — proto na chybějící nebo lokální hodnotu upozorníme.
 */
export default function ConnectionPage() {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "")
  const mcpUrl = siteUrl ? `${siteUrl}/mcp` : "/mcp"
  const isLocal = siteUrl === "" || siteUrl.includes("localhost") || siteUrl.includes("127.0.0.1")

  return (
    <div className="container mx-auto py-10 sm:py-16 px-4 sm:px-8 max-w-4xl">
      <PageHeader
        eyebrow="Integrace"
        title={
          <>
            Ovládej faktury <span className="text-primary">z ChatGPT</span>
          </>
        }
        description="Připoj aplikaci jako konektor a piš si o faktury normální větou. Vytvoření, úprava, odeslání i smazání ti vždy nejdřív ukáže přesný souhrn a počká na tvoje potvrzení."
      />

      <section className="mb-14 sm:mb-20">
        <SectionLabel number="01" title="Adresa serveru" />

        {isLocal && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-primary/40 bg-primary/5 px-5 py-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-sm text-foreground">
              Aplikace zatím běží lokálně. ChatGPT na <code className="text-xs">localhost</code>{" "}
              nedosáhne — konektor půjde připojit až z veřejné HTTPS adresy.
            </p>
          </div>
        )}

        <CopyField label="MCP URL" value={mcpUrl} />
        <p className="mt-3 text-xs text-muted-foreground italic">
          Tuhle adresu zadáš v ChatGPT. Bez přihlášení nevydá vůbec nic.
        </p>
      </section>

      <section className="mb-14 sm:mb-20">
        <SectionLabel number="02" title="Připojení k ChatGPT" />

        <div className="rounded-2xl border border-border/70 bg-card px-5 py-6 sm:px-8 sm:py-8">
          <p className="text-sm text-muted-foreground mb-6">
            Potřebuješ ChatGPT <strong>Plus</strong> nebo vyšší. Token si tady generovat nemusíš —
            ChatGPT se přihlásí sám tvým účtem.
          </p>

          <ol className="space-y-5">
            <Step number={1}>
              V ChatGPT otevři <strong>Nastavení → Konektory</strong>.
            </Step>
            <Step number={2}>
              Zapni <strong>Vývojářský režim</strong> (Developer mode / Advanced settings).
            </Step>
            <Step number={3}>
              Klikni na <strong>Vytvořit</strong> a vyplň název (třeba „Terky Faktury"), MCP URL
              z kroku 01 a jako autentizaci zvol <strong>OAuth</strong>.
            </Step>
            <Step number={4}>
              ChatGPT tě přesměruje na přihlášení. Přihlas se stejným účtem jako do téhle aplikace.
            </Step>
            <Step number={5}>
              Na obrazovce se souhlasem klikni na <strong>Povolit přístup</strong>.
            </Step>
            <Step number={6}>
              V novém chatu konektor zapni (ikona nástrojů) a zkus napsat{" "}
              <em>„Zobraz nezaplacené faktury po splatnosti."</em>
            </Step>
          </ol>

          <p className="mt-7 pt-6 border-t border-border text-xs text-muted-foreground">
            Přístup kdykoli odebereš smazáním konektoru v ChatGPT.
          </p>
        </div>
      </section>

      <section className="mb-14 sm:mb-20">
        <SectionLabel number="03" title="Osobní tokeny" />

        <p className="text-sm text-muted-foreground mb-8 max-w-2xl">
          Pro ChatGPT token nepotřebuješ. Hodí se pro klienty, kteří přihlášení přes OAuth neumí —
          Claude Desktop, MCP Inspector nebo vlastní skript. Token zastupuje tvůj účet, takže s ním
          zacházej jako s heslem.
        </p>

        <McpTokenManager mcpUrl={mcpUrl} />
      </section>

      <section>
        <SectionLabel number="04" title="Co zkusit" />

        <div className="grid gap-3 sm:grid-cols-2">
          {EXAMPLES.map((example) => (
            <div
              key={example}
              className="rounded-2xl border border-border/70 bg-card px-5 py-4 text-sm text-foreground"
            >
              „{example}"
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-muted-foreground italic">
          Zákazníka si nikdy nevybere sám — když je jich víc se stejným jménem, zeptá se tě, kterého
          myslíš.
        </p>
      </section>
    </div>
  )
}

const EXAMPLES = [
  "Najdi klienta ABC.",
  "Zobraz nezaplacené faktury po splatnosti.",
  "Připrav fakturu klientovi ABC na 100 EUR.",
  "Odešli potvrzenou fakturu klientovi ABC.",
  "Kolik mi zákazníci celkem dluží?",
  "Označ fakturu 2026-014 jako zaplacenou.",
]

function Step({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground text-[11px] font-semibold tabular-nums">
        {number}
      </span>
      <span className="pt-1 text-sm text-foreground leading-relaxed">{children}</span>
    </li>
  )
}
