import { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import { Skeleton } from "../components/ui/Skeleton";
import { useAsyncData } from "../hooks/useAsyncData";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useFocusHeadingOnNavigation } from "../hooks/useFocusOnMount";
import { t } from "../i18n/t";
import { formatPrice, formatSize } from "../lib/format";
import { useAdmin } from "./AdminContext";
import { isSessionEnd } from "./adminErrors";

/** A4 Frames: every frame with its stock, including sold-out ones (AC-039, AC-043). */
export function FramesPage() {
  const { api } = useAdmin();
  const location = useLocation();
  const frames = useAsyncData("frames", () => api.listFrames());
  const headingRef = useRef<HTMLHeadingElement>(null);
  const addedRef = useRef<HTMLDivElement>(null);
  const added = (location.state as { added?: string } | null)?.added;

  useDocumentTitle(t("a4.title"));
  useFocusHeadingOnNavigation(headingRef);

  // After adding a frame the success notice takes focus instead of the heading (A4 states).
  useEffect(() => {
    if (added) addedRef.current?.focus();
  }, [added]);

  const state = frames.state;
  return (
    <div className="stack">
      <div className="title-row">
        <h1 ref={headingRef} tabIndex={-1}>
          {t("a4.heading")}
        </h1>
        <Link className="button button--primary" to="/admin/frames/new">
          {t("a4.add")}
        </Link>
      </div>

      {added && (
        <Notice tone="success" focusable ref={addedRef}>
          <p>{added}</p>
        </Notice>
      )}

      {state.status === "error" && !isSessionEnd(state.error) && (
        <Notice
          tone="danger"
          role="alert"
          actions={
            <Button variant="secondary" onClick={frames.reload}>
              {t("admin.retry")}
            </Button>
          }
        >
          <p>{t("a4.error.load")}</p>
        </Notice>
      )}

      {state.status === "loaded" && state.data.length === 0 && (
        <Notice
          tone="info"
          actions={
            <Link className="button button--secondary" to="/admin/frames/new">
              {t("a4.add")}
            </Link>
          }
        >
          <p>{t("a4.empty")}</p>
        </Notice>
      )}

      {(state.status === "loading" || (state.status === "loaded" && state.data.length > 0)) && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focusable scroll region (UX-013)
        <div className="table-region" role="region" tabIndex={0} aria-labelledby="frames-caption">
          <table className="table">
            <caption id="frames-caption">{t("a4.caption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("a4.col.photo")}</th>
                <th scope="col">{t("a4.col.name")}</th>
                <th scope="col">{t("a4.col.size")}</th>
                <th scope="col">{t("a4.col.price")}</th>
                <th scope="col">{t("a4.col.stock")}</th>
              </tr>
            </thead>
            <tbody>
              {state.status === "loading"
                ? [0, 1, 2].map((row) => (
                    <tr key={row}>
                      <td colSpan={5}>
                        <Skeleton className="skeleton--row" />
                      </td>
                    </tr>
                  ))
                : state.data.map((frame) => (
                    <tr key={frame.id}>
                      <td>
                        <img
                          className="thumbnail"
                          src={frame.photoUrl}
                          alt=""
                          width="48"
                          height="48"
                          loading="lazy"
                        />
                      </td>
                      <td>
                        <Link to={`/admin/frames/${encodeURIComponent(frame.id)}`}>
                          {frame.name}
                        </Link>
                      </td>
                      <td>{formatSize(frame.widthMm, frame.heightMm)}</td>
                      <td>{formatPrice(frame.priceCents)}</td>
                      <td>
                        {frame.stock}
                        {frame.stock === 0 && <span className="tag">{t("a4.soldOutTag")}</span>}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
