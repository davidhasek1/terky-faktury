# 0003 — Writes confirm through one tool called twice

Date: 2026-08-13
Status: Accepted (supersedes the original `prepare_*` + write tool pairing)

## Context

A write triggered from a chat needs the user to see exactly what will happen
before it happens, and the server must not take the model's word for it — a
model can emit `confirmed: true` as easily as any other field. So the server
issues a single-use token bound to the user and to a hash of the parameters,
and the write is refused without it.

The first implementation split that across two tools: `prepare_invoice`
returned a summary plus a token and an `execute_arguments` object, and
`create_invoice` accepted them. In production it failed three different ways,
all on the seam between the two calls:

* The model presented the `prepare_invoice` summary as a finished invoice and
  never called `create_invoice`. The audit log showed `prepare_invoice` and then
  nothing, while the user had been told the invoice was issued.
* Write schemas used `optional()` where the preparation returned `null`, so
  relaying `execute_arguments` verbatim — which is what we asked the model to
  do — failed validation. Fixed once for invoice notes, missed for customers.
* The shape of the confirmation hash became the public input schema. Deleting an
  invoice required `action: "delete"` and `paid_date: null`. The model could not
  construct that call, the client dropped it before sending, and nothing reached
  the server — so it looked as though write tools were never invoked at all.

## Decision

One tool per operation, called twice.

Called without `confirmation_token`, the tool resolves defaults, computes the
result, stores the hash, and returns a draft: `saved: false`, a `status` saying
in words what has *not* happened, `required_action` naming the tool to call
again, the summary, warnings, and the token. Nothing is written.

Called again with the same arguments plus the token, it verifies the hash and
performs the write.

Arguments are whatever the operation naturally needs — `delete_invoice` takes an
`invoice_id` and nothing else. Anything the server can derive (dates, rates,
currency) is optional and resolved identically in both phases. The hash is
computed from normalised values inside the handler, so it never shapes the API.

`lib/mcp/two-phase.ts` holds the mechanism; `confirmation_token` is always
optional in the schema, because in the first phase there is nothing to put there.

## Consequences

The model calls the same tool with the same arguments and only adds a token. It
cannot forget to switch tools, and there is no second schema to drift from the
first — the entire class of relay bugs is gone. The tool count drops from 24
to 19.

The safety property is unchanged: server-issued, single-use, bound to user and
parameters, invalidated by any change.

The cost is that `readOnlyHint` is false for the draft call too, since the same
tool can write. A client that prompts before non-readonly calls will prompt on
the draft as well. That is one approval instead of two, which is acceptable.

Every tool's two phases are exercised in `tests/mcp/two-phase.test.ts`, and
`tests/mcp/protocol.test.ts` asserts that confirmation artefacts never reappear
in required arguments.
