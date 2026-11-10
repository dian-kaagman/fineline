import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Clock } from "./clock.js";
import { rateLimited } from "./errors.js";

/**
 * Rate limits (SR-011, SR-017). The numbers live here, in one place, to tune after launch (Q-36).
 * Windows are fixed and start at the first counted request from a key, so "10 uploads between 09:00
 * and 09:40" refuses the 11th until 10:00.
 */
export const LIMITS = {
  drawingsPerIp: { max: 10, timeWindow: 3_600_000 },
  drawingsGlobal: { max: 60, timeWindow: 3_600_000 },
  ordersPerIp: { max: 5, timeWindow: 3_600_000 },
  loginFailuresPerIp: { max: 5, timeWindow: 15 * 60_000 },
  loginFailuresGlobal: { max: 100, timeWindow: 3_600_000 },
} as const;

type Callback = (err: Error | null, res: { current: number; ttl: number }) => void;

interface Entry {
  current: number;
  startMs: number;
}

/**
 * In-memory store for @fastify/rate-limit with the same semantics as its LocalStore, reading time
 * from the injected clock. Single instance only (design: one API process).
 */
export function clockedStore(clock: Clock) {
  return class ClockedStore {
    private readonly entries = new Map<string, Entry>();

    incr(key: string, cb: Callback, timeWindow: number): void {
      const now = clock().getTime();
      const entry = this.entries.get(key);
      if (!entry || entry.startMs + timeWindow <= now) {
        this.prune(now, timeWindow);
        this.entries.set(key, { current: 1, startMs: now });
        cb(null, { current: 1, ttl: timeWindow });
        return;
      }
      entry.current += 1;
      cb(null, { current: entry.current, ttl: entry.startMs + timeWindow - now });
    }

    read(key: string, cb: Callback, timeWindow: number): void {
      const now = clock().getTime();
      const entry = this.entries.get(key);
      if (!entry || entry.startMs + timeWindow <= now) {
        cb(null, { current: 0, ttl: 0 });
        return;
      }
      cb(null, { current: entry.current, ttl: entry.startMs + timeWindow - now });
    }

    child(): ClockedStore {
      return new ClockedStore();
    }

    private prune(now: number, timeWindow: number): void {
      if (this.entries.size < 10_000) return;
      for (const [k, e] of this.entries) if (e.startMs + timeWindow <= now) this.entries.delete(k);
    }
  };
}

type Limiter = ReturnType<FastifyInstance["createRateLimit"]>;

/**
 * An onRequest hook that applies the limiters in order and answers 429 `rate_limited` with
 * Retry-After from the first one exceeded. A request refused by an earlier limiter is not counted by
 * later ones (one client can't use up the global upload cap).
 */
export function rateLimitHook(limiters: Limiter[], message: (wait: number) => string) {
  return async (request: FastifyRequest) => {
    for (const limiter of limiters) {
      const result = await limiter(request);
      if (!result.isAllowed && result.isExceeded) {
        request.log.warn(
          { event: "rate_limited", route: request.routeOptions.url, ip: request.ip },
          "rate limited",
        );
        throw rateLimited(message(result.ttlInSeconds), result.ttlInSeconds);
      }
    }
  };
}
