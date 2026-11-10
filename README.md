# Fineline

A small web shop for hand-drawn line portraits. A customer uploads a photo, our own server turns it into a **single fineline drawing** (an SVG with black pen strokes only, sized for the paper and within a stroke budget), the customer previews it, picks a picture frame in stock and orders. The owner downloads the SVG in the admin tool, draws it with a Rotrics desktop robot arm, frames it and ships it.

- **Customers** (mostly on phones): photo -> drawing preview -> frame -> details and photo terms -> order number and estimated delivery date.
- **Admin** (one person, on a laptop): log in, work through orders (view and download the SVG for the arm, move through statuses, change delivery dates), manage frames and stock, set the standard lead time.

Out of scope for now: online payment, customer emails and accounts, discount codes, sending drawings to the arm directly, more than one admin. See [`docs/brief.md`](docs/brief.md).

## Parts

| Part | What | Stack | README |
|---|---|---|---|
| [`apps/api`](apps/api) | Public and admin HTTP API, PostgreSQL, file storage, retention sweep | Node 22, TypeScript, Fastify 5, Zod, Drizzle, Vitest | [apps/api/README.md](apps/api/README.md) |
| [`apps/worker`](apps/worker) | Photo -> SVG line drawing (internal service, called only by the API) | Python 3.12, FastAPI, OpenCV, Pillow + pillow-heif, uv, pytest | [apps/worker/README.md](apps/worker/README.md) |
| [`apps/web`](apps/web) | Customer shop (`/`) and admin tool (`/admin`), served by nginx which also proxies `/api` | React 19, Vite, TypeScript, React Router, Vitest | [apps/web/README.md](apps/web/README.md) |

How they talk: browser -> nginx (`web`) -> `api` -> `worker` / PostgreSQL / file storage. Contracts: [`docs/api/openapi.yaml`](docs/api/openapi.yaml) (web <-> api) and [`docs/api/worker-openapi.yaml`](docs/api/worker-openapi.yaml) (api <-> worker).

## Prerequisites

- Docker with Docker Compose v2 (to run everything), and/or for development:
- Node.js 22.12+ (`nvm use` reads [`.nvmrc`](.nvmrc)),
- Python 3.12 and [uv](https://docs.astral.sh/uv/) 0.8+ (the worker; `uv` installs Python 3.12 if needed),
- PostgreSQL 16 (or the compose database via the dev override, below).

## Quickstart with Docker Compose

```sh
git clone https://github.com/dian-kaagman/fineline.git && cd fineline
cp .env.example .env
# Fill in the secrets in .env (the placeholders are refused on purpose):
openssl rand -hex 16          # -> POSTGRES_PASSWORD
openssl rand -base64 32       # -> WORKER_TOKEN
docker compose build api
docker compose run --rm --no-deps -T api node dist/scripts/hash-password.js   # type the admin password (12+ chars) -> ADMIN_PASSWORD_HASH
docker compose up --build
```

The hash command works while `.env` still holds the placeholder hash (it only prints a hash); paste its output into `ADMIN_PASSWORD_HASH`. Without Docker: `cd apps/api && npm ci && npm run hash-password`. `COOKIE_SECURE=true` works on `http://localhost` in Chrome and Firefox; set it to `false` only for plain HTTP on another host name.

Then open <http://localhost:8080> (shop) and <http://localhost:8080/admin> (admin tool, log in with `ADMIN_USERNAME` and your password). Add a frame in the admin tool before ordering: customers only see frames in stock.

## Quickstart for development (each part natively)

```sh
# 1. Database: a local PostgreSQL 16 with databases fineline and fineline_test, or the compose one:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db     # 127.0.0.1:5432

# 2. Worker (terminal 1)
cd apps/worker && uv sync --frozen
WORKER_TOKEN=<same 32+ char token as the API> uv run fineline-worker         # http://localhost:8000

# 3. API (terminal 2)
cd apps/api && npm ci && cp .env.example .env   # fill in DATABASE_URL, WORKER_TOKEN, ADMIN_PASSWORD_HASH (npm run hash-password), COOKIE_SECURE=false
npm run db:migrate && npm run dev                                           # http://localhost:3000

# 4. Web (terminal 3)
cd apps/web && npm ci && cp .env.example .env
npm run dev                                                                 # http://localhost:5173 (proxies /api to :3000)
```

## Scripts

Run inside each part's directory. Every part has the same quality gates; CI runs all of them.

| Task | `apps/api` | `apps/web` | `apps/worker` |
|---|---|---|---|
| Install | `npm ci` | `npm ci` | `uv sync --frozen` |
| Dev server | `npm run dev` | `npm run dev` | `uv run fineline-worker` |
| Lint | `npm run lint` | `npm run lint` | `uv run ruff check .` |
| Format (check) | `npm run format` (`format:check`) | `npm run format` (`format:check`) | `uv run ruff format .` (`--check`) |
| Typecheck | `npm run typecheck` | `npm run typecheck` | `uv run mypy` |
| Test | `npm test` | `npm test` | `uv run pytest` |
| Build | `npm run build` | `npm run build` (needs `VITE_CONTACT_EMAIL`) | Docker image |
| Database migrations | `npm run db:migrate` (`db:generate` after schema changes) | - | - |
| Admin password hash | `npm run hash-password` | - | - |
| API types from the contract | - | `npm run generate:api` (`check:api`) | - |

Repository-wide:

| Command | What it does |
|---|---|
| `npx -y @fission-ai/openspec@1 validate --all --strict --no-interactive` | Validate the specs (CI `specs` job) |
| `node scripts/smoke.mjs` | End-to-end smoke test against a running stack (`SMOKE_BASE_URL`, `SMOKE_ADMIN_USERNAME`, `SMOKE_ADMIN_PASSWORD`; `SMOKE_CHECK_HEADERS=0` without nginx) |
| `node scripts/check-compose.mjs` | Check the hardening properties of `docker-compose.yml` |
| `python3 docs/ux/check-contrast.py` | Check the contrast of every design-token colour pair |

## Running the tests

- API: needs PostgreSQL; set `TEST_DATABASE_URL` in `apps/api/.env` to a database whose name contains `test` (it is wiped). `cd apps/api && npm test`.
- Worker: `cd apps/worker && uv run pytest` (includes a performance test; `-m "not perf"` skips it).
- Web: `cd apps/web && npm test` (jsdom, API mocked at the client boundary, axe checks per screen).
- End to end: start the stack (compose or natively) and run `node scripts/smoke.mjs`; CI does this with Docker Compose in the `compose` job.

Tests name the acceptance criteria they cover (`AC-020 ...`), so `grep -r "AC-020" apps` finds the proof of a scenario.

## Environment variables

All configuration comes from environment variables, validated at startup (a missing or invalid variable stops the service with a message naming it).

- [`.env.example`](.env.example) - everything Docker Compose needs, with a comment per variable.
- [`apps/api/.env.example`](apps/api/.env.example), [`apps/worker/.env.example`](apps/worker/.env.example), [`apps/web/.env.example`](apps/web/.env.example) - for running each part natively.

Secrets (`WORKER_TOKEN`, `ADMIN_PASSWORD_HASH`, `POSTGRES_PASSWORD`) have placeholders that fail validation; generate real values as shown above. Never commit `.env`.

## Project layout

```
apps/api/        TypeScript HTTP API (routes -> services -> domain -> repositories / storage)
apps/worker/     Python conversion worker (decode -> extract lines -> trace -> simplify/order -> SVG -> budget)
apps/web/        React SPA (src/shop, src/admin) + nginx.conf
docs/brief.md    the brief this project started from
docs/domain/     glossary, business rules (BR-xxx), open questions
docs/ux/         flows, screens, copy, design tokens, accessibility requirements (UX-xxx)
docs/security/   threat model and security requirements (SR-xxx)
docs/api/        OpenAPI contracts
docs/decisions/  architecture decision records (ADRs)
openspec/        specs (what the system does) and changes (proposed changes)
scripts/         smoke test and compose checks
.github/         CI workflow and Dependabot
docker-compose.yml, docker-compose.dev.yml
```

## Decisions

See [`docs/decisions/`](docs/decisions/): three-part repository and stack (0001), Python worker and the edge-and-contour line drawing (0002), single admin with server-side sessions (0003), no customer drawing adjustments yet (0004), delivery dates in Monday-Friday working days without holidays (0005), file storage interface (0006), Docker Compose locally with hosting deferred (0007).

## How we change this project

This project is spec-driven with [OpenSpec](https://github.com/Fission-AI/OpenSpec). What the system does is specified in [`openspec/specs/`](openspec/specs/) (one folder per capability, scenarios with `AC-` IDs). Every feature or behaviour change starts as a change in `openspec/changes/<name>/` (proposal, delta specs, design, tasks) that is reviewed before it is built, then archived into `openspec/specs/`. In Claude Code: `/opsx:propose`, review, `/opsx:apply`, `/opsx:archive`. Bug fixes and refactors that don't change behaviour don't need a change. Business rules live in [`docs/domain/business-rules.md`](docs/domain/business-rules.md); keep them in step with the specs. See [`CLAUDE.md`](CLAUDE.md).
