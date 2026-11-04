import type {
  OpenAIMessageParams,
  OpenAIMessage,
} from "@openai/mcp-extensions/app";
import type { Version } from "./shared.js";

export interface ConversationReference {
  absolutePath: string;
  directory: boolean;
  version?: Version;
  text?: string;
  from?: number;
  to?: number;
}
export type ConversationTarget = "active" | "new";

export function referenceDraft(
  reference: ConversationReference,
  target: ConversationTarget,
): OpenAIMessageParams {
  if (
    !reference.absolutePath.startsWith("/") ||
    reference.absolutePath.includes("\0")
  )
    throw new Error("引用需要有效的绝对路径");
  const encoded = reference.absolutePath
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const uri = new URL(
    `file://${encoded}${reference.directory && !encoded.endsWith("/") ? "/" : ""}`,
  );
  const name = reference.absolutePath.split("/").filter(Boolean).pop() ?? "/";
  let content: OpenAIMessageParams["content"];
  if (reference.text !== undefined) {
    const range = reference.from
      ? `L${reference.from}-L${reference.to ?? reference.from}`
      : "";
    uri.hash = [reference.version === "head" ? "HEAD" : "", range]
      .filter(Boolean)
      .join(":");
    const label = `文件：${reference.absolutePath}\n版本：${reference.version === "head" ? "HEAD（修改前）" : "当前磁盘内容"}${range ? `\n行号：${range}` : ""}`;
    content = [
      {
        type: "resource",
        resource: {
          uri: uri.href,
          mimeType: "text/plain",
          text: `${label}\n\n${reference.text}`,
        },
      },
    ];
  } else {
    content = [
      {
        type: "resource_link",
        uri: uri.href,
        name,
        ...(reference.directory ? { mimeType: "inode/directory" } : {}),
      },
    ];
  }
  return {
    role: "user",
    content,
    _meta: { "openai/message": { target, send: false } },
  };
}
export async function addReferenceDraft(
  api: Pick<OpenAIMessage, "send"> | undefined,
  capability: unknown,
  reference: ConversationReference,
  target: ConversationTarget,
) {
  const draft =
    capability && typeof capability === "object" && "draft" in capability
      ? capability.draft
      : null;
  if (!api || !draft || typeof draft !== "object")
    throw new Error("当前客户端不支持添加引用草稿，请更新客户端或复制路径");
  const result = await api.send(referenceDraft(reference, target));
  if (result.isError) throw new Error("未能添加引用草稿，请稍后重试");
}
