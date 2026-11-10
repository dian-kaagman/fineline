import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Preview tokens (SR-009): 256 random bits, base64url; only the SHA-256 hash is stored. */

export function newPreviewToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPreviewToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * A hash that matches no token, compared against when the drawing is unknown, so an unknown ID
 * costs the same work as a wrong token.
 */
export const NO_MATCH_HASH = "0".repeat(64);

export function previewTokenMatches(token: string, storedHash: string): boolean {
  const given = Buffer.from(hashPreviewToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return stored.length === given.length && timingSafeEqual(given, stored);
}
