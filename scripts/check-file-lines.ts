import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";

const limit = 500;
const generatedFiles = new Set(["package-lock.json"]);
const textExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".md",
  ".json",
  ".yaml",
  ".yml",
  ".svg",
]);
const paths = new Set(
  execFileSync("git", [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ])
    .toString()
    .split("\0")
    .filter(Boolean),
);
const violations: string[] = [];
let checked = 0;

for (const path of paths) {
  if (generatedFiles.has(path) || !textExtensions.has(extname(path))) continue;
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
    throw error;
  }
  const lines = text
    ? text.split(/\r?\n/).length - Number(text.endsWith("\n"))
    : 0;
  checked++;
  if (lines > limit) violations.push(`${path}: ${lines} lines`);
}

if (violations.length) {
  console.error(
    `Authored files must not exceed ${limit} lines:\n${violations.join("\n")}`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `Checked ${checked} authored text files: all within ${limit} lines`,
  );
}
