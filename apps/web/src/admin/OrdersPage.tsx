import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  ORDER_STATUSES,
  type OrderFilter,
  type OrderStatus,
  type OrderSummary,
} from "../api/admin";
import { ApiError } from "../api/client";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Notice } from "../components/ui/Notice";
import { Skeleton } from "../components/ui/Skeleton";
import { StatusBadge } from "../components/ui/StatusBadge";
import { VisuallyHidden } from "../components/ui/VisuallyHidden";
import { useAsyncData } from "../hooks/useAsyncData";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useFocusHeadingOnNavigation } from "../hooks/useFocusOnMount";
import { t, tPlural } from "../i18n/t";
import { saveBlob } from "../lib/download";
import { formatDateShort } from "../lib/format";
import { useAdmin } from "./AdminContext";
import { adminErrorMessage, isSessionEnd } from "./adminErrors";
import { downloadedMessage, invalidTransitionMessage, nextStepFor } from "./orderActions";

const FILTERS: readonly OrderFilter[] = ["open", ...ORDER_STATUSES, "all"];

function parseFilter(value: string | null): OrderFilter {
  return FILTERS.includes(value as OrderFilter) ? (value as OrderFilter) : "open";
}

function filterName(filter: OrderFilter): string {
  if (filter === "open") return t("a2.filter.open");
  if (filter === "all") return t("a2.filter.all");
  return t(`status.${filter}`);
}

type RowBusy = Record<string, "downloading" | "saving">;

/** A2 Orders: the day's work list, filter in the URL (AC-029, AC-031, AC-033, UX-019, UX-020). */
export function OrdersPage() {
  const { api, announce } = useAdmin();
  const [searchParams] = useSearchParams();
  const filter = parseFilter(searchParams.get("status"));
  const orders = useAsyncData(filter, () => api.listOrders(filter));
  const [rowBusy, setRowBusy] = useState<RowBusy>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [shipping, setShipping] = useState<OrderSummary | null>(null);
  const [shipError, setShipError] = useState<string | null>(null);
  const [focusAfterShip, setFocusAfterShip] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useDocumentTitle(
    filter === "open" ? t("a2.title") : t("a2.titleFiltered", { filterName: filterName(filter) }),
  );
  useFocusHeadingOnNavigation(headingRef);

  useEffect(() => {
    if (actionError) errorRef.current?.focus();
  }, [actionError]);

  useEffect(() => {
    if (focusAfterShip) document.getElementById(`order-link-${focusAfterShip}`)?.focus();
  }, [focusAfterShip]);

  function setBusy(orderId: string, busy: RowBusy[string] | null) {
    setRowBusy((current) => {
      const next = { ...current };
      if (busy) next[orderId] = busy;
      else delete next[orderId];
      return next;
    });
  }

  function setRowStatus(orderId: string, status: OrderStatus) {
    orders.update((list) =>
      list.map((order) => (order.id === orderId ? { ...order, status } : order)),
    );
  }

  async function explainRefusal(order: OrderSummary, target: OrderStatus) {
    let current = order.status;
    try {
      current = (await api.getOrder(order.id)).status;
    } catch (error) {
      if (isSessionEnd(error)) return;
    }
    setActionError(invalidTransitionMessage(order.orderNumber, current, target));
    orders.reload();
  }

  async function download(order: OrderSummary) {
    setBusy(order.id, "downloading");
    setActionError(null);
    try {
      const file = await api.downloadDrawingForArm(order.id, order.orderNumber);
      saveBlob(file.blob, file.filename);
    } catch (error) {
      if (!isSessionEnd(error)) {
        setActionError(t("a2.error.download", { orderNumber: order.orderNumber }));
      }
      setBusy(order.id, null);
      return;
    }
    // The row shows the status the API reports now, not a guess (the order may have changed elsewhere).
    let after: OrderStatus | null = null;
    try {
      after = (await api.getOrder(order.id)).status;
      setRowStatus(order.id, after);
    } catch (error) {
      if (isSessionEnd(error)) return;
    }
    announce(downloadedMessage(order.orderNumber, order.status, after));
    setBusy(order.id, null);
  }

  /** Returns true when the status changed. */
  async function changeStatus(order: OrderSummary, target: OrderStatus): Promise<boolean> {
    setBusy(order.id, "saving");
    setActionError(null);
    try {
      const updated = await api.changeOrderStatus(order.id, target);
      setRowStatus(order.id, updated.status);
      announce(
        t("a2.done.status", {
          orderNumber: order.orderNumber,
          status: t(`status.${updated.status}`),
        }),
      );
      return true;
    } catch (error) {
      if (isSessionEnd(error)) return false;
      if (error instanceof ApiError && error.code === "invalid_transition") {
        await explainRefusal(order, target);
      } else {
        setActionError(adminErrorMessage(error));
      }
      return false;
    } finally {
      setBusy(order.id, null);
    }
  }

  async function confirmShipped() {
    if (!shipping) return;
    const order = shipping;
    setShipError(null);
    setBusy(order.id, "saving");
    try {
      const updated = await api.changeOrderStatus(order.id, "shipped");
      setRowStatus(order.id, updated.status);
      setShipping(null);
      setFocusAfterShip(order.id);
      announce(
        t("a2.done.status", {
          orderNumber: order.orderNumber,
          status: t(`status.${updated.status}`),
        }),
      );
    } catch (error) {
      if (isSessionEnd(error)) return;
      if (error instanceof ApiError && error.code === "invalid_transition") {
        setShipping(null);
        await explainRefusal(order, "shipped");
      } else {
        setShipError(adminErrorMessage(error));
      }
    } finally {
      setBusy(order.id, null);
    }
  }

  function rowAction(order: OrderSummary) {
    const step = nextStepFor(order.status);
    if (!step) return null;
    const busy = rowBusy[order.id];
    const label = step.kind === "download" ? t("action.downloadSvg") : t(step.label);
    const onClick = () => {
      if (step.kind === "download") void download(order);
      else if (step.confirm) {
        setShipError(null);
        setFocusAfterShip(null);
        setShipping(order);
      } else void changeStatus(order, step.to);
    };
    return (
      <Button
        variant="secondary"
        dense
        busy={Boolean(busy)}
        busyLabel={busy === "downloading" ? t("a2.downloading") : t("a2.saving")}
        onClick={onClick}
      >
        {label}{" "}
        <VisuallyHidden>{t("action.rowSuffix", { orderNumber: order.orderNumber })}</VisuallyHidden>
      </Button>
    );
  }

  const state = orders.state;

  return (
    <div className="stack">
      <h1 ref={headingRef} tabIndex={-1}>
        {t("a2.heading")}
      </h1>
      <nav aria-label={t("a2.filter.label")} className="filter-nav">
        <ul>
          {FILTERS.map((value) => (
            <li key={value}>
              <Link
                to={`/admin/orders?status=${value}`}
                aria-current={value === filter ? "page" : undefined}
              >
                {filterName(value)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="actions actions--start">
        <Button variant="secondary" dense onClick={orders.reload}>
          {t("a2.refresh")}
        </Button>
      </div>

      {actionError && (
        <Notice tone="danger" role="alert" focusable ref={errorRef}>
          <p>{actionError}</p>
        </Notice>
      )}

      {state.status === "error" && !isSessionEnd(state.error) && (
        <Notice
          tone="danger"
          role="alert"
          actions={
            <Button variant="secondary" onClick={orders.reload}>
              {t("admin.retry")}
            </Button>
          }
        >
          <p>{t("a2.error.load")}</p>
        </Notice>
      )}

      {state.status === "loaded" && state.data.length === 0 && (
        <Notice tone="info">
          {filter === "open" ? (
            <p>{t("a2.empty.open")}</p>
          ) : filter === "all" ? (
            <p>{t("a2.empty.all")}</p>
          ) : (
            <>
              <p>{t("a2.empty.filtered", { status: filterName(filter) })}</p>
              <p>
                <Link to="/admin/orders?status=all">{t("a2.empty.showAll")}</Link>
              </p>
            </>
          )}
        </Notice>
      )}

      {(state.status === "loading" || (state.status === "loaded" && state.data.length > 0)) && (
        // A focusable, labelled scroll region so the table can scroll on its own (UX-013, UX-019).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        <div className="table-region" role="region" tabIndex={0} aria-labelledby="orders-caption">
          <table className="table">
            <caption id="orders-caption">
              {state.status === "loading"
                ? t("a2.loading")
                : tPlural("a2.caption", state.data.length, { filterName: filterName(filter) })}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t("a2.col.orderNumber")}</th>
                <th scope="col">{t("a2.col.status")}</th>
                <th scope="col">{t("a2.col.deliveryDate")}</th>
                <th scope="col">{t("a2.col.orderDate")}</th>
                <th scope="col">{t("a2.col.customer")}</th>
                <th scope="col">{t("a2.col.frame")}</th>
                <th scope="col">{t("a2.col.nextStep")}</th>
              </tr>
            </thead>
            <tbody>
              {state.status === "loading"
                ? [0, 1, 2, 3, 4].map((row) => (
                    <tr key={row}>
                      <td colSpan={7}>
                        <Skeleton className="skeleton--row" />
                      </td>
                    </tr>
                  ))
                : state.data.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link
                          id={`order-link-${order.id}`}
                          className="order-number-link"
                          to={`/admin/orders/${encodeURIComponent(order.id)}`}
                          state={{ fromFilter: filter }}
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td>
                        <StatusBadge status={order.status} />
                      </td>
                      <td>{formatDateShort(order.estimatedDeliveryDate)}</td>
                      <td>{formatDateShort(order.orderDate)}</td>
                      <td>{order.customerName}</td>
                      <td>{order.frameName}</td>
                      <td>{rowAction(order)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={shipping !== null}
        heading={t("x5.markShipped.heading", { orderNumber: shipping?.orderNumber ?? "" })}
        body={t("x5.markShipped.body")}
        cancelLabel={t("x5.markShipped.cancel")}
        confirmLabel={t("x5.markShipped.confirm")}
        busy={shipping ? Boolean(rowBusy[shipping.id]) : false}
        busyLabel={t("x5.busy")}
        error={shipError ?? undefined}
        onConfirm={() => void confirmShipped()}
        onCancel={() => setShipping(null)}
      />
    </div>
  );
}
