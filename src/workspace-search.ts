import { spawn } from "node:child_process";
import type { SearchResult } from "./shared.js";

export async function searchWorkspace(
  root: string,
  query: string,
  mode: "name" | "text",
  includeIgnored: boolean,
  changedPaths?: ReadonlySet<string>,
) {
  if (!query.trim()) return { results: [] as SearchResult[], truncated: false };
  const args =
    mode === "name"
      ? ["--files", "-0", "--hidden"]
      : [
          "--json",
          "--line-number",
          "--fixed-strings",
          "--hidden",
          "--max-columns",
          "500",
          "--max-columns-preview",
          "--",
          query,
          ".",
        ];
  if (includeIgnored) args.unshift("--no-ignore");
  args.unshift("--glob", "!.git/**");
  args.unshift("--case-sensitive");
  const executable = process.env.VISUALFILES_RG ?? "rg";
  return new Promise<{ results: SearchResult[]; truncated: boolean }>(
    (resolvePromise, reject) => {
      const child = spawn(executable, args, {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const results: SearchResult[] = [];
      let buffer = "";
      let error = "";
      let truncated = false;
      const separator = mode === "name" ? "\0" : "\n";
      child.stdout.setEncoding("utf8");
      child.on("error", () =>
        reject(new Error("全文和文件名搜索需要本机安装 ripgrep（rg）")),
      );
      child.stdout.on("data", (chunk) => {
        if (truncated) return;
        buffer += chunk.toString();
        let end: number;
        while ((end = buffer.indexOf(separator)) !== -1) {
          const record = buffer.slice(0, end);
          buffer = buffer.slice(end + separator.length);
          let result: SearchResult | undefined;
          if (mode === "name") {
            if (record.includes(query))
              result = { path: record.replace(/^\.\//, "") };
          } else {
            const item = JSON.parse(record);
            if (
              item.type === "match" &&
              typeof item.data.path.text === "string"
            )
              result = {
                path: item.data.path.text.replace(/^\.\//, ""),
                line: item.data.line_number,
                text: String(item.data.lines.text ?? "").trimEnd(),
              };
          }
          if (!result || (changedPaths && !changedPaths.has(result.path)))
            continue;
          if (results.length === 500) {
            truncated = true;
            child.kill();
            break;
          }
          results.push(result);
        }
      });
      child.stderr.on("data", (chunk) => {
        error += chunk;
      });
      child.on("close", (code) =>
        code === 0 || code === 1 || truncated
          ? resolvePromise({ results, truncated })
          : reject(new Error(error || "搜索失败")),
      );
    },
  );
}
