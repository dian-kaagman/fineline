# Open questions

Questions for the owner. "Default we used" is what the kickstart specs follow until the owner answers. "Blocks?" is yes when the slice can't be built correctly without an answer; none blocks the kickstart, but two block go-live (Q-10, Q-24).

Source tags: `[pack: <file>#<id or heading>]`, `[brief]`, `[lead decision]`, `[assumption]`.

## Pack defaults to confirm (accepted by the lead for the kickstart)

| # | Question | Why it matters | Default we used | Blocks? | Source |
|---|---|---|---|---|---|
| Q-1 | Are the photo limits right: JPEG, PNG or HEIC, at most 15 MB, shortest side at least 800 px? | Too strict loses customers; too loose gives bad drawings | As stated (BR-001) | No | [pack: rules.md#BR-001], [lead decision] |
| Q-2 | What paper size and margin does the arm really use? The pack says the admin can change the drawing area; may it stay a deployment setting for now? | Every drawing is sized to it; existing orders keep theirs | A4 portrait, 15 mm margin = 180 x 267 mm, set by deployment configuration; no admin UI in the kickstart (deviation from the pack's "the admin can change it") | No | [pack: rules.md#BR-003], [pack: rules.md#Open points], [lead decision] |
| Q-3 | Which stroke budget keeps a drawing under about an hour on the arm? | Too high: long drawing sessions; too low: poor likeness | 25 m total length and 1,500 strokes, set by deployment configuration | No | [pack: rules.md#BR-004], [pack: rules.md#Open points], [lead decision] |
| Q-4 | Deliver to the Netherlands and Belgium only? | Address validation and shipping cost | NL and BE only | No | [pack: rules.md#BR-007], [lead decision] |
| Q-5 | Is 7 working days the right standard lead time? | Shown to every customer | 7 working days | No | [pack: rules.md#BR-008], [lead decision] |
| Q-6 | Should public holidays be skipped when counting the delivery date? | Around Christmas, Easter and King's Day the date is too early | Not skipped: Monday-Friday only; the admin lengthens the lead time or changes single orders around holidays. Order date = calendar date in Europe/Amsterdam at placement | No | [pack: rules.md#Open points], [brief] open questions, [lead decision] |
| Q-7 | Are the retention periods right: unordered uploads 24 h, order photos 30 days after shipped or cancelled, drawings kept? | GDPR storage limitation | As stated (BR-010) | No | [pack: rules.md#BR-010], [lead decision] |

## Decisions still open

| # | Question | Why it matters | Default we used | Blocks? | Source |
|---|---|---|---|---|---|
| Q-8 | What does the drawing itself cost on top of the frame, and how do customers pay? | Order price and order page | Order price = frame price (EUR cents incl. VAT); no payment in the kickstart, the owner arranges it | No | [pack: rules.md#Open points], [brief] out of scope, [lead decision] |
| Q-9 | May customers adjust the drawing (detail level, crop) before ordering? | Conversion and UI scope | No; they can discard the preview and try another photo (BR-017) | No | [pack: rules.md#Open points], [brief] open questions, [lead decision] |
| Q-10 | Exact wording of the notice that personalised products are exempt from the 14-day withdrawal right (NL/BE) | Consumer law: must be shown before ordering | Placeholder wording shown on the order page (BR-015); have it checked by someone who knows consumer law | No for the kickstart, **yes before go-live** | [pack: constraints.md#Legal and compliance], [lead decision] |
| Q-11 | The pack says cancelling "an order that hasn't shipped" puts the frame back (BR-006), but BR-009 only allows cancelling from received or drawing. Can a drawn or ready-to-ship order be cancelled? | Internal inconsistency in the pack; status machine | Follow BR-009: cancel only from received or drawing; drawn and ready to ship can't be cancelled | No | [pack: rules.md#BR-006], [pack: rules.md#BR-009], [lead decision] |
| Q-12 | When the arm can't handle an order's SVG, the process mentions "possibly a new drawing with the customer's agreement", but BR-005 forbids regenerating after ordering. How should that work, and does the admin need order notes? | Pack process conflicts with BR-005 | No regeneration and no order notes in the kickstart; the owner contacts the customer outside the system and may cancel (from received or drawing) | No | [pack: processes.md#Admin prepares the day's drawings], [pack: rules.md#BR-005], [lead decision] |
| Q-13 | What range may the standard lead time have? | Validation of the setting | A whole number of working days from 1 to 60 | No | [assumption] |
| Q-14 | Which dates may the admin set as a single order's delivery date? | Validation | Any calendar date on or after the order date (weekends allowed); not changeable once the order is shipped or cancelled | No | [assumption] |
| Q-15 | Must a frame fit the drawing in portrait orientation, or may a landscape frame (e.g. 297 x 210 mm) be used turned? | Frame validation | Portrait: inner width >= drawing area width (180 mm) and inner height >= drawing area height (267 mm) | No | [assumption] |
| Q-16 | Which files are allowed as a frame photo? | Validation of the admin form | JPEG, PNG or WebP, at most 5 MB, required when creating a frame (as in the API contract) | No | [assumption], [repo: docs/api/openapi.yaml] |
| Q-17 | Can a frame model be deleted? | Old orders refer to their frame | No deletion in the kickstart; a frame with stock 0 is hidden from customers | No | [assumption] |
| Q-18 | The brief says "edit frames (... stock) and adjust stock". May the edit form set the stock directly? | A direct overwrite can undo an order placed at the same moment | Stock is set when a frame is created; afterwards it changes only by signed adjustments (and by orders and cancellations) | No | [brief], [lead decision] |
| Q-19 | What happens after order FL-<year>-9999? | Order number format | The number keeps counting with more digits (FL-2026-10000); not expected at current volume | No | [assumption] |
| Q-20 | Which year goes into the order number around New Year? | Order number around midnight 31 December | The year of the order date in Europe/Amsterdam | No | [assumption] |
| Q-21 | Which address fields and formats are needed? | Validation; collect only what the order needs (GDPR) | Name, email, street and house number, postal code, city, country (NL or BE). NL postal code `1234 AB` (space optional), BE postal code 4 digits. No phone number | No | [pack: rules.md#BR-007], [pack: constraints.md#Legal and compliance], [assumption] |
| Q-22 | How long may the customer wait for a preview? | "Seconds, not minutes" needs a testable limit | Progress is shown while converting; a 15 MB / 12 MP photo gives a preview within 30 seconds on the reference server | No | [pack: constraints.md#Non-functional], [assumption] |
| Q-23 | Is the preview of an unordered photo deleted together with the photo after 24 hours? | The pack only names photos; a portrait drawing can also identify a person | Yes, photo and preview both deleted | No | [pack: rules.md#BR-010], [assumption] |
| Q-24 | How is a customer's data deleted on request (GDPR)? No capability in the proposal covers it | GDPR right to erasure | Not in the kickstart: the owner deletes it manually (design non-goal); a tool should exist before go-live (missing capability, e.g. an admin action "delete customer data" on an order) | No for the kickstart, **yes before go-live** | [pack: constraints.md#Legal and compliance], [assumption] |
| Q-25 | How long are order drawings kept "for reorders"? | GDPR storage limitation | Kept until the customer asks for deletion (Q-24) | No | [pack: rules.md#BR-010], [assumption] |
| Q-26 | Should repeated failed admin logins be throttled? | The admin login is on the public internet | Recommended (e.g. pause after 5 failures in 15 minutes); not specified in the kickstart specs, for the lead to decide in the design | No | [assumption] |
| Q-27 | Does "single fineline drawing" in the brief mean one continuous line? | Choice of conversion approach | No: one drawing per order, made of up to 1,500 strokes (BR-004); a continuous line is one possible approach (ADR) | No | [brief], [pack: rules.md#BR-004], [assumption] |
| Q-28 | UI language? | Texts and translation | English, ready for translation (pack default) | No | [pack: constraints.md#Data], [assumption] |
| Q-29 | Can the admin move an order one status back (e.g. ready to ship -> drawn when a frame turns out damaged)? | Status machine | No backward steps; redo the drawing from the same SVG without a status change | No | [pack: rules.md#BR-009], [assumption] |
| Q-30 | What file name should the downloaded SVG have? | Recognising files in the Rotrics software | `<order number>.svg`, e.g. `FL-2026-0042.svg` (no customer name) | No | [assumption] |
| Q-31 | Should the site warn about blurry or dark photos automatically? | The pack mentions bad photos | No automatic quality check; the customer judges the preview and can try another photo | No | [pack: processes.md#Customer orders a drawing], [assumption] |
| Q-32 | How long does an admin login last? | Security vs convenience | Until logout or 8 hours without activity, configurable (design decision; not in the specs) | No | [assumption], [repo: openspec/changes/kickstart/design.md] |
