# Threat model

**Scope:** the kickstart slice: `apps/web` (customer shop and admin tool, served by nginx), `apps/api` (public and admin API, PostgreSQL, file storage, retention sweep), `apps/worker` (photo-to-SVG conversion), `docker-compose.yml`, CI. No payment, no customer accounts, one admin.
**Data classification:** personal data under GDPR: customer photos (faces, sometimes children), drawings made from them (a portrait can identify a person), names, emails, NL/BE addresses, client IP addresses. Business data whose integrity matters: order statuses, stock, prices, delivery dates. Public: the frame catalogue.
**Sources:** `docs/brief.md`, `openspec/changes/kickstart/` (proposal, design, specs, tasks), `docs/api/openapi.yaml`, `docs/api/worker-openapi.yaml`, `docs/domain/` (BR-001 to BR-017, Q-1 to Q-32), the domain pack (`constraints.md`), ADR 0002, 0003, 0006, 0007.

**Scale:** one owner, a handful of orders a day, peaks around Christmas. The controls below are sized for that: a short list of strong defaults that the whole codebase copies, not enterprise machinery.

## Assets

| Asset | Why it matters | Source |
|---|---|---|
| Customer photos | Personal data, often faces and children; the most sensitive thing we hold. Leaking one is a GDPR breach and a reputational hit for a one-person shop | [pack: constraints.md#Legal and compliance], BR-010 |
| Drawings (SVG) | A portrait drawing can identify the person; kept indefinitely for orders (Q-25). Also *executable-ish content*: it is shown in the customer's browser, served on the admin origin and opened in the Rotrics desktop software on the owner's laptop | BR-002, BR-005, BR-010 |
| Customer name, email, address | Personal data, GDPR | BR-007, BR-014 |
| Client IP addresses | Personal data under GDPR; appear in logs and in the rate limiter | [pack: constraints.md] |
| Preview tokens | Bearer secret for a fresh photo and its preview; whoever holds it can order the drawing | BR-013 |
| Admin password hash and session cookie | Full access to every order, photo and address | BR-011, ADR 0003 |
| `WORKER_TOKEN`, `DATABASE_URL` credentials | Access to the worker and to all data | design: Configuration |
| Order integrity: status, stock, price, delivery date | Wrong status or stock means wrong shipments and overselling | BR-006, BR-009, BR-012 |
| Availability: worker CPU/RAM, API, disk | A conversion costs seconds of CPU and up to hundreds of MB of RAM; uploads are up to 15 MB each and kept 24 h | BR-001, BR-004, BR-010 |
| The owner's laptop | Consumes every downloaded SVG and photo | brief |

## Actors

- **Customer** (honest, anonymous, on a phone). No account; every public endpoint is reachable by anyone.
- **Hostile anonymous user / bot.** Uploads crafted files (decompression bombs, polyglots, parser exploits in HEIC/PNG/JPEG decoders), scripts uploads to burn CPU and disk, places fake orders to drain stock, brute-forces the admin login.
- **Curious third party** trying to see or order someone else's preview (needs the drawing ID and token, which only exist in the uploader's browser).
- **Malicious website** visited by the admin while logged in (CSRF, clickjacking).
- **Compromised worker.** If a crafted image gets code execution in libheif/libde265/libpng/libjpeg, the attacker runs inside the worker container. The design must make that a dead end.
- **Compromised dependency, base image or CI action** (npm, PyPI, Docker Hub, GitHub Actions).
- **Admin** (trusted, but may pick a weak password or run the laptop with an outdated browser).
- **Hosting operator** (later; hosting is undecided).

## Trust boundaries

```
 Internet (customer phone, admin laptop, attackers)
   |  HTTPS (TLS terminated by the host - undecided; HTTP on localhost)
   v
 [B1] web: nginx :8080  -- serves SPA, proxies /api/ only --+
                                                            v
 [B2] api: Fastify :3000 (not published) --(bearer)--> [B3] worker :8000 (not published, no egress)
   |                   \
   v                    v
 [B4] db: PostgreSQL     [B5] storage volume (STORAGE_DIR, mounted in api only)

 [B6] admin laptop: downloaded SVG/photo -> browser / Rotrics software
 [B7] supply chain: GitHub Actions, npm, PyPI, Docker Hub -> images
```

## Entry points

| Entry point | Part | Authenticated? | Notes |
|---|---|---|---|
| `GET /`, `/admin/*` (SPA assets) | web | no | Static; admin routes redirect to login, the API is the real gate |
| `POST /api/v1/drawings` | api -> worker | no | Multipart up to 15 MB, untrusted image, expensive (CPU, RAM, disk); returns SVG + preview token |
| `GET /api/v1/frames`, `GET /api/v1/frames/{id}/photo` | api | no | Public catalogue; the frame photo is a file served on our origin |
| `POST /api/v1/orders` | api | preview token | PII in; takes stock; spam orders drain stock |
| `GET /api/v1/health` | api | no | Must not leak internals |
| `POST /api/v1/admin/session` | api | no | Login; brute force target; CPU cost (scrypt) |
| `/api/v1/admin/*` (orders, frames, settings, session) | api | admin cookie (+ CSRF header on unsafe methods) | All PII and all state changes |
| `GET /api/v1/admin/orders/{id}/drawing.svg`, `/photo` | api | admin cookie | Files out on the admin origin; side-effect free. The status change is `POST .../drawing-download` (note N-1) |
| `POST /api/v1/admin/frames`, `PUT .../frames/{id}/photo` | api | admin cookie + CSRF header | Files in (JPEG/PNG/WebP, 5 MB); frame photo later served publicly |
| `POST /v1/convert`, `GET /health` | worker | bearer `WORKER_TOKEN` (convert) | Internal network only; parses untrusted images |
| PostgreSQL :5432 | db | password | Internal only |
| `STORAGE_DIR` | api | filesystem | Photos, drawings, frame photos |
| Environment / `.env` | all | deploy | Secrets |
| `.github/workflows/*`, lockfiles, Dockerfiles | CI | repo write | Supply chain |

## Threats

Only those that apply. Likelihood x impact: H/M/L.

| # | STRIDE | Threat | Boundary / entry point | L x I | Mitigation |
|---|---|---|---|---|---|
| T1 | DoS | Oversized or never-ending upload fills memory or disk before the 15 MB check runs | B1/B2 `POST /drawings`, admin frame uploads | H x M | SR-001 |
| T2 | Spoofing / Tampering | Non-image or polyglot file (HTML, SVG, PDF renamed `.jpg`, JPEG+HTML polyglot) is stored and later rendered as active content on our origin | B2 uploads, file routes | M x H | SR-002, SR-008 |
| T3 | DoS | Decompression bomb: a small PNG/JPEG/HEIC declaring 30,000 x 30,000 px exhausts worker RAM | B3 | H x M | SR-003, SR-004 |
| T4 | Elevation | Memory-corruption exploit in an image parser (libheif/libde265 have a steady CVE history; OpenCV's `imdecode` pulls in TIFF/JPEG2000/EXR decoders) gives code execution in the worker | B3 | M x H | SR-003, SR-005, SR-021 |
| T5 | DoS | Scripted uploads burn CPU (seconds each), RAM, and disk (15 MB kept 24 h each); many concurrent conversions OOM the worker | B2/B3 `POST /drawings` | H x M | SR-004, SR-017 |
| T6 | Tampering / Elevation | Malicious SVG (from a compromised or buggy worker): `<script>`, event handlers, `<foreignObject>`, external `href`, `<!DOCTYPE>` entities (XXE, billion laughs) runs in the admin origin when opened, or exploits the Rotrics software's SVG parser on the owner's laptop | B2 -> B6 | L x H | SR-006, SR-007 |
| T7 | Info disclosure | Someone retrieves or orders another customer's preview by guessing or reusing IDs, or learns whether a drawing exists/was ordered from different error codes | `POST /orders` | L x H | SR-009 |
| T8 | Info disclosure | Preview token leaks via URL, logs, browser history, `Referer` or caches | web, api logs | M x M | SR-009, SR-016, SR-018 |
| T9 | Spoofing | Admin password brute-forced or credential-stuffed over the internet | `POST /admin/session` | H x H | SR-010, SR-011 |
| T10 | Spoofing | Session fixation, stolen or long-lived session cookie, cookie sent over HTTP | admin cookie | M x H | SR-012 |
| T11 | Tampering | CSRF from a site the admin visits: change statuses, adjust stock, create frames (multipart forms are "simple" cross-site requests), trigger the status-changing SVG download (`POST .../drawing-download`) | admin unsafe routes | M x M | SR-013, note N-1 |
| T12 | Elevation | A new admin route (or a file route) added later without the auth check: IDOR on orders, photos, addresses | `/api/v1/admin/*` | M x H | SR-014 |
| T13 | Tampering / Info disclosure | Path traversal or arbitrary file read/write via storage keys or file names; storage directory served statically | B5 | L x H | SR-015 |
| T14 | Tampering | Client sets price, status, stock or unknown fields (mass assignment); SQL injection | all bodies | M x H | SR-016 |
| T15 | Info disclosure | PII, passwords, tokens or SQL details in logs and error responses (Fastify's default handler returns `error.message` for 500s; `pg` errors carry row values in `detail`) | api, worker logs | H x M | SR-018 |
| T16 | Elevation | Stored XSS through customer name/address shown in the admin tool, or any script on the shared shop/admin origin, rides the admin session | web | L x H | SR-016, SR-019 |
| T17 | Tampering | Clickjacking of the admin tool | web | L x M | SR-019 |
| T18 | DoS / Tampering | Fake orders with valid previews drain stock so real customers see "sold out" | `POST /orders` | M x M | SR-017 (admin cancels to restore stock) |
| T19 | Spoofing | Rate limits bypassed with a spoofed `X-Forwarded-For`, or all clients share one bucket because the API sees only nginx's IP | B1 -> B2 | H x M | SR-017 |
| T20 | Info disclosure | Secrets committed, baked into images, left at `.env.example` placeholder values, or mangled by Compose `$` interpolation (a scrypt hash like `scrypt$...` silently breaks, tempting people to weaken it) | config | M x H | SR-020 |
| T21 | Info disclosure | Photos kept longer than BR-010 allows (orphan files after failed uploads, backups, unordered drawings), no way to erase on request | B4/B5 | M x M | SR-022 |
| T22 | Info disclosure | The owner's home location leaks through EXIF GPS in frame photos taken with a phone and served publicly | `GET /frames/{id}/photo` | M x M | SR-023 |
| T23 | Elevation | Container breakout aids, worker or API reaching the internet (also breaks BR-016), DB published on the host | compose | L x H | SR-005, SR-021 |
| T24 | Tampering | Compromised CI action or dependency; workflow token with write rights; known-vulnerable packages | B7 | M x H | SR-021 |

## Security requirements for the first slice

Priorities: **Must** = implemented and tested in the kickstart (it sets the pattern). **Before deploy** = may wait while the app only runs on localhost, but must be done before the first internet-facing deploy. **Later** = see Deferred.
Type: **Spec** = observable behaviour; the lead should add a scenario citing the SR ID (suggested scenario given). **Task** = internal control, verified by tests or review.

### Summary

| SR | Requirement (one line) | Part | Type | Priority |
|---|---|---|---|---|
| SR-001 | Upload size limits enforced while streaming, at nginx and in the API; one file part only; small JSON body limit | web, api | Spec | Must |
| SR-002 | File type decided from magic bytes against an allowlist; stored and served content type is the detected one | api | Spec | Must |
| SR-003 | Worker decodes only JPEG/PNG/HEIF through Pillow, checks pixel count before decoding, never uses OpenCV decoders on raw bytes | worker | Spec | Must |
| SR-004 | Bounded conversion concurrency and memory; busy answers fast with 503 | worker, api, compose | Task | Must |
| SR-005 | Worker isolated: no published port, no egress, no volumes, read-only, non-root, constant-time bearer check | worker, compose | Task | Must |
| SR-006 | Strict allowlist SVG validator on the exact bytes before storing; metrics recomputed by the API | api | Spec | Must |
| SR-007 | SVG shown only as a data-URL image; file responses carry nosniff, a sandbox CSP and attachment disposition | web, api | Spec | Must |
| SR-008 | Admin file responses use the stored verified content type and a server-built file name | api | Task | Must |
| SR-009 | Preview token: 256-bit random, hash stored, constant-time compare, never in URLs; one indistinguishable "not available" answer | api, web | Spec | Must |
| SR-010 | scrypt with OWASP parameters and stored salt/params, `$`-free hash format, constant-time compare, minimum password length in the hash script | api | Task | Must |
| SR-011 | Login brute-force limit: 5 failures per IP per 15 min, global ceiling, checked before hashing | api | Spec | Must |
| SR-012 | Sessions: random ID, hash stored, new on every login, idle 8 h and absolute 24 h, logout deletes; cookie HttpOnly, Secure by default, SameSite=Strict, narrow path | api | Spec | Must |
| SR-013 | CSRF: `X-Requested-With: fineline` on every unsafe admin request incl. login, logout and multipart, before body parsing; no CORS in production | api | Spec | Must |
| SR-014 | One auth gate (`onRequest`) for every admin route, before body parsing; a test enumerates all routes | api | Spec | Must |
| SR-015 | Storage keys only server-generated, validated and confined to `STORAGE_DIR`; atomic writes; nothing stored for rejected uploads | api, compose | Task | Must |
| SR-016 | Strict schema validation of every input; server-owned fields never from the client; parameterised SQL; no raw HTML in React | api, web | Task (one Spec) | Must |
| SR-017 | Rate limits on uploads and orders with a correctly derived client IP | api, web | Spec | Must |
| SR-018 | Generic 5xx errors; log redaction; no PII, tokens, passwords, file names or `pg` details in logs; security events logged | api, worker | Spec | Must |
| SR-019 | Security headers on every response (CSP, nosniff, frame-ancestors, referrer policy), no third-party content, `no-store` on sensitive responses | web, api | Spec | Must (HSTS: Before deploy) |
| SR-020 | Secrets only in env, validated; placeholders refused; no secrets in images, bundle or git; secret scanning in CI | api, worker, compose, CI | Task | Must |
| SR-021 | Container hardening, private networks, dependency audit and least-privilege CI | compose, CI, all Dockerfiles | Task | Must |
| SR-022 | Retention sweep also removes orphan files and expired sessions; erasure procedure for one customer | api | Task | Must (erasure: Before deploy) |
| SR-023 | Metadata (EXIF/XMP, GPS) stripped from frame photos before they are stored | api | Spec | Before deploy |

### Details

**SR-001 Upload size limits enforced while streaming.**
- nginx: `client_max_body_size 16m` for `POST /api/v1/drawings`, `6m` for the admin frame photo routes, `1m` (default) elsewhere; `proxy_request_buffering on` (default) so slow uploads tie up nginx, not Node.
- API: `@fastify/multipart` with `limits: { files: 1, fileSize: 15 MiB (15,728,640 B), fields: 0 for drawings (frame create: only the named fields), parts: <expected>, fieldSize: 1 KiB, headerPairs: 100 }` and `throwFileSizeLimit: true`; the request is answered 413 `photo_too_large` as soon as the limit is crossed, without buffering the rest; extra file parts are 400. Frame photos: 5 MiB. JSON `bodyLimit` 64 KiB.
- Applies to: web (nginx), api. Overlaps BR-001, AC-003.
- Spec: "AC-xxx A photo upload that streams more than 15 MB without a Content-Length is refused with `photo_too_large`, the worker is not called and nothing is stored"; "a second file part is refused".
- Verify: Fastify `inject` with a 15,728,641-byte part and with two parts -> 413/400, worker stub not called, `STORAGE_DIR` empty; smoke test `curl` of a 17 MB body through nginx -> 413.
- Priority: Must.

**SR-002 File type from magic bytes, allowlist only.**
- Customer photo: JPEG (`FF D8 FF`), PNG (`89 50 4E 47 0D 0A 1A 0A`), HEIC (ISO-BMFF `ftyp` box at offset 4 with brand `heic`, `heix`, `hevc`, `hevx`, `heim`, `heis`, `mif1` or `msf1`). Frame photo: JPEG, PNG, WebP (`RIFF....WEBP`). Everything else, including SVG, GIF, PDF, HTML, TIFF and AVIF, is 400 `photo_unsupported_type`.
- The client's `Content-Type` and file name are ignored (and never stored or logged, BR-014). The stored `photo_content_type` is the detected type; it is the only source for the `Content-Type` of file responses.
- The worker re-checks independently (SR-003): magic bytes are a gate, not a proof.
- Applies to: api. Overlaps BR-001, AC-002.
- Spec: "AC-xxx An SVG or HTML file named `photo.jpg` and sent as `image/jpeg` is refused with 'Use a JPEG, PNG or HEIC photo'".
- Verify: inject tests with an SVG, an HTML file and a PDF renamed to `.jpg`, a GIF (AC-002), and a frame photo that is an SVG -> 400, nothing stored.
- Priority: Must.

**SR-003 Safe decoding in the worker.**
- Decode only with `PIL.Image.open(fp, formats=["JPEG", "PNG", "HEIF"])` (pillow-heif registered as a Pillow plugin). Never pass the raw bytes to `cv2.imdecode`/`cv2.imread` (they enable TIFF, JPEG 2000, OpenEXR, PFM and other decoders); hand OpenCV the decoded NumPy array only.
- Check `width * height <= 50,000,000` (a 48 MP phone photo, 8064 x 6048, still passes) right after `open()` and **before** `load()`/`exif_transpose()`, and reject with `photo_too_many_pixels` (worker 400, mapped by the API to public 400 `photo_too_many_pixels`; BR-001 "at most 50 MP"). Do not rely on Pillow's default bomb check: setting `Image.MAX_IMAGE_PIXELS = 50_000_000` alone only *warns* between 50 and 100 MP; verified locally with Pillow 13: a 68-byte crafted PNG declaring 30,000 x 30,000 px is only stopped at the 2x threshold.
- `ImageFile.LOAD_TRUNCATED_IMAGES` stays `False`; use `Image.draft()` for JPEG to decode at reduced size; any decoder exception -> `photo_unreadable` (no stack trace in the response).
- Applies to: worker. Overlaps BR-001.
- Spec: "AC-xxx A small PNG whose header declares 30,000 x 30,000 pixels is refused with `photo_too_many_pixels` within 2 seconds and the service keeps answering".
- Verify: pytest with crafted-header PNG and JPEG (built in the test with `struct`/`zlib`, a few bytes) sent to `/v1/convert` -> 400 `photo_too_many_pixels`, time < 2 s; a TIFF and a PSD -> 400 `photo_unreadable`; an API inject test that the worker's `photo_too_many_pixels` is answered as public 400 `photo_too_many_pixels`; unit test that the pixel check runs for every format; a grep-style test (or Ruff banned-API rule) forbidding `cv2.imdecode`/`cv2.imread`.
- Priority: Must.

**SR-004 Bounded conversion resources.**
- Worker: at most 2 conversions at a time (semaphore; size from config with default 2); a request that can't get a slot within 1 s gets 503 `busy`. FastAPI's sync-route threadpool (40 threads) must not be the limit.
- API: at most 2 in-flight worker calls; excess -> 503 `conversion_unavailable` with `Retry-After`. Keeps 15 MB buffers in the API bounded too.
- Compose: worker `mem_limit: 1g`, `cpus: 1.0` (or 2), `pids_limit: 128`; API `mem_limit: 512m`.
- The budget loop has an iteration cap so a pathological image can't loop forever (it already ends with "drop shortest strokes").
- Applies to: worker, api, compose. Overlaps BR-004, AC-007.
- Task. Verify: worker test firing 3 concurrent requests at a slowed pipeline -> one 503; API test with a slow worker stub -> third concurrent upload 503 with `Retry-After`; `docker compose config` check in CI (SR-021).
- Priority: Must.

**SR-005 Worker isolation (the worker is the sandbox for the image parsers).**
- No `ports:`; attached only to an `internal: true` network shared with the API (no route to the internet, which also enforces BR-016 at the network level).
- No volumes; `read_only: true` with `tmpfs: /tmp:size=64m` (python-multipart spools uploads over 1 MB to disk); non-root user; `cap_drop: [ALL]`; `security_opt: [no-new-privileges:true]`.
- Its environment holds only `WORKER_TOKEN`, `PORT`, `LOG_LEVEL`: no database URL, no admin secrets. Even with code execution, an attacker gets one bearer token and the photos of concurrent conversions.
- `/v1/convert` requires `Authorization: Bearer <WORKER_TOKEN>`, compared with `hmac.compare_digest`; FastAPI docs/OpenAPI routes disabled (`docs_url=None, redoc_url=None, openapi_url=None`); request body capped at 16 MB; the API sends the photo under a fixed part file name (`photo`), never the customer's file name.
- Applies to: worker, compose. Overlaps BR-016.
- Task. Verify: pytest without, with a wrong, and with the right token (401/401/200); CI check on `docker compose config --format json` that the worker has no ports, only internal networks, `read_only`, `cap_drop ALL`; a test that `/docs` and `/openapi.json` are 404.
- Priority: Must.

**SR-006 Strict allowlist SVG validator in the API.**
- Runs on the **exact bytes** that will be stored, returned to the customer and later downloaded (BR-005), before anything is stored.
- Size cap (2 MB constant); UTF-8; reject any `<!DOCTYPE`, `<!ENTITY`, processing instruction other than the XML declaration, CDATA section and comment. Use a parser with entity expansion off, or a small hand-written tokenizer: the grammar the worker emits is tiny.
- Elements: only `svg` (root), `g`, `path`. Attributes by allowlist only: `svg`: `xmlns` (must equal `http://www.w3.org/2000/svg`), `width`, `height` (number + `mm`), `viewBox`, `version`; `g`/`path`: `fill` (must be `none`), `stroke` (must be `#000` or `#000000`), `stroke-width`, `stroke-linecap`, `stroke-linejoin`; `path` also `d`. Anything else (`style`, `on*`, `href`, `xlink:*`, `class`, `id`, `transform`, other namespaces) fails.
- `d` must match a numeric path grammar (`M`/`L`/`H`/`V`/`C`/`Q`/`Z` in either case, numbers, separators); the API parses it, recomputes stroke count, total length and bounds itself and checks them against the configured area and budget. The worker's reported metrics are not trusted.
- Failure: logged with the drawing ID and the failing rule (no content), answered 503 `conversion_unavailable`, nothing stored.
- Protects three consumers: the customer's browser, the admin origin, and the Rotrics software on the owner's laptop, whose SVG parser hardening we don't know.
- Applies to: api. Overlaps BR-002, BR-004, AC-005, AC-006; design "Drawing validation".
- Spec: "AC-xxx A conversion result containing a script, an event handler, a `foreignObject`, an external reference or a DOCTYPE is never shown or stored; the customer gets 'the drawing could not be made right now'".
- Verify: table-driven unit tests with each payload (`<script>`, `onload=`, `<foreignObject>`, `<image href="data:...">`, `xlink:href`, `style=`, `<!DOCTYPE svg [<!ENTITY ...>]>`, `<use>`, a `d` containing `url(`), a fill, a grey stroke, a coordinate outside the area, one stroke over budget with understated worker metrics; one HTTP test with the worker stub returning a script SVG -> 503, `STORAGE_DIR` empty.
- Priority: Must.

**SR-007 Safe display and delivery of SVG.**
- Web: the preview is rendered only as `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">` (or base64). Never `innerHTML`, `dangerouslySetInnerHTML`, `<object>`, `<embed>` or `<iframe>` for SVG, in the shop or the admin tool. The admin tool shows an order's drawing the same way (fetch + data URL or blob URL in `<img>`), not by navigating to the file route.
- API, `GET /admin/orders/{id}/drawing.svg`: `Content-Type: image/svg+xml`, `Content-Disposition: attachment; filename="FL-2026-0042.svg"`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, `Cache-Control: private, no-store`. The same nosniff + sandbox CSP on the order photo and frame photo routes.
- Applies to: web, api. Overlaps BR-002, BR-010.
- Spec: "AC-xxx The downloaded SVG is sent as an attachment named after the order number with nosniff and a sandboxing content security policy".
- Verify: inject test on all three file routes asserting the headers; ESLint `react/no-danger` as error in `apps/web`; component test that the preview renders an `<img>` with a `data:image/svg+xml` source.
- Priority: Must.

**SR-008 File responses from server data only.**
- Every file route looks the file up through the database row of a validated UUID (`orders.id` -> `drawings.svg_key`/`photo_key`, `frames.id` -> `frames.photo_key`); no route accepts a storage key, path or file name.
- `Content-Type` comes from the stored detected type (SR-002); `Content-Disposition` file names are built from the order number after checking it against `^FL-\d{4}-\d{4,}$` (no customer data in names, no header injection).
- Applies to: api. Overlaps BR-011, Q-30.
- Task. Verify: inject tests: unknown UUID -> 404, malformed ID -> 404 (not 500), deleted photo -> 410; response headers match the stored type.
- Priority: Must.

**SR-009 Preview token and indistinguishable answers.**
- Token: 32 bytes from `crypto.randomBytes`, base64url (43 chars). Only `SHA-256(token)` is stored; compare with `crypto.timingSafeEqual`.
- The token appears only in the 201 response body of `POST /drawings` (served with `Cache-Control: no-store`) and the `POST /orders` request body: never in a URL, `Location` header, log line or error message. The web app keeps it in memory or `sessionStorage`, never `localStorage` or the URL.
- `POST /orders` checks in this order: (1) body schema -> (2) drawing exists **and** token matches, else 404 `drawing_not_found` -> (3) already ordered: 200 with the original order confirmation (BR-018 replay; also after the 24 h expiry, and no second order, no stock taken) -> (4) expired: the same 404 `drawing_not_found` -> (5) frame. Unknown ID, wrong token, malformed token and an expired unordered drawing all give the identical 404 (same body, no timing short-cut such as skipping the hash when the ID is unknown). The replay only answers someone holding the valid token, so whether a drawing exists or was ordered is never revealed to anyone else; the replay returns the confirmation fields: order number, estimated delivery date, frame name and price, plus the stored customer name and delivery address (no email). That is acceptable because only the holder of the 256-bit preview token gets it, which in practice is the customer who placed the order. It shows them data they entered themselves, and it is their only record of the address the order actually ships to (after a retry with corrected details). The response keeps `Cache-Control: no-store` (SR-019), and the token stays out of URLs and logs.
- No public route returns a photo or drawing by ID (BR-013); a route-table test asserts it.
- Applies to: api, web. Overlaps BR-013, AC-010, AC-022.
- Spec: "AC-xxx Ordering an already-ordered drawing with a wrong token gives 'This preview is no longer available', not the order confirmation" (AC-010 and AC-022 cover the rest).
- Verify: inject tests for each case comparing full response bodies; unit test of token generation length/encoding; log-capture test (SR-018) asserting the token never appears.
- Priority: Must.

**SR-010 Admin password hashing.**
- `crypto.scrypt` with OWASP parameters, e.g. `N=2^17, r=8, p=1` (needs `maxmem` raised to about 256 MiB: Node's default refuses these parameters, verified locally; about 0.45 s per hash here), 16-byte random salt, 32-byte key. Parameters and salt are encoded in the hash.
- Use a `$`-free encoding such as `scrypt:17:8:1:<salt-b64url>:<hash-b64url>`. Compose interpolates `$` in `.env` values, which silently corrupts `$`-separated hashes. Startup validation parses the hash and fails fast naming `ADMIN_PASSWORD_HASH` if it is malformed.
- Compare with `crypto.timingSafeEqual`; compare the username in constant time too, and run scrypt even when the username is wrong, so one generic `invalid_credentials` response comes back in the same time (AC-025).
- The hash script (`npm run hash-password`) reads the password from stdin (not argv, which lands in shell history) and refuses passwords shorter than 12 characters.
- Applies to: api. Overlaps BR-011, ADR 0003.
- Task. Verify: unit tests: hash/verify round trip, wrong password, malformed hash rejected by env validation, short password refused by the script.
- Priority: Must.

**SR-011 Login brute-force protection.**
- Per client IP (SR-017): after 5 failed logins in 15 minutes, further login attempts get 429 `rate_limited` with `Retry-After` until the window passes. This includes attempts with the right password, so an attacker can't use the limit as an oracle.
- Global: more than 100 failed logins per hour across all IPs gives 429 for everyone for the rest of the window. It slows a distributed attack. The admin locking themselves out for an hour is acceptable at this scale; the admin can also restart the API to clear it.
- The limit is checked **before** scrypt runs, so floods don't occupy libuv's 4-thread pool (which file storage also uses).
- Every failed login is logged as a security event with IP and timestamp, without the username or password.
- Applies to: api. Answers Q-26 (decide: yes). Contract already lists 429 for login.
- Spec: "AC-xxx After 5 wrong passwords from one address within 15 minutes, the sixth attempt is refused with 'Too many attempts, try again later' even with the right password, and works again after 15 minutes".
- Verify: inject test with an injected clock or a rate-limit store reset; assert scrypt is not called on 429 (spy).
- Priority: Must.

**SR-012 Session management and cookie flags.**
- Session ID: 32 random bytes, base64url; only `SHA-256(id)` stored in `admin_sessions`. A new session is created on every successful login; any cookie the browser presents at login is ignored and its session row deleted (no fixation).
- Expiry checked server-side on every request: idle `SESSION_TTL_HOURS` (default 8, sliding via `last_seen_at`) **and** absolute 24 h from `created_at` (constant). The design only has the idle expiry; add the absolute one. Expired rows are deleted by the sweep (SR-022).
- Logout (`DELETE /admin/session`) deletes the row and clears the cookie (`Max-Age=0`).
- Cookie `fineline_admin`: `HttpOnly; SameSite=Strict; Path=/api/v1/admin; Secure`, no `Domain`, no `Max-Age` beyond the absolute expiry. `Secure` is on unless `COOKIE_SECURE=false`, which is the documented opt-out for `http://localhost` only. The default is `true`, not "Secure in production".
- Applies to: api. Overlaps BR-011, AC-028, ADR 0003, Q-32.
- Spec: "AC-xxx Logging in sets the admin cookie as HttpOnly, Secure, SameSite=Strict"; "AC-xxx A session unused for 8 hours is refused (401)"; "AC-xxx A session older than 24 hours is refused even when active"; "AC-xxx Logging in again gives a different session; the old cookie no longer works".
- Verify: inject tests parsing `Set-Cookie`; idle and absolute expiry with an injected clock; login twice and compare cookies; AC-028 for logout.
- Priority: Must.

**SR-013 CSRF defence.**
- Every unsafe request under `/api/v1/admin/` (POST, PUT, PATCH, DELETE), **including** `POST /admin/session` (login CSRF) and `DELETE /admin/session`, requires `X-Requested-With: fineline` exactly. Without it: 403 `csrf_failed`, checked in `onRequest` before any body or multipart parsing. On every admin route except login, authentication is checked first: no valid session -> 401 `unauthenticated`, even when the header is also missing; only an authenticated request without the header gets 403 `csrf_failed`. On `POST /admin/session` the header check applies on its own (403). Multipart frame uploads matter most here, because a cross-site `<form enctype="multipart/form-data">` needs no preflight.
- The status change on download is `POST /admin/orders/{id}/drawing-download` (header required); `GET .../drawing.svg` has no side effects (note N-1, accepted).
- CORS: in production no CORS headers at all (same origin via nginx). `CORS_ORIGIN`, when set for split-origin development, is one exact origin; never `*`, never reflect the request `Origin`; startup refuses `*`. Unknown content types stay rejected (Fastify's 415), so `text/plain` "JSON" isn't parsed.
- SameSite=Strict (SR-012) is the second layer, not the only one.
- Applies to: api. Overlaps BR-011.
- Spec: "AC-xxx Adding a frame, adjusting stock or changing a status without the app's request header is refused (403) and changes nothing".
- Verify: inject tests for every unsafe admin route (driven by the route table, see SR-014) with a valid session but without the header -> 403 and nothing changed, and without a session and without the header -> 401; a preflight `OPTIONS` with `Origin: https://evil.example` gets no `Access-Control-Allow-Origin`.
- Priority: Must.

**SR-014 One authentication gate for every admin route.**
- Admin routes are registered inside one encapsulated Fastify plugin with prefix `/api/v1/admin`, whose `onRequest` hook (before body parsing, so unauthenticated uploads are never read or stored) requires a valid session. The only exemption is `POST /api/v1/admin/session`, by an explicit allowlist in the hook.
- Nothing outside that plugin returns order data, customer data, photos or drawings.
- Applies to: api. Overlaps BR-011, AC-026, AC-027.
- Spec: extend AC-026 to "every admin API call, for every method", e.g. "AC-xxx Every admin API route except login refuses requests with no, an expired or a forged session cookie with 401 and returns no data".
- Verify: a test that collects all routes with an `onRoute` hook and, for each `/api/v1/admin/*` route except login, sends no cookie, a random cookie and an expired session's cookie -> 401 with no body data, and for multipart routes asserts nothing was stored. Future routes are covered automatically.
- Priority: Must.

**SR-015 File storage confinement.**
- Keys are generated by the API only (`photos/<uuid>`, `drawings/<uuid>.svg`, `frames/<uuid>`). `LocalDiskStorage` rejects any key not matching `^(photos|drawings|frames)/[0-9a-f-]{36}(\.svg)?$` and checks that `path.resolve(STORAGE_DIR, key)` starts with `STORAGE_DIR + sep`.
- Writes are atomic (temp file + rename) with mode `0600`, directories `0700`; no partial files after errors.
- Customer photo and SVG are stored **only after** the worker succeeded and SR-006 passed, so rejected uploads leave nothing behind (AC-002 to AC-004 say "no photo is stored").
- The storage volume is mounted into the `api` container only; nginx never serves it.
- Applies to: api, compose. Overlaps ADR 0006, BR-010.
- Task. Verify: unit tests with `../etc/passwd`, absolute paths, `photos/../../x` and symlink-free assertions; inject tests that each rejected upload (wrong type, too small, worker error, invalid SVG) leaves `STORAGE_DIR` empty; compose check that only `api` mounts the volume.
- Priority: Must.

**SR-016 Strict input handling.**
- Every body, query, path parameter, multipart field and env var is parsed with Zod `.strict()` (unknown fields -> 400 `validation_failed`); UUID path params are validated before any query (a malformed ID is 404/400, never a `pg` 500).
- Server-owned values never come from the client: order price from the frame (BR-012), initial status `received`, stock only via the atomic decrement/adjustment, order number from the counter.
- Free text: the contract's length limits apply; control characters (U+0000 to U+001F and U+007F, including line breaks) are rejected in name and address fields. These end up on shipping labels and in the admin UI.
- Only Drizzle's parameterised queries; `sql.raw` is never used with request data.
- Web: React escaping only; `react/no-danger` as error (SR-007); no `href`/`src` built from customer data.
- Applies to: api, web.
- Mostly Task; Spec: "AC-xxx An order request with an extra field such as `priceCents` or `status` is refused as invalid and creates no order".
- Verify: inject tests (extra field, malformed UUID, name with `\u0000`), AC-014; ESLint config check.
- Priority: Must.

**SR-017 Rate limits and the real client IP.**
- `@fastify/rate-limit` with the in-memory store (single instance):
  - `POST /api/v1/drawings`: 10 per hour per IP and 60 per hour globally, checked in `onRequest` before the body is read or the worker is called. The global cap bounds CPU and disk: at most about 0.9 GB of new photos an hour, about 22 GB per 24 h retention window, worst case.
  - `POST /api/v1/orders`: 5 per hour per IP.
  - Login: SR-011.
  - Answer: 429 `rate_limited` with `Retry-After` (contract).
- Client IP: nginx sets `proxy_set_header X-Forwarded-For $remote_addr;` (overwrite, not `$proxy_add_x_forwarded_for`), and Fastify's `trustProxy` trusts only the nginx hop (its compose network address or `1`), so a client can't choose its own IP and not everyone shares nginx's address. Running the API directly in development: `trustProxy` off.
- Fake orders that drain stock (T18) are limited by the upload and order limits; the admin cancels them to restore stock (BR-006). CAPTCHA is deferred.
- Applies to: api, web (nginx). The design already mentions upload rate limiting; this sets the numbers.
- Spec: "AC-xxx The 11th photo upload from one address within an hour is refused with 'Too many uploads, try again later' and no conversion starts"; "AC-xxx A spoofed X-Forwarded-For header does not reset the limit".
- Verify: inject tests (worker stub call count stays 10); smoke test through nginx sending `X-Forwarded-For: 1.2.3.4` still limited.
- Priority: Must. The numbers are constants in one module; tune after launch.

**SR-018 Errors and logging without personal data.**
- One Fastify error handler: 5xx -> `{ error: { code: "internal_error", message: "Something went wrong" } }` with no stack, SQL or `error.message`. Fastify's default handler would send `error.message`, and `pg` messages can contain values. 4xx validation `details` name the field and the rule but never echo the input value.
- Logs (pino): `redact` `req.headers.cookie`, `req.headers.authorization`, `res.headers["set-cookie"]` and any `password`, `previewToken`, `customer`, `address`, `svg` keys. Request and response bodies are never logged. When logging a `pg` error, log `code`, `constraint` and `table` only, never `detail`, `where` or query parameters.
- Worker logs no file names, EXIF or image data, only drawing size, timings and error codes; uvicorn access log has no bodies.
- Security events are logged at `warn`: failed login (IP, no username), 401 on admin routes, 403 `csrf_failed`, 429, SVG validation failures (drawing ID and rule). IP addresses appear only in security events. Log retention (14 to 30 days) is a hosting decision (manual check).
- Applies to: api, worker. Overlaps BR-014, AC-023.
- Spec: extend AC-023: "the logs of a full flow, including a failed login with a wrong password and an order that fails on a database constraint, contain none of the customer's details, the password, the preview token or the session ID".
- Verify: a test that captures the pino stream during upload -> order -> failed login -> admin actions and greps for the AC-023 strings plus the password, token and cookie values; inject test that a thrown `pg` error yields the generic 500 body.
- Priority: Must.

**SR-019 Security headers and no third-party content.**
- nginx adds to every response (SPA and proxied API, `always`):
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()` (file input with `capture` still works)
  - `X-Frame-Options: DENY`
  - `server_tokens off`
- Add `Strict-Transport-Security: max-age=31536000` once served over HTTPS (Before deploy, wherever TLS terminates).
- The API sets `Cache-Control: no-store` on all `/api/v1/admin/*` responses and on `POST /drawings` and `POST /orders` responses, and nosniff on everything (also when run without nginx).
- No third-party scripts, fonts, analytics or error-reporting SaaS in the web app (BR-016, GDPR); the CSP enforces this.
- Applies to: web, api.
- Spec: "AC-xxx Every page of the shop and the admin tool is served with a content security policy that forbids framing and third-party scripts".
- Verify: smoke test (task 4.4) `curl -I` against nginx for `/`, `/admin/login` and `/api/v1/health`, asserting each header; inject tests for `no-store`; the web build has no inline scripts (CSP would break it, so a Playwright/smoke load with no CSP console errors).
- Priority: Must (HSTS: Before deploy).

**SR-020 Secrets.**
- Secrets only in environment variables, validated at startup:
  - `WORKER_TOKEN` at least 32 characters and not equal to the `.env.example` placeholder (both API and worker refuse to start otherwise).
  - `ADMIN_PASSWORD_HASH` parses (SR-010).
  - `COOKIE_SECURE` defaults to `true`.
- `.env.example` (root and per part) contains only placeholders that **fail** validation, e.g. `WORKER_TOKEN=replace-with-32+-random-chars`, `ADMIN_PASSWORD_HASH=run-npm-run-hash-password`. No usable dev password, hash or token. The README gives the commands to generate them (`openssl rand -base64 32`, the hash script). The local Postgres password is a placeholder too; the DB port isn't published (SR-021).
- `.env` stays gitignored (done) and goes into `.dockerignore` for each image; images contain no `.env`; the web bundle contains no secrets (no build-time env, as designed).
- CI runs a secret scanner (gitleaks) on pushes and PRs.
- Applies to: api, worker, compose, CI.
- Task. Verify: config unit tests (placeholder, short token, malformed hash -> fail naming the variable); gitleaks job green; `docker run --rm <image> ls -a /app` has no `.env`.
- Priority: Must; real secrets, generated per environment, Before deploy.

**SR-021 Containers, networks, dependencies and CI.**
- Dockerfiles: multi-stage, runtime images without dev dependencies or build tools, non-root `USER`, base images pinned to a specific version tag (e.g. `node:22.x-slim`, `python:3.12-slim`, `nginx:1.x-alpine`, `postgres:16.x`).
- Compose:
  - Only `web` publishes a port. `db` publishes none; if developers need it, bind `127.0.0.1:5432` in a dev-only override.
  - Networks: `edge` (web), `frontend` (`internal: true`: web and api) and `backend` (`internal: true`: api, worker, db), so neither the API nor the worker can reach the internet at runtime (BR-016).
  - `cap_drop: [ALL]` and `no-new-privileges` for api, worker and web (nginx unprivileged image on 8080); `read_only` + tmpfs for worker and web.
- Dependencies: lockfiles committed; `npm ci` and `uv sync --frozen` in CI and Docker. CI fails on high/critical advisories via `npm audit --omit=dev --audit-level=high` (api, web) and `pip-audit` on the worker's locked requirements. Dependabot (or Renovate) weekly for npm (api, web), uv/pip (worker), Docker base images and GitHub Actions. Pillow, pillow-heif (bundles libheif/libde265), OpenCV and python-multipart are the parser-exposed packages: keep them current.
- CI workflow:
  - top-level `permissions: contents: read`
  - official actions only (`actions/*`), pinned to a commit SHA (or at least a major tag)
  - `actions/checkout` with `persist-credentials: false`
  - no `pull_request_target`, no secrets needed (the Postgres service uses a throwaway password defined in the workflow)
  - a job that checks `docker compose config --format json` for the properties above (SR-004, SR-005, SR-015)
- Applies to: compose, CI, all Dockerfiles.
- Task. Verify: review of the workflow and compose files; the compose-config check job; audit jobs green.
- Priority: Must.

**SR-022 Retention and erasure.**
- The retention sweep (design) also:
  - deletes files under `photos/` and `drawings/` that no database row references and that are older than 24 h (orphans from crashes between storage and DB writes)
  - deletes expired `admin_sessions`
  - deletes the file first and then updates the row (`photo_deleted_at`), so a failure leaves a row that is retried on the next run, never a "deleted" photo still on disk; failures are logged without personal data
- Before deploy: a documented erasure procedure for one customer (Q-24): a small script `npm run erase-order -- FL-2026-0042` that deletes the photo and drawing files and blanks name, email and address on the order (keeping the order number, price, dates and status for bookkeeping), or at least a runbook with the exact SQL and file commands. Backups (once hosting exists) must expire within the retention periods (manual check).
- Applies to: api. Overlaps BR-010, AC-011, AC-012, Q-24, Q-25.
- Task. Verify: sweep unit tests with an injected clock and a fake storage containing orphans; a test that a storage delete failure leaves `photo_deleted_at` null; a test for the erase script.
- Priority: Must (sweep additions); Before deploy (erasure).

**SR-023 Strip metadata from frame photos.**
- Frame photos are public. Phone photos carry EXIF GPS, which reveals where the owner works, probably home. Before storing, the API removes the JPEG APP1 (EXIF/XMP) and APP13 segments, the PNG `eXIf`/`tEXt`/`iTXt`/`zTXt` chunks and the WebP `EXIF`/`XMP ` chunks with a small pure function, or re-encodes the image. Keep the ICC profile if convenient.
- Customer photos are not served publicly; the worker strips their metadata for processing (design). Whether to store the original with its GPS data is a question below.
- Applies to: api.
- Spec: "AC-xxx A frame photo uploaded with GPS location data is offered to customers without any location data".
- Verify: inject test uploading a JPEG with a GPS EXIF block (generated in the test), then `GET /frames/{id}/photo` contains no `Exif` APP1 segment.
- Priority: Before deploy.

## Notes for the lead: design and contract changes

Status: N-1 to N-7 and N-9 to N-12 accepted by the lead; N-8 resolved with a separate code `photo_too_many_pixels` (BR-001: at most 50 MP); N-5 superseded by the BR-018 replay (no `drawing_already_ordered` code; check order in SR-009). Kept below for the record.

- **N-1 State change on a GET (`GET /admin/orders/{id}/drawing.svg` moves `received` -> `drawing`).** Two problems:
  1. *Functional:* AC-030 says the admin "sees ... the drawing" on the order detail. If the web app shows it with `<img src=".../drawing.svg">`, just opening the order moves it to `drawing`.
  2. *Security:* GETs are exempt from the CSRF header (SR-013), so any same-site context can trigger it. SameSite=Strict blocks the cross-site case.

  Proposal: keep `GET .../drawing.svg` side-effect free (used for display and re-downloads), and add `POST /admin/orders/{id}/drawing-download` (CSRF header required) that does the `received` -> `drawing` transition and returns the SVG attachment; the web app saves it via fetch + blob. If you prefer to keep one GET, require `X-Requested-With: fineline` on it (the web downloads via fetch + blob, not `<a href>`) and give the detail page a separate side-effect-free way to show the drawing. Either way, update the contract and AC-031.
- **N-2 Absolute session expiry missing.** The design and ADR 0003 only have the 8 h idle expiry; add an absolute 24 h limit (SR-012).
- **N-3 `Secure` cookie "in production".** The contract and ADR say "Secure in production". Make it Secure by default with `COOKIE_SECURE=false` as an explicit localhost opt-out (SR-012).
- **N-4 Login and the CSRF header.** The contract's "unsafe admin methods require the header" literally includes `POST /admin/session`; say so explicitly, and add `403 csrf_failed` to the login and logout responses (SR-013).
- **N-5 Check order in `POST /orders`.** The contract lists `drawing_not_found` (404) and `drawing_already_ordered` (409) without an order of checks. Token verification must come first, or 409 tells a stranger that a drawing exists and was ordered (SR-009). AC-022's wording "belongs to another browser session" should read "without its preview token": there are no customer sessions.
- **N-6 Store after success.** Design flow step 1 stores the photo before calling the worker; AC-002 to AC-004 say "no photo is stored" on rejection. Store photo and SVG only after the worker succeeded and the SVG passed validation (SR-015).
- **N-7 Busy worker.** The contract has no answer for "too many conversions right now". Reuse 503 `conversion_unavailable` with a `Retry-After` header (SR-004) and document `Retry-After` on that response. The worker contract needs a `503 busy` response.
- **N-8 Pixel limit error code.** A photo over 50 MP but under 15 MB (SR-003) currently maps to `photo_unreadable`. That's acceptable, but if the owner wants a clearer message, add a code such as `photo_too_many_pixels`. Note that BR-001 has no upper pixel limit; add "at most 50 megapixels" to BR-001 if you agree.
- **N-9 Hash format and Compose.** ADR 0003 should name the `$`-free hash format (SR-010) so `.env` and Compose don't mangle it.
- **N-10 Real client IP.** Neither the design nor the compose plan says how the API learns the client IP behind nginx; without SR-017's `trustProxy` + `X-Forwarded-For` setup, rate limits are either spoofable or global. Revisit when hosting adds another proxy or load balancer in front.
- **N-11 Networks.** Design says the worker is "internal only, no published port". Also make its network `internal: true` (no egress), and keep the API off the internet too: it has no outbound dependency (SR-005, SR-021). This turns BR-016 from a promise into a network property.
- **N-12 Worker decoding.** Design step 1 should state "decode with Pillow restricted to JPEG/PNG/HEIF, pixel-count check before decode, never `cv2.imdecode`" (SR-003). This is the most likely place for a real exploit in this system.
- **N-13 Spec additions.** SR-001, 002, 003, 006, 007, 009, 011, 012, 013, 014, 016, 017, 018, 019 and 023 are observable; each has a suggested scenario above. AC-026/AC-027 should become "every admin route" (SR-014), and AC-023 should include passwords, tokens and DB errors (SR-018).

## Corrections after the post-build security review

The review (`reviews/security-review.md`, findings #1, #2 and #4 to #7) showed five requirements that were too weak as written. These amendments are part of the requirements; the original text above stays for the record.

- **SR-010 (amended).** One scrypt verification with `N=2^17, r=8` allocates 128 MiB. At most **one** password verification runs at a time (a one-slot queue in the auth service; a second concurrent login waits briefly or gets 429). The API's memory limit has room for that one verification plus uploads in flight (finding #2: four parallel logins took the API from 150 MB to 659 MB, above `mem_limit: 512m`).
- **SR-011 (amended).** The attempt is **counted before scrypt runs** (reserve, then keep the count on failure; a success may refund it), so concurrent requests can't get past the limit. Checking the counter and counting only after scrypt lets any number of parallel guesses through (finding #1: 40 parallel wrong passwords from one address all got scrypt and 401, none 429). Verify with a test that sends the requests in parallel.
- **SR-004 (amended).** Size the worker's memory from measurements, not from the file size: one 49 MP RGBA PNG (190 KB on disk) peaks at about 380 MB in the worker, two in parallel at about 1 GB (finding #4; the API side is finding #6). Either refuse decoded sizes above a byte budget (`width x height x bands`) before `load()`, or run one conversion at a time, or raise `mem_limit` to fit `MAX_CONCURRENT_CONVERSIONS` worst cases. The API also takes its conversion slot (or a separate upload slot) **before** it reads a 15 MB body, so the number of buffered uploads is bounded by the slot count, not by the hourly rate limit.
- **SR-001 / SR-021 (amended).** nginx buffers request bodies to its temp directory (`/tmp/client_temp` in `nginx-unprivileged`), which is the `web` container's tmpfs. That tmpfs must hold the expected concurrent uploads (16 MB each), and the upload locations need `limit_conn` per client address and a short `client_body_timeout`, so a few stalled uploads can't fill it (finding #5: three stalled 10 MB uploads made every further upload fail with nginx 500 on a 32 MB tmpfs).
- **SR-005 / SR-021 (amended networks).** The worker must not share a network with the database. Use `workers` (`internal: true`: api, worker) and `data` (`internal: true`: api, db) instead of one `backend` network; a compromised worker then reaches only the API. `POSTGRES_PASSWORD` must not be left at the `.env.example` placeholder (finding #7).

## Deferred

| Item | Why accepted for now | Revisit when |
|---|---|---|
| CAPTCHA / proof-of-work on uploads and orders | Rate limits (SR-017) suffice at a handful of orders a day; CAPTCHAs are often third-party (BR-016) | Rate-limit hits or fake orders show up in the logs |
| MFA (TOTP) for the admin, or restricting `/admin` + `/api/v1/admin` to the owner's IP/VPN at the proxy | Strong password + scrypt + SR-011 is proportionate for the kickstart | Hosting is chosen (cheap to add an IP allowlist at the proxy then); or before payments |
| `__Host-` cookie prefix (`Path=/`, no subdomain cookie tossing) | Needs HTTPS everywhere, incl. dev; the path-scoped cookie is fine on one origin | Hosting and domain are chosen |
| Separate DB roles (migration owner vs runtime user without DDL) | One-container app; Compose's default superuser is local only | Before first deploy if the host makes it easy; otherwise with the first schema-heavy change |
| Image digest pinning, SBOM, image scanning (Trivy) | Version-tag pinning + Dependabot is proportionate | Hosting is chosen / CI images are pushed to a registry |
| Admin audit log (who changed what) | One admin; status timestamps exist | More than one admin |
| Encryption at rest of the DB and storage volume | Depends on the host | Hosting: choose an EU host with encrypted disks (manual check) |
| Public order tracking by order number | Not in scope; order numbers are guessable | If added, it needs a per-order secret, never the number alone |
| Payment security (PCI scope) | Out of scope | The payment change: use a hosted payment page so card data never touches us |

## Manual checks for the team (can't be verified in the sandbox)

- TLS everywhere with HSTS; only 443 (and 80 -> 443 redirect) open on the host.
- Real client IP configuration if the host adds a proxy or load balancer in front of nginx (SR-017).
- EU data location and a data processing agreement with the host (GDPR); disk encryption; backups encrypted and expiring within BR-010's periods.
- Log retention of 14 to 30 days at the host; logs not shipped to a third party without a processing agreement.
- A strong admin password (passphrase of 4+ words) generated and stored in a password manager; `WORKER_TOKEN` generated per environment; secrets in the host's secret store, not in a file on the server where avoidable.
- Photo terms and privacy notice reviewed (photos of children, retention periods, the right to erasure): legal text, not code.
- The admin laptop's browser and the Rotrics software kept up to date: they consume every downloaded SVG and photo.
