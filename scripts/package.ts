import { cp, mkdir, rm } from "node:fs/promises";

await rm("release", { recursive: true, force: true });
await mkdir("release", { recursive: true });
for (const path of [
  ".codex-plugin",
  ".mcp.json",
  "dist",
  "skills",
  "AGENTS.md",
  "docs",
  "README.md",
  "PLAN.md",
]) {
  await cp(path, `release/${path}`, { recursive: true });
}
