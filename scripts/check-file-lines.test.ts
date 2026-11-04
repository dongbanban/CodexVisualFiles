import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("line limit includes new files and preserves generated and deleted exceptions", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "visualfiles-lines-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  execFileSync("git", ["init"], { cwd: directory, stdio: "ignore" });
  const check = () =>
    spawnSync(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        fileURLToPath(new URL("./check-file-lines.ts", import.meta.url)),
      ],
      { cwd: directory, encoding: "utf8" },
    );
  await writeFile(join(directory, "new.ts"), "a\n".repeat(500));
  assert.equal(check().status, 0);
  await writeFile(join(directory, "new.ts"), "a\n".repeat(501));
  const result = check();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /new.ts: 501 lines/);
  await writeFile(join(directory, "new.ts"), "a\r\n".repeat(499) + "a");
  assert.equal(check().status, 0);
  await writeFile(join(directory, "package-lock.json"), "a\n".repeat(9000));
  assert.equal(check().status, 0);
  await writeFile(join(directory, ".gitignore"), "dist/\n");
  await mkdir(join(directory, "dist"));
  await writeFile(join(directory, "dist", "generated.js"), "a\n".repeat(501));
  assert.equal(check().status, 0);
  await writeFile(join(directory, "deleted.ts"), "a\n".repeat(501));
  execFileSync("git", ["add", "deleted.ts"], { cwd: directory });
  await rm(join(directory, "deleted.ts"));
  assert.equal(check().status, 0);
});
