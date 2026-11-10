import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { drawings, orders } from "../src/db/schema.js";
import { eraseOrder } from "../src/modules/orders/erasure.service.js";
import { useHarness } from "./helpers/harness.js";
import { adminHeaders, seedFrame, seedOrder } from "./helpers/seed.js";

const h = useHarness();

const script = fileURLToPath(new URL("../src/scripts/erase-order.ts", import.meta.url));

function runScript(
  args: string[],
  env: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      "npx",
      ["tsx", script, ...args],
      { env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env } },
      (error, stdout, stderr) => {
        resolve({ code: error ? (error.code as number) : 0, stdout, stderr });
      },
    );
  });
}

describe("erasure of one customer's data (SR-022, Q-24)", () => {
  it("SR-022 deletes the photo and drawing files, blanks name, email and address, keeps the order facts; idempotent", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const order = await seedOrder(h, oak.id);
    const [drawing] = await h.db.select().from(drawings);
    const deps = { db: h.db, storage: h.storage, clock: () => new Date(h.now) };

    expect(await eraseOrder(deps, order.orderNumber)).toBe("erased");
    const files = await h.storedFiles();
    expect(files).not.toContain(drawing!.photoKey);
    expect(files).not.toContain(drawing!.svgKey);
    expect(files).toContain(oak.photoKey);

    const [row] = await h.db.select().from(orders).where(eq(orders.id, order.id));
    expect(row).toMatchObject({
      orderNumber: order.orderNumber,
      customerName: "[erased]",
      customerEmail: "[erased]",
      street: "[erased]",
      houseNumber: "[erased]",
      postalCode: "[erased]",
      city: "[erased]",
      country: "NL",
      priceCents: 4995,
      status: "received",
      orderDate: "2026-11-06",
      estimatedDeliveryDate: "2026-11-17",
    });
    expect(row!.erasedAt).not.toBeNull();

    // The admin sees the order without personal data, photo or drawing.
    const cookie = await h.login();
    const detail = await h.request({
      method: "GET",
      url: `/api/v1/admin/orders/${order.id}`,
      headers: adminHeaders(cookie, false),
    });
    expect(detail.json()).toMatchObject({
      customerName: "[erased]",
      photoAvailable: false,
      priceCents: 4995,
    });
    expect(detail.body).not.toContain("Anna");
    const photo = await h.request({
      method: "GET",
      url: `/api/v1/admin/orders/${order.id}/photo`,
      headers: adminHeaders(cookie, false),
    });
    expect(photo.statusCode).toBe(410);
    const svg = await h.request({
      method: "GET",
      url: `/api/v1/admin/orders/${order.id}/drawing.svg`,
      headers: adminHeaders(cookie, false),
    });
    expect(svg.statusCode).toBe(404);
    expect(svg.json().error.code).toBe("drawing_deleted");

    expect(await eraseOrder(deps, order.orderNumber)).toBe("already_erased");
    expect(await eraseOrder(deps, "FL-2026-9999")).toBe("not_found");
    expect(await eraseOrder(deps, "Robert'); drop table orders;--")).toBe("not_found");
  });

  it("SR-022 the erase-order script erases by order number and logs only the order number", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const order = await seedOrder(h, oak.id);
    const env = {
      DATABASE_URL: process.env.TEST_DATABASE_URL as string,
      STORAGE_DIR: h.storageDir,
    };
    const first = await runScript([order.orderNumber], env);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain(`Erased ${order.orderNumber}`);
    expect(first.stdout + first.stderr).not.toContain("Anna");
    const again = await runScript([order.orderNumber], env);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain("already erased");
    expect((await runScript(["FL-2026-9999"], env)).code).toBe(1);
    expect((await runScript(["not-an-order"], env)).code).toBe(1);
    const [row] = await h.db.select().from(orders);
    expect(row!.customerEmail).toBe("[erased]");
  });
});
