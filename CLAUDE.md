# CLAUDE.md - Fineline

Fineline is a one-person studio's web shop: a customer uploads a photo, our own server turns it into a pen-plottable SVG line drawing (black strokes only, millimetres, inside the drawing area, within the stroke budget), the customer previews it, picks a frame in stock and orders; the owner (single admin) downloads the SVG in the admin tool, draws it with a Rotrics robot arm, frames and ships it. Customers are mostly on phones; the admin is on a laptop.

## Commands (as in README.md)

| | `apps/api` | `apps/web` | `apps/worker` |
|---|---|---|---|
| Install | `npm ci` | `npm ci` | `uv sync --frozen` |
| Dev | `npm run dev` | `npm run dev` | `uv run fineline-worker` |
| Test | `npm test` | `npm test` | `uv run pytest` |
| Lint | `npm run lint` | `npm run lint` | `uv run ruff check .` |
| Format check | `npm run format:check` | `npm run format:check` | `uv run ruff format --check .` |
| Typecheck | `npm run typecheck` | `npm run typecheck` | `uv run mypy` |
| Build | `npm run build` | `npm run build` (needs `VITE_CONTACT_EMAIL`) | Docker image |
| Migrations | `npm run db:migrate` / `npm run db:generate` | - | - |

- Whole stack: `cp .env.example .env` (fill in secrets), `docker compose up --build`; smoke test: `node scripts/smoke.mjs`.
- Specs: `npx -y @fission-ai/openspec@1 validate --all --strict --no-interactive` (CI runs it).
- Web API types: `npm run generate:api` in `apps/web` after changing `docs/api/openapi.yaml` (CI checks with `check:api`).

## Layout

- `apps/api/` - Fastify API: `src/modules/<area>/` with `*.routes.ts` (HTTP only) -> `*.service.ts` (use cases, transactions) -> `*.repository.ts` (Drizzle); `src/domain/` pure rules; `src/storage/` FileStorage; `src/worker/` worker client.
- `apps/worker/` - Python conversion worker; all drawing tuning constants in `src/fineline_worker/params.py`.
- `apps/web/` - React SPA: `src/shop` (customer), `src/admin` (admin tool), `src/i18n/en.ts` (all copy), `nginx.conf`.
- `docs/` - brief, domain, ux, security, api contracts, decisions. `openspec/` - specs and changes. `scripts/` - smoke and compose checks.

## Where the knowledge lives

- `openspec/specs/` - what the system does (source of truth), scenarios with `AC-` IDs.
- `openspec/changes/` - proposed changes; `openspec/changes/archive/` - done ones (the kickstart is there).
- `docs/brief.md` - the original brief.
- `docs/domain/` - glossary, business rules (`BR-`), open questions.
- `docs/ux/` - flows, screens with states, copy, design tokens, accessibility (`UX-`).
- `docs/security/threat-model.md` - threats and security requirements (`SR-`).
- `docs/api/openapi.yaml` (web <-> api) and `docs/api/worker-openapi.yaml` (api <-> worker) - the contracts.
- `docs/decisions/` - ADRs.

## How to change the project

- **Features and behaviour changes start with a spec.** `/opsx:explore` to think it through (optional), `/opsx:propose <change>` to write proposal, delta specs, design and tasks; open a PR with just the change folder for review. After approval, `/opsx:apply` implements it task by task, and `/opsx:archive` merges the specs when done.
- **Bug fixes, refactors and dependency updates that don't change behaviour don't need a change.** If a bug shows the spec was wrong, fix the spec in a change.
- `openspec validate --all --strict` must pass.
- Contract first: change `docs/api/openapi.yaml` (and regenerate web types) before changing an endpoint; the API tests validate responses against it.

## Conventions to keep

- Use the glossary's terms in code and UI (photo, drawing, preview, preview token, stroke, drawing area, frame, stock, order, order number, lead time, estimated delivery date).
- Name the `AC-` ID in every test that covers a scenario; cite `BR-` / `SR-` / `UX-` IDs in requirements.
- A new or changed business rule gets a `BR-` entry in `docs/domain/business-rules.md` and a requirement that cites it.
- Record architecture decisions as ADRs in `docs/decisions/NNNN-title.md`.
- Money in integer euro cents incl. VAT; calendar dates as `YYYY-MM-DD` in Europe/Amsterdam; timestamps in UTC; lengths in millimetres.
- Customer photos are personal data: processed only on our server, never logged, deleted per BR-010; no third-party image/AI services, scripts or fonts.
- Validate every external input with Zod (API) / explicit checks (worker); parameterised queries only; no `dangerouslySetInnerHTML` (SVG is shown only as a data-URL `<img>`).
- Every unsafe admin request sends `X-Requested-With: fineline`; admin routes go into the one admin plugin (`app.ts`), which applies authentication and the CSRF check.
- Configuration only from environment variables, validated at startup; document each in `.env.example`.
- Conventional Commits; work on branches; never push to `main` directly.
