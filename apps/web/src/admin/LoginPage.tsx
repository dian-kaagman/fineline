import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { getSession, login } from "../api/admin";
import { ApiError } from "../api/client";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/Field";
import { Notice } from "../components/ui/Notice";
import { SkipLink } from "../components/ui/SkipLink";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useFocusHeadingOnNavigation } from "../hooks/useFocusOnMount";
import { t } from "../i18n/t";
import { formatWait } from "../lib/format";
import { safeAdminNext } from "../lib/safeNext";

const DEFAULT_TARGET = "/admin/orders";

/** A1 Log in (AC-024, AC-025, AC-061): the only way into the admin tool. */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get("next");
  const target = safeAdminNext(rawNext) ?? DEFAULT_TARGET;
  const loggedOut = (location.state as { loggedOut?: boolean } | null)?.loggedOut === true;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useDocumentTitle(t("a1.title"));
  useFocusHeadingOnNavigation(headingRef);

  // With a valid session the login page is skipped. Not when the admin was sent here because a
  // call answered 401: then the session check could disagree and the two pages would bounce.
  useEffect(() => {
    if (rawNext) return;
    let active = true;
    getSession()
      .then((session) => {
        if (active && session) navigate(target, { replace: true });
      })
      .catch(() => {
        // No answer: stay on the login form, which reports network problems on submit.
      });
    return () => {
      active = false;
    };
  }, [navigate, target, rawNext]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    const errors = {
      username: username.trim() ? undefined : t("a1.error.username.required"),
      password: password ? undefined : t("a1.error.password.required"),
    };
    setFieldErrors(errors);
    if (errors.username || errors.password) {
      (errors.username ? usernameRef : passwordRef).current?.focus();
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      navigate(target, { replace: true });
    } catch (caught) {
      setPassword("");
      if (caught instanceof ApiError && caught.status === 401) {
        setError(t("a1.error.invalidCredentials"));
      } else if (caught instanceof ApiError && caught.status === 429) {
        setError(t("a1.error.rateLimited", { wait: formatWait(caught.retryAfterSeconds) }));
      } else if (caught instanceof ApiError && caught.code === "csrf_failed") {
        setError(t("admin.error.csrf"));
      } else if (caught instanceof ApiError && caught.status < 500 && caught.apiMessage) {
        setError(caught.apiMessage); // e.g. 400 validation_failed for an over-long field
      } else if (caught instanceof ApiError) {
        setError(t("admin.error.server"));
      } else {
        setError(t("admin.error.network"));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <SkipLink label={t("shop.skip")} />
      <header className="admin-header">
        <div className="admin-header__inner">
          <span className="wordmark wordmark--admin">{t("admin.name")}</span>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="login__main">
        <div className="card login__card stack">
          <h1 ref={headingRef} tabIndex={-1}>
            {t("a1.heading")}
          </h1>
          {loggedOut && !error && (
            <Notice tone="success" role="status">
              <p>{t("a1.loggedOut")}</p>
            </Notice>
          )}
          {!loggedOut && rawNext && !error && (
            <Notice tone="info">
              <p>{t("a1.sessionEnded")}</p>
            </Notice>
          )}
          {error && (
            <Notice tone="danger" role="alert" focusable ref={errorRef}>
              <p>{error}</p>
            </Notice>
          )}
          <form className="form" noValidate onSubmit={handleSubmit}>
            <TextField
              ref={usernameRef}
              id="login-username"
              label={t("a1.username.label")}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              error={fieldErrors.username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <TextField
              ref={passwordRef}
              id="login-password"
              type={showPassword ? "text" : "password"}
              label={t("a1.password.label")}
              autoComplete="current-password"
              value={password}
              error={fieldErrors.password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button
              variant="text"
              aria-pressed={showPassword}
              aria-controls="login-password"
              onClick={() => setShowPassword((shown) => !shown)}
            >
              {t("a1.showPassword")}
            </Button>
            <div className="actions">
              <Button type="submit" variant="primary" busy={busy} busyLabel={t("a1.submitting")}>
                {t("a1.submit")}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
