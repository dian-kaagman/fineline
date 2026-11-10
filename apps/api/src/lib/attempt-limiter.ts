import type { Clock } from "./clock.js";

/**
 * Counts attempts per key in a fixed window that starts at the first counted attempt (SR-011,
 * SR-017). An attempt is reserved *before* the expensive or guarded work runs, so parallel requests
 * can't all pass a check that is only counted afterwards; a reservation can be refunded when the
 * outcome should not count (a successful login, a replayed order).
 */
export interface Reservation {
  /** Undo the count, e.g. after a successful login. Safe to call more than once. */
  refund(): void;
}

export type ReserveResult =
  { ok: true; reservation: Reservation } | { ok: false; retryAfterSeconds: number };

interface Window {
  count: number;
  startMs: number;
}

const PRUNE_THRESHOLD = 10_000;

export class AttemptLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly clock: Clock,
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  reserve(key: string): ReserveResult {
    const now = this.clock().getTime();
    let window = this.windows.get(key);
    if (!window || window.startMs + this.windowMs <= now) {
      this.prune(now);
      window = { count: 0, startMs: now };
      this.windows.set(key, window);
    }
    if (window.count >= this.max) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((window.startMs + this.windowMs - now) / 1000)),
      };
    }
    window.count += 1;
    const counted = window;
    let refunded = false;
    return {
      ok: true,
      reservation: {
        refund: () => {
          // Only refund into the window the attempt was counted in.
          if (!refunded && this.windows.get(key) === counted && counted.count > 0)
            counted.count -= 1;
          refunded = true;
        },
      },
    };
  }

  private prune(now: number): void {
    if (this.windows.size < PRUNE_THRESHOLD) return;
    for (const [k, w] of this.windows) if (w.startMs + this.windowMs <= now) this.windows.delete(k);
  }
}

/** Reserves on every limiter in order; refunds the earlier ones when a later one refuses. */
export function reserveAll(entries: { limiter: AttemptLimiter; key: string }[]): ReserveResult {
  const taken: Reservation[] = [];
  for (const { limiter, key } of entries) {
    const result = limiter.reserve(key);
    if (!result.ok) {
      taken.forEach((r) => r.refund());
      return result;
    }
    taken.push(result.reservation);
  }
  return { ok: true, reservation: { refund: () => taken.forEach((r) => r.refund()) } };
}

/**
 * Runs at most one task at a time with a short queue; when the queue is full, `run` returns
 * `{ busy: true }` at once instead of waiting (SR-010: one scrypt verification at a time).
 */
export class SingleFlightQueue {
  private running = false;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly maxWaiting: number) {}

  async run<T>(task: () => Promise<T>): Promise<{ busy: true } | { busy: false; value: T }> {
    if (this.running) {
      if (this.waiting.length >= this.maxWaiting) return { busy: true };
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    this.running = true;
    try {
      return { busy: false, value: await task() };
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running = false;
    }
  }
}
