import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router";
import { t } from "../i18n/t";
import { tNodes } from "../i18n/tNodes";
import { contactEmail } from "../lib/config";
import { SkipLink } from "../components/ui/SkipLink";

interface ShopLayoutProps {
  children: ReactNode;
  /** The step indicator (C1-C5 only). */
  steps?: ReactNode;
  /** The polite live region text (UX-008); the region is always in the DOM. */
  announcement?: string;
  busy?: boolean;
  onWordmarkClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

/** X1: header with wordmark, step indicator, main and the footer with contact help (UX-016, UX-029). */
export function ShopLayout({
  children,
  steps,
  announcement = "",
  busy,
  onWordmarkClick,
}: ShopLayoutProps) {
  return (
    <div className="shop">
      <SkipLink label={t("shop.skip")} />
      <header className="shop-header">
        <div className="shop-header__inner">
          <Link to="/" className="wordmark" onClick={onWordmarkClick}>
            {t("shop.name")}
          </Link>
          <p className="shop-header__tagline">{t("shop.tagline")}</p>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="shop-main" aria-busy={busy ? true : undefined}>
        {steps}
        {children}
        <div role="status" aria-live="polite" className="visually-hidden">
          {announcement}
        </div>
      </main>
      <footer className="shop-footer">
        <p>
          {tNodes("shop.footer.contact", {
            contactEmail: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>,
          })}
        </p>
        <p>{t("shop.footer.privacy")}</p>
      </footer>
    </div>
  );
}
