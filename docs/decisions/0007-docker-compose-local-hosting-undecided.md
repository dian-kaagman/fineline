# 0007 Docker Compose for local running; production hosting deferred

- Status: accepted
- Date: 2026-01 (kickstart)

## Context

Hosting is undecided; the project must run with Docker Compose locally (brief, constraints).

## Decision

Each part has a Dockerfile (multi-stage, non-root user). `docker-compose.yml` at the root runs `db` (postgres:16), `worker` (not published to the host), `api` (applies migrations on start) and `web` (nginx serving the built SPA and proxying `/api` to the API) with named volumes for the database and file storage. Configuration comes only from environment variables, so the same images can move to any container host later.

## Consequences

- One command (`docker compose up --build`) runs the whole shop locally.
- Choosing hosting later means picking where the four containers and the two volumes live (or swapping the storage implementation, ADR 0006); no code change expected.

## Alternatives considered

- Choosing a PaaS now: premature without knowing cost and data-location constraints (personal data, EU).
