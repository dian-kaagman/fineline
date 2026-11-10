import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { adminSessions, frames } from "../src/db/schema.js";
import { jpegWithGpsExif, multipart } from "./helpers/fixtures.js";
import { ADMIN_PASSWORD, ADMIN_USERNAME, CSRF, useHarness } from "./helpers/harness.js";
import { adminHeaders, frameStock, seedFrame, seedOrder } from "./helpers/seed.js";

const h = useHarness();

const login = (
  payload: unknown,
  extra: { headers?: Record<string, string>; remoteAddress?: string } = {},
) =>
  h.request({
    method: "POST",
    url: "/api/v1/admin/session",
    headers: { ...CSRF, ...extra.headers },
    payload: payload as Record<string, unknown>,
    ...(extra.remoteAddress ? { remoteAddress: extra.remoteAddress } : {}),
  });

const listOrders = (cookie: string) =>
  h.request({ method: "GET", url: "/api/v1/admin/orders", headers: adminHeaders(cookie, false) });

describe("admin login", () => {
  it("AC-024 logs in with the configured credentials", async () => {
    const res = await login({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ username: "owner" });
    const cookie = res.cookies.find((c) => c.name === "fineline_admin")!;
    expect((await listOrders(cookie.value)).statusCode).toBe(200);
    const session = await h.request({
      method: "GET",
      url: "/api/v1/admin/session",
      headers: adminHeaders(cookie.value, false),
    });
    expect(session.json()).toEqual({ username: "owner" });
  });

  it("AC-025 refuses a wrong password and a wrong username with the same answer and starts no session", async () => {
    const a = await login({ username: "owner", password: "pen-and-paper-2025" });
    const b = await login({ username: "admin", password: ADMIN_PASSWORD });
    for (const res of [a, b]) {
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({
        error: { code: "invalid_credentials", message: "Wrong username or password." },
      });
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
    expect(await h.db.select().from(adminSessions)).toEqual([]);
    expect(h.passwordChecks.count).toBe(2); // scrypt ran for the wrong username too
  });

  it("AC-062 sets an HttpOnly, Secure, SameSite=Strict cookie on the admin path, and a new session on each login", async () => {
    const first = await login({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
    const header = String(first.headers["set-cookie"]);
    expect(header).toMatch(/^fineline_admin=[A-Za-z0-9_-]{43};/);
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Path=/api/v1/admin");
    expect(header).not.toContain("Domain");
    const firstCookie = first.cookies[0]!.value;

    const second = await login(
      { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
      { headers: { cookie: `fineline_admin=${firstCookie}` } },
    );
    const secondCookie = second.cookies[0]!.value;
    expect(secondCookie).not.toBe(firstCookie);
    expect((await listOrders(firstCookie)).statusCode).toBe(401);
    expect((await listOrders(secondCookie)).statusCode).toBe(200);
    // Only a hash of the session ID is stored.
    const rows = await h.db.select().from(adminSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.idHash).not.toBe(secondCookie);
  });

  it("AC-061 refuses the 6th attempt in 15 minutes even with the right password, before running scrypt", async () => {
    h.setNow("2026-11-06T09:00:00Z"); // 10:00 Amsterdam
    for (let i = 0; i < 5; i++) {
      expect((await login({ username: "owner", password: `wrong-${i}` })).statusCode).toBe(401);
      h.advance(60_000);
    }
    h.setNow("2026-11-06T09:05:00Z");
    const checksBefore = h.passwordChecks.count;
    const res = await login(
      { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
      { headers: { "x-forwarded-for": "9.9.9.9" } },
    );
    expect(res.statusCode).toBe(429);
    expect(res.json().error).toEqual({
      code: "rate_limited",
      message: "Too many login attempts. Please wait 10 minutes and try again.",
    });
    expect(res.headers["retry-after"]).toBe("600");
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(h.passwordChecks.count).toBe(checksBefore);
    expect(await h.db.select().from(adminSessions)).toEqual([]);

    // Another address is not affected.
    expect(
      (
        await login(
          { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
          { remoteAddress: "198.51.100.7" },
        )
      ).statusCode,
    ).toBe(200);

    h.setNow("2026-11-06T09:16:00Z");
    expect((await login({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })).statusCode).toBe(
      200,
    );
  });

  it("AC-061 SR-011 counts attempts before scrypt: 40 parallel wrong logins from one address get at most 5 checks", async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) =>
        login({ username: "owner", password: `guess-${i}-xxxxxxx` }),
      ),
    );
    const statuses = results.map((r) => r.statusCode);
    expect(h.passwordChecks.count).toBeLessThanOrEqual(5);
    expect(statuses.filter((s) => s === 401).length).toBe(h.passwordChecks.count);
    expect(statuses.filter((s) => s === 429).length).toBe(40 - h.passwordChecks.count);
    for (const res of results.filter((r) => r.statusCode === 429)) {
      expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    }
    // Logins refused because another one was being checked don't count; after 5 failures in total
    // even the right password is refused.
    for (let i = h.passwordChecks.count; i < 5; i++) {
      expect((await login({ username: "owner", password: `more-${i}` })).statusCode).toBe(401);
    }
    expect((await login({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })).statusCode).toBe(
      429,
    );
  });

  it("SR-010 verifies one password at a time; logins beyond a short queue get 429 at once", async () => {
    const results = await Promise.all(
      ["198.51.100.1", "198.51.100.2", "198.51.100.3", "198.51.100.4", "198.51.100.5"].map((ip) =>
        login({ username: "owner", password: "wrong-password-1" }, { remoteAddress: ip }),
      ),
    );
    expect(h.passwordChecks.maxConcurrent).toBe(1);
    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    const busy = results.find((r) => r.statusCode === 429)!;
    expect(busy.json().error.code).toBe("rate_limited");
    expect(busy.headers["retry-after"]).toBe("1");
  });

  it("AC-061 a successful login doesn't use up an attempt", async () => {
    for (let i = 0; i < 4; i++)
      expect((await login({ username: "owner", password: `wrong-${i}` })).statusCode).toBe(401);
    for (let i = 0; i < 3; i++)
      expect((await login({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })).statusCode).toBe(
        200,
      );
    expect((await login({ username: "owner", password: "wrong-again" })).statusCode).toBe(401);
    expect((await login({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD })).statusCode).toBe(
      429,
    );
  });

  it("AC-028 a logged-out session is refused", async () => {
    const cookie = await h.login();
    const res = await h.request({
      method: "DELETE",
      url: "/api/v1/admin/session",
      headers: adminHeaders(cookie),
    });
    expect(res.statusCode).toBe(204);
    expect(String(res.headers["set-cookie"])).toMatch(/fineline_admin=;.*Max-Age=0/);
    expect((await listOrders(cookie)).statusCode).toBe(401);
  });

  it("AC-063 refuses a session idle for 8 h 1 min and one started 24 h 1 min ago that was used every 30 minutes", async () => {
    h.setNow("2026-11-06T08:00:00Z");
    const a = await h.login();
    h.advance(8 * 3_600_000 + 60_000);
    expect((await listOrders(a)).statusCode).toBe(401);

    h.setNow("2026-11-07T08:00:00Z");
    const b = await h.login();
    for (let i = 0; i < 47; i++) {
      h.advance(30 * 60_000);
      expect((await listOrders(b)).statusCode).toBe(200);
    }
    h.advance(31 * 60_000); // 24 h 1 min after login
    expect((await listOrders(b)).statusCode).toBe(401);
  });

  it("AC-064 refuses changes without the admin tool's header, even with a valid session, and changes nothing", async () => {
    const cookie = await h.login();
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 2 });
    const order = await seedOrder(h, oak.id);
    const noHeader = { cookie: `fineline_admin=${cookie}` };
    const form = await multipart([
      { name: "name", value: "Walnut" },
      { name: "widthMm", value: "300" },
      { name: "heightMm", value: "400" },
      { name: "priceCents", value: "5995" },
      { name: "stock", value: "1" },
      { name: "photo", value: jpegWithGpsExif().file, filename: "w.jpg", type: "image/jpeg" },
    ]);
    const filesBefore = await h.storedFiles();
    const calls = [
      h.request({
        method: "POST",
        url: "/api/v1/admin/frames",
        headers: { ...noHeader, ...form.headers },
        payload: form.payload,
      }),
      h.request({
        method: "POST",
        url: `/api/v1/admin/frames/${oak.id}/stock-adjustments`,
        headers: noHeader,
        payload: { delta: 5 },
      }),
      h.request({
        method: "POST",
        url: `/api/v1/admin/orders/${order.id}/status`,
        headers: noHeader,
        payload: { status: "cancelled" },
      }),
      h.request({
        method: "POST",
        url: "/api/v1/admin/session",
        headers: noHeader,
        payload: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
      }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("csrf_failed");
    }
    expect(await h.db.select().from(frames)).toHaveLength(1);
    expect(await frameStock(h, oak.id)).toBe(1);
    const detail = await h.request({
      method: "GET",
      url: `/api/v1/admin/orders/${order.id}`,
      headers: adminHeaders(cookie, false),
    });
    expect(detail.json().status).toBe("received");
    expect(await h.storedFiles()).toEqual(filesBefore);
    expect(await h.db.select().from(adminSessions)).toHaveLength(1);
  });

  it("checks authentication before the CSRF header: no session and no header is 401", async () => {
    const res = await h.request({
      method: "POST",
      url: "/api/v1/admin/frames/0b6f1a3e-8c5d-4e7f-9a2b-1c3d4e5f6a7b/stock-adjustments",
      payload: { delta: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("sends no CORS headers to other origins (SR-013)", async () => {
    const res = await h.request(
      {
        method: "OPTIONS",
        url: "/api/v1/admin/orders",
        headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
      },
      { contract: false },
    );
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("AC-026 every admin route refuses requests without a valid session", () => {
  it("AC-026 refuses every registered admin route and method with no, a made-up and an expired session cookie", async () => {
    const adminRoutes = h.routes
      .flatMap((r) =>
        (Array.isArray(r.method) ? r.method : [r.method]).map((m) => ({ method: m, url: r.url })),
      )
      .filter((r) => r.url.startsWith("/api/v1/admin/"))
      .filter((r) => !(r.method === "POST" && r.url === "/api/v1/admin/session"));
    // The table really is the full admin API (guards against an empty or partial enumeration).
    expect(adminRoutes.filter((r) => r.method !== "HEAD").length).toBeGreaterThanOrEqual(15);

    // An expired session: created 25 hours ago.
    const expiredId = randomBytes(32).toString("base64url");
    const created = new Date(h.now.getTime() - 25 * 3_600_000);
    await h.db.insert(adminSessions).values({
      idHash: createHash("sha256").update(expiredId).digest("hex"),
      createdAt: created,
      lastSeenAt: new Date(h.now.getTime() - 60_000),
      expiresAt: new Date(created.getTime() + 24 * 3_600_000),
    });
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 2 });
    const order = await seedOrder(h, oak.id);
    const filesBefore = await h.storedFiles();
    const upload = await multipart([
      { name: "name", value: "Walnut" },
      { name: "photo", value: jpegWithGpsExif().file, filename: "w.jpg", type: "image/jpeg" },
    ]);

    const cookies = [
      undefined,
      `fineline_admin=${randomBytes(32).toString("base64url")}`,
      `fineline_admin=${expiredId}`,
    ];
    let calls = 0;
    for (const route of adminRoutes) {
      const url = route.url.replace(":orderId", order.id).replace(":frameId", oak.id);
      for (const cookie of cookies) {
        const res = await h.request({
          method: route.method,
          url,
          headers: {
            ...CSRF,
            ...(cookie ? { cookie } : {}),
            ...(route.method === "GET" || route.method === "HEAD" ? {} : upload.headers),
          },
          ...(route.method === "GET" || route.method === "HEAD" ? {} : { payload: upload.payload }),
        });
        calls += 1;
        expect(res.statusCode, `${route.method} ${route.url} with ${cookie ?? "no cookie"}`).toBe(
          401,
        );
        if (route.method !== "HEAD") {
          expect(res.json()).toEqual({
            error: { code: "unauthenticated", message: "Please log in to continue." },
          });
          expect(res.body).not.toContain("Anna");
          expect(res.body).not.toContain(order.orderNumber);
        }
      }
    }
    expect(calls).toBe(adminRoutes.length * 3);
    // Nothing changed and nothing was stored.
    expect(await h.storedFiles()).toEqual(filesBefore);
    expect(await frameStock(h, oak.id)).toBe(1);
    expect(await h.db.select().from(frames)).toHaveLength(1);
  });

  it("AC-027 refuses the order photo, the drawing view and the arm download without login and keeps the status", async () => {
    const oak = await seedFrame(h, { name: "Oak A4", priceCents: 4995, stock: 2 });
    const order = await seedOrder(h, oak.id);
    for (const [method, path] of [
      ["GET", "photo"],
      ["GET", "drawing.svg"],
      ["POST", "drawing-download"],
    ] as const) {
      const res = await h.request({
        method,
        url: `/api/v1/admin/orders/${order.id}/${path}`,
        headers: CSRF,
      });
      expect(res.statusCode).toBe(401);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.body).not.toContain("<svg");
    }
    const cookie = await h.login();
    const detail = await h.request({
      method: "GET",
      url: `/api/v1/admin/orders/${order.id}`,
      headers: adminHeaders(cookie, false),
    });
    expect(detail.json().status).toBe("received");
  });

  it("AC-010 no public route returns a photo or drawing by ID (SR-009)", async () => {
    const publicRoutes = h.routes.filter((r) => !r.url.startsWith("/api/v1/admin"));
    expect(publicRoutes.map((r) => `${String(r.method)} ${r.url}`).sort()).toEqual([
      "GET /api/v1/frames",
      "GET /api/v1/frames/:frameId/photo",
      "GET /api/v1/health",
      "HEAD /api/v1/frames",
      "HEAD /api/v1/frames/:frameId/photo",
      "HEAD /api/v1/health",
      "POST /api/v1/drawings",
      "POST /api/v1/orders",
    ]);
  });
});
