// Frame form checks for A5 and A6 (BR-006, BR-003, AC-040, AC-041, UX-031) and the mapping of the
// API's `validation_failed` details onto the same fields.
import { ApiError } from "../api/client";
import { t } from "../i18n/t";
import { parsePriceCents, parseWholeNumber } from "../lib/parse";

export const MAX_FRAME_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MiB, as the API enforces (SR-001)
const FRAME_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_MM = 100000;

export interface FrameFormValues {
  name: string;
  widthMm: string;
  heightMm: string;
  price: string;
  stock: string;
}

export type FrameField = "name" | "widthMm" | "heightMm" | "priceCents" | "stock" | "photo";
export type FrameErrors = Partial<Record<FrameField, string>>;

export const FRAME_FIELD_ORDER: readonly FrameField[] = [
  "name",
  "widthMm",
  "heightMm",
  "priceCents",
  "stock",
  "photo",
];

export interface DrawingArea {
  widthMm: number;
  heightMm: number;
}

export interface ParsedFrame {
  name: string;
  widthMm: number;
  heightMm: number;
  priceCents: number;
  stock: number;
}

function tooSmall(area: DrawingArea): string {
  return t("frame.error.tooSmall", { areaWidth: area.widthMm, areaHeight: area.heightMm });
}

/** Checks name, size and price (and stock when `withStock`); returns the parsed values or errors. */
export function checkFrameValues(
  values: FrameFormValues,
  area: DrawingArea | null,
  withStock: boolean,
): { errors: FrameErrors; parsed: ParsedFrame | null } {
  const errors: FrameErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = t("frame.error.name.required");
  else if (name.length > 100) errors.name = t("frame.error.name.tooLong");

  const widthMm = parseWholeNumber(values.widthMm, 1, MAX_MM);
  const heightMm = parseWholeNumber(values.heightMm, 1, MAX_MM);
  if (widthMm === null) errors.widthMm = t("frame.error.width.invalid");
  if (heightMm === null) errors.heightMm = t("frame.error.height.invalid");
  if (
    area &&
    widthMm !== null &&
    heightMm !== null &&
    (widthMm < area.widthMm || heightMm < area.heightMm)
  ) {
    // AC-040: the message goes on both size fields.
    errors.widthMm = tooSmall(area);
    errors.heightMm = tooSmall(area);
  }

  const priceCents = parsePriceCents(values.price);
  if (priceCents === null) errors.priceCents = t("frame.error.price.invalid");

  const stock = withStock ? parseWholeNumber(values.stock, 0, 1_000_000) : 0;
  if (stock === null) errors.stock = t("frame.error.stock.invalid");

  const valid = Object.keys(errors).length === 0;
  return {
    errors,
    parsed: valid
      ? { name, widthMm: widthMm!, heightMm: heightMm!, priceCents: priceCents!, stock: stock! }
      : null,
  };
}

/** The photo checks the browser can do; null when fine. */
export function checkFramePhoto(photo: File | null): string | null {
  if (!photo) return t("frame.error.photo.missing");
  if (!FRAME_PHOTO_TYPES.includes(photo.type)) return t("frame.error.photo.unsupportedType");
  if (photo.size > MAX_FRAME_PHOTO_BYTES) return t("frame.error.photo.tooLarge");
  return null;
}

/** Maps the API's answer to field messages (all problems are reported together, AC-041). */
export function frameErrorsFromApi(
  error: ApiError,
  values: FrameFormValues,
  photo: File | null,
  area: DrawingArea | null,
): FrameErrors | null {
  if (error.status === 413) return { photo: t("frame.error.photo.tooLarge") };
  if (error.code !== "validation_failed" || error.details.length === 0) return null;
  const errors: FrameErrors = {};
  for (const detail of error.details) {
    switch (detail.field) {
      case "name":
        errors.name = values.name.trim()
          ? t("frame.error.name.tooLong")
          : t("frame.error.name.required");
        break;
      case "widthMm":
      case "heightMm": {
        const raw = detail.field === "widthMm" ? values.widthMm : values.heightMm;
        const parsed = parseWholeNumber(raw, 1, MAX_MM);
        errors[detail.field] =
          parsed === null
            ? t(
                detail.field === "widthMm"
                  ? "frame.error.width.invalid"
                  : "frame.error.height.invalid",
              )
            : area
              ? tooSmall(area)
              : detail.message;
        break;
      }
      case "priceCents":
        errors.priceCents = t("frame.error.price.invalid");
        break;
      case "stock":
        errors.stock = t("frame.error.stock.invalid");
        break;
      case "photo":
        errors.photo = photo
          ? t("frame.error.photo.unsupportedType")
          : t("frame.error.photo.missing");
        break;
      default:
        break;
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}
