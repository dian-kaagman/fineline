import type { MouseEvent, Ref } from "react";
import { t } from "../../i18n/t";

export interface SummaryError {
  /** The id of the field to focus; omitted for problems without a field. */
  fieldId?: string;
  message: string;
}

interface ErrorSummaryProps {
  errors: SummaryError[];
  ref?: Ref<HTMLDivElement>;
}

/** "There is a problem" with a link to each field; it receives focus after a failed submit (UX-006). */
export function ErrorSummary({ errors, ref }: ErrorSummaryProps) {
  if (errors.length === 0) return null;

  function focusField(event: MouseEvent<HTMLAnchorElement>, fieldId: string) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    event.preventDefault();
    field.focus();
    field.scrollIntoView?.({ block: "center" });
  }

  return (
    <div ref={ref} className="error-summary" tabIndex={-1} aria-labelledby="error-summary-heading">
      <h2 id="error-summary-heading" className="error-summary__heading">
        {t("form.errorSummary.heading")}
      </h2>
      <ul className="error-summary__list">
        {errors.map((error) => (
          <li key={`${error.fieldId ?? "form"}-${error.message}`}>
            {error.fieldId ? (
              <a href={`#${error.fieldId}`} onClick={(event) => focusField(event, error.fieldId!)}>
                {error.message}
              </a>
            ) : (
              error.message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
