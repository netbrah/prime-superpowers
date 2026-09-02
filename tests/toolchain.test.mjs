import assert from "node:assert/strict";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bootstrap = path.join(root, "scripts", "bootstrap-toolchain");
const releaseUrl =
  "https://pub-728493de92a943e2a9b2d17b4719f318.r2.dev/releases/v0.8.1/prime-agent-0.8.1.tgz";
const published = new Map([
  ["prime-agent-0.8.1.tgz", "46c24db1782dd31adc35d5c6cbcc75564faba6ced3bf2ccf03d836ee77134475"],
  ["prime-agent-ai-0.8.1.tgz", "f6c3bdb6093bc24a327546fe865ef9a4a172c734fcd4c4093e30c19476f0134d"],
  ["prime-agent-core-0.8.1.tgz", "0cc3660953545f8ac9a7e704fcb9875f954d58c3085304080ef615c280aa5748"],
  ["prime-agent-tui-0.8.1.tgz", "bd07bccee0ca495565b1d62e9411f3fdebe49e3dfa52870564f08af5e61fde15"],
]);

async function makeKit() {
  const kit = await mkdtemp(path.join(os.tmpdir(), "prime-toolchain-kit-"));
  await mkdir(path.join(kit, "scripts"), { recursive: true });
  await cp(bootstrap, path.join(kit, "scripts", "bootstrap-toolchain"));
  await chmod(path.join(kit, "scripts", "bootstrap-toolchain"), 0o755);
  await cp(path.join(root, "toolchain"), path.join(kit, "toolchain"), {
    recursive: true,
    filter: (source) => !source.includes("node_modules"),
  });
  return kit;
}

async function fakePath({
  nodeVersion = "v22.20.0",
  npmVersion = "10.8.2",
  installedVersion = "0.8.1",
} = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "prime-toolchain-bin-"));
  const node = `#!/bin/sh
if [ "$1" = "--version" ]; then printf '%s\\n' '${nodeVersion}'; exit 0; fi
exec "$REAL_NODE" "$@"
`;
  const npm = `#!/bin/sh
if [ "$1" = "--version" ]; then printf '%s\\n' '${npmVersion}'; exit 0; fi
printf '%s|kernel=%s|tools=%s|secret=%s\\n' "$*" "\${PRIME_AGENT_BOOTSTRAP_KERNEL_ON_INSTALL-}" "\${PRIME_AGENT_BOOTSTRAP_TOOLS_ON_INSTALL-}" "\${PRIME_LLM_KEY-unset}" >> "$CALL_LOG"
[ "$1" = "ci" ] || exit 92
shift
[ "$1" = "--prefix" ] || exit 93
prefix=$2
mkdir -p "$prefix/node_modules/prime-agent" "$prefix/node_modules/.bin"
cat > "$prefix/node_modules/prime-agent/package.json" <<'JSON'
{"name":"prime-agent","version":"${installedVersion}","bin":{"prime-agent":"dist/bundle/cli.js"},"engines":{"node":">=22.8.0"}}
JSON
cat > "$prefix/node_modules/.bin/prime-agent" <<'SH'
#!/bin/sh
printf '%s\\n' '${installedVersion}' >&2
SH
chmod +x "$prefix/node_modules/.bin/prime-agent"
mkdir -p "$PRIME_AGENT_CODING_AGENT_DIR/bin" "$PRIME_AGENT_KERNEL_VENV/bin"
for tool in rg fd; do
  cat > "$PRIME_AGENT_CODING_AGENT_DIR/bin/$tool" <<'SH'
#!/bin/sh
exit 0
SH
  chmod +x "$PRIME_AGENT_CODING_AGENT_DIR/bin/$tool"
done
cat > "$PRIME_AGENT_KERNEL_VENV/bin/python" <<'SH'
#!/bin/sh
exit 0
SH
chmod +x "$PRIME_AGENT_KERNEL_VENV/bin/python"
exit 0
`;
  await Promise.all([
    writeFile(path.join(dir, "node"), node),
    writeFile(path.join(dir, "npm"), npm),
  ]);
  await Promise.all([
    chmod(path.join(dir, "node"), 0o755),
    chmod(path.join(dir, "npm"), 0o755),
  ]);
  return dir;
}

test("bootstrap rejects unsupported Node", async () => {
  const kit = await makeKit();
  const bin = await fakePath({ nodeVersion: "v22.7.0" });
  const callLog = path.join(bin, "calls.log");
  const result = spawnSync(path.join(kit, "scripts", "bootstrap-toolchain"), [], {
    cwd: kit,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      REAL_NODE: process.execPath,
      CALL_LOG: callLog,
    },
  });

  if (result.error) throw result.error;
  assert.equal(result.status, 1);
  assert.match(result.stderr, /E_NODE_VERSION/);
  assert.doesNotMatch(result.stderr, /E_NPM/);
  await assert.rejects(readFile(callLog), { code: "ENOENT" });
});

test("bootstrap rejects the wrong npm before installation", async () => {
  const kit = await makeKit();
  const bin = await fakePath({ npmVersion: "10.8.1" });
  const callLog = path.join(bin, "calls.log");
  const result = spawnSync(path.join(kit, "scripts", "bootstrap-toolchain"), [], {
    cwd: kit,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      REAL_NODE: process.execPath,
      CALL_LOG: callLog,
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /E_NPM_VERSION/);
  await assert.rejects(readFile(callLog), { code: "ENOENT" });
});

test("toolchain manifest and lock pin the complete Prime release graph", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(root, "toolchain", "package.json"), "utf8"),
  );
  const lock = JSON.parse(
    await readFile(path.join(root, "toolchain", "package-lock.json"), "utf8"),
  );
  assert.equal(manifest.packageManager, "npm@10.8.2");
  assert.deepEqual(manifest.scripts, undefined);
  assert.equal(manifest.dependencies["prime-agent"], releaseUrl);
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.packages[""].dependencies["prime-agent"], releaseUrl);

  const releaseEntries = Object.values(lock.packages).filter((entry) =>
    entry.resolved?.includes("/releases/v0.8.1/prime-agent"),
  );
  assert.equal(releaseEntries.length, 4);
  for (const entry of releaseEntries) {
    assert.equal(entry.version, "0.8.1");
    assert.match(entry.integrity, /^sha512-/);
  }
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (key && !entry.link && entry.resolved) {
      assert.match(entry.integrity ?? "", /^sha512-/, `${key} lacks lock integrity`);
    }
  }
});

test("SHA256SUMS contains the four independently published digests", async () => {
  const lines = (
    await readFile(path.join(root, "toolchain", "SHA256SUMS"), "utf8")
  )
    .trim()
    .split("\n");
  assert.equal(lines.length, 4);
  assert.deepEqual(
    new Map(lines.map((line) => {
      const match = line.match(/^([0-9a-f]{64})  (\S+)$/);
      assert.ok(match, `invalid checksum line: ${line}`);
      return [match[2], match[1]];
    })),
    published,
  );
});

test("bootstrap installs with bootstrap flags, no credential, and verifies artifacts", async () => {
  const kit = await makeKit();
  const bin = await fakePath();
  const callLog = path.join(bin, "calls.log");
  const result = spawnSync(path.join(kit, "scripts", "bootstrap-toolchain"), [], {
    cwd: kit,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      REAL_NODE: process.execPath,
      CALL_LOG: callLog,
      PRIME_LLM_KEY: "must-not-reach-npm",
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /toolchain=prime-agent version=0\.8\.1 state=verified/);
  assert.equal(
    await readFile(callLog, "utf8"),
    "ci --prefix " +
      path.join(kit, "toolchain") +
      "|kernel=1|tools=1|secret=unset\n",
  );
});

test("bootstrap fails closed on installed package identity mismatch", async () => {
  const kit = await makeKit();
  const bin = await fakePath({ installedVersion: "0.8.0" });
  const result = spawnSync(path.join(kit, "scripts", "bootstrap-toolchain"), [], {
    cwd: kit,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      REAL_NODE: process.execPath,
      CALL_LOG: path.join(bin, "calls.log"),
    },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /E_PACKAGE_IDENTITY/);
});

test("download verification rejects corrupted fixture tarballs and cleans its temporary directory", async () => {
  const kit = await makeKit();
  const bin = await fakePath();
  const tmp = await mkdtemp(path.join(os.tmpdir(), "prime-download-tmp-"));
  const fixtureBase = new URL(
    "./fixtures/toolchain/corrupt-release/",
    import.meta.url,
  ).href.replace(/\/$/, "");
  const result = spawnSync(
    path.join(kit, "scripts", "bootstrap-toolchain"),
    ["--verify-downloads"],
    {
      cwd: kit,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        REAL_NODE: process.execPath,
        CALL_LOG: path.join(bin, "calls.log"),
        TMPDIR: tmp,
        PRIME_TOOLCHAIN_RELEASE_BASE_URL: fixtureBase,
      },
    },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /E_DOWNLOAD_CHECKSUM.*prime-agent-0\.8\.1\.tgz/);
  assert.deepEqual(await readdir(tmp), []);
});
