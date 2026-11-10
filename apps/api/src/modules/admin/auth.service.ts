import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { Database } from "../../db/client.js";
import { isSessionExpired, SESSION_ABSOLUTE_LIFETIME_MS } from "../../domain/retention.js";
import type { Clock } from "../../lib/clock.js";
import { AttemptLimiter, reserveAll, SingleFlightQueue } from "../../lib/attempt-limiter.js";
import { AppError, rateLimited, waitText } from "../../lib/errors.js";
import { LIMITS } from "../../lib/rate-limit.js";
import type { ParsedPasswordHash } from "../../lib/password-hash.js";
import { deleteSession, findSession, insertSession, touchSession } from "./sessions.repository.js";

/**
 * Admin authentication (BR-011, ADR 0003, SR-010..SR-012): one admin from the environment, scrypt
 * password check, server-side sessions of which only the SHA-256 of the random ID is stored.
 */

export type PasswordVerifier = (password: string, hash: ParsedPasswordHash) => Promise<boolean>;

export interface AuthServiceDeps {
  db: Database;
  clock: Clock;
  admin: { username: string; passwordHash: ParsedPasswordHash };
  sessionIdleHours: number;
  verifyPassword: PasswordVerifier;
}

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest();
const hashSessionId = (id: string) => sha256(id).toString("hex");

export const invalidCredentials = () =>
  new AppError(401, "invalid_credentials", "Wrong username or password.");

export function createAuthService(deps: AuthServiceDeps) {
  const { db, clock, admin, sessionIdleHours, verifyPassword } = deps;
  const expectedUsername = sha256(admin.username);
  // Login attempts are counted before scrypt runs (SR-011); a successful login is refunded.
  const attemptsPerIp = new AttemptLimiter(
    clock,
    LIMITS.loginAttemptsPerIp.max,
    LIMITS.loginAttemptsPerIp.timeWindow,
  );
  const attemptsGlobal = new AttemptLimiter(
    clock,
    LIMITS.loginAttemptsGlobal.max,
    LIMITS.loginAttemptsGlobal.timeWindow,
  );
  // One scrypt verification (128 MiB) at a time, with a short queue (SR-010 amended).
  const verification = new SingleFlightQueue(LIMITS.loginVerificationQueue);

  return {
    /**
     * Checks the throttle before scrypt runs, compares username and password in constant time
     * (scrypt runs even for a wrong username), and starts a new session; any session the browser
     * presented is ended (no fixation).
     */
    async login(
      input: {
        username: string;
        password: string;
        clientIp: string;
        presentedSessionId: string | undefined;
      },
      log: FastifyBaseLogger,
    ): Promise<{ sessionId: string; maxAgeSeconds: number }> {
      const attempt = reserveAll([
        { limiter: attemptsPerIp, key: input.clientIp },
        { limiter: attemptsGlobal, key: "all" },
      ]);
      if (!attempt.ok) {
        log.warn(
          { event: "login_throttled", ip: input.clientIp },
          "login refused by the attempt limit",
        );
        throw rateLimited(
          `Too many login attempts. Please wait ${waitText(attempt.retryAfterSeconds)} and try again.`,
          attempt.retryAfterSeconds,
        );
      }

      const outcome = await verification.run(async () => {
        const usernameOk = timingSafeEqual(sha256(input.username), expectedUsername);
        // scrypt runs even for a wrong username, so both answers take the same time.
        const passwordOk = await verifyPassword(input.password, admin.passwordHash);
        return usernameOk && passwordOk;
      });
      if (outcome.busy) {
        attempt.reservation.refund();
        log.warn(
          { event: "login_busy", ip: input.clientIp },
          "login refused: another login is being checked",
        );
        throw rateLimited(
          "Too many login attempts at once. Please wait a moment and try again.",
          1,
        );
      }
      if (!outcome.value) {
        log.warn({ event: "login_failed", ip: input.clientIp }, "failed admin login");
        throw invalidCredentials();
      }
      attempt.reservation.refund();

      if (input.presentedSessionId)
        await deleteSession(db, hashSessionId(input.presentedSessionId));
      const sessionId = randomBytes(32).toString("base64url");
      const now = clock();
      await insertSession(db, {
        idHash: hashSessionId(sessionId),
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_LIFETIME_MS),
      });
      log.info({ event: "login_succeeded" }, "admin logged in");
      return { sessionId, maxAgeSeconds: SESSION_ABSOLUTE_LIFETIME_MS / 1000 };
    },

    /** True for a live session (idle 8 h and absolute 24 h checked server-side); slides the idle timer. */
    async authenticate(sessionId: string | undefined): Promise<boolean> {
      if (!sessionId || sessionId.length > 200) return false;
      const idHash = hashSessionId(sessionId);
      const session = await findSession(db, idHash);
      if (!session) return false;
      const now = clock();
      if (isSessionExpired(session, now, sessionIdleHours)) {
        await deleteSession(db, idHash);
        return false;
      }
      await touchSession(db, idHash, now);
      return true;
    },

    async logout(sessionId: string | undefined): Promise<void> {
      if (sessionId) await deleteSession(db, hashSessionId(sessionId));
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
