import type { FastifyInstance } from "fastify";
import type { SettingsService } from "./settings.service.js";

/** Registered inside the admin plugin (prefix /api/v1/admin). */
export function adminSettingsRoutes(service: SettingsService) {
  return async function (app: FastifyInstance) {
    app.get("/settings", async () => service.get());
    app.put("/settings", async (request) => service.update(request.body));
  };
}
