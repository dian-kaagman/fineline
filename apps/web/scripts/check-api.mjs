// Fails when src/api/schema.d.ts is not what `npm run generate:api` produces from
// docs/api/openapi.yaml, so the web app's types can't drift from the contract.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const committed = join(root, "src/api/schema.d.ts");
const dir = mkdtempSync(join(tmpdir(), "fineline-api-"));
const fresh = join(dir, "schema.d.ts");

try {
  execFileSync(
    process.execPath,
    [
      join(root, "node_modules/openapi-typescript/bin/cli.js"),
      "../../docs/api/openapi.yaml",
      "-o",
      fresh,
    ],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] },
  );
  if (readFileSync(fresh, "utf8") !== readFileSync(committed, "utf8")) {
    console.error(
      "src/api/schema.d.ts is out of date with docs/api/openapi.yaml. Run `npm run generate:api` and commit the result.",
    );
    process.exitCode = 1;
  } else {
    console.log("src/api/schema.d.ts matches docs/api/openapi.yaml.");
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
