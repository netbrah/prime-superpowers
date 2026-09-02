import assert from "node:assert/strict";
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gate = path.join(root, "scripts", "gate");

async function makeKit() {
  try {
    await access(gate);
  } catch {
    const missing = spawnSync(gate, [], { cwd: root, encoding: "utf8" });
    if (missing.error) throw missing.error;
  }

  const kit = await mkdtemp(path.join(os.tmpdir(), "prime-gate-kit-"));
  await mkdir(path.join(kit, "scripts"), { recursive: true });
  await cp(gate, path.join(kit, "scripts", "gate"));
  await chmod(path.join(kit, "scripts", "gate"), 0o755);
  return kit;
}

function runGate(kit, env = {}) {
  return spawnSync(path.join(kit, "scripts", "gate"), [], {
    cwd: kit,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("gate detects a syntax error in an existing POSIX shell file", async () => {
  const kit = await makeKit();
  await writeFile(
    path.join(kit, "broken-command"),
    "#!/bin/sh\nif then\n",
    { mode: 0o755 },
  );

  const result = runGate(kit);
  if (result.error) throw result.error;
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /E_SHELL_SYNTAX.*broken-command/);
});

test("gate fails when an introduced suite is missing and skips a future suite", async () => {
  const kit = await makeKit();
  await mkdir(path.join(kit, "tests", "package-manifest.d"), { recursive: true });
  await writeFile(path.join(kit, "tests", "test-package.sh"), "#!/bin/sh\nexit 0\n", {
    mode: 0o755,
  });
  await writeFile(
    path.join(kit, "tests", "package-manifest.d", "02-config.sh"),
    "# task marker\n",
  );
  const result = runGate(kit);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /suite=provider-config state=failed/);
  assert.match(result.stderr, /E_SUITE_MISSING.*tests\/provider-config\.test\.mjs/);
  assert.match(result.stdout, /suite=extension state=skipped/);
});

test("gate never sends unmatched globs to Node", async () => {
  const kit = await makeKit();
  const bin = await mkdtemp(path.join(os.tmpdir(), "prime-gate-bin-"));
  const log = path.join(bin, "node.log");
  await writeFile(
    path.join(bin, "node"),
    "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$NODE_LOG\"\nexit 0\n",
    { mode: 0o755 },
  );
  const result = runGate(kit, {
    PATH: `${bin}:${process.env.PATH}`,
    NODE_LOG: log,
  });
  assert.equal(result.status, 0, result.stderr);
  await assert.rejects(readFile(log), { code: "ENOENT" });
  assert.doesNotMatch(result.stdout + result.stderr, /\*\.test\.mjs/);
});

test("gate never passes a Node-shebang script to bash -n", async () => {
  const kit = await makeKit();
  await writeFile(
    path.join(kit, "node-command"),
    "#!/usr/bin/env node\nconst answer = () => ({ value: 42 });\n",
    { mode: 0o755 },
  );
  const result = runGate(kit);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /suite=shell state=activated/);
});

test("package driver sources fragments in order and rejects undeclared descendants", async () => {
  const kit = await mkdtemp(path.join(os.tmpdir(), "prime-package-kit-"));
  await mkdir(path.join(kit, "tests", "package-manifest.d"), { recursive: true });
  await mkdir(path.join(kit, "docs", "specs"), { recursive: true });
  await cp(path.join(root, "tests", "test-package.sh"), path.join(kit, "tests", "test-package.sh"));
  await cp(
    path.join(root, "docs", "specs", "2026-08-26-prime-superpowers-implementation-plan.md"),
    path.join(kit, "docs", "specs", "2026-08-26-prime-superpowers-implementation-plan.md"),
  );
  await writeFile(path.join(kit, ".gitignore"), "\n");
  await writeFile(path.join(kit, "LICENSE"), "fixture\n");
  await writeFile(
    path.join(kit, "tests", "package-manifest.d", "01-z-last.sh"),
    'package_file "LICENSE"\n',
  );
  await writeFile(
    path.join(kit, "tests", "package-manifest.d", "01-a-first.sh"),
    'package_file ".gitignore"\n',
  );

  const sorted = spawnSync("bash", [path.join(kit, "tests", "test-package.sh")], {
    cwd: kit,
    encoding: "utf8",
  });
  assert.equal(sorted.status, 0, sorted.stderr);
  assert.match(sorted.stdout, /1\.\.2\nok 1 - Task 1 owns \.gitignore/);

  await writeFile(
    path.join(kit, "tests", "package-manifest.d", "01-m-invalid.sh"),
    'package_file ".gitignore/undeclared-child"\n',
  );
  const invalid = spawnSync("bash", [path.join(kit, "tests", "test-package.sh")], {
    cwd: kit,
    encoding: "utf8",
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stdout, /code: E_PACKAGE_OWNERSHIP/);
});
