import type { Database } from "../../db/client.js";
import { isOrderNumber } from "../../domain/order-number.js";
import type { Clock } from "../../lib/clock.js";
import type { FileStorage } from "../../storage/file-storage.js";
import { findDrawing, markFilesErased } from "../drawings/drawings.repository.js";
import { eraseCustomerDetails, lockOrderByNumber } from "./orders.repository.js";

export type ErasureResult = "erased" | "already_erased" | "not_found";

/**
 * Erases one customer's data on request (SR-022, Q-24): deletes the order's photo and drawing files
 * and blanks name, email and address, keeping the order number, price, dates and status for the
 * books. Files are deleted before the rows change, so a failure can simply be retried. Idempotent.
 */
export async function eraseOrder(
  deps: { db: Database; storage: FileStorage; clock: Clock },
  orderNumber: string,
): Promise<ErasureResult> {
  if (!isOrderNumber(orderNumber)) return "not_found";
  const now = deps.clock();
  return deps.db.transaction(async (tx) => {
    const order = await lockOrderByNumber(tx, orderNumber);
    if (!order) return "not_found";
    const drawing = await findDrawing(tx, order.drawingId);
    if (!drawing) throw new Error("order without drawing");
    const already =
      order.erasedAt !== null && drawing.svgDeletedAt !== null && drawing.photoDeletedAt !== null;
    await deps.storage.delete(drawing.photoKey);
    await deps.storage.delete(drawing.svgKey);
    await markFilesErased(tx, drawing.id, now);
    if (order.erasedAt === null) await eraseCustomerDetails(tx, order.id, now);
    return already ? "already_erased" : "erased";
  });
}
