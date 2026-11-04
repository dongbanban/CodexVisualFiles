import { spawn, execFile } from "node:child_process";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import { realpath, lstat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import type { LocalProject } from "./shared.js";

const projectPage = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      roots: z.array(z.object({ path: z.string().startsWith("/") })),
    }),
  ),
  nextCursor: z.string().nullable(),
});

export async function registeredProjects(
  signal?: AbortSignal,
): Promise<LocalProject[]> {
  // shortcut: project/list is an experimental app-server API; replace when the plugin bridge exposes projects.
  const child = spawn(
    process.env.VISUALFILES_CODEX ?? "codex",
    ["app-server", "--stdio"],
    {
      stdio: ["pipe", "pipe", "pipe"],
      signal,
    },
  );
  child.stderr.resume();
  const lines = createInterface({ input: child.stdout });
  let requestId = 0;
  const send = (method: string, params?: object, id?: number) =>
    child.stdin.write(JSON.stringify({ method, params, id }) + "\n");
  const projects: LocalProject[] = [];
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Codex 项目列表读取超时")),
        15000,
      );
      child.on("error", () => reject(new Error("无法启动 Codex 项目服务")));
      child.stdin.on("error", () =>
        reject(new Error("Codex 项目服务连接中断")),
      );
      lines.on("error", () => reject(new Error("Codex 项目列表读取失败")));
      child.on("exit", () => reject(new Error("Codex 项目服务已退出")));
      lines.on("line", (line) => {
        try {
          const message = JSON.parse(line);
          if (message.id !== requestId) return;
          if (message.error) throw new Error(message.error.message);
          if (requestId === 0) {
            send("initialized");
            send("project/list", { limit: 100 }, ++requestId);
            return;
          }
          const page = projectPage.parse(message.result);
          projects.push(
            ...page.data.map((project) => ({
              id: project.id,
              name: project.name,
              roots: project.roots.map((root) => root.path),
            })),
          );
          if (page.nextCursor)
            send(
              "project/list",
              { limit: 100, cursor: page.nextCursor },
              ++requestId,
            );
          else resolve(projects);
        } catch (error) {
          reject(error);
        }
      });
      send(
        "initialize",
        {
          clientInfo: { name: "visualfiles-projects", version: "1.0.0" },
          capabilities: { experimentalApi: true },
        },
        requestId,
      );
    });
  } finally {
    clearTimeout(timer!);
    lines.close();
    child.stdin.end();
    child.kill();
  }
}

export async function projectForDirectory(
  path: string,
  projects: LocalProject[],
  projectId?: string,
  signal?: AbortSignal,
) {
  if (!isAbsolute(path)) throw new Error("工作目录必须是绝对路径");
  const root = await realpath(path);
  const candidates = projects.filter(
    (project) => projectId === undefined || project.id === projectId,
  );
  const entries = await Promise.all(
    candidates.map(async (project) => ({
      project,
      roots: await Promise.all(
        project.roots.map((directory) => realpath(directory).catch(() => null)),
      ),
    })),
  );
  let match = entries.find((entry) => entry.roots.includes(root));
  if (
    !match &&
    entries.length &&
    (await lstat(join(root, ".git")).catch(() => null))?.isFile()
  ) {
    const worktrees: Array<string | null> = await promisify(execFile)(
      "git",
      ["-C", root, "worktree", "list", "--porcelain", "-z"],
      { signal, timeout: 5000, maxBuffer: 1024 * 1024 },
    )
      .then(async ({ stdout }) =>
        Promise.all(
          stdout
            .split("\0")
            .filter((entry) => entry.startsWith("worktree "))
            .map((entry) => realpath(entry.slice(9)).catch(() => null)),
        ),
      )
      .catch(() => []);
    if (worktrees.includes(root))
      match = entries.find((entry) =>
        entry.roots.some(
          (directory) => directory !== null && worktrees.includes(directory),
        ),
      );
  }
  if (!match)
    throw new Error(
      "只能打开 Codex 已登记项目的源目录或其受管理工作树，请先在 Codex 中创建项目或关联目录",
    );
  return { root, project: match.project };
}
