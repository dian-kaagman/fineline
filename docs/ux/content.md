# Microcopy - first slice

English UI, ready for translation (constraints.md; Q-28). Rules for builders:

- Every string comes from one message catalogue (e.g. `apps/web/src/i18n/en.ts`) under the key in the first column. No strings in components, no concatenating sentences from pieces; use the named placeholders shown in `{braces}` (ICU message format, so Dutch can reorder words) (UX-014).
- The web app shows **its own text for each API error `code`** from the tables below. For an unknown code it shows the API's `message` (which is safe to show), and for no response at all `*.error.network`.
- Where a scenario (`AC-xxx`) quotes a message, the text here contains it word for word; tests should match that AC text. A reference like "(AC-002)" at the end of a text is a note, not part of the text.
- Glossary terms only: photo, drawing, preview, frame, stock, order, order number, estimated delivery date (admin: delivery date), lead time, photo terms, stroke. Buttons say what they do; never "Submit", "OK" or "Click here".
- Texts marked **(owner to confirm)** are placeholders that need the owner's (or a lawyer's) wording before go-live.

## Formatting

| What | Rule | Example |
|---|---|---|
| Price | `Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" })` on `priceCents / 100`; always incl. VAT | 4995 -> "€49.95" |
| Estimated delivery date / order date, long (customer, A3) | Calendar date `YYYY-MM-DD` formatted as a date only, no time-zone shift: `Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })` on `Date.UTC(y, m-1, d)` | "2026-11-17" -> "Tuesday 17 November 2026" |
| Dates, short (A2 list) | as above with `weekday: "short", month: "short"` | "Tue 17 Nov 2026" |
| Order date from a timestamp | the calendar date of `createdAt` in `Europe/Amsterdam` (until G-3 gives `orderDate`) | "2026-11-05T23:30:00Z" -> "Friday 6 November 2026" |
| Frame size | `{widthMm} x {heightMm} mm` (plain "x", as in the specs) | "210 x 297 mm" |
| Drawing size (customer) | mm / 10, at most one decimal, in cm | 180 x 267 mm -> "18 x 26.7 cm" |
| Total line length (admin) | mm / 1000, one decimal, "m" | 14250.5 -> "14.3 m" |
| Order number | as returned, never reformatted, mono font | "FL-2026-0042" |
| Status | label from the status table below, never the code | `ready_to_ship` -> "Ready to ship" |
| Wait time (429) | `Retry-After` seconds rounded up to whole minutes; under 60 s: "a minute" | 90 -> "2 minutes" |

## Status names

| Code | Key | Label | Short description (A3 tooltip-free help text, `status.<code>.help`) |
|---|---|---|---|
| received | status.received | Received | The customer placed the order. Download the SVG to start drawing. |
| drawing | status.drawing | Drawing | The SVG was downloaded for the robot arm. |
| drawn | status.drawn | Drawn | The drawing is finished. Frame and pack it next. |
| ready_to_ship | status.ready_to_ship | Ready to ship | Framed and packed, waiting for the carrier. |
| shipped | status.shipped | Shipped | Handed to the carrier. This order doesn't change any more. |
| cancelled | status.cancelled | Cancelled | The order was cancelled and its frame went back to stock. This order doesn't change any more. |

Status action labels (buttons):

| Key | Text | Moves to |
|---|---|---|
| action.downloadSvg | Download SVG | received -> drawing (via the download) |
| action.downloadSvgAgain | Download SVG again | no change |
| action.markDrawn | Mark drawn | drawn |
| action.markReadyToShip | Mark ready to ship | ready to ship |
| action.markShipped | Mark shipped | shipped (after X5) |
| action.cancelOrder | Cancel order | cancelled (after X5) |
| action.rowSuffix | for {orderNumber} | visually hidden suffix on row buttons in A2, e.g. "Mark drawn for FL-2026-0042" (UX-027) |

## Shared customer texts (X1)

| Key | Text | Notes |
|---|---|---|
| shop.name | Fineline | Wordmark |
| shop.tagline | Your photo as a pen drawing, framed | Header, under the wordmark from `bp.sm` |
| shop.skip | Skip to content | |
| shop.title | {step} - Fineline | Document title pattern, e.g. "Step 2 of 4: Your drawing - Fineline" |
| shop.steps.label | Progress | `aria-label` of the step list |
| shop.steps.status | Step {current} of {total}: {name} | Visible text above the step list |
| shop.steps.photo / preview / frame / details | Photo / Preview / Frame / Details | Step names |
| shop.footer.contact | Questions? Email us at {contactEmail} | **(owner to confirm)** the contact address (G-7) |
| shop.footer.privacy | Your photo is turned into a drawing on our own server and is never shared. | |
| shop.startAgain.heading | Start again? | X5 dialog from the wordmark |
| shop.startAgain.body | Your drawing and the details you entered will be cleared. | |
| shop.startAgain.confirm | Start again | |
| shop.startAgain.cancel | Keep going | |
| shop.back | Back | Only where a specific "Back to ..." doesn't fit |
| form.allRequired | All fields are required. | |
| form.errorSummary.heading | There is a problem | Error summary heading (UX-006) |
| form.errorPrefix | Error: | Visually hidden prefix of every inline error |
| busy.generic | Please wait... | |

## C1 Photo

| Key | Text | Notes |
|---|---|---|
| c1.title | Step 1 of 4: Your photo | Document title |
| c1.heading | Turn your photo into a fineline drawing | h1 |
| c1.headingRetry | Choose another photo | h1 after "Try another photo" |
| c1.lead | Choose a photo and see your drawing in a few seconds. We draw it on paper with a pen robot, frame it and send it to you. | |
| c1.tips.heading | Works best with | |
| c1.tips.light | good, even light | |
| c1.tips.face | one or two faces, close up | |
| c1.tips.background | a plain background | |
| c1.requirements | JPEG, PNG or HEIC, up to 15 MB, at least 800 pixels on the shortest side. | Linked to the file input |
| c1.privacy | We only use your photo to make your drawing. If you don't order, we delete it within 24 hours. | |
| c1.choose | Choose a photo | Primary button (label of the file input) |
| c1.dropHint | or drop a photo here | Only from `bp.md`, inside the drop zone |
| c1.tryAgain | Try again | Resends the same photo |
| c1.chooseAnother | Choose another photo | |
| c1.cancelled | Stopped. Choose a photo when you're ready. | Info notice after Cancel on C2 |

C1 errors (danger notice, `role="alert"`, focused):

| Key | API code / cause | Text |
|---|---|---|
| c1.error.missing | `photo_missing` | Choose a photo to make your drawing. |
| c1.error.unsupportedType | `photo_unsupported_type`, pre-check | Use a JPEG, PNG or HEIC photo. (AC-002) |
| c1.error.tooLarge | `photo_too_large` (413), pre-check | The photo must be at most 15 MB. Choose a smaller photo. (AC-003) |
| c1.error.tooSmall | `photo_too_small`, pre-check | The photo's shortest side must be at least 800 pixels. Choose a larger photo. (AC-004) |
| c1.error.unreadable | `photo_unreadable` | We couldn't open this photo. It may be damaged. Please try another photo. |
| c1.error.noDrawableContent | `photo_no_drawable_content` | We couldn't make a drawing from this photo. Please try another photo. A photo with good light and a clear face works best. (AC-008) |
| c1.error.conversionUnavailable | `conversion_unavailable` (503) | We can't make drawings right now. Please try again in a few minutes. |
| c1.error.rateLimited | `rate_limited` (429) | You've made a lot of drawings in a short time. Please wait {wait} and try again. |
| c1.error.timeout | no answer 45 s after the upload | Making your drawing is taking much longer than usual. Please try again. |
| c1.error.network | no response / offline | We couldn't send your photo. Check your internet connection and try again. |

## C2 Making your drawing

| Key | Text | Notes |
|---|---|---|
| c2.title | Step 1 of 4: Making your drawing | |
| c2.heading | Making your drawing | h1 |
| c2.photoAlt | Your photo | Thumbnail alt |
| c2.uploading | Sending your photo... {percent} % | Phase 1; live region announces only "Sending your photo" once |
| c2.converting | Finding the lines in your photo. This usually takes a few seconds. | Phase 2, announced |
| c2.slow | Still working - detailed photos take a little longer. | Phase 3 (10 s), announced |
| c2.progressLabel | Progress of your drawing | `aria-label` of `<progress>` |
| c2.cancel | Cancel | Secondary button |

## C3 Preview

| Key | Text | Notes |
|---|---|---|
| c3.title | Step 2 of 4: Your drawing | |
| c3.heading | Your drawing is ready | h1 |
| c3.preview.alt | Preview of your line drawing, made from your photo | `alt` of the preview `<img>` (UX-009) |
| c3.size | Drawn in black fineliner by our pen robot, {width} x {height} cm. | Sizes from `widthMm`/`heightMm` |
| c3.whatYouSee | What you see is exactly what we'll draw. | Info notice (BR-005) |
| c3.notQuiteRight | Not quite right? A photo with good light, a clear face and a plain background usually gives a clearer drawing. | |
| c3.continue | Choose a frame | Primary |
| c3.tryAnother | Try another photo | Secondary (AC-009 names this text) |
| c3.viewFull | View full size | Text button |
| c3.full.heading | Your drawing, full size | Dialog h2 |
| c3.full.close | Close | |
| c3.expiryNote | You can order this drawing until {time} on {date}. | Small text under the actions; from `expiresAt` in Europe/Amsterdam, e.g. "10:00 on Wednesday 4 November" |
| c3.expired | This preview is no longer available. Please upload your photo again. | Warning notice (AC-011, AC-022) |
| c3.expired.detail | We keep previews for 24 hours. Your frame choice and details are kept. | Shown only when the browser knows `expiresAt` has passed; for a 404 without that, only `c3.expired` |
| c3.expired.action | Upload your photo again | Primary |

## C4 Frame

| Key | Text | Notes |
|---|---|---|
| c4.title | Step 3 of 4: Choose a frame | |
| c4.heading | Choose a frame | h1 |
| c4.legend | Frame | Visually hidden legend |
| c4.vatNote | Prices include VAT. | |
| c4.frameSize | {widthMm} x {heightMm} mm | |
| c4.option.name | {frameName}, {size}, {price} | Accessible name of each radio |
| c4.continue | Continue to your details | Primary |
| c4.back | Back to your drawing | Secondary |
| c4.empty | All our frames are sold out right now. We're restocking - please come back soon. | Info notice |
| c4.error.load | We couldn't load the frames. Check your internet connection and try again. | Danger notice |
| c4.error.retry | Try again | |
| c4.error.required | Choose a frame to continue. | Inline on the fieldset |
| c4.soldOut | This frame just sold out: {frameName}. Please choose another frame - your details and drawing are kept. | Warning notice (AC-020); `frame_sold_out` and `frame_not_found` |

## C5 Details

| Key | Text | Notes |
|---|---|---|
| c5.title | Step 4 of 4: Your details | |
| c5.heading | Your details | h1 |
| c5.summary.heading | Your order | h2 of the summary card |
| c5.summary.drawingAlt | Your drawing | Thumbnail alt |
| c5.summary.changeFrame | Change frame | Text button -> C4 |
| c5.allRequired | All fields are required. | |
| c5.name.label | Name | |
| c5.email.label | Email | |
| c5.email.hint | We only use it to contact you about this order. | |
| c5.address.legend | Delivery address | |
| c5.address.hint | We deliver to the Netherlands and Belgium. | |
| c5.country.label | Country | Legend of the radio group |
| c5.country.NL | Netherlands | |
| c5.country.BE | Belgium | |
| c5.street.label | Street | |
| c5.houseNumber.label | House number | |
| c5.houseNumber.hint | Including any addition, like 12a | |
| c5.postalCode.label | Postal code | |
| c5.postalCode.hint.NL | Like 1234 AB | |
| c5.postalCode.hint.BE | 4 digits, like 1000 | |
| c5.postalCode.hint.none | Choose your country first to see the format. | |
| c5.city.label | City | |
| c5.terms.label | I agree that my photo is used only to make my drawing | Checkbox label, word for word from AC-016 |
| c5.terms.more | Read the photo terms | `<summary>` of the disclosure |
| c5.terms.body | We use your photo only to make your drawing. It is processed on our own server and never shared with other services. Only Fineline can see your photo and drawing. We delete your photo 30 days after your order is shipped or cancelled, and keep the drawing so you can order it again. If you don't place an order, we delete your photo and preview within 24 hours. Only upload photos you have the right to use, and ask the people in the photo if they agree. | **(owner to confirm)** |
| c5.total | Total: {price} (including VAT) | |
| c5.withdrawal | This drawing is made just for you, so the 14-day right of withdrawal does not apply. | Info notice directly above the button (AC-017, BR-015) **(owner to confirm, Q-10)** |
| c5.payment | You don't pay online. We'll email you how to pay. | **(owner to confirm, Q-8)** |
| c5.submit | Place order | Primary. **Legal check (G-8):** the EU Consumer Rights Directive (art. 8(2)) asks for a button that says the order means an obligation to pay, e.g. "Order with obligation to pay" |
| c5.submitting | Placing order... | Busy label |
| c5.back | Back to frames | Secondary |

C5 field errors (inline under the label, also in the error summary as links; API `details[].field` in brackets):

| Key | Field | Text |
|---|---|---|
| c5.error.name.required | Name (`customer.name`) | Enter your name. |
| c5.error.name.tooLong | Name | Your name must be 200 characters or fewer. |
| c5.error.email.required | Email (`customer.email`) | Enter your email address. |
| c5.error.email.invalid | Email | Enter a valid email address, like name@example.com. (AC-014) |
| c5.error.country.required | Country (`address.country`) | Choose the Netherlands or Belgium. |
| c5.error.country.notSupported | Country, code `country_not_supported` | We deliver to the Netherlands and Belgium only. (AC-015) |
| c5.error.street.required | Street (`address.street`) | Enter your street. |
| c5.error.houseNumber.required | House number (`address.houseNumber`) | Enter your house number. |
| c5.error.houseNumber.tooLong | House number | The house number must be 20 characters or fewer. |
| c5.error.postalCode.required | Postal code (`address.postalCode`) | Enter your postal code. |
| c5.error.postalCode.invalidNL | Postal code, NL | Enter a Dutch postal code, like 1234 AB. (AC-014) |
| c5.error.postalCode.invalidBE | Postal code, BE | Enter a Belgian postal code of 4 digits, like 1000. |
| c5.error.city.required | City (`address.city`) | Enter your city. (AC-014) |
| c5.error.terms.required | Photo terms (`acceptedPhotoTerms`), code `photo_terms_not_accepted` | Tick the box to agree to the photo terms. We can only make your drawing with your agreement. (AC-016) |
| c5.error.field.generic | any other field | Check this field. (followed by the API's `details[].message`) |

C5 order errors (danger notice above **Place order**, focused, unless the flow moves to another step):

| Key | API code | Text / behaviour |
|---|---|---|
| (c4.soldOut) | `frame_sold_out` (409), `frame_not_found` (422) | Go to C4 sold-out state |
| (c3.expired) | `drawing_not_found` (404) | Go to C3 expired state |
| c5.error.alreadyOrdered | `drawing_already_ordered` (409) | This drawing has already been ordered. If you didn't see your order number, email us at {contactEmail}. |
| c5.error.rateLimited | `rate_limited` (429) | Too many tries in a short time. Please wait {wait} and try again. |
| c5.error.network | no response, 5xx | We couldn't reach our shop. Check your internet connection and try again. |

## C6 Confirmation

| Key | Text | Notes |
|---|---|---|
| c6.title | Order placed - Fineline | |
| c6.heading | Thank you, your order is placed | h1 |
| c6.orderNumber.label | Order number | |
| c6.copy | Copy order number | |
| c6.copied | Copied | Button label for 3 s; status region: "Order number copied" |
| c6.copyFailed | Couldn't copy. Please write the order number down. | If the Clipboard API fails |
| c6.keepNumber | Keep this order number. You'll need it if you contact us about your order. | |
| c6.delivery.label | Estimated delivery date | |
| c6.frame.label | Frame | |
| c6.price.label | Price | Value: "{price} (including VAT)" |
| c6.address.label | Delivery address | |
| c6.next.heading | What happens next | |
| c6.next.draw | Our pen robot draws your portrait in black fineliner. | |
| c6.next.frame | We frame and pack it by hand. | |
| c6.next.ship | We send it to your delivery address. | |
| c6.payment | We'll email you how to pay. | **(owner to confirm, Q-8)** |
| c6.again | Make another drawing | Secondary |

## X3 Page not found

| Key | Text |
|---|---|
| x3.title | Page not found - Fineline |
| x3.heading | Page not found |
| x3.body | This page doesn't exist. Check the address, or go back to the start. |
| x3.toShop | Go to the shop |
| x3.toOrders | Go to orders |

## Admin shared (X2, X4, X5)

| Key | Text | Notes |
|---|---|---|
| admin.name | Fineline admin | Header |
| admin.title | {page} - Fineline admin | Document title pattern |
| admin.nav.label | Admin | `aria-label` of the nav |
| admin.nav.orders / frames / settings | Orders / Frames / Settings | |
| admin.logout | Log out | |
| admin.loggingOut | Logging out... | |
| admin.loading | Loading... | |
| admin.retry | Try again | |
| admin.error.network | We couldn't reach the server. Check the connection and try again. | Any admin call without a response |
| admin.error.server | Something went wrong on the server. Try again; if it keeps happening, check the API logs. | 5xx |
| admin.error.csrf | Something went wrong with this request. Reload the page and try again. | `csrf_failed` (403) |
| admin.error.notFound | This item doesn't exist any more. | 404 on an action |
| admin.error.invalidTransition | {orderNumber} is {currentStatus} now, so it can't be {targetAction}. The order has been reloaded. | `invalid_transition` (409), AC-034; `{targetAction}` from: "marked drawn", "marked ready to ship", "marked shipped", "cancelled", "moved back to Drawing" |
| admin.error.rateLimited | Too many tries. Please wait {wait} and try again. | |
| x4.heading | Your session has ended | Log in again dialog |
| x4.body | Log in again to continue. Nothing you entered is lost. | |
| x4.submit | Log in | |
| x4.toLoginPage | Go to the login page | |
| x5.markShipped.heading | Mark {orderNumber} as shipped? | |
| x5.markShipped.body | Only do this after handing it to the carrier. Shipped orders can't change any more. | |
| x5.markShipped.confirm | Mark shipped | |
| x5.markShipped.cancel | Not yet | Focused first |
| x5.cancel.heading | Cancel order {orderNumber}? | |
| x5.cancel.body | The frame ({frameName}) goes back to stock. A cancelled order can't be reopened. | |
| x5.cancel.confirm | Cancel order | Destructive |
| x5.cancel.keep | Keep order | Focused first |
| x5.busy | Saving... | |

## A1 Log in

| Key | Text | Notes |
|---|---|---|
| a1.title | Log in - Fineline admin | |
| a1.heading | Log in to Fineline admin | h1 |
| a1.username.label | Username | |
| a1.password.label | Password | |
| a1.showPassword | Show password | Toggle button; `aria-pressed`, label stays the same |
| a1.submit | Log in | |
| a1.submitting | Logging in... | |
| a1.error.username.required | Enter your username. | Inline |
| a1.error.password.required | Enter your password. | Inline |
| a1.error.invalidCredentials | Wrong username or password. | `invalid_credentials` (401), AC-025; same text for both cases |
| a1.error.rateLimited | Too many login attempts. Please wait {wait} and try again. | `rate_limited` (429) |
| a1.loggedOut | You're logged out. | Success notice (AC-028) |
| a1.sessionEnded | Log in to continue. | Info notice when redirected with `next` |

## A2 Orders

| Key | Text | Notes |
|---|---|---|
| a2.title | Orders - Fineline admin | Add the filter: "Received orders - Fineline admin" |
| a2.heading | Orders | h1 |
| a2.filter.label | Filter orders by status | `aria-label` of the filter nav |
| a2.filter.open | Open | Received, Drawing, Drawn, Ready to ship |
| a2.filter.all | All | Other filters use the status labels |
| a2.refresh | Refresh list | |
| a2.caption | {filterName} orders, earliest delivery date first - {count, plural, one {# order} other {# orders}} | Table caption; "All orders, ..." for All |
| a2.col.orderNumber / status / deliveryDate / orderDate / customer / frame / nextStep | Order number / Status / Delivery date / Order date / Customer / Frame / Next step | Column headers |
| a2.late | Late | Tag with warning icon; accessible text "Late: delivery date has passed" |
| a2.loading | Loading orders... | |
| a2.empty.open | No open orders. New orders appear here as soon as customers place them. | |
| a2.empty.filtered | No orders with status {status}. | |
| a2.empty.showAll | Show all orders | |
| a2.error.load | We couldn't load the orders. Check the connection and try again. | |
| a2.error.download | The SVG for {orderNumber} couldn't be downloaded, so its status hasn't changed. Try again. | |
| a2.downloading | Downloading... | Row busy label |
| a2.saving | Saving... | Row busy label |
| a2.done.downloaded | {orderNumber} downloaded. Status: Drawing. | Status region; on re-download: "{orderNumber} downloaded again. Status unchanged: {status}." |
| a2.done.status | {orderNumber} is now {status}. | Status region |

## A3 Order detail

| Key | Text | Notes |
|---|---|---|
| a3.title | Order {orderNumber} - Fineline admin | |
| a3.back | All orders | |
| a3.heading | Order {orderNumber} | h1 |
| a3.nextStep.heading | Next step | |
| a3.download.hint | Downloading starts the drawing: the status changes to Drawing. | Only in Received |
| a3.downloadAgain.hint | Downloading again gives the same SVG and doesn't change the status. | Drawing and later |
| a3.final | Shipped and cancelled orders don't change any more. | |
| a3.delivery.heading | Delivery date | |
| a3.delivery.change | Change delivery date | |
| a3.delivery.newLabel | New delivery date | |
| a3.delivery.hint | Not before the order date, {orderDate}. | |
| a3.delivery.save | Save delivery date | |
| a3.delivery.cancel | Cancel | Closes the editor |
| a3.delivery.closed | The delivery date of a shipped or cancelled order can't be changed. | `order_closed` (409) and shown instead of the button |
| a3.date.error.beforeOrderDate | The delivery date can't be before the order date ({orderDate}). | AC-038 |
| a3.date.error.invalid | Enter a date, like 20/11/2026. | Bad or empty date |
| a3.done.date | Delivery date changed to {date}. | Status region |
| a3.drawing.heading | Drawing | |
| a3.drawing.alt | Drawing for order {orderNumber} | |
| a3.drawing.size | Size | "180 x 267 mm" |
| a3.drawing.strokes | Strokes | "{count} strokes" |
| a3.drawing.length | Total line length | "14.3 m" |
| a3.drawing.notShown | The drawing can't be shown here yet. Use Download SVG to open the file. | Fallback until G-1 |
| a3.photo.heading | Customer's photo | |
| a3.photo.alt | Customer's photo for order {orderNumber} | |
| a3.photo.deleted | The customer's photo was deleted 30 days after the order was closed. The drawing is kept. | `photoAvailable: false` / `photo_deleted` (410), AC-012 |
| a3.photo.noPreview | This photo can't be shown in this browser. | HEIC (G-4) |
| a3.photo.download | Download photo | |
| a3.customer.heading | Customer | |
| a3.customer.name / email / address | Name / Email / Delivery address | |
| a3.copyAddress | Copy address | Status region: "Address copied" |
| a3.order.heading | Order | |
| a3.order.date / frame / price | Order date / Frame / Price | |
| a3.notFound.heading | Order not found | |
| a3.notFound.body | This order doesn't exist. It may have been opened from an old link. | |
| a3.error.load | We couldn't load this order. Check the connection and try again. | |
| a3.done.downloaded | (a2.done.downloaded) | |
| a3.done.status | {orderNumber} is now {status}. | |
| a3.done.cancelled | {orderNumber} is cancelled. {frameName} is back in stock. | AC-035 |

## A4 Frames

| Key | Text | Notes |
|---|---|---|
| a4.title | Frames - Fineline admin | |
| a4.heading | Frames | |
| a4.add | Add frame | |
| a4.caption | All frames, by name | |
| a4.col.photo / name / size / price / stock | Photo / Name / Size / Price / Stock | |
| a4.soldOutTag | Sold out - not offered to customers | |
| a4.empty | No frames yet. Add a frame so customers can order. | |
| a4.error.load | We couldn't load the frames. Check the connection and try again. | |

## A5 New frame

| Key | Text | Notes |
|---|---|---|
| a5.title | Add a frame - Fineline admin | |
| a5.back | Frames | |
| a5.heading | Add a frame | |
| a5.name.label | Name | |
| a5.name.hint | Shown to customers, like Oak A4. | |
| a5.width.label | Inner width (mm) | |
| a5.height.label | Inner height (mm) | |
| a5.size.hint | The visible inside of the frame, portrait. At least {areaWidth} x {areaHeight} mm so the drawing fits. | Default 180 x 267 (G-5) |
| a5.price.label | Price (€, including VAT) | |
| a5.price.hint | Like 49.95 | |
| a5.stock.label | Starting stock | |
| a5.stock.hint | How many you have now. Later changes go through stock adjustments. | |
| a5.photo.label | Photo | |
| a5.photo.hint | JPEG, PNG or WebP, up to 5 MB. Customers see this photo. | |
| a5.submit | Add frame | |
| a5.submitting | Adding frame... | |
| a5.cancel | Cancel | |
| a5.done | {frameName} added. Customers can order it now. | Stock > 0 |
| a5.doneNoStock | {frameName} added. It isn't offered to customers until you add stock. | Stock 0 |

Frame form errors (A5 and A6):

| Key | Field / code | Text |
|---|---|---|
| frame.error.name.required | Name | Enter a name. |
| frame.error.name.tooLong | Name | The name must be 100 characters or fewer. |
| frame.error.width.invalid | Inner width | Enter the inner width as a whole number of millimetres. |
| frame.error.height.invalid | Inner height | Enter the inner height as a whole number of millimetres. |
| frame.error.tooSmall | Width and height, `frame_too_small` | The frame must be at least {areaWidth} x {areaHeight} mm inside, so the drawing fits. (AC-040) |
| frame.error.price.invalid | Price | Enter a price in euros above 0, like 49.95. (AC-041) |
| frame.error.stock.invalid | Starting stock | Enter a starting stock of 0 or more, as a whole number. (AC-041) |
| frame.error.photo.missing | Photo, `photo_missing` | Choose a photo of the frame. (AC-041) |
| frame.error.photo.unsupportedType | Photo, `photo_unsupported_type` | Use a JPEG, PNG or WebP photo. |
| frame.error.photo.tooLarge | Photo, 413 | The photo must be at most 5 MB. |

## A6 Edit frame

| Key | Text | Notes |
|---|---|---|
| a6.title | {frameName} - Fineline admin | |
| a6.back | Frames | |
| a6.details.heading | Details | |
| a6.priceNote | Price changes apply to new orders only. Existing orders keep their price. | AC-042 |
| a6.save | Save changes | |
| a6.saving | Saving... | |
| a6.noChanges | Nothing changed. | |
| a6.done.details | Changes saved. | |
| a6.photo.heading | Photo | |
| a6.photo.alt | Current photo of {frameName} | |
| a6.photo.choose | Choose a new photo | |
| a6.photo.replace | Replace photo | |
| a6.photo.required | Choose a photo first. | |
| a6.done.photo | Photo replaced. | |
| a6.stock.heading | Stock | |
| a6.stock.current | In stock: {stock} | |
| a6.stock.soldOut | In stock: 0 - sold out, not offered to customers | |
| a6.stock.amount.label | Number of frames | |
| a6.stock.amount.hint | For example 5 after a delivery, or 1 for a damaged frame. | |
| a6.stock.add | Add to stock | Sends `delta = +amount` |
| a6.stock.remove | Remove from stock | Sends `delta = -amount` |
| a6.error.amount.invalid | Enter a whole number from 1 to 10000. | |
| a6.error.stockNegative | Stock can't go below zero. There are {stock} in stock, so you can remove at most {stock}. | `stock_negative` (409), AC-044 |
| a6.done.stock | Stock is now {stock}. | Add " {frameName} is offered to customers again." when it went from 0 to more (AC-043); " {frameName} is no longer offered to customers." when it went to 0 |
| a6.notFound | Frame not found | |
| a6.error.load | We couldn't load this frame. Check the connection and try again. | |

## A7 Settings

| Key | Text | Notes |
|---|---|---|
| a7.title | Settings - Fineline admin | |
| a7.heading | Settings | |
| a7.delivery.heading | Delivery | |
| a7.leadTime.label | Standard lead time (working days) | |
| a7.leadTime.hint | Working days are Monday to Friday; public holidays count as working days. The new lead time applies to orders placed from now on. Existing orders keep their delivery date. | |
| a7.save | Save lead time | |
| a7.saving | Saving... | |
| a7.done | Lead time saved: {days, plural, one {# working day} other {# working days}}. It applies to orders placed from now on. | AC-045 |
| a7.error.leadTime | The lead time must be a whole number from 1 to 60. | AC-046 (0, 2.5, 61, empty) |
| a7.drawingArea | Drawing area: {width} x {height} mm (set in the deployment configuration) | Only if G-5 is added |
| a7.error.load | We couldn't load the settings. Check the connection and try again. | |
