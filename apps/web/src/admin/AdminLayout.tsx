import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { createAdminApi, getSession, logout } from "../api/admin";
import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import { SkipLink } from "../components/ui/SkipLink";
import { t } from "../i18n/t";
import { loginPathFor } from "../lib/safeNext";
import { AdminContext, type AdminContextValue } from "./AdminContext";

type SessionState = "checking" | "valid" | "ended";

/**
 * X2 Admin layout and route guard: checks the session before showing any admin data (AC-026),
 * and sends the admin to the login page with `next` whenever a call answers 401 (UX-023).
 */
export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<SessionState>("checking");
  const [announcement, setAnnouncement] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  // Any admin call answering 401 ends the session here; the render below redirects (UX-023).
  const context = useMemo<AdminContextValue>(
    () => ({ api: createAdminApi(() => setSession("ended")), announce: setAnnouncement }),
    [],
  );

  useEffect(() => {
    let active = true;
    getSession()
      .then((current) => {
        if (active) setSession(current ? "valid" : "ended");
      })
      .catch(() => {
        // Without an answer we can't show admin data; the login page explains network problems.
        if (active) setSession("ended");
      });
    return () => {
      active = false;
    };
  }, []);

  // Results belong to the page they happened on (UX-021: they stay until the next navigation).
  const [shownFor, setShownFor] = useState(location.pathname);
  if (shownFor !== location.pathname) {
    setShownFor(location.pathname);
    setAnnouncement("");
    setLogoutError(null);
  }

  if (session === "ended") {
    return <Navigate to={loginPathFor(`${location.pathname}${location.search}`)} replace />;
  }

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await logout();
      navigate("/admin/login", { state: { loggedOut: true } });
    } catch {
      setLogoutError(t("admin.error.network"));
      setLoggingOut(false);
    }
  }

  return (
    <div className="admin">
      <SkipLink label={t("shop.skip")} />
      <header className="admin-header">
        <div className="admin-header__inner">
          <Link to="/admin/orders" className="wordmark wordmark--admin">
            {t("admin.name")}
          </Link>
          <nav aria-label={t("admin.nav.label")} className="admin-nav">
            <ul>
              <li>
                <NavLink to="/admin/orders">{t("admin.nav.orders")}</NavLink>
              </li>
              <li>
                <NavLink to="/admin/frames">{t("admin.nav.frames")}</NavLink>
              </li>
              <li>
                <NavLink to="/admin/settings">{t("admin.nav.settings")}</NavLink>
              </li>
            </ul>
          </nav>
          <Button
            variant="secondary"
            dense
            className="admin-header__logout"
            busy={loggingOut}
            busyLabel={t("admin.loggingOut")}
            onClick={handleLogout}
          >
            {t("admin.logout")}
          </Button>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="admin-main">
        <div
          role="status"
          aria-live="polite"
          className={announcement ? "status-region" : "visually-hidden"}
        >
          {session === "checking" ? (
            <span className="visually-hidden">{t("admin.loading")}</span>
          ) : (
            announcement && (
              <Notice tone="success">
                <p>{announcement}</p>
              </Notice>
            )
          )}
        </div>
        {logoutError && (
          <Notice tone="danger" role="alert">
            <p>{logoutError}</p>
          </Notice>
        )}
        {session === "valid" && (
          <AdminContext.Provider value={context}>
            <Outlet />
          </AdminContext.Provider>
        )}
      </main>
    </div>
  );
}
