import { buildApp } from "./app.js";
import { ConfigError, loadConfig, type Config } from "./config.js";
import { createDatabase } from "./db/client.js";
import { LocalDiskStorage } from "./storage/local-disk-storage.js";
import { HttpWorkerClient } from "./worker/worker-client.js";

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

let logIdleError: (error: Error) => void = () => undefined;
const { db, pool } = createDatabase(config.databaseUrl, (error) => logIdleError(error));
const { app, retention } = await buildApp({
  config,
  db,
  storage: new LocalDiskStorage(config.storageDir),
  worker: new HttpWorkerClient(config.worker.url, config.worker.token, config.worker.timeoutMs),
});

// Log only the pg error code, never the message or detail (SR-018: they can contain values).
logIdleError = (error) =>
  app.log.error(
    { event: "db_idle_client_error", code: (error as Error & { code?: string }).code },
    "idle database client error",
  );

const sweep = () => {
  retention
    .run()
    .catch(() =>
      app.log.error({ event: "retention_failed", step: "run" }, "retention sweep failed"),
    );
};
// Retention runs at startup and then on an interval (BR-010); unref so it never holds the process.
sweep();
const timer = setInterval(sweep, config.retentionSweepIntervalMs);
timer.unref();

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "shutting down");
  clearInterval(timer);
  try {
    await app.close();
    await pool.end();
    process.exit(0);
  } catch {
    process.exit(1);
  }
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: config.port, host: "0.0.0.0" });
