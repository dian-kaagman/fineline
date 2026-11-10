import type { AdminFrame, OrderDetail, OrderSummary, SettingsView } from "../api/admin";
import type { DrawingPreview, OrderConfirmation, PublicFrame } from "../api/shop";

export const DRAWING_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="180mm" height="267mm" viewBox="0 0 180 267"><path d="M10 10 L170 257" fill="none" stroke="#000000"/></svg>';

export function drawingPreview(overrides: Partial<DrawingPreview> = {}): DrawingPreview {
  return {
    drawingId: "6f1c6c0e-1a2b-4c3d-8e9f-0a1b2c3d4e5f",
    previewToken: "token-first-0123456789abcdefghijklmnopqrstuvwxyz",
    svg: DRAWING_SVG,
    widthMm: 180,
    heightMm: 267,
    strokeCount: 812,
    totalLengthMm: 14250.5,
    expiresAt: "2099-11-04T09:00:00Z",
    ...overrides,
  };
}

export const OAK: PublicFrame = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Oak A4",
  widthMm: 210,
  heightMm: 297,
  priceCents: 4995,
  photoUrl: "/api/v1/frames/11111111-1111-4111-8111-111111111111/photo",
};

export const WALNUT: PublicFrame = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Walnut 30x40",
  widthMm: 300,
  heightMm: 400,
  priceCents: 6995,
  photoUrl: "/api/v1/frames/22222222-2222-4222-8222-222222222222/photo",
};

export function confirmation(overrides: Partial<OrderConfirmation> = {}): OrderConfirmation {
  return {
    orderNumber: "FL-2026-0042",
    estimatedDeliveryDate: "2026-11-17",
    frameName: "Oak A4",
    priceCents: 4995,
    customerName: "Anna de Vries",
    address: {
      street: "Lindelaan",
      houseNumber: "12",
      postalCode: "3512 AB",
      city: "Utrecht",
      country: "NL",
    },
    ...overrides,
  };
}

export function jpeg(name = "photo.jpg", size = 2 * 1024 * 1024, type = "image/jpeg"): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

export function orderSummary(overrides: Partial<OrderSummary> = {}): OrderSummary {
  return {
    id: "aaaaaaaa-0042-4000-8000-000000000042",
    orderNumber: "FL-2026-0042",
    status: "received",
    orderDate: "2026-11-06",
    estimatedDeliveryDate: "2026-11-17",
    customerName: "Anna de Vries",
    frameName: "Oak A4",
    createdAt: "2026-11-06T13:00:00Z",
    ...overrides,
  };
}

export function orderDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  const status = overrides.status ?? "received";
  const allowed: Record<string, OrderDetail["allowedNextStatuses"]> = {
    received: ["cancelled"],
    drawing: ["drawn", "cancelled"],
    drawn: ["ready_to_ship"],
    ready_to_ship: ["shipped"],
    shipped: [],
    cancelled: [],
  };
  return {
    ...orderSummary(),
    customerEmail: "anna@example.nl",
    address: {
      street: "Lindelaan",
      houseNumber: "12",
      postalCode: "3512 AB",
      city: "Utrecht",
      country: "NL",
    },
    frameId: OAK.id,
    priceCents: 4995,
    drawing: { widthMm: 180, heightMm: 267, strokeCount: 812, totalLengthMm: 14250.5 },
    photoAvailable: true,
    allowedNextStatuses: allowed[status] ?? [],
    statusChangedAt: "2026-11-06T13:00:00Z",
    ...overrides,
  };
}

export function adminFrame(overrides: Partial<AdminFrame> = {}): AdminFrame {
  return {
    ...OAK,
    stock: 3,
    createdAt: "2026-10-01T10:00:00Z",
    updatedAt: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

export const SETTINGS: SettingsView = {
  leadTimeWorkingDays: 7,
  drawingAreaWidthMm: 180,
  drawingAreaHeightMm: 267,
};
