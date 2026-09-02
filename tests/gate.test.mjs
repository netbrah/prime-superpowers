import assert from "node:assert/strict";
import { access, chmod, cp, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gate = path.join(root, "scripts", "gate");

test("gate detects a syntax error in an existing POSIX shell file", async () => {
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
  await writeFile(
    path.join(kit, "broken-command"),
    "#!/bin/sh\nif then\n",
    { mode: 0o755 },
  );

  const result = spawnSync(path.join(kit, "scripts", "gate"), [], {
    cwd: kit,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /E_SHELL_SYNTAX.*broken-command/);
});
