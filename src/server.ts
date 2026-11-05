import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  VERSION,
  emptyState,
  normalizeViewer,
  type Binding,
} from "./shared.js";
import { Workspace, message } from "./workspace.js";
import { entrypointDirectory } from "./entrypoint.js";
import { registeredProjects, projectForDirectory } from "./projects.js";
import { definitionAt } from "./definition.js";
import { bindWorkspace, workspaceFor } from "./bindings.js";

const resourceUri = "ui://visualfiles/panel.html";
const pathSchema = z.string().max(10000);
const slotSchema = z.object({
  path: pathSchema,
  version: z.enum(["head", "current"]),
  opened: z.number().nonnegative(),
  scroll: z.number().nonnegative(),
});
const stateSchema = z.object({
  expanded: z.array(pathSchema).max(2000),
  viewer: z.object({
    slots: z.tuple([slotSchema.nullable(), slotSchema.nullable()]),
    active: z.union([z.literal(0), z.literal(1)]),
    clock: z.number().nonnegative(),
    diff: z.boolean(),
  }),
  onlyChanged: z.boolean(),
  includeIgnored: z.boolean(),
  searchMode: z.enum(["name", "text"]),
  treeWidth: z.number().min(180),
});
const success = (data: object) => ({
  content: [{ type: "text" as const, text: "已完成文件面板操作" }],
  structuredContent: data,
});
const failure = (error: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: message(error) }],
});

serveStdio(() => {
  const server = new McpServer({
    name: "visualfiles",
    title: "VisualFiles",
    version: VERSION,
  });
  registerAppResource(
    server,
    "visualfiles-panel",
    resourceUri,
    {},
    async () => ({
      contents: [
        {
          uri: resourceUri,
          mimeType: RESOURCE_MIME_TYPE,
          text: await readFile(
            new URL("./index.html", import.meta.url),
            "utf8",
          ),
          _meta: {
            "openai/ui": {
              preferredDisplayMode: "fullscreen",
              availableDisplayModes: ["inline", "fullscreen"],
            },
          },
        },
      ],
    }),
  );
  registerAppTool(
    server,
    "open_visualfiles",
    {
      title: "VisualFiles",
      description:
        "Open the file explorer in a Codex panel. Only source roots of registered local Codex projects and their managed worktrees can be opened. Supply workingDirectory only from the current chat’s explicitly selected workspace; omit it to choose a registered project.",
      inputSchema: z.object({
        workingDirectory: z.string().optional(),
        projectId: z
          .string()
          .optional()
          .describe(
            "Optional project ID returned by visualfiles_projects, used to validate the selection.",
          ),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: {
        ui: { resourceUri },
        "openai/outputTemplate": resourceUri,
        "openai/ui": {
          entrypoints: [{ type: "thread" }],
          preferredModelDisplayMode: "fullscreen",
        },
      },
    },
    async ({ workingDirectory, projectId }, context) => {
      try {
        const preferredRoot = workingDirectory
          ? undefined
          : await entrypointDirectory(
              undefined,
              context.mcpReq._meta,
              async () => {
                if (!server.server.getClientCapabilities()?.roots) return [];
                return (await server.server.listRoots({}, { timeout: 2000 }))
                  .roots;
              },
            );
        let data: Binding = {
          root: null,
          bindingId: "",
          state: emptyState(),
          info: null,
          preferredRoot,
        };
        if (workingDirectory) {
          const selection = await projectForDirectory(
            workingDirectory,
            await registeredProjects(context.mcpReq.signal),
            projectId,
            context.mcpReq.signal,
          );
          const workspace = await Workspace.bind(selection.root);
          const bindingId = await bindWorkspace(
            workspace,
            selection.project.id,
            context.mcpReq._meta?.threadId,
          );
          const saved = stateSchema.safeParse(await workspace.loadState());
          data = {
            root: workspace.root,
            bindingId,
            info: workspace.info,
            projectName: selection.project.name,
            state: saved.success
              ? { ...saved.data, viewer: normalizeViewer(saved.data.viewer) }
              : emptyState(),
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: data.root
                ? `文件树已绑定 ${data.root}`
                : "请在 VisualFiles 中选择 Codex 已登记的本机项目",
            },
          ],
          structuredContent: { ...data, version: VERSION },
        };
      } catch (error) {
        return failure(error);
      }
    },
  );
  server.registerTool(
    "visualfiles_projects",
    {
      description:
        "List registered local Codex projects and their source directories.",
      inputSchema: z.object({ action: z.literal("list") }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { visibility: ["app"] } },
    },
    async (_, context) => {
      try {
        return success({
          projects: await registeredProjects(context.mcpReq.signal),
        });
      } catch (error) {
        return failure(error);
      }
    },
  );
  server.registerTool(
    "visualfiles_read",
    {
      description: "Read the bound workspace for the file explorer UI.",
      inputSchema: z.object({
        bindingId: z.string(),
        action: z.enum([
          "snapshot",
          "file",
          "search",
          "reference",
          "definition",
        ]),
        version: z.enum(["head", "current"]).optional(),
        position: z.number().int().nonnegative().optional(),
        revision: z.string().length(64).optional(),
        path: pathSchema.optional(),
        directories: z.array(pathSchema).max(2000).optional(),
        paths: z.array(pathSchema).max(2).optional(),
        query: z.string().max(2000).optional(),
        mode: z.enum(["name", "text"]).optional(),
        includeIgnored: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { visibility: ["app"] } },
    },
    async (args, context) => {
      try {
        const workspace = await workspaceFor(
          args.bindingId,
          context.mcpReq._meta?.threadId,
          context.mcpReq.signal,
        );
        if (args.action === "snapshot")
          return success(
            await workspace.snapshot(args.directories ?? [], args.paths ?? []),
          );
        if (args.action === "reference")
          return success(await workspace.reference(args.path ?? ""));
        if (args.action === "definition") {
          await workspace.refreshInfo();
          const file = await workspace.file(args.path ?? "");
          const version = file[args.version ?? "current"];
          if (!version.exists || version.binary || version.tooLarge)
            throw new Error("请选择可读取的文本文件");
          if (!args.revision || args.revision !== version.revision)
            throw new Error("文件已更新，请刷新后重试定义跳转");
          return success({
            definition: definitionAt(
              file.path,
              version.text.replace(/\r\n?/g, "\n"),
              args.position ?? 0,
            ),
          });
        }
        if (args.action === "file") {
          await workspace.refreshInfo();
          return success(await workspace.file(args.path ?? ""));
        }
        return success(
          await workspace.search(
            args.query ?? "",
            args.mode ?? "name",
            args.includeIgnored ?? false,
          ),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );
  server.registerTool(
    "visualfiles_mutate",
    {
      description:
        "Create an empty file/directory, recursively copy, move/rename, or move an entry to the system trash after a user action in VisualFiles. Never edits file contents.",
      inputSchema: z.object({
        bindingId: z.string(),
        action: z.enum([
          "createFile",
          "createDirectory",
          "move",
          "copy",
          "trash",
        ]),
        path: pathSchema,
        destination: pathSchema.optional(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: false,
      },
      _meta: { ui: { visibility: ["app"] } },
    },
    async (args, context) => {
      try {
        const workspace = await workspaceFor(
          args.bindingId,
          context.mcpReq._meta?.threadId,
          context.mcpReq.signal,
        );
        const path = await workspace.mutate(
          args.action,
          args.path,
          args.destination,
        );
        return success({ ok: true, path: path ?? null });
      } catch (error) {
        return failure(error);
      }
    },
  );
  server.registerTool(
    "visualfiles_save_state",
    {
      description: "Save file panel browsing state outside the workspace.",
      inputSchema: z.object({ bindingId: z.string(), state: stateSchema }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      },
      _meta: { ui: { visibility: ["app"] } },
    },
    async (args, context) => {
      try {
        const workspace = await workspaceFor(
          args.bindingId,
          context.mcpReq._meta?.threadId,
          context.mcpReq.signal,
        );
        await workspace.saveState(args.state);
        return success({ ok: true });
      } catch (error) {
        return failure(error);
      }
    },
  );
  return server;
});
