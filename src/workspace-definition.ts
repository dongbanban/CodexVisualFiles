import { readFile, readdir, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileVersion, MAX_PREVIEW_BYTES } from "./file-version.js";
import type { Version, WorkspaceInfo } from "./shared.js";

export class DefinitionFiles {
  private tree?: Promise<Map<string, { mode: string; object: string }>>;
  constructor(
    readonly root: string,
    readonly version: Version,
    readonly info: WorkspaceInfo,
    private readonly prefix: string,
    private readonly validate: (path: string) => Promise<string>,
    private readonly git: (args: string[]) => Promise<Buffer>,
  ) {}

  relative(name: string) {
    const path = relative(this.root, resolve(name));
    return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path)
      ? null
      : path;
  }

  sourcePath(path: string) {
    const old = this.info.changes[path]?.oldPath;
    if (this.version !== "head" || !old) return path;
    if (!old.startsWith(this.prefix))
      throw new Error("HEAD 文件原路径超出当前工作目录");
    return old.slice(this.prefix.length);
  }

  displayPath(path: string) {
    if (this.version === "head")
      for (const [current, entry] of Object.entries(this.info.changes))
        if (entry.oldPath === this.prefix + path) return current;
    return path;
  }

  private async headTree() {
    if (!this.info.head) throw new Error("当前项目没有 HEAD 版本");
    return (this.tree ??= this.git([
      "ls-tree",
      "-rz",
      "--full-tree",
      this.info.head,
    ]).then((buffer) => {
      const entries = new Map<string, { mode: string; object: string }>();
      for (const record of buffer.toString().split("\0")) {
        const tab = record.indexOf("\t");
        if (tab < 0) continue;
        const path = record.slice(tab + 1);
        const [mode, type, object] = record.slice(0, tab).split(" ");
        if (type === "blob" && path.startsWith(this.prefix))
          entries.set(path.slice(this.prefix.length), { mode, object });
      }
      return entries;
    }));
  }

  async directories(name: string): Promise<string[] | undefined> {
    const path = this.relative(name);
    if (path === null) return undefined;
    if (this.version === "head") {
      const prefix = path ? path + "/" : "";
      const children = new Set<string>();
      let exists = !path;
      for (const file of (await this.headTree()).keys()) {
        if (!file.startsWith(prefix)) continue;
        exists = true;
        const rest = file.slice(prefix.length);
        if (rest.includes("/")) children.add(rest.split("/")[0]);
      }
      return exists ? [...children] : undefined;
    }
    try {
      const target = await this.validate(path);
      if (!(await stat(target)).isDirectory()) return undefined;
      return (await readdir(target, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
        .map((entry) => entry.name);
    } catch (error) {
      if (
        ["ENOENT", "ENOTDIR"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        return undefined;
      throw error;
    }
  }

  async read(name: string): Promise<string | undefined> {
    const path = this.relative(name);
    if (path === null || !path) return undefined;
    let data: Buffer;
    if (this.version === "head") {
      const entry = (await this.headTree()).get(path);
      if (!entry) return undefined;
      if (entry.mode === "120000")
        throw new Error(`HEAD 依赖是符号链接，无法解析：${path}`);
      const size = Number(
        (await this.git(["cat-file", "-s", entry.object])).toString(),
      );
      if (size > MAX_PREVIEW_BYTES)
        throw new Error(`依赖文件超过 12 MB：${path}`);
      data = await this.git(["cat-file", "blob", entry.object]);
    } else {
      try {
        const target = await this.validate(path);
        const info = await stat(target);
        if (!info.isFile()) return undefined;
        if (info.size > MAX_PREVIEW_BYTES)
          throw new Error(`依赖文件超过 12 MB：${path}`);
        data = await readFile(target);
      } catch (error) {
        if (
          ["ENOENT", "ENOTDIR"].includes(
            (error as NodeJS.ErrnoException).code ?? "",
          )
        )
          return undefined;
        throw error;
      }
    }
    const version = fileVersion(data, path);
    if (version.binary || version.tooLarge)
      throw new Error(`依赖不是可读取的文本文件：${path}`);
    return version.text.replace(/\r\n?/g, "\n");
  }
}
