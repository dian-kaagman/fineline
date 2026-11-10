# 0005 Estimated delivery date counts Monday-Friday working days, no holidays

- Status: accepted
- Date: 2026-01 (kickstart)

## Context

The brief asks how the estimated delivery date counts days. BR-008: order date plus the lead time in working days (Monday to Friday), default 7; whether public holidays count is open.

## Decision

- Estimated delivery date = the order date (calendar date in Europe/Amsterdam when the order is placed) plus the lead time in working days, counting Monday to Friday only. Counting starts on the first working day after the order date: an order on Friday 6 November with 7 working days is due Tuesday 17 November (BR-008 example); an order on Saturday 7 or Sunday 8 November is due the same Tuesday 17 November, because Monday 9 is the first day counted.
- Public holidays are not skipped in this kickstart. The admin lengthens the standard lead time around holidays (processes.md: "longer in December") or changes a single order's date.
- The date is computed once when the order is placed and stored; changing the lead time later never changes existing orders.

## Consequences

- Simple, deterministic, fully unit-testable (pure function with an injected date).
- Around Christmas, Easter and King's Day the estimate can be a day or two optimistic unless the admin adjusts the lead time.

## Alternatives considered

- Dutch and Belgian public holiday calendars: more accurate, but two countries' calendars and a yearly maintenance burden for a handful of orders; a candidate follow-up ("closed days" set by the admin is the likely shape).
- Calendar days: simpler, but contradicts BR-008.
