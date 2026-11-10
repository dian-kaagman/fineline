import { z } from "zod";
import type { ErrorDetail } from "../../lib/errors.js";
import { text } from "../../lib/validation.js";
import type { FrameRow } from "./frames.repository.js";

export const INT32_MAX = 2_147_483_647;
/** Business ceiling for stock, far below the integer column's limit so adding never overflows. */
export const MAX_STOCK = 100_000;
/** 5 MiB (Q-16). */
export const MAX_FRAME_PHOTO_BYTES = 5 * 1024 * 1024;

export interface DrawingArea {
  widthMm: number;
  heightMm: number;
}

export const frameName = text(100, "Enter a name", "The name must be 100 characters or fewer");

export const tooSmallMessage = (area: DrawingArea) =>
  `The frame must be at least ${area.widthMm} x ${area.heightMm} mm inside, so the drawing fits`;

const wholeNumber = (message: string) =>
  z.number({ error: message }).int(message).max(INT32_MAX, message);

export const widthMessage = "Enter the inner width as a whole number of millimetres";
export const heightMessage = "Enter the inner height as a whole number of millimetres";
export const priceMessage = "Enter a price above 0 in whole euro cents, like 4995";
export const stockMessage = `Enter a starting stock from 0 to ${MAX_STOCK}, as a whole number`;

/** Frame size must be at least the drawing area, portrait (BR-006, BR-003, Q-15). */
export function sizeProblems(
  area: DrawingArea,
  widthMm?: number,
  heightMm?: number,
): ErrorDetail[] {
  const problems: ErrorDetail[] = [];
  if (widthMm !== undefined && widthMm < area.widthMm)
    problems.push({ field: "widthMm", message: tooSmallMessage(area) });
  if (heightMm !== undefined && heightMm < area.heightMm) {
    problems.push({ field: "heightMm", message: tooSmallMessage(area) });
  }
  return problems;
}

/** Text fields of the multipart create form, converted from strings (all problems reported together). */
export const createFrameFields = z.object({
  name: frameName,
  widthMm: z
    .string({ error: widthMessage })
    .regex(/^\d{1,10}$/, widthMessage)
    .transform(Number)
    .pipe(wholeNumber(widthMessage)),
  heightMm: z
    .string({ error: heightMessage })
    .regex(/^\d{1,10}$/, heightMessage)
    .transform(Number)
    .pipe(wholeNumber(heightMessage)),
  priceCents: z
    .string({ error: priceMessage })
    .regex(/^\d{1,10}$/, priceMessage)
    .transform(Number)
    .pipe(wholeNumber(priceMessage).min(1, priceMessage)),
  stock: z
    .string({ error: stockMessage })
    .regex(/^\d{1,10}$/, stockMessage)
    .transform(Number)
    .pipe(wholeNumber(stockMessage).max(MAX_STOCK, stockMessage)),
});

export const updateFrameBody = z
  .strictObject({
    name: frameName.optional(),
    widthMm: wholeNumber(widthMessage).optional(),
    heightMm: wholeNumber(heightMessage).optional(),
    priceCents: wholeNumber(priceMessage).min(1, priceMessage).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Change at least one field");

export const stockAdjustmentBody = z.strictObject({
  delta: z
    .number({ error: "Enter a whole number from -10000 to 10000, not 0" })
    .int("Enter a whole number from -10000 to 10000, not 0")
    .min(-10_000, "Enter a whole number from -10000 to 10000, not 0")
    .max(10_000, "Enter a whole number from -10000 to 10000, not 0")
    .refine((v) => v !== 0, "Enter a whole number from -10000 to 10000, not 0"),
});

export const framePhotoUrl = (id: string) => `/api/v1/frames/${id}/photo`;

export function toPublicFrame(row: FrameRow) {
  return {
    id: row.id,
    name: row.name,
    widthMm: row.widthMm,
    heightMm: row.heightMm,
    priceCents: row.priceCents,
    photoUrl: framePhotoUrl(row.id),
  };
}

export function toAdminFrame(row: FrameRow) {
  return {
    ...toPublicFrame(row),
    stock: row.stock,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
