# Architecture decision records

One file per decision that was expensive to make and would be expensive to
reverse. Numbered, append-only: when a decision changes, add a new record and
mark the old one superseded rather than editing history.

Write one when a choice closes off alternatives — a protocol, a trust boundary,
where a layer lives. Skip it for anything a reader can infer from the code.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-own-oauth-authorization-server.md) | Ship our own OAuth 2.1 authorization server | Accepted |
| [0002](0002-rls-stays-the-authorization-boundary.md) | RLS stays the authorization boundary for MCP | Accepted |
| [0003](0003-two-phase-writes-in-a-single-tool.md) | Writes confirm through one tool called twice | Accepted |
| [0004](0004-service-layer-owns-business-logic.md) | The service layer is the only home for business logic | Accepted |
| [0005](0005-personal-access-tokens.md) | Personal access tokens for clients without OAuth | Accepted |
