# Deployment & Vercel migration

## Required environment variables

Copy `.env.example` and fill in. All vars must be present in **every** Vercel
environment (Production, Preview, Development) or the build/runtime will fail.

| Var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon (public) key |
| `NEXT_PUBLIC_SITE_URL` | yes | Deployed origin, used in invoice email links |
| `RESEND_API_KEY` | yes | Resend API key |
| `SENDER_EMAIL` | yes | Verified sender on your Resend domain |
| `SENDER_NAME` | no | Display name in `From`. Defaults to `Faktury` |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | no | Override auth redirect base; otherwise uses `window.location.origin` |

## Database

The database is Supabase Postgres. Schema lives in `scripts/001_*.sql` …
`scripts/009_*.sql` and must be applied **in order** to a fresh project via the
Supabase SQL editor or `psql`.

## Build & runtime

- Node: 20.x (see `.nvmrc` and `engines` in `package.json`)
- Package manager: pnpm (lockfile is `pnpm-lock.yaml`)
- Build command: `pnpm build` (or default `next build`)
- Install command: `pnpm install --frozen-lockfile`
- Output: standard Next.js (no custom `vercel.json`)

## Switching to a new Vercel project

You don't have to touch the code or the GitHub repo — just point a new Vercel
project at the same repo.

1. **Create the new Vercel project**
   - https://vercel.com/new → Import the GitHub repo (`terky_faktury`).
   - Framework preset: **Next.js** (auto-detected).
   - Install command: `pnpm install --frozen-lockfile`.

2. **Set environment variables** (Settings → Environment Variables)
   - Copy each key from `.env.example` into Production (and Preview if you want
     preview deploys to work end-to-end). Vercel offers a *Bulk Edit* paste box.
   - **Do not** reuse the localhost values — `NEXT_PUBLIC_SITE_URL` must match
     the new Vercel domain.

3. **Database**
   - If you're keeping the same Supabase project, just copy its URL + anon key.
   - If you're migrating Supabase too: create the new project, run all SQL in
     `scripts/` in order, then update Supabase Auth → URL Configuration with the
     new site URL and redirect URLs (`/auth/callback`, `/auth/reset-password`).

4. **Resend**
   - The verified sending domain is tied to the Resend account, not Vercel — no
     change needed unless you're moving to a new domain. If you are: add+verify
     the new domain in Resend, then update `SENDER_EMAIL`.

5. **Cut over the old project**
   - Trigger a deploy on the new project and confirm `/`, `/invoices`,
     `/auth/login`, and a public `/invoices/download/<publicId>` link all work.
   - In the **old** Vercel project: Settings → Domains → remove the production
     domain (so it stops serving).
   - In the **new** Vercel project: Settings → Domains → add the production
     domain. Vercel will validate and switch DNS automatically if the domain is
     registered with Vercel; otherwise update the CNAME/A record at your
     registrar.
   - Update `NEXT_PUBLIC_SITE_URL` to the production domain (not the
     `*.vercel.app` URL) and redeploy.

6. **Post-cutover**
   - In Supabase Auth settings, replace the old origin in *Site URL* and
     *Redirect URLs* with the new one.
   - Send a test invoice email and verify the download link resolves.
   - Once stable, archive/delete the old Vercel project.

## Smoke test checklist

- [ ] `/auth/login` renders and you can sign in
- [ ] `/invoices` lists invoices for the signed-in user
- [ ] `/invoices/new` saves an invoice
- [ ] `/api/invoices/[id]/pdf` downloads a PDF
- [ ] `/api/invoices/[id]/send-email` sends an email and stamps `email_sent_at`
- [ ] The link in the email opens `/invoices/download/[publicId]` without auth
- [ ] `/api/invoices/download/[publicId]` returns the PDF without auth
