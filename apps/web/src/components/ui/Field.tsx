import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { t } from "../../i18n/t";
import { Icon } from "./Icon";
import { describedBy, errorId, hintId } from "./fieldIds";

/** Inline error under a label: icon, hidden "Error:" prefix and the message (UX-006, UX-011). */
export function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p className="field__error" id={id}>
      <Icon name="danger" />
      <span className="visually-hidden">{t("form.errorPrefix")}</span> {message}
    </p>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  /** Another hint shared with other fields (e.g. one size hint for width and height). */
  sharedHintId?: string;
  ref?: Ref<HTMLInputElement>;
  className?: string;
}

/** Label, hint, error and input bound together (UX-005, UX-006). */
export function TextField({
  id,
  label,
  hint,
  error,
  sharedHintId,
  ref,
  className,
  type = "text",
  ...input
}: TextFieldProps) {
  const describedByIds = [describedBy(id, Boolean(error), Boolean(hint)), sharedHintId]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={`field ${error ? "field--invalid" : ""} ${className ?? ""}`.trim()}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <p className="field__hint" id={hintId(id)}>
          {hint}
        </p>
      )}
      <FieldError id={errorId(id)} message={error} />
      <input
        {...input}
        ref={ref}
        id={id}
        type={type}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedByIds || undefined}
      />
    </div>
  );
}
