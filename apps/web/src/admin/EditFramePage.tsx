import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import type { AdminFrame, FrameUpdate } from "../api/admin";
import { ApiError } from "../api/client";
import { Button } from "../components/ui/Button";
import { ErrorSummary, type SummaryError } from "../components/ui/ErrorSummary";
import { TextField } from "../components/ui/Field";
import { Notice } from "../components/ui/Notice";
import { Skeleton } from "../components/ui/Skeleton";
import { useAsyncData } from "../hooks/useAsyncData";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useFocusHeadingOnNavigation } from "../hooks/useFocusOnMount";
import { t } from "../i18n/t";
import { centsToEuroInput, parseWholeNumber } from "../lib/parse";
import { useAdmin } from "./AdminContext";
import { adminErrorMessage, isSessionEnd } from "./adminErrors";
import { FramePhotoField } from "./FramePhotoField";
import {
  FRAME_FIELD_ORDER,
  checkFramePhoto,
  checkFrameValues,
  frameErrorsFromApi,
  type DrawingArea,
  type FrameErrors,
  type FrameField,
  type FrameFormValues,
} from "./frameForm";

const EDIT_IDS: Record<FrameField, string> = {
  name: "edit-name",
  widthMm: "edit-width",
  heightMm: "edit-height",
  priceCents: "edit-price",
  stock: "edit-stock",
  photo: "edit-photo",
};

/** A6 Edit frame (AC-042, AC-043, AC-044): details, photo and stock, each with its own button. */
export function EditFramePage() {
  const { frameId = "" } = useParams();
  const { api } = useAdmin();
  const frame = useAsyncData(frameId, () => api.getFrame(frameId));
  const settings = useAsyncData("settings", () => api.getSettings());
  const headingRef = useRef<HTMLHeadingElement>(null);

  const loaded = frame.state.status === "loaded" ? frame.state.data : null;
  useDocumentTitle(loaded ? t("a6.title", { frameName: loaded.name }) : t("a6.titleLoading"));
  useFocusHeadingOnNavigation(headingRef);

  const area: DrawingArea | null =
    settings.state.status === "loaded"
      ? {
          widthMm: settings.state.data.drawingAreaWidthMm,
          heightMm: settings.state.data.drawingAreaHeightMm,
        }
      : null;

  if (
    frame.state.status === "error" &&
    frame.state.error instanceof ApiError &&
    frame.state.error.status === 404
  ) {
    return (
      <div className="stack">
        <h1 ref={headingRef} tabIndex={-1}>
          {t("a6.notFound")}
        </h1>
        <p>
          <Link to="/admin/frames">{t("a6.back")}</Link>
        </p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="stack">
        <p>
          <Link to="/admin/frames">{t("a6.back")}</Link>
        </p>
        <h1 ref={headingRef} tabIndex={-1}>
          {t("a6.headingLoading")}
        </h1>
        {frame.state.status === "error" && !isSessionEnd(frame.state.error) ? (
          <Notice
            tone="danger"
            role="alert"
            actions={
              <Button variant="secondary" onClick={frame.reload}>
                {t("admin.retry")}
              </Button>
            }
          >
            <p>{t("a6.error.load")}</p>
          </Notice>
        ) : (
          <>
            <Skeleton className="skeleton--block" />
            <Skeleton className="skeleton--block" />
          </>
        )}
      </div>
    );
  }

  const replace = (updated: AdminFrame) => frame.update(() => updated);

  return (
    <div className="stack">
      <p>
        <Link to="/admin/frames">{t("a6.back")}</Link>
      </p>
      <h1 ref={headingRef} tabIndex={-1}>
        {loaded.name}
      </h1>
      <DetailsSection frame={loaded} area={area} onSaved={replace} />
      <PhotoSection frame={loaded} onSaved={replace} />
      <StockSection frame={loaded} onSaved={replace} reload={() => api.getFrame(loaded.id)} />
    </div>
  );
}

interface SectionProps {
  frame: AdminFrame;
  onSaved: (frame: AdminFrame) => void;
}

function DetailsSection({ frame, area, onSaved }: SectionProps & { area: DrawingArea | null }) {
  const { api, announce } = useAdmin();
  const [values, setValues] = useState<FrameFormValues>({
    name: frame.name,
    widthMm: String(frame.widthMm),
    heightMm: String(frame.heightMm),
    price: centsToEuroInput(frame.priceCents),
    stock: "",
  });
  const [errors, setErrors] = useState<FrameErrors>({});
  const [result, setResult] = useState<{
    tone: "success" | "info" | "danger";
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusSummary, setFocusSummary] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusSummary > 0) summaryRef.current?.focus();
  }, [focusSummary]);

  const errorCount = Object.keys(errors).length;

  function showErrors(next: FrameErrors) {
    setErrors(next);
    setResult(null);
    const count = Object.keys(next).length;
    if (count >= 2) setFocusSummary((value) => value + 1);
    else {
      const field = FRAME_FIELD_ORDER.find((name) => next[name]);
      if (field) document.getElementById(EDIT_IDS[field])?.focus();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const { errors: found, parsed } = checkFrameValues(values, area, false);
    if (!parsed) return showErrors(found);

    const changes: FrameUpdate = {};
    if (parsed.name !== frame.name) changes.name = parsed.name;
    if (parsed.widthMm !== frame.widthMm) changes.widthMm = parsed.widthMm;
    if (parsed.heightMm !== frame.heightMm) changes.heightMm = parsed.heightMm;
    if (parsed.priceCents !== frame.priceCents) changes.priceCents = parsed.priceCents;
    setErrors({});
    if (Object.keys(changes).length === 0) {
      setResult({ tone: "info", text: t("a6.noChanges") });
      return;
    }

    setBusy(true);
    try {
      const updated = await api.updateFrame(frame.id, changes);
      announce(t("a6.done.details"));
      onSaved(updated);
    } catch (error) {
      if (isSessionEnd(error)) return;
      const fieldErrors =
        error instanceof ApiError ? frameErrorsFromApi(error, values, null, area) : null;
      if (fieldErrors) showErrors(fieldErrors);
      else setResult({ tone: "danger", text: adminErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  const summary: SummaryError[] =
    errorCount >= 2
      ? FRAME_FIELD_ORDER.flatMap((field) =>
          errors[field] ? [{ fieldId: EDIT_IDS[field], message: errors[field] }] : [],
        ).filter(
          (item, index, all) => all.findIndex((other) => other.message === item.message) === index,
        )
      : [];

  const set = (field: keyof FrameFormValues, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));

  return (
    <section className="card stack" aria-labelledby="details-heading">
      <h2 id="details-heading">{t("a6.details.heading")}</h2>
      <form className="form form--admin" noValidate onSubmit={handleSubmit}>
        <ErrorSummary ref={summaryRef} errors={summary} />
        <TextField
          id={EDIT_IDS.name}
          label={t("a5.name.label")}
          hint={t("a5.name.hint")}
          value={values.name}
          error={errors.name}
          onChange={(event) => set("name", event.target.value)}
        />
        {area && (
          <p className="field__hint" id="edit-size-hint">
            {t("a5.size.hint", { areaWidth: area.widthMm, areaHeight: area.heightMm })}
          </p>
        )}
        <div className="field-row">
          <TextField
            id={EDIT_IDS.widthMm}
            label={t("a5.width.label")}
            inputMode="numeric"
            sharedHintId={area ? "edit-size-hint" : undefined}
            value={values.widthMm}
            error={errors.widthMm}
            onChange={(event) => set("widthMm", event.target.value)}
          />
          <TextField
            id={EDIT_IDS.heightMm}
            label={t("a5.height.label")}
            inputMode="numeric"
            sharedHintId={area ? "edit-size-hint" : undefined}
            value={values.heightMm}
            error={errors.heightMm}
            onChange={(event) => set("heightMm", event.target.value)}
          />
        </div>
        <TextField
          id={EDIT_IDS.priceCents}
          label={t("a5.price.label")}
          hint={t("a6.priceNote")}
          inputMode="decimal"
          value={values.price}
          error={errors.priceCents}
          onChange={(event) => set("price", event.target.value)}
        />
        {result && (
          <Notice tone={result.tone} role={result.tone === "danger" ? "alert" : undefined}>
            <p>{result.text}</p>
          </Notice>
        )}
        <div className="actions actions--start">
          <Button type="submit" variant="primary" busy={busy} busyLabel={t("a6.saving")}>
            {t("a6.save")}
          </Button>
        </div>
      </form>
    </section>
  );
}

function PhotoSection({ frame, onSaved }: SectionProps) {
  const { api, announce } = useAdmin();
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!photo) {
      setError(t("a6.photo.required"));
      document.getElementById(EDIT_IDS.photo)?.focus();
      return;
    }
    const photoError = checkFramePhoto(photo);
    if (photoError) {
      setError(photoError);
      document.getElementById(EDIT_IDS.photo)?.focus();
      return;
    }
    setBusy(true);
    setError(undefined);
    setNotice(null);
    try {
      const updated = await api.replaceFramePhoto(frame.id, photo);
      announce(t("a6.done.photo"));
      setPhoto(null);
      setVersion((value) => value + 1);
      onSaved(updated);
    } catch (caught) {
      if (isSessionEnd(caught)) return;
      const fieldErrors =
        caught instanceof ApiError
          ? frameErrorsFromApi(caught, {} as FrameFormValues, photo, null)
          : null;
      if (fieldErrors?.photo) setError(fieldErrors.photo);
      else setNotice(adminErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack" aria-labelledby="photo-section-heading">
      <h2 id="photo-section-heading">{t("a6.photo.heading")}</h2>
      <img
        className="thumbnail thumbnail--large"
        key={frame.updatedAt}
        src={frame.photoUrl}
        alt={t("a6.photo.alt", { frameName: frame.name })}
      />
      <form className="form form--admin" noValidate onSubmit={handleSubmit}>
        <FramePhotoField
          key={version}
          id={EDIT_IDS.photo}
          label={t("a6.photo.choose")}
          hint={t("a5.photo.hint")}
          error={error}
          photo={photo}
          onChange={setPhoto}
        />
        {notice && (
          <Notice tone="danger" role="alert">
            <p>{notice}</p>
          </Notice>
        )}
        <div className="actions actions--start">
          <Button type="submit" variant="primary" busy={busy} busyLabel={t("a6.saving")}>
            {t("a6.photo.replace")}
          </Button>
        </div>
      </form>
    </section>
  );
}

function StockSection({
  frame,
  onSaved,
  reload,
}: SectionProps & { reload: () => Promise<AdminFrame> }) {
  const { api, announce } = useAdmin();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"add" | "remove" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function adjust(direction: "add" | "remove") {
    if (busy) return;
    const value = parseWholeNumber(amount, 1, 10000);
    if (value === null) {
      setError(t("a6.error.amount.invalid"));
      inputRef.current?.focus();
      return;
    }
    setBusy(direction);
    setError(undefined);
    setNotice(null);
    try {
      const updated = await api.adjustStock(frame.id, direction === "add" ? value : -value);
      const text =
        frame.stock === 0 && updated.stock > 0
          ? t("a6.done.stockOffered", { stock: updated.stock, frameName: updated.name })
          : frame.stock > 0 && updated.stock === 0
            ? t("a6.done.stockNotOffered", { stock: updated.stock, frameName: updated.name })
            : t("a6.done.stock", { stock: updated.stock });
      announce(text);
      setAmount("");
      onSaved(updated);
    } catch (caught) {
      if (isSessionEnd(caught)) return;
      if (caught instanceof ApiError && caught.code === "stock_negative") {
        // Show the stock as it is now, which may differ from what this page loaded.
        let stock = frame.stock;
        try {
          const fresh = await reload();
          stock = fresh.stock;
          onSaved(fresh);
        } catch {
          // Keep the stock this page knows.
        }
        setError(t("a6.error.stockNegative", { stock }));
        inputRef.current?.focus();
      } else if (caught instanceof ApiError && caught.code === "validation_failed") {
        setError(t("a6.error.amount.invalid"));
        inputRef.current?.focus();
      } else {
        setNotice(adminErrorMessage(caught));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card stack" aria-labelledby="stock-heading">
      <h2 id="stock-heading">{t("a6.stock.heading")}</h2>
      <p className="big-fact">
        {frame.stock === 0 ? t("a6.stock.soldOut") : t("a6.stock.current", { stock: frame.stock })}
      </p>
      <form
        className="form form--admin"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void adjust("add");
        }}
      >
        <TextField
          ref={inputRef}
          id="stock-amount"
          className="field--narrow"
          label={t("a6.stock.amount.label")}
          hint={t("a6.stock.amount.hint")}
          inputMode="numeric"
          value={amount}
          error={error}
          onChange={(event) => setAmount(event.target.value)}
        />
        {notice && (
          <Notice tone="danger" role="alert">
            <p>{notice}</p>
          </Notice>
        )}
        <div className="actions actions--start">
          <Button type="submit" variant="primary" busy={busy === "add"} busyLabel={t("a6.saving")}>
            {t("a6.stock.add")}
          </Button>
          <Button
            variant="secondary"
            busy={busy === "remove"}
            busyLabel={t("a6.saving")}
            onClick={() => void adjust("remove")}
          >
            {t("a6.stock.remove")}
          </Button>
        </div>
      </form>
    </section>
  );
}
