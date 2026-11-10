# 0003 Single admin with server-side sessions

- Status: accepted
- Date: 2026-01 (kickstart)

## Context

The admin tool must be reachable only after logging in (BR-011). There is exactly one admin and no requirement for sign-up, password reset or multiple users (brief, out of scope).

## Decision

- The admin's username and a scrypt password hash come from the environment (`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`); `apps/api` has a script to generate the hash. No admin table, no sign-up.
- Login creates a server-side session in PostgreSQL (only a hash of the random session ID is stored) and sets an opaque cookie `fineline_admin` (HttpOnly, SameSite=Strict, Secure in production, idle expiry configurable). Logout deletes the session.
- One authentication hook guards every `/api/v1/admin/*` route except login; unsafe admin requests also need `X-Requested-With: fineline` as a CSRF defence. Login is rate limited. Details in `docs/security/threat-model.md`.

## Consequences

- Changing the password means changing an environment variable and restarting; acceptable for one person.
- Sessions can be revoked (logout, or deleting rows), unlike stateless tokens.
- Adding more admins later needs an admin table and a migration (a future OpenSpec change).

## Alternatives considered

- JWT in a cookie: stateless but not revocable on logout without a denylist.
- External identity provider: overkill for one user and adds a third party.
- HTTP basic auth at the proxy: no logout, poor UX, and couples security to the hosting choice.
