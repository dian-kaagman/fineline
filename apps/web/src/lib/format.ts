// Formatting rules from docs/ux/content.md "Formatting" (UX-014).
import { t, tPlural } from "../i18n/t";

const money = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

/** 4995 -> "€49.95" (prices are integer cents including VAT). */
export function formatPrice(priceCents: number): string {
  return money.format(priceCents / 100);
}

const longDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const shortDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** A `YYYY-MM-DD` calendar date as a UTC instant, so formatting never shifts it by a time zone. */
function calendarDate(isoDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) throw new RangeError(`Not a calendar date: ${isoDate}`);
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function withoutCommas(text: string): string {
  return text.replace(/,/g, "");
}

/** "2026-11-17" -> "Tuesday 17 November 2026". */
export function formatDateLong(isoDate: string): string {
  return withoutCommas(longDate.format(calendarDate(isoDate)));
}

/** "2026-11-17" -> "Tue 17 Nov 2026" (admin list). */
export function formatDateShort(isoDate: string): string {
  return withoutCommas(shortDate.format(calendarDate(isoDate)));
}

const amsterdamTime = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Amsterdam",
});
const amsterdamDayMonth = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Amsterdam",
});

/** `expiresAt` -> { time: "10:00", date: "Wednesday 4 November" } in Europe/Amsterdam (UX-025). */
export function formatExpiry(isoTimestamp: string): { time: string; date: string } {
  const instant = new Date(isoTimestamp);
  return {
    time: amsterdamTime.format(instant),
    date: withoutCommas(amsterdamDayMonth.format(instant)),
  };
}

/** "210 x 297 mm" (plain "x", as in the specs). */
export function formatSize(widthMm: number, heightMm: number): string {
  return t("c4.frameSize", { widthMm: formatNumber(widthMm), heightMm: formatNumber(heightMm) });
}

const plainNumber = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return plainNumber.format(value);
}

const metres = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** 14250.5 mm -> "14.3 m". */
export function formatLength(totalLengthMm: number): string {
  return t("a3.drawing.lengthValue", { metres: metres.format(totalLengthMm / 1000) });
}

/** Retry-After seconds rounded up to whole minutes: 90 -> "2 minutes", 900 -> "15 minutes". */
export function formatWait(retryAfterSeconds: number | undefined): string {
  if (
    retryAfterSeconds === undefined ||
    !Number.isFinite(retryAfterSeconds) ||
    retryAfterSeconds < 0
  ) {
    return t("wait.unknown");
  }
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return minutes === 1 ? t("wait.one") : t("wait.other", { n: minutes });
}

/** "{count} strokes" with the count formatted. */
export function formatStrokeCount(count: number): string {
  return tPlural("a3.drawing.strokeCount", count, { count: formatNumber(count) });
}
