import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { MAX_PREVIEW_BYTES, fileVersion, missing } from "./file-version.js";
import type { FileData } from "./shared.js";

type CachedFile = {
  currentKey: string;
  headObject: string | null;
  current: Buffer | null;
  head: Buffer | null;
  data: FileData;
};

export class WorkspaceFiles {
  private readonly cache = new Map<string, CachedFile>();
  constructor(
    private readonly resolvePath: (path: string) => Promise<string>,
    private readonly git: (args: string[]) => Promise<Buffer>,
  ) {}

  async read(
    path: string,
    headObject: string | null,
    changed: boolean,
    force = false,
  ): Promise<FileData> {
    const cached = force ? undefined : this.cache.get(path);
    let currentKey = "missing";
    let current: Buffer | null = null;
    let currentVersion = missing();
    try {
      const target = await this.resolvePath(path);
      const info = await stat(target, { bigint: true });
      if (!info.isFile()) throw new Error("请选择文件");
      currentKey = [
        info.dev,
        info.ino,
        info.size,
        info.mtimeNs,
        info.ctimeNs,
      ].join(":");
      if (cached?.currentKey === currentKey) {
        current = cached.current;
        currentVersion = cached.data.current;
      } else if (info.size > BigInt(MAX_PREVIEW_BYTES)) {
        currentVersion = {
          exists: true,
          text: "",
          binary: true,
          size: Number(info.size),
          tooLarge: true,
        };
      } else {
        current = await readFile(target);
        currentVersion = fileVersion(current, path);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    let head: Buffer | null = null;
    let headVersion = missing();
    if (cached && cached.headObject === headObject) {
      head = cached.head;
      headVersion = cached.data.head;
    } else if (headObject) {
      const size = await this.git(["cat-file", "-s", headObject])
        .then((value) => Number(value.toString()))
        .catch(() => -1);
      if (size > MAX_PREVIEW_BYTES)
        headVersion = {
          exists: true,
          text: "",
          binary: true,
          size,
          tooLarge: true,
        };
      else if (size >= 0) {
        head = await this.git(["show", headObject]);
        headVersion = fileVersion(head, path);
      }
    }
    const signature = createHash("sha256")
      .update(JSON.stringify([currentKey, headObject, changed]))
      .digest("hex");
    const data: FileData = {
      path,
      signature,
      head: headVersion,
      current: currentVersion,
      hasDiff:
        changed &&
        headVersion.exists &&
        (!!currentVersion.tooLarge ||
          !!headVersion.tooLarge ||
          current === null ||
          head === null ||
          !current.equals(head)),
    };
    this.cache.delete(path);
    this.cache.set(path, { currentKey, headObject, current, head, data });
    if (this.cache.size > 2) this.cache.delete(this.cache.keys().next().value!);
    return data;
  }
}
