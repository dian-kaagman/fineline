// Customer details (C5): the browser runs the same checks as the API first (BR-007, AC-014), and
// API `validation_failed` details are mapped back onto the same fields.
import { ApiError } from "../api/client";
import type { PlaceOrderRequest } from "../api/shop";
import { t, type MessageKey } from "../i18n/t";

export type Country = "NL" | "BE";
export const COUNTRIES: readonly Country[] = ["NL", "BE"];

export interface CustomerDetails {
  name: string;
  email: string;
  country: Country | "";
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  acceptedPhotoTerms: boolean;
}

export const EMPTY_DETAILS: CustomerDetails = {
  name: "",
  email: "",
  country: "",
  street: "",
  houseNumber: "",
  postalCode: "",
  city: "",
  acceptedPhotoTerms: false,
};

export type DetailsField = keyof CustomerDetails;

/** Field order on the page, which is also the order of the error summary. */
export const DETAILS_FIELDS: readonly DetailsField[] = [
  "name",
  "email",
  "country",
  "street",
  "houseNumber",
  "postalCode",
  "city",
  "acceptedPhotoTerms",
];

/** DOM id of each field's control (the first radio for the country). */
export const FIELD_IDS: Record<DetailsField, string> = {
  name: "details-name",
  email: "details-email",
  country: "details-country-NL",
  street: "details-street",
  houseNumber: "details-house-number",
  postalCode: "details-postal-code",
  city: "details-city",
  acceptedPhotoTerms: "details-terms",
};

export type DetailsErrors = Partial<Record<DetailsField, string>>;

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const POSTAL_NL = /^\d{4}\s?[A-Za-z]{2}$/;
const POSTAL_BE = /^\d{4}$/;

/** The message key for one field, or null when it is fine. */
export function checkField(field: DetailsField, details: CustomerDetails): MessageKey | null {
  switch (field) {
    case "name": {
      const value = details.name.trim();
      if (!value) return "c5.error.name.required";
      return value.length > 200 ? "c5.error.name.tooLong" : null;
    }
    case "email": {
      const value = details.email.trim();
      if (!value) return "c5.error.email.required";
      return value.length > 254 || !EMAIL.test(value) ? "c5.error.email.invalid" : null;
    }
    case "country":
      return details.country ? null : "c5.error.country.required";
    case "street":
      return details.street.trim() ? null : "c5.error.street.required";
    case "houseNumber": {
      const value = details.houseNumber.trim();
      if (!value) return "c5.error.houseNumber.required";
      return value.length > 20 ? "c5.error.houseNumber.tooLong" : null;
    }
    case "postalCode": {
      const value = details.postalCode.trim();
      if (!value) return "c5.error.postalCode.required";
      if (details.country === "NL" && !POSTAL_NL.test(value))
        return "c5.error.postalCode.invalidNL";
      if (details.country === "BE" && !POSTAL_BE.test(value))
        return "c5.error.postalCode.invalidBE";
      return null;
    }
    case "city":
      return details.city.trim() ? null : "c5.error.city.required";
    case "acceptedPhotoTerms":
      return details.acceptedPhotoTerms ? null : "c5.error.terms.required";
  }
}

export function validateDetails(
  details: CustomerDetails,
): Partial<Record<DetailsField, MessageKey>> {
  const errors: Partial<Record<DetailsField, MessageKey>> = {};
  for (const field of DETAILS_FIELDS) {
    const key = checkField(field, details);
    if (key) errors[field] = key;
  }
  return errors;
}

/** "1234ab" -> "1234 AB": the format the contract shows; BE codes are sent as typed. */
export function normalisePostalCode(postalCode: string, country: Country): string {
  const value = postalCode.trim();
  if (country !== "NL") return value;
  return `${value.slice(0, 4)} ${value.slice(-2).toUpperCase()}`;
}

export function toOrderRequest(
  details: CustomerDetails,
  drawing: { drawingId: string; previewToken: string },
  frameId: string,
): PlaceOrderRequest {
  const country = details.country as Country;
  return {
    drawingId: drawing.drawingId,
    previewToken: drawing.previewToken,
    frameId,
    customer: { name: details.name.trim(), email: details.email.trim() },
    address: {
      street: details.street.trim(),
      houseNumber: details.houseNumber.trim(),
      postalCode: normalisePostalCode(details.postalCode, country),
      city: details.city.trim(),
      country,
    },
    acceptedPhotoTerms: details.acceptedPhotoTerms,
  };
}

const API_FIELDS: Record<string, DetailsField> = {
  "customer.name": "name",
  "customer.email": "email",
  "address.country": "country",
  "address.street": "street",
  "address.houseNumber": "houseNumber",
  "address.postalCode": "postalCode",
  "address.city": "city",
  acceptedPhotoTerms: "acceptedPhotoTerms",
};

const INVALID_TEXT: Partial<Record<DetailsField, MessageKey>> = {
  name: "c5.error.name.tooLong",
  email: "c5.error.email.invalid",
  houseNumber: "c5.error.houseNumber.tooLong",
};

export interface ApiFieldProblems {
  fields: DetailsErrors;
  /** API messages for fields the form doesn't have (AC-059: the web app never sends them). */
  other: string[];
}

/**
 * Maps a 400 from POST /orders to field messages: the field's "required" text when it is empty,
 * otherwise its "invalid" text (content.md); `country_not_supported` and `photo_terms_not_accepted`
 * have their own texts.
 */
export function problemsFromApi(error: ApiError, details: CustomerDetails): ApiFieldProblems {
  const problems: ApiFieldProblems = { fields: {}, other: [] };
  if (error.code === "country_not_supported") {
    problems.fields.country = t("c5.error.country.notSupported");
  }
  if (error.code === "photo_terms_not_accepted") {
    problems.fields.acceptedPhotoTerms = t("c5.error.terms.required");
  }

  for (const detail of error.details) {
    const field = API_FIELDS[detail.field];
    if (!field) {
      problems.other.push(`${t("c5.error.field.generic")} ${detail.message}`);
      continue;
    }
    if (problems.fields[field]) continue;
    const ownCheck = checkField(field, details);
    if (field === "country" && details.country) {
      problems.fields.country = t("c5.error.country.notSupported");
    } else if (field === "postalCode" && details.postalCode.trim()) {
      problems.fields.postalCode = t(
        details.country === "BE"
          ? "c5.error.postalCode.invalidBE"
          : "c5.error.postalCode.invalidNL",
      );
    } else {
      const key = ownCheck ?? INVALID_TEXT[field];
      problems.fields[field] = key ? t(key) : `${t("c5.error.field.generic")} ${detail.message}`;
    }
  }
  return problems;
}
