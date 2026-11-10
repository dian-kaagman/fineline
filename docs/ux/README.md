# UX - first slice (kickstart)

What the web app (`apps/web`) builds for the kickstart change, and what the UX review checks. Reconciled with `docs/api/openapi.yaml`, specs AC-001..AC-066 and BR-001..BR-018 after the plan review (`/mnt/session/outputs/reviews/plan-review.md`, findings 2, 6, 7, 8, 12, 14).

| File | What's in it |
|---|---|
| `flows.md` | Customer flows F1-F9 (photo -> preview -> frame -> details -> confirmation, and every error path) and admin flows F10-F17, with the AC- and BR- IDs they cover |
| `screens.md` | Routes, and every screen (C1-C6 customer, A1-A7 admin, X1-X5 shared; X4 is cut) with content, actions, API calls and all states |
| `design-tokens.md` | Colours, type, spacing, radii, breakpoints, motion, component patterns, and the computed contrast table |
| `tokens.css` | The same tokens as CSS custom properties - copy into `apps/web` unchanged |
| `check-contrast.py` | Recomputes the contrast of every token pair from `tokens.css`; exits 1 on a failure (run in CI: `python3 docs/ux/check-contrast.py`) |
| `content.md` | Every label, button, status name, notice and error message, with catalogue keys; how API error codes and `details` map to them; formatting rules for prices and dates |
| `accessibility.md` | Requirements UX-001..UX-032 (WCAG 2.2 AA), each with how to test it and whether jsdom unit tests can prove it or it needs the post-build browser review |

## Coverage of the specs

Scenarios with no UI of their own are listed too, so nobody looks for them in the web app.

| Scenario | Flow / screen / key |
|---|---|
| AC-001 HEIC accepted | F1 - C1, C2, C3 |
| AC-002, AC-050 unsupported type, HTML/SVG renamed to .jpg | F3 - C1 `c1.error.unsupportedType` |
| AC-003 over 15 MB (incl. nginx's own 413) | F3 - C1 `c1.error.tooLarge` (pre-check, `photo_too_large`, any HTTP 413) |
| AC-004 short side under 800 px | F3 - C1 `c1.error.tooSmall` |
| AC-051, AC-053 over 50 megapixels | F3 - C1 `c1.error.tooManyPixels` |
| AC-052 two files | F3 - C1 `c1.error.invalidUpload` (the web app always sends one file) |
| AC-005, AC-006 drawing format, budget | F1 - C3 (shown as the server returns it) |
| AC-007 progress until the preview | F1 - C2 indeterminate progress + `c2.working`, UX-008 |
| AC-054 converter busy, AC-055 unsafe result | F3b - C1 `c1.error.conversionUnavailable` |
| AC-056 preview shown as an image | C3 `<img src="data:image/svg+xml...">`, UX-009 |
| AC-057 eleventh upload in an hour | F3b - C1 `c1.error.rateLimited` ("Please wait 15 minutes ...") |
| AC-008, AC-009 no drawing / try another photo | F2, F3 - C1 `c1.error.noDrawableContent`, C3 **Try another photo** |
| AC-010, AC-011, AC-022 preview not available (expired or wrong token) | F7 - C3 "no longer available" state `c3.expired` |
| AC-012 photo deleted after 30 days | A3 photo-deleted state `a3.photo.deleted` (from `photoAvailable: false`) |
| AC-013 frames in stock with price | F4 - C4, UX-018 |
| AC-014..AC-016 details, country, photo terms | F5 - C5, UX-006 |
| AC-017 withdrawal notice above the button | F4 - C5 `c5.withdrawal` |
| AC-018, AC-019 order number and delivery date | F4 - C6 (values from the response) |
| AC-020 last frame sold once | F6 - C4 sold-out state `c4.soldOut`, UX-026 |
| AC-021 ordered drawing = preview | C3 `c3.whatYouSee`; A3 download |
| AC-058 retry after a lost confirmation | F8 - C6 from the 200 response (original order's values) |
| AC-059 extra fields rejected | no UI: the web app never sends them (`c5.error.field.generic` as a fallback) |
| AC-060 sixth order in an hour | F8 - C5 `c5.error.rateLimited` ("Please wait 20 minutes ...") |
| AC-023 no personal data in logs | not a UI concern (the web app logs nothing personal to the console either) |
| AC-024, AC-025, AC-028 login, wrong credentials, logout | F10 - A1, X2 |
| AC-026, AC-063 no / idle / old session | F10 - redirect to A1 with `next` and `a1.sessionEnded`, UX-023 |
| AC-027 photo and drawing need login | A3 (the same 401 redirect) |
| AC-061 sixth login attempt | F10 - A1 `a1.error.rateLimited` ("Please wait 10 minutes ...") |
| AC-062 cookie, AC-065 CSP | no UI. For AC-065 the web app loads nothing from another site (system fonts, no CDN); the preview and the A3 drawing are `data:` images, so the CSP needs `img-src 'self' data:` |
| AC-064 admin header | every unsafe admin call from the web app, including login and logout, sends `X-Requested-With: fineline` |
| AC-029 open orders, filters | F11 - A2 (default `status=open`, filter links) |
| AC-030 order detail without status change | A3 - drawing from `GET .../drawing.svg`, order date from `orderDate` |
| AC-031, AC-032 SVG download for the arm | F11 - A2, A3 via `POST .../drawing-download` |
| AC-033..AC-036 statuses, cancel, final | F11-F13 - A2, A3, X5 |
| AC-037, AC-038 delivery date | F14 - A3 (`delivery_date_before_order_date` -> `a3.date.error.beforeOrderDate`) |
| AC-039..AC-044 frames and stock | F15, F16 - A4, A5, A6 (drawing area from `GET /admin/settings`) |
| AC-066 frame photo metadata | no UI (API only) |
| AC-045, AC-046 lead time | F17 - A7 |
| AC-047..AC-049 date calculation | shown on C6 as returned by the API |

## Route changes

The routes in the brief stay as they are. Additions:

- **P-1 `/admin` redirects to `/admin/orders`.** Typing the short address should land somewhere. (Proposal.)
- **P-3 Order list filter in the URL:** `/admin/orders?status=open|received|drawing|drawn|ready_to_ship|shipped|cancelled|all` (default `open`, same values as the API), so the filter survives reload and Back from an order.
- **P-4 Login return path:** `/admin/login?next=/admin/orders/<id>`; only same-origin paths starting with `/admin/` are followed (no open redirect). Also used when a session ends (UX-023).
- **P-5 Customer steps stay on `/`** with the step in `history.state` (Back works; no deep links to a step).
- ~~P-2 Draft kept in `sessionStorage`~~ - **cut** in the plan review (finding 6). Everything on `/` is in memory; a reload starts at C1. Later.

## Gaps - status

Resolved in the contract and specs (no fallbacks needed any more):

- **G-1 resolved.** `GET /admin/orders/{id}/drawing.svg` has no side effects; A3 shows the drawing from it. `POST /admin/orders/{id}/drawing-download` is the download for the arm and moves Received -> Drawing. `allowedNextStatuses` of a Received order is `[cancelled]`.
- **G-2 resolved.** `GET /admin/orders?status=open|all|<status>`, default `open`.
- **G-3 resolved.** `orderDate` is on `OrderSummary` and `OrderDetail`; a date before it gets `delivery_date_before_order_date`.
- **G-4 resolved as fallback.** HEIC order photos that the browser can't show get "This photo can't be shown in this browser" + **Download photo** on A3.
- **G-5 resolved.** `GET /admin/settings` returns `drawingAreaWidthMm` / `drawingAreaHeightMm` (read-only); used in the A5 hint, the browser's too-small check and the A7 line.
- **G-6 resolved.** Placing an already-ordered drawing again with its valid token returns 200 with the original `OrderConfirmation`, which now includes `customerName` and `address`; C6 shows only what the response returns, after 201 or 200. `drawing_already_ordered` no longer exists.
- **G-7 resolved.** The contact address comes from the build-time variable `VITE_CONTACT_EMAIL`.

Still open:

- **G-8 Payment wording and the order button.** Q-8 leaves payment open, but the customer must be told how and when they pay (`c5.payment`, `c6.payment` are placeholders), and EU consumer law (Consumer Rights Directive art. 8(2), in NL/BE law) requires the order button to say that ordering means an obligation to pay, e.g. "Order with obligation to pay" / "Bestellen met betaalverplichting". "Place order" is in `content.md` for now; add to Q-10's legal check before go-live.
- **Paper size in the C3 caption.** `c3.size` says the drawing is "sized to fit A4 paper" (the default drawing area, Q-2). If the owner's paper isn't A4, change the text; the web app doesn't get the paper size from the API.

## Cut from this slice (plan review finding 6) - later

- `sessionStorage` draft restore and keeping C6 across a reload (P-2).
- X4 "Log in again" dialog with request replay; replaced by the redirect in UX-023.
- Upload percentage and the "still working" phase on C2; C2 has one indeterminate state with one announcement and **Cancel**.
- "View full size" dialog on C3 (UX-030 is now just a zoomable image), Copy buttons (order number, address), the "Late" tag, drag and drop of photos, the stacked-row variant of the admin tables (tables now scroll inside their own region on narrow screens).
- ICU message format and the pseudo-locale test; the catalogue is a flat key -> string map with `.one`/`.other` keys where needed.
