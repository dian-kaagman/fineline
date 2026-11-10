import type { Ref } from "react";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { t } from "../../i18n/t";
import { PhotoChooser } from "../PhotoChooser";

export type PhotoStatus =
  { kind: "idle" } | { kind: "error"; message: string; retryable: boolean } | { kind: "cancelled" };

interface PhotoStepProps {
  status: PhotoStatus;
  /** After "Try another photo" (F2): the retry heading, tips above the button. */
  retry: boolean;
  onPhoto: (file: File) => void;
  onRetry: () => void;
  chooserRef: Ref<HTMLInputElement>;
}

export const PHOTO_INPUT_ID = "photo-input";
export const STEP_NOTICE_ID = "step-notice";

/** C1 Photo (step 1 of 4). */
export function PhotoStep({ status, retry, onPhoto, onRetry, chooserRef }: PhotoStepProps) {
  const tips = (
    <section className="tips" aria-labelledby="tips-heading">
      <h2 id="tips-heading" className="tips__heading">
        {t("c1.tips.heading")}
      </h2>
      <ul>
        <li>{t("c1.tips.light")}</li>
        <li>{t("c1.tips.face")}</li>
        <li>{t("c1.tips.background")}</li>
      </ul>
    </section>
  );

  return (
    <div className="step step--photo">
      <div className="photo-intro">
        <div className="stack">
          <h1 id="step-heading" tabIndex={-1} className="heading-hero">
            {retry ? t("c1.headingRetry") : t("c1.heading")}
          </h1>
          <p className="lead">{t("c1.lead")}</p>
        </div>
        <img
          className="example-drawing"
          src="/example-drawing.svg"
          alt=""
          width="180"
          height="267"
        />
      </div>

      {retry && tips}

      {status.kind === "error" && (
        <Notice
          tone="danger"
          role="alert"
          focusable
          id={STEP_NOTICE_ID}
          actions={
            status.retryable ? (
              <>
                <Button variant="primary" onClick={onRetry}>
                  {t("c1.tryAgain")}
                </Button>
                <PhotoChooser
                  ref={chooserRef}
                  id={PHOTO_INPUT_ID}
                  label={t("c1.chooseAnother")}
                  variant="secondary"
                  describedBy="photo-requirements"
                  onPhoto={onPhoto}
                />
              </>
            ) : undefined
          }
        >
          <p>{status.message}</p>
        </Notice>
      )}
      {status.kind === "cancelled" && (
        <Notice tone="info" focusable id={STEP_NOTICE_ID}>
          <p>{t("c1.cancelled")}</p>
        </Notice>
      )}

      {!(status.kind === "error" && status.retryable) && (
        <div className="actions">
          <PhotoChooser
            ref={chooserRef}
            id={PHOTO_INPUT_ID}
            label={t("c1.choose")}
            describedBy="photo-requirements"
            onPhoto={onPhoto}
          />
        </div>
      )}
      <p id="photo-requirements" className="hint">
        {t("c1.requirements")}
      </p>

      {!retry && tips}
      <p className="hint">{t("c1.privacy")}</p>
    </div>
  );
}
