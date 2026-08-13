# 0001 — Ship our own OAuth 2.1 authorization server

Date: 2026-08-13
Status: Accepted

## Context

ChatGPT connectors authenticate one of two ways: not at all, or OAuth. They
cannot send a custom header, so a static API key is not an option.

Supabase Auth is an identity provider for this application, not an
authorization server for third-party clients. There is no way to point ChatGPT
at Supabase and have it issue tokens on our behalf. Supabase does have an OAuth
server for third-party apps, but it was in beta, and a billing-adjacent
integration in a production invoicing app is a poor place to depend on one.

The alternative was an external authorization server (Clerk, WorkOS, Auth0).
That buys audited OAuth plumbing at the cost of an account, a bill, and a second
source of truth about users — every token would still need mapping back to a
Supabase `auth.users` row.

## Decision

The application is its own authorization server. `/api/oauth/*` implements
authorization code flow with mandatory PKCE S256, dynamic client registration
(RFC 7591), and rotating refresh tokens with reuse detection. Metadata is
published per RFC 8414 and RFC 9728.

The authorization endpoint does not handle credentials itself. It requires an
existing Supabase cookie session and renders a consent screen; users log in
through the same form they always have.

## Consequences

Users sign in once with the account they already have, and no third party sits
between ChatGPT and their invoices. There is no new bill and no second user
directory.

We own roughly 500 lines of security-sensitive code and the obligation to keep
it correct — PKCE verification, single-use codes, refresh rotation, reuse
detection. That code is covered by `tests/oauth/flow.test.ts`.

Access tokens are JWTs verified without a database round-trip, so revoking a
refresh token does not kill an outstanding access token; it expires within 30
minutes. That is the trade for a stateless resource server.
