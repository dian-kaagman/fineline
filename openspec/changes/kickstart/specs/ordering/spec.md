## Purpose

Let a customer order their previewed drawing in a frame that is in stock: choose the frame and see the price, enter name, email and delivery address, agree to the photo terms, read the withdrawal notice, place the order and see the order number and estimated delivery date.

## ADDED Requirements

### Requirement: Choosing a frame
The order page SHALL show only frames with stock above zero, each with its name, frame size, photo and price in euros including VAT, and the order price SHALL equal the chosen frame's price (BR-006, BR-012).

#### Scenario: AC-013 Only frames in stock are offered, with their price
- **GIVEN** frame "Oak A4" (210 x 297 mm, 4995 cents, stock 3) and frame "Black A4" (210 x 297 mm, 3995 cents, stock 0)
- **WHEN** a customer with a preview opens the frame choice
- **THEN** "Oak A4" is offered with its photo, its size 210 x 297 mm and the price €49.95
- **AND** "Black A4" is not offered

### Requirement: Customer details
To place an order the system SHALL require the customer's name, a valid email address and a delivery address of street and house number, postal code and city, and MUST reject a missing or invalid field with a message naming it. Postal codes MUST match the country: NL "1234 AB", BE four digits (BR-007).

#### Scenario: AC-014 Missing or invalid details are rejected per field
- **WHEN** a customer places an order with the name "Anna de Vries", the email "anna@example", an empty city and the NL postal code "12345"
- **THEN** the order is rejected and no order is created
- **AND** the messages name the email address, the city and the postal code as invalid
- **AND** the details the customer entered are kept in the form

### Requirement: Delivery countries
The system SHALL accept delivery addresses in the Netherlands and Belgium only and MUST reject any other country (BR-007).

#### Scenario: AC-015 Delivery address in Germany is rejected
- **WHEN** a customer places an order with a delivery address in Berlin, Germany
- **THEN** the order is rejected with the message "We deliver to the Netherlands and Belgium only"
- **AND** no order is created and no frame stock is taken

### Requirement: Photo terms
The system MUST NOT accept an order unless the customer has agreed to the photo terms, which say the photo is used only to make their drawing (BR-007, BR-010).

#### Scenario: AC-016 Order without agreement to the photo terms is rejected
- **WHEN** a customer fills in all details but does not tick "I agree that my photo is used only to make my drawing" and places the order
- **THEN** the order is rejected with a message asking them to agree to the photo terms
- **AND** no order is created

### Requirement: Withdrawal notice
Before the customer can place an order, the order page SHALL state that a personalised product is exempt from the 14-day right of withdrawal (BR-015).

#### Scenario: AC-017 Withdrawal notice is shown before ordering
- **WHEN** a customer reaches the step where they place the order
- **THEN** the page shows, above the button to place the order, that the drawing is a personalised product and the 14-day right of withdrawal does not apply

### Requirement: Placing an order
When all conditions are met the system SHALL create the order with status received, the next order number, the order price from the frame, the estimated delivery date, and take one frame from stock. The customer SHALL then see the order number, the price and the estimated delivery date (BR-006, BR-007, BR-008, BR-009, BR-012).

#### Scenario: AC-018 Customer places an order and sees number and delivery date
- **GIVEN** 41 orders have been placed in 2026, the lead time is 7 working days and frame "Oak A4" costs 4995 cents with stock 3
- **WHEN** a customer places a valid order with "Oak A4" at 14:00 on Friday 6 November 2026 (Europe/Amsterdam)
- **THEN** the customer sees the order number "FL-2026-0042", the price €49.95 and the estimated delivery date Tuesday 17 November 2026
- **AND** the order has status "received"
- **AND** the stock of "Oak A4" is 2

### Requirement: Order numbers
Each order SHALL get an order number FL-<year>-<4 digits>, counting up from 0001 within each year, where the year is that of the order date in Europe/Amsterdam. The order number is different from any internal ID (BR-007).

#### Scenario: AC-019 First order of a new year starts again at 0001
- **GIVEN** the last order of 2026 is FL-2026-0137
- **WHEN** a customer places an order at 23:30 UTC on Thursday 31 December 2026, which is 00:30 on Friday 1 January 2027 in Amsterdam
- **THEN** the order number is "FL-2027-0001"

### Requirement: Last frame sold once
The system MUST NOT sell more frames than are in stock, even when orders arrive at the same moment. An order for a frame that sold out MUST be rejected with "this frame just sold out", keep the customer's details and preview, and let them choose another frame (BR-006).

#### Scenario: AC-020 Two customers order the last frame at the same moment
- **GIVEN** frame "Oak A4" has stock 1 and frame "Walnut 30x40" has stock 4
- **WHEN** two customers each place a valid order for "Oak A4" at the same moment
- **THEN** exactly one order is created and the stock of "Oak A4" is 0
- **AND** the other customer sees "This frame just sold out" with their details and preview kept
- **AND** that customer can choose "Walnut 30x40" and place the order

### Requirement: The preview is what is ordered
The order SHALL store exactly the drawing the customer previewed; it MUST NOT be regenerated after ordering. An order MUST be rejected when its preview has expired or belongs to another browser session (BR-005, BR-010, BR-013).

#### Scenario: AC-021 Ordered drawing is identical to the preview
- **GIVEN** a customer saw a preview and placed order FL-2026-0042 with it
- **WHEN** the deployment's drawing area is later changed and the admin downloads the SVG of FL-2026-0042
- **THEN** the downloaded SVG is byte-for-byte identical to the SVG shown to the customer as the preview

#### Scenario: AC-022 Order for someone else's preview is rejected
- **GIVEN** a preview was uploaded in another browser session
- **WHEN** a customer places an otherwise valid order naming that preview without its preview token
- **THEN** the order is rejected with "This preview is no longer available. Please upload your photo again."
- **AND** no order is created and no frame stock is taken

### Requirement: No personal data in logs
The system MUST NOT write customer names, email addresses, delivery addresses, photo or drawing contents, or original photo file names to its logs. Logs MAY contain order numbers and internal IDs (BR-014).

#### Scenario: AC-023 Placing an order logs no personal data
- **WHEN** customer "Anna de Vries", email "anna@example.nl", address "Lindelaan 12, 3512 AB Utrecht, NL", uploads "anna-en-tim.heic" and places order FL-2026-0042
- **THEN** the application logs may mention "FL-2026-0042"
- **AND** the logs contain none of "Anna de Vries", "anna@example.nl", "Lindelaan 12", "3512 AB" or "anna-en-tim.heic"
