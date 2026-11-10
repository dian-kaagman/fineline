# Business rules

BR-001 to BR-011 are the domain pack's rules with the pack's IDs (`/mnt/session/uploads/domain/rules.md`). BR-012 onwards are new: they come from the pack's constraints or from lead decisions. Where the pack says "Default (confirm)", the value below is the default the kickstart uses; the owner still has to confirm it (see `open-questions.md`).

Source tags: `[pack: <file>#<id or heading>]`, `[brief]`, `[lead decision]`, `[assumption]` (every assumption is also in `open-questions.md`).

Dates in examples are 2026 (6 November 2026 is a Friday, as in the pack's example).

## BR-001 Accepted photos
A photo is a JPEG, PNG or HEIC file of at most 15 MB (15,728,640 bytes), with a shortest side of at least 800 pixels. Anything else is rejected with a message saying what is wrong, and no drawing is made.
- **Source:** [pack: rules.md#BR-001] (Default (confirm)); values accepted for the kickstart: [lead decision] (Q-1)
- **Enforced in:** backend on upload (file type checked from the content, not only the file name); the customer page may pre-check
- **Applies to slice:** yes
- **Example:** a 4032 x 3024 HEIC of 3.1 MB is accepted; a 1200 x 700 JPEG is rejected ("shortest side must be at least 800 pixels"); a 16.2 MB PNG is rejected ("photo must be at most 15 MB"); a GIF is rejected ("use a JPEG, PNG or HEIC photo").

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
| received | SVG downloaded for the arm | drawing | admin | BR-009 |
| drawing | marked drawn | drawn | admin | BR-009 |
| drawn | marked ready to ship (framed and packed) | ready to ship | admin | BR-009 |
| ready to ship | marked shipped (handed to carrier) | shipped | admin | BR-009 |
| received, drawing | cancelled | cancelled | admin | BR-009, BR-006 (stock +1) |

Downloading the SVG of a `received` order moves it to `drawing`. Downloading it again in any later status returns the same SVG and does not change the status (the drawing is redone from the same SVG when the pen runs dry). Any other transition (skipping a step, going back, cancelling from `drawn` or `ready to ship`) is rejected. `shipped` and `cancelled` are final.
- **Source:** [pack: rules.md#BR-009], [pack: processes.md#Admin prepares the day's drawings]; download semantics and cancel only from received/drawing: [lead decision]; no backward steps: [assumption] (Q-29); cancel vs BR-006 wording: Q-11
- **Enforced in:** backend (status machine)
- **Applies to slice:** yes
- **Example:** FL-2026-0042 in `received`: download -> `drawing`; download again -> still `drawing`; mark drawn -> `drawn`; cancel -> rejected ("a drawn order can't be cancelled").

## BR-010 Photos are personal data
Customers agree to the photo terms before ordering: the photo is used only to make their drawing. Photos and drawings of orders are visible only in the admin tool, to the logged-in admin. The original photo of an order is deleted 30 days after the order is shipped or cancelled; the drawing is kept for reorders. A photo uploaded without placing an order is deleted, with its preview, 24 hours after upload.
- **Source:** [pack: rules.md#BR-010]; retention periods: Default (confirm) accepted as [lead decision] (Q-7); preview deleted with the unordered photo: [assumption] (Q-23); how long drawings are kept: Q-25
- **Enforced in:** backend (access checks; scheduled deletion)
- **Applies to slice:** yes
- **Example:** a photo uploaded at 10:00 on Tuesday 3 November and not ordered is gone after 10:00 on Wednesday 4 November. FL-2026-0042 shipped on Tuesday 1 December: its photo is deleted on Thursday 31 December; its drawing can still be downloaded.

## BR-011 Admin access
Every page and API call of the admin tool requires the admin to be logged in, including the photos and drawings of orders. There is one admin account, configured by the deployment; there is no sign-up and no password change in the admin tool.
- **Source:** [pack: rules.md#BR-011]; account from deployment configuration, no sign-up or password change UI: [lead decision]
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
A photo and its preview that are not yet part of an order can be retrieved and ordered only with the preview token given to the customer who uploaded it. Without the right token, or after the 24 hours (BR-010), the preview is reported as not available, with the same answer in both cases so nobody can tell whether it exists.
- **Source:** [lead decision]; follows from [pack: rules.md#BR-010] and [pack: constraints.md#Legal and compliance]
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

## Rule to scenario map

Scenarios are in `openspec/changes/kickstart/specs/<capability>/spec.md`.

| Rule | Scenarios |
|---|---|
| BR-001 | AC-001, AC-002, AC-003, AC-004 |
| BR-002 | AC-005 |
| BR-003 | AC-005, AC-021, AC-040 |
| BR-004 | AC-006 |
| BR-005 | AC-021, AC-031, AC-032 |
| BR-006 | AC-013, AC-018, AC-020, AC-035, AC-039 to AC-044 |
| BR-007 | AC-014, AC-015, AC-016, AC-018, AC-019 |
| BR-008 | AC-018, AC-036, AC-037, AC-038, AC-045 to AC-049 |
| BR-009 | AC-018, AC-029, AC-031 to AC-036 |
| BR-010 | AC-010, AC-011, AC-012, AC-016, AC-027, AC-030 |
| BR-011 | AC-024 to AC-028 |
| BR-012 | AC-013, AC-018, AC-042 |
| BR-013 | AC-010, AC-022 |
| BR-014 | AC-023 |
| BR-015 | AC-017 |
| BR-016 | AC-007 |
| BR-017 | AC-008, AC-009 |

## Out of slice
No pack rule is out of slice. These neighbouring needs are not covered by the kickstart and are tracked in `open-questions.md`: payment and the price of the drawing (Q-8), deleting a customer's data on request (Q-24), a new drawing after ordering (Q-12), editing the drawing area in the admin UI (Q-2).
