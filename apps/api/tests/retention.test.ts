import { utimes } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { adminSessions, drawings } from "../src/db/schema.js";
import { useHarness } from "./helpers/harness.js";
import {
  adminHeaders,
  createPreview,
  frameStock,
  orderBody,
  placeOrder,
  seedFrame,
  seedOrder,
  setOrderStatus,
} from "./helpers/seed.js";

const h = useHarness();

describe("retention sweep (BR-010, SR-022)", () => {
  it("AC-011 deletes an unordered photo and preview after 24 hours; ordering it then is refused", async () => {
    h.setNow("2026-11-03T09:00:00Z"); // 10:00 Tuesday in Amsterdam
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const preview = await createPreview(h);
    expect((await h.storedFiles()).filter((f) => !f.startsWith("frames/"))).toHaveLength(2);

    h.setNow("2026-11-04T08:59:00Z");
    expect((await h.retention.run()).drawingsDeleted).toBe(0);

    h.setNow("2026-11-04T09:00:01Z");
    const report = await h.retention.run();
    expect(report.drawingsDeleted).toBe(1);
    expect((await h.storedFiles()).filter((f) => !f.startsWith("frames/"))).toEqual([]);
    expect(await h.db.select().from(drawings)).toEqual([]);

    const res = await placeOrder(h, orderBody(preview, oak.id));
    expect(res.statusCode).toBe(404);
    expect(res.json().error.message).toBe(
      "This preview is no longer available. Please upload your photo again.",
    );
    expect(await frameStock(h, oak.id)).toBe(3);
  });

  it("keeps ordered drawings past 24 hours", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    await seedOrder(h, oak.id);
    h.advance(48 * 3_600_000);
    expect((await h.retention.run()).drawingsDeleted).toBe(0);
    expect(await h.db.select().from(drawings)).toHaveLength(1);
  });

  it("AC-012 deletes the photo of an order 30 days after shipping, keeps its drawing and keeps photos of open orders", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    h.setNow("2026-11-02T09:00:00Z");
    const o51 = await seedOrder(h, oak.id);
    await setOrderStatus(h, o51.id, "drawing");
    const o42 = await seedOrder(h, oak.id);
    await setOrderStatus(h, o42.id, "shipped", new Date("2026-12-01T10:00:00Z"));

    h.setNow("2026-12-30T12:00:00Z");
    expect((await h.retention.run()).orderPhotosDeleted).toBe(0);

    h.setNow("2027-01-01T00:00:00Z"); // Thursday 31 December 2026 has passed
    const report = await h.retention.run();
    expect(report.orderPhotosDeleted).toBe(1);

    const cookie = await h.login();
    const detail = await h.request({
      method: "GET",
      url: `/api/v1/admin/orders/${o42.id}`,
      headers: adminHeaders(cookie, false),
    });
    expect(detail.json().photoAvailable).toBe(false);
    const photo = await h.request({
      method: "GET",
      url: `/api/v1/admin/orders/${o42.id}/photo`,
      headers: adminHeaders(cookie, false),
    });
    expect(photo.statusCode).toBe(410);
    expect(photo.json().error.code).toBe("photo_deleted");
    const svg = await h.request({
      method: "POST",
      url: `/api/v1/admin/orders/${o42.id}/drawing-download`,
      headers: adminHeaders(cookie),
    });
    expect(svg.statusCode).toBe(200);
    expect(svg.body).toBe(o42.preview.svg);

    const other = await h.request({
      method: "GET",
      url: `/api/v1/admin/orders/${o51.id}/photo`,
      headers: adminHeaders(cookie, false),
    });
    expect(other.statusCode).toBe(200);
  });

  it("deletes the file before updating the row: a failed delete leaves the row for the next run", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const order = await seedOrder(h, oak.id);
    await setOrderStatus(h, order.id, "cancelled", new Date(h.now));
    h.advance(31 * 24 * 3_600_000);
    const realDelete = h.storage.delete.bind(h.storage);
    h.storage.delete = async () => {
      throw new Error("disk unavailable");
    };
    const failed = await h.retention.run();
    expect(failed.failures).toBeGreaterThan(0);
    const [row] = await h.db.select().from(drawings);
    expect(row!.photoDeletedAt).toBeNull();
    expect(h.logs.join("")).toContain('"event":"retention_failed"');

    h.storage.delete = realDelete;
    expect((await h.retention.run()).orderPhotosDeleted).toBe(1);
    const [after] = await h.db.select().from(drawings).where(eq(drawings.id, row!.id));
    expect(after!.photoDeletedAt).not.toBeNull();
  });

  it("deletes orphan files older than 24 hours and expired sessions", async () => {
    const orphan = "photos/11111111-2222-4333-8444-555555555555";
    const fresh = "photos/66666666-7777-4888-8999-000000000000";
    await h.storage.put(orphan, Buffer.from("left over"));
    await h.storage.put(fresh, Buffer.from("being written"));
    const old = new Date(h.now.getTime() - 25 * 3_600_000);
    await utimes(path.join(h.storageDir, orphan), old, old);
    const fileTime = new Date(h.now.getTime() - 3_600_000);
    await utimes(path.join(h.storageDir, fresh), fileTime, fileTime);
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });
    const order = await seedOrder(h, oak.id);
    const [drawing] = await h.db.select().from(drawings);
    for (const key of [drawing!.photoKey, drawing!.svgKey, oak.photoKey]) {
      await utimes(path.join(h.storageDir, key), old, old);
    }
    await h.login();
    h.advance(9 * 3_600_000);

    const report = await h.retention.run();
    expect(report.orphanFilesDeleted).toBe(1);
    expect(report.sessionsDeleted).toBe(1);
    const files = await h.storedFiles();
    expect(files).not.toContain(orphan);
    expect(files).toContain(fresh);
    expect(files).toContain(drawing!.photoKey);
    expect(files).toContain(oak.photoKey);
    expect(await h.db.select().from(adminSessions)).toEqual([]);
    expect(order.id).toBeDefined();
  });
});
