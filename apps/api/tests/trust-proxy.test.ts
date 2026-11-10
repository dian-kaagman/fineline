import { describe, expect, it } from "vitest";
import { useHarness } from "./helpers/harness.js";

// Behind nginx (TRUST_PROXY=1), which overwrites X-Forwarded-For with the real client address.
const h = useHarness({ config: (c) => ({ ...c, trustProxy: 1 }) });

const upload = (forwardedFor: string) =>
  h.request({
    method: "POST",
    url: "/api/v1/drawings",
    remoteAddress: "172.18.0.5", // nginx
    headers: { "x-forwarded-for": forwardedFor },
    payload: {},
  });

describe("client address behind the proxy (SR-017)", () => {
  it("AC-057 counts uploads per client address from nginx's X-Forwarded-For, not per proxy", async () => {
    for (let i = 0; i < 10; i++) expect((await upload("203.0.113.1")).statusCode).toBe(400);
    expect((await upload("203.0.113.1")).statusCode).toBe(429);
    // Another customer behind the same nginx is not affected.
    expect((await upload("203.0.113.2")).statusCode).toBe(400);
  });
});
