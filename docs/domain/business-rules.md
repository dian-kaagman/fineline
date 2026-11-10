# Business rules

BR-001 to BR-011 are the domain pack's rules with the pack's IDs (`/mnt/session/uploads/domain/rules.md`). BR-012 onwards are new: they come from the pack's constraints or from lead decisions. Security requirements (SR-001 to SR-023) live in `docs/security/threat-model.md`; the specs cite them next to the BR IDs, and the map at the end lists their scenarios. Where the pack says "Default (confirm)", the value below is the default the kickstart uses; the owner still has to confirm it (see `open-questions.md`).

Source tags: `[pack: <file>#<id or heading>]`, `[brief]`, `[lead decision]`, `[assumption]` (every assumption is also in `open-questions.md`).

Dates in examples are 2026 (6 November 2026 is a Friday, as in the pack's example).

## BR-001 Accepted photos
A photo is a JPEG, PNG or HEIC file of at most 15 MB (15,728,640 bytes), with a shortest side of at least 800 pixels and at most 50 megapixels (width x height <= 50,000,000). Anything else is rejected with a message saying what is wrong, and nothing is stored.
- **Source:** [pack: rules.md#BR-001] (Default (confirm)); values accepted for the kickstart: [lead decision] (Q-1); the 50-megapixel upper limit is not in the pack: [lead decision] (Q-1), from `docs/security/threat-model.md` SR-003 / N-8
- **Enforced in:** backend on upload (file type checked from the content, not only the file name); the customer page may pre-check
- **Applies to slice:** yes
- **Example:** a 4032 x 3024 HEIC of 3.1 MB is accepted; a 48-megapixel 8064 x 6048 JPEG of 12 MB is accepted; a 1200 x 700 JPEG is rejected ("shortest side must be at least 800 pixels"); a 16.2 MB PNG is rejected ("photo must be at most 15 MB"); a 10,000 x 6,000 JPEG of 9 MB (60 megapixels) is rejected (error code `photo_too_many_pixels`); a GIF, or an SVG named `photo.jpg`, is rejected ("use a JPEG, PNG or HEIC photo").

## BR-002 What a drawing is
A drawing is an SVG that a pen arm can draw: strokes only, in black (`#000000`), with no fill, no gradients, no embedded images and no text; dimensions in millimetres, fitting inside the drawing area (BR-003); made of paths the arm can follow without lifting the pen more than needed.
- **Source:** [pack: rules.md#BR-002]
- **Enforced in:** conversion, and checked by the backend before a preview is shown (a non-conforming result is never shown or ordered)
- **Applies to slice:** yes
- **Example:** `<path d="..." fill="none" stroke="#000" stroke-width="0.5"/>` is fine; a filled shape, an embedded image or a grey line is not.

## BR-003 Drawing area
The drawing area is the paper size minus a margin on every side. Default: A4 portrait (210 x 297 mm) with a 15 mm margin, so 180 x 267 mm. Existing orders keep the drawing they were ordered with when the drawing area changes.
- **Source:** [pack: rules.md#BR-003] (Default (confirm)); "configurable by deployment configuration, not yet editable in the admin UI": [lead decision] (Q-2). **Deviation from the pack:** the pack says "the admin can change it"; in this kickstart only the deployment configuration can.
- **Enforced in:** conversion (uses the configured area), backend check of the result
- **Applies to slice:** yes (default and configuration); admin UI for it: no
- **Example:** with the default configuration a drawing is at most 180 mm wide and 267 mm high.

## BR-004 Drawing time limit (stroke budget)
A drawing has at most a maximum total stroke length and a maximum number of strokes. Default: 25 metres (25,000 mm) and 1,500 strokes, both set by deployment configuration. The conversion simplifies the drawing until it fits; it never returns a drawing over budget. A stroke is one continuous pen-down movement; total length is the sum of all stroke lengths in mm.
- **Source:** [pack: rules.md#BR-004] (Default (confirm)); configurable: [lead decision] (Q-3)
- **Enforced in:** conversion, and checked by the backend before a preview is shown
- **Applies to slice:** yes
- **Example:** a busy photo whose first trace has 4,200 strokes and 61 m of line is simplified to, say, 1,480 strokes and 24.3 m; a result of 1,501 strokes is never shown.

## BR-005 Preview is the order
The order stores exactly the drawing the customer previewed and approved. Regenerating the drawing after ordering is not allowed; the admin draws what the customer saw.
- **Source:** [pack: rules.md#BR-005]; "no regeneration after ordering" [lead decision]. Note the pack's process exception "possibly a new drawing with the customer's agreement" (Q-12) is not supported in this kickstart.
- **Enforced in:** backend (the order references the stored preview file; nothing can replace it)
- **Applies to slice:** yes
- **Example:** the SVG the admin downloads for FL-2026-0042 is byte-for-byte the SVG shown to the customer as the preview.

## BR-006 Frames and stock
A frame has a name, a frame size that fits the drawing (inner width at least the drawing area width and inner height at least the drawing area height, portrait), a price in euro cents including VAT above zero, a photo and a stock count of zero or more. Customers can only see and choose frames with stock above zero. Placing an order takes one from stock; cancelling an order puts it back (cancellation is only possible from `received` or `drawing`, BR-009). Two customers can never both get the last frame. The admin changes stock by a signed adjustment that may not make stock negative.
- **Source:** [pack: rules.md#BR-006]; inner-size rule, price > 0, signed adjustment: [lead decision]; portrait comparison: [assumption] (Q-15); stock only via adjustments after creation: [lead decision] (Q-18)
- **Enforced in:** backend (validation, atomic stock decrement, database constraint stock >= 0)
- **Applies to slice:** yes
- **Example:** frame "Oak A4" (210 x 297 mm, 4995 cents, stock 1): the first order succeeds and stock becomes 0; a second order for it at the same moment is rejected with "this frame just sold out". A frame of 130 x 180 mm is rejected because it is smaller than 180 x 267 mm. Stock 2 with adjustment -3 is rejected; with -2 it becomes 0.

## BR-007 Placing an order
An order needs a drawing (a preview of the customer's own, not expired), a frame in stock, the customer's name, email and delivery address, and the customer's agreement to the photo terms (BR-010). Delivery is to the Netherlands (NL) and Belgium (BE) only. Each order gets an order number `FL-<year>-<4 digits>`, counting up per year from 0001, separate from the internal ID; the year is the order date's year (BR-008).
- **Source:** [pack: rules.md#BR-007]; NL/BE: Default (confirm) accepted as [lead decision] (Q-4); address fields: [assumption] (Q-21); year from the Amsterdam order date: [assumption] (Q-20); more than 9999 orders a year: Q-19
- **Enforced in:** backend
- **Applies to slice:** yes
- **Example:** with 41 orders already placed in 2026, the next order is `FL-2026-0042`; the first order placed at 00:30 on 1 January 2027 (Amsterdam) is `FL-2027-0001`. An address in Germany is rejected ("we deliver to the Netherlands and Belgium only").

## BR-008 Estimated delivery date
The estimated delivery date is the order date plus the lead time in working days. Working days are Monday to Friday; public holidays are not skipped. The order date is the calendar date in Europe/Amsterdam at the moment the order is placed; counting starts on the first working day after the order date. Default lead time: 7 working days, a whole number from 1 to 60. The admin sets the lead time and can change the estimated delivery date of a single order to any date on or after its order date while the order is not shipped or cancelled. Changing the lead time does not change existing orders.
- **Source:** [pack: rules.md#BR-008]; lead time 7: Default (confirm) accepted as [lead decision] (Q-5); holidays not skipped, Amsterdam order date: [lead decision] (Q-6); range 1-60: [assumption] (Q-13); per-order date limits: [assumption] (Q-14)
- **Enforced in:** backend (calculation at placement; validation of admin changes)
- **Applies to slice:** yes
- **Examples:**
  - ordered Friday 6 November, lead time 7: Tuesday 17 November (pack example)
  - ordered Saturday 7 or Sunday 8 November, lead time 7: Tuesday 17 November
  - placed at 23:30 UTC on Thursday 5 November = 00:30 Friday 6 November in Amsterdam: order date 6 November, delivery Tuesday 17 November (not Monday 16 November)
  - ordered Friday 18 December, lead time 7: Tuesday 29 December (Christmas Day, Friday 25 December, counts as a working day)
  - lead time changed from 7 to 10 on Monday 9 November: an order placed that day gets Monday 23 November; an order placed on 6 November keeps Tuesday 17 November

## BR-009 Order statuses
Only the admin changes statuses (except the first one), one step forward at a time:

| From | Event | To | Who | Rule |
|---|---|---|---|---|
| (new) | customer places order | received | customer | BR-007 |
| received | SVG downloaded for the arm (not: opening the order or viewing the drawing) | drawing | admin | BR-009 |
| drawing | marked drawn | drawn | admin | BR-009 |
| drawn | marked ready to ship (framed and packed) | ready to ship | admin | BR-009 |
| ready to ship | marked shipped (handed to carrier) | shipped | admin | BR-009 |
| received, drawing | cancelled | cancelled | admin | BR-009, BR-006 (stock +1) |

Downloading the SVG *for the arm* of a `received` order moves it to `drawing`. Downloading it for the arm again in any later status returns the same SVG and does not change the status (the drawing is redone from the same SVG when the pen runs dry). Opening an order, viewing its drawing or downloading the drawing any other way never changes the status. Any other transition (skipping a step, going back, cancelling from `drawn` or `ready to ship`) is rejected. `shipped` and `cancelled` are final.
- **Source:** [pack: rules.md#BR-009], [pack: processes.md#Admin prepares the day's drawings]; download semantics and cancel only from received/drawing: [lead decision]; viewing never changes status, a separate "download for the arm" action does: [lead decision] (threat model N-1, UX G-1); no backward steps: [assumption] (Q-29); cancel vs BR-006 wording: Q-11
- **Enforced in:** backend (status machine)
- **Applies to slice:** yes
- **Example:** FL-2026-0042 in `received`: download -> `drawing`; download again -> still `drawing`; mark drawn -> `drawn`; cancel -> rejected ("a drawn order can't be cancelled").

## BR-010 Photos are personal data
Customers agree to the photo terms before ordering: the photo is used only to make their drawing. Photos and drawings of orders are visible only in the admin tool, to the logged-in admin. The original photo of an order is deleted 30 days after the order is shipped or cancelled; the drawing is kept for reorders. A photo uploaded without placing an order is deleted, with its preview, 24 hours after upload.
- **Source:** [pack: rules.md#BR-010]; retention periods: Default (confirm) accepted as [lead decision] (Q-7); preview deleted with the unordered photo: [assumption] (Q-23); how long drawings are kept: Q-25
- **Enforced in:** backend (access checks; scheduled deletion)
- **Applies to slice:** yes
- **Timing:** a preview can't be ordered from the moment its 24 hours are over; the files are removed by the retention sweep, which runs every hour, so a photo is physically deleted between 24 and 25 hours after upload (and an order photo within an hour after its 30 days). Texts shown to customers must therefore say "after 24 hours", not "within 24 hours". [assumption] (Q-40), [repo: openspec/changes/kickstart/design.md#Retention]
- **Example:** a photo uploaded at 10:00 on Tuesday 3 November and not ordered can't be ordered from 10:00 on Wednesday 4 November and is deleted by 11:00. FL-2026-0042 shipped on Tuesday 1 December: its photo is deleted on Thursday 31 December; its drawing can still be downloaded.

## BR-011 Admin access
Every page and API call of the admin tool requires the admin to be logged in, including the photos and drawings of orders. There is one admin account, configured by the deployment; there is no sign-up and no password change in the admin tool. A login session ends at logout, after 8 hours without use, or 24 hours after login; after 5 failed logins from one address in 15 minutes, logins from that address are refused until the 15 minutes have passed.
- **Source:** [pack: rules.md#BR-011]; account from deployment configuration, no sign-up or password change UI: [lead decision]; session lifetime and login limit: [lead decision] from `docs/security/threat-model.md` SR-011, SR-012 (Q-26, Q-32)
- **Enforced in:** backend (every admin route and every file route for order photos and drawings), web (redirect to login)
- **Applies to slice:** yes
- **Example:** `GET` of the order list without a session is refused with 401 and returns no order data.

## BR-012 Order price
The order price is the price of the chosen frame, in EUR cents including VAT, as it is at the moment the order is placed. It is stored on the order; later changes to the frame's price don't change existing orders. The price of the drawing itself is not yet known and not charged in this kickstart.
- **Source:** [lead decision]; VAT-inclusive EUR cents: [pack: constraints.md#Data], [pack: constraints.md#Legal and compliance]; drawing price open: [pack: rules.md#Open points] (Q-8)
- **Enforced in:** backend (price taken from the frame, never from the request)
- **Applies to slice:** yes
- **Example:** "Oak A4" costs 4995 cents: the order price is 4995 (shown as €49.95). The admin later changes Oak A4 to 5495: FL-2026-0042 still shows €49.95.

## BR-013 Fresh previews are private
A photo and its preview that are not yet part of an order can be retrieved and ordered only with the preview token given to the customer who uploaded it. Without the right token, after the 24 hours (BR-010), or for an unknown preview, the preview is reported as not available, with the same answer in every case, so nobody without the token can tell whether a preview exists or was already ordered.
- **Source:** [lead decision]; follows from [pack: rules.md#BR-010] and [pack: constraints.md#Legal and compliance]; identical answers: `docs/security/threat-model.md` SR-009
- **Enforced in:** backend
- **Applies to slice:** yes
- **Example:** an order request naming someone else's preview, or one that expired, gets "This preview is no longer available. Please upload your photo again."

## BR-014 No personal data in logs
Application logs never contain customer names, email addresses, delivery addresses, photo or drawing contents, or the original file names of uploaded photos. Logs may contain internal IDs and order numbers.
- **Source:** [pack: constraints.md#Legal and compliance]; [lead decision]
- **Enforced in:** backend and worker (logging)
- **Applies to slice:** yes
- **Example:** "order FL-2026-0042 placed, frame 3" is fine; "order placed by Anna de Vries, anna@example.nl" is not.

## BR-015 Withdrawal notice
Before the customer places an order, the order page states that a personalised product is exempt from the 14-day withdrawal right. The exact wording is to be confirmed.
- **Source:** [pack: constraints.md#Legal and compliance]; wording: Q-10
- **Enforced in:** web (customer order page)
- **Applies to slice:** yes
- **Example:** "This drawing is made just for you, so the 14-day right of withdrawal does not apply." (placeholder wording)

## BR-016 Photos stay on our server
Photos are converted on our own server; no photo or drawing is sent to a third-party service.
- **Source:** [pack: constraints.md#Non-functional], [brief]
- **Enforced in:** worker and API (no outbound calls with photo data)
- **Applies to slice:** yes
- **Example:** converting a photo makes no network request outside the deployment.

## BR-017 Try another photo
The customer can't adjust the drawing (detail level, crop) in this kickstart. If they don't like the preview, or no drawing can be made, they discard it and upload another photo; each upload gets its own preview.
- **Source:** [lead decision]; [pack: processes.md#Customer orders a drawing] (exception "they need a way to try another photo"); adjustments: [pack: rules.md#Open points], [brief] open questions (Q-9)
- **Enforced in:** web and backend
- **Applies to slice:** yes
- **Example:** the customer uploads a dark photo, dislikes the preview, taps "Try another photo" and uploads a second photo, which gets a new preview.

## BR-018 Placing the same order again
Placing an order again for a drawing that has already been ordered, with that drawing's valid preview token, returns the original confirmation (order number, price, estimated delivery date) and changes nothing: no new order, no stock taken, the frame and details in the repeated request are ignored. Without the valid token the answer is the "not available" of BR-013.
- **Source:** [lead decision] (UX gap G-6: a lost confirmation on a flaky phone connection must not leave the customer without their order number, since there are no emails)
- **Enforced in:** backend (order placement)
- **Applies to slice:** yes
- **Example:** FL-2026-0042 was placed but the confirmation was lost; the phone retries with the same drawing and token (and, say, a different frame) and gets FL-2026-0042, €49.95, Tuesday 17 November; the stock of both frames is unchanged by the retry.

## Rule to scenario map

Scenarios are in `openspec/changes/kickstart/specs/<capability>/spec.md`.

| Rule | Scenarios |
|---|---|
| BR-001 | AC-001, AC-002, AC-003, AC-004, AC-050, AC-051, AC-052, AC-053 |
| BR-002 | AC-005, AC-055 |
| BR-003 | AC-005, AC-021, AC-040 (drawing area shown read-only) |
| BR-004 | AC-006, AC-055 |
| BR-005 | AC-021, AC-031, AC-032 |
| BR-006 | AC-013, AC-018, AC-020, AC-035, AC-039 to AC-044 |
| BR-007 | AC-014, AC-015, AC-016, AC-018, AC-019 |
| BR-008 | AC-018, AC-029 (order date), AC-036, AC-037, AC-038, AC-045 to AC-049 |
| BR-009 | AC-018, AC-029, AC-030 (viewing keeps the status), AC-031 to AC-036 |
| BR-010 | AC-010, AC-011, AC-012, AC-016, AC-027, AC-030 |
| BR-011 | AC-024 to AC-028, AC-061 to AC-064 |
| BR-012 | AC-013, AC-018, AC-042, AC-059 |
| BR-013 | AC-010, AC-022 |
| BR-014 | AC-023 |
| BR-015 | AC-017 |
| BR-016 | AC-007, AC-065 |
| BR-017 | AC-008, AC-009 |
| BR-018 | AC-058 |

Security requirements of type Spec (`docs/security/threat-model.md`):

| SR | Scenarios |
|---|---|
| SR-001 Upload size while receiving, one file | AC-003 (streamed upload), AC-052 |
| SR-002 Type from content | AC-002, AC-050 |
| SR-003 Image bombs | AC-053 |
| SR-004 Busy converter | AC-054 |
| SR-006 Unsafe conversion result | AC-055 |
| SR-007 SVG shown as image, safe download | AC-056, AC-031 |
| SR-009 Preview token, identical answers | AC-010, AC-022, AC-058 |
| SR-011 Login limit | AC-061 |
| SR-012 Session and cookie | AC-062, AC-063, AC-028 |
| SR-013 Admin tool header on changes | AC-064 |
| SR-014 One auth gate | AC-026, AC-027 |
| SR-016 Server-owned fields | AC-059 |
| SR-017 Rate limits, real client address | AC-057, AC-060 |
| SR-018 No secrets in logs, generic errors | AC-023 |
| SR-019 Content security policy | AC-065 |
| SR-023 Frame photo metadata | AC-066 |

## Out of slice
No pack rule is out of slice. The original customer photo is kept as uploaded, including any EXIF data, visible to the admin only and deleted per BR-010 (accepted risk, Q-35). These neighbouring needs are not covered by the kickstart and are tracked in `open-questions.md`: payment and the price of the drawing (Q-8), deleting a customer's data on request (Q-24), a new drawing after ordering (Q-12), editing the drawing area in the admin UI (Q-2).
