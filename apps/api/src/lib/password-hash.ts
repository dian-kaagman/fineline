import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Admin password hashing (SR-010, ADR 0003).
 *
 * Format: `scrypt:<log2 N>:<r>:<p>:<salt base64url>:<hash base64url>`. No `$`, so `.env` files and
 * Docker Compose interpolation leave it intact.
 */

export const SCRYPT_LOG2_N = 17;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const MIN_LOG2_N = 17;
const MAX_LOG2_N = 20;
export const MIN_PASSWORD_LENGTH = 12;

export interface ParsedPasswordHash {
  log2N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** Returns the parsed hash, or null when the string is not a valid hash in our format. */
export function parsePasswordHash(value: string): ParsedPasswordHash | null {
  const parts = value.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [, n, r, p, salt, hash] = parts as [string, string, string, string, string, string];
  if (!/^\d+$/.test(n) || !/^\d+$/.test(r) || !/^\d+$/.test(p)) return null;
  const log2N = Number(n);
  const rNum = Number(r);
  const pNum = Number(p);
  if (log2N < MIN_LOG2_N || log2N > MAX_LOG2_N) return null;
  if (rNum < 8 || rNum > 32 || pNum < 1 || pNum > 4) return null;
  if (!BASE64URL.test(salt) || !BASE64URL.test(hash)) return null;
  const saltBuf = Buffer.from(salt, "base64url");
  const hashBuf = Buffer.from(hash, "base64url");
  if (saltBuf.length < SALT_BYTES || hashBuf.length !== KEY_BYTES) return null;
  return { log2N, r: rNum, p: pNum, salt: saltBuf, hash: hashBuf };
}

function derive(
  password: string,
  salt: Buffer,
  log2N: number,
  r: number,
  p: number,
): Promise<Buffer> {
  const N = 2 ** log2N;
  // Node's default maxmem (32 MiB) refuses OWASP parameters; scrypt needs 128 * N * r bytes.
  const maxmem = 128 * N * r + 16 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, { N, r, p, maxmem }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, SCRYPT_LOG2_N, SCRYPT_R, SCRYPT_P);
  return [
    "scrypt",
    SCRYPT_LOG2_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join(":");
}

/** Constant-time verification against a parsed hash. */
export async function verifyPassword(
  password: string,
  stored: ParsedPasswordHash,
): Promise<boolean> {
  const key = await derive(password, stored.salt, stored.log2N, stored.r, stored.p);
  return timingSafeEqual(key, stored.hash);
}
