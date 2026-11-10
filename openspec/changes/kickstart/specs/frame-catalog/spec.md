## Purpose

Let the admin keep the frame catalogue: add and edit frame models with name, frame size, price and photo, and adjust their stock, so that customers are only ever offered frames that fit the drawing and are in stock.

## ADDED Requirements

### Requirement: Adding a frame
The admin SHALL be able to add a frame with a name, an inner width and height in mm of at least the drawing area (180 x 267 mm by default, portrait), a price in whole euro cents including VAT above zero, a JPEG, PNG or WebP photo of at most 5 MB and a starting stock of zero or more. Invalid input MUST be rejected naming each invalid field (BR-006, BR-003).

#### Scenario: AC-039 Admin adds a frame
- **WHEN** the admin adds frame "Oak A4" with size 210 x 297 mm, price 4995 cents, a JPEG photo and stock 5
- **THEN** the frame is created with these values
- **AND** customers are offered "Oak A4" at €49.95

#### Scenario: AC-040 Frame smaller than the drawing area is rejected
- **GIVEN** the default drawing area of 180 x 267 mm
- **WHEN** the admin adds frame "Mini 13x18" with size 130 x 180 mm, price 1995 cents, a photo and stock 3
- **THEN** the frame is rejected with a message that it must be at least 180 x 267 mm
- **AND** no frame is created

#### Scenario: AC-041 Invalid price, stock or missing photo is rejected
- **WHEN** the admin adds frame "Walnut 30x40" with size 300 x 400 mm, price 0 cents, stock -1 and no photo
- **THEN** the frame is rejected with messages naming the price, the stock and the photo
- **AND** no frame is created

### Requirement: Editing a frame
The admin SHALL be able to edit a frame's name, size, price and photo under the same rules as when adding. Stock MUST NOT be overwritten by editing; it changes only by stock adjustments, orders and cancellations. Existing orders MUST keep the price they were placed at (BR-006, BR-012).

#### Scenario: AC-042 Price change applies to new orders only
- **GIVEN** frame "Oak A4" costs 4995 cents and order FL-2026-0042 was placed with it
- **WHEN** the admin changes the price of "Oak A4" to 5495 cents
- **THEN** customers are offered "Oak A4" at €54.95
- **AND** order FL-2026-0042 still has the price €49.95

### Requirement: Stock adjustment
The admin SHALL be able to change a frame's stock by a signed whole number. An adjustment that would make the stock negative MUST be rejected and leave the stock unchanged (BR-006).

#### Scenario: AC-043 Supplier delivery is added to stock
- **GIVEN** frame "Black A4" has stock 0 and is not offered to customers
- **WHEN** the admin adjusts its stock by +5
- **THEN** "Black A4" has stock 5
- **AND** customers are offered "Black A4" again

#### Scenario: AC-044 Adjustment below zero is rejected
- **GIVEN** frame "Oak A4" has stock 2
- **WHEN** the admin adjusts its stock by -3
- **THEN** the adjustment is rejected with a message that stock can't go below zero
- **AND** "Oak A4" still has stock 2
