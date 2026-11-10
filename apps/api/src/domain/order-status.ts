/** The order status state machine (BR-009). */

export const ORDER_STATUSES = [
  "received",
  "drawing",
  "drawn",
  "ready_to_ship",
  "shipped",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const CLOSED_STATUSES: readonly OrderStatus[] = ["shipped", "cancelled"];
export const OPEN_STATUSES: readonly OrderStatus[] = ORDER_STATUSES.filter(
  (s) => !CLOSED_STATUSES.includes(s),
);

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  received: ["drawing", "cancelled"],
  drawing: ["drawn", "cancelled"],
  drawn: ["ready_to_ship"],
  ready_to_ship: ["shipped"],
  shipped: [],
  cancelled: [],
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  received: "Received",
  drawing: "Drawing",
  drawn: "Drawn",
  ready_to_ship: "Ready to ship",
  shipped: "Shipped",
  cancelled: "Cancelled",
};

/** Whether BR-009 allows moving from `from` to `to` at all (by any action). */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Statuses the admin may set through the status action. `received -> drawing` happens only by
 * downloading the SVG for the arm, so it is never offered here.
 */
export function allowedNextStatuses(from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[from].filter((to) => !(from === "received" && to === "drawing"));
}

/** Whether the status action may move the order to `to`. */
export function canSetStatus(from: OrderStatus, to: OrderStatus): boolean {
  return allowedNextStatuses(from).includes(to);
}

/** Status after downloading the SVG for the arm: only `received` moves (to `drawing`). */
export function statusAfterArmDownload(current: OrderStatus): OrderStatus {
  return current === "received" ? "drawing" : current;
}

export function isClosed(status: OrderStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}
