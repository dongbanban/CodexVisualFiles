import { build } from "esbuild";
import { cp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await promisify(execFile)(process.execPath, [
  "node_modules/@tailwindcss/cli/dist/index.mjs",
  "-i",
  "src/ui/globals.css",
  "-o",
  "dist/ui.css",
  "--minify",
]);
const css = await readFile("dist/ui.css", "utf8");
const ui = await build({
  entryPoints: ["src/ui/main.tsx"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".css": "text" },
});
await writeFile(
  "dist/index.html",
  `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>VisualFiles</title><style>${css}</style><body><main id="app" class="h-dvh overflow-hidden">正在连接 VisualFiles…</main><script type="module">${ui.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script></body></html>`,
);
await build({
  entryPoints: ["src/server.ts"],
  outfile: "dist/server.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url); const __filename = import.meta.filename; const __dirname = import.meta.dirname;',
  },
});
await cp("node_modules/trash/lib/macos-trash", "dist/macos-trash");
await cp("node_modules/trash/license", "dist/trash-license.txt");
await cp("node_modules/typescript/LICENSE.txt", "dist/typescript-license.txt");
