import ts from "typescript";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { DefinitionFiles } from "./workspace-definition.js";
import type { DefinitionLocation } from "./shared.js";

export async function definitionAt(
  files: DefinitionFiles,
  path: string,
  text: string,
  position: number,
  signal?: AbortSignal,
): Promise<DefinitionLocation | null> {
  if (!/\.(?:[cm]?[jt]s|[jt]sx)$/i.test(path))
    throw new Error(
      "定义跳转目前仅支持 JavaScript / TypeScript（含 JSX、TSX）",
    );
  if (!Number.isInteger(position) || position < 0 || position > text.length)
    throw new Error("代码位置已变化，请重新定位后再跳转");
  const file = resolve(files.root, files.sourcePath(path));
  if (files.relative(file) === null) throw new Error("路径超出当前工作目录");
  const contents = new Map<string, string | undefined>([[file, text]]);
  const pending = new Set<string>();
  const directories = new Map<string, string[] | undefined>();
  const pendingDirectories = new Set<string>();
  const directory = (name: string) => {
    name = resolve(name);
    if (files.relative(name) === null) return undefined;
    if (!directories.has(name)) pendingDirectories.add(name);
    return directories.get(name);
  };
  let bytes = Buffer.byteLength(text);
  const read = (name: string) => {
    name = resolve(name);
    if (files.relative(name) === null) return undefined;
    if (!contents.has(name)) pending.add(name);
    return contents.get(name);
  };
  const host: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: true,
    fileExists: (name) => read(name) !== undefined,
    readFile: read,
    readDirectory: () => [],
  };
  const registry = ts.createDocumentRegistry(true);
  let previousService: ts.LanguageService | undefined;
  try {
    // TypeScript's host is synchronous; fill its requested files through Workspace between passes.
    for (let pass = 0; pass < 100; pass++) {
      signal?.throwIfAborted();
      let config: string | undefined;
      for (let directory = dirname(file); ; directory = dirname(directory)) {
        config = ["tsconfig.json", "jsconfig.json"]
          .map((name) => join(directory, name))
          .find((name) => host.fileExists(name));
        if (config || directory === files.root) break;
      }
      const configErrors: ts.Diagnostic[] = [];
      const parseConfig = (name: string) =>
        ts.getParsedCommandLineOfConfigFile(
          name,
          { noEmit: true },
          {
            ...host,
            getCurrentDirectory: () => files.root,
            onUnRecoverableConfigFileDiagnostic: (error) =>
              configErrors.push(error),
          },
        );
      const parsed = config ? parseConfig(config) : undefined;
      const options: ts.CompilerOptions = {
        target: ts.ScriptTarget.Latest,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.Preserve,
        ...parsed?.options,
        allowJs: true,
        noResolve: false,
      };
      const service = ts.createLanguageService(
        {
          ...host,
          useCaseSensitiveFileNames: () => true,
          readDirectory: () => [],
          getCompilationSettings: () => options,
          getScriptFileNames: () => [file],
          getProjectReferences: () => parsed?.projectReferences,
          getParsedCommandLine: (name) => parseConfig(name),
          getScriptVersion: () => "0",
          getScriptSnapshot: (name) => {
            const value = read(name);
            return value === undefined
              ? undefined
              : ts.ScriptSnapshot.fromString(value);
          },
          getCurrentDirectory: () => files.root,
          getDefaultLibFileName: () =>
            join(
              files.root,
              "node_modules/typescript/lib",
              ts.getDefaultLibFileName(options),
            ),
          directoryExists: (name) => directory(name) !== undefined,
          getDirectories: (name) => directory(name) ?? [],
        },
        registry,
      );
      let definitions: readonly ts.DefinitionInfo[] | undefined;
      try {
        definitions = service.getDefinitionAtPosition(file, position);
      } catch (error) {
        service.dispose();
        throw error;
      }
      previousService?.dispose();
      previousService = service;
      if (pending.size || pendingDirectories.size) {
        if (
          contents.size +
            pending.size +
            directories.size +
            pendingDirectories.size >
          100000
        )
          throw new Error("依赖解析超过 100000 个候选路径，请缩小项目范围");
        const directoryNames = [...pendingDirectories];
        for (let start = 0; start < directoryNames.length; start += 16) {
          signal?.throwIfAborted();
          await Promise.all(
            directoryNames.slice(start, start + 16).map(async (name) => {
              directories.set(name, await files.directories(name));
            }),
          );
        }
        pendingDirectories.clear();
        const names = [...pending];
        pending.clear();
        // Bound concurrent filesystem/Git work without bypassing path validation.
        for (let start = 0; start < names.length; start += 16) {
          signal?.throwIfAborted();
          await Promise.all(
            names.slice(start, start + 16).map(async (name) => {
              const value = await files.read(name);
              bytes += Buffer.byteLength(value ?? "");
              if (bytes > 64 * 1024 * 1024)
                throw new Error("依赖解析内容超过 64 MB，请缩小项目范围");
              contents.set(name, value);
            }),
          );
        }
        continue;
      }
      const errors = [...configErrors, ...(parsed?.errors ?? [])].filter(
        (error) => ![18002, 18003].includes(error.code),
      );
      if (errors.length)
        throw new Error(
          `无法解析项目配置：${ts.flattenDiagnosticMessageText(errors[0].messageText, "\n")}`,
        );
      const definition = definitions?.find(
        (item) => item.kind !== ts.ScriptElementKind.alias,
      );
      if (!definition) return null;
      const targetText = contents.get(resolve(definition.fileName));
      const targetPath = files.relative(definition.fileName);
      if (targetText === undefined || targetPath === null) return null;
      return {
        path: files.displayPath(targetPath),
        version: files.version,
        revision: createHash("sha256").update(targetText).digest("hex"),
        ...(files.version === "head" ? { head: files.info.head! } : {}),
        from: definition.textSpan.start,
        to: definition.textSpan.start + definition.textSpan.length,
      };
    }
    throw new Error("依赖层级超过解析上限，请检查循环配置或缩小项目范围");
  } finally {
    previousService?.dispose();
  }
}
