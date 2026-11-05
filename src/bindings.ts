import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { projectForDirectory, registeredProjects } from "./projects.js";
import { dataDirectory } from "./storage.js";
import { Workspace } from "./workspace.js";

const recordSchema = z.object({
  root: z.string(),
  projectId: z.string(),
  thread: z.string().optional(),
});
const bindings = new Map<string, { workspace: Workspace; thread?: string }>();
export class BindingError extends Error {
  constructor(
    readonly code = "WORKSPACE_BINDING_EXPIRED",
    message = "项目连接已失效，请重新连接项目",
  ) {
    super(message);
  }
}
const expired = () => new BindingError();
const bindingPath = (id: string) => {
  if (!z.uuid().safeParse(id).success) throw expired();
  return join(dataDirectory(), "bindings", `${id}.json`);
};
const checkThread = (bound: string | undefined, current: unknown) => {
  if (bound && current && bound !== current)
    throw new BindingError(
      "WORKSPACE_THREAD_MISMATCH",
      "此面板来自其他对话，请在当前对话重新连接项目",
    );
};

export async function bindWorkspace(
  workspace: Workspace,
  projectId: string,
  thread: unknown,
) {
  const record = recordSchema.parse({
    root: workspace.root,
    projectId,
    thread,
  });
  const id = randomUUID();
  const path = bindingPath(id);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, JSON.stringify(record), { flag: "wx", mode: 0o600 });
  bindings.set(id, { workspace, thread: record.thread });
  return id;
}

export async function workspaceFor(
  id: string,
  thread: unknown,
  signal?: AbortSignal,
) {
  let binding = bindings.get(id);
  if (!binding) {
    const record = await readFile(bindingPath(id), "utf8")
      .then((text) => recordSchema.parse(JSON.parse(text)))
      .catch((error: unknown) => {
        const code = (error as NodeJS.ErrnoException).code;
        if (code && code !== "ENOENT") throw error;
        throw expired();
      });
    checkThread(record.thread, thread);
    const selection = await projectForDirectory(
      record.root,
      await registeredProjects(signal),
      record.projectId,
      signal,
    );
    if (selection.root !== record.root) throw expired();
    binding = {
      workspace: await Workspace.bind(selection.root),
      thread: record.thread,
    };
    bindings.set(id, binding);
  }
  checkThread(binding.thread, thread);
  return binding.workspace;
}
