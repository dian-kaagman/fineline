import { describe, expect, it } from "vitest";
import { AttemptLimiter, reserveAll, SingleFlightQueue } from "./attempt-limiter.js";

describe("AttemptLimiter (SR-011, SR-017)", () => {
  it("allows max attempts per fixed window from the first one, with the wait until it ends", () => {
    let now = new Date("2026-11-06T09:00:00Z");
    const limiter = new AttemptLimiter(() => now, 5, 15 * 60_000);
    for (let i = 0; i < 5; i++) {
      expect(limiter.reserve("a").ok).toBe(true);
      now = new Date(now.getTime() + 60_000);
    }
    now = new Date("2026-11-06T09:05:00Z");
    expect(limiter.reserve("a")).toEqual({ ok: false, retryAfterSeconds: 600 });
    expect(limiter.reserve("b").ok).toBe(true);
    now = new Date("2026-11-06T09:15:00Z");
    expect(limiter.reserve("a").ok).toBe(true);
  });

  it("refunds a reservation once, and only into its own window", () => {
    let now = new Date("2026-11-06T09:00:00Z");
    const limiter = new AttemptLimiter(() => now, 1, 60_000);
    const first = limiter.reserve("a");
    if (!first.ok) throw new Error("expected ok");
    first.reservation.refund();
    first.reservation.refund();
    const second = limiter.reserve("a");
    expect(second.ok).toBe(true);
    expect(limiter.reserve("a").ok).toBe(false);
    now = new Date("2026-11-06T09:02:00Z");
    if (second.ok) second.reservation.refund(); // old window: no effect on the new one
    expect(limiter.reserve("a").ok).toBe(true);
    expect(limiter.reserve("a").ok).toBe(false);
  });

  it("reserveAll refunds earlier limiters when a later one refuses", () => {
    const now = new Date();
    const perKey = new AttemptLimiter(() => now, 5, 60_000);
    const global = new AttemptLimiter(() => now, 1, 60_000);
    expect(
      reserveAll([
        { limiter: perKey, key: "a" },
        { limiter: global, key: "all" },
      ]).ok,
    ).toBe(true);
    expect(
      reserveAll([
        { limiter: perKey, key: "a" },
        { limiter: global, key: "all" },
      ]).ok,
    ).toBe(false);
    for (let i = 0; i < 4; i++) expect(perKey.reserve("a").ok).toBe(true);
    expect(perKey.reserve("a").ok).toBe(false);
  });
});

describe("SingleFlightQueue (SR-010)", () => {
  it("runs one task at a time, queues a few and turns the rest away", async () => {
    const queue = new SingleFlightQueue(1);
    let running = 0;
    let max = 0;
    const task = async () => {
      running += 1;
      max = Math.max(max, running);
      await new Promise((r) => setTimeout(r, 20));
      running -= 1;
      return "done";
    };
    const results = await Promise.all([queue.run(task), queue.run(task), queue.run(task)]);
    expect(max).toBe(1);
    expect(results).toEqual([
      { busy: false, value: "done" },
      { busy: false, value: "done" },
      { busy: true },
    ]);
    expect(await queue.run(task)).toEqual({ busy: false, value: "done" });
  });
});
