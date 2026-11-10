# User flows - first slice (kickstart)

Sources: `openspec/changes/kickstart/` (proposal, design, `specs/*/spec.md` with AC-001..AC-066), `docs/domain/business-rules.md` (BR-001..BR-018), `docs/domain/glossary.md`, `docs/api/openapi.yaml`. Screens (`C*`, `A*`, `X*`) are in `screens.md`, texts (keys) in `content.md`, requirements `UX-xxx` in `accessibility.md`.

Words: always the glossary's terms - **photo**, **drawing**, **preview**, **frame**, **stock**, **order**, **order number**, **estimated delivery date** (admin: "Delivery date"), **lead time**, **photo terms**, status names **Received, Drawing, Drawn, Ready to ship, Shipped, Cancelled**. Never "upload", "sketch", "canvas", "inventory" or "Submit" in the UI.

## Customer flows

The customer flow is one page at `/` with four steps and a confirmation: **1 Photo** (C1, with C2 while the drawing is made) -> **2 Preview** (C3) -> **3 Frame** (C4) -> **4 Details** (C5) -> **Confirmation** (C6). Each step change pushes a browser history entry (route stays `/`), so the phone's Back button goes to the previous step; focus moves to the new step's heading and the page title changes (UX-003, UX-015). Nothing the customer entered is lost when they go back, or when an error sends them to an earlier step (UX-026, WCAG 3.3.7). All state lives in memory only: a reload or a closed tab starts again at C1 (F9).

### F1 Make a drawing (AC-001, AC-005, AC-006, AC-007, AC-056; BR-001..BR-004, BR-016)
**Who:** customer, on a phone - **Goal:** see what their photo looks like as a fineline drawing - **Entry:** opens the shop at `/`
1. On **Photo** (C1) the customer reads what works best and the photo requirements, and selects **Choose a photo**. The phone offers camera or photo library.
2. The web app pre-checks type and size (and the shortest side when the browser can read the image). Passing photos are sent at once - there is no separate "upload" button.
3. **Making your drawing** (C2): an indeterminate progress indicator, a pen animation (static under reduced motion) and the text "Making your drawing. This usually takes a few seconds.", announced once by a polite live region (UX-008), plus **Cancel**. The frames are fetched in the background so step 3 is instant.
4. **Preview** (C3) shows the drawing as an `<img>` whose source is a data URL of the returned SVG (never inserted as markup, AC-056) on a white "sheet", with the note "What you see is exactly what we'll draw." Focus moves to "Your drawing is ready".
5. The customer selects **Choose a frame** (F4) or **Try another photo** (F2).

**Alternative paths:**
- Customer selects **Cancel** during C2: the request is aborted, C1 is shown again (the server deletes the unordered photo within 24 h, BR-010).
- Photo rejected (F3), conversion unavailable (F3b).

### F2 Try another photo (AC-008, AC-009; BR-017)
**Who:** customer - **Goal:** a better drawing - **Entry:** **Try another photo** on C3, or any rejection on C1
1. The customer selects **Try another photo** on C3. The preview is discarded in the browser (its `drawingId` and `previewToken` are forgotten, so it can no longer be ordered from this page) and C1 is shown with tips "Works best with good light, one face and a plain background". Focus goes to **Choose a photo**.
2. The customer chooses a second photo -> C2 -> C3 with the new preview; the order step (C5 summary and **Place order**) uses only this second preview (AC-009).
- No detail or crop controls are offered (BR-017, AC-009). A chosen frame and entered details are kept for when they reach C4/C5 again.

### F3 Photo rejected (AC-002, AC-003, AC-004, AC-008, AC-050..AC-053; BR-001)
**Entry:** a photo fails the browser pre-check or the API answers 400/413
1. C1 shows the **error state**: an error notice with the message for the code (`content.md` C1 errors), e.g. "Use a JPEG, PNG or HEIC photo." Focus moves to the notice (UX-006); **Choose a photo** stays right under it.
2. The customer chooses another photo -> F1 step 2.
- Pre-check failures (wrong type, over 15 MB, shortest side under 800 px when readable) show the same messages as the API and send nothing.
- `photo_no_drawable_content` (an all-black photo, AC-008): "We couldn't make a drawing from this photo. Please try another photo."
- `photo_too_many_pixels` (over 50 megapixels, AC-051, AC-053): "The photo may have at most 50 megapixels. Choose a smaller photo."
- `validation_failed` on upload (e.g. two files, AC-052; the web app never sends that, so only a tampered request sees it): "Choose one photo and try again."
- Any HTTP 413, also nginx's own without a JSON body, shows the too-large message (AC-003).

### F3b Drawing can't be made right now (AC-054, AC-055, AC-057)
**Entry:** API answers 503 `conversion_unavailable` (worker down, busy or timed out, or a result that failed the drawing check), 502/504 from the proxy, 429 `rate_limited`, or the network fails. The web app sets no timeout of its own.
1. C1 error state with **Try again** (resends the same photo; the browser still holds the file) and **Choose another photo**.
2. 503: "We can't make drawings right now. Please try again in a few minutes." (AC-054, AC-055). 429: the message names the wait from `Retry-After` ("You've made a lot of drawings in a short time. Please wait 15 minutes and try again.", AC-057); **Try again** stays available - pressing it early just shows the message again.

### F4 Order the drawing (AC-013..AC-018; BR-005..BR-008, BR-012, BR-015)
**Who:** customer - **Goal:** a framed drawing at home - **Entry:** **Choose a frame** on C3
1. **Frame** (C4): frames in stock as a radio group of cards - photo, name, frame size ("210 x 297 mm"), price incl. VAT ("€49.95"). The cheapest is listed first (API order); none is preselected. **Continue to your details**.
2. **Details** (C5): summary of drawing thumbnail, frame and price with **Change frame**; fields Name, Email, Country (Netherlands / Belgium), Street, House number, Postal code, City; the photo terms checkbox "I agree that my photo is used only to make my drawing" with an expandable **Read the photo terms**; the withdrawal notice, the price line and the payment note directly above **Place order** (AC-017).
3. The customer selects **Place order**. The browser checks required fields and formats first (same rules as the API); the button shows "Placing order..." and ignores further presses (UX-022).
4. **Confirmation** (C6), after a 201 (new order) or a 200 (replay, F8): "Thank you, your order is placed", the order number large (`FL-2026-0042`), estimated delivery date ("Tuesday 17 November 2026"), frame, price, name and delivery address - **all taken from the response**, never from the form (AC-018, AC-058). What happens next. The confirmation replaces the form in history, so Back can't resubmit; the preview, token and details are dropped from memory.
5. **Make another drawing** returns to C1 with an empty form.

**Alternative paths:** invalid details (F5), frame sold out (F6), preview expired (F7), network failure on Place order (F8). No frames in stock at all: C4 empty state.

### F5 Missing or invalid details (AC-014, AC-015, AC-016; BR-007)
**Entry:** **Place order** with missing/invalid fields, from the browser check or a 400 `validation_failed` / `country_not_supported` / `photo_terms_not_accepted`
1. Nothing is ordered. An error summary "There is a problem" appears at the top of the form listing each problem as a link to its field; focus moves to the summary (UX-006).
2. Each field with a problem shows its message under the label, linked with `aria-describedby`, and `aria-invalid="true"`. AC-014: "Enter a valid email address, like name@example.com", "Enter your city", "Enter a Dutch postal code, like 1234 AB".
3. Everything entered stays in the form (AC-014). Fixed fields clear their error when they lose focus; the summary updates on the next **Place order**.
- The country choice offers only Netherlands and Belgium, so `country_not_supported` (AC-015) can only come from a tampered request; it still maps to "We deliver to the Netherlands and Belgium only." on the Country field.
- Not ticking the photo terms (AC-016): "Tick the box to agree to the photo terms. We can only make your drawing with your agreement."

### F6 Frame sold out while filling in the form (AC-020; BR-006)
**Entry:** **Place order** answers 409 `frame_sold_out` (or 422 `frame_not_found`)
1. The web app goes back to **Frame** (C4) with a warning notice "This frame just sold out: Oak A4. Please choose another frame - your details and drawing are kept." Focus moves to the notice. The frames are fetched again; the sold-out frame is no longer listed and nothing is preselected.
2. The customer picks "Walnut 30x40" -> **Continue to your details** -> C5 with all details still filled in -> **Place order** -> C6.
- If no frame is left: C4 empty state "All our frames are sold out right now..." (the preview and details stay in the page until the preview expires).

### F7 Preview no longer available (AC-010, AC-011, AC-022; BR-010, BR-013)
**Entry:** **Place order** answers 404 `drawing_not_found`, or the browser sees that `expiresAt` has passed when the customer moves to another step or presses **Place order**
1. C3 is shown in its **expired state**: "This preview is no longer available. Please upload your photo again." with **Upload your photo again** (primary). Focus moves to the message.
2. The customer chooses the photo again -> C2 -> C3 (a deterministic conversion gives the same drawing for the same photo) -> **Choose a frame**: the chosen frame (if still in stock) and the details are kept -> C5 -> **Place order**.
- `drawing_not_found` is the same answer for an expired preview and for a wrong token (AC-010, AC-022), so the web app shows the same message for both.

### F8 No answer when placing the order (AC-058, AC-060; BR-018)
**Entry:** network failure or 5xx on **Place order**
1. C5 shows an error notice above the button: "We couldn't reach our shop. Check your internet connection and try again." **Place order** is available again; everything entered is kept.
2. On retry, if the first attempt had in fact created the order, the API answers 200 with the original confirmation (BR-018): C6 is shown exactly as after a 201, with the order number, price, delivery date, name and address **of the original order** from the response - even if the customer changed the frame or address in between (AC-058).
- 429 (more than 5 order requests in an hour, AC-060): "Too many tries in a short time. Please wait 20 minutes and try again." above the button.

### F9 Returning to the page
- Reload or the phone browser discarding the tab: the page starts again at C1 with an empty form; nothing is kept in browser storage in this slice (draft restore is "Later"). A reload of C6 also shows C1, so C6 tells the customer to note or screenshot the order number.
- Closing the tab: nothing is ordered; the server deletes the photo and preview after 24 h (BR-010).

## Admin flows

The admin tool is used on a laptop next to the robot arm, mostly with mouse and keyboard; every action works by keyboard alone (UX-020).

### F10 Log in and out (AC-024..AC-028, AC-061..AC-063; BR-011)
**Who:** admin - **Goal:** reach the orders - **Entry:** any `/admin/*` URL
1. Without a session every `/admin/*` route shows **Log in** (A1) at `/admin/login?next=<path>`; with a valid session `/admin/login` redirects to `/admin/orders`.
2. The admin enters username and password (password managers and paste work; **Show password** toggle) and selects **Log in**.
3. Success: to `next` (only a same-origin path under `/admin/`) or to **Orders** (A2) (AC-024).
4. Wrong credentials: "Wrong username or password." above the form; the username stays, the password is cleared, focus goes to the message (AC-025). Too many attempts (429): "Too many login attempts. Please wait 10 minutes and try again." with the wait from `Retry-After` (AC-061).
5. **Log out** in the admin header ends the session and shows A1 with "You're logged out." (AC-028).

**Session ends while working** (8 h idle or 24 h old, AC-063): when any admin call answers 401, the web app goes to `/admin/login?next=<current path>` and A1 shows "Your session has ended. Log in again to continue."; after logging in the admin is back on the same page (UX-023). Anything typed but not saved is lost; that is accepted for this slice.

### F11 Prepare the day's drawings (AC-029..AC-033; BR-009, processes.md "Admin prepares the day's drawings")
**Who:** admin - **Goal:** download the day's SVGs for the Rotrics software - **Entry:** after login, or **Orders** in the admin header
1. **Orders** (A2) opens at the **Open** filter (`GET /admin/orders`, default `status=open`: Received, Drawing, Drawn, Ready to ship), earliest delivery date first, with status, order date and delivery date (AC-029). The admin selects the **Received** filter (`/admin/orders?status=received`).
2. For each order the admin selects **Download SVG** in its row (`POST /admin/orders/{id}/drawing-download`; the web app saves the response body as `FL-2026-0042.svg`, AC-031). The file is saved; the row's status changes to **Drawing** in place (the row doesn't jump or vanish from the filtered list until the list is refreshed), and the status region announces "FL-2026-0042 downloaded. Status: Drawing." (UX-021). Focus stays on the row's action, which now reads **Mark drawn**.
3. The admin imports the files into the Rotrics software and lets the arm draw.
4. When a drawing is done, the admin selects **Mark drawn** in its row (or on the order detail) -> status **Drawn**, announced.
- Redo (pen ran dry): **Download SVG again** on the order detail (A3) uses the same `drawing-download` call, returns the same file and doesn't change the status (AC-032).
- Opening an order (order number link) shows **Order detail** (A3) with the drawing (fetched from the side-effect-free `GET .../drawing.svg`, so viewing never changes the status, AC-030), the photo and all actions.
- The API refuses a move (409 `invalid_transition`, e.g. the order was changed in another tab): "FL-2026-0044 is Drawn now, so it can't be cancelled." and the row/detail is reloaded (AC-034).

### F12 Frame and ship (AC-033, AC-036; BR-009)
**Entry:** **Orders**, filter **Drawn** or **Ready to ship**
1. After framing and packing: **Mark ready to ship** in the row -> **Ready to ship**.
2. On the order detail (A3) the admin reads the delivery address for the shipping label.
3. After handing it to the carrier: **Mark shipped** -> confirmation dialog "Mark FL-2026-0042 as shipped? Shipped orders can't change any more." -> **Mark shipped** -> **Shipped**. Shipped orders show no status actions and no delivery date change (AC-036).

### F13 Cancel an order (AC-034, AC-035, AC-036; BR-006, BR-009)
**Entry:** **Order detail** (A3) of an order in Received or Drawing
1. The admin selects **Cancel order** (only shown when `allowedNextStatuses` contains `cancelled`).
2. Dialog X5: "Cancel order FL-2026-0042?" - "The frame (Oak A4) goes back to stock. A cancelled order can't be reopened." - buttons **Keep order** (focused first) and **Cancel order** (destructive).
3. **Cancel order** -> status **Cancelled**, success notice "FL-2026-0042 is cancelled. Oak A4 is back in stock." (AC-035).
- Drawn / Ready to ship / Shipped orders have no **Cancel order** button; a refused attempt (stale page) shows the AC-034 message.

### F14 Change the delivery date of one order (AC-037, AC-038; BR-008)
**Entry:** **Order detail** (A3) of an order that isn't Shipped or Cancelled
1. In **Delivery date** the admin selects **Change delivery date**; a date field appears with the current date, minimum = the order's `orderDate`.
2. The admin picks Friday 20 November 2026 and selects **Save delivery date** -> "Delivery date changed to Friday 20 November 2026." The order list shows the new date; no other order changes (AC-037).
- A date before the order date (code `delivery_date_before_order_date`): "The delivery date can't be before the order date (Friday 6 November 2026)." on the field; the date stays (AC-038).
- **Cancel** closes the editor without changes.

### F15 Add a frame (AC-039, AC-040, AC-041; BR-006, BR-003)
**Entry:** **Frames** (A4) -> **Add frame**
1. **New frame** (A5): Name, Inner width (mm), Inner height (mm), Price in euros incl. VAT, Starting stock, Photo.
2. **Add frame** -> **Frames** (A4) with "Oak A4 added. Customers can order it now." (stock 0: "Oak A4 added. It isn't offered to customers until you add stock.") (AC-039).
- The API reports all problems together as one `validation_failed` with `details` per field (`name`, `widthMm`, `heightMm`, `priceCents`, `stock`, `photo`); the web app shows them per field with an error summary (UX-006): too small (AC-040) "The frame must be at least 180 x 267 mm inside, so the drawing fits." (numbers from `GET /admin/settings`); price 0, stock -1, no photo (AC-041) each named.

### F16 Edit a frame and adjust stock (AC-042, AC-043, AC-044; BR-006, BR-012)
**Entry:** **Frames** (A4) -> frame name
1. **Edit frame** (A6) has three independent sections, each with its own button: **Details** (name, size, price -> **Save changes**; note "Price changes apply to new orders only."), **Photo** (-> **Replace photo**), **Stock** (current stock; amount -> **Add to stock** / **Remove from stock**).
2. Supplier delivery: amount 5 -> **Add to stock** -> "Stock is now 5. Black A4 is offered to customers again." (AC-043).
3. Damaged frame: amount 1 -> **Remove from stock**. Removing more than there is: "Stock can't go below zero. There are 2 in stock, so you can remove at most 2." and the stock stays (AC-044).

### F17 Set the standard lead time (AC-045, AC-046; BR-008)
**Entry:** **Settings** in the admin header
1. **Settings** (A7) shows "Standard lead time" with the current value (7) and the unit "working days (Monday to Friday)".
2. The admin enters 10 and selects **Save lead time** -> "Lead time saved: 10 working days. It applies to orders placed from now on; existing orders keep their delivery date." (AC-045).
- 0, 2.5 or 61: "The lead time must be a whole number from 1 to 60." and the saved value stays (AC-046).

## Later (not in this slice)
- Emailed order confirmation and payment instructions; online payment.
- Order notes and "new drawing with the customer's agreement" (Q-12).
- Bulk "Download all received SVGs" as one ZIP.
- Deleting a customer's data on request (Q-24) - an action on A3.
- Drawing area and stroke budget in Settings (Q-2, Q-3).
- Customer drawing adjustments (detail, crop) (Q-9).
- Dutch translation; dark theme.
- Cut from this slice in the plan review: keeping the customer's draft and the confirmation across a reload (`sessionStorage`); a "Log in again" dialog that replays the failed request; upload percentage and a "still working" phase on C2; "View full size" for the preview; Copy buttons (order number, address); the "Late" tag; drag and drop of photos; stacked-row admin lists on narrow screens.
