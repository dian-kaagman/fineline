import { describe, expect, it } from "vitest";
import {
  allowedNextStatuses,
  canSetStatus,
  canTransition,
  ORDER_STATUSES,
  statusAfterArmDownload,
} from "./order-status.js";

describe("order status state machine (BR-009)", () => {
  it("AC-033 moves one step forward from drawing to shipped", () => {
    expect(canSetStatus("drawing", "drawn")).toBe(true);
    expect(canSetStatus("drawn", "ready_to_ship")).toBe(true);
    expect(canSetStatus("ready_to_ship", "shipped")).toBe(true);
  });

  it("AC-034 rejects skipping, going back and cancelling a drawn order", () => {
    expect(canSetStatus("received", "shipped")).toBe(false);
    expect(canSetStatus("drawn", "drawing")).toBe(false);
    expect(canSetStatus("drawn", "cancelled")).toBe(false);
    expect(canSetStatus("ready_to_ship", "cancelled")).toBe(false);
  });

  it("AC-036 shipped and cancelled are final", () => {
    for (const to of ORDER_STATUSES) {
      expect(canTransition("shipped", to)).toBe(false);
      expect(canTransition("cancelled", to)).toBe(false);
    }
    expect(allowedNextStatuses("shipped")).toEqual([]);
    expect(allowedNextStatuses("cancelled")).toEqual([]);
  });

  it("offers received -> drawing only through the download for the arm", () => {
    expect(canTransition("received", "drawing")).toBe(true);
    expect(canSetStatus("received", "drawing")).toBe(false);
    expect(allowedNextStatuses("received")).toEqual(["cancelled"]);
    expect(allowedNextStatuses("drawing")).toEqual(["drawn", "cancelled"]);
  });

  it("AC-031 AC-032 downloading for the arm moves only a received order", () => {
    expect(statusAfterArmDownload("received")).toBe("drawing");
    for (const s of ["drawing", "drawn", "ready_to_ship", "shipped", "cancelled"] as const) {
      expect(statusAfterArmDownload(s)).toBe(s);
    }
  });
});
