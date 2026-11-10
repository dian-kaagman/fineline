# Brief: Fineline drawing orders

## What we're building

A small shop where people order a hand-drawn line portrait of their photo. A customer uploads a photo, the website turns it into a **single fineline drawing**: an SVG with black pen strokes only. The customer previews it, picks a picture frame and orders. I draw the SVG on paper with my Rotrics desktop robot arm (I import the SVG into the Rotrics software), frame it, and send it to the customer's home.

An **admin tool** lets me see and handle the orders: download each order's SVG for the arm, move orders through drawing, framing and shipping, manage delivery times, and manage the frames and their stock.

## Users

- **Customer** - anyone with a photo, ordering a framed drawing as a gift or for themselves. Mostly on a phone.
- **Admin** - me (one person), on a laptop next to the robot arm.

## Must-haves for the kickstart

1. **Photo to line drawing.** Upload a photo and get a preview of the generated SVG within a reasonable wait. The SVG follows the drawing rules in the domain pack: black strokes only, no fills, fits the paper, plottable by a pen arm. This is the riskiest part, so it must work end to end in the first slice.
2. **Order.** Choose a frame that is in stock, enter name, email and delivery address, agree to the photo terms, and place the order. The customer sees an order number and an estimated delivery date.
3. **Admin login.** The admin tool is only reachable after logging in.
4. **Orders in the admin tool.** List orders with status and delivery date; open an order; download its SVG; move it through the statuses; change its delivery date.
5. **Frames and stock.** Add and edit frames (name, size, price, photo, stock) and adjust stock.
6. **Delivery time.** Set the standard lead time used for the estimated delivery date.

## Constraints

- A web app that works well on phones for customers and on a laptop for the admin. No native app.
- TypeScript for the web and the API. The photo-to-SVG conversion may run in a separate Python worker if that gives a clearly better drawing; decide in an ADR.
- PostgreSQL. Uploaded photos and SVGs are stored as files (local disk in development, behind an interface so cloud storage can be added later).
- Customers' photos are personal data and are processed on our own server: no third-party image or AI services for the conversion in this kickstart.
- Hosting is undecided; it must run with Docker Compose locally.

## Out of scope for now

- Online payment (orders are placed and I arrange payment myself for now).
- Emails to customers, customer accounts, discount codes.
- Sending drawings to the robot arm directly from the admin tool (I download the SVG and import it myself).
- More than one admin user.

## Open questions (decide a default and record an ADR)

- Which line-drawing approach gives a good portrait as pen strokes (edge detection and tracing, contour lines, a continuous single line, ...), and how to keep the drawing time on the arm reasonable.
- Whether customers can adjust the drawing before ordering (detail level, crop).
- How the estimated delivery date counts days (working days, holidays).
