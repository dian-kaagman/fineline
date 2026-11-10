/**
 * Prints an ADMIN_PASSWORD_HASH for a password read from stdin (never argv, which ends up in shell
 * history). Usage: `npm run hash-password` or `node dist/scripts/hash-password.js`, type the
 * password (not echoed) and press Enter, or pipe it in.
 */
import { hashPassword, MIN_PASSWORD_LENGTH } from "../lib/password-hash.js";

/** Reads one line from a terminal without echoing it. */
function readHidden(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stderr.write("Admin password: ");
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          stdin.setRawMode(false);
          process.stderr.write("\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
    stdin.resume();
  });
}

async function readPiped(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/)[0] ?? "";
}

const password = process.stdin.isTTY ? await readHidden() : await readPiped();
if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  process.exit(1);
}
console.log(await hashPassword(password));
