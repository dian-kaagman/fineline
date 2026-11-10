import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newDrawingKey, newFramePhotoKey, newPhotoKey } from "./file-storage.js";
import { LocalDiskStorage } from "./local-disk-storage.js";

let dir: string;
let storage: LocalDiskStorage;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "fineline-storage-"));
  storage = new LocalDiskStorage(dir);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("LocalDiskStorage (SR-015)", () => {
  it("stores, reads, lists and deletes files under server-generated keys", async () => {
    const key = newPhotoKey();
    await storage.put(key, Buffer.from("photo"));
    expect(await storage.get(key)).toEqual(Buffer.from("photo"));
    expect((await storage.list()).map((f) => f.key)).toEqual([key]);
    await storage.delete(key);
    await storage.delete(key); // idempotent
    expect(await storage.get(key)).toBeNull();
  });

  it("writes files 0600 in 0700 directories, leaving no temp files", async () => {
    const key = newDrawingKey();
    await storage.put(key, Buffer.from("<svg/>"));
    expect((await stat(path.join(dir, key))).mode & 0o777).toBe(0o600);
    expect((await stat(path.join(dir, "drawings"))).mode & 0o777).toBe(0o700);
    expect(await readdir(path.join(dir, "drawings"))).toEqual([key.split("/")[1]]);
  });

  it.each([
    "../etc/passwd",
    "/etc/passwd",
    "photos/../../x",
    "photos/../drawings/x",
    "photos/abc",
    "other/11111111-2222-4333-8444-555555555555",
    "photos/11111111-2222-4333-8444-555555555555/../../x",
  ])("refuses the key %s", async (key) => {
    await expect(storage.put(key, Buffer.from("x"))).rejects.toThrow();
    await expect(storage.get(key)).rejects.toThrow();
    await expect(storage.delete(key)).rejects.toThrow();
  });

  it("generates keys that match the allowed pattern", async () => {
    for (const key of [newPhotoKey(), newDrawingKey(), newFramePhotoKey()]) {
      await storage.put(key, Buffer.from("x"));
    }
    expect(await storage.list()).toHaveLength(3);
  });
});
