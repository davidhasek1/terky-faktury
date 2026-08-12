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
    <div className="flex min-h-svh w-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <p className="font-serif text-2xl text-primary mb-3">Terky</p>
          <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground mb-8">
            připojení aplikace
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl text-foreground tracking-tight leading-[1.1]">
            Povolit přístup pro <span className="text-primary">{clientName}</span>?
          </h1>
          <p className="mt-4 text-sm text-muted-foreground">
            Aplikace bude pracovat s tvými daty jménem účtu <strong>{user.email}</strong>.
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card px-6 py-6 mb-8">
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-4">
            Požadovaná oprávnění
          </p>
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

        <form method="post" action="/api/oauth/authorize" className="flex flex-col gap-3">
          <input type="hidden" name="request" value={request} />
          <Button
            type="submit"
            name="decision"
            value="allow"
            className="w-full text-[11px] uppercase tracking-[0.22em] shadow-none"
          >
            Povolit přístup
          </Button>
          <Button
            type="submit"
            name="decision"
            value="deny"
            variant="ghost"
            className="w-full text-[11px] uppercase tracking-[0.22em] text-muted-foreground hover:text-foreground"
          >
            Odmítnout
          </Button>
        </form>
      </div>
    </div>
  )
}

function ConsentError({ message }: { message: string }) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <p className="font-serif text-2xl text-primary mb-6">Terky</p>
        <h1 className="font-serif text-3xl text-foreground mb-4">Nepovedlo se</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}
