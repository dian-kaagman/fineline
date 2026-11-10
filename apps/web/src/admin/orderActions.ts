// The next step of an order and the texts around status changes (screens.md A2/A3, BR-009).
import type { OrderStatus } from "../api/admin";
import type { MessageKey } from "../i18n/t";
import { t } from "../i18n/t";

export type NextStep =
  { kind: "download" } | { kind: "status"; to: OrderStatus; label: MessageKey; confirm: boolean };

/** The one forward step of an order in the A2 row; null for shipped and cancelled. */
export function nextStepFor(status: OrderStatus): NextStep | null {
  switch (status) {
    case "received":
      return { kind: "download" };
    case "drawing":
      return { kind: "status", to: "drawn", label: "action.markDrawn", confirm: false };
    case "drawn":
      return {
        kind: "status",
        to: "ready_to_ship",
        label: "action.markReadyToShip",
        confirm: false,
      };
    case "ready_to_ship":
      return { kind: "status", to: "shipped", label: "action.markShipped", confirm: true };
    default:
      return null;
  }
}

export function isFinal(status: OrderStatus): boolean {
  return status === "shipped" || status === "cancelled";
}

/** AC-034: "FL-2026-0044 is Drawn now, so it can't be cancelled. The order has been reloaded." */
export function invalidTransitionMessage(
  orderNumber: string,
  current: OrderStatus,
  target: OrderStatus,
): string {
  return t("admin.error.invalidTransition", {
    orderNumber,
    currentStatus: t(`status.${current}`),
    targetAction: t(`transition.${target}`),
  });
}

/**
 * The status-region text after a download for the arm (AC-031, AC-032), from the status the API
 * reports afterwards; null when that status couldn't be read.
 */
export function downloadedMessage(
  orderNumber: string,
  statusBefore: OrderStatus,
  statusAfter: OrderStatus | null,
): string {
  if (statusAfter === null) return t("a3.done.downloadedNoRefresh", { orderNumber });
  return statusBefore === "received" && statusAfter === "drawing"
    ? t("a2.done.downloaded", { orderNumber })
    : t("a2.done.downloadedAgain", { orderNumber, status: t(`status.${statusAfter}`) });
}
