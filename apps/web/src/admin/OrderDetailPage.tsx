import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router";
import type { OrderDetail, OrderStatus } from "../api/admin";
import { ApiError } from "../api/client";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { FieldError } from "../components/ui/Field";
import { describedBy, errorId, hintId } from "../components/ui/fieldIds";
import { Notice } from "../components/ui/Notice";
import { Skeleton } from "../components/ui/Skeleton";
import { StatusBadge } from "../components/ui/StatusBadge";
import { useAsyncData } from "../hooks/useAsyncData";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useFocusHeadingOnNavigation } from "../hooks/useFocusOnMount";
import { t } from "../i18n/t";
import { saveBlob } from "../lib/download";
import {
  formatDateLong,
  formatLength,
  formatPrice,
  formatSize,
  formatStrokeCount,
} from "../lib/format";
import { svgDataUrl } from "../lib/svg";
import { AddressLines } from "../shop/AddressLines";
import { useAdmin } from "./AdminContext";
import { adminErrorMessage, isSessionEnd } from "./adminErrors";
import { OrderPhoto } from "./OrderPhoto";
import { downloadedMessage, invalidTransitionMessage, isFinal } from "./orderActions";

type Busy = "download" | "drawn" | "ready_to_ship" | "shipped" | "cancelled" | null;
type Dialog = "cancel" | "ship" | null;

const FORWARD: Partial<
  Record<
    OrderStatus,
    { to: OrderStatus; label: "action.markDrawn" | "action.markReadyToShip" | "action.markShipped" }
  >
> = {
  drawing: { to: "drawn", label: "action.markDrawn" },
  drawn: { to: "ready_to_ship", label: "action.markReadyToShip" },
  ready_to_ship: { to: "shipped", label: "action.markShipped" },
};

/** A3 Order detail (AC-030..AC-038): everything about one order and all its actions. */
export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const location = useLocation();
  const { api, announce } = useAdmin();
  const order = useAsyncData(orderId, () => api.getOrder(orderId));
  const drawing = useAsyncData(orderId, () => api.getOrderDrawingSvg(orderId));
  const [busy, setBusy] = useState<Busy>(null);
  const [nextStepError, setNextStepError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [focusNextStep, setFocusNextStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const nextStepHeadingRef = useRef<HTMLHeadingElement>(null);
  const nextStepErrorRef = useRef<HTMLDivElement>(null);

  const fromFilter = (location.state as { fromFilter?: string } | null)?.fromFilter;
  const backTo = fromFilter
    ? `/admin/orders?status=${encodeURIComponent(fromFilter)}`
    : "/admin/orders";

  const loaded = order.state.status === "loaded" ? order.state.data : null;
  useDocumentTitle(
    loaded ? t("a3.title", { orderNumber: loaded.orderNumber }) : t("a3.titleLoading"),
  );
  useFocusHeadingOnNavigation(headingRef);

  useEffect(() => {
    if (focusNextStep > 0) nextStepHeadingRef.current?.focus();
  }, [focusNextStep]);

  useEffect(() => {
    if (nextStepError) nextStepErrorRef.current?.focus();
  }, [nextStepError]);

  const notFound =
    order.state.status === "error" &&
    order.state.error instanceof ApiError &&
    order.state.error.status === 404;

  /**
   * Every state renders the same back link and h1 in the same place, so the heading React focused
   * on arrival stays the same element when the order loads (UX-003).
   */
  function page(heading: string, status: OrderStatus | null, body: ReactNode) {
    return (
      <div className="stack">
        <p>
          <Link className="back-link" to={notFound ? "/admin/orders" : backTo}>
            {t("a3.back")}
          </Link>
        </p>
        <div className="title-row">
          <h1 ref={headingRef} tabIndex={-1}>
            {heading}
          </h1>
          {status && <StatusBadge status={status} />}
        </div>
        {body}
      </div>
    );
  }

  if (notFound) {
    return page(t("a3.notFound.heading"), null, <p>{t("a3.notFound.body")}</p>);
  }

  async function refusal(current: OrderDetail, target: OrderStatus) {
    let status = current.status;
    try {
      const fresh = await api.getOrder(current.id);
      status = fresh.status;
      order.update(() => fresh);
    } catch (error) {
      if (isSessionEnd(error)) return;
    }
    setNextStepError(invalidTransitionMessage(current.orderNumber, status, target));
  }

  async function download(current: OrderDetail) {
    setBusy("download");
    setNextStepError(null);
    try {
      const file = await api.downloadDrawingForArm(current.id, current.orderNumber);
      saveBlob(file.blob, file.filename);
    } catch (error) {
      if (!isSessionEnd(error)) {
        setNextStepError(t("a2.error.download", { orderNumber: current.orderNumber }));
      }
      setBusy(null);
      return;
    }
    // The file is saved; now show the status the API has (Drawing for a received order, AC-031).
    let after: OrderDetail | null = null;
    try {
      const fresh = await api.getOrder(current.id);
      after = fresh;
      order.update(() => fresh);
    } catch (error) {
      if (isSessionEnd(error)) return;
    }
    announce(downloadedMessage(current.orderNumber, current.status, after?.status ?? null));
    setBusy(null);
    setFocusNextStep((value) => value + 1);
  }

  async function changeStatus(current: OrderDetail, target: OrderStatus, inDialog: boolean) {
    setBusy(target as Busy);
    setNextStepError(null);
    setDialogError(null);
    try {
      const updated = await api.changeOrderStatus(current.id, target);
      order.update(() => updated);
      setDialog(null);
      announce(
        target === "cancelled"
          ? t("a3.done.cancelled", {
              orderNumber: current.orderNumber,
              frameName: current.frameName,
            })
          : t("a3.done.status", {
              orderNumber: current.orderNumber,
              status: t(`status.${updated.status}`),
            }),
      );
      setFocusNextStep((value) => value + 1);
    } catch (error) {
      if (isSessionEnd(error)) return;
      if (error instanceof ApiError && error.code === "invalid_transition") {
        setDialog(null);
        await refusal(current, target);
      } else if (inDialog) {
        setDialogError(adminErrorMessage(error));
      } else {
        setNextStepError(adminErrorMessage(error));
      }
    } finally {
      setBusy(null);
    }
  }

  if (!loaded) {
    return page(
      t("a3.headingLoading"),
      null,
      order.state.status === "error" && !isSessionEnd(order.state.error) ? (
        <Notice
          tone="danger"
          role="alert"
          actions={
            <Button variant="secondary" onClick={order.reload}>
              {t("admin.retry")}
            </Button>
          }
        >
          <p>{t("a3.error.load")}</p>
        </Notice>
      ) : (
        <>
          <Skeleton className="skeleton--block" />
          <Skeleton className="skeleton--block" />
        </>
      ),
    );
  }

  const current = loaded;
  const forward = FORWARD[current.status];
  const canCancel = current.allowedNextStatuses.includes("cancelled");
  const canMoveForward = forward && current.allowedNextStatuses.includes(forward.to);
  const final = isFinal(current.status);
  const anyBusy = busy !== null;

  const downloadButton = (
    <Button
      variant={current.status === "received" ? "primary" : "secondary"}
      busy={busy === "download"}
      busyLabel={t("a2.downloading")}
      aria-disabled={anyBusy && busy !== "download" ? true : undefined}
      onClick={() => void download(current)}
    >
      {current.status === "received" || final
        ? t("action.downloadSvg")
        : t("action.downloadSvgAgain")}
    </Button>
  );

  return page(
    t("a3.heading", { orderNumber: current.orderNumber }),
    current.status,
    <>
      <div className="order-layout">
        <div className="order-layout__media stack">
          <section className="stack" aria-labelledby="drawing-heading">
            <h2 id="drawing-heading">{t("a3.drawing.heading")}</h2>
            {drawing.state.status === "loaded" && (
              <div className="sheet">
                <img
                  className="sheet__drawing"
                  src={svgDataUrl(drawing.state.data)}
                  alt={t("a3.drawing.alt", { orderNumber: current.orderNumber })}
                  width={current.drawing.widthMm}
                  height={current.drawing.heightMm}
                />
              </div>
            )}
            {drawing.state.status === "loading" && <Skeleton className="skeleton--sheet" />}
            {drawing.state.status === "error" && !isSessionEnd(drawing.state.error) && (
              <Notice
                tone="danger"
                role="alert"
                actions={
                  <Button variant="secondary" onClick={drawing.reload}>
                    {t("admin.retry")}
                  </Button>
                }
              >
                <p>{t("a3.drawing.error")}</p>
              </Notice>
            )}
            <dl className="facts facts--inline">
              <div>
                <dt>{t("a3.drawing.size")}</dt>
                <dd>{formatSize(current.drawing.widthMm, current.drawing.heightMm)}</dd>
              </div>
              <div>
                <dt>{t("a3.drawing.strokes")}</dt>
                <dd>{formatStrokeCount(current.drawing.strokeCount)}</dd>
              </div>
              <div>
                <dt>{t("a3.drawing.length")}</dt>
                <dd>{formatLength(current.drawing.totalLengthMm)}</dd>
              </div>
            </dl>
          </section>

          <section className="stack" aria-labelledby="photo-heading">
            <h2 id="photo-heading">{t("a3.photo.heading")}</h2>
            <OrderPhoto
              orderId={current.id}
              orderNumber={current.orderNumber}
              available={current.photoAvailable}
            />
          </section>
        </div>

        <div className="order-layout__facts stack">
          <section className="stack" aria-labelledby="next-step-heading">
            <h2 id="next-step-heading" ref={nextStepHeadingRef} tabIndex={-1}>
              {t("a3.nextStep.heading")}
            </h2>
            <p className="hint">{t(`status.${current.status}.help`)}</p>
            {nextStepError && (
              <Notice tone="danger" role="alert" focusable ref={nextStepErrorRef}>
                <p>{nextStepError}</p>
              </Notice>
            )}
            <div className="actions actions--start">
              {current.status === "received" && downloadButton}
              {canMoveForward && forward && (
                <Button
                  variant="primary"
                  busy={busy === forward.to}
                  busyLabel={t("a2.saving")}
                  aria-disabled={anyBusy && busy !== forward.to ? true : undefined}
                  onClick={() => {
                    if (forward.to === "shipped") {
                      setDialogError(null);
                      setDialog("ship");
                    } else {
                      void changeStatus(current, forward.to, false);
                    }
                  }}
                >
                  {t(forward.label)}
                </Button>
              )}
              {current.status !== "received" && downloadButton}
              {canCancel && (
                <Button
                  variant="secondary"
                  aria-disabled={anyBusy ? true : undefined}
                  onClick={() => {
                    setDialogError(null);
                    setDialog("cancel");
                  }}
                >
                  {t("action.cancelOrder")}
                </Button>
              )}
            </div>
            <p className="hint">
              {current.status === "received"
                ? t("a3.download.hint")
                : final
                  ? t("a3.final")
                  : t("a3.downloadAgain.hint")}
            </p>
          </section>

          <DeliveryDateSection
            order={current}
            onChanged={(updated) => order.update(() => updated)}
            onClosed={order.reload}
          />

          <section className="stack" aria-labelledby="customer-heading">
            <h2 id="customer-heading">{t("a3.customer.heading")}</h2>
            <dl className="facts">
              <div>
                <dt>{t("a3.customer.name")}</dt>
                <dd>{current.customerName}</dd>
              </div>
              <div>
                <dt>{t("a3.customer.email")}</dt>
                {/* Plain text, not a mailto: link: no href is built from customer data (SR-016). */}
                <dd>{current.customerEmail}</dd>
              </div>
              <div>
                <dt>{t("a3.customer.address")}</dt>
                <dd>
                  <AddressLines address={current.address} />
                </dd>
              </div>
            </dl>
          </section>

          <section className="stack" aria-labelledby="order-heading">
            <h2 id="order-heading">{t("a3.order.heading")}</h2>
            <dl className="facts">
              <div>
                <dt>{t("a3.order.date")}</dt>
                <dd>{formatDateLong(current.orderDate)}</dd>
              </div>
              <div>
                <dt>{t("a3.order.frame")}</dt>
                <dd>
                  <Link to={`/admin/frames/${encodeURIComponent(current.frameId)}`}>
                    {current.frameName}
                  </Link>
                </dd>
              </div>
              <div>
                <dt>{t("a3.order.price")}</dt>
                <dd>{formatPrice(current.priceCents)}</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === "cancel"}
        heading={t("x5.cancel.heading", { orderNumber: current.orderNumber })}
        body={t("x5.cancel.body", { frameName: current.frameName })}
        cancelLabel={t("x5.cancel.keep")}
        confirmLabel={t("x5.cancel.confirm")}
        confirmVariant="danger"
        busy={busy === "cancelled"}
        busyLabel={t("x5.busy")}
        error={dialog === "cancel" ? (dialogError ?? undefined) : undefined}
        onConfirm={() => void changeStatus(current, "cancelled", true)}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "ship"}
        heading={t("x5.markShipped.heading", { orderNumber: current.orderNumber })}
        body={t("x5.markShipped.body")}
        cancelLabel={t("x5.markShipped.cancel")}
        confirmLabel={t("x5.markShipped.confirm")}
        busy={busy === "shipped"}
        busyLabel={t("x5.busy")}
        error={dialog === "ship" ? (dialogError ?? undefined) : undefined}
        onConfirm={() => void changeStatus(current, "shipped", true)}
        onCancel={() => setDialog(null)}
      />
    </>,
  );
}

interface DeliveryDateSectionProps {
  order: OrderDetail;
  onChanged: (order: OrderDetail) => void;
  onClosed: () => void;
}

const DATE_FIELD_ID = "delivery-date";

/** Delivery date of one order (AC-037, AC-038): a native date field, not before the order date. */
function DeliveryDateSection({ order, onChanged, onClosed }: DeliveryDateSectionProps) {
  const { api, announce } = useAdmin();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(order.estimatedDeliveryDate);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const [focusTarget, setFocusTarget] = useState<"input" | "change" | null>(null);

  const orderDate = formatDateLong(order.orderDate);

  useEffect(() => {
    if (focusTarget === "input") inputRef.current?.focus();
    if (focusTarget === "change") changeRef.current?.focus();
  }, [focusTarget]);

  function startEditing() {
    setValue(order.estimatedDeliveryDate);
    setError(null);
    setNotice(null);
    setEditing(true);
    setFocusTarget("input");
  }

  function stopEditing() {
    setEditing(false);
    setError(null);
    setFocusTarget("change");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      setError(t("a3.date.error.invalid"));
      inputRef.current?.focus();
      return;
    }
    if (value < order.orderDate) {
      setError(t("a3.date.error.beforeOrderDate", { orderDate }));
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.changeDeliveryDate(order.id, value);
      onChanged(updated);
      announce(t("a3.done.date", { date: formatDateLong(updated.estimatedDeliveryDate) }));
      setEditing(false);
      setFocusTarget("change");
    } catch (caught) {
      if (isSessionEnd(caught)) return;
      if (caught instanceof ApiError && caught.code === "delivery_date_before_order_date") {
        setError(t("a3.date.error.beforeOrderDate", { orderDate }));
        inputRef.current?.focus();
      } else if (caught instanceof ApiError && caught.code === "validation_failed") {
        setError(t("a3.date.error.invalid"));
        inputRef.current?.focus();
      } else if (caught instanceof ApiError && caught.code === "order_closed") {
        setEditing(false);
        setNotice(t("a3.delivery.closed"));
        onClosed();
      } else {
        setError(adminErrorMessage(caught));
        inputRef.current?.focus();
      }
    } finally {
      setBusy(false);
    }
  }

  const final = isFinal(order.status);

  return (
    <section className="stack" aria-labelledby="delivery-heading">
      <h2 id="delivery-heading">{t("a3.delivery.heading")}</h2>
      <p className="big-fact">{formatDateLong(order.estimatedDeliveryDate)}</p>
      {notice && (
        <Notice tone="danger" role="alert">
          <p>{notice}</p>
        </Notice>
      )}
      {final ? (
        <p className="hint">{t("a3.delivery.closed")}</p>
      ) : editing ? (
        <form className="form form--inline" noValidate onSubmit={save}>
          <div className={`field ${error ? "field--invalid" : ""}`}>
            <label className="field__label" htmlFor={DATE_FIELD_ID}>
              {t("a3.delivery.newLabel")}
            </label>
            <p className="field__hint" id={hintId(DATE_FIELD_ID)}>
              {t("a3.delivery.hint", { orderDate })}
            </p>
            <FieldError id={errorId(DATE_FIELD_ID)} message={error ?? undefined} />
            <input
              ref={inputRef}
              id={DATE_FIELD_ID}
              type="date"
              className="input input--date"
              min={order.orderDate}
              value={value}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy(DATE_FIELD_ID, Boolean(error), true)}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
          <div className="actions actions--start">
            <Button type="submit" variant="primary" busy={busy} busyLabel={t("a2.saving")}>
              {t("a3.delivery.save")}
            </Button>
            <Button variant="text" onClick={stopEditing}>
              {t("a3.delivery.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="actions actions--start">
          <Button ref={changeRef} variant="secondary" onClick={startEditing}>
            {t("a3.delivery.change")}
          </Button>
        </div>
      )}
    </section>
  );
}
