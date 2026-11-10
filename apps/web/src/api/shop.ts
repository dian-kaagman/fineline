// Customer (public) API calls.
import { send, sendJson } from "./client";
import type { components } from "./schema";

export type DrawingPreview = components["schemas"]["DrawingPreview"];
export type PublicFrame = components["schemas"]["PublicFrame"];
export type PlaceOrderRequest = components["schemas"]["PlaceOrderRequest"];
export type OrderConfirmation = components["schemas"]["OrderConfirmation"];
export type Address = components["schemas"]["Address"];

/** POST /drawings: one photo in, the drawing preview out. No timeout of our own (F3b). */
export function createDrawing(photo: File, signal?: AbortSignal): Promise<DrawingPreview> {
  const form = new FormData();
  form.append("photo", photo);
  return sendJson<DrawingPreview>("/drawings", { method: "POST", form, signal });
}

export async function listFrames(signal?: AbortSignal): Promise<PublicFrame[]> {
  const body = await sendJson<{ frames: PublicFrame[] }>("/frames", { signal });
  return body.frames;
}

/** POST /orders. 201 is a new order, 200 the original confirmation of a replay (BR-018); both look the same. */
export async function placeOrder(request: PlaceOrderRequest): Promise<OrderConfirmation> {
  const response = await send("/orders", { method: "POST", json: request });
  return (await response.json()) as OrderConfirmation;
}
