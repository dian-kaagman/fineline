import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type RouteOptions } from "fastify";
import type { Logger } from "pino";
import type { Config } from "./config.js";
import type { Database } from "./db/client.js";
import { systemClock, type Clock } from "./lib/clock.js";
import { errorHandler, notFoundHandler } from "./lib/http.js";
import { createLogger } from "./lib/logger.js";
import { verifyPassword as scryptVerify } from "./lib/password-hash.js";
import { clockedStore } from "./lib/rate-limit.js";
import { ADMIN_PREFIX, adminPlugin } from "./modules/admin/admin.plugin.js";
import { createAuthService, type PasswordVerifier } from "./modules/admin/auth.service.js";
import { drawingsRoutes } from "./modules/drawings/drawings.routes.js";
import { createDrawingsService } from "./modules/drawings/drawings.service.js";
import { adminFramesRoutes, publicFramesRoutes } from "./modules/frames/frames.routes.js";
import { createFramesService } from "./modules/frames/frames.service.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { createAdminOrdersService } from "./modules/orders/admin-orders.service.js";
import { adminOrdersRoutes, publicOrdersRoutes } from "./modules/orders/orders.routes.js";
import { createOrdersService } from "./modules/orders/orders.service.js";
import {
  createRetentionService,
  type RetentionService,
} from "./modules/retention/retention.service.js";
import { adminSettingsRoutes } from "./modules/settings/settings.routes.js";
import { createSettingsService } from "./modules/settings/settings.service.js";
import type { FileStorage } from "./storage/file-storage.js";
import { ConversionLimiter, type ConversionClient } from "./worker/worker-client.js";

/** 64 KiB for JSON bodies (SR-001); multipart uploads have their own streamed limits. */
const JSON_BODY_LIMIT = 64 * 1024;

export interface AppDeps {
  config: Config;
  db: Database;
  storage: FileStorage;
  worker: ConversionClient;
  clock?: Clock;
  logger?: Logger;
  verifyPassword?: PasswordVerifier;
  /** Called for every registered route (tests enumerate the admin routes, SR-014). */
  onRoute?: (route: RouteOptions) => void;
}

/** Trust exactly `hops` proxies in front of the API (nginx: 1), so X-Forwarded-For can't be spoofed (SR-017). */
function hopCount(hops: number) {
  return (_address: string, hopIndex: number) => hopIndex < hops;
}

export interface App {
  app: FastifyInstance;
  retention: RetentionService;
}

/** Builds the API without listening (tests use inject). */
export async function buildApp(deps: AppDeps): Promise<App> {
  const { config, db, storage, worker } = deps;
  const clock = deps.clock ?? systemClock;
  // Typed as Fastify's logger so the instance keeps Fastify's default generics.
  const logger: FastifyBaseLogger = deps.logger ?? createLogger(config.logLevel);

  const app = Fastify({
    loggerInstance: logger,
    trustProxy:
      typeof config.trustProxy === "number" ? hopCount(config.trustProxy) : config.trustProxy,
    bodyLimit: JSON_BODY_LIMIT,
    // Bounds slow uploads when the API is reached directly (nginx has its own body timeout).
    requestTimeout: 120_000,
  });
  if (deps.onRoute) app.addHook("onRoute", deps.onRoute);

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);
  app.addHook("onSend", async (_request, reply) => {
    reply.header("x-content-type-options", "nosniff");
  });

  // JSON parser that accepts an empty body (bodyless POST/DELETE with a JSON content type).
  const defaultJson = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser("application/json");
  // JSON only: a text/plain "order" answers 415 like any other wrong content type (contract).
  app.removeContentTypeParser("text/plain");
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string", bodyLimit: JSON_BODY_LIMIT },
    (request, body, done) => {
      if (body === "") done(null, undefined);
      else void defaultJson(request, body as string, done);
    },
  );

  await app.register(cookie);
  // Conservative defaults; each upload route passes its own limits (SR-001).
  await app.register(multipart, {
    throwFileSizeLimit: true,
    limits: { files: 1, fileSize: 1024, fields: 0, parts: 1 },
  });
  await app.register(rateLimit, { global: false, store: clockedStore(clock) });
  if (config.corsOrigin) {
    // Split-origin development only; in production web and API share one origin (SR-013).
    await app.register(cors, { origin: config.corsOrigin, credentials: true });
  }

  const services = {
    drawings: createDrawingsService({
      config,
      db,
      storage,
      worker,
      limiter: new ConversionLimiter(config.worker.maxConcurrent),
      clock,
    }),
    frames: createFramesService({ db, storage, clock, drawingArea: config.drawingArea }),
    orders: createOrdersService({ db, clock }),
    adminOrders: createAdminOrdersService({ db, storage, clock }),
    settings: createSettingsService({ db, clock, drawingArea: config.drawingArea }),
    auth: createAuthService({
      db,
      clock,
      admin: config.admin,
      sessionIdleHours: config.sessionIdleHours,
      verifyPassword: deps.verifyPassword ?? scryptVerify,
    }),
  };

  await app.register(healthRoutes(db));
  await app.register(drawingsRoutes(services.drawings));
  await app.register(publicFramesRoutes(services.frames));
  await app.register(publicOrdersRoutes(services.orders, clock));
  await app.register(
    adminPlugin({
      auth: services.auth,
      adminUsername: config.admin.username,
      cookieSecure: config.cookieSecure,
      routes: [
        adminOrdersRoutes(services.adminOrders),
        adminFramesRoutes(services.frames),
        adminSettingsRoutes(services.settings),
      ],
    }),
    { prefix: ADMIN_PREFIX },
  );

  const retention = createRetentionService({
    db,
    storage,
    clock,
    sessionIdleHours: config.sessionIdleHours,
    log: app.log,
  });

  return { app, retention };
}
