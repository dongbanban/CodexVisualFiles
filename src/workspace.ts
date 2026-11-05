import { MAX_PREVIEW_BYTES, fileVersion, missing } from "./file-version.js";
import { searchWorkspace } from "./workspace-search.js";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import {
  readdir,
  readFile,
  realpath,
  stat,
  lstat,
  mkdir,
  rename,
  cp,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import {
  emptyState,
  type FileData,
  type GitEntry,
  type SavedState,
  type Snapshot,
  type TreeEntry,
  type WorkspaceInfo,
} from "./shared.js";

const exec = promisify(execFile);

const filenameOrder = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "variant",
  caseFirst: "upper",
});

const inside = (root: string, path: string) => {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
};
const errorCode = (error: unknown) => (error as NodeJS.ErrnoException).code;
export const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export class Workspace {
  info!: WorkspaceInfo;
  private prefix = "";
  constructor(
    readonly root: string,
    readonly stateDirectory = process.env.PLUGIN_DATA ||
      join(homedir(), ".local", "share", "VisualFiles"),
  ) {}
  static async bind(root: string) {
    if (!isAbsolute(root)) throw new Error("工作目录必须是绝对路径");
    const resolved = await realpath(root);
    if (!(await stat(resolved)).isDirectory())
      throw new Error("工作目录必须是实际存在的目录");
    const workspace = new Workspace(resolved);
    await workspace.refreshInfo();
    return workspace;
  }
  private async git(args: string[], input?: string): Promise<Buffer> {
    if (input === undefined)
      return (
        await exec("git", ["-C", this.root, ...args], {
          encoding: "buffer",
          maxBuffer: 32 * 1024 * 1024,
          timeout: 15000,
        })
      ).stdout;
    return new Promise((resolvePromise, reject) => {
      const child = spawn("git", ["-C", this.root, ...args], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      const chunks: Buffer[] = [];
      let error = "";
      child.stdout.on("data", (chunk) => chunks.push(chunk));
      child.stderr.on("data", (chunk) => {
        error += chunk;
      });
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 || code === 1
          ? resolvePromise(Buffer.concat(chunks))
          : reject(new Error(error || "Git 命令失败")),
      );
      child.stdin.end(input);
    });
  }
  async refreshInfo() {
    const changes: Record<string, GitEntry> = Object.create(null);
    this.info = {
      root: this.root,
      name: basename(this.root),
      branch: null,
      head: null,
      worktree: false,
      git: false,
      changes,
    };
    try {
      this.prefix = (await this.git(["rev-parse", "--show-prefix"]))
        .toString()
        .trim();
    } catch {
      return this.info;
    }
    this.info.git = true;
    this.info.head = await this.git(["rev-parse", "--verify", "HEAD"])
      .then((b) => b.toString().trim())
      .catch(() => null);
    this.info.branch = await this.git(["symbolic-ref", "--short", "HEAD"])
      .then((b) => b.toString().trim())
      .catch(() => this.info.head?.slice(0, 8) ?? "未提交");
    const [gitDir, commonDir] = await Promise.all(
      ["--git-dir", "--git-common-dir"].map((arg) =>
        this.git(["rev-parse", "--path-format=absolute", arg]).then((b) =>
          b.toString().trim(),
        ),
      ),
    );
    this.info.worktree = gitDir !== commonDir;
    const parts = (
      await this.git([
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
      ])
    )
      .toString()
      .split("\0");
    for (let i = 0; i < parts.length; i++) {
      const record = parts[i];
      if (!record) continue;
      const status = record.slice(0, 2);
      const repoPath = record.slice(3);
      const original = /[RC]/.test(status) ? parts[++i] : undefined;
      if (!repoPath.startsWith(this.prefix)) continue;
      const path = repoPath.slice(this.prefix.length);
      if (path)
        changes[path] = {
          status: status.includes("?")
            ? "A"
            : status.includes("U")
              ? "U"
              : status.includes("R")
                ? "R"
                : status.includes("D")
                  ? "D"
                  : status.includes("A")
                    ? "A"
                    : "M",
          ...(original ? { oldPath: original } : {}),
        };
    }
    return this.info;
  }
  async path(path: string, leafMayNotExist = false, followLeaf = true) {
    if (isAbsolute(path) || path.includes("\0"))
      throw new Error("路径必须位于当前工作目录内");
    const candidate = resolve(this.root, path || ".");
    if (!inside(this.root, candidate)) throw new Error("路径超出当前工作目录");
    if (candidate === this.root) return candidate;
    let ancestor =
      followLeaf && !leafMayNotExist ? candidate : dirname(candidate);
    let actual: string;
    while (true) {
      try {
        actual = await realpath(ancestor);
        break;
      } catch (error) {
        if (
          !leafMayNotExist ||
          errorCode(error) !== "ENOENT" ||
          ancestor === this.root
        )
          throw error;
        ancestor = dirname(ancestor);
      }
    }
    if (!inside(this.root, actual)) throw new Error("链接指向工作目录之外");
    let current = this.root;
    const parts = relative(this.root, candidate).split(sep);
    for (const [index, name] of parts.entries()) {
      const names = await readdir(current);
      if (!names.includes(name)) {
        const newLeaf =
          leafMayNotExist && !followLeaf && index === parts.length - 1;
        const caseAlias = names.some(
          (existing) => existing.toLowerCase() === name.toLowerCase(),
        );
        if (newLeaf || (leafMayNotExist && !caseAlias)) break;
        const error = new Error(
          `路径不存在或大小写不匹配：${path}`,
        ) as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }
      current = join(current, name);
    }
    return candidate;
  }
  private async ignored(paths: string[]) {
    if (!this.info.git || !paths.length) return new Set<string>();
    return new Set(
      (
        await this.git(
          ["check-ignore", "-z", "--stdin"],
          paths.join("\0") + "\0",
        )
      )
        .toString()
        .split("\0")
        .filter(Boolean),
    );
  }
  async list(path = ""): Promise<TreeEntry[]> {
    const entries = await (async () => {
      const directory = await this.path(path, true);
      try {
        await this.path(path);
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
      return readdir(directory, { withFileTypes: true });
    })().catch((error) => {
      if (
        errorCode(error) === "ENOENT" &&
        Object.keys(this.info.changes).some((changed) =>
          changed.startsWith(`${path}/`),
        )
      )
        return [];
      throw error;
    });
    const nodes = new Map<string, TreeEntry>();
    for (const entry of entries) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;
      nodes.set(entry.name, {
        path: entryPath,
        name: entry.name,
        directory: entry.isDirectory(),
        symlink: entry.isSymbolicLink(),
        ignored: false,
        status: "",
        deleted: false,
      });
    }
    const ignored = await this.ignored(
      [...nodes.values()].map((node) => node.path),
    );
    for (const node of nodes.values()) {
      node.ignored = ignored.has(node.path);
      if (node.symlink)
        node.directory = await this.path(node.path)
          .then((p) => stat(p))
          .then((s) => s.isDirectory())
          .catch(() => false);
    }
    const prefix = path ? `${path}/` : "";
    for (const [entryPath, entry] of Object.entries(this.info.changes)) {
      if (!entryPath.startsWith(prefix)) continue;
      const rest = entryPath.slice(prefix.length);
      const name = rest.split("/")[0];
      if (!nodes.has(name))
        nodes.set(name, {
          path: prefix + name,
          name,
          directory: rest.includes("/"),
          symlink: false,
          ignored: false,
          status: entry.status,
          deleted: true,
        });
      const node = nodes.get(name)!;
      node.status = node.directory ? "•" : entry.status;
    }
    return [...nodes.values()].sort(
      (a, b) =>
        Number(b.directory) - Number(a.directory) ||
        filenameOrder.compare(a.name, b.name) ||
        (a.name === b.name ? 0 : a.name < b.name ? -1 : 1),
    );
  }

  async file(path: string): Promise<FileData> {
    let current: Buffer | null = null;
    let currentVersion = missing();
    try {
      const target = await this.path(path, true);
      await this.path(path);
      const info = await stat(target);
      if (!info.isFile()) throw new Error("请选择文件");
      if (info.size > MAX_PREVIEW_BYTES)
        currentVersion = {
          exists: true,
          text: "",
          binary: true,
          size: info.size,
          tooLarge: true,
        };
      else {
        current = await readFile(target);
        currentVersion = fileVersion(current, path);
      }
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
    const entry = this.info.changes[path];
    let head: Buffer | null = null;
    let headVersion = missing();
    if (this.info.git && this.info.head) {
      const oldPath = entry?.oldPath ?? this.prefix + path;
      const object = `${this.info.head}:${oldPath}`;
      const size = await this.git(["cat-file", "-s", object])
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
        head = await this.git(["show", object]).catch(() => null);
        headVersion = fileVersion(head, path);
      }
    }
    return {
      path,
      head: headVersion,
      current: currentVersion,
      hasDiff:
        !!entry &&
        headVersion.exists &&
        (!!currentVersion.tooLarge ||
          !!headVersion.tooLarge ||
          current === null ||
          head === null ||
          !current.equals(head)),
    };
  }
  async snapshot(directories: string[], paths: string[]): Promise<Snapshot> {
    await this.refreshInfo();
    const snapshot: Snapshot = {
      info: this.info,
      directories: Object.create(null),
      files: Object.create(null),
      errors: Object.create(null),
    };
    await Promise.all(
      [...new Set(["", ...directories])].map(async (path) => {
        try {
          snapshot.directories[path] = await this.list(path);
        } catch (error) {
          snapshot.errors[path] = message(error);
        }
      }),
    );
    await Promise.all(
      [...new Set(paths)].map(async (path) => {
        try {
          snapshot.files[path] = await this.file(path);
        } catch (error) {
          snapshot.errors[path] = message(error);
        }
      }),
    );
    return snapshot;
  }
  async reference(path: string) {
    const absolutePath = await this.path(path);
    const info = await stat(absolutePath);
    if (!info.isFile() && !info.isDirectory())
      throw new Error("只能引用文件或目录");
    return { absolutePath, directory: info.isDirectory() };
  }
  async search(query: string, mode: "name" | "text", includeIgnored: boolean) {
    return searchWorkspace(this.root, query, mode, includeIgnored);
  }
  async mutate(
    action: "createFile" | "createDirectory" | "move" | "copy" | "trash",
    path: string,
    destination?: string,
  ) {
    if (!path || resolve(this.root, path) === this.root)
      throw new Error("不能对工作目录本身执行此操作");
    const target = await this.path(
      path,
      action === "createFile" || action === "createDirectory",
      false,
    );
    if (action === "createFile") {
      await writeFile(target, "", { flag: "wx" });
      return;
    }
    if (action === "createDirectory") {
      await mkdir(target);
      return;
    }
    const sourceInfo = await lstat(target);
    if (action === "trash") {
      if (process.platform !== "darwin")
        throw new Error("此安装包的废纸篓功能支持 macOS");
      await exec(
        fileURLToPath(new URL("./macos-trash", import.meta.url)),
        [target],
        { timeout: 30000 },
      );
      return;
    }
    if (!destination) throw new Error("请选择目标路径");
    let dest = await this.path(destination, true, false);
    if (action === "move" && target === dest) return path;
    if (sourceInfo.isDirectory() && target !== dest && inside(target, dest))
      throw new Error("不能把目录复制或移动到自身或子目录中");
    if (action === "copy") {
      const extension = sourceInfo.isDirectory() ? "" : extname(dest);
      const stem = basename(dest, extension);
      const directory = dirname(dest);
      let number = 0;
      while (true) {
        try {
          await lstat(dest);
          number++;
          dest = join(
            directory,
            `${stem} 副本${number > 1 ? ` ${number}` : ""}${extension}`,
          );
        } catch (error) {
          if (errorCode(error) !== "ENOENT") throw error;
          break;
        }
      }
      await cp(target, dest, {
        recursive: true,
        dereference: false,
        verbatimSymlinks: true,
        force: false,
        errorOnExist: true,
      });
      return relative(this.root, dest);
    }
    try {
      const existing = await lstat(dest);
      const sameEntry =
        sourceInfo.dev === existing.dev && sourceInfo.ino === existing.ino;
      const caseOnly =
        dirname(target) === dirname(dest) &&
        basename(target).toLowerCase() === basename(dest).toLowerCase() &&
        !(await readdir(dirname(dest))).includes(basename(dest));
      if (sameEntry && caseOnly) {
        await rename(target, dest);
        return relative(this.root, dest);
      }
      throw new Error("目标已存在，请使用其他名称");
    } catch (error) {
      if (errorCode(error) !== "ENOENT") throw error;
    }
    await rename(target, dest);
    return relative(this.root, dest);
  }
  private get statePath() {
    return join(
      this.stateDirectory,
      `${createHash("sha256").update(this.root).digest("hex")}.json`,
    );
  }
  async loadState(): Promise<SavedState> {
    try {
      return JSON.parse(await readFile(this.statePath, "utf8")) as SavedState;
    } catch {
      return emptyState();
    }
  }
  async saveState(state: SavedState) {
    await mkdir(this.stateDirectory, { recursive: true, mode: 0o700 });
    const temporary = `${this.statePath}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
    await rename(temporary, this.statePath);
  }
}
