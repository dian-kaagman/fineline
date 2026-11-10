// Admin API calls. Every unsafe call carries the CSRF header (SR-013). The session-bound calls are
// created by createAdminApi so that any 401 ends the session in one place (UX-023).
import { ApiError, filenameFromDisposition, send, sendJson } from "./client";
import type { components, operations } from "./schema";

export type AdminSession = components["schemas"]["AdminSession"];
export type OrderStatus = components["schemas"]["OrderStatus"];
export type OrderSummary = components["schemas"]["OrderSummary"];
export type OrderDetail = components["schemas"]["OrderDetail"];
export type AdminFrame = components["schemas"]["AdminFrame"];
export type SettingsView = components["schemas"]["SettingsView"];
export type OrderFilter = NonNullable<
  NonNullable<operations["listOrders"]["parameters"]["query"]>["status"]
>;
export type FrameUpdate = NonNullable<
  operations["updateFrame"]["requestBody"]
>["content"]["application/json"];

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "received",
  "drawing",
  "drawn",
  "ready_to_ship",
  "shipped",
  "cancelled",
];

/** POST /admin/session. A 401 here means wrong credentials, not an ended session. */
export function login(username: string, password: string): Promise<AdminSession> {
  return sendJson<AdminSession>("/admin/session", {
    method: "POST",
    json: { username, password },
    csrf: true,
  });
}

/** GET /admin/session: the session, or null when there is none. */
export async function getSession(): Promise<AdminSession | null> {
  try {
    return await sendJson<AdminSession>("/admin/session");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

/** DELETE /admin/session. An already ended session counts as logged out. */
export async function logout(): Promise<void> {
  try {
    await send("/admin/session", { method: "DELETE", csrf: true });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return;
    throw error;
  }
}

export interface SvgFile {
  filename: string;
  blob: Blob;
}

const id = (value: string) => encodeURIComponent(value);

/** Admin calls that need a session; `onUnauthenticated` runs on any 401 before the error is rethrown. */
export function createAdminApi(onUnauthenticated: () => void) {
  async function guard<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onUnauthenticated();
      throw error;
    }
  }

  return {
    listOrders: (status: OrderFilter) =>
      guard(async () => {
        const body = await sendJson<{ orders: OrderSummary[] }>(
          `/admin/orders?status=${encodeURIComponent(status)}`,
        );
        return body.orders;
      }),

    getOrder: (orderId: string) =>
      guard(() => sendJson<OrderDetail>(`/admin/orders/${id(orderId)}`)),

    /** GET .../drawing.svg: only for showing the drawing; never changes the status (AC-030). */
    getOrderDrawingSvg: (orderId: string) =>
      guard(async () => (await send(`/admin/orders/${id(orderId)}/drawing.svg`)).text()),

    /** POST .../drawing-download: the SVG for the arm; moves a received order to drawing (AC-031). */
    downloadDrawingForArm: (orderId: string, orderNumber: string) =>
      guard(async (): Promise<SvgFile> => {
        const response = await send(`/admin/orders/${id(orderId)}/drawing-download`, {
          method: "POST",
          csrf: true,
        });
        const filename = filenameFromDisposition(
          response.headers.get("Content-Disposition"),
          `${orderNumber}.svg`,
        );
        return { filename, blob: await response.blob() };
      }),

    /** The status code of GET .../photo, used when the photo <img> fails to load. */
    getOrderPhotoStatus: (orderId: string) =>
      guard(async () => {
        try {
          const response = await send(`/admin/orders/${id(orderId)}/photo`);
          // Only the status matters; stop reading the photo (not awaited: a cancel may settle late).
          response.body?.cancel().catch(() => {});
          return response.status;
        } catch (error) {
          if (error instanceof ApiError && error.status !== 401) return error.status;
          throw error;
        }
      }),

    changeOrderStatus: (orderId: string, status: OrderStatus) =>
      guard(() =>
        sendJson<OrderDetail>(`/admin/orders/${id(orderId)}/status`, {
          method: "POST",
          json: { status },
          csrf: true,
        }),
      ),

    changeDeliveryDate: (orderId: string, estimatedDeliveryDate: string) =>
      guard(() =>
        sendJson<OrderDetail>(`/admin/orders/${id(orderId)}`, {
          method: "PATCH",
          json: { estimatedDeliveryDate },
          csrf: true,
        }),
      ),

    listFrames: () =>
      guard(async () => (await sendJson<{ frames: AdminFrame[] }>("/admin/frames")).frames),

    getFrame: (frameId: string) =>
      guard(() => sendJson<AdminFrame>(`/admin/frames/${id(frameId)}`)),

    createFrame: (fields: {
      name: string;
      widthMm: number;
      heightMm: number;
      priceCents: number;
      stock: number;
      photo: File;
    }) =>
      guard(() => {
        const form = new FormData();
        form.append("name", fields.name);
        form.append("widthMm", String(fields.widthMm));
        form.append("heightMm", String(fields.heightMm));
        form.append("priceCents", String(fields.priceCents));
        form.append("stock", String(fields.stock));
        form.append("photo", fields.photo);
        return sendJson<AdminFrame>("/admin/frames", { method: "POST", form, csrf: true });
      }),

    updateFrame: (frameId: string, changes: FrameUpdate) =>
      guard(() =>
        sendJson<AdminFrame>(`/admin/frames/${id(frameId)}`, {
          method: "PATCH",
          json: changes,
          csrf: true,
        }),
      ),

    replaceFramePhoto: (frameId: string, photo: File) =>
      guard(() => {
        const form = new FormData();
        form.append("photo", photo);
        return sendJson<AdminFrame>(`/admin/frames/${id(frameId)}/photo`, {
          method: "PUT",
          form,
          csrf: true,
        });
      }),

    adjustStock: (frameId: string, delta: number) =>
      guard(() =>
        sendJson<AdminFrame>(`/admin/frames/${id(frameId)}/stock-adjustments`, {
          method: "POST",
          json: { delta },
          csrf: true,
        }),
      ),

    getSettings: () => guard(() => sendJson<SettingsView>("/admin/settings")),

    updateSettings: (leadTimeWorkingDays: number) =>
      guard(() =>
        sendJson<SettingsView>("/admin/settings", {
          method: "PUT",
          json: { leadTimeWorkingDays },
          csrf: true,
        }),
      ),
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;

/** Where the order's original photo is shown from (admin only; an <img> sends the session cookie). */
export function orderPhotoUrl(orderId: string): string {
  return `/api/v1/admin/orders/${encodeURIComponent(orderId)}/photo`;
}
