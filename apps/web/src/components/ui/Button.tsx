import type { ButtonHTMLAttributes, MouseEvent, Ref } from "react";

export type ButtonVariant = "primary" | "secondary" | "text" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Admin table rows use the dense size (UX-004). */
  dense?: boolean;
  /** While busy the button shows `busyLabel`, keeps its place and ignores presses (UX-022). */
  busy?: boolean;
  busyLabel?: string;
  ref?: Ref<HTMLButtonElement>;
}

/** The base button. Never `disabled` for validation: problems are explained on press (UX-022). */
export function Button({
  variant = "secondary",
  dense = false,
  busy = false,
  busyLabel,
  className,
  children,
  onClick,
  type = "button",
  ref,
  ...rest
}: ButtonProps) {
  const classes = ["button", `button--${variant}`, dense ? "button--dense" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (busy || rest["aria-disabled"] === true) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={classes}
      aria-disabled={busy || rest["aria-disabled"] ? true : undefined}
      onClick={handleClick}
    >
      {busy && <span className="spinner" aria-hidden="true" />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
