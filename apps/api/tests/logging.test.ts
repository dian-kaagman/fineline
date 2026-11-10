import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { heicBytes, multipart } from "./helpers/fixtures.js";
import { ADMIN_PASSWORD, CSRF, useHarness } from "./helpers/harness.js";
import {
  adminHeaders,
  orderBody,
  placeOrder,
  seedFrame,
  setOrderCounter,
  type Preview,
} from "./helpers/seed.js";

const h = useHarness();

describe("logs and errors without personal data (BR-014, SR-018)", () => {
  it("AC-023 a full flow logs no personal data or secrets, and a database error is answered generically", async () => {
    await setOrderCounter(h, 2026, 41);
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 3 });

    // Customer uploads "anna-en-tim.heic" and orders.
    const upload = await multipart([
      { name: "photo", value: heicBytes(), filename: "anna-en-tim.heic", type: "image/heic" },
    ]);
    const uploaded = await h.request({
      method: "POST",
      url: "/api/v1/drawings",
      payload: upload.payload,
      headers: upload.headers,
    });
    const preview = uploaded.json<Preview>();
    const customer = {
      customer: { name: "Anna de Vries", email: "anna@example.nl" },
      address: {
        street: "Lindelaan",
        houseNumber: "12",
        postalCode: "3512 AB",
        city: "Utrecht",
        country: "NL",
      },
    };
    const ordered = await placeOrder(h, orderBody(preview, oak.id, customer));
    expect(ordered.json().orderNumber).toBe("FL-2026-0042");

    // A wrong password, then the admin logs in and works on the order.
    const failed = await h.request({
      method: "POST",
      url: "/api/v1/admin/session",
      headers: CSRF,
      payload: { username: "owner", password: "tulip-garden-77" },
    });
    expect(failed.statusCode).toBe(401);
    const cookie = await h.login();
    const list = await h.request({
      method: "GET",
      url: "/api/v1/admin/orders",
      headers: adminHeaders(cookie, false),
    });
    const orderId = list.json().orders[0].id as string;
    await h.request({
      method: "GET",
      url: `/api/v1/admin/orders/${orderId}`,
      headers: adminHeaders(cookie, false),
    });
    await h.request({
      method: "POST",
      url: `/api/v1/admin/orders/${orderId}/drawing-download`,
      headers: adminHeaders(cookie),
    });
    await h.request({
      method: "POST",
      url: `/api/v1/admin/orders/${orderId}/status`,
      headers: adminHeaders(cookie),
      payload: { status: "drawn" },
    });

    // One order request fails on a database error whose message and detail carry customer data.
    await h.db.execute(sql`
      create or replace function fail_order() returns trigger language plpgsql as $$
      begin
        raise exception 'cannot store order for %', new.customer_name using detail = new.street || ' ' || new.postal_code;
      end $$`);
    await h.db.execute(
      sql`create trigger fail_order before insert on orders for each row execute function fail_order()`,
    );
    let broken;
    try {
      const second = await createPreviewWithName();
      broken = await placeOrder(h, orderBody(second, oak.id, customer), "10.2.0.2");
    } finally {
      await h.db.execute(sql`drop trigger if exists fail_order on orders`);
      await h.db.execute(sql`drop function if exists fail_order()`);
    }
    expect(broken.statusCode).toBe(500);
    expect(broken.json()).toEqual({
      error: { code: "internal_error", message: "Something went wrong" },
    });

    const logs = h.logs.join("");
    expect(logs).toContain("FL-2026-0042");
    expect(logs).toContain('"event":"unhandled_error"');
    expect(logs).toContain('"code":"P0001"');
    for (const secret of [
      "Anna de Vries",
      "anna@example.nl",
      "Lindelaan",
      "3512 AB",
      "anna-en-tim",
      "tulip-garden-77",
      ADMIN_PASSWORD,
      preview.previewToken,
      cookie,
      "cannot store order",
      "Failed query",
    ]) {
      expect(logs, `logs contain ${secret}`).not.toContain(secret);
    }
    expect(logs).toContain('"event":"login_failed"');

    async function createPreviewWithName(): Promise<Preview> {
      const body = await multipart([
        { name: "photo", value: heicBytes(), filename: "anna-en-tim.heic", type: "image/heic" },
      ]);
      const res = await h.request({
        method: "POST",
        url: "/api/v1/drawings",
        payload: body.payload,
        headers: body.headers,
      });
      return res.json<Preview>();
    }
  });
});
