## Why

A one-person studio sells framed, robot-drawn line portraits. Today every order needs manual back-and-forth: the customer cannot see what the drawing will look like, and the owner has no single place to prepare drawings for the Rotrics arm, track orders to shipping and keep frames in stock. The kickstart delivers the first working slice: a customer turns a photo into a pen-plottable drawing and orders it framed; the owner handles the order in a logged-in admin tool.

## What Changes

- Customers upload a photo (BR-001) and, within seconds, see a preview of the generated SVG line drawing that follows the drawing rules: black strokes only, millimetre units, inside the drawing area, within the stroke budget (BR-002, BR-003, BR-004). Conversion runs on our own server only.
- Customers choose a frame in stock, enter name, email and delivery address, agree to the photo terms and place the order; they see an order number and an estimated delivery date (BR-005 to BR-008, BR-010).
- The admin tool is reachable only after the single admin logs in (BR-011).
- The admin lists orders with status and delivery date, opens an order, downloads its SVG, moves it through the statuses and changes its delivery date (BR-009).
- The admin adds and edits frames (name, size, price, photo, stock) and adjusts stock (BR-006).
- The admin sets the standard lead time used for new estimated delivery dates (BR-008).
- Photos are kept only as long as BR-010 allows: uploads without an order are deleted after 24 hours, order photos 30 days after the order ships or is cancelled; photos and drawings of orders are visible only in the admin tool.

## Capabilities

### New Capabilities
- `photo-drawing`: accepting a customer photo, converting it on our own server into a pen-plottable SVG drawing within the stroke budget, and showing it as a preview; deleting photos per the retention rule.
- `ordering`: choosing an in-stock frame, entering delivery details, agreeing to photo terms, placing the order and showing the order number and estimated delivery date.
- `admin-access`: logging the single admin in and out, and refusing every admin page and API call without a valid session.
- `order-management`: the admin's order list, order detail, SVG download, status transitions and per-order delivery date changes.
- `frame-catalog`: the admin's frame models with size, price, photo and stock, stock adjustments, and the public list of frames in stock.
- `delivery-settings`: the admin-set standard lead time used to compute estimated delivery dates.

## Impact

- New TypeScript HTTP API (`apps/api`) with PostgreSQL and a file-storage interface (local disk in development) for photos, drawings and frame photos.
- New Python conversion worker (`apps/worker`) that turns a photo into an SVG drawing; called only by the API over the internal network (decision in an ADR).
- New TypeScript web app (`apps/web`): the mobile-first customer shop and the laptop admin tool.
- Docker Compose for local running of database, API, worker and web.
- Out of scope: online payment, customer emails, customer accounts, discount codes, sending drawings to the arm directly, more than one admin user, customer-side drawing adjustments beyond retrying with another photo (ADR).
