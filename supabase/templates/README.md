# E-mailové šablony

Šablony jsou psané v **React Email** (`/emails/*.tsx`) a exportované do HTML.

| Zdroj (React) | Export (HTML) | Kam patří |
| --- | --- | --- |
| `emails/invoice-email.tsx` | — (renderuje se za běhu) | Faktura zákazníkovi (španělsky), posílá appka přes Resend |
| `emails/auth-confirmation.tsx` | `confirm-signup.html` | Supabase → Confirm signup |
| `emails/auth-reset-password.tsx` | `reset-password.html` | Supabase → Reset password |

## Náhled a export

```bash
pnpm email          # živý náhled všech šablon na http://localhost:3005
pnpm email:export   # vyexportuje do emails/out/*.html
```

Po úpravě auth šablon zkopírujte `emails/out/auth-confirmation.html` → `confirm-signup.html`
a `emails/out/auth-reset-password.html` → `reset-password.html` (tady vedle).

> Faktura se renderuje za běhu v `app/api/invoices/[id]/send-email` (Resend
> vezme React komponentu přímo), export faktury slouží jen k náhledu.

## Kam se šablony nahrávají

Ručně do Supabase dashboardu → **Authentication → Email Templates**:

```bash
pbcopy < supabase/templates/reset-password.html   # -> Reset password
pbcopy < supabase/templates/confirm-signup.html   # -> Confirm signup
```

Po každé úpravě `emails/*.tsx` je tedy potřeba `pnpm email:export`, zkopírovat
sem a znovu vložit v dashboardu. Šablony obsahují `{{ .ConfirmationURL }}`,
kterou Supabase sám doplní.

Zbytek nastavení (SMTP přes Resend, Site URL, allow-list redirectů) je taky
v dashboardu — postup krok za krokem je v `DEPLOYMENT.md`, sekce „Auth e-maily".

## Proč e-maily chodily s odkazem na localhost

Odkaz v e-mailu skládá Supabase ze dvou věcí: z `redirectTo`, které pošle
aplikace, a ze **Site URL**, na kterou spadne, když `redirectTo` není
v allow-listu. Rozbité to bylo na obou koncích naráz:

1. V produkci byla na Vercelu proměnná `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL`
   se zbytkem po v0 scaffoldu (`https://v0.app/chat/api/supabase/redirect/…`).
   Kód z ní skládal `redirectTo`, Supabase ho zahodil jako nepovolený.
2. Site URL v Supabase byla pořád `http://localhost:3000`, takže fallback
   poslal uživatele na localhost.

Oprava: proměnná je pryč (z kódu i z Vercelu), redirect base se bere
z `NEXT_PUBLIC_SITE_URL` (`lib/auth/redirect.ts`) a Site URL i allow-list jsou
v `config.toml`.
