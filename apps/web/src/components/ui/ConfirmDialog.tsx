import { useEffect, useId, useRef, type KeyboardEvent, type SyntheticEvent } from "react";
import { Button } from "./Button";
import { Notice } from "./Notice";

interface ConfirmDialogProps {
  open: boolean;
  heading: string;
  body: string;
  /** The safe choice: listed first and focused when the dialog opens (UX-024). */
  cancelLabel: string;
  confirmLabel: string;
  confirmVariant?: "primary" | "danger";
  busy?: boolean;
  busyLabel?: string;
  error?: string;
  onConfirm: () => void;
  /** Closing by the safe choice, Escape or the browser's own cancel. */
  onCancel: () => void;
}

/**
 * The X5 confirmation for irreversible actions (UX-024, UX-032): a modal <dialog> labelled by its
 * heading and described by its body. Focus returns to the control that opened it when it closes,
 * unless the caller moved focus elsewhere (after a successful action).
 */
export function ConfirmDialog({
  open,
  heading,
  body,
  cancelLabel,
  confirmLabel,
  confirmVariant = "primary",
  busy = false,
  busyLabel,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const headingId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      openerRef.current = document.activeElement;
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      const opener = openerRef.current;
      // Only give focus back if nothing else claimed it (a successful action moves focus itself).
      if (
        opener instanceof HTMLElement &&
        opener.isConnected &&
        (document.activeElement === document.body || dialog.contains(document.activeElement))
      ) {
        opener.focus();
      }
    }
  }, [open]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  function handleCancelEvent(event: SyntheticEvent) {
    // The browser's own Escape handling: keep React in charge of closing.
    event.preventDefault();
    if (!busy) onCancel();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!busy) onCancel();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby={headingId}
      aria-describedby={bodyId}
      onCancel={handleCancelEvent}
      onKeyDown={handleKeyDown}
    >
      {open && (
        <>
          <h2 id={headingId} className="dialog__heading">
            {heading}
          </h2>
          <p id={bodyId}>{body}</p>
          {error && (
            <Notice tone="danger" role="alert" focusable ref={errorRef}>
              {error}
            </Notice>
          )}
          <div className="dialog__actions">
            <Button
              ref={cancelRef}
              variant="secondary"
              onClick={onCancel}
              aria-disabled={busy || undefined}
            >
              {cancelLabel}
            </Button>
            <Button variant={confirmVariant} busy={busy} busyLabel={busyLabel} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </>
      )}
    </dialog>
  );
}
