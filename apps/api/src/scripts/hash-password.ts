/**
 * Prints an ADMIN_PASSWORD_HASH for a password read from stdin (never argv, which ends up in shell
 * history). Usage: `npm run hash-password` or `node dist/scripts/hash-password.js`, type the
 * password and press Enter (or pipe it in).
 */
import { hashPassword, MIN_PASSWORD_LENGTH } from "../lib/password-hash.js";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) process.stderr.write("Admin password: ");
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
    // Interactive use: stop at the first line break.
    if (process.stdin.isTTY && Buffer.concat(chunks).includes(0x0a)) break;
  }
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/)[0] ?? "";
}

const password = await readStdin();
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}
console.log(await hashPassword(password));
