# delivery-settings Specification

## Purpose
Let the admin set the standard lead time in working days, and compute each new order's estimated delivery date from its order date in Europe/Amsterdam, counting Monday to Friday only.

## Requirements

### Requirement: Standard lead time
The admin SHALL be able to set the standard lead time as a whole number of working days from 1 to 60; the default is 7. A new lead time SHALL apply to orders placed afterwards and MUST NOT change existing orders. Other values MUST be rejected (BR-008).

#### Scenario: AC-045 New lead time applies to new orders only
- **GIVEN** the lead time is 7 working days and order FL-2026-0042, placed on Friday 6 November 2026, has delivery date Tuesday 17 November 2026
- **WHEN** the admin sets the lead time to 10 working days and a customer places an order on Monday 9 November 2026
- **THEN** the new order's estimated delivery date is Monday 23 November 2026
- **AND** FL-2026-0042 still has delivery date Tuesday 17 November 2026

#### Scenario: AC-046 Invalid lead time is rejected
- **GIVEN** the lead time is 7 working days
- **WHEN** the admin sets the lead time to 0, to 2.5 or to 61
- **THEN** each value is rejected with a message that the lead time must be a whole number from 1 to 60
- **AND** the lead time stays 7 working days

### Requirement: Estimated delivery date calculation
The estimated delivery date SHALL be the order date plus the lead time in working days, counting Monday to Friday from the first working day after the order date. Public holidays are not skipped. The order date is the calendar date in Europe/Amsterdam when the order is placed (BR-008).

#### Scenario: AC-047 Order placed on a Saturday
- **GIVEN** the lead time is 7 working days
- **WHEN** a customer places an order at 11:00 on Saturday 7 November 2026 (Europe/Amsterdam)
- **THEN** the estimated delivery date is Tuesday 17 November 2026

#### Scenario: AC-048 Order date follows Amsterdam time, not UTC
- **GIVEN** the lead time is 7 working days
- **WHEN** a customer places an order at 23:30 UTC on Thursday 5 November 2026, which is 00:30 on Friday 6 November 2026 in Amsterdam
- **THEN** the order date is Friday 6 November 2026
- **AND** the estimated delivery date is Tuesday 17 November 2026, not Monday 16 November 2026

#### Scenario: AC-049 Public holidays count as working days
- **GIVEN** the lead time is 7 working days
- **WHEN** a customer places an order on Friday 18 December 2026
- **THEN** the estimated delivery date is Tuesday 29 December 2026, with Christmas Day on Friday 25 December counted as a working day
