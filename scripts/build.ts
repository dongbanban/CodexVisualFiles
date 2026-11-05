import { build } from "esbuild";
import { cp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const hash = createHash("sha256");
async function hashSource(path: string) {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = `${path}/${entry.name}`;
    if (entry.isDirectory()) await hashSource(file);
    else
      hash
        .update(file)
        .update("\0")
        .update(await readFile(file));
  }
}
await hashSource("src");
for (const path of ["package-lock.json", "scripts/build.ts"])
  hash
    .update(path)
    .update("\0")
    .update(await readFile(path));
const define = {
  __VISUALFILES_BUILD__: JSON.stringify(hash.digest("hex").slice(0, 10)),
};
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
  define: { ...define, "process.env.NODE_ENV": '"production"' },
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
  define,
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url); const __filename = import.meta.filename; const __dirname = import.meta.dirname;',
  },
});
await cp("node_modules/trash/lib/macos-trash", "dist/macos-trash");
await cp("node_modules/trash/license", "dist/trash-license.txt");
await cp("node_modules/typescript/LICENSE.txt", "dist/typescript-license.txt");
