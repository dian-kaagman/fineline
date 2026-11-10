## Purpose

Let a customer upload a photo and, within seconds, see a preview of a pen-plottable SVG line drawing made from it on our own server: black unfilled strokes in millimetres, inside the drawing area and within the stroke budget. Keep photos private and delete them on time.

## ADDED Requirements

### Requirement: Accepted photos
The system SHALL accept a photo only when it is a JPEG, PNG or HEIC file of at most 15 MB with a shortest side of at least 800 pixels, judged from the file content. Any other upload MUST be rejected with a message saying what is wrong, and no drawing is made (BR-001).

#### Scenario: AC-001 Phone photo in HEIC is accepted
- **WHEN** a customer uploads a 4032 x 3024 pixel HEIC photo of 3.1 MB
- **THEN** the photo is accepted and the conversion starts
- **AND** the customer sees a preview of the drawing when the conversion is done

#### Scenario: AC-002 Unsupported file type is rejected
- **WHEN** a customer uploads a GIF file of 2 MB
- **THEN** the upload is rejected with the message "Use a JPEG, PNG or HEIC photo"
- **AND** no photo is stored and no drawing is made

#### Scenario: AC-003 Photo over 15 MB is rejected
- **WHEN** a customer uploads a PNG photo of 16.2 MB
- **THEN** the upload is rejected with the message "The photo must be at most 15 MB"
- **AND** no photo is stored and no drawing is made

#### Scenario: AC-004 Photo with a short side under 800 pixels is rejected
- **WHEN** a customer uploads a JPEG photo of 1200 x 700 pixels
- **THEN** the upload is rejected with the message "The photo's shortest side must be at least 800 pixels"
- **AND** no photo is stored and no drawing is made

### Requirement: Drawing format and size
Every drawing SHALL be an SVG of black (#000000) unfilled strokes only, with no fills, gradients, embedded images or text, with its dimensions in millimetres and all strokes inside the drawing area: by default 180 x 267 mm, otherwise the area set in the deployment configuration. A result that breaks this MUST NOT be shown or ordered (BR-002, BR-003).

#### Scenario: AC-005 Preview drawing is plottable and fits the default drawing area
- **GIVEN** the default drawing area of 180 x 267 mm
- **WHEN** a customer's accepted photo has been converted
- **THEN** the preview SVG declares its width and height in millimetres, at most 180 mm wide and 267 mm high
- **AND** every element is a stroke with stroke colour #000000 and no fill
- **AND** the SVG contains no gradients, embedded images or text, and no stroke lies outside the drawing area

### Requirement: Stroke budget
Every drawing SHALL stay within the stroke budget: at most 25,000 mm total stroke length and at most 1,500 strokes by default, or the budget set in the deployment configuration. The conversion MUST simplify the drawing until it fits and MUST NOT return a drawing over budget (BR-004).

#### Scenario: AC-006 Detailed photo is simplified to fit the budget
- **GIVEN** the default stroke budget of 25,000 mm and 1,500 strokes
- **WHEN** a customer uploads a detailed photo of a crowd whose first trace would need more than 1,500 strokes
- **THEN** the preview drawing has at most 1,500 strokes
- **AND** the sum of its stroke lengths is at most 25,000 mm

### Requirement: Conversion on our own server with progress
The system SHALL convert photos on our own server only and MUST NOT send a photo or drawing to any third-party service. While converting, the customer SHALL see that work is in progress; a photo at the upload limits SHALL get its preview within 30 seconds (BR-016).

#### Scenario: AC-007 Conversion shows progress, is quick and stays on our server
- **WHEN** a customer uploads an accepted 4000 x 3000 pixel JPEG photo of 14.8 MB
- **THEN** the customer sees a progress indication until the preview appears
- **AND** the preview appears within 30 seconds of the upload completing
- **AND** no network request containing the photo or the drawing leaves our deployment

### Requirement: Try another photo
The customer SHALL be able to discard a preview and upload another photo, which gets its own new preview. When no drawing can be made from a photo the customer MUST get a message and the option to try another photo. The customer cannot adjust detail or crop in this version (BR-017).

#### Scenario: AC-008 Photo that yields no drawing asks for another photo
- **WHEN** a customer uploads an accepted 1600 x 1200 pixel JPEG that is entirely black
- **THEN** no preview is shown
- **AND** the customer sees the message "We couldn't make a drawing from this photo. Please try another photo." with a way to upload another photo

#### Scenario: AC-009 Customer discards the preview and tries another photo
- **GIVEN** a customer sees the preview of their first photo
- **WHEN** they choose "Try another photo" and upload a second accepted photo
- **THEN** they see a new preview made from the second photo
- **AND** the order step uses the second preview, not the first
- **AND** no controls for detail level or cropping are offered

### Requirement: Fresh previews are private
A photo and its preview that are not part of an order SHALL be retrievable and orderable only with the preview token given to the customer who uploaded it. Any request without the right token MUST be refused as not available, with the same answer as for an expired preview, revealing nothing about the photo (BR-013, BR-010).

#### Scenario: AC-010 Preview is not reachable without its preview token
- **GIVEN** a customer has a preview of their photo in their browser
- **WHEN** someone in another browser requests that photo or drawing, or tries to order it, using its ID but without the customer's preview token
- **THEN** the request is refused as not available
- **AND** neither the photo nor the drawing is returned and no order is created

### Requirement: Photo retention
The system SHALL delete a photo that is not part of an order, together with its preview, 24 hours after upload. It SHALL delete the original photo of an order 30 days after the order is shipped or cancelled, keep the order's drawing, and keep the photo of an order that is still in progress (BR-010).

#### Scenario: AC-011 Unordered photo and preview are deleted after 24 hours
- **GIVEN** a customer uploaded a photo at 10:00 on Tuesday 3 November 2026 and did not place an order
- **WHEN** it is later than 10:00 on Wednesday 4 November 2026
- **THEN** the photo and its preview are no longer stored
- **AND** placing an order with that preview and the customer's own preview token is rejected with "This preview is no longer available. Please upload your photo again." and no frame stock is taken

#### Scenario: AC-012 Order photo is deleted 30 days after shipping and the drawing is kept
- **GIVEN** order FL-2026-0042 was marked shipped on Tuesday 1 December 2026
- **AND** order FL-2026-0051 has been in status "drawing" since Monday 2 November 2026
- **WHEN** Thursday 31 December 2026 has passed
- **THEN** the photo of FL-2026-0042 is no longer stored and its order detail shows that the photo was deleted
- **AND** the admin can still download the drawing of FL-2026-0042
- **AND** the photo of FL-2026-0051 is still stored
