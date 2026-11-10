import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hashPassword, parsePasswordHash, verifyPassword } from "./password-hash.js";

const script = fileURLToPath(new URL("../scripts/hash-password.ts", import.meta.url));

function runScript(input: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile("npx", ["tsx", script], (error, stdout, stderr) => {
      resolve({ code: error ? (error.code as number) : 0, stdout, stderr });
    });
    child.stdin?.end(input);
  });
}

describe("admin password hashing (SR-010)", () => {
  it("hashes in the $-free scrypt format and verifies in constant time", async () => {
    const hash = await hashPassword("pen-and-paper-2026");
    expect(hash).toMatch(/^scrypt:17:8:1:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{43}$/);
    expect(hash).not.toContain("$");
    const parsed = parsePasswordHash(hash)!;
    expect(await verifyPassword("pen-and-paper-2026", parsed)).toBe(true);
    expect(await verifyPassword("pen-and-paper-2025", parsed)).toBe(false);
  });

  it("the hash-password script reads stdin, refuses short passwords and prints a valid hash", async () => {
    const short = await runScript("short-pass\n");
    expect(short.code).toBe(1);
    expect(short.stderr).toContain("at least 12 characters");
    const ok = await runScript("pen-and-paper-2026\n");
    expect(ok.code).toBe(0);
    expect(parsePasswordHash(ok.stdout.trim())).not.toBeNull();
  });
});
