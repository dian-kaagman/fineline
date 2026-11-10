# Glossary

The vocabulary for code, API and UI. Use the term in the first column; the code name is what identifiers, API fields and database columns should use. Source tags: `[pack: <file>]` = domain pack (source of truth), `[brief]`, `[lead decision]` = decided by the kickstart lead (owner to confirm where listed in `open-questions.md`), `[assumption]` = our reasoning, always repeated in `open-questions.md`.

## People

| Term (use in code) | Meaning | Synonyms the business uses | Code name | Source |
|---|---|---|---|---|
| Customer | Anyone who uploads a photo and orders a framed drawing; one-off buyer, no account, mostly on a phone | buyer | `customer` (fields on the order, no separate account) | [pack: overview.md#Users], [brief] |
| Admin | The owner, the only user of the admin tool; one account, configured by the deployment | owner | `admin` | [pack: overview.md#Users], [pack: rules.md#BR-011], [lead decision] |

## Photo and drawing

| Term (use in code) | Meaning | Synonyms the business uses | Code name | Source |
|---|---|---|---|---|
| Photo | The image file a customer uploads (JPEG, PNG or HEIC). Personal data | picture, upload | `Photo` / `photos` | [pack: glossary.md], [pack: rules.md#BR-001] |
| Drawing | The SVG line drawing generated from a photo: black unfilled pen strokes only, in millimetres, inside the drawing area, within the stroke budget | fineline, line art, sketch | `Drawing` / `drawings` | [pack: glossary.md], [pack: rules.md#BR-002] |
| Preview | The drawing as shown to the customer before ordering. What the customer approves is exactly what is ordered and drawn | | `preview` (a drawing not yet attached to an order) | [pack: glossary.md], [pack: rules.md#BR-005] |
| Preview token | The secret, returned only to the customer who uploaded the photo, that ties a fresh photo and its preview to that customer; without it the preview can't be retrieved or ordered | upload token, photo access token | `previewToken` | [lead decision], [repo: docs/api/openapi.yaml] |
| Stroke | One continuous pen movement: pen down, draw, pen up | line, path | `stroke` | [pack: glossary.md] |
| Stroke budget | The maximum total stroke length (mm) and maximum number of strokes a drawing may have, so the arm draws it in reasonable time | drawing time limit | `strokeBudget` (`maxTotalLengthMm`, `maxStrokes`) | [pack: rules.md#BR-004] |
| Drawing area | The part of the paper the arm may draw on: paper size minus a margin on every side. Default 180 x 267 mm (A4 portrait, 15 mm margin) | canvas | `drawingArea` (`widthMm`, `heightMm`) | [pack: glossary.md], [pack: rules.md#BR-003] |
| Photo terms | The statement the customer agrees to before ordering: the photo is used only to make their drawing | photo consent | `photoTermsAccepted` | [pack: rules.md#BR-007], [pack: rules.md#BR-010] |

**Watch out:** the pack uses "upload" as a synonym for *photo*. Do not introduce a separate "Upload" entity; in the API a photo and the drawing made from it are one `Drawing` record (with its photo file) plus a `previewToken`, and it is a preview until an order references it. **"Single fineline drawing"** in the brief means one drawing per order, not one continuous stroke (see Q-27).

## Frames and stock

| Term (use in code) | Meaning | Synonyms the business uses | Code name | Source |
|---|---|---|---|---|
| Frame | A picture-frame model the customer can choose: name, frame size, price, photo, stock | picture frame, lijst | `Frame` / `frames` | [pack: glossary.md], [pack: rules.md#BR-006] |
| Frame size | The inner (visible) width x height of the frame in mm; must be at least the drawing area (portrait) | size | `widthMm`, `heightMm` | [pack: rules.md#BR-006], [lead decision] |
| Frame photo | A product photo of the frame shown to customers. Not personal data | | `photo` on the frame (`framePhoto` in storage) | [pack: rules.md#BR-006] |
| Stock | How many of a frame are available to sell; never below zero | inventory, voorraad | `stock` | [pack: glossary.md] |
| Stock adjustment | A signed change to a frame's stock by the admin, e.g. +5 after a supplier delivery, -1 for a damaged frame | | `stockAdjustment` (`delta`) | [pack: processes.md#Admin manages frames and delivery time], [lead decision] |
| In stock | A frame with stock above zero; the only frames customers see and can order | available | `inStock` (derived: `stock > 0`) | [pack: rules.md#BR-006] |

## Orders

| Term (use in code) | Meaning | Synonyms the business uses | Code name | Source |
|---|---|---|---|---|
| Order | A customer's request for one framed drawing: one drawing, one frame, customer details, price, status, dates | purchase | `Order` / `orders` | [pack: glossary.md] |
| Order number | The reference the customer and admin see: `FL-<year>-<4 digits>`, counting up per year, e.g. `FL-2026-0042`. Not the internal ID | reference | `orderNumber` | [pack: glossary.md], [pack: rules.md#BR-007] |
| Order price | The amount of the order in EUR cents including VAT; in this kickstart equal to the frame's price at the moment of ordering | price, total | `priceCents` | [lead decision] |
| Delivery address | Where the framed drawing is shipped: street and house number, postal code, city, country (NL or BE) | address | `deliveryAddress` (`street`, `postalCode`, `city`, `country`) | [pack: rules.md#BR-007], [assumption] for the fields |
| Order date | The calendar date in Europe/Amsterdam on which the order was placed | | `orderDate` (derived from `placedAt`, a UTC timestamp) | [lead decision] |
| Order status | Where an order is in its life: `received`, `drawing`, `drawn`, `ready to ship`, `shipped`, `cancelled` | status | `status`: `received`, `drawing`, `drawn`, `ready_to_ship`, `shipped`, `cancelled` | [pack: rules.md#BR-009] |
| Lead time | The standard number of working days between order date and delivery, set by the admin; default 7 | delivery time, levertijd | `leadTimeWorkingDays` | [pack: glossary.md], [pack: rules.md#BR-008] |
| Working day | Monday to Friday. Public holidays are not skipped in this kickstart | business day | `workingDay` | [pack: rules.md#BR-008], [lead decision] |
| Estimated delivery date | The delivery date shown to the customer when ordering (order date + lead time in working days); the admin can change it for a single order | delivery date, expected date | `estimatedDeliveryDate` (one field; the admin's change overwrites it) | [pack: glossary.md], [pack: rules.md#BR-008] |
| Withdrawal notice | The text shown before ordering saying personalised products are exempt from the 14-day withdrawal right | | `withdrawalNotice` | [pack: constraints.md#Legal and compliance] |

**Watch out:** the brief says "delivery date" and the pack says "estimated delivery date" for the same thing. Use one field, `estimatedDeliveryDate`, in code and API; the admin UI may label it "Delivery date".

## Status names in the UI

| Code | UI label |
|---|---|
| `received` | Received |
| `drawing` | Drawing |
| `drawn` | Drawn |
| `ready_to_ship` | Ready to ship |
| `shipped` | Shipped |
| `cancelled` | Cancelled |
