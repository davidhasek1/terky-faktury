# MCP integration — product requirements

Date: 2026-08-13
Status: Implemented (v2, two-phase tools)

## Problem

Issuing an invoice means opening the app, finding the customer, filling a form,
and sending it. Most of that is dictation: *fakturu pro Podnikatele za praní
prádla, 30 eur*. The operator often has a phone in hand and the app on a laptop.

The goal is to drive the same operations by talking to ChatGPT, without giving a
language model the ability to quietly do something expensive or wrong.

## Users

**The operator** — one person today, running a cleaning and laundry business in
Spain, invoicing in EUR. Not a developer. Uses ChatGPT on a phone.

**A second account later** — an accountant or a colleague. The application is
built multi-tenant even while it has one user, and the integration must not be
the thing that breaks that (see ADR 0002).

## Goals

* Ask for invoices, customers and diary entries in plain Czech and get them.
* See exactly what will happen before anything is written, every time.
* Never let the model reach another account's data.
* Reuse the application's existing rules rather than restating them.

## Non-goals

* Replacing the web application. The UI stays the primary interface; MCP is a
  second door to the same rooms.
* Multi-currency. The domain has one currency and the tools reject anything else
  instead of converting.
* Bulk import, reporting, or anything a spreadsheet does better.
* Letting the model administer the account — credentials, billing identity, or
  connector settings are out of reach by design.

## Scenarios

1. *Najdi klienta ABC* — search returns candidates with distinguishing details.
   With more than one match the model must ask which; it never picks the first.
2. *Zobraz nezaplacené faktury po splatnosti* — filtered list, capped at 50.
3. *Vytvoř fakturu pro Podnikatele za praní prádla 30 €* — the model finds the
   customer, the server computes VAT and retención, the operator sees the full
   summary, confirms, and only then does the invoice exist.
4. *Odešli fakturu 2026-014* — summary names the recipient and warns if it was
   already sent; confirmation required; the send is idempotent.
5. *Kolik mi zákazníci dluží?* — aggregate totals.
6. *Zapiš úklid u klienta ABC za 30 €* — diary entry, same confirmation flow.

## Functional requirements

**Reading.** Customers (search, detail), invoices (list, detail, aggregate
summary, public download link), diary entries (list, detail), issuer profile.
Reads have no side effects and need only `invoices:read`.

**Writing.** Create and update customers, invoices and diary entries; mark an
invoice paid or unpaid; send an invoice by email; delete an invoice. All require
`invoices:write` and all are two-phase (ADR 0003): the first call returns a draft
that saves nothing, the second call with a server-issued token performs the
write.

**Confirmation summaries** for an invoice must show customer, amount, currency,
line items, quantities, VAT rate, retención, issue date, due date and payment
method — everything that changes the resulting document.

**Ambiguity.** The server never resolves a name to an identity on the model's
behalf. Search returns candidates and says so.

**Idempotency.** Creating an invoice or a customer and sending an email accept an
idempotency key; a repeat with the same key returns the original result instead
of acting twice.

**Currency.** EUR only. Anything else fails loudly.

**Money.** Amounts travel as strings and are computed in integer hundredths, so
no float rounding reaches an invoice.

## Non-functional requirements

**Isolation.** Enforced by Postgres RLS, not by application code (ADR 0002).
`user_id` is never taken from tool input.

**Authentication.** Every request carries a Bearer token — OAuth for ChatGPT
(ADR 0001), a personal token for other clients (ADR 0005).

**Auditability.** Every tool call records user, client, tool, outcome, error
code, affected resource, idempotency key and duration. No arguments, no personal
data, no tokens. Requests are also logged as they arrive, before anything can
reject them — a call that never reaches the tool wrapper still leaves a trace.

**Untrusted content.** Text stored in the database is user input. It is returned
as data, stripped of control characters and truncated, and never interpreted as
instruction. Authorization and confirmation are decided by the server alone.

**Errors.** One envelope: `{ success, data }` or
`{ success: false, error: { code, message, retryable } }`. No stack traces, SQL,
tokens or configuration leave the server.

**Limits.** 120 calls/minute, 20 writes/minute and 10 emails/hour per user;
256 kB request body; 50 results per list; 50 line items per invoice.

## Deliberately not exposed

| Operation | Reason |
| --- | --- |
| Login, signup, password reset | credentials and tokens |
| OAuth endpoints | authentication infrastructure, not a user operation |
| Public invoice download routes | no user context; the data is in `get_invoice` |
| **Deleting a customer** | cascades to every invoice and diary entry they own |
| Deleting a diary entry | destructive, low value in a conversation |
| Writing the issuer profile | changes the billing identity on every future document |
| Raw PDF bytes | large binary into a model's context; a link is returned instead |

## Success criteria

* A connector can be added in ChatGPT and lists the tools.
* Scenario 3 completes end to end, and the invoice matches the summary that was
  confirmed.
* No write happens without a valid, single-use, parameter-bound confirmation.
* A second account cannot see the first account's data, verified by tests.
* Typecheck, tests and build pass; `pnpm audit` is clean.

## Keeping it current

New user-facing functionality is expected to reach MCP in the same change that
adds it. The checklist lives in `CLAUDE.md`; the how-to lives in `docs/MCP.md`.
