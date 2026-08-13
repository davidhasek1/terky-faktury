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
| `MCP_TOKEN_SECRET` | yes | Signs MCP access tokens. Min 32 chars (`openssl rand -base64 48`) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only key for the OAuth store, the public invoice download, and minting user sessions for MCP |

`NEXT_PUBLIC_SITE_URL` must match the public origin exactly — the OAuth
`issuer` and `resource` identifiers are derived from it, and ChatGPT will
refuse the connector if they don't line up. See `docs/MCP.md`.

## Database

The database is Supabase Postgres. Schema lives in `supabase/migrations/NNN_*.sql`
(ordered migrations, e.g. `001_*.sql` … `016_*.sql`). New schema changes go in the
next-numbered file. These are now managed by the **Supabase CLI** and applied by CI.

### CI

- **Validate (`.github/workflows/supabase-migrations-validate.yml`)** — on every PR
  that touches `supabase/migrations/**`, boots a throwaway Postgres and applies all
  migrations from scratch (`supabase start` + `supabase db reset`). Fails on bad SQL.
- **Deploy (`.github/workflows/supabase-migrations-deploy.yml`)** — on push to
  `master` touching `supabase/migrations/**`, runs `supabase db push` against the
  production project (`jgoiiqvugfyjoqzegwjp`).

Required GitHub secrets (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase dashboard → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | Project Settings → Database → Password |

### ⚠️ One-time baseline (do this before the first CI deploy)

The production project was recreated (`jgoiiqvugfyjoqzegwjp`); the previous one
no longer exists. Its schema came from a dump rather than from `supabase db push`,
so Supabase has no record of which migrations ran. Without a baseline,
`supabase db push` tries to re-apply them and fails.

Check what the project thinks it has, then mark the ones already in the schema
as applied:

```bash
supabase login                      # paste an access token
supabase link --project-ref jgoiiqvugfyjoqzegwjp
supabase migration list             # what is recorded remotely

# Mark every migration already present in the schema. Adjust the list to match
# what `migration list` showed - do not guess.
supabase migration repair --status applied \
  001 002 003 004 005 006 007 008 009 010 011 012 013

supabase migration list             # verify: local and remote line up
```

After that, `supabase db push` (locally or via CI) applies only what is pending —
`014`, `015` and `016`.

Also confirm the GitHub secrets point at this project: `SUPABASE_DB_PASSWORD`
must be the new project's database password, and `SUPABASE_ACCESS_TOKEN` must
belong to an account with access to it. Stale values fail the deploy.

### Manual apply (fresh project or without CI)

Run the files in `supabase/migrations/` **in numeric order** via the Supabase SQL
editor or `psql`, or link the project and run `supabase db push`.

## Build & runtime

- Node: 24.x (see `.nvmrc` and `engines` in `package.json`)
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
   - If you're migrating Supabase too: create the new project, apply all
     migrations in `supabase/migrations/` in order (SQL editor, `psql`, or
     `supabase db push`), then update Supabase Auth → URL Configuration with the
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
- [ ] `/.well-known/oauth-protected-resource` returns JSON with the right origin
- [ ] `POST /mcp` without a token returns 401 with a `WWW-Authenticate` header
- [ ] The ChatGPT connector connects and `tools/list` returns 24 tools
- [ ] `/connect` shows the production MCP URL and can issue + revoke a token
