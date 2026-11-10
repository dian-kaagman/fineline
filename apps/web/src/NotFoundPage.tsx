import { useRef } from "react";
import { Link } from "react-router";
import { useDocumentTitle } from "./hooks/useDocumentTitle";
import { useFocusHeadingOnNavigation } from "./hooks/useFocusOnMount";
import { t } from "./i18n/t";

/** X3 Page not found, in the shop or the admin layout. */
export function NotFoundPage({ area }: { area: "shop" | "admin" }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useDocumentTitle(area === "shop" ? t("x3.title") : t("admin.title", { page: t("x3.heading") }));
  useFocusHeadingOnNavigation(headingRef);
  return (
    <div className="stack">
      <h1 ref={headingRef} tabIndex={-1}>
        {t("x3.heading")}
      </h1>
      <p>{t("x3.body")}</p>
      <p>
        {area === "shop" ? (
          <Link to="/">{t("x3.toShop")}</Link>
        ) : (
          <Link to="/admin/orders">{t("x3.toOrders")}</Link>
        )}
      </p>
    </div>
  );
}
