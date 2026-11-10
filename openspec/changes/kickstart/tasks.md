## 1. API (apps/api) - backend-engineer

- [ ] 1.1 Scaffold the Fastify + TypeScript service with quality gates (`lint`, `format`, `typecheck`, `test`, `build`, `dev`, `start`), environment validation at startup with secret checks (SR-020), `GET /api/v1/health`, the common error shape with generic 5xx and pino redaction (SR-018), nosniff and `no-store` headers (SR-019), strict Zod parsing (SR-016), a test helper that validates HTTP test responses against `docs/api/openapi.yaml`, and `.env.example`
- [ ] 1.2 Data model and SQL migrations: drawings, frames, orders, order_number_counters, settings (lead time default 7), admin_sessions; `db:migrate` script; Vitest `globalSetup` migrating a dedicated test database, DB test files run serially
- [ ] 1.3 `FileStorage` interface with a local-disk implementation under `STORAGE_DIR`: server-generated keys checked against a pattern and confined to the directory, atomic 0600 writes (SR-015)
- [ ] 1.4 Domain logic as pure functions with unit tests: working-day delivery date in Europe/Amsterdam (AC-018, AC-047, AC-048, AC-049), order number format and per-year counting (AC-019), status state machine (AC-033, AC-034, AC-036), strict allowlist SVG drawing validator that recomputes metrics (AC-005, AC-006, AC-055, SR-006)
- [ ] 1.5 `POST /api/v1/drawings`: rate limit, streamed 15 MiB single-part limit, magic-byte type check, worker client with concurrency limit, timeout and error mapping, store only after success, preview token (hash stored), 24 h expiry (SR-001, SR-002, SR-004, SR-006, SR-009, SR-015, SR-017) (AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010, AC-050, AC-051, AC-052, AC-053, AC-054, AC-055, AC-057)
- [ ] 1.6 `GET /api/v1/frames` (stock > 0 only) and `GET /api/v1/frames/{id}/photo` with nosniff and sandbox CSP (AC-013, SR-007)
- [ ] 1.7 `POST /api/v1/orders`: validation per field, NL/BE only, photo terms, preview token check, atomic stock decrement, order number, estimated delivery date, price copied from frame, replay of an already-ordered drawing returns the original confirmation, check order and identical 404s, rate limit, no personal data in logs (SR-009, SR-016, SR-017, SR-018) (AC-014, AC-015, AC-016, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023, AC-058, AC-059, AC-060)
- [ ] 1.8 Admin authentication: login/logout/session endpoints, scrypt hash and `hash-password` script, login rate limit before hashing, server-side sessions with idle and absolute expiry and cookie flags, one `onRequest` auth hook with a route-table test, CSRF header check before body parsing (SR-010, SR-011, SR-012, SR-013, SR-014) (AC-024, AC-025, AC-026, AC-027, AC-028, AC-061, AC-062, AC-063, AC-064)
- [ ] 1.9 Admin orders: list with status filter and sort, detail with allowed next statuses, side-effect-free SVG view and `drawing-download` (received -> drawing) with file-route headers, original photo, `open`/`all`/status filter, order date, status changes with stock return on cancel, delivery date change (SR-007, SR-008; AC-027, AC-029, AC-030, AC-031, AC-032, AC-033, AC-034, AC-035, AC-036, AC-037, AC-038)
- [ ] 1.10 Admin frames: list, get, create with photo (magic bytes, 5 MiB, metadata stripped), edit, replace photo, stock adjustments (SR-002, SR-023) (AC-039, AC-040, AC-041, AC-042, AC-043, AC-044, AC-066)
- [ ] 1.11 Admin settings: get (with the read-only drawing area) and set the standard lead time (AC-045, AC-046)
- [ ] 1.12 Retention sweep with injected clock: delete unordered drawings after 24 h, order photos 30 days after shipped/cancelled, orphan files and expired sessions, file before row (AC-011, AC-012, SR-022)
- [ ] 1.13 Log-capture test of a full flow proving no personal data, passwords, tokens or session IDs in logs (AC-023, SR-018)
- [ ] 1.14 Dockerfile (multi-stage, pinned base, non-root, `.dockerignore`, runs migrations on start, `TRUST_PROXY` for the nginx hop) and `apps/api/README.md` (SR-017, SR-021)

## 2. Conversion worker (apps/worker) - backend-engineer

- [ ] 2.1 Scaffold the uv + FastAPI service with quality gates (Ruff lint and format, mypy, pytest), environment validation (token >= 32 chars, placeholder refused), `GET /health`, constant-time bearer-token check, docs routes disabled, no personal data in logs, `.env.example` (SR-005, SR-018, SR-020)
- [ ] 2.2 Decoding and checks through Pillow only (JPEG, PNG, HEIF), pixel limit before decoding, no OpenCV decoders on raw bytes, EXIF orientation, metadata dropped, shortest side at least 800 px (AC-001, AC-004, SR-003)
- [ ] 2.3 Line extraction: contrast equalisation, smoothing, edges plus tone contours traced to polylines, simplified, short strokes dropped, near ends joined, nearest-neighbour stroke order (AC-005)
- [ ] 2.4 Fit to the drawing area and write the SVG: mm units, viewBox, one black unfilled path per stroke, nothing else (AC-005)
- [ ] 2.5 Budget loop that coarsens until within max strokes and max total length, with an iteration cap and a final guarantee (AC-006)
- [ ] 2.6 `POST /v1/convert` with error codes `photo_too_small`, `photo_too_many_pixels`, `photo_unreadable`, `no_drawable_content`, `validation_failed`, and at most 2 concurrent conversions with 503 `busy` (AC-004, AC-007, AC-008, AC-051, AC-053, AC-054, SR-003, SR-004)
- [ ] 2.7 Performance test: a photo at the upload limits converts within the time limit on one CPU (AC-007)
- [ ] 2.8 Dockerfile (pinned base, non-root, read-only friendly, `.dockerignore`) and `apps/worker/README.md` (SR-005, SR-021)

## 3. Web (apps/web) - web-engineer

- [ ] 3.1 Scaffold the Vite + React + TypeScript app with quality gates, router, design tokens from `docs/ux/tokens.css`, flat message catalogue from `docs/ux/content.md`, typed API client with types generated by `openapi-typescript` from `docs/api/openapi.yaml` (`generate:api`) (CSRF header on unsafe admin calls), dev proxy for `/api`, ESLint `react/no-danger` as error, shop and admin layouts with landmarks, skip link and focus management (SR-007, SR-016, UX-001, UX-002, UX-003, UX-012, UX-013, UX-014, UX-015, UX-016)
- [ ] 3.2 Customer upload step with native file chooser, client-side checks, progress live region, reduced motion and every photo error (UX-008, UX-010, UX-025, UX-026, UX-028, UX-029; AC-001, AC-002, AC-003, AC-004, AC-007, AC-008, AC-051, AC-054, AC-057)
- [ ] 3.3 Preview step showing the drawing as a data-URL image with alt text and pinch zoom, with "try another photo" (SR-007, UX-009, UX-030; AC-005, AC-009, AC-056)
- [ ] 3.4 Frame step as a native radio group listing in-stock frames with photo, size and price, step indicator (UX-017, UX-018; AC-013)
- [ ] 3.5 Details step: name, email, address (NL/BE), photo terms, withdrawal notice, error summary and per-field errors, autocomplete (UX-005, UX-006, UX-007, UX-022; AC-014, AC-015, AC-016, AC-017)
- [ ] 3.6 Place order and confirmation with order number and estimated delivery date; frame sold out, expired preview, rate-limited and lost-response retry paths without losing input (UX-026; AC-018, AC-020, AC-022, AC-058, AC-060)
- [ ] 3.7 Admin login with `?next=` (same-origin `/admin/` only), route guard, redirect to login with `?next=` when the session ends, logout, login rate-limit message (UX-007, UX-023; AC-024, AC-025, AC-026, AC-028, AC-061)
- [ ] 3.8 Admin orders list (table, `?status=` filter defaulting to open, delivery date) and order detail with drawing view, SVG download for the arm, status actions with confirmations and delivery date change, keyboard-only day flow photo-deleted state (UX-011, UX-019, UX-020, UX-021, UX-024, UX-027, UX-032; AC-012, AC-029, AC-030, AC-031, AC-032, AC-033, AC-034, AC-035, AC-036, AC-037, AC-038)
- [ ] 3.9 Admin frames list, create, edit, photo and stock adjustment (UX-031; AC-039, AC-040, AC-041, AC-042, AC-043, AC-044)
- [ ] 3.10 Admin settings: standard lead time (AC-045, AC-046)
- [ ] 3.11 Dockerfile (build + unprivileged nginx serving the SPA and proxying `/api`, body size limits, `X-Forwarded-For` overwritten, security headers, JSON body for nginx's own 413) and `apps/web/README.md` (SR-001, SR-017, SR-019, SR-021; AC-065)
- [ ] 3.12 Automated accessibility checks (axe) on every screen and the 44 px / 24 px target sizes (UX-004, UX-012)

## 4. Integration (lead)

- [ ] 4.1 `docker-compose.yml` (db, worker, api, web) with internal networks, only web published, resource limits, read-only worker, dropped capabilities, and root `.env.example` with failing placeholders (SR-004, SR-005, SR-015, SR-020, SR-021)
- [ ] 4.2 `.github/workflows/ci.yml` with a job per part, the `specs` job, dependency audit, secret scan, compose config check, contrast check and read-only permissions; Dependabot config (SR-020, SR-021)
- [ ] 4.3 Root `README.md` and `CLAUDE.md`
- [ ] 4.4 Automated end-to-end smoke script `scripts/smoke.mjs` run against all parts together (locally and in a CI `compose-smoke` job): upload a photo, order, log in, download for the arm, check security headers (AC-001, AC-005, AC-007, AC-018, AC-031, AC-065); `docker-compose.dev.yml` publishing the database on 127.0.0.1
- [ ] 4.5 Verify from a clean clone and archive the change
