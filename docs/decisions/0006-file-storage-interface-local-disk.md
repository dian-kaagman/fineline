# 0006 File storage behind an interface, local disk first

- Status: accepted
- Date: 2026-01 (kickstart)

## Context

Photos, drawings (SVG) and frame photos are stored as files: local disk in development, behind an interface so cloud storage can be added later (brief). Photos are personal data (BR-010). Hosting is undecided.

## Decision

`apps/api` defines a `FileStorage` interface (`put`, `get`, `delete`) keyed by opaque, server-generated keys (never user-supplied file names). The only implementation in the kickstart writes to `STORAGE_DIR` on local disk (a Docker volume in Compose). Files are served only through API routes that enforce access rules; the storage directory is never exposed by a static file server.

## Consequences

- Adding S3-compatible storage later is one new implementation selected by configuration.
- Local disk ties the API to one instance until then - fine for the expected volume.
- Retention (BR-010) deletes through the same interface, so it will work unchanged with cloud storage.

## Alternatives considered

- Storing files in PostgreSQL (bytea): simpler backups, but the brief asks for files, and large binaries bloat the database.
- S3/MinIO from day one: extra moving part locally before hosting is decided.
