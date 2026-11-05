import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

const check = process.argv[2] === "--check";
const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8"));
const { version } = await readJson("package.json");
assert.match(version, /^\d+\.\d+\.\d+$/, "发布版本必须使用 major.minor.patch");
const lock = await readJson("package-lock.json");
assert.equal(lock.version, version, "请使用 npm version 同步锁文件版本");
assert.equal(lock.packages[""].version, version, "锁文件根包版本不一致");

const manifestPath = ".codex-plugin/plugin.json";
const manifest = await readJson(manifestPath);
const updates: Array<[string, string]> = [
  [manifestPath, JSON.stringify({ ...manifest, version }, null, 2) + "\n"],
];
for (const [path, pattern, replacement] of [
  [
    "src/shared.ts",
    /export const VERSION = "[^"]+";/,
    `export const VERSION = "${version}";`,
  ],
  ["README.md", /当前版本 \*\*\d+\.\d+\.\d+\*\*/, `当前版本 **${version}**`],
] as const) {
  const text = await readFile(path, "utf8");
  assert.match(text, pattern, `${path} 缺少版本声明`);
  updates.push([path, text.replace(pattern, replacement)]);
}
for (const [path, text] of updates) {
  if (check)
    assert.equal(
      await readFile(path, "utf8"),
      text,
      `${path} 与 package.json 版本不一致`,
    );
  else await writeFile(path, text);
}
console.log(`${check ? "Checked" : "Synchronized"} version ${version}`);
