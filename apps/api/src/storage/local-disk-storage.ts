import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { isStorageKey, type FileStorage } from "./file-storage.js";

const PREFIXES = ["photos", "drawings", "frames"] as const;
const TEMP_NAME = /^\.tmp-[0-9a-f]{16}$/;

/**
 * FileStorage on local disk under STORAGE_DIR (ADR 0006, SR-015): keys are pattern-checked and
 * confined to the directory; writes are atomic (temp file + rename) with mode 0600 in 0700
 * directories, so a failed write never leaves a partial file under a real key.
 */
export class LocalDiskStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private pathFor(key: string): string {
    if (!isStorageKey(key)) throw new Error("invalid storage key");
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("storage key outside STORAGE_DIR");
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.pathFor(key);
    const dir = path.dirname(target);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const temp = path.join(dir, `.tmp-${randomBytes(8).toString("hex")}`);
    try {
      await writeFile(temp, data, { mode: 0o600, flag: "wx" });
      await rename(temp, target);
    } catch (err) {
      await rm(temp, { force: true });
      throw err;
    }
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  async removeStaleTemporaryFiles(before: Date): Promise<number> {
    let removed = 0;
    for (const prefix of PREFIXES) {
      const dir = path.join(this.root, prefix);
      let names: string[];
      try {
        names = await readdir(dir);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
      for (const name of names) {
        if (!TEMP_NAME.test(name)) continue;
        const file = path.join(dir, name);
        if ((await stat(file)).mtime < before) {
          await rm(file, { force: true });
          removed += 1;
        }
      }
    }
    return removed;
  }

  async list(): Promise<{ key: string; modifiedAt: Date }[]> {
    const files: { key: string; modifiedAt: Date }[] = [];
    for (const prefix of PREFIXES) {
      let names: string[];
      try {
        names = await readdir(path.join(this.root, prefix));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
      for (const name of names) {
        const key = `${prefix}/${name}`;
        if (!isStorageKey(key)) continue;
        const info = await stat(path.join(this.root, prefix, name));
        files.push({ key, modifiedAt: info.mtime });
      }
    }
    return files;
  }
}
