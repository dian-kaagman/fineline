import type { FastifyInstance } from "fastify";
import { waitText } from "../../lib/errors.js";
import { noStore, sendFile } from "../../lib/http.js";
import { LIMITS, rateLimitHook } from "../../lib/rate-limit.js";
import { parseIdParam } from "../../lib/validation.js";
import type { AdminOrdersService } from "./admin-orders.service.js";
import { parsePlaceOrder } from "./orders.schemas.js";
import type { OrdersService } from "./orders.service.js";

export function publicOrdersRoutes(service: OrdersService) {
  return async function (app: FastifyInstance) {
    const limit = rateLimitHook(
      [app.createRateLimit(LIMITS.ordersPerIp)],
      (wait) => `Too many tries in a short time. Please wait ${waitText(wait)} and try again.`,
    );

    app.post("/api/v1/orders", { onRequest: [noStore, limit] }, async (request, reply) => {
      const input = parsePlaceOrder(request.body);
      const { replay, confirmation } = await service.placeOrder(input, request.log);
      return reply.status(replay ? 200 : 201).send(confirmation);
    });
  };
}

const orderId = (params: unknown) =>
  parseIdParam(params, "orderId", "order_not_found", "This order does not exist.");
const FILE_CACHE = "private, no-store";

/** Registered inside the admin plugin (prefix /api/v1/admin). */
export function adminOrdersRoutes(service: AdminOrdersService) {
  return async function (app: FastifyInstance) {
    app.get("/orders", async (request) => ({ orders: await service.list(request.query) }));

    app.get("/orders/:orderId", async (request) => service.get(orderId(request.params)));

    app.patch("/orders/:orderId", async (request) =>
      service.changeDeliveryDate(orderId(request.params), request.body),
    );

    app.get("/orders/:orderId/drawing.svg", async (request, reply) => {
      const file = await service.drawingSvg(orderId(request.params));
      return sendFile(reply, file.data, "image/svg+xml", {
        attachmentName: file.fileName,
        cacheControl: FILE_CACHE,
      });
    });

    app.post("/orders/:orderId/drawing-download", async (request, reply) => {
      const file = await service.downloadForArm(orderId(request.params), request.log);
      return sendFile(reply, file.data, "image/svg+xml", {
        attachmentName: file.fileName,
        cacheControl: FILE_CACHE,
      });
    });

    app.get("/orders/:orderId/photo", async (request, reply) => {
      const file = await service.photo(orderId(request.params));
      return sendFile(reply, file.data, file.contentType, {
        attachmentName: file.fileName,
        cacheControl: FILE_CACHE,
      });
    });

    app.post("/orders/:orderId/status", async (request) =>
      service.changeStatus(orderId(request.params), request.body, request.log),
    );
  };
}
