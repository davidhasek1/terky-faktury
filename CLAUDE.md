# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Czech-language invoicing app ("Terky Faktury"): create customers, generate invoices, render them as PDFs, and email a public download link. Originally scaffolded by v0.app (the `README.md` is the v0 template — ignore it for project info; the source of truth is `DEPLOYMENT.md`).

## Commands

Package manager is **pnpm** (`packageManager` field is pinned — do not use npm/yarn). Node 24.x (see `.nvmrc`).

```bash
pnpm install --frozen-lockfile   # install (matches Vercel's install command)
pnpm dev                         # next dev
pnpm build                       # next build
pnpm start                       # next start (after build)
pnpm lint                        # next lint
pnpm typecheck                   # tsc --noEmit  (run before declaring work done)
```

There is no test framework configured. Verify changes by running `pnpm typecheck` and exercising the smoke-test checklist at the bottom of `DEPLOYMENT.md`.

`next.config.mjs` does **not** silence type or lint errors — both must pass for `pnpm build` to succeed.

## Architecture

Next.js 15 App Router + React 19 + TypeScript + Tailwind v4. Backend is Supabase (Postgres + Auth + RLS); email via Resend; PDF via `@react-pdf/renderer`. Path alias `@/*` maps to repo root.

### Auth & route gating

`middleware.ts` runs `lib/supabase/middleware.ts:updateSession` on every request. It refreshes the Supabase session cookie and redirects unauthenticated users to `/auth/login` — **except** for these public path prefixes, which must remain reachable without auth:

- `/auth/*` — login, signup, password reset
- `/invoices/download/[publicId]` — public invoice download page (linked from emailed invoices)
- `/api/invoices/download/[publicId]` — public PDF download endpoint
- `/api/invoices/public/[publicId]` — public invoice JSON for the download page

If you add a new public route, update the prefix checks in **both** branches of `updateSession` (the missing-env-vars fallback near the top **and** the normal flow at the bottom). Forgetting one half silently breaks the public invoice link.

### Supabase clients — pick the right one

There are four entry points in `lib/supabase/` and they are not interchangeable:

- `server.ts` → `createClient()` — server components / route handlers. Reads cookies, respects RLS as the signed-in user.
- `client.ts` → `createClient()` — client components. Browser-side, persists session.
- `client-anon.ts` → `createAnonClient()` — **only** for public, unauthenticated reads (the public download page). Uses anon key with no session.
- `middleware.ts` → `updateSession()` — only called from `middleware.ts`.

Never instantiate `createClient` from `@supabase/supabase-js` directly — always go through these wrappers so cookie/RLS behavior stays consistent.

### Database

Schema lives entirely in `supabase/migrations/NNN_*.sql` and **must be applied in numeric order** to a fresh Supabase project. Treat these as ordered migrations; new schema changes go in the next-numbered file (keep the numeric `NNN_` prefix). They are managed by the **Supabase CLI**: a PR workflow validates them from scratch and a `master` workflow runs `supabase db push` to production (see `.github/workflows/supabase-migrations-*.yml` and the "Database" section of `DEPLOYMENT.md`, including the one-time `migration repair` baseline). Locally you can still apply them via the SQL editor or `psql`. RLS is enabled — every user-owned table has a `user_id` column tied to `auth.uid()`. Public access for the download flow is granted by separate RLS policies (see `006_*` and `007_*`).

Domain types are in `lib/types.ts`: `Customer`, `Invoice`, `InvoiceItem`, `CompanyDetails`. `Invoice.public_id` is the unguessable token used in public download URLs; `email_sent_at` is stamped by the send-email route.

### Invoice flow

1. **Create/edit** — `app/invoices/new`, `app/invoices/[id]/edit` use `components/invoices/invoice-form.tsx` (react-hook-form + zod).
2. **View** — `app/invoices/[id]/view` renders `components/invoices/invoice-preview.tsx`.
3. **PDF** — `lib/pdf-generator.tsx` is the single source of truth for PDF layout (`@react-pdf/renderer`). Both the authenticated route `app/api/invoices/[id]/pdf` and the public route `app/api/invoices/download/[publicId]` use it. Returns `Uint8Array` (not a Node `Buffer`) — required for Node 24 / `@react-pdf/renderer` v4 compatibility.
4. **Email** — `app/api/invoices/[id]/send-email` renders the PDF, sends via Resend, and writes `email_sent_at`. The email links to `${NEXT_PUBLIC_SITE_URL}/invoices/download/[publicId]`, so `NEXT_PUBLIC_SITE_URL` **must** match the deployed origin in production (no localhost fallback).
5. **Public download** — `app/invoices/download/[publicId]/page.tsx` is a public page; it fetches via `client-anon` and links to the public PDF route.

Next.js 15 route handlers receive `params` as a `Promise` — every route under `app/api/**` must `await context.params`. Dynamic page components already do this; don't regress it.

### UI

shadcn/ui (style: `new-york`, base color: `neutral`) under `components/ui/`. Primitives are Radix-based. Feature components are grouped by domain: `components/{company,customers,invoices,layout}/`. Tailwind v4 — config is in `app/globals.css` via `@theme`; there is **no** `tailwind.config.*` file.

UI copy is **Czech**. The codebase had stray Spanish strings from the v0 origin which were cleaned up — don't reintroduce them.

## Environment variables

All listed in `.env.example`; canonical reference (with required-vs-optional and notes) is the table in `DEPLOYMENT.md`. The required-in-prod set:

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `SENDER_EMAIL`.

The Resend client is instantiated lazily inside the send-email route handler — do not move it to module scope, or `next build` will fail collecting page data when `RESEND_API_KEY` isn't present at build time.
