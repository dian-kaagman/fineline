import { describe, expect, it } from "vitest";
import {
  isPreviewExpired,
  isSessionExpired,
  orderPhotoCutoff,
  previewExpiresAt,
  selectOrphanFiles,
} from "./retention.js";

describe("retention rules (BR-010, SR-012, SR-022)", () => {
  it("AC-011 a preview uploaded at 10:00 on Tuesday 3 November expires at 10:00 on Wednesday 4 November", () => {
    const uploaded = new Date("2026-11-03T09:00:00Z"); // 10:00 Amsterdam
    const expiresAt = previewExpiresAt(uploaded);
    expect(expiresAt.toISOString()).toBe("2026-11-04T09:00:00.000Z");
    expect(isPreviewExpired(expiresAt, new Date("2026-11-04T08:59:59Z"))).toBe(false);
    expect(isPreviewExpired(expiresAt, new Date("2026-11-04T09:00:00Z"))).toBe(true);
  });

  it("AC-012 an order shipped on 1 December 2026 has its photo deleted once 31 December has passed", () => {
    const shippedAt = new Date("2026-12-01T10:00:00Z");
    expect(orderPhotoCutoff(new Date("2026-12-30T23:00:00Z")) >= shippedAt).toBe(false);
    expect(orderPhotoCutoff(new Date("2026-12-31T23:00:00Z")) >= shippedAt).toBe(true);
  });

  it("selects only unreferenced files older than 24 hours as orphans", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const files = [
      { key: "photos/old-orphan", modifiedAt: new Date("2026-11-09T11:00:00Z") },
      { key: "photos/new-orphan", modifiedAt: new Date("2026-11-10T11:00:00Z") },
      { key: "drawings/referenced.svg", modifiedAt: new Date("2026-11-01T11:00:00Z") },
    ];
    expect(selectOrphanFiles(files, new Set(["drawings/referenced.svg"]), now)).toEqual([
      "photos/old-orphan",
    ]);
  });

  it("AC-063 ends a session after 8 hours idle and 24 hours after login, even when in use", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const idle = {
      createdAt: new Date("2026-11-10T03:00:00Z"),
      lastSeenAt: new Date("2026-11-10T03:59:00Z"),
    };
    expect(isSessionExpired(idle, now, 8)).toBe(true);
    const old = {
      createdAt: new Date("2026-11-09T11:59:00Z"),
      lastSeenAt: new Date("2026-11-10T11:30:00Z"),
    };
    expect(isSessionExpired(old, now, 8)).toBe(true);
    const fresh = {
      createdAt: new Date("2026-11-10T08:00:00Z"),
      lastSeenAt: new Date("2026-11-10T11:30:00Z"),
    };
    expect(isSessionExpired(fresh, now, 8)).toBe(false);
  });
});
