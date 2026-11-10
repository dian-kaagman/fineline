## Purpose

Let the admin work through orders: list them with status and delivery date, open one, download its SVG for the robot arm, move it through the statuses from received to shipped or cancel it, and change its delivery date.

## ADDED Requirements

### Requirement: Order list
The admin SHALL see a list of orders showing order number, status, order date and estimated delivery date, sorted by estimated delivery date with the earliest first, and filterable by status (BR-009).

#### Scenario: AC-029 Received orders are listed earliest delivery date first
- **GIVEN** order FL-2026-0042 (received, delivery Tuesday 17 November 2026), FL-2026-0040 (received, delivery Friday 13 November 2026) and FL-2026-0039 (shipped, delivery Thursday 12 November 2026)
- **WHEN** the admin lists orders filtered on status "received"
- **THEN** the list shows FL-2026-0040 first and FL-2026-0042 second, each with its status and delivery date
- **AND** FL-2026-0039 is not in the list

### Requirement: Order detail
The admin SHALL be able to open an order and see its order number, status, order date, estimated delivery date, customer name, email and delivery address, frame, order price, photo (or that it was deleted) and drawing (BR-010, BR-012).

#### Scenario: AC-030 Admin opens an order
- **GIVEN** order FL-2026-0042 by "Anna de Vries" with frame "Oak A4" at 4995 cents
- **WHEN** the admin opens FL-2026-0042
- **THEN** the admin sees the order number, status "received", order date 6 November 2026, delivery date 17 November 2026, the customer's name, email and delivery address, "Oak A4", €49.95, the photo and the drawing

### Requirement: SVG download
The admin SHALL be able to download the order's drawing as an SVG file named after the order number. Downloading the SVG of a received order MUST move it to drawing; downloading it in any later status MUST return the same SVG and leave the status unchanged (BR-005, BR-009).

#### Scenario: AC-031 Downloading the SVG of a received order starts the drawing
- **GIVEN** order FL-2026-0042 has status "received"
- **WHEN** the admin downloads its SVG
- **THEN** the admin receives the file "FL-2026-0042.svg" containing the order's drawing
- **AND** the order's status is "drawing"

#### Scenario: AC-032 Downloading again for a redo does not change the status
- **GIVEN** order FL-2026-0042 has status "drawn" and its SVG was downloaded before
- **WHEN** the admin downloads its SVG again because the pen ran dry
- **THEN** the file is byte-for-byte the same SVG as the first download
- **AND** the order's status is still "drawn"

### Requirement: Status transitions
The admin SHALL move an order one step forward at a time: drawing to drawn, drawn to ready to ship, ready to ship to shipped. Any other change, such as skipping a step, going back or cancelling a drawn order, MUST be rejected and leave the order unchanged (BR-009).

#### Scenario: AC-033 Order moves forward to shipped
- **GIVEN** order FL-2026-0042 has status "drawing"
- **WHEN** the admin marks it drawn, then ready to ship, then shipped
- **THEN** its status is "drawn", then "ready to ship", then "shipped"

#### Scenario: AC-034 Skipping, going back and late cancelling are rejected
- **GIVEN** order FL-2026-0043 has status "received" and order FL-2026-0044 has status "drawn"
- **WHEN** the admin tries to mark FL-2026-0043 shipped, to move FL-2026-0044 back to drawing, and to cancel FL-2026-0044
- **THEN** each change is rejected with a message naming the current status
- **AND** FL-2026-0043 is still "received" and FL-2026-0044 is still "drawn"

### Requirement: Cancelling an order
The admin SHALL be able to cancel an order with status received or drawing; cancelling MUST put the order's frame back in stock (stock + 1) (BR-006, BR-009).

#### Scenario: AC-035 Cancelling a received order returns the frame to stock
- **GIVEN** order FL-2026-0042 for frame "Oak A4" has status "received" and "Oak A4" has stock 0
- **WHEN** the admin cancels FL-2026-0042
- **THEN** its status is "cancelled"
- **AND** "Oak A4" has stock 1 and is offered to customers again

### Requirement: Final statuses
Shipped and cancelled orders MUST NOT change status or delivery date any more (BR-009, BR-008).

#### Scenario: AC-036 Shipped and cancelled orders stay as they are
- **GIVEN** order FL-2026-0039 has status "shipped" and order FL-2026-0041 has status "cancelled"
- **WHEN** the admin tries to cancel FL-2026-0039, to mark FL-2026-0041 drawn, and to change the delivery date of either
- **THEN** each change is rejected
- **AND** both orders keep their status and delivery date, and frame stock does not change

### Requirement: Changing an order's delivery date
The admin SHALL be able to change the estimated delivery date of a single order that is not shipped or cancelled to any calendar date on or after its order date; other orders MUST NOT change. An earlier date MUST be rejected (BR-008).

#### Scenario: AC-037 Admin postpones one order's delivery date
- **GIVEN** order FL-2026-0042 (order date Friday 6 November 2026) has delivery date Tuesday 17 November 2026 and FL-2026-0043 has delivery date Wednesday 18 November 2026
- **WHEN** the admin changes the delivery date of FL-2026-0042 to Friday 20 November 2026
- **THEN** FL-2026-0042 shows delivery date Friday 20 November 2026
- **AND** FL-2026-0043 still shows Wednesday 18 November 2026

#### Scenario: AC-038 Delivery date before the order date is rejected
- **GIVEN** order FL-2026-0042 has order date Friday 6 November 2026
- **WHEN** the admin changes its delivery date to Thursday 5 November 2026
- **THEN** the change is rejected with a message that the date can't be before the order date
- **AND** the delivery date stays Tuesday 17 November 2026
