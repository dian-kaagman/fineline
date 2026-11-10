/**
 * Erases one customer's data on request (SR-022, Q-24):
 *   npm run erase-order -- FL-2026-0042
 *   node dist/scripts/erase-order.js FL-2026-0042      (in the Docker image)
 * Needs DATABASE_URL and STORAGE_DIR. Prints and logs only the order number.
 */
import { databaseUrlProblem } from "../config.js";
import { createDatabase } from "../db/client.js";
import { systemClock } from "../lib/clock.js";
import { eraseOrder } from "../modules/orders/erasure.service.js";
import { LocalDiskStorage } from "../storage/local-disk-storage.js";

const orderNumber = process.argv[2] ?? "";
const url = process.env.DATABASE_URL ?? "";
const storageDir = process.env.STORAGE_DIR ?? "";
const problem = databaseUrlProblem(url);
if (problem || !storageDir || !/^FL-\d{4}-\d{4,}$/.test(orderNumber)) {
  console.error(
    problem
      ? `DATABASE_URL ${problem}`
      : !storageDir
        ? "STORAGE_DIR must be set"
        : "Usage: erase-order FL-2026-0042",
  );
  process.exit(1);
}

const { db, pool } = createDatabase(url);
try {
  const result = await eraseOrder(
    { db, storage: new LocalDiskStorage(storageDir), clock: systemClock },
    orderNumber,
  );
  if (result === "not_found") {
    console.error(`Order ${orderNumber} not found`);
    process.exitCode = 1;
  } else if (result === "already_erased") {
    console.log(`Order ${orderNumber} was already erased`);
  } else {
    console.log(
      `Erased ${orderNumber}: photo and drawing deleted, name, email and address blanked`,
    );
  }
} catch (err) {
  const code =
    (err as { code?: string }).code ?? (err as { cause?: { code?: string } }).cause?.code;
  console.error(
    `Erasing ${orderNumber} failed${code ? ` (code ${code})` : ""}; nothing was blanked, run it again`,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
