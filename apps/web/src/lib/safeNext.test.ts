import { describe, expect, it } from "vitest";
import { loginPathFor, safeAdminNext } from "./safeNext";

const ORIGIN = "https://shop.example";

describe("UX-023 login return path", () => {
  it.each([
    ["/admin/settings", "/admin/settings"],
    ["/admin/orders?status=received", "/admin/orders?status=received"],
    [
      "/admin/orders/aaaaaaaa-0042-4000-8000-000000000042",
      "/admin/orders/aaaaaaaa-0042-4000-8000-000000000042",
    ],
  ])("follows the same-origin admin path %j", (next, expected) => {
    expect(safeAdminNext(next, ORIGIN)).toBe(expected);
  });

  it.each([
    "https://evil.example/admin/orders",
    "//evil.example/admin/orders",
    "/\\evil.example",
    "/admin/../../evil",
    "/",
    "/admin",
    "/admin/login",
    "javascript:alert(1)",
    "",
    null,
  ])("ignores %j", (next) => {
    expect(safeAdminNext(next, ORIGIN)).toBeNull();
  });

  it("builds the login URL with the encoded path", () => {
    expect(loginPathFor("/admin/settings")).toBe("/admin/login?next=%2Fadmin%2Fsettings");
  });
});
