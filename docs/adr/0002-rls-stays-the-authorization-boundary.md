# 0002 — RLS stays the authorization boundary for MCP

Date: 2026-08-13
Status: Accepted (supersedes an earlier plan to sign our own Supabase JWT)

## Context

Every existing path in this application relies on Postgres row-level security:
`auth.uid() = user_id`. No page and no route checks ownership in application
code. An MCP request arrives with a Bearer token and no cookies, so something
has to stand in for the browser session.

Three options were on the table:

1. Sign a Supabase-compatible JWT ourselves with the project's legacy HS256
   secret and send it as the user.
2. Use the service-role key and have the service layer filter by `user_id`.
3. Ask Supabase Auth for a genuine access token for that user.

Option 1 was implemented first. It then turned out the project had migrated to
asymmetric signing keys: the private half is not exported, and the legacy HS256
secret sat in *previously used* state — still accepted, but something Supabase's
own rotation guidance tells you to revoke. The integration would have died
silently the day someone clicked Revoke.

Option 2 is the simplest, and it moves the boundary from the database into
application code. One missing `.eq("user_id", …)` in any future query leaks
another user's invoices, and nothing in the database would stop it.

## Decision

`lib/supabase/user-scoped.ts` asks Supabase Auth for a real access token for the
user: `generateLink` produces a single-use `hashed_token` (no email is sent),
and `verifyOtp` exchanges it for a session. Tokens are cached in process memory
until they expire.

The service-role key stays confined to places where no signed-in user exists —
the OAuth store, the public invoice download, and minting this token. It never
reads tool data.

## Consequences

The database keeps deciding who can see what. A future query that forgets to
filter is still safe, which matters because the application is built
multi-tenant even while it has one user.

The cost is a dependency on the Auth Admin API and roughly one auth call per
user per hour of activity. Each mint creates a session row in Supabase. On
serverless, cold instances mint more often than a warm process would; if that
ever becomes a problem, the cache moves to the database.

`SUPABASE_JWT_SECRET` is no longer needed anywhere.
