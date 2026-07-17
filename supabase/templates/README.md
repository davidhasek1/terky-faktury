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

## ⚠️ Proč nechodí ověřovací a reset e-maily (a jak to spravit)

Ověření e-mailu po registraci a reset hesla **neposílá tahle aplikace** — posílá je
**Supabase Auth**. Ve výchozím stavu Supabase používá vlastní testovací SMTP s tvrdým
limitem (~2–3 e-maily/hodinu), takže se e-maily reálně neodešlou. Řešení = vlastní SMTP.

### 1) Nastavit vlastní SMTP (přes Resend)

Supabase dashboard → **Authentication → Emails → SMTP Settings** → Enable custom SMTP:

| Pole | Hodnota |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend API klíč (`re_…`) |
| Sender email | adresa na **ověřené doméně** v Resendu (stejná jako `SENDER_EMAIL`) |
| Sender name | např. `Terky` |

(Doména musí být v Resendu ověřená — SPF/DKIM. Bez ověřené domény Resend odmítne odeslání.)

### 2) Nahrát šablony

Supabase dashboard → **Authentication → Email Templates**:
- **Confirm signup** → vložit obsah `confirm-signup.html`
- **Reset password** → vložit obsah `reset-password.html`

Šablony obsahují proměnnou `{{ .ConfirmationURL }}`, kterou Supabase sám doplní.

### 3) Zkontrolovat redirect URL

Supabase dashboard → **Authentication → URL Configuration**:
- **Site URL** = produkční origin (stejný jako `NEXT_PUBLIC_SITE_URL`)
- **Redirect URLs** přidat: `.../` , `.../auth/reset-password`

Kód posílá `emailRedirectTo` / `redirectTo` z `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL`
nebo `window.location.origin` (viz `app/auth/sign-up` a `app/auth/forgot-password`).
V produkci musí origin sedět s tím, co je povolené v URL Configuration výše.
