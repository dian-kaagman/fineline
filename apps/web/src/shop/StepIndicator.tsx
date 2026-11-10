import { t } from "../i18n/t";
import { Icon } from "../components/ui/Icon";

const STEP_NAMES = ["photo", "preview", "frame", "details"] as const;
export type StepName = (typeof STEP_NAMES)[number];

/** "Step 2 of 4: Preview" plus an ordered list with aria-current="step"; not interactive (UX-017). */
export function StepIndicator({ current }: { current: StepName }) {
  const currentIndex = STEP_NAMES.indexOf(current);
  return (
    <div className="steps">
      <p className="steps__status">
        {t("shop.steps.status", {
          current: currentIndex + 1,
          total: STEP_NAMES.length,
          name: t(`shop.steps.${current}`),
        })}
      </p>
      <ol className="steps__list" aria-label={t("shop.steps.label")}>
        {STEP_NAMES.map((name, index) => (
          <li
            key={name}
            className={`steps__item ${index < currentIndex ? "steps__item--done" : ""} ${index === currentIndex ? "steps__item--current" : ""}`}
            aria-current={index === currentIndex ? "step" : undefined}
          >
            {index < currentIndex && <Icon name="check" />}
            {t(`shop.steps.${name}`)}
            {index < currentIndex && (
              <span className="visually-hidden"> {t("shop.steps.completed")}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
