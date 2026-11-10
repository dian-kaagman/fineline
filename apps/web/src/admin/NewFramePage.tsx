import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError } from "../api/client";
import { Button } from "../components/ui/Button";
import { ErrorSummary, type SummaryError } from "../components/ui/ErrorSummary";
import { TextField } from "../components/ui/Field";
import { Notice } from "../components/ui/Notice";
import { useAsyncData } from "../hooks/useAsyncData";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useFocusHeadingOnNavigation } from "../hooks/useFocusOnMount";
import { t } from "../i18n/t";
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

const NEW_FRAME_IDS: Record<FrameField, string> = {
  name: "frame-name",
  widthMm: "frame-width",
  heightMm: "frame-height",
  priceCents: "frame-price",
  stock: "frame-stock",
  photo: "frame-photo",
};

/** A5 New frame (AC-039, AC-040, AC-041). */
export function NewFramePage() {
  const { api } = useAdmin();
  const navigate = useNavigate();
  const settings = useAsyncData("settings", () => api.getSettings());
  const [values, setValues] = useState<FrameFormValues>({
    name: "",
    widthMm: "",
    heightMm: "",
    price: "",
    stock: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<FrameErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [focusSummary, setFocusSummary] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  useDocumentTitle(t("a5.title"));
  useFocusHeadingOnNavigation(headingRef);

  useEffect(() => {
    if (focusSummary > 0) summaryRef.current?.focus();
  }, [focusSummary]);
  useEffect(() => {
    if (notice) noticeRef.current?.focus();
  }, [notice]);

  const area: DrawingArea | null =
    settings.state.status === "loaded"
      ? {
          widthMm: settings.state.data.drawingAreaWidthMm,
          heightMm: settings.state.data.drawingAreaHeightMm,
        }
      : null;

  function set(field: keyof FrameFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function showErrors(next: FrameErrors) {
    setErrors(next);
    setNotice(null);
    setFocusSummary((value) => value + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const { errors: found, parsed } = checkFrameValues(values, area, true);
    const photoError = checkFramePhoto(photo);
    if (photoError) found.photo = photoError;
    if (!parsed || photoError || !photo) return showErrors(found);

    setBusy(true);
    setErrors({});
    setNotice(null);
    try {
      const frame = await api.createFrame({ ...parsed, photo });
      const added =
        frame.stock > 0
          ? t("a5.done", { frameName: frame.name })
          : t("a5.doneNoStock", { frameName: frame.name });
      navigate("/admin/frames", { state: { added } });
    } catch (error) {
      if (isSessionEnd(error)) return;
      const fieldErrors =
        error instanceof ApiError ? frameErrorsFromApi(error, values, photo, area) : null;
      if (fieldErrors) showErrors(fieldErrors);
      else setNotice(adminErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const summary: SummaryError[] = FRAME_FIELD_ORDER.flatMap((field) =>
    errors[field] ? [{ fieldId: NEW_FRAME_IDS[field], message: errors[field] }] : [],
  );
  // AC-040 puts the same message on both size fields; the summary lists it once.
  const uniqueSummary = summary.filter(
    (item, index) => summary.findIndex((other) => other.message === item.message) === index,
  );

  return (
    <div className="stack">
      <p>
        <Link to="/admin/frames">{t("a5.back")}</Link>
      </p>
      <h1 ref={headingRef} tabIndex={-1}>
        {t("a5.heading")}
      </h1>
      <form className="form form--admin" noValidate onSubmit={handleSubmit}>
        <ErrorSummary ref={summaryRef} errors={uniqueSummary} />
        <p>{t("form.allRequired")}</p>
        <TextField
          id={NEW_FRAME_IDS.name}
          label={t("a5.name.label")}
          hint={t("a5.name.hint")}
          value={values.name}
          error={errors.name}
          onChange={(event) => set("name", event.target.value)}
        />
        {area && (
          <p className="field__hint" id="frame-size-hint">
            {t("a5.size.hint", { areaWidth: area.widthMm, areaHeight: area.heightMm })}
          </p>
        )}
        <div className="field-row">
          <TextField
            id={NEW_FRAME_IDS.widthMm}
            label={t("a5.width.label")}
            inputMode="numeric"
            sharedHintId={area ? "frame-size-hint" : undefined}
            value={values.widthMm}
            error={errors.widthMm}
            onChange={(event) => set("widthMm", event.target.value)}
          />
          <TextField
            id={NEW_FRAME_IDS.heightMm}
            label={t("a5.height.label")}
            inputMode="numeric"
            sharedHintId={area ? "frame-size-hint" : undefined}
            value={values.heightMm}
            error={errors.heightMm}
            onChange={(event) => set("heightMm", event.target.value)}
          />
        </div>
        <TextField
          id={NEW_FRAME_IDS.priceCents}
          label={t("a5.price.label")}
          hint={t("a5.price.hint")}
          inputMode="decimal"
          value={values.price}
          error={errors.priceCents}
          onChange={(event) => set("price", event.target.value)}
        />
        <TextField
          id={NEW_FRAME_IDS.stock}
          label={t("a5.stock.label")}
          hint={t("a5.stock.hint")}
          inputMode="numeric"
          value={values.stock}
          error={errors.stock}
          onChange={(event) => set("stock", event.target.value)}
        />
        <FramePhotoField
          id={NEW_FRAME_IDS.photo}
          label={t("a5.photo.label")}
          hint={t("a5.photo.hint")}
          error={errors.photo}
          photo={photo}
          onChange={setPhoto}
        />
        {notice && (
          <Notice tone="danger" role="alert" focusable ref={noticeRef}>
            <p>{notice}</p>
          </Notice>
        )}
        <div className="actions actions--start">
          <Button type="submit" variant="primary" busy={busy} busyLabel={t("a5.submitting")}>
            {t("a5.submit")}
          </Button>
          <Link className="button button--secondary" to="/admin/frames">
            {t("a5.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
