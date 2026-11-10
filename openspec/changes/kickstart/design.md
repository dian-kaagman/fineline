## Context

Fineline is a one-person studio: a customer uploads a photo, the site turns it into a pen-plottable SVG line drawing, the customer orders it framed, and the owner draws it with a Rotrics arm, frames it and ships it. This change is the first vertical slice (see `proposal.md`). Business rules live in `docs/domain/` (BR-001..BR-011), acceptance criteria in this change's `specs/`, security requirements in `docs/security/threat-model.md` (SR-xxx), UX requirements in `docs/ux/` (UX-xxx).

The riskiest part is the photo-to-drawing conversion: it must give a recognisable portrait as black pen strokes, stay inside the drawing area and the stroke budget, and answer in seconds on a small server, without any third-party image service.

## Goals / Non-Goals

**Goals**

- The whole customer path works end to end: upload photo -> preview the real generated SVG -> pick an in-stock frame -> enter details and agree to the photo terms -> order number and estimated delivery date.
- The whole admin path works: log in -> order list -> order detail -> download SVG (moves to "drawing") -> move through statuses -> change delivery date; frames with stock; lead time.
- Every scenario in `specs/` has an automated test naming its AC ID.
- Runs locally with `docker compose up`; each part also runs on its own for development.

**Non-Goals** (deliberately left out of this slice)

- Online payment, customer emails, customer accounts, discount codes, multiple admins, direct robot-arm control (brief: out of scope).
- Customer adjustments of the drawing (detail level, crop): the customer can discard the preview and try another photo (ADR 0004).
- Editing the drawing area or stroke budget in the admin UI: they are deployment configuration for now (BR-003 says the admin can change it; deferred, see open questions).
- Public holidays in the delivery date (ADR 0005).
- Cloud file storage and a production hosting target: storage is behind an interface with a local-disk implementation (ADR 0006).
- Customer-data deletion on request (GDPR): done manually by the owner until a later change adds a tool.

## Decisions

### Parts and layout

Three parts in one repository, each standalone with its own lockfile and quality gates (no workspaces, so builders and CI jobs work on parts independently):

```
apps/api      TypeScript HTTP API (public + admin), PostgreSQL, file storage, retention sweep
apps/worker   Python conversion worker: photo -> SVG drawing (internal HTTP, stateless)
apps/web      TypeScript web app: customer shop (mobile-first) and admin tool (laptop)
docs/         brief, domain, ux, security, api contracts, decisions (ADRs)
openspec/     specs and changes
docker-compose.yml   db + worker + api + web for local running
```

Builders: backend-engineer for `apps/api`, a second backend-engineer for `apps/worker`, web-engineer for `apps/web`. No mobile app (brief: web only).

### Stack

| Part | Choice | Why |
|---|---|---|
| api | Node 22 LTS, TypeScript strict, Fastify 5, Zod for every boundary, Drizzle ORM + drizzle-kit SQL migrations, `pg`, Vitest | Brief requires TypeScript. Fastify: fast, schema-first, first-class multipart and cookies. Drizzle: typed SQL with plain migration files and transactions with row locks for stock. |
| api auth | Single admin from env (`ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` as scrypt hash), server-side sessions in PostgreSQL, opaque random session ID in an HttpOnly SameSite=Strict cookie | One admin (BR-011, brief); server-side sessions can be revoked on logout; scrypt is in Node's standard library (no native dependency). ADR 0003. |
| worker | Python 3.12, FastAPI + Uvicorn, OpenCV (headless), NumPy, Pillow + pillow-heif, uv, Ruff, mypy, pytest | OpenCV gives far better edge/contour extraction, smoothing and simplification than anything available in TypeScript; HEIC decoding (BR-001) is mature in pillow-heif. ADR 0002. |
| web | React 19 + Vite, TypeScript strict, React Router, plain CSS with design tokens from `docs/ux/`, Vitest + Testing Library | Small SPA; no SSR needed (no SEO-critical content in the slice). Served by nginx in Docker, which also proxies `/api` to the API so web and API share one origin. |
| db | PostgreSQL 16 | Brief. |
| storage | `FileStorage` interface (`put`, `get`, `delete`, keyed by opaque generated keys) with a local-disk implementation under `STORAGE_DIR` | Brief: files on local disk in development, swappable for cloud storage later. ADR 0006. |

### Contracts

- **Public + admin API:** `docs/api/openapi.yaml` (OpenAPI 3.1) is the contract between `apps/web` and `apps/api`. Base path `/api/v1`; UUID IDs; money as integer euro cents incl. VAT (`priceCents`); calendar dates `YYYY-MM-DD` in Europe/Amsterdam; timestamps ISO 8601 UTC; millimetres (`...Mm`); one error shape `{ error: { code, message, details? } }` with stable codes listed per operation; admin calls need the `fineline_admin` cookie and, for unsafe methods, `X-Requested-With: fineline`.
- **Worker:** `docs/api/worker-openapi.yaml` is the contract between `apps/api` and `apps/worker`: `POST /v1/convert` (multipart photo + drawing area + budget, bearer `WORKER_TOKEN`) returns the SVG and its metrics, or `photo_too_small` / `photo_unreadable` / `no_drawable_content`. The API passes the drawing area and budget from its own configuration, so one place owns those values. The API maps worker errors to the public codes (`photo_too_small`, `photo_unreadable`, `photo_no_drawable_content`, `conversion_unavailable`).

### Customer flow (one page with steps, mobile-first)

1. `POST /api/v1/drawings` with the photo. Rate limit first (SR-017), then the API streams the single file part with a hard 15 MiB limit (413 as soon as it is crossed, SR-001), checks the type by magic bytes (JPEG, PNG, HEIC; client name and content type ignored, SR-002), calls the worker (at most 2 calls in flight, else 503 `conversion_unavailable` with `Retry-After`; timeout `WORKER_TIMEOUT_MS`, default 30 s; SR-004), validates the returned SVG (see below), and only then stores photo and SVG (nothing is stored for a rejected upload, SR-015), and answers with the SVG markup, metrics, `drawingId`, a random `previewToken` (only its SHA-256 hash is stored) and `expiresAt` (24 h). Conversion is synchronous; the web app shows a progress state with a cancel/try-again path while it waits.
2. The preview is shown as an `<img>` with a `data:image/svg+xml` URL built from the returned markup (never inlined into the DOM, SR-007). There is no public GET for drawings, so a customer's drawing is reachable only from the response to their own upload. The web app keeps the customer's draft (drawing ID, preview token, SVG, expiry, chosen frame, typed details; never the photo) in `sessionStorage` so a phone reload doesn't lose it (UX proposal P-2; allowed by SR-009, which forbids only URLs and `localStorage`), and clears it after the order is confirmed except for the confirmation itself.
3. `GET /api/v1/frames` lists frames with stock > 0 (no stock counts exposed).
4. `POST /api/v1/orders` with `drawingId`, `previewToken`, `frameId`, customer and address, `acceptedPhotoTerms: true` (strict schema: unknown fields such as `priceCents` are rejected, SR-016; 5 orders per hour per address, SR-017). In one transaction: check that the drawing exists, the token matches (constant-time) and it is not expired - every failure is the same 404 `drawing_not_found` (SR-009); if the drawing was already ordered, return the original confirmation with 200 and change nothing (a retry after a lost response, UX gap G-6); `UPDATE frames SET stock = stock - 1 WHERE id = $1 AND stock > 0` (no row -> 409 `frame_sold_out`, BR-006); take the next order number for the Amsterdam year from a per-year counter row (`INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, BR-007); compute the estimated delivery date from the current lead time (BR-008); insert the order with status `received` referencing the drawing (BR-005).

### Drawing validation in the API (defence in depth for BR-002/BR-004)

The API never stores or serves a worker result it has not checked (SR-006): a pure function runs on the exact bytes to be stored, rejects any DOCTYPE, entity, comment or CDATA, allows only `svg`/`g`/`path` elements with an attribute allowlist (`fill="none"`, black stroke, `stroke-width`, linecap/linejoin, `d`, and on the root `xmlns`, `width`/`height` in mm, `viewBox`, `version`), parses `d` with a strict numeric path grammar, and recomputes stroke count, total length and bounds itself (the worker's metrics are not trusted) against the configured area and budget. A failing check is logged (without personal data) and answered as `conversion_unavailable`.

### Conversion approach (worker, ADR 0002)

Edge-and-contour line art, tuned for faces:

1. Decode only through Pillow restricted to JPEG, PNG and HEIF (pillow-heif plugin); check the pixel count (<= 50 MP, BR-001) right after opening and before decoding; never hand raw bytes to OpenCV's decoders (SR-003). Apply EXIF orientation, check the shortest side (>= 800 px, BR-001), drop all metadata, downscale to a working size (longest side about 1000 px). At most 2 conversions run at a time; a third gets 503 `busy` quickly (SR-004).
2. Grayscale, local contrast equalisation (CLAHE), edge-preserving smoothing (bilateral filter).
3. Lines from two sources: Canny edges with thresholds derived from the image median (outlines and features) plus a few iso-luminance contour levels of a strongly blurred image (shading of hair and shadows, as contour lines rather than fills).
4. Trace to polylines, simplify (Ramer-Douglas-Peucker), drop very short strokes, join strokes whose ends are within a small distance, then order strokes by greedy nearest-neighbour so pen-up travel is short.
5. Scale uniformly to fit and centre in the drawing area (default 180 x 267 mm, BR-003); write one `<path fill="none" stroke="#000" stroke-width="0.5" stroke-linecap="round" stroke-linejoin="round">` per stroke, `width`/`height` in mm and a `viewBox` in mm.
6. Budget loop (BR-004): while over the stroke count or total length, coarsen (higher edge thresholds, fewer contour levels, larger minimum stroke length, stronger simplification) and retry; as a final guarantee drop the shortest strokes until within budget. It never returns a drawing over budget. The output is deterministic for the same input.

### Admin

- Login with username + password (scrypt `N=2^17`, `$`-free hash format, constant-time compare, SR-010; 5 failures per address per 15 min then 429, checked before hashing, SR-011) -> new server-side session (8 h idle and 24 h absolute expiry, SR-012) -> cookie `fineline_admin` (HttpOnly, SameSite=Strict, Path=/api/v1/admin, Secure unless `COOKIE_SECURE=false`). Every `/api/v1/admin/*` route except login is behind one `onRequest` authentication hook in one encapsulated plugin (BR-011, SR-014), and every unsafe admin request, login included, needs `X-Requested-With: fineline` (SR-013). The web app's `/admin/*` routes redirect to `/admin/login?next=...` (same-origin `/admin/` paths only) without a session, but the API is the real gate.
- Status transitions are a pure state machine in the domain layer (BR-009). `POST .../drawing-download` returns the SVG and moves a `received` order to `drawing`; `GET .../drawing.svg` only shows it (the order detail page fetches it and shows it as an image), so opening an order never changes its status (security note N-1, UX gap G-1). Cancelling returns one to stock in the same transaction (BR-006).
- The order list shows open orders (all but shipped and cancelled) by default, filterable by one status or all, sorted by estimated delivery date; the filter lives in the URL (`?status=`). Orders expose their order date (UX gaps G-2, G-3).
- Lead time lives in a single-row `settings` table (default 7, BR-008). New orders copy the computed date; changing the lead time never touches existing orders. A single order's date can be changed while it is not shipped or cancelled, not before its order date.
- Frames: create (multipart with photo), edit name/size/price, replace photo, adjust stock by a signed delta that may not go below zero (atomic update). Frame inner size must be at least the drawing area (BR-006, BR-003).

### Data model (API)

- `drawings` (id, preview_token_hash, photo_key, photo_content_type, svg_key, width_mm, height_mm, stroke_count, total_length_mm, created_at, expires_at, photo_deleted_at)
- `frames` (id, name, width_mm, height_mm, price_cents, stock CHECK >= 0, photo_key, photo_content_type, created_at, updated_at)
- `orders` (id, order_number UNIQUE, drawing_id UNIQUE, frame_id, status, customer_name, customer_email, street, house_number, postal_code, city, country, price_cents, order_date, estimated_delivery_date, status_changed_at, closed_at, created_at)
- `order_number_counters` (year PK, last_value)
- `settings` (single row: lead_time_working_days)
- `admin_sessions` (id_hash PK, created_at, last_seen_at, expires_at)

### Retention (BR-010)

An in-process sweep in the API runs every `RETENTION_SWEEP_INTERVAL_MS` (default 1 h) and at startup: deletes drawings (row, photo and SVG files) that were never ordered and are past `expires_at` (24 h); deletes the original photo file of orders shipped or cancelled more than 30 days ago (`photo_deleted_at` set, drawing kept); deletes orphan files older than 24 h and expired admin sessions (SR-022). Files are deleted before rows are updated, so a failure is retried on the next run. Testable as a function with an injected clock. The customer's original photo is stored as uploaded (admin-only, deleted as above); stripping its metadata is an open question. Frame photos are public, so their metadata (EXIF/GPS) is stripped before storing (SR-023).

### Security baseline

`docs/security/threat-model.md` is binding for the builders (SR-001..SR-023). Highlights not covered above: storage keys are server-generated, pattern-checked and confined to `STORAGE_DIR` with atomic 0600 writes (SR-015); one error handler with generic 5xx bodies and pino redaction, no personal data, tokens or `pg` details in logs (SR-018); nginx sends CSP (`img-src 'self' data: blob:`, `frame-ancestors 'none'`), nosniff, `Referrer-Policy: no-referrer` and `Permissions-Policy`; the API sends `no-store` on admin and order responses and nosniff + sandbox CSP on file routes (SR-007, SR-019); nginx overwrites `X-Forwarded-For` with `$remote_addr` and the API trusts exactly that one hop for rate limits (SR-017); secrets are validated at startup and `.env.example` placeholders fail validation (SR-020). Deferred items (CAPTCHA, admin MFA/IP allowlist, erasure script before first deploy) are listed in the threat model.

### Dates and time

Timestamps stored in UTC. The order date is the calendar date in Europe/Amsterdam at placement. The working-day calculation (Mon-Fri, holidays not skipped, ADR 0005) is a pure function with an injected "today", unit-tested with the BR-008 example.

### Configuration

Each part validates its environment at startup and fails fast naming the variable. API: `DATABASE_URL`, `PORT`, `STORAGE_DIR`, `WORKER_URL`, `WORKER_TOKEN`, `WORKER_TIMEOUT_MS`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_TTL_HOURS`, `COOKIE_SECURE`, `CORS_ORIGIN` (only for a split-origin dev setup), `DRAWING_AREA_WIDTH_MM`, `DRAWING_AREA_HEIGHT_MM`, `MAX_STROKES`, `MAX_TOTAL_STROKE_LENGTH_MM`, `RETENTION_SWEEP_INTERVAL_MS`, `LOG_LEVEL`. Worker: `WORKER_TOKEN`, `PORT`, `LOG_LEVEL`. Web: `VITE_CONTACT_EMAIL` at build time (the shop's contact address shown in the footer and some errors, UX gap G-7; not a secret); the dev server proxies `/api` to `API_PROXY_TARGET`. API also: `TRUST_PROXY` (off when run directly, `1` behind nginx), `MAX_CONCURRENT_CONVERSIONS`. Worker also: `MAX_CONCURRENT_CONVERSIONS`. Root `.env.example` documents all of them; each part also has its own `.env.example`.

### Local running

`docker-compose.yml`: `db` (postgres:16, volume, no published port), `worker` (no published port, read-only, no volumes, memory/CPU/pids limits), `api` (runs migrations on start, storage volume mounted only here), `web` (unprivileged nginx serving the built SPA on port 8080 and proxying `/api` to `api`). Networks: `edge` (web), `frontend` (internal: web, api), `backend` (internal: api, worker, db), so neither API nor worker can reach the internet (BR-016, SR-005, SR-021). All services drop capabilities and run as non-root. For development each part runs natively (`npm run dev`, `uv run ...`) against a local or compose PostgreSQL.

### Testing

- api: Vitest unit tests for the domain (state machine, working days, order number format, SVG validator, retention selection) and HTTP tests through Fastify `inject` against a real PostgreSQL test database (`DATABASE_URL` from env; CI uses a `postgres:16` service), with the worker replaced by a stub HTTP server. A concurrency test places two orders for the last frame in parallel.
- worker: pytest unit tests of the pipeline (budget, bounds, only allowed SVG elements, too-small photo, HEIC decoding) using generated test images (no real faces committed), and HTTP tests through FastAPI's test client.
- web: Vitest + Testing Library component and page tests with the API mocked at the fetch boundary, covering every screen state from `docs/ux/`, plus axe checks (vitest-axe) on each screen for the UX- requirements that can be automated.
- Integration: the lead runs all parts together (worker, API, web against local PostgreSQL) and walks the customer and admin flows with a real photo (task 4.4).
- Every test that covers a scenario names its AC ID.

## Risks / Trade-offs

- **Drawing quality on real portraits** is unproven until the owner tries real photos on the arm -> parameters are constants in one module, and test fixtures exercise the budget; the owner should tune with real photos (next step).
- **Synchronous conversion** holds an HTTP request for seconds -> acceptable at a handful of orders a day; rate limiting on uploads; a job queue is a later change if load grows.
- **No holidays in delivery dates** may promise a date too early around Christmas -> the admin lengthens the lead time (the process already says "longer in December") or changes single orders.
- **In-process retention sweep** runs only while the API runs -> fine for a single instance; move to a scheduled job when hosting is decided.

## Open Questions

Tracked in `docs/domain/open-questions.md`. None blocks the slice; each has a default recorded there or in an ADR.
