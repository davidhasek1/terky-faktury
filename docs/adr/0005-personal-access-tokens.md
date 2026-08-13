# 0005 — Personal access tokens for clients without OAuth

Date: 2026-08-13
Status: Accepted

## Context

ChatGPT authenticates through OAuth (see 0001). Other MCP clients — Claude
Desktop, MCP Inspector, a shell script — cannot run that flow, or can only send
a static header. Without an alternative, the endpoint is usable from exactly one
product.

## Decision

Users issue personal tokens themselves at `/connect`. A token is an opaque
`tfm_` string with 256 bits of entropy, stored only as its SHA-256, shown once
at creation. It carries a name, a scope (read, or read and write), an expiry
(30 / 90 / 365 days), and can be revoked, which takes effect immediately. Ten
valid tokens per user.

`lib/mcp/auth.ts` distinguishes the two credential types by prefix and resolves
both to the same identity. Rate limiting, confirmation, audit and RLS behave
identically either way.

Token management authenticates with the cookie session, never with an MCP token,
so one token cannot mint another.

## Consequences

The endpoint works from any MCP client, and a script can be given a read-only
token instead of full access.

A long-lived bearer token is a larger blast radius than a 30-minute OAuth access
token. Scope selection defaults to read, the value is never recoverable after
creation, and `last_used_at` gives the user something to check.
