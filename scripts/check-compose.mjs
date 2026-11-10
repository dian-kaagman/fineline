#!/usr/bin/env node
// Checks the hardening properties of docker-compose.yml (SR-004, SR-005, SR-015, SR-021).
// Runs `docker compose config --format json` (needs only the Docker CLI, not a daemon) and asserts:
// - only `web` publishes ports; the worker and db publish none;
// - the worker is read-only, has no volumes, drops all capabilities and has memory/CPU/pids limits;
// - api, worker and db are attached only to internal networks (no internet access, BR-016),
//   and the worker shares no network with the database;
// - the storage volume is mounted into `api` only.
import { execFileSync } from "node:child_process";

const placeholders = {
  POSTGRES_USER: "x",
  POSTGRES_PASSWORD: "x",
  WORKER_TOKEN: "x",
  ADMIN_USERNAME: "x",
  ADMIN_PASSWORD_HASH: "x",
};
const json = execFileSync("docker", ["compose", "-f", "docker-compose.yml", "config", "--format", "json"], {
  env: { ...placeholders, ...process.env },
  encoding: "utf8",
});
const config = JSON.parse(json);
const services = config.services;
const networks = config.networks;
const errors = [];
const expect = (cond, msg) => {
  if (!cond) errors.push(msg);
};

for (const [name, svc] of Object.entries(services)) {
  const ports = svc.ports ?? [];
  if (name === "web") expect(ports.length > 0, "web must publish a port");
  else expect(ports.length === 0, `${name} must not publish ports`);
  if (name !== "db") {
    expect((svc.cap_drop ?? []).includes("ALL"), `${name} must drop all capabilities`);
    expect((svc.security_opt ?? []).some((o) => o.startsWith("no-new-privileges")), `${name} needs no-new-privileges`);
  }
}

const worker = services.worker;
expect(worker.read_only === true, "worker must be read_only");
expect((worker.volumes ?? []).length === 0, "worker must have no volumes");
expect(Boolean(worker.mem_limit) && Boolean(worker.cpus) && Boolean(worker.pids_limit), "worker needs mem, cpu and pids limits");

const workerNets = Object.keys(worker.networks ?? {});
const dbNets = Object.keys(services.db.networks ?? {});
expect(!workerNets.some((n) => dbNets.includes(n)), "worker must not share a network with db");

for (const name of ["api", "worker", "db"]) {
  const attached = Object.keys(services[name].networks ?? {});
  expect(attached.length > 0, `${name} must be on an explicit network`);
  for (const net of attached) expect(networks[net]?.internal === true, `${name} must only use internal networks (found ${net})`);
}

for (const [name, svc] of Object.entries(services)) {
  const mountsStorage = (svc.volumes ?? []).some((v) => v.source === "storage");
  if (name === "api") expect(mountsStorage, "api must mount the storage volume");
  else expect(!mountsStorage, `${name} must not mount the storage volume`);
}

if (errors.length > 0) {
  console.error("Compose hardening check failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("Compose hardening check passed");
