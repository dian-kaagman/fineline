import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { csrfFailed, unauthenticated } from "../../lib/errors.js";
import { noStore } from "../../lib/http.js";
import { LIMITS } from "../../lib/rate-limit.js";
import { parseOrThrow } from "../../lib/validation.js";
import type { AuthService, LoginThrottle } from "./auth.service.js";

export const ADMIN_PREFIX = "/api/v1/admin";
export const SESSION_COOKIE = "fineline_admin";
export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "fineline";
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const loginBody = z.strictObject({
  username: z.string({ error: "Enter your username" }).min(1, "Enter your username").max(200),
  password: z.string({ error: "Enter your password" }).min(1, "Enter your password").max(200),
});

function isLogin(request: FastifyRequest): boolean {
  return request.method === "POST" && request.routeOptions.url === `${ADMIN_PREFIX}/session`;
}

/** Failed-login counters on @fastify/rate-limit's store: read before scrypt, counted on failure. */
function createLoginThrottle(app: FastifyInstance): (request: FastifyRequest) => LoginThrottle {
  const limiters = [
    {
      limiter: app.createRateLimit({
        ...LIMITS.loginFailuresPerIp,
        keyGenerator: (r) => `login:${r.ip}`,
      }),
    },
    {
      limiter: app.createRateLimit({
        ...LIMITS.loginFailuresGlobal,
        keyGenerator: () => "login:all",
      }),
    },
  ];
  return (request) => ({
    async retryAfter() {
      for (const { limiter } of limiters) {
        const state = await limiter(request, { increment: false });
        if (!state.isAllowed && state.remaining === 0) return state.ttlInSeconds;
      }
      return null;
    },
    async recordFailure() {
      for (const { limiter } of limiters) await limiter(request);
    },
  });
}

export interface AdminPluginOptions {
  auth: AuthService;
  adminUsername: string;
  cookieSecure: boolean;
  /** Admin route plugins (orders, frames, settings), all registered behind the hooks below. */
  routes: FastifyPluginAsync[];
}

/**
 * Every admin route lives in this one encapsulated plugin (SR-014). Its onRequest hook runs before
 * body parsing: authentication first (401), then the CSRF header on unsafe methods (403). Only
 * login is exempt from authentication, and it still needs the header (SR-013).
 */
export function adminPlugin(options: AdminPluginOptions): FastifyPluginAsync {
  const { auth, adminUsername, cookieSecure } = options;
  const cookieOptions = {
    httpOnly: true,
    sameSite: "strict" as const,
    path: ADMIN_PREFIX,
    secure: cookieSecure,
  };

  return async function (app) {
    const throttleFor = createLoginThrottle(app);

    app.addHook("onRequest", noStore);
    app.addHook("onRequest", async (request) => {
      if (!isLogin(request)) {
        const ok = await auth.authenticate(request.cookies[SESSION_COOKIE]);
        if (!ok) {
          request.log.warn(
            { event: "admin_unauthenticated", route: request.routeOptions.url, ip: request.ip },
            "unauthenticated admin request",
          );
          throw unauthenticated();
        }
      }
      if (UNSAFE_METHODS.has(request.method) && request.headers[CSRF_HEADER] !== CSRF_VALUE) {
        request.log.warn(
          { event: "csrf_failed", route: request.routeOptions.url, ip: request.ip },
          "admin request without CSRF header",
        );
        throw csrfFailed();
      }
    });

    app.post("/session", async (request, reply) => {
      const { username, password } = parseOrThrow(loginBody, request.body);
      const { sessionId, maxAgeSeconds } = await auth.login(
        {
          username,
          password,
          clientIp: request.ip,
          presentedSessionId: request.cookies[SESSION_COOKIE],
        },
        throttleFor(request),
        request.log,
      );
      reply.setCookie(SESSION_COOKIE, sessionId, { ...cookieOptions, maxAge: maxAgeSeconds });
      return { username: adminUsername };
    });

    app.get("/session", async () => ({ username: adminUsername }));

    app.delete("/session", async (request, reply) => {
      await auth.logout(request.cookies[SESSION_COOKIE]);
      reply.setCookie(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
      return reply.status(204).send();
    });

    for (const routes of options.routes) await app.register(routes);
  };
}
