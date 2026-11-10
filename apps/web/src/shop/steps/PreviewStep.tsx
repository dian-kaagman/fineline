import type { DrawingPreview } from "../../api/shop";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { t } from "../../i18n/t";
import { formatExpiry } from "../../lib/format";
import { svgDataUrl } from "../../lib/svg";
import { PhotoChooser } from "../PhotoChooser";
import { STEP_NOTICE_ID } from "./PhotoStep";

interface PreviewStepProps {
  /** The preview, or null in the expired state (F7). */
  drawing: DrawingPreview | null;
  onContinue: () => void;
  onTryAnother: () => void;
  onPhoto: (file: File) => void;
}

/** C3 Preview (step 2 of 4): the drawing as a data-URL image, never as markup (SR-007, AC-056). */
export function PreviewStep({ drawing, onContinue, onTryAnother, onPhoto }: PreviewStepProps) {
  if (!drawing) {
    return (
      <div className="step step--preview">
        <h1 id="step-heading" tabIndex={-1}>
          {t("c3.heading")}
        </h1>
        <Notice tone="warning" focusable id={STEP_NOTICE_ID} role="alert">
          <p>{t("c3.expired")}</p>
          <p>{t("c3.expired.detail")}</p>
        </Notice>
        <div className="actions">
          <PhotoChooser
            id="photo-input-again"
            label={t("c3.expired.action")}
            describedBy={STEP_NOTICE_ID}
            onPhoto={onPhoto}
          />
        </div>
      </div>
    );
  }

  const expiry = formatExpiry(drawing.expiresAt);
  return (
    <div className="step step--preview preview">
      <h1 id="step-heading" tabIndex={-1} className="preview__heading">
        {t("c3.heading")}
      </h1>
      <div className="preview__sheet sheet">
        <img
          className="sheet__drawing"
          src={svgDataUrl(drawing.svg)}
          alt={t("c3.preview.alt")}
          width={drawing.widthMm}
          height={drawing.heightMm}
        />
      </div>
      <div className="preview__side stack">
        <p className="hint">{t("c3.size")}</p>
        <Notice tone="info">
          <p>{t("c3.whatYouSee")}</p>
        </Notice>
        <p>{t("c3.notQuiteRight")}</p>
        <div className="actions">
          <Button variant="primary" onClick={onContinue}>
            {t("c3.continue")}
          </Button>
          <Button variant="secondary" onClick={onTryAnother}>
            {t("c3.tryAnother")}
          </Button>
        </div>
        <p className="hint">{t("c3.expiryNote", expiry)}</p>
      </div>
    </div>
  );
}
