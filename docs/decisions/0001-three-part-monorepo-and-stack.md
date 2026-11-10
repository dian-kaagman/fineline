# 0001 Three-part repository: TypeScript API, Python worker, TypeScript web app

- Status: accepted
- Date: 2026-01 (kickstart)

## Context

The brief asks for a mobile-friendly customer shop and a laptop admin tool, TypeScript for the web and the API, PostgreSQL, files on disk behind an interface, and local running with Docker Compose. Hosting is undecided. The photo-to-SVG conversion may run in a separate Python worker if that gives a clearly better drawing (see ADR 0002).

## Decision

One repository with three standalone parts, each with its own lockfile, quality gates and Dockerfile:

- `apps/api` - Node 22, TypeScript (strict), Fastify 5, Zod, Drizzle ORM with SQL migrations, PostgreSQL 16, Vitest.
- `apps/worker` - Python 3.12, FastAPI, OpenCV, managed with uv (ADR 0002).
- `apps/web` - React + Vite SPA in TypeScript (strict), React Router, plain CSS with design tokens, Vitest + Testing Library. One app serves both the customer shop (`/`) and the admin tool (`/admin/*`).

The web app and API share one origin: nginx (Docker) or the Vite dev server proxies `/api` to the API. `docker-compose.yml` at the root runs db, worker, api and web.

## Consequences

- No npm workspaces: builders and CI jobs work on each part independently; shared types between web and API come from the OpenAPI contract (`docs/api/openapi.yaml`), not a shared package.
- Same-origin hosting lets the admin session cookie be `SameSite=Strict` and avoids CORS in production.
- Two languages to maintain (TypeScript and Python), accepted for the conversion quality.

## Alternatives considered

- Next.js full-stack app: fewer parts, but mixes the admin API with rendering and the brief separates "web" and "API"; an SPA plus a small API is simpler to reason about for one developer.
- npm workspaces monorepo: shared tooling, but one root lockfile makes parallel work and per-part Docker builds more awkward; revisit if shared code appears.
