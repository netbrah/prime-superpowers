import test from "node:test";
import assert from "node:assert/strict";
import { chmod, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { runStaticDoctor } from "../lib/doctor.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");

test("static doctor passes structural checks without proxy secrets", async () => {
  const result = await runStaticDoctor({ kitRoot: root, env: {} });
  assert.equal(result.ok, true, `expected exit 0, got ${result.code}`);
  assert.equal(result.diagnostics.some((item) => item.code === "N_PROXY_KEY"), true);
  assert.equal(result.diagnostics.some((item) => /secret|key-/i.test(item.detail)), false);
});

test("live doctor requires proxy configuration without exposing values", async () => {
  const result = await runStaticDoctor({ kitRoot: root, env: {}, live: true });
  assert.equal(result.ok, false);
  assert.equal(result.code, "E_MISSING_KEY");
  assert.doesNotMatch(JSON.stringify(result), /sentinel-secret/);
});

test("doctor detects effective-depth and tracked-template drift", async (t) => {
  const kitRoot = await mkdtemp(join(tmpdir(), "doctor-drift-"));
  t.after(() => rm(kitRoot, { recursive: true, force: true }));
  await cp(root, kitRoot, {
    recursive: true,
    filter: (source) => !source.includes("/.git") && !source.includes("/.state") &&
      !source.includes("/toolchain/node_modules") && !source.includes("/tests/.artifacts"),
  });
  const settingsPath = join(kitRoot, "agent-home/settings.json");
  const settings = JSON.parse(await readFile(settingsPath, "utf8"));
  settings.rlmMaxDepth = 2;
  await writeFile(settingsPath, JSON.stringify(settings));
  const result = await runStaticDoctor({ kitRoot, env: {} });
  assert.equal(result.ok, false);
  assert.equal(
    result.diagnostics.some((item) => item.code === "E_EFFECTIVE_DEPTH_OVERRIDE"),
    true,
  );
});

test("package acceptance harness fails closed on a malformed manifest invocation", async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "package-fail-closed-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  await cp(join(root, "tests/test-package.sh"), join(fixture, "tests/test-package.sh"), {
    recursive: true,
  }).catch(async () => {
    await cp(join(root, "tests"), join(fixture, "tests"), { recursive: true });
  });
  await rm(join(fixture, "tests"), { recursive: true, force: true });
  await cp(join(root, "tests"), join(fixture, "tests"), {
    recursive: true,
    filter: (source) => !source.includes("/.artifacts"),
  });
  await cp(join(root, "docs"), join(fixture, "docs"), { recursive: true });
  await writeFile(join(fixture, "tests/package-manifest.d/99-invalid.sh"), "package_file\n");
  await chmod(join(fixture, "tests/test-package.sh"), 0o755);
  await assert.rejects(
    execFileAsync("bash", [join(fixture, "tests/test-package.sh")], { timeout: 30_000 }),
    (error) => {
      assert.notEqual(error.code, 0);
      assert.match(`${error.stdout}${error.stderr}`, /unbound variable|package_file/);
      return true;
    },
  );
});
