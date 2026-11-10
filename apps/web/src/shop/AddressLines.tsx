import type { Address } from "../api/shop";
import { t } from "../i18n/t";

function countryName(code: string): string {
  if (code === "NL") return t("c5.country.NL");
  if (code === "BE") return t("c5.country.BE");
  return code;
}

/** A delivery address in three lines: street and number; postal code and city; country. */
export function AddressLines({ address }: { address: Address }) {
  return (
    <span className="address">
      <span>
        {address.street} {address.houseNumber}
      </span>
      <span>
        {address.postalCode} {address.city}
      </span>
      <span>{countryName(address.country)}</span>
    </span>
  );
}
