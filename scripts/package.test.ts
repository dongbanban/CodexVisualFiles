import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import test from "node:test";
import { VERSION } from "../src/shared.js";

test("marketplace package includes portable launch configuration and matching versions", async () => {
  const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
  const marketplace = await json(".agents/plugins/marketplace.json");
  const directory = marketplace.plugins[0].source.path;
  assert.equal(directory, "./release");
  const config = await json(join(directory, ".mcp.json"));
  assert.deepEqual(config.mcpServers.visualfiles, {
    command: "/bin/sh",
    args: ["scripts/start.sh"],
    cwd: ".",
  });
  for (const path of [
    "package.json",
    ".codex-plugin/plugin.json",
    "release/.codex-plugin/plugin.json",
  ]) {
    assert.equal((await json(path)).version, VERSION);
  }
  const lock = await json("package-lock.json");
  assert.equal(lock.version, VERSION);
  assert.equal(lock.packages[""].version, VERSION);
  for (const path of [
    "dist/server.mjs",
    "dist/index.html",
    "dist/macos-trash",
    "scripts/start.sh",
  ]) {
    assert.ok((await readFile(join(directory, path))).length > 0);
  }
  assert.notEqual(
    (await stat(join(directory, "dist/macos-trash"))).mode & 0o111,
    0,
  );
  assert.equal(
    await readFile("scripts/start.sh", "utf8"),
    await readFile("release/scripts/start.sh", "utf8"),
  );
});

test("launcher resolves package paths with spaces and preserves explicit tool paths", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "visualfiles package "));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, "scripts"));
  await mkdir(join(directory, "dist"));
  const launcher = join(directory, "scripts/start.sh");
  await copyFile("scripts/start.sh", launcher);
  const node = join(directory, "node executable");
  await writeFile(
    node,
    '#!/bin/sh\nif [ "$1" = "-e" ]; then exit 0; fi\nprintf "%s\\n%s\\n%s\\n" "$1" "$VISUALFILES_CODEX" "$VISUALFILES_RG"\n',
    { mode: 0o755 },
  );
  const result = spawnSync("/bin/sh", [launcher], {
    cwd: tmpdir(),
    encoding: "utf8",
    env: {
      ...process.env,
      VISUALFILES_NODE: node,
      VISUALFILES_CODEX: "/custom/codex",
      VISUALFILES_RG: "/custom/rg",
    },
  });
  if (process.platform !== "darwin") {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /macOS/);
    return;
  }
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split("\n"), [
    join(await realpath(directory), "dist/server.mjs"),
    "/custom/codex",
    "/custom/rg",
  ]);
  await writeFile(node, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  const invalid = spawnSync("/bin/sh", [launcher], {
    encoding: "utf8",
    env: { ...process.env, VISUALFILES_NODE: node },
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Node.js 22/);
});

test(
  "distributed MCP server starts outside its package directory",
  { skip: process.platform !== "darwin", timeout: 15000 },
  async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "visualfiles installed "));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const installed = join(directory, "plugin");
    await cp("release", installed, { recursive: true });
    const environment = { ...process.env };
    delete environment.VISUALFILES_NODE;
    const child = spawn("/bin/sh", [join(installed, "scripts/start.sh")], {
      cwd: tmpdir(),
      stdio: ["pipe", "pipe", "pipe"],
      env: environment,
    });
    const lines = createInterface({ input: child.stdout });
    t.after(() => {
      child.kill();
      lines.close();
    });
    let error = "";
    child.stderr.on("data", (chunk) => {
      error += chunk;
    });
    const responses = lines[Symbol.asyncIterator]();
    const request = async (id: number, method: string, params?: object) => {
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
      );
      while (true) {
        const next = await responses.next();
        assert.equal(next.done, false, error);
        const message = JSON.parse(next.value!);
        if (message.id === id) return message;
      }
    };
    const initialized = await request(1, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "package-check", version: "1" },
    });
    assert.equal(initialized.result.serverInfo.version, VERSION);
    child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) +
        "\n",
    );
    const tools = await request(2, "tools/list");
    assert.equal(tools.result.tools.length, 5);
    const resource = await request(3, "resources/read", {
      uri: "ui://visualfiles/panel.html",
    });
    assert.match(resource.result.contents[0].text, /id="app"/);
  },
);
