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
pnpm typecheck                   # tsc --noEmit  (run before declaring work done)
pnpm test                        # vitest run
pnpm test:watch                  # vitest
```

Tests are Vitest (`vitest.config.ts`, specs in `tests/`). They run against an
in-memory Supabase stand-in (`tests/helpers/fake-supabase.ts`) that also
emulates RLS, so no database, Docker or network is needed.

There is no linter. ESLint was never installed here, and `next lint` was
removed in Next 16, so the `lint` script is gone. The gate is `pnpm typecheck`,
`pnpm test` and `pnpm build`, plus the smoke-test checklist at the bottom of
`DEPLOYMENT.md`.

`next.config.mjs` does **not** silence type errors — `pnpm build` runs the TypeScript check and fails on it.

## Architecture

Next.js 15 App Router + React 19 + TypeScript + Tailwind v4. Backend is Supabase (Postgres + Auth + RLS); email via Resend; PDF via `@react-pdf/renderer`. Path alias `@/*` maps to repo root.

### Service layer — put business logic here

`lib/services/*` is the single home for domain logic (invoice maths, write
ordering, compensation, domain rules). It is called by **all three** entry
points: client forms, API routes, and MCP tools. Never reimplement a rule in a
component or a route — add it to the service and call it.

- `lib/services/context.ts` — `ServiceContext = { supabase, userId }`. `userId`
  must always come from a verified identity, never from input.
- `lib/services/browser-context.ts` / `server-context.ts` — build that context
  from the browser session / cookie session.
- `lib/services/invoice-totals.ts` — pure calculation shared by the live form
  preview, the MCP draft summary and the actual save.
- `lib/services/errors.ts` — `ServiceError` with a stable machine-readable
  `code` and a Czech user-facing message. Raw driver errors never leak out.
- `lib/money.ts` — money is parsed to integer hundredths and only converted
  back at the DB boundary. Never `parseFloat` an amount.
- `lib/validation/*` — zod schemas shared by forms and MCP tools.

### Auth & route gating

`proxy.ts` runs `lib/supabase/proxy.ts:updateSession` on every request (Next 16 renamed the `middleware` convention to `proxy`). It refreshes the Supabase session cookie and redirects unauthenticated users to `/auth/login` — **except** for these public path prefixes, which must remain reachable without auth:

- `/auth/*` — login, signup, password reset
- `/invoices/download/[publicId]` — public invoice download page (linked from emailed invoices)
- `/api/invoices/download/[publicId]` — public PDF download endpoint
- `/api/invoices/public/[publicId]` — public invoice JSON for the download page

- `/mcp` — MCP endpoint, authorized by Bearer token instead of a cookie
- `/.well-known/*`, `/api/well-known/*` — OAuth metadata
- `/api/oauth/{token,register,revoke}` — called by the OAuth client, not a user

New public routes go into the single `PUBLIC_PATH_PREFIXES` list in
`lib/supabase/proxy.ts`; both branches of `updateSession` read from it.

`/api/oauth/authorize` is deliberately **not** public — it needs a signed-in
user, and the middleware redirect carries `redirect_to` so the user comes back
after logging in.

### Supabase clients — pick the right one

There are four entry points in `lib/supabase/` and they are not interchangeable:

- `server.ts` → `createClient()` — server components / route handlers. Reads cookies, respects RLS as the signed-in user.
- `client.ts` → `createClient()` — client components. Browser-side, persists session.
- `proxy.ts` → `updateSession()` — only called from the root `proxy.ts`.
- `user-scoped.ts` → `createUserScopedClient(userId)` — for requests with no cookies (the MCP endpoint). Asks Supabase Auth for a real short-lived access token for that user, so **RLS still applies** as that user. Tokens are cached in process memory until they expire.
- `service-role.ts` → `createServiceRoleClient()` — **bypasses RLS**. Only for the OAuth store and the public invoice download, where no user session exists and the query is pinned to a single unguessable token.

Never instantiate `createClient` from `@supabase/supabase-js` directly — always go through these wrappers so cookie/RLS behavior stays consistent.

### Database

Schema lives entirely in `supabase/migrations/NNN_*.sql` and **must be applied in numeric order** to a fresh Supabase project. Treat these as ordered migrations; new schema changes go in the next-numbered file (keep the numeric `NNN_` prefix). They are managed by the **Supabase CLI**: a PR workflow validates them from scratch and a `master` workflow runs `supabase db push` to production (see `.github/workflows/supabase-migrations-*.yml` and the "Database" section of `DEPLOYMENT.md`, including the one-time `migration repair` baseline). Locally you can still apply them via the SQL editor or `psql`. RLS is enabled — every user-owned table has a `user_id` column tied to `auth.uid()`. Public access for the download flow is granted by separate RLS policies (see `006_*` and `007_*`).

Domain types are in `lib/types.ts`: `Customer`, `Invoice`, `InvoiceItem`, `CompanyDetails`. `Invoice.public_id` is the unguessable token used in public download URLs; `email_sent_at` is stamped by the send-email route.

### Invoice flow

1. **Create/edit** — `app/invoices/new`, `app/invoices/[id]/edit` use `components/invoices/invoice-form.tsx`, which validates with the zod schema in `lib/validation/invoices.ts` and saves through `lib/services/invoices.ts`.
2. **View** — `app/invoices/[id]/view` renders `components/invoices/invoice-preview.tsx`.
3. **PDF** — `lib/pdf-generator.tsx` is the single source of truth for PDF layout (`@react-pdf/renderer`). Both the authenticated route `app/api/invoices/[id]/pdf` and the public route `app/api/invoices/download/[publicId]` use it. Returns `Uint8Array` (not a Node `Buffer`) — required for Node 24 / `@react-pdf/renderer` v4 compatibility.
4. **Email** — `app/api/invoices/[id]/send-email` renders the PDF, sends via Resend, and writes `email_sent_at`. The email links to `${NEXT_PUBLIC_SITE_URL}/invoices/download/[publicId]`, so `NEXT_PUBLIC_SITE_URL` **must** match the deployed origin in production (no localhost fallback).
5. **Public download** — `app/invoices/download/[publicId]/page.tsx` is a public page; it fetches `/api/invoices/public/[publicId]` and links to the public PDF route. Both routes read through `lib/services/public-invoice.ts` (service role, pinned to one `public_id`) because migration `015` removed the over-permissive public RLS policies.

### MCP integration

`/mcp` exposes the app to ChatGPT over Streamable HTTP, backed by a small
OAuth 2.1 server under `/api/oauth/*`. Clients that can't do OAuth use a
personal token (`tfm_…`) issued from the **`/connect`** page; `lib/mcp/auth.ts`
accepts both and resolves them to the same identity. Tools live in `lib/mcp/tools/` and
contain **no** business logic — they validate, call a service, and format the
result. Writes are two-phase through a **single** tool: called without
`confirmation_token` it returns a draft plus a single-use token, called again
with the same arguments and that token it performs the write (`lib/mcp/two-phase.ts`).
Full reference, including how to add a tool: `docs/MCP.md`. Why it is built this
way: `docs/adr/`. What it is for: `docs/prd/mcp-integration.md`.

### New functionality ships to MCP in the same change

MCP is a second door to the same rooms, not a subset. When you add or change a
user-facing capability, extend the MCP surface in the same commit — a feature
that exists only in the UI is a gap the operator will hit while talking to
ChatGPT, and nothing will point them at the reason.

Concretely, for anything a user can do in the app:

1. Put the rule in `lib/services/*` (ADR 0004). Never in a component or a route.
2. Add or extend a tool in `lib/mcp/tools/*` and register it in `lib/mcp/server.ts`.
   Reads are plain; writes wrap their body in `twoPhase()` (ADR 0003) and keep
   `confirmation_token` optional in the schema.
3. Cover both phases in `tests/mcp/two-phase.test.ts` and add the tool name to
   the list in `tests/mcp/protocol.test.ts`.
4. Add a row to the tool table in `docs/MCP.md`.

If a capability should **not** be reachable from a model — anything touching
credentials, billing identity, or a cascading delete — say so explicitly in the
"not exposed" table in `docs/MCP.md` and in the PRD, with the reason. Silence
reads as an oversight; a recorded refusal reads as a decision.

Next.js 15 route handlers receive `params` as a `Promise` — every route under `app/api/**` must `await context.params`. Dynamic page components already do this; don't regress it.

### UI

Three component layers, each built only on the one below it:

- `components/ui/` — shadcn/ui primitives (style: `new-york`, base color: `neutral`), Radix-based. No domain knowledge.
- `components/patterns/` — domain-free composites built from primitives: `page-shell.tsx`, `page-header.tsx`, `data-table.tsx`, `stat-tile.tsx`, `empty-state.tsx`, `section-label.tsx`, `step-label.tsx`. They know layout and visual rhythm, not invoices or customers.
- `components/app-shell/` — the navigation chrome: `sidebar.tsx`, `topbar.tsx`, `user-menu.tsx`, `nav-items.ts`.

Feature components stay grouped by domain on top of those two layers: `components/{activities,company,customers,invoices,mcp}/`.

Two-tier design tokens, both under `styles/`. `styles/tokens.css` is the primitive layer — raw `--tf-*` values (ink/canvas colors, the due-date temperature scale, spacing, radius, shadow, the z-index layer scale). Components never read `--tf-*` directly; `tests/design/tokens.test.ts` walks `components/`, `app/` and `lib/` and fails if any file does. `styles/semantic.css` is the layer components actually read — shadcn-named variables (`--background`, `--border`, `--sidebar`, `--status-overdue-fg`, …) that resolve to the primitives; it's the single source of truth for what a component is allowed to style with. `app/globals.css` imports both and maps them into Tailwind's `@theme`. Status colors (overdue/due/upcoming/settled) must come from this token layer, never raw Tailwind palette classes — `tests/design/status-colors.test.ts` guards the full Tailwind palette, not just a few color names.

There is **no dark mode**. It was removed; there is no `.dark` class and nothing adds one, so a `dark:` variant anywhere is dead code that can never apply — don't reintroduce it.

`app/(app)/` is a route group holding every page that needs a signed-in user; its `layout.tsx` renders `Sidebar` around them. Pages outside that group — `app/auth/*`, `app/invoices/download/[publicId]`, `app/mcp` — render with no sidebar and must stay reachable without auth (see `PUBLIC_PATH_PREFIXES` in `lib/supabase/proxy.ts`, which both route gating and layout rely on). The OAuth consent screen, `app/(app)/oauth/authorize/page.tsx`, is **inside** the group — it's an authenticated page like any other and gets the sidebar; only the API handlers `/api/oauth/{token,register,revoke}` are public (no layout at all, since they're never rendered).

Tailwind v4 — config is in `app/globals.css` via `@theme`; there is **no** `tailwind.config.*` file.

UI copy is **Czech**. The codebase had stray Spanish strings from the v0 origin which were cleaned up — don't reintroduce them.

## Environment variables

All listed in `.env.example`; canonical reference (with required-vs-optional and notes) is the table in `DEPLOYMENT.md`. The required-in-prod set:

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `SENDER_EMAIL`, `MCP_TOKEN_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.

`NEXT_PUBLIC_SITE_URL` must match the public origin exactly — the OAuth `issuer`
and `resource` identifiers are derived from it.

The Resend client is instantiated lazily inside the send-email route handler — do not move it to module scope, or `next build` will fail collecting page data when `RESEND_API_KEY` isn't present at build time.
