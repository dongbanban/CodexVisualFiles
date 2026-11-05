import {
  App as McpApp,
  applyDocumentTheme,
} from "@modelcontextprotocol/ext-apps";
import { OpenAIExtensions } from "@openai/mcp-extensions/app";
import { VERSION, type Binding } from "../shared.js";

export const bridge = new McpApp({ name: "visualfiles", version: VERSION }, {});
export const extensions = new OpenAIExtensions(bridge);
export let initialBinding: Binding | null = null;
let receiveBinding: ((binding: Binding) => void) | null = null;
bridge.ontoolresult = (result) => {
  const data = result.structuredContent;
  if (data && typeof data === "object" && "bindingId" in data) {
    initialBinding = data as unknown as Binding;
    receiveBinding?.(initialBinding);
  }
};
bridge.onhostcontextchanged = (context) => {
  if (context.theme) {
    applyDocumentTheme(context.theme);
    document.documentElement.classList.toggle("dark", context.theme === "dark");
  }
};
export async function rpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await bridge.callServerTool({ name, arguments: args });
  if (result.isError)
    throw new Error(
      result.content
        ?.filter((item) => item.type === "text")
        .map((item) => (item as { text: string }).text)
        .join("\n") || "操作失败",
    );
  return result.structuredContent as T;
}

export async function openFileInCodex(path: string) {
  const files = extensions.files;
  if (!files)
    throw new Error("当前客户端不支持在 Codex 中打开文件，请更新客户端");
  await files.open(path);
}

export function onBinding(listener: (binding: Binding) => void) {
  receiveBinding = listener;
  return () => {
    receiveBinding = null;
  };
}
