import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { Workspace } from "./workspace.js";
import { emptyState } from "./shared.js";

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "visualfiles-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, "repo");
  await mkdir(root);
  await writeFile(join(root, "Original.txt"), "original example\n");
  await writeFile(join(root, ".gitignore"), "ignored/\n");
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", root, ...args], { stdio: "pipe" });
  git("init", "-b", "main");
  git("add", ".");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    "fixture",
  );
  const workspace = new Workspace(
    await realpath(root),
    join(directory, "state"),
  );
  await workspace.refreshInfo();
  return { directory, root, workspace };
}

test("workspace paths reject escape, wrong case and external symlinks", async (t) => {
  const { directory, root, workspace } = await fixture(t);
  await mkdir(join(directory, "outside"));
  await writeFile(join(directory, "outside", "secret.txt"), "outside");
  await symlink(join(directory, "outside"), join(root, "external"));
  await assert.rejects(() => workspace.path("../outside/secret.txt"));
  await assert.rejects(() => workspace.path("external/secret.txt"));
  await assert.rejects(() => workspace.path("original.txt"));
  assert.equal(
    await workspace.path("Original.txt"),
    join(await realpath(root), "Original.txt"),
  );
});

test("file reads preserve HEAD, revisions and preview limits", async (t) => {
  const { root, workspace } = await fixture(t);
  await writeFile(join(root, "Original.txt"), "changed example\r\n");
  await writeFile(join(root, "binary.bin"), Buffer.from([1, 0, 2]));
  await writeFile(
    join(root, "image.png"),
    Buffer.from("89504e470d0a1a0a", "hex"),
  );
  await writeFile(
    join(root, "large.txt"),
    Buffer.alloc(12 * 1024 * 1024 + 1, 65),
  );
  await workspace.refreshInfo();
  const file = await workspace.file("Original.txt");
  assert.equal(file.head.text, "original example\n");
  assert.equal(file.current.text, "changed example\r\n");
  assert.equal(file.current.revision?.length, 64);
  assert.equal(file.hasDiff, true);
  assert.equal((await workspace.file("binary.bin")).current.binary, true);
  assert.match(
    (await workspace.file("image.png")).current.image!,
    /^data:image\/png;base64,/,
  );
  assert.equal((await workspace.file("large.txt")).current.tooLarge, true);
  assert.equal((await workspace.file("missing.txt")).current.exists, false);
});

test("file operations preserve sources on conflicts and save browsing state", async (t) => {
  const { root, workspace } = await fixture(t);
  await workspace.mutate("createFile", "empty.txt");
  assert.equal((await stat(join(root, "empty.txt"))).size, 0);
  await assert.rejects(() => workspace.mutate("createFile", "empty.txt"));
  await workspace.mutate("createDirectory", "destination");
  assert.equal(
    await workspace.mutate("copy", "Original.txt", "destination/copy.txt"),
    "destination/copy.txt",
  );
  assert.equal(
    await workspace.mutate("copy", "Original.txt", "destination/copy.txt"),
    "destination/copy 副本.txt",
  );
  await assert.rejects(() =>
    workspace.mutate("move", "Original.txt", "destination/copy.txt"),
  );
  assert.equal(
    await readFile(join(root, "Original.txt"), "utf8"),
    "original example\n",
  );
  await assert.rejects(() =>
    workspace.mutate("copy", "destination", "destination/child"),
  );
  await assert.rejects(() => workspace.mutate("trash", ""));
  await workspace.mutate("move", "Original.txt", "original.txt");
  assert.equal((await readdir(root)).includes("original.txt"), true);
  const state = {
    ...emptyState(),
    treeWidth: 879,
    expanded: ["", "destination"],
  };
  await workspace.saveState(state);
  assert.deepEqual(await workspace.loadState(), state);
});

test("search preserves case sensitivity and ignored-file controls", async (t) => {
  const executable = process.env.VISUALFILES_RG ?? "rg";
  try {
    execFileSync(executable, ["--version"], { stdio: "ignore" });
  } catch {
    t.skip("ripgrep is required for search integration");
    return;
  }
  const { root, workspace } = await fixture(t);
  await mkdir(join(root, "ignored"));
  await writeFile(join(root, "ignored", "extra.txt"), "example ignored\n");
  assert.equal(
    (await workspace.search("Original", "name", false)).results.length,
    1,
  );
  assert.equal(
    (await workspace.search("original", "name", false)).results.length,
    0,
  );
  assert.equal(
    (await workspace.search("example", "text", false)).results.length,
    1,
  );
  assert.equal(
    (await workspace.search("example", "text", true)).results.length,
    2,
  );
});
