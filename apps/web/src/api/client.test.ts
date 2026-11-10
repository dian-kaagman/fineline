import { describe, expect, it } from "vitest";
import { apiError, json, mockApi, networkFailure, svgResponse } from "../test/http";
import { createAdminApi, getSession, login, logout } from "./admin";
import { ApiError, NetworkError, filenameFromDisposition, sendJson } from "./client";
import { createDrawing, placeOrder } from "./shop";
import { confirmation, jpeg, orderDetail } from "../test/fixtures";

const ORDER_ID = "aaaaaaaa-0042-4000-8000-000000000042";

describe("API client", () => {
  it("parses the contract's error shape with details and Retry-After", async () => {
    mockApi().on(
      "GET",
      "/api/v1/frames",
      apiError(429, "rate_limited", "Too many", undefined, { "Retry-After": "900" }),
    );
    const error = await sendJson("/frames").catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 429,
      code: "rate_limited",
      retryAfterSeconds: 900,
      apiMessage: "Too many",
    });
  });

  it("gives a code for answers without our JSON body, such as nginx's own 413", async () => {
    mockApi().on(
      "POST",
      "/api/v1/drawings",
      new Response("<html>413</html>", { status: 413, headers: { "Content-Type": "text/html" } }),
    );
    await expect(createDrawing(jpeg())).rejects.toMatchObject({ status: 413, code: "http_413" });
  });

  it("reports no response at all as a NetworkError", async () => {
    mockApi().on("GET", "/api/v1/frames", networkFailure());
    await expect(sendJson("/frames")).rejects.toBeInstanceOf(NetworkError);
  });

  it("sends the photo as one multipart part named photo", async () => {
    const api = mockApi().on("POST", "/api/v1/drawings", json(201, {}));
    await createDrawing(jpeg());
    const body = api.calls[0]!.body as FormData;
    expect(body.getAll("photo")).toHaveLength(1);
  });

  it("returns the confirmation for both 201 and a 200 replay (AC-058)", async () => {
    mockApi().on("POST", "/api/v1/orders", json(200, confirmation()));
    await expect(placeOrder({} as never)).resolves.toMatchObject({ orderNumber: "FL-2026-0042" });
  });

  it("AC-064 sends X-Requested-With: fineline on every unsafe admin call, login and logout included", async () => {
    const api = mockApi()
      .on("POST", "/api/v1/admin/session", json(200, { username: "owner" }))
      .on("DELETE", "/api/v1/admin/session", new Response(null, { status: 204 }))
      .on("GET", "/api/v1/admin/session", json(200, { username: "owner" }))
      .on("POST", /\/status$/, json(200, orderDetail()))
      .on("PATCH", /\/orders\//, json(200, orderDetail()))
      .on("POST", /drawing-download$/, svgResponse("<svg/>"))
      .on("GET", /drawing\.svg$/, svgResponse("<svg/>"))
      .on("POST", "/api/v1/admin/frames", json(201, {}))
      .on("PATCH", /\/admin\/frames\//, json(200, {}))
      .on("PUT", /\/photo$/, json(200, {}))
      .on("POST", /stock-adjustments$/, json(200, {}))
      .on("PUT", "/api/v1/admin/settings", json(200, {}))
      .on("GET", /\/admin\/orders\?/, json(200, { orders: [] }));
    const admin = createAdminApi(() => {});

    await login("owner", "secret");
    await logout();
    await getSession();
    await admin.listOrders("open");
    await admin.getOrderDrawingSvg(ORDER_ID);
    await admin.changeOrderStatus(ORDER_ID, "drawn");
    await admin.changeDeliveryDate(ORDER_ID, "2026-11-20");
    await admin.downloadDrawingForArm(ORDER_ID, "FL-2026-0042");
    await admin.createFrame({
      name: "Oak A4",
      widthMm: 210,
      heightMm: 297,
      priceCents: 4995,
      stock: 5,
      photo: jpeg(),
    });
    await admin.updateFrame(ORDER_ID, { priceCents: 5495 });
    await admin.replaceFramePhoto(ORDER_ID, jpeg());
    await admin.adjustStock(ORDER_ID, 5);
    await admin.updateSettings(10);

    for (const call of api.calls) {
      const unsafe = call.method !== "GET";
      expect(call.headers.get("X-Requested-With"), `${call.method} ${call.path}`).toBe(
        unsafe ? "fineline" : null,
      );
    }
  });

  it("calls the session-end handler on any 401 of a session call (UX-023)", async () => {
    mockApi().on("GET", /\/admin\/settings$/, apiError(401, "unauthenticated"));
    let ended = 0;
    const admin = createAdminApi(() => ended++);
    await expect(admin.getSettings()).rejects.toMatchObject({ status: 401 });
    expect(ended).toBe(1);
  });

  it("takes the SVG file name from Content-Disposition (AC-031)", async () => {
    mockApi().on("POST", /drawing-download$/, svgResponse("<svg/>", "FL-2026-0042.svg"));
    const file = await createAdminApi(() => {}).downloadDrawingForArm(ORDER_ID, "fallback");
    expect(file.filename).toBe("FL-2026-0042.svg");
  });

  it("never uses an unsafe file name from the header", () => {
    expect(
      filenameFromDisposition('attachment; filename="../../evil.svg"', "FL-2026-0042.svg"),
    ).toBe("FL-2026-0042.svg");
    expect(filenameFromDisposition(null, "FL-2026-0042.svg")).toBe("FL-2026-0042.svg");
  });
});
