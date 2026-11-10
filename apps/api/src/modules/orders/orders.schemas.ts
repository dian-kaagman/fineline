import { z } from "zod";
import {
  isDeliveryCountry,
  isValidPostalCode,
  normalizePostalCode,
  POSTAL_CODE_MESSAGES,
  type DeliveryCountry,
} from "../../domain/address.js";
import { AppError, validationFailed, type ErrorDetail } from "../../lib/errors.js";
import { issuesToDetails, text } from "../../lib/validation.js";

const addressSchema = z.strictObject(
  {
    street: text(200, "Enter your street", "The street must be 200 characters or fewer"),
    houseNumber: text(
      20,
      "Enter your house number",
      "The house number must be 20 characters or fewer",
    ),
    postalCode: text(20, "Enter your postal code", "Enter a valid postal code"),
    city: text(100, "Enter your city", "The city must be 100 characters or fewer"),
    country: z
      .string({ error: "Choose the Netherlands or Belgium" })
      .regex(/^[A-Z]{2}$/, "Choose the Netherlands or Belgium"),
  },
  { error: "Enter your delivery address" },
);

/** PlaceOrderRequest (contract); unknown fields such as `priceCents` or `status` are refused (SR-016). */
const placeOrderSchema = z.strictObject(
  {
    drawingId: z.uuid({ error: "Must be a drawing ID" }),
    previewToken: z.string({ error: "Must be the preview token" }).min(1).max(200),
    frameId: z.uuid({ error: "Choose a frame" }),
    customer: z.strictObject(
      {
        name: text(200, "Enter your name", "Your name must be 200 characters or fewer"),
        email: z
          .string({ error: "Enter your email address" })
          .trim()
          .min(1, "Enter your email address")
          .max(254, "Enter a valid email address, like name@example.com")
          .pipe(z.email("Enter a valid email address, like name@example.com")),
      },
      { error: "Enter your name and email address" },
    ),
    address: addressSchema,
    acceptedPhotoTerms: z.boolean({ error: "Tick the box to agree to the photo terms" }),
  },
  { error: "The request body must be an object" },
);

export interface PlaceOrderInput {
  drawingId: string;
  previewToken: string;
  frameId: string;
  customer: { name: string; email: string };
  address: {
    street: string;
    houseNumber: string;
    postalCode: string;
    city: string;
    country: DeliveryCountry;
  };
}

const COUNTRY_MESSAGE = "We deliver to the Netherlands and Belgium only";
const TERMS_MESSAGE =
  "Tick the box to agree to the photo terms. We can only make your drawing with your agreement";

/**
 * Body checks, the first step of the check order (SR-009). All field problems are reported together
 * as `validation_failed`; when the body is otherwise valid, an unsupported country answers
 * `country_not_supported` and unticked photo terms `photo_terms_not_accepted`.
 */
export function parsePlaceOrder(body: unknown): PlaceOrderInput {
  const result = placeOrderSchema.safeParse(body);
  const raw = (typeof body === "object" && body !== null ? body : {}) as {
    address?: { country?: unknown; postalCode?: unknown };
    acceptedPhotoTerms?: unknown;
  };
  const details: ErrorDetail[] = result.success ? [] : issuesToDetails(result.error.issues);

  const country = raw.address?.country;
  const postalCode =
    typeof raw.address?.postalCode === "string" ? raw.address.postalCode.trim() : undefined;
  const countryWellFormed = typeof country === "string" && /^[A-Z]{2}$/.test(country);
  const countryUnsupported = countryWellFormed && !isDeliveryCountry(country);
  if (
    countryWellFormed &&
    isDeliveryCountry(country) &&
    postalCode !== undefined &&
    postalCode !== "" &&
    !details.some((d) => d.field === "address.postalCode") &&
    !isValidPostalCode(country, postalCode)
  ) {
    details.push({ field: "address.postalCode", message: POSTAL_CODE_MESSAGES[country] });
  }
  const termsRefused = raw.acceptedPhotoTerms === false;

  if (details.length > 0) {
    if (countryUnsupported) details.push({ field: "address.country", message: COUNTRY_MESSAGE });
    if (termsRefused) details.push({ field: "acceptedPhotoTerms", message: TERMS_MESSAGE });
    throw validationFailed(details);
  }
  if (countryUnsupported) {
    throw new AppError(400, "country_not_supported", `${COUNTRY_MESSAGE}.`, [
      { field: "address.country", message: COUNTRY_MESSAGE },
    ]);
  }
  if (termsRefused || !result.success) {
    throw new AppError(
      400,
      "photo_terms_not_accepted",
      "Please agree to the photo terms to place your order.",
      [{ field: "acceptedPhotoTerms", message: TERMS_MESSAGE }],
    );
  }

  const { data } = result;
  const deliveryCountry = data.address.country as DeliveryCountry;
  return {
    drawingId: data.drawingId.toLowerCase(),
    previewToken: data.previewToken,
    frameId: data.frameId.toLowerCase(),
    customer: data.customer,
    address: {
      ...data.address,
      country: deliveryCountry,
      postalCode: normalizePostalCode(deliveryCountry, data.address.postalCode),
    },
  };
}
