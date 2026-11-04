import { cp, mkdir, rm, writeFile } from "node:fs/promises";

await rm("release", { recursive: true, force: true });
await mkdir("release", { recursive: true });
for (const path of [
  ".codex-plugin",
  "dist",
  "skills",
  "AGENTS.md",
  "docs",
  "README.md",
  "PLAN.md",
]) {
  await cp(path, `release/${path}`, { recursive: true });
}
await mkdir("release/scripts", { recursive: true });
await cp("scripts/start.sh", "release/scripts/start.sh");
await writeFile(
  "release/.mcp.json",
  JSON.stringify(
    {
      mcpServers: {
        visualfiles: {
          command: "/bin/sh",
          args: ["scripts/start.sh"],
          cwd: ".",
        },
      },
    },
    null,
    2,
  ) + "\n",
);
