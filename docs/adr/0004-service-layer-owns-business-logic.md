# 0004 — The service layer is the only home for business logic

Date: 2026-08-13
Status: Accepted

## Context

Before MCP, this application had no backend to speak of. Four API routes existed;
everything else went straight from a client component to Supabase. Invoice
maths, the retención rule, write ordering and compensation all lived inside
`useEffect` and `handleSubmit`. `zod` was a dependency that nothing imported.

Exposing the same operations to a model meant either reimplementing those rules
in the tool layer — two copies of how an invoice is calculated, guaranteed to
diverge — or extracting them first.

## Decision

`lib/services/*` is the single home for domain logic, called by all three entry
points: client forms, API routes, and MCP tools. A `ServiceContext` carries a
Supabase client and a verified `userId`; the caller supplies whichever client
matches its situation.

MCP tools contain no business rules. They validate input, call a service, and
shape the result. `lib/mcp/tools/*` may not talk to the database directly.

Money is parsed into integer hundredths in `lib/money.ts` and only converted at
the database boundary. Validation lives in `lib/validation/*` as zod schemas
shared by forms and tools.

## Consequences

The live total in the invoice form, the draft a model shows in chat, and the row
written to Postgres all come from `calculateInvoiceTotals`. They cannot disagree.

The cost was a large one-off refactor touching every form and route, done
without a test suite to catch regressions — verified by typecheck, build, and
the smoke-test checklist in `DEPLOYMENT.md`.

New domain rules go in the service, not in a tool and not in a component. A rule
that exists only in a component is a bug waiting for the model to find it.
