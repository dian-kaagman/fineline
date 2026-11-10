## 1. API (apps/api) - backend-engineer

- [ ] 1.1 Scaffold the Fastify + TypeScript service with quality gates (`lint`, `format`, `typecheck`, `test`, `build`, `dev`, `start`), environment validation at startup, `GET /api/v1/health`, the common error shape and `.env.example`
- [ ] 1.2 Data model and SQL migrations: drawings, frames, orders, order_number_counters, settings (lead time default 7), admin_sessions; `db:migrate` script
- [ ] 1.3 `FileStorage` interface with a local-disk implementation under `STORAGE_DIR`, opaque generated keys
- [ ] 1.4 Domain logic as pure functions with unit tests: working-day delivery date in Europe/Amsterdam (AC-018, AC-047, AC-048, AC-049), order number format and per-year counting (AC-019), status state machine (AC-033, AC-034, AC-036), SVG drawing validator for BR-002/BR-004 (AC-005, AC-006)
- [ ] 1.5 `POST /api/v1/drawings`: size and magic-byte type check, worker client with timeout and error mapping, storage, preview token (hash stored), 24 h expiry (AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008, AC-009, AC-010)
- [ ] 1.6 `GET /api/v1/frames` (stock > 0 only) and `GET /api/v1/frames/{id}/photo` (AC-013)
- [ ] 1.7 `POST /api/v1/orders`: validation per field, NL/BE only, photo terms, preview token check, atomic stock decrement, order number, estimated delivery date, price copied from frame, no personal data in logs (AC-014, AC-015, AC-016, AC-018, AC-019, AC-020, AC-021, AC-022, AC-023)
- [ ] 1.8 Admin authentication: login/logout/session endpoints, server-side sessions, auth hook on every `/api/v1/admin/*` route, CSRF header check, password-hash script (AC-024, AC-025, AC-026, AC-027, AC-028)
- [ ] 1.9 Admin orders: list with status filter and sort, detail with allowed next statuses, SVG download (received -> drawing), original photo, status changes with stock return on cancel, delivery date change (AC-027, AC-029, AC-030, AC-031, AC-032, AC-033, AC-034, AC-035, AC-036, AC-037, AC-038)
- [ ] 1.10 Admin frames: list, get, create with photo, edit, replace photo, stock adjustments (AC-039, AC-040, AC-041, AC-042, AC-043, AC-044)
- [ ] 1.11 Admin settings: get and set the standard lead time (AC-045, AC-046)
- [ ] 1.12 Retention sweep with injected clock: delete unordered drawings after 24 h, order photos 30 days after shipped/cancelled (AC-011, AC-012)
- [ ] 1.13 Dockerfile (multi-stage, non-root, runs migrations on start) and `apps/api/README.md`

## 2. Conversion worker (apps/worker) - backend-engineer

- [ ] 2.1 Scaffold the uv + FastAPI service with quality gates (Ruff lint and format, mypy, pytest), environment validation, `GET /health`, bearer-token check, `.env.example`
- [ ] 2.2 Decoding and checks: JPEG, PNG and HEIC, EXIF orientation, metadata stripped, shortest side at least 800 px (AC-001, AC-004)
- [ ] 2.3 Line extraction: contrast equalisation, smoothing, edges plus tone contours traced to polylines, simplified, short strokes dropped, near ends joined, nearest-neighbour stroke order (AC-005)
- [ ] 2.4 Fit to the drawing area and write the SVG: mm units, viewBox, one black unfilled path per stroke, nothing else (AC-005)
- [ ] 2.5 Budget loop that coarsens until within max strokes and max total length, with a final guarantee (AC-006)
- [ ] 2.6 `POST /v1/convert` with error codes `photo_too_small`, `photo_unreadable`, `no_drawable_content`, `validation_failed` (AC-004, AC-007, AC-008)
- [ ] 2.7 Performance test: a photo at the upload limits converts within the time limit on one CPU (AC-007)
- [ ] 2.8 Dockerfile (non-root) and `apps/worker/README.md`

## 3. Web (apps/web) - web-engineer

- [ ] 3.1 Scaffold the Vite + React + TypeScript app with quality gates, router, design tokens from `docs/ux/tokens.css`, typed API client for `docs/api/openapi.yaml`, dev proxy for `/api`
- [ ] 3.2 Customer upload step with client-side checks, progress state and every photo error (AC-001, AC-002, AC-003, AC-004, AC-007, AC-008)
- [ ] 3.3 Preview step showing the drawing as an image, with "try another photo" (AC-005, AC-009)
- [ ] 3.4 Frame step listing in-stock frames with photo, size and price (AC-013)
- [ ] 3.5 Details step: name, email, address (NL/BE), photo terms, withdrawal notice, per-field errors (AC-014, AC-015, AC-016, AC-017)
- [ ] 3.6 Place order and confirmation with order number and estimated delivery date; frame sold out and expired preview paths (AC-018, AC-020, AC-022)
- [ ] 3.7 Admin login, route guard and logout (AC-024, AC-025, AC-026, AC-028)
- [ ] 3.8 Admin orders list (status filter, delivery date) and order detail with SVG download, status actions and delivery date change (AC-029, AC-030, AC-031, AC-032, AC-033, AC-034, AC-035, AC-036, AC-037, AC-038)
- [ ] 3.9 Admin frames list, create, edit, photo and stock adjustment (AC-039, AC-040, AC-041, AC-042, AC-043, AC-044)
- [ ] 3.10 Admin settings: standard lead time (AC-045, AC-046)
- [ ] 3.11 Dockerfile (build + nginx serving the SPA and proxying `/api`) and `apps/web/README.md`

## 4. Integration (lead)

- [ ] 4.1 `docker-compose.yml` (db, worker, api, web) and root `.env.example`
- [ ] 4.2 `.github/workflows/ci.yml` with a job per part and the `specs` job
- [ ] 4.3 Root `README.md` and `CLAUDE.md`
- [ ] 4.4 End-to-end smoke test of all parts running together: upload a photo, order, handle the order in the admin tool
- [ ] 4.5 Verify from a clean clone and archive the change
