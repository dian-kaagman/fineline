import { useEffect, useState } from "react";
import { FieldError } from "../components/ui/Field";
import { describedBy, errorId, hintId } from "../components/ui/fieldIds";
import { t } from "../i18n/t";

interface FramePhotoFieldProps {
  id: string;
  label: string;
  hint: string;
  error?: string;
  photo: File | null;
  onChange: (photo: File | null) => void;
}

/** A native, visible file input for frame photos with a local preview (UX-028). */
export function FramePhotoField({ id, label, hint, error, photo, onChange }: FramePhotoFieldProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!photo || typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(photo);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the object URL is an external resource tied to this effect
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
      setPreviewUrl(null);
    };
  }, [photo]);

  return (
    <div className={`field ${error ? "field--invalid" : ""}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <p className="field__hint" id={hintId(id)}>
        {hint}
      </p>
      <FieldError id={errorId(id)} message={error} />
      <input
        id={id}
        type="file"
        className="file-input"
        accept="image/jpeg,image/png,image/webp"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, Boolean(error), true)}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      {previewUrl && (
        <img
          className="thumbnail thumbnail--large"
          src={previewUrl}
          alt={t("a5.photo.previewAlt")}
        />
      )}
    </div>
  );
}
