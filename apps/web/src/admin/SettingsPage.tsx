import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SettingsView } from "../api/admin";
import { ApiError } from "../api/client";
import { Button } from "../components/ui/Button";
import { TextField } from "../components/ui/Field";
import { Notice } from "../components/ui/Notice";
import { Skeleton } from "../components/ui/Skeleton";
import { useAsyncData } from "../hooks/useAsyncData";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useFocusHeadingOnNavigation } from "../hooks/useFocusOnMount";
import { t, tPlural } from "../i18n/t";
import { formatNumber } from "../lib/format";
import { parseWholeNumber } from "../lib/parse";
import { useAdmin } from "./AdminContext";
import { adminErrorMessage, isSessionEnd } from "./adminErrors";

/** A7 Settings: the standard lead time (AC-045, AC-046) and the read-only drawing area. */
export function SettingsPage() {
  const { api } = useAdmin();
  const settings = useAsyncData("settings", () => api.getSettings());
  const headingRef = useRef<HTMLHeadingElement>(null);

  useDocumentTitle(t("a7.title"));
  useFocusHeadingOnNavigation(headingRef);

  const state = settings.state;
  return (
    <div className="stack">
      <h1 ref={headingRef} tabIndex={-1}>
        {t("a7.heading")}
      </h1>
      <section className="card stack" aria-labelledby="delivery-settings-heading">
        <h2 id="delivery-settings-heading">{t("a7.delivery.heading")}</h2>
        {state.status === "loading" && <Skeleton className="skeleton--field" />}
        {state.status === "error" && !isSessionEnd(state.error) && (
          <Notice
            tone="danger"
            role="alert"
            actions={
              <Button variant="secondary" onClick={settings.reload}>
                {t("admin.retry")}
              </Button>
            }
          >
            <p>{t("a7.error.load")}</p>
          </Notice>
        )}
        {state.status === "loaded" && (
          <LeadTimeForm settings={state.data} onSaved={(saved) => settings.update(() => saved)} />
        )}
      </section>
    </div>
  );
}

function LeadTimeForm({
  settings,
  onSaved,
}: {
  settings: SettingsView;
  onSaved: (settings: SettingsView) => void;
}) {
  const { api, announce } = useAdmin();
  const [value, setValue] = useState(String(settings.leadTimeWorkingDays));
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusField, setFocusField] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusField > 0) inputRef.current?.focus();
  }, [focusField]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const days = parseWholeNumber(value, 1, 60);
    if (days === null) {
      setError(t("a7.error.leadTime"));
      setFocusField((count) => count + 1);
      return;
    }
    setBusy(true);
    setError(undefined);
    setNotice(null);
    try {
      const saved = await api.updateSettings(days);
      onSaved(saved);
      setValue(String(saved.leadTimeWorkingDays));
      announce(tPlural("a7.done", saved.leadTimeWorkingDays, { days: saved.leadTimeWorkingDays }));
    } catch (caught) {
      if (isSessionEnd(caught)) return;
      if (caught instanceof ApiError && caught.code === "validation_failed") {
        setError(t("a7.error.leadTime"));
        setFocusField((count) => count + 1);
      } else {
        setNotice(adminErrorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="form form--admin" noValidate onSubmit={handleSubmit}>
        <TextField
          ref={inputRef}
          id="lead-time"
          className="field--narrow"
          label={t("a7.leadTime.label")}
          hint={t("a7.leadTime.hint")}
          inputMode="numeric"
          value={value}
          error={error}
          onChange={(event) => setValue(event.target.value)}
        />
        {notice && (
          <Notice tone="danger" role="alert">
            <p>{notice}</p>
          </Notice>
        )}
        <div className="actions actions--start">
          <Button type="submit" variant="primary" busy={busy} busyLabel={t("a7.saving")}>
            {t("a7.save")}
          </Button>
        </div>
      </form>
      <p className="hint">
        {t("a7.drawingArea", {
          width: formatNumber(settings.drawingAreaWidthMm),
          height: formatNumber(settings.drawingAreaHeightMm),
        })}
      </p>
    </>
  );
}
