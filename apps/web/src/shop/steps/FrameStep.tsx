import { useRef, useState } from "react";
import type { PublicFrame } from "../../api/shop";
import { Button } from "../../components/ui/Button";
import { FieldError } from "../../components/ui/Field";
import { Icon } from "../../components/ui/Icon";
import { Notice } from "../../components/ui/Notice";
import { Skeleton } from "../../components/ui/Skeleton";
import { t } from "../../i18n/t";
import { formatPrice, formatSize } from "../../lib/format";
import { STEP_NOTICE_ID } from "./PhotoStep";

export type FramesState =
  { status: "loading" } | { status: "error" } | { status: "loaded"; frames: PublicFrame[] };

interface FrameStepProps {
  frames: FramesState;
  selectedFrameId: string | null;
  /** F6: the frame that just sold out, shown in the warning notice. */
  soldOutFrameName: string | null;
  onSelect: (frameId: string) => void;
  onContinue: () => void;
  onBack: () => void;
  onRetryLoad: () => void;
}

/** C4 Frame (step 3 of 4): in-stock frames as a native radio group (AC-013, UX-018). */
export function FrameStep({
  frames,
  selectedFrameId,
  soldOutFrameName,
  onSelect,
  onContinue,
  onBack,
  onRetryLoad,
}: FrameStepProps) {
  const [showRequired, setShowRequired] = useState(false);
  const firstRadioRef = useRef<HTMLInputElement>(null);

  function handleContinue() {
    if (frames.status !== "loaded") return;
    if (!selectedFrameId) {
      setShowRequired(true);
      firstRadioRef.current?.focus();
      return;
    }
    onContinue();
  }

  const empty = frames.status === "loaded" && frames.frames.length === 0;

  return (
    <div className="step step--frame">
      <h1 id="step-heading" tabIndex={-1}>
        {t("c4.heading")}
      </h1>
      {soldOutFrameName && (
        <Notice tone="warning" role="alert" focusable id={STEP_NOTICE_ID}>
          <p>{t("c4.soldOut", { frameName: soldOutFrameName })}</p>
        </Notice>
      )}
      <p className="hint">{t("c4.vatNote")}</p>

      {frames.status === "loading" && (
        <div className="frame-grid">
          <Skeleton className="skeleton--card" />
          <Skeleton className="skeleton--card" />
          <Skeleton className="skeleton--card" />
        </div>
      )}

      {frames.status === "error" && (
        <Notice
          tone="danger"
          role="alert"
          actions={
            <Button variant="secondary" onClick={onRetryLoad}>
              {t("c4.error.retry")}
            </Button>
          }
        >
          <p>{t("c4.error.load")}</p>
        </Notice>
      )}

      {empty && (
        <Notice tone="info">
          <p>{t("c4.empty")}</p>
        </Notice>
      )}

      {frames.status === "loaded" && frames.frames.length > 0 && (
        <fieldset
          className={`frame-choice ${showRequired && !selectedFrameId ? "frame-choice--invalid" : ""}`}
          aria-describedby={showRequired && !selectedFrameId ? "frame-error" : undefined}
        >
          <legend className="visually-hidden">{t("c4.legend")}</legend>
          <FieldError
            id="frame-error"
            message={showRequired && !selectedFrameId ? t("c4.error.required") : undefined}
          />
          <div className="frame-grid">
            {frames.frames.map((frame, index) => {
              const size = formatSize(frame.widthMm, frame.heightMm);
              const price = formatPrice(frame.priceCents);
              const selected = frame.id === selectedFrameId;
              return (
                <label
                  key={frame.id}
                  className={`frame-card ${selected ? "frame-card--selected" : ""}`}
                >
                  <input
                    ref={index === 0 ? firstRadioRef : undefined}
                    type="radio"
                    name="frame"
                    value={frame.id}
                    className="frame-card__radio"
                    checked={selected}
                    onChange={() => onSelect(frame.id)}
                    aria-label={t("c4.option.name", { frameName: frame.name, size, price })}
                  />
                  <img className="frame-card__photo" src={frame.photoUrl} alt="" loading="lazy" />
                  <span className="frame-card__text">
                    <span className="frame-card__name">{frame.name}</span>
                    <span className="frame-card__meta">{size}</span>
                    <span className="frame-card__price">{price}</span>
                  </span>
                  {selected && (
                    <span className="frame-card__check">
                      <Icon name="check" />
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="actions">
        {!empty && (
          <Button variant="primary" onClick={handleContinue}>
            {t("c4.continue")}
          </Button>
        )}
        <Button variant="secondary" onClick={onBack}>
          {t("c4.back")}
        </Button>
      </div>
    </div>
  );
}
