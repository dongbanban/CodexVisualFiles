import ts from "typescript";
import type { DefinitionLocation } from "./shared.js";

export function definitionAt(
  path: string,
  text: string,
  position: number,
): DefinitionLocation | null {
  if (!/\.(?:[cm]?[jt]s|[jt]sx)$/i.test(path))
    throw new Error(
      "定义跳转目前仅支持 JavaScript / TypeScript（含 JSX、TSX）中的同文件声明",
    );
  if (!Number.isInteger(position) || position < 0 || position > text.length)
    throw new Error("代码位置已变化，请重新定位后再跳转");
  const file = "/" + path;
  const snapshot = ts.ScriptSnapshot.fromString(text);
  const service = ts.createLanguageService(
    {
      getCompilationSettings: () => ({
        allowJs: true,
        noLib: true,
        noResolve: true,
        jsx: ts.JsxEmit.Preserve,
        target: ts.ScriptTarget.Latest,
      }),
      getScriptFileNames: () => [file],
      getScriptVersion: () => "0",
      getScriptSnapshot: (name) => (name === file ? snapshot : undefined),
      getCurrentDirectory: () => "/",
      getDefaultLibFileName: () => "/lib.d.ts",
      fileExists: (name) => name === file,
      readFile: (name) => (name === file ? text : undefined),
      useCaseSensitiveFileNames: () => true,
    },
    ts.createDocumentRegistry(true),
  );
  try {
    const definition = service
      .getDefinitionAtPosition(file, position)
      ?.find((item) => item.fileName === file);
    return definition
      ? {
          from: definition.textSpan.start,
          to: definition.textSpan.start + definition.textSpan.length,
        }
      : null;
  } finally {
    service.dispose();
  }
}
