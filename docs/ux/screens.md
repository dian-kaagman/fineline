# Screen inventory - first slice

Every screen lists all its states. Texts are given in short here; the exact strings and their keys are in `content.md` (key in brackets, e.g. `[c1.heading]`). Requirements `UX-xxx` are in `accessibility.md`. Web only (no native app); all screens mobile first, admin screens designed for a 1280 px laptop and still usable down to 320 px / 200 % zoom (UX-013).

## Routes

| Route | Screen(s) | Notes |
|---|---|---|
| `/` | C1-C6 (customer flow, one page with steps) | Step kept in `history.state` (`{ step: "photo" \| "preview" \| "frame" \| "details" \| "confirmation" }`); Back goes one step back; the confirmation uses `replaceState` so Back can't resubmit. No step URLs: a step can't be deep-linked without its draft |
| `/admin` | - | **Proposed:** redirect to `/admin/orders` |
| `/admin/login` | A1 | Query `next` = path to return to (only same-origin paths starting with `/admin/`; anything else is ignored). With a session: redirect to `/admin/orders` |
| `/admin/orders` | A2 | **Proposed:** query `status` = `open` (default) \| `received` \| `drawing` \| `drawn` \| `ready_to_ship` \| `shipped` \| `cancelled` \| `all`, so the filter survives reload and Back from A3 |
| `/admin/orders/:id` | A3 | |
| `/admin/frames` | A4 | |
| `/admin/frames/new` | A5 | |
| `/admin/frames/:id` | A6 | |
| `/admin/settings` | A7 | |
| anything else | X3 | "Page not found" (under `/admin/` inside the admin layout, after the login check) |

Every `/admin/*` route except `/admin/login` first checks the session (`GET /api/v1/admin/session`): while checking it shows nothing but the admin header skeleton (no order data flashes), then either the screen or a redirect to A1 (AC-026).

---

## Shared

### X1 Shop layout (customer)
- **Purpose:** frame for C1-C6
- **Content:** skip link "Skip to content" [shop.skip]; header: wordmark "Fineline" (link to `/`, which restarts at C1 only after confirming if a draft exists - see below) and tagline [shop.tagline]; step indicator (C1-C5 only); `<main>` with the step; footer: contact line [shop.footer.contact], "Photos are processed on our own server" [shop.footer.privacy].
- **Step indicator:** "Step 2 of 4: Preview" as text plus an ordered list Photo - Preview - Frame - Details, current step marked `aria-current="step"`, done steps with a check icon. Not interactive (UX-017).
- **Wordmark with a draft:** selecting "Fineline" in steps 2-4 asks "Start again? Your drawing and details will be cleared." **Start again** / **Keep going** (X5 pattern dialog). Without a draft it just shows C1.
- **Layout:** single column, max `content-max-shop`, padding `space.4` (phone) / `space.6` (from `bp.md`). Primary buttons full width below `bp.sm`; on wider screens primary right, secondary left of it.
- **Accessibility:** header/main/footer landmarks; one `h1` per step (the step heading); `<html lang="en">`; viewport meta never disables zoom (UX-013, UX-016).

### X2 Admin layout
- **Purpose:** frame for A2-A7
- **Content:** skip link; header (sticky, `header-height`): "Fineline admin" (link to A2), nav **Orders**, **Frames**, **Settings** (`aria-current="page"` on the current one), **Log out** button at the right; `<main>` max `content-max-admin`; one polite status region for action results (UX-021) at the top of main.
- **States:**
  - checking session: header with nav, main empty with "Loading..." visually hidden in the status region; no data shown
  - logging out: **Log out** busy ("Logging out..."); then A1 with [a1.loggedOut]
  - log out fails (network): error notice [admin.error.network]; stays logged in
- **Accessibility:** header/nav/main landmarks; nav labelled "Admin"; focus to the `h1` after each route change (UX-003); sticky header never covers the focused element (`scroll-padding-top`, UX-002).

### X3 Page not found
- **Content:** h1 "Page not found" [x3.heading], text [x3.body], link **Go to the shop** (customer) / **Go to orders** (admin).
- **States:** only this one.

### X4 Log in again (admin dialog)
- **Purpose:** keep the admin's work when the session ends (UX-023)
- **Trigger:** any admin API call answers 401 `unauthenticated` (except on A1)
- **Content:** modal dialog, h2 "Your session has ended" [x4.heading], text "Log in again to continue. Nothing you entered is lost." [x4.body], Username, Password, **Log in** (primary), **Go to the login page** (secondary).
- **States:**
  - default: focus on Username (prefilled with the last username if the browser has it)
  - submitting: **Log in** busy "Logging in..."
  - error: [a1.error.invalidCredentials] / [a1.error.rateLimited] / [admin.error.network] inside the dialog, focus to the message
  - success: dialog closes, the failed request is sent again, focus returns to the control that triggered it
- **Accessibility:** UX-024 (modal dialog), UX-007 (autocomplete).

### X5 Confirmation dialog (pattern)
- **Purpose:** confirm irreversible actions: cancel order, mark shipped, start again (shop)
- **Content:** modal `<dialog>`, h2 naming the action and the order number, one sentence with the consequence, buttons: safe choice first and focused (**Keep order** / **Not yet** / **Keep going**), then the action (**Cancel order** destructive style / **Mark shipped** primary / **Start again** primary).
- **States:** default; busy (action button "Cancelling..." / "Saving..."); error (message inside the dialog, dialog stays open, focus to the message); success (dialog closes, focus returns to the main heading of the page section that changed, result announced).
- **Accessibility:** UX-024, UX-032.

---

## Customer screens (route `/`)

### C1 Photo (step 1 of 4)
- **Purpose:** choose the photo the drawing is made from
- **Content:** h1 [c1.heading] "Turn your photo into a fineline drawing"; lead [c1.lead]; a small example drawing (decorative, `alt=""`); tips list "Works best with" [c1.tips.*]; requirements line [c1.requirements] "JPEG, PNG or HEIC, up to 15 MB, at least 800 pixels on the shortest side"; privacy line [c1.privacy].
- **Actions:** **Choose a photo** (primary) = a styled `<label>` for a native `<input type="file" accept="image/jpeg,image/png,image/heic,.jpg,.jpeg,.png,.heic">`; the requirements line is linked with `aria-describedby`. From `bp.md` the drop zone also accepts a dragged file (optional extra, UX-028).
- **States:**
  - empty (initial): as above
  - pre-checking: invisible (< 100 ms); then straight to C2
  - error - photo rejected (F3): danger notice above **Choose a photo** with the code's message [c1.error.*], focus to the notice; the rest of C1 unchanged
  - error - drawing can't be made now (F3b): danger notice [c1.error.conversionUnavailable] / [c1.error.rateLimited] / [c1.error.network] / [c1.error.timeout] with **Try again** (primary, resends the same file) and **Choose another photo** (secondary)
  - cancelled (from C2): info notice [c1.cancelled] "Stopped. Choose a photo when you're ready."
  - after "Try another photo" (F2): tips list moved above the button and the heading [c1.headingRetry] "Choose another photo"
  - disabled: never - **Choose a photo** is always available
- **Accessibility:** UX-004 (whole button 44 px high), UX-005, UX-006 (error notice is focused and has `role="alert"`), UX-028.

### C2 Making your drawing (state of step 1)
- **Purpose:** show that work is in progress until the preview is ready (AC-007)
- **Content:** h1 [c2.heading] "Making your drawing"; the customer's own photo as a small thumbnail from a local object URL when the browser can show it (`alt="Your photo"`; HEIC on non-Safari: no thumbnail); a pen animation drawing a line (decorative, `aria-hidden`); phase text; a `<progress>` bar.
- **Phases (each replaces the phase text; announced in the live region, UX-008):**
  1. uploading: [c2.uploading] "Sending your photo... 45 %" with a determinate `<progress>` (from `XMLHttpRequest.upload.onprogress`)
  2. converting: [c2.converting] "Finding the lines in your photo. This usually takes a few seconds." indeterminate `<progress>` (no `value`)
  3. slow (10 s after the upload finished): [c2.slow] "Still working - detailed photos take a little longer."
  4. too slow (45 s after the upload finished): abort -> C1 error [c1.error.timeout]
- **Actions:** **Cancel** (secondary) -> aborts the request -> C1 cancelled state.
- **States:** the phases above are its loading states; success -> C3; any error -> C1 error states; offline during upload -> C1 [c1.error.network].
- **Accessibility:** UX-008 (live region exists before the upload starts; at most one announcement per phase), UX-010 (static pen illustration under reduced motion; the `<progress>` bar has no animated stripes), the step `<main>` has `aria-busy="true"` while converting.

### C3 Preview (step 2 of 4)
- **Purpose:** look at the drawing and decide (BR-005, BR-017)
- **Content:** h1 [c3.heading] "Your drawing is ready"; the drawing sheet: `<img src="data:image/svg+xml;...">` built from the returned markup (never inlined), `alt` [c3.preview.alt] "Preview of your line drawing, made from your photo", on `color.surface` with `shadow.paper`, keeping the drawing's aspect ratio (`widthMm / heightMm`); caption [c3.size] "Drawn in black fineliner by our pen robot, 18 x 26.7 cm"; notice [c3.whatYouSee] "What you see is exactly what we'll draw."; hint [c3.notQuiteRight].
- **Actions:** **Choose a frame** (primary) -> C4; **Try another photo** (secondary) -> F2; **View full size** (text button) -> dialog with the drawing at 100 % width of the viewport, scrollable both ways, **Close** (UX-030).
- **Layout:** phone: sheet full width, buttons below. From `bp.lg`: sheet left (max 60 %), text and buttons right.
- **States:**
  - success: as above
  - expired (F7): sheet replaced by a warning notice [c3.expired] "This preview is no longer available. Please upload your photo again." + **Upload your photo again** (primary, opens the file chooser) - focus to the notice. Step indicator stays at step 2
  - loading: none (C2 covers it); restoring a draft after reload (P-2): the sheet shows a `color.surface-sunken` placeholder of the right aspect ratio for < 100 ms
  - empty/error/disabled: not applicable (a preview only exists after a successful conversion)
- **Accessibility:** UX-009, UX-003 (focus to h1 on arrival, so screen readers hear "Your drawing is ready"), UX-030.

### C4 Frame (step 3 of 4)
- **Purpose:** choose a frame that is in stock (AC-013)
- **Content:** h1 [c4.heading] "Choose a frame"; hint [c4.vatNote] "Prices include VAT."; a `<fieldset>` with visually hidden `<legend>` "Frame" holding one radio card per frame: frame photo (`alt=""` - the name is right next to it; the photo is decorative for the choice), name (`font.size-md` semibold), frame size [c4.frameSize] "210 x 297 mm", price "€49.95". Order as the API returns (price ascending). 1 column on phones, 2 from `bp.sm`.
- **Actions:** select a card (whole card is the label, at least 44 px high); **Continue to your details** (primary); **Back to your drawing** (secondary) -> C3.
- **States:**
  - loading: 3 skeleton cards; **Continue** visible (pressing it shows the "choose a frame" error only once frames are there)
  - empty (no frame in stock): info notice [c4.empty] "All our frames are sold out right now. We're restocking - please come back soon." **Continue** hidden; **Back to your drawing** stays
  - error (frames didn't load): danger notice [c4.error.load] + **Try again**
  - sold out (F6): warning notice at the top [c4.soldOut] "Sorry, this frame just sold out: {frameName}. Please choose another frame. Your details and drawing are kept." - focus to the notice; list refreshed; nothing selected
  - nothing selected on **Continue**: inline error on the fieldset [c4.error.required] "Choose a frame to continue." - `aria-describedby` on the fieldset, focus to the first radio
  - success: selected card has 2 px `color.primary` border, `color.primary-subtle` background and a check icon (UX-011)
  - disabled: never; sold-out frames are not listed at all (BR-006)
- **Accessibility:** UX-018 (native radios, arrow keys move between frames, each radio's name = "Oak A4, 210 x 297 mm, €49.95"), UX-004, UX-011.

### C5 Details (step 4 of 4)
- **Purpose:** enter who and where, agree to the photo terms, place the order (AC-014..AC-017)
- **Content (top to bottom):**
  1. h1 [c5.heading] "Your details"
  2. summary card: drawing thumbnail (`alt` [c5.summary.drawingAlt] "Your drawing"), frame name + size, price; **Change frame** (text button -> C4)
  3. intro [c5.allRequired] "All fields are required."
  4. **Name** [c5.name.label] (`autocomplete="name"`)
  5. **Email** [c5.email.label] + hint [c5.email.hint] (`type="email"`, `autocomplete="email"`, `inputmode="email"`, `spellcheck="false"`)
  6. fieldset **Delivery address** [c5.address.legend] with hint [c5.address.hint] "We deliver to the Netherlands and Belgium.": **Country** radios Netherlands / Belgium (`name="country"`, default none selected; changing it updates the postal code hint), **Street** (`autocomplete="address-line1"`), **House number** (no autocomplete token; `inputmode="text"`, hint "Including any addition, like 12a"), **Postal code** (`autocomplete="postal-code"`, hint by country: "Like 1234 AB" / "4 digits, like 1000"), **City** (`autocomplete="address-level2"`). From `bp.sm`: Street and House number on one row (3:1), Postal code and City on one row (1:2).
  7. **Photo terms**: checkbox [c5.terms.label] "I agree that my photo is used only to make my drawing" + disclosure `<details>` **Read the photo terms** [c5.terms.more] with the terms text [c5.terms.body]
  8. price line [c5.total] "Total: €49.95 (including VAT)"
  9. withdrawal notice (info notice) [c5.withdrawal] - always visible, directly above the button (AC-017)
  10. payment note [c5.payment] (owner to confirm, Q-8)
  11. **Place order** (primary) [c5.submit]; **Back to frames** (secondary)
- **States:**
  - empty: fields empty (or restored from the draft)
  - invalid (F5): error summary at the top of the form [form.errorSummary.heading] with links; inline errors; focus to the summary (UX-006)
  - submitting: **Place order** busy [c5.submitting] "Placing order..."; fields stay editable but a second press does nothing (UX-022)
  - error - sold out -> C4 sold-out state; expired -> C3 expired state; already ordered [c5.error.alreadyOrdered]; network/5xx [c5.error.network]; rate limited [c5.error.rateLimited] - all as a danger notice directly above **Place order**, focus to it, fields kept
  - success -> C6
  - disabled: never - **Place order** is always enabled; problems are explained on press (UX-022)
- **Accessibility:** UX-005, UX-006, UX-007, UX-026, UX-004 (checkbox row and radio rows 44 px high).

### C6 Confirmation
- **Purpose:** show the order number and estimated delivery date (AC-018)
- **Content:** success icon (decorative); h1 [c6.heading] "Thank you, your order is placed"; **Order number** label + value `FL-2026-0042` (`font.size-2xl`, mono) + **Copy order number** (text button; after copying its label reads "Copied" for 3 s and the status region says "Order number copied"); [c6.keepNumber]; facts list (`<dl>`): Estimated delivery date "Tuesday 17 November 2026", Frame "Oak A4", Price "€49.95 (including VAT)", Delivery address (as entered, 3 lines); "What happens next" ordered list [c6.next.*]; payment note [c6.payment]; **Make another drawing** (secondary).
- **States:** success only (the screen exists only after a 201). No step indicator. On success the draft (token, SVG, details) is cleared; with P-2 only the confirmation (order number, date, frame, price) is kept in `sessionStorage` until **Make another drawing** or the tab closes, so a reload shows C6 again. Without P-2 a reload shows C1. C6 is the customer's only record of the order (no emails), see G-6.
- **Accessibility:** UX-003 (focus to h1), UX-021 (copy result announced), UX-015 (title "Order placed - Fineline").

---

## Admin screens

### A1 Log in (`/admin/login`)
- **Purpose:** the only way into the admin tool (AC-024, AC-025)
- **Content:** centred card max 24rem: h1 [a1.heading] "Log in to Fineline admin"; **Username** (`autocomplete="username"`, `autocapitalize="none"`, `spellcheck="false"`); **Password** (`type="password"`, `autocomplete="current-password"`) with **Show password** toggle button (`aria-pressed`); **Log in** (primary).
- **States:**
  - empty: focus not moved automatically on load (the h1 is the first thing read)
  - submitting: **Log in** busy [a1.submitting] "Logging in..."
  - error - wrong credentials: danger notice [a1.error.invalidCredentials] "Wrong username or password." above the fields; password cleared; username kept; focus to the notice (AC-025)
  - error - empty field: inline "Enter your username" / "Enter your password" (no request sent)
  - error - rate limited: [a1.error.rateLimited]; network: [admin.error.network]
  - info - logged out: success notice [a1.loggedOut] "You're logged out."
  - info - redirected because the session ended (deep link without session): info notice [a1.sessionEnded] "Log in to continue." (shown only when `next` is present)
  - success: navigate to `next` or A2 (AC-024)
  - disabled: never
- **Accessibility:** UX-007 (paste and password managers allowed, WCAG 3.3.8), UX-005, UX-006.

### A2 Orders (`/admin/orders`)
- **Purpose:** see and work through orders (AC-029, AC-031, AC-033); the start of F11
- **Content:** h1 [a2.heading] "Orders"; filter nav "Filter orders by status" [a2.filter.label] as links: **Open** (default) **Received** **Drawing** **Drawn** **Ready to ship** **Shipped** **Cancelled** **All**, current one `aria-current="page"`; **Refresh list** (secondary); the list.
- **List (from `bp.md` a `<table>`, below it stacked rows with the same content):** caption [a2.caption] "{filterName} orders, earliest delivery date first - {count} orders". Columns:
  | Column | Content |
  |---|---|
  | Order number | link to A3, mono font (`FL-2026-0042`) |
  | Status | status badge (UX-011) |
  | Delivery date | "Tue 17 Nov 2026"; plus a **Late** tag (warning icon + text) when the date is before today (Europe/Amsterdam) and the status is not Shipped/Cancelled |
  | Order date | "Fri 6 Nov 2026" |
  | Customer | customer name |
  | Frame | frame name |
  | Next step | one button for the next step: Received **Download SVG**; Drawing **Mark drawn**; Drawn **Mark ready to ship**; Ready to ship **Mark shipped** (opens X5); Shipped/Cancelled: none. Accessible name includes the order number (UX-027). Min height `target-min-dense` |
- **States:**
  - loading: caption "Loading orders..." and 5 skeleton rows; filter links usable
  - empty - Open: [a2.empty.open] "No open orders. New orders appear here as soon as customers place them."
  - empty - other filter: [a2.empty.filtered] "No orders with status {status}." + link **Show all orders**
  - error: danger notice [a2.error.load] + **Try again**
  - row busy: that row's button busy ("Downloading..." / "Saving..."), other rows usable
  - row action done: row updates in place (status badge, next-step button), success announced in the status region [a2.done.*]; the row stays in the list until **Refresh list** or a filter change, even when it no longer matches the filter
  - row action refused (409 `invalid_transition`): danger notice above the table [admin.error.invalidTransition] naming the current status; the list reloads
  - download failed: danger notice [a2.error.download]; status unchanged
  - success: list as above
- **Data:** `GET /api/v1/admin/orders?status=...` (sorted by the API: delivery date ascending, then order number). **Open** needs the multi-status filter proposed in `README.md` (G-2); until it exists the web app fetches all orders and filters client-side.
- **Accessibility:** UX-019, UX-020, UX-021, UX-027.

### A3 Order detail (`/admin/orders/:id`)
- **Purpose:** everything about one order and all its actions (AC-030..AC-038)
- **Content:**
  - back link **All orders** (returns to A2 with the previous filter)
  - h1 [a3.heading] "Order FL-2026-0042" + status badge next to it
  - **Next step** section (h2 [a3.nextStep.heading] "Next step"): buttons from `allowedNextStatuses` and status:
    | Status | Primary | Secondary | Destructive |
    |---|---|---|---|
    | Received | **Download SVG** + hint [a3.download.hint] "Downloading starts the drawing: the status changes to Drawing." | - | **Cancel order** (X5) |
    | Drawing | **Mark drawn** | **Download SVG again** | **Cancel order** (X5) |
    | Drawn | **Mark ready to ship** | **Download SVG again** | - |
    | Ready to ship | **Mark shipped** (X5) | **Download SVG again** | - |
    | Shipped / Cancelled | - | **Download SVG** | - ; text [a3.final] "Shipped and cancelled orders don't change any more." |
  - **Delivery date** (h2): "Tuesday 17 November 2026" (+ **Late** tag as in A2) and **Change delivery date** (hidden for Shipped/Cancelled). Editing: `<input type="date">` with `min` = order date, **Save delivery date** (primary), **Cancel** (text button).
  - **Drawing** (h2): the drawing on a white sheet (`alt` [a3.drawing.alt] "Drawing for order FL-2026-0042"), facts: size "180 x 267 mm", strokes "812 strokes", total line length "14.3 m"
  - **Photo** (h2): the customer's photo (`alt` [a3.photo.alt] "Customer's photo for order FL-2026-0042"), max 20rem wide
  - **Customer** (h2): name, email (as `mailto:` link), delivery address (3 lines) + **Copy address**
  - **Order** (h2): order date "Friday 6 November 2026", frame (link to A6), price "€49.95"
- **Layout:** below `bp.lg` one column in the order above; from `bp.lg` two columns: left Drawing and Photo, right the rest.
- **States:**
  - loading: heading "Order" + skeleton blocks; no actions
  - not found (404): h1 [a3.notFound.heading] "Order not found" + link **All orders**
  - error: danger notice [a3.error.load] + **Try again**
  - action busy: the pressed button busy; other actions `aria-disabled` until done
  - action done: status badge, next step and delivery date section re-render from the returned order; result in the status region [a3.done.*]; focus to the "Next step" heading
  - action refused (409 `invalid_transition`, `order_closed`): danger notice in that section, order reloaded
  - delivery date invalid (400): inline error on the date field [a3.date.error.beforeOrderDate] / [a3.date.error.invalid]
  - photo deleted (`photoAvailable: false`, or 410): Photo section shows [a3.photo.deleted] "The customer's photo was deleted 30 days after the order was closed. The drawing is kept." (AC-012)
  - photo not displayable (HEIC in a browser without HEIC support): [a3.photo.noPreview] "This photo can't be shown in this browser." + **Download photo** (see G-4)
  - drawing view: needs a side-effect-free drawing endpoint (G-1); until then the Drawing section shows only the facts and [a3.drawing.notShown]
  - success: as above
- **Accessibility:** UX-003, UX-020, UX-021, UX-024, UX-027, UX-032; date field labelled "New delivery date" with the hint "Not before the order date, Friday 6 November 2026".

### A4 Frames (`/admin/frames`)
- **Purpose:** see all frames and their stock (AC-039, AC-043)
- **Content:** h1 [a4.heading] "Frames"; **Add frame** (primary, link to A5); table (from `bp.md`; stacked rows below), caption [a4.caption] "All frames, by name":
  | Column | Content |
  |---|---|
  | Photo | thumbnail 48 px, `alt=""` (the name follows) |
  | Name | link to A6 |
  | Size | "210 x 297 mm" |
  | Price | "€49.95" |
  | Stock | number; at 0 also the tag **Sold out - not offered to customers** [a4.soldOutTag] |
- **States:**
  - loading: 3 skeleton rows
  - empty: [a4.empty] "No frames yet. Add a frame so customers can order." + **Add frame**
  - error: [a4.error.load] + **Try again**
  - success (after A5): success notice [a5.done] at the top, focus to it
  - success: as above
- **Accessibility:** UX-019 (table semantics as for A2).

### A5 New frame (`/admin/frames/new`)
- **Purpose:** add a frame model (AC-039..AC-041)
- **Content:** back link **Frames**; h1 [a5.heading] "Add a frame"; [form.allRequired]; fields:
  - **Name** (text, max 100) hint "Shown to customers, e.g. Oak A4"
  - **Inner width (mm)** and **Inner height (mm)** (text, `inputmode="numeric"`) with shared hint [a5.size.hint] "The visible inside of the frame. At least 180 x 267 mm (portrait) so the drawing fits." (numbers from G-5; default values until then)
  - **Price (€, including VAT)** (text, `inputmode="decimal"`, accepts "49.95" and "49,95"; sent as cents) hint "Like 49.95"
  - **Starting stock** (text, `inputmode="numeric"`) hint "How many you have now. Later changes go through stock adjustments."
  - **Photo** (native file input, `accept="image/jpeg,image/png,image/webp"`) hint [a5.photo.hint] "JPEG, PNG or WebP, up to 5 MB. Customers see this photo." + local preview thumbnail after choosing
- **Actions:** **Add frame** (primary); **Cancel** (secondary, back to A4 without saving).
- **States:**
  - empty: as above
  - invalid: error summary + inline errors (UX-006); AC-040 [a5.error.tooSmall] on both size fields; AC-041 messages on price, stock and photo
  - submitting: **Add frame** busy "Adding frame..."
  - error: network [admin.error.network]; 413 [a5.error.photoTooLarge]
  - success -> A4 with [a5.done]
  - disabled: never
- **Accessibility:** UX-005, UX-006, UX-031.

### A6 Edit frame (`/admin/frames/:id`)
- **Purpose:** change details, photo and stock of one frame (AC-042..AC-044)
- **Content:** back link **Frames**; h1 = frame name; three sections, each its own form and button:
  1. **Details** (h2): Name, Inner width (mm), Inner height (mm), Price (€, including VAT) prefilled; note [a6.priceNote] "Price changes apply to new orders only. Existing orders keep their price."; **Save changes** (sends only changed fields)
  2. **Photo** (h2): current photo (`alt` [a6.photo.alt] "Current photo of Oak A4"); **Choose a new photo** file input; **Replace photo** (enabled look always; without a file: inline error "Choose a photo first")
  3. **Stock** (h2): "In stock: 5" (`font.size-xl`) or "In stock: 0 - sold out, not offered to customers"; **Number of frames** (text, `inputmode="numeric"`, whole number 1-10000) hint "For example 5 after a delivery, or 1 for a damaged frame."; **Add to stock** (primary) and **Remove from stock** (secondary)
- **States:**
  - loading: heading "Frame" + skeletons
  - not found: [a6.notFound] "Frame not found" + link **Frames**
  - error loading: [a6.error.load] + **Try again**
  - per section: invalid (inline errors; summary only in Details when there are 2+ errors), busy (that section's button), saved (success notice in that section [a6.done.*], announced; focus stays on the button), refused: `stock_negative` -> [a6.error.stockNegative] on **Number of frames** (AC-044), `frame_too_small` -> [a5.error.tooSmall]
  - no changes on **Save changes**: info [a6.noChanges] "Nothing changed."
  - disabled: never
- **Accessibility:** UX-005, UX-006, UX-021, UX-031; each section is a `<section>` with its h2 as `aria-labelledby`.

### A7 Settings (`/admin/settings`)
- **Purpose:** set the standard lead time (AC-045, AC-046)
- **Content:** h1 [a7.heading] "Settings"; section **Delivery** (h2): **Standard lead time** (text, `inputmode="numeric"`, width 6ch) with visible suffix "working days" inside the label's description; hint [a7.leadTime.hint] "Working days are Monday to Friday; public holidays count as working days. The new lead time applies to orders placed from now on. Existing orders keep their delivery date."; **Save lead time** (primary). Read-only line [a7.drawingArea] "Drawing area: 180 x 267 mm (set in the deployment configuration)" when the API provides it (G-5).
- **States:**
  - loading: field skeleton
  - error loading: [a7.error.load] + **Try again**
  - invalid: inline [a7.error.leadTime] "The lead time must be a whole number from 1 to 60." (AC-046); saved value unchanged
  - submitting: "Saving..."
  - saved: success notice [a7.done] (announced)
  - disabled: never
- **Accessibility:** UX-005, UX-006, UX-021.

## Later (one line each)
- Customer: photo terms / privacy page and contact page linked from the footer.
- Customer: order status lookup by order number and email.
- Admin: order notes and "contact customer" log (Q-12).
- Admin: "Delete customer data" on A3 (Q-24).
- Admin: search orders by order number or customer name.
- Admin: bulk SVG download for all received orders.
- Admin: drawing area and stroke budget in A7 (Q-2, Q-3).
