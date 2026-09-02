import test from "node:test";
import assert from "node:assert/strict";

import { applyArgvFirewall, FirewallError } from "../lib/argv-firewall.mjs";

const publicCommands = [
  "help", "agents", "list", "attach", "stop", "rename", "send", "schedule",
  "status", "doctor", "shutdown", "mcp", "package", "update", "model",
  "session", "config", "app", "daemon", "install", "manage", "remove",
  "uninstall",
];

test("rejects public command in first positional slot", async () => {
  await assert.rejects(
    applyArgvFirewall(["agents"]),
    (error) => error.code === "E_PUBLIC_COMMAND",
  );
});

test("rejects every public and removed Prime command in prompt position", async () => {
  for (const command of publicCommands) {
    await assert.rejects(
      applyArgvFirewall([command]),
      (error) => error.code === "E_PUBLIC_COMMAND" && !error.message.includes("secret"),
      command,
    );
  }
});

test("allows only presentation flags, validated modes, prompts and file references", async () => {
  const result = await applyArgvFirewall([
    "--print", "--mode=json", "--verbose", "--color", "never", "@brief.md",
    "implement it",
  ]);
  assert.deepEqual(result.forwardedArgv, [
    "--model", "prime-proxy-openai/gpt-5.6-sol:max",
    "--print", "--mode", "json", "--verbose",
    "@brief.md", "implement it",
  ]);
  assert.deepEqual(result.presentationEnv, { NO_COLOR: "1" });
  assert.equal(result.unsafe, false);
});

test("validates split and equal values and rejects repeats", async () => {
  await assert.rejects(applyArgvFirewall(["--mode", "daemon"]), /E_ARG_VALUE/);
  await assert.rejects(applyArgvFirewall(["--mode=acp"]), /E_ARG_VALUE/);
  await assert.rejects(
    applyArgvFirewall(["--mode", "text", "--mode=json"]),
    /E_ARG_REPEATED/,
  );
  await assert.rejects(applyArgvFirewall(["--mode"]), /E_ARG_VALUE/);
});

test("rejects invariant, resource, session, daemon, autonomous, and unknown flags", async () => {
  const denied = [
    "--model=x", "--provider", "--thinking=max", "--cwd=.", "--system-prompt=x",
    "--append-system-prompt=x", "--daemon-socket=x", "--offline", "--goal=x",
    "--session-dir=x", "--no-session", "--continue", "-c", "--resume=x", "-r",
    "--fork=x", "--tools=x", "-t", "--no-tools", "-nt", "--extension=x", "-e",
    "--skill=x", "--theme=x", "--no-extensions", "--autonomous", "--api-key=x",
    "--models=x", "--unknown", "-x",
  ];
  for (const arg of denied) {
    await assert.rejects(
      applyArgvFirewall([arg]),
      (error) => error instanceof FirewallError && /^E_ARG_/.test(error.code),
      arg,
    );
  }
});

test("unsafe mode requires an interactive terminal and explicit confirmation", async () => {
  const banners = [];
  const accepted = await applyArgvFirewall(
    ["--unsafe-prime-args", "--model", "other"],
    {
      stdinIsTTY: true,
      stdoutIsTTY: true,
      confirmUnsafe: async (banner) => {
        banners.push(banner);
        return true;
      },
    },
  );
  assert.equal(accepted.unsafe, true);
  assert.deepEqual(accepted.forwardedArgv, ["--model", "other"]);
  assert.match(banners[0], /WORKFLOW GUARANTEES ARE DISABLED/);

  await assert.rejects(
    applyArgvFirewall(["--unsafe-prime-args", "x"], {
      stdinIsTTY: false,
      stdoutIsTTY: true,
    }),
    /E_UNSAFE_HEADLESS/,
  );
  await assert.rejects(
    applyArgvFirewall(["--unsafe-prime-args", "--print"], {
      stdinIsTTY: true,
      stdoutIsTTY: true,
      confirmUnsafe: async () => true,
    }),
    /E_UNSAFE_HEADLESS/,
  );
  await assert.rejects(
    applyArgvFirewall(["--unsafe-prime-args", "x"], {
      stdinIsTTY: true,
      stdoutIsTTY: true,
      confirmUnsafe: async () => false,
    }),
    /E_UNSAFE_DECLINED/,
  );
});

test("diagnostics are structured and redact argument values", async () => {
  const secret = "sk-live-secret";
  await assert.rejects(
    applyArgvFirewall([`--api-key=${secret}`]),
    (error) => {
      assert.equal(error.code, "E_ARG_DENIED");
      assert.equal(error.diagnostic.argument, "--api-key");
      assert.doesNotMatch(JSON.stringify(error.diagnostic), new RegExp(secret));
      return true;
    },
  );
});
