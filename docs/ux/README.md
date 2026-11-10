# UX - first slice (kickstart)

What the web app (`apps/web`) builds for the kickstart change, and what the UX review checks.

| File | What's in it |
|---|---|
| `flows.md` | Customer flows F1-F9 (photo -> preview -> frame -> details -> confirmation, and every error path) and admin flows F10-F17, with the AC- and BR- IDs they cover |
| `screens.md` | Routes, and every screen (C1-C6 customer, A1-A7 admin, X1-X5 shared) with content, actions and all states |
| `design-tokens.md` | Colours, type, spacing, radii, breakpoints, motion, component patterns, and the computed contrast table |
| `tokens.css` | The same tokens as CSS custom properties - copy into `apps/web` unchanged |
| `check-contrast.py` | Recomputes the contrast of every token pair from `tokens.css`; exits 1 on a failure (run in CI: `python3 docs/ux/check-contrast.py`) |
| `content.md` | Every label, button, status name, notice and error message, with catalogue keys; formatting rules for prices and dates |
| `accessibility.md` | Requirements UX-001..UX-032 (WCAG 2.2 AA), each with how to test it |

## Coverage of the specs

| Scenario | Flow / screen |
|---|---|
| AC-001..AC-004 photo accepted / rejected | F1, F3 - C1, C2 |
| AC-005, AC-006 drawing format, budget | F1 - C3 (shown as the server returns it) |
| AC-007 progress within 30 s | F1 - C2, UX-008 |
| AC-008, AC-009 no drawing / try another photo | F2, F3 - C1, C3 |
| AC-010, AC-022 someone else's preview | F7 - C3 "no longer available" state |
| AC-011 expired preview | F7 - C3 "no longer available" state |
| AC-012 photo deleted after 30 days | A3 photo-deleted state |
| AC-013 frames in stock with price | F4 - C4, UX-018 |
| AC-014..AC-016 details, country, photo terms | F5 - C5, UX-006 |
| AC-017 withdrawal notice above the button | F4 - C5 |
| AC-018, AC-019 order number and delivery date | F4 - C6 |
| AC-020 last frame sold once | F6 - C4 sold-out state, UX-026 |
| AC-021 ordered drawing = preview | C3 (`whatYouSee`), A3 download |
| AC-023 no personal data in logs | not a UI concern (the web app logs nothing personal to the console either) |
| AC-024..AC-028 login, refusal, logout | F10 - A1, X2, X4 |
| AC-029 order list | F11 - A2 |
| AC-030 order detail | A3 (drawing view needs G-1) |
| AC-031, AC-032 SVG download | F11 - A2, A3 |
| AC-033..AC-036 statuses, cancel, final | F11-F13 - A2, A3, X5 |
| AC-037, AC-038 delivery date | F14 - A3 |
| AC-039..AC-044 frames and stock | F15, F16 - A4, A5, A6 |
| AC-045, AC-046 lead time | F17 - A7 |
| AC-047..AC-049 date calculation | shown on C6 as returned by the API |

## Proposed route changes

The routes in the brief stay as they are. Additions:

- **P-1 `/admin` redirects to `/admin/orders`.** Typing the short address should land somewhere.
- **P-2 Draft kept in `sessionStorage` (customer, `/`).** Phone browsers often throw away a background tab (the customer switches to their mail to copy an address), and a reload would lose the preview and everything typed. Proposal: keep `drawingId`, `previewToken`, the SVG markup, `expiresAt`, the chosen frame and the entered details (never the photo) in `sessionStorage` under one key; clear it on order placed (keeping only the confirmation for C6), on **Start again** and when `expiresAt` passes. `sessionStorage` is per tab and gone when the tab closes. **Needs the security engineer's OK** (the token and personal data sit in the browser while the tab is open; in-memory state has the same XSS exposure). Without P-2 a reload starts again at C1.
- **P-3 Order list filter in the URL:** `/admin/orders?status=open|received|drawing|drawn|ready_to_ship|shipped|cancelled|all` (default `open`), so the filter survives reload and Back from an order.
- **P-4 Login return path:** `/admin/login?next=/admin/orders/<id>`; only same-origin paths starting with `/admin/` are followed (no open redirect).
- **P-5 Customer steps stay on `/`** with the step in `history.state` (Back works, no deep links to a step without its draft).

## Gaps in the contract and specs (for the lead)

- **G-1 Admin can't view the drawing without changing the status.** AC-030 says the order detail shows the drawing, but the only way to get it is `GET /admin/orders/{id}/drawing.svg`, which moves a Received order to Drawing. Using it as an `<img src>` would start the drawing just by opening the order (and a GET with a side effect can also be triggered by prefetching). Proposal: a side-effect-free `GET /api/v1/admin/orders/{id}/drawing` (inline `image/svg+xml`, no status change), keeping the download as is. Until then A3 shows only the drawing facts.
- **G-2 No "open orders" filter.** `status` takes one value; the natural default list is everything not shipped or cancelled (otherwise "All" sorted by delivery date puts old shipped orders on top forever). Proposal: allow `status` to repeat (`?status=received&status=drawing...`) or add `status=open`. Fallback: the web app fetches all and filters.
- **G-3 No order date in the order responses.** AC-029 and AC-030 show the order date and AC-038 needs it as the minimum delivery date, but `OrderSummary`/`OrderDetail` have only `createdAt` (UTC). The web app would have to repeat the Amsterdam-date rule. Proposal: add `orderDate` (`YYYY-MM-DD`, Europe/Amsterdam).
- **G-4 HEIC photos can't be shown in most browsers.** Order photos are returned as uploaded; Chrome and Firefox can't display HEIC. Proposal: the API returns a JPEG rendition for viewing (e.g. `/photo?format=jpeg`). Fallback in A3: "This photo can't be shown in this browser" + **Download photo**.
- **G-5 The drawing area isn't exposed.** The frame form hint and the AC-040 message need "180 x 267 mm", which is deployment configuration. Proposal: `GET /api/v1/admin/settings` also returns `drawingArea { widthMm, heightMm }` (read-only). Fallback: the default values in the text and the API's message for `frame_too_small`.
- **G-6 A lost response when placing an order leaves the customer without an order number.** On a flaky phone connection the order may be created but the 201 lost; the retry gets 409 `drawing_already_ordered` and the customer never sees their number (no emails in this slice). Proposal: placing an order again with the same `drawingId` and `previewToken` returns 200 with the same `OrderConfirmation` (idempotent), and `drawing_already_ordered` only when the token doesn't match. This matters more because C6 is the customer's only record of the order.
- **G-7 No contact address for customers.** Several messages (and WCAG 3.2.6 consistent help) need a way to reach the shop. The owner needs to give an email address (`{contactEmail}`), configured in the web app.
- **G-8 Payment wording and the order button.** Q-8 leaves payment open, but the customer must be told how and when they pay (`c5.payment`, `c6.payment` are placeholders), and EU consumer law (Consumer Rights Directive art. 8(2), in NL/BE law) requires the order button to say that ordering means an obligation to pay, e.g. "Order with obligation to pay" / "Bestellen met betaalverplichting". "Place order" is in `content.md` for now; add to Q-10's legal check.
- Smaller: the 429 `Retry-After` header is relied on for the wait time in messages - keep it on every rate-limited response. `invalid_transition` messages should name the current status (AC-034) - the web app reloads the order and uses its own text, so the API message is only a fallback.
