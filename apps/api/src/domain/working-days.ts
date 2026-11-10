/**
 * Calendar dates and working days (BR-008, ADR 0005). Pure functions; "now" is always passed in.
 * A calendar date is a `YYYY-MM-DD` string meaning a date in Europe/Amsterdam.
 */

export const SHOP_TIME_ZONE = "Europe/Amsterdam";

const amsterdamDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHOP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar date in Europe/Amsterdam at the given instant (the order date). */
export function amsterdamDateOf(instant: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return amsterdamDate.format(instant);
}

/** The year of the Amsterdam calendar date at the given instant (used in order numbers). */
export function amsterdamYearOf(instant: Date): number {
  return Number(amsterdamDateOf(instant).slice(0, 4));
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date in `YYYY-MM-DD` form (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  const m = DATE_PATTERN.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

function toUtcMidnight(date: string): Date {
  if (!isCalendarDate(date)) throw new RangeError("not a calendar date");
  return new Date(`${date}T00:00:00Z`);
}

/**
 * Order date plus `workingDays` working days (Monday to Friday; public holidays count as working
 * days). Counting starts on the first working day after the order date.
 */
export function addWorkingDays(orderDate: string, workingDays: number): string {
  if (!Number.isInteger(workingDays) || workingDays < 1) {
    throw new RangeError("workingDays must be a positive whole number");
  }
  const day = toUtcMidnight(orderDate);
  let remaining = workingDays;
  while (remaining > 0) {
    day.setUTCDate(day.getUTCDate() + 1);
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return day.toISOString().slice(0, 10);
}

/** The estimated delivery date for an order placed at `placedAt` with the given lead time. */
export function estimatedDeliveryDate(placedAt: Date, leadTimeWorkingDays: number): string {
  return addWorkingDays(amsterdamDateOf(placedAt), leadTimeWorkingDays);
}
