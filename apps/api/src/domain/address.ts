/** Delivery address rules (BR-007, Q-21). */

export const DELIVERY_COUNTRIES = ["NL", "BE"] as const;
export type DeliveryCountry = (typeof DELIVERY_COUNTRIES)[number];

export function isDeliveryCountry(country: string): country is DeliveryCountry {
  return (DELIVERY_COUNTRIES as readonly string[]).includes(country);
}

const POSTAL_CODE: Record<DeliveryCountry, RegExp> = {
  NL: /^[1-9]\d{3} ?[A-Za-z]{2}$/,
  BE: /^[1-9]\d{3}$/,
};

export function isValidPostalCode(country: DeliveryCountry, postalCode: string): boolean {
  return POSTAL_CODE[country].test(postalCode);
}

/** Stored form: NL `1234 AB` (upper case, one space), BE as entered. */
export function normalizePostalCode(country: DeliveryCountry, postalCode: string): string {
  if (country === "NL") {
    const compact = postalCode.replace(" ", "").toUpperCase();
    return `${compact.slice(0, 4)} ${compact.slice(4)}`;
  }
  return postalCode;
}

export const POSTAL_CODE_MESSAGES: Record<DeliveryCountry, string> = {
  NL: "Enter a Dutch postal code, like 1234 AB",
  BE: "Enter a Belgian postal code of 4 digits, like 1000",
};
