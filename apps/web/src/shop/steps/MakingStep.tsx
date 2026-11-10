import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import { t } from "../../i18n/t";

interface MakingStepProps {
  /** Object URL of the chosen photo, when the browser can show it. */
  thumbnailUrl: string | null;
  onCancel: () => void;
}

/** C2 Making your drawing: the loading state of step 1 (AC-007, UX-008, UX-010). */
export function MakingStep({ thumbnailUrl, onCancel }: MakingStepProps) {
  const reducedMotion = useReducedMotion();
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  return (
    <div className="step step--making">
      <h1 id="step-heading" tabIndex={-1}>
        {t("c2.heading")}
      </h1>
      <div className="making">
        {thumbnailUrl && !thumbnailFailed && (
          <img
            className="making__photo"
            src={thumbnailUrl}
            alt={t("c2.photoAlt")}
            onError={() => setThumbnailFailed(true)}
          />
        )}
        <svg className="pen" viewBox="0 0 120 60" aria-hidden="true" focusable="false">
          {reducedMotion ? (
            <path
              className="pen__line pen__line--static"
              data-testid="pen-static"
              d="M6 44c18-30 34-30 48-8s30 22 60-20"
            />
          ) : (
            <path
              className="pen__line pen__line--animated"
              data-testid="pen-animated"
              d="M6 44c18-30 34-30 48-8s30 22 60-20"
            />
          )}
        </svg>
      </div>
      <p>{t("c2.working")}</p>
      <progress className="progress" aria-label={t("c2.progressLabel")} />
      <div className="actions">
        <Button variant="secondary" onClick={onCancel}>
          {t("c2.cancel")}
        </Button>
      </div>
    </div>
  );
}
