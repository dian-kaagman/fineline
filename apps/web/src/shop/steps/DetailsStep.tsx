import { useRef, useState, type FormEvent } from "react";
import type { DrawingPreview, PublicFrame } from "../../api/shop";
import { Button } from "../../components/ui/Button";
import { ErrorSummary, type SummaryError } from "../../components/ui/ErrorSummary";
import { FieldError, TextField } from "../../components/ui/Field";
import { describedBy, errorId } from "../../components/ui/fieldIds";
import { Notice } from "../../components/ui/Notice";
import { t } from "../../i18n/t";
import { formatPrice, formatSize } from "../../lib/format";
import { svgDataUrl } from "../../lib/svg";
import {
  COUNTRIES,
  DETAILS_FIELDS,
  FIELD_IDS,
  validateDetails,
  type CustomerDetails,
  type DetailsErrors,
  type DetailsField,
} from "../details";

/** What happened to a press of Place order that stayed on this step. */
export type PlaceOrderOutcome =
  | { kind: "left" }
  | { kind: "fields"; fields: DetailsErrors; other: string[] }
  | { kind: "notice"; message: string };

interface DetailsStepProps {
  drawing: DrawingPreview;
  frame: PublicFrame;
  details: CustomerDetails;
  onChange: (details: CustomerDetails) => void;
  onBack: () => void;
  onPlaceOrder: () => Promise<PlaceOrderOutcome>;
}

/** C5 Details (step 4 of 4): who and where, photo terms, withdrawal notice, Place order (AC-014..AC-017). */
/**
 * Errors and the summary stay until the next Place order, which checks everything again: nothing
 * moves when a field loses focus, so a tap right after a correction lands (UX-006 (e)).
 */
export function DetailsStep({
  drawing,
  frame,
  details,
  onChange,
  onBack,
  onPlaceOrder,
}: DetailsStepProps) {
  const [errors, setErrors] = useState<DetailsErrors>({});
  const [otherErrors, setOtherErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const price = formatPrice(frame.priceCents);

  function set<K extends DetailsField>(field: K, value: CustomerDetails[K]) {
    onChange({ ...details, [field]: value });
  }

  function showFieldErrors(fields: DetailsErrors, other: string[]) {
    setErrors(fields);
    setOtherErrors(other);
    setNotice(null);
    // Focus after the summary has rendered.
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return; // a second press while placing does nothing (UX-022)

    const keys = validateDetails(details);
    if (Object.keys(keys).length > 0) {
      const fields: DetailsErrors = {};
      for (const [field, key] of Object.entries(keys)) fields[field as DetailsField] = t(key);
      showFieldErrors(fields, []);
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setNotice(null);
    let outcome: PlaceOrderOutcome;
    try {
      outcome = await onPlaceOrder();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    if (outcome.kind === "fields") {
      showFieldErrors(outcome.fields, outcome.other);
    } else if (outcome.kind === "notice") {
      setErrors({});
      setOtherErrors([]);
      setNotice(outcome.message);
      requestAnimationFrame(() => noticeRef.current?.focus());
    }
  }

  const summaryErrors: SummaryError[] = [
    ...DETAILS_FIELDS.flatMap((field) => {
      const message = errors[field];
      return message ? [{ fieldId: FIELD_IDS[field], message }] : [];
    }),
    ...otherErrors.map((message) => ({ message })),
  ];

  const postalHint =
    details.country === "NL"
      ? t("c5.postalCode.hint.NL")
      : details.country === "BE"
        ? t("c5.postalCode.hint.BE")
        : t("c5.postalCode.hint.none");

  return (
    <div className="step step--details">
      <h1 id="step-heading" tabIndex={-1}>
        {t("c5.heading")}
      </h1>

      <section className="summary-card" aria-labelledby="summary-heading">
        <img
          className="summary-card__drawing"
          src={svgDataUrl(drawing.svg)}
          alt={t("c5.summary.drawingAlt")}
          width={drawing.widthMm}
          height={drawing.heightMm}
        />
        <div className="summary-card__text">
          <h2 id="summary-heading" className="summary-card__heading">
            {t("c5.summary.heading")}
          </h2>
          <p>
            {frame.name}, {formatSize(frame.widthMm, frame.heightMm)}
          </p>
          <p className="summary-card__price">{price}</p>
          <Button variant="text" onClick={onBack}>
            {t("c5.summary.changeFrame")}
          </Button>
        </div>
      </section>

      <form className="form" noValidate onSubmit={handleSubmit}>
        <ErrorSummary ref={summaryRef} errors={summaryErrors} />
        <p>{t("c5.allRequired")}</p>

        <TextField
          id={FIELD_IDS.name}
          label={t("c5.name.label")}
          autoComplete="name"
          value={details.name}
          error={errors.name}
          onChange={(event) => set("name", event.target.value)}
        />
        <TextField
          id={FIELD_IDS.email}
          type="email"
          label={t("c5.email.label")}
          hint={t("c5.email.hint")}
          autoComplete="email"
          inputMode="email"
          spellCheck={false}
          value={details.email}
          error={errors.email}
          onChange={(event) => set("email", event.target.value)}
        />

        <fieldset className="fieldset" aria-describedby="address-hint">
          <legend className="fieldset__legend">{t("c5.address.legend")}</legend>
          <p className="field__hint" id="address-hint">
            {t("c5.address.hint")}
          </p>

          <fieldset
            className={`fieldset fieldset--inner ${errors.country ? "field--invalid" : ""}`}
            aria-describedby={errors.country ? errorId("details-country") : undefined}
          >
            <legend className="field__label">{t("c5.country.label")}</legend>
            <FieldError id={errorId("details-country")} message={errors.country} />
            <div className="choice-list">
              {COUNTRIES.map((country) => (
                <div className="choice" key={country}>
                  <input
                    type="radio"
                    id={`details-country-${country}`}
                    name="country"
                    value={country}
                    autoComplete="country"
                    checked={details.country === country}
                    onChange={() => onChange({ ...details, country })}
                  />
                  <label htmlFor={`details-country-${country}`}>{t(`c5.country.${country}`)}</label>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="field-row field-row--street">
            <TextField
              id={FIELD_IDS.street}
              label={t("c5.street.label")}
              autoComplete="address-line1"
              value={details.street}
              error={errors.street}
              onChange={(event) => set("street", event.target.value)}
            />
            <TextField
              id={FIELD_IDS.houseNumber}
              label={t("c5.houseNumber.label")}
              hint={t("c5.houseNumber.hint")}
              inputMode="text"
              value={details.houseNumber}
              error={errors.houseNumber}
              onChange={(event) => set("houseNumber", event.target.value)}
            />
          </div>
          <div className="field-row field-row--city">
            <TextField
              id={FIELD_IDS.postalCode}
              label={t("c5.postalCode.label")}
              hint={postalHint}
              autoComplete="postal-code"
              value={details.postalCode}
              error={errors.postalCode}
              onChange={(event) => set("postalCode", event.target.value)}
            />
            <TextField
              id={FIELD_IDS.city}
              label={t("c5.city.label")}
              autoComplete="address-level2"
              value={details.city}
              error={errors.city}
              onChange={(event) => set("city", event.target.value)}
            />
          </div>
        </fieldset>

        <div className={`field ${errors.acceptedPhotoTerms ? "field--invalid" : ""}`}>
          <FieldError
            id={errorId(FIELD_IDS.acceptedPhotoTerms)}
            message={errors.acceptedPhotoTerms}
          />
          <div className="choice">
            <input
              type="checkbox"
              id={FIELD_IDS.acceptedPhotoTerms}
              checked={details.acceptedPhotoTerms}
              aria-invalid={errors.acceptedPhotoTerms ? true : undefined}
              aria-describedby={describedBy(
                FIELD_IDS.acceptedPhotoTerms,
                Boolean(errors.acceptedPhotoTerms),
                false,
              )}
              onChange={(event) =>
                onChange({ ...details, acceptedPhotoTerms: event.target.checked })
              }
            />
            <label htmlFor={FIELD_IDS.acceptedPhotoTerms}>{t("c5.terms.label")}</label>
          </div>
          <details className="disclosure">
            <summary>{t("c5.terms.more")}</summary>
            <p>{t("c5.terms.body")}</p>
          </details>
        </div>

        <p className="total">{t("c5.total", { price })}</p>
        <Notice tone="info">
          <p>{t("c5.withdrawal")}</p>
        </Notice>
        <p>{t("c5.payment")}</p>

        {notice && (
          <Notice tone="danger" role="alert" focusable ref={noticeRef}>
            <p>{notice}</p>
          </Notice>
        )}

        <div className="actions">
          <Button type="submit" variant="primary" busy={busy} busyLabel={t("c5.submitting")}>
            {t("c5.submit")}
          </Button>
          <Button variant="secondary" onClick={onBack}>
            {t("c5.back")}
          </Button>
        </div>
      </form>
    </div>
  );
}
