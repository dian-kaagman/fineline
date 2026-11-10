import type { ChangeEvent, Ref } from "react";

export const PHOTO_ACCEPT = "image/jpeg,image/png,image/heic,.jpg,.jpeg,.png,.heic";

interface PhotoChooserProps {
  id: string;
  label: string;
  describedBy?: string;
  variant?: "primary" | "secondary";
  onPhoto: (file: File) => void;
  ref?: Ref<HTMLInputElement>;
}

/**
 * A native file input inside a label styled as a button: the input stays focusable (visually
 * hidden, not display:none) and the label shows the focus ring (UX-028). No drag and drop.
 */
export function PhotoChooser({
  id,
  label,
  describedBy,
  variant = "primary",
  onPhoto,
  ref,
}: PhotoChooserProps) {
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so choosing the same file again still counts as a choice.
    event.target.value = "";
    if (file) onPhoto(file);
  }

  return (
    <label className={`button button--${variant} file-button`} htmlFor={id}>
      <input
        ref={ref}
        id={id}
        type="file"
        className="visually-hidden"
        accept={PHOTO_ACCEPT}
        aria-describedby={describedBy}
        onChange={handleChange}
      />
      {label}
    </label>
  );
}
