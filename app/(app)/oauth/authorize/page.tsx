import { Topbar } from "@/components/app-shell/topbar"
import { PageHeader } from "@/components/patterns/page-header"
import { PageShell } from "@/components/patterns/page-shell"
import { Button } from "@/components/ui/button"
import { OAUTH_SCOPES } from "@/lib/oauth/config"
import { getClient } from "@/lib/oauth/store"
import { verifyAuthorizationRequest } from "@/lib/oauth/tokens"
import { createClient } from "@/lib/supabase/server"

/**
 * Souhlasná obrazovka pro připojení externí aplikace (typicky ChatGPT).
 *
 * Popis požadavku přichází jako podepsaný token z `/api/oauth/authorize`,
 * takže mezi zobrazením a potvrzením nejde změnit klienta ani rozsah
 * oprávnění. Název klienta pochází z dynamické registrace — je to neověřený
 * text, proto ho jen zobrazíme (React ho escapuje) a zkrátíme.
 */

const SCOPE_LABELS: Record<(typeof OAUTH_SCOPES)[number], string> = {
  "invoices:read": "Číst zákazníky, faktury a aktivity",
  "invoices:write": "Vytvářet a upravovat faktury, zákazníky a aktivity (vždy až po tvém potvrzení)",
}

export default async function AuthorizeConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>
}) {
  const { request } = await searchParams

  if (!request) {
    return <ConsentError message="Chybí popis autorizačního požadavku." />
  }

  let authorizationRequest
  try {
    authorizationRequest = await verifyAuthorizationRequest(request)
  } catch {
    return <ConsentError message="Požadavek vypršel nebo byl pozměněn. Zkus připojení znovu." />
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <ConsentError message="Přihlášení vypršelo. Přihlas se a zkus to znovu." />
  }

  const client = await getClient(authorizationRequest.client_id)
  const clientName = (client?.client_name ?? "Neznámá aplikace").slice(0, 120)
  const scopes = authorizationRequest.scope.split(/\s+/).filter(Boolean)

  return (
    <>
      <Topbar title="Souhlas s připojením" />
      <PageShell width="narrow">
        <PageHeader
          eyebrow="Připojení aplikace"
          title={
            <>
              Povolit přístup pro <span className="text-primary">{clientName}</span>?
            </>
          }
          description={
            <>
              Aplikace bude pracovat s tvými daty jménem účtu <strong>{user.email}</strong>.
            </>
          }
        />

        <div className="rounded-lg border border-border bg-card px-6 py-6 mb-8">
          <p className="mb-4 text-xs font-medium text-muted-foreground">Požadovaná oprávnění</p>
          <ul className="space-y-3">
            {scopes.map((scope) => (
              <li key={scope} className="flex gap-3 text-sm text-foreground">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                <span>{SCOPE_LABELS[scope as (typeof OAUTH_SCOPES)[number]] ?? scope}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground mb-8 leading-relaxed">
          Přístup se týká jen tvých vlastních dat. Každé vytvoření, úprava, odeslání nebo smazání
          si vyžádá zvláštní potvrzení s přesným souhrnem operace. Povolení můžeš kdykoli odebrat
          v nastavení konektoru.
        </p>

        <form
          method="post"
          action="/api/oauth/authorize"
          className="flex max-w-sm flex-col gap-3"
        >
          <input type="hidden" name="request" value={request} />
          <Button type="submit" name="decision" value="allow" className="w-full">
            Povolit přístup
          </Button>
          <Button
            type="submit"
            name="decision"
            value="deny"
            variant="ghost"
            className="w-full text-muted-foreground hover:text-foreground"
          >
            Odmítnout
          </Button>
        </form>
      </PageShell>
    </>
  )
}

function ConsentError({ message }: { message: string }) {
  return (
    <>
      <Topbar title="Souhlas s připojením" />
      <PageShell width="narrow">
        <PageHeader eyebrow="Připojení aplikace" title="Nepovedlo se" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </PageShell>
    </>
  )
}
