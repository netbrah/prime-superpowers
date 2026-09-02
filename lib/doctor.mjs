import { constants } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

import { PROTECTED_VARIABLES, generateModelsJson, loadConfig } from "./config.mjs";

const execFile = promisify(execFileCallback);
const PRIME_BIN =
  process.env.PRIME_REAL_BIN ??
  "/home/user/workspace/.tools/prime-install/node_modules/.bin/prime-agent";

function diagnostic(code, state, detail) {
  return { code, state, detail };
}

async function command(executable, args = []) {
  try {
    const { stdout, stderr } = await execFile(executable, args, {
      encoding: "utf8",
      timeout: 60_000,
      env: { ...process.env, PRIME_AGENT_TELEMETRY: "off", NO_COLOR: "1" },
    });
    return (stdout || stderr).trim();
  } catch (error) {
    return { error };
  }
}

async function executable(path) {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function runStaticDoctor({ kitRoot, env = process.env, live = false } = {}) {
  const diagnostics = [];
  const add = (code, state, detail) => diagnostics.push(diagnostic(code, state, detail));
  const nodeVersion = process.versions.node;
  const [major, minor] = nodeVersion.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 8)) {
    add("E_NODE_VERSION", "error", `Node.js >=22.8.0 required; found ${nodeVersion}`);
  } else add("NODE_VERSION", "ok", nodeVersion);

  const npm = await command("npm", ["--version"]);
  if (npm !== "10.8.2") add("E_NPM_VERSION", "error", `expected 10.8.2; found ${npm}`);
  else add("NPM_VERSION", "ok", npm);

  const primeVersion = await command(PRIME_BIN, ["--version"]);
  if (primeVersion !== "0.8.1") add("E_PACKAGE_IDENTITY", "error", "Prime 0.8.1 is unavailable");
  else add("PRIME_VERSION", "ok", primeVersion);

  for (const [name, path] of [
    ["kernel", join(kitRoot, ".state/toolchain/kernel-venv/bin/python")],
    ["rg", join(kitRoot, ".state/toolchain/agent-home/bin/rg")],
    ["fd", join(kitRoot, ".state/toolchain/agent-home/bin/fd")],
  ]) {
    if (await executable(path)) add(`TOOL_${name.toUpperCase()}`, "ok", path);
    else {
      const fallback = await command("sh", ["-c", `command -v ${name === "kernel" ? "python3" : name}`]);
      if (typeof fallback === "string" && fallback) add(`TOOL_${name.toUpperCase()}`, "ok", fallback);
      else add("E_TOOL_MISSING", "error", `${name} is not executable`);
    }
  }

  const requiredFiles = [
    "agent-home/AGENTS.md",
    "agent-home/extensions/prime-superpowers.js",
    "agent-home/settings.json",
    "agent-home/skills/model-policy/SKILL.md",
    "agent-home/skills/prime-rlm-dispatch/SKILL.md",
    "agent-home/skills/subagent-driven-development/SKILL.md",
    "UPSTREAM.md",
  ];
  for (const relative of requiredFiles) {
    try {
      const info = await stat(join(kitRoot, relative));
      if (!info.isFile()) throw new Error("not a file");
    } catch {
      add("E_TRACKED_TEMPLATE_DRIFT", "error", `missing ${relative}`);
    }
  }

  try {
    const settings = JSON.parse(await readFile(join(kitRoot, "agent-home/settings.json"), "utf8"));
    const pinned = settings.packages?.some(
      (entry) =>
        entry.source === "git:github.com/obra/superpowers@v6.3.0" &&
        Array.isArray(entry.extensions) &&
        entry.extensions.length === 0,
    );
    if (settings.rlmMaxDepth !== 1 || !pinned) {
      add("E_EFFECTIVE_DEPTH_OVERRIDE", "error", "template settings violate runtime predicates");
    } else add("TEMPLATE_SETTINGS", "ok", "depth=1 package=pinned extensions=filtered");
  } catch {
    add("E_TRACKED_TEMPLATE_DRIFT", "error", "settings.json is unreadable");
  }

  try {
    const config = loadConfig({
      kitRoot,
      targetRoot: kitRoot,
      env: {
        ...env,
        PRIME_BASE_URL: env.PRIME_BASE_URL || "https://doctor.invalid",
        PRIME_LLM_KEY: env.PRIME_LLM_KEY || "doctor-sentinel",
      },
    });
    const generated = generateModelsJson(config);
    const selectors = Object.values(generated.providers).flatMap((provider) =>
      provider.models.map((model) => `${provider.id}/${model.id}`),
    );
    if (selectors.length !== 5) add("E_MISSING_MODEL", "error", `expected five selectors; found ${selectors.length}`);
    else add("MODEL_PROFILES", "ok", selectors.join(","));
    if (config.protectedViolations.length) {
      add("E_PROTECTED_VARIABLE", "error", config.protectedViolations.join(","));
    }
  } catch (error) {
    add("E_DIALECT_PATH", "error", error.message);
  }

  if (PROTECTED_VARIABLES.length < 10) add("E_PROTECTED_VARIABLE", "error", "protected variable set is incomplete");
  else add("PROTECTED_VARIABLES", "ok", String(PROTECTED_VARIABLES.length));

  try {
    const skills = await readdir(join(kitRoot, "agent-home/skills"));
    if (!["model-policy", "prime-rlm-dispatch", "subagent-driven-development", "using-superpowers"]
      .every((name) => skills.includes(name))) {
      add("E_PACKAGE_UNRESOLVED", "error", "minimum local skills are incomplete");
    } else add("SKILLS", "ok", skills.sort().join(","));
  } catch {
    add("E_PACKAGE_UNRESOLVED", "error", "skills directory is unreadable");
  }

  for (const relative of ["prime", "scripts/bootstrap-toolchain", "scripts/gate", "scripts/workflow-controller"]) {
    if (!(await executable(join(kitRoot, relative)))) add("E_EXECUTABLE_BIT", "error", relative);
  }

  if (!env.PRIME_LLM_KEY) add("N_PROXY_KEY", "notice", "live provider checks require PRIME_LLM_KEY");
  if (live && !env.PRIME_LLM_KEY) add("E_MISSING_KEY", "error", "--live requires PRIME_LLM_KEY");
  if (live && !env.PRIME_BASE_URL) add("E_PROXY_UNREACHABLE", "error", "--live requires PRIME_BASE_URL");

  const firstError = diagnostics.find((entry) => entry.state === "error");
  return { ok: !firstError, code: firstError?.code, diagnostics };
}
