import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { INTRODUCED_LATER_RESOURCES } from "./fixtures/extension-api.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const agentHome = path.join(root, "agent-home");
const skill = (...parts) => path.join(agentHome, "skills", ...parts);
const task10Files = [
  skill("using-superpowers", "SKILL.md"),
  skill("subagent-driven-development", "SKILL.md"),
  skill("subagent-driven-development", "implementer-prompt.md"),
  skill("subagent-driven-development", "task-reviewer-prompt.md"),
  skill("subagent-driven-development", "re-review-prompt.md"),
  skill("subagent-driven-development", "final-reviewer-prompt.md"),
  skill("prime-rlm-dispatch", "SKILL.md"),
  skill("prime-rlm-dispatch", "worker-prompt.md"),
  skill("prime-rlm-dispatch", "reviewer-prompt.md"),
  skill("model-policy", "SKILL.md"),
  skill("model-policy", "novelty-prompt.md"),
];
const prompts = task10Files.filter((file) => file.endsWith("-prompt.md") || /\/(?:worker|reviewer)-prompt\.md$/.test(file));

async function text(file) {
  return readFile(file, "utf8");
}

async function combined(files = task10Files) {
  return (await Promise.all(files.map(text))).join("\n");
}

test("prime-rlm-dispatch skill exists", async () => {
  await assert.doesNotReject(readFile(skill("prime-rlm-dispatch", "SKILL.md"), "utf8"));
});

test("dispatch contract requires disk report and parent signal", async () => {
  const contract = await text(skill("prime-rlm-dispatch", "SKILL.md"));
  assert.match(contract, /OUTPUT_REPORT_PATH/);
  assert.match(contract, /agent_message\.send\(receiver_role="parent"\)/);
  assert.match(contract, /durable reports and explicit parent notifications are the result channel/i);
});

test("model routing freezes exact role selector and effort matrix", async () => {
  const policy = await text(skill("model-policy", "SKILL.md"));
  const expected = [
    ["Coordinator", "prime-proxy-openai/gpt-5.6-sol", "max"],
    ["Gate implementer", "prime-proxy-openai/gpt-5.6-sol", "max"],
    ["TDD/blocker reviewer", "prime-proxy-openai/gpt-5.6-sol", "max"],
    ["Novel-value architect", "prime-proxy-anthropic/claude-opus-5", "high"],
    ["Frontier reviewer", "prime-proxy-anthropic/claude-opus-5", "high"],
    ["Balanced implementer", "prime-proxy-openai/gpt-5.6-terra", "max"],
    ["Mechanical implementer", "prime-proxy-anthropic/claude-sonnet-5", "high"],
    ["Context/blind-spot reviewer", "prime-proxy-google/gemini-3.1-pro-preview", "high"],
  ];
  for (const [role, selector, effort] of expected) {
    assert.ok(
      policy.includes(`| ${role} | \`${selector}\` | \`${effort}\``),
      `missing routing row for ${role}`,
    );
  }
  const geminiRow = policy.split("\n").find((line) => line.includes("gemini-3.1-pro-preview"));
  assert.match(geminiRow, /never implementation/i);
  assert.doesNotMatch(geminiRow, /implementer/i);
  assert.match(policy, /Sonnet[^\n]+only fully specified, deterministic mechanical work/i);
});

test("model discovery is one exact pass and controller commands are frozen", async () => {
  const dispatch = await text(skill("prime-rlm-dispatch", "SKILL.md"));
  assert.match(dispatch, /call `rlm\.find_models` exactly once/i);
  assert.match(dispatch, /Require exactly one configured match/i);
  assert.match(dispatch, /full `provider\/model` selector/i);
  for (const command of [
    "scripts/workflow-controller admit --task <id> --model <selector> --json",
    "scripts/workflow-controller report --child <id> --status <ok|fail> --json",
    "scripts/workflow-controller status --json",
  ]) assert.ok(dispatch.includes(command), `missing frozen command: ${command}`);
  assert.match(dispatch, /no silent fallback/i);
});

test("every dispatch prompt carries the validated cwd report deadline and notification envelope", async () => {
  assert.equal(prompts.length, 7);
  const fields = [
    "ROLE_MARKER:",
    "WORKTREE_ROOT:",
    "IMMUTABLE_INPUT_OR_RANGE:",
    "MUTATION_POLICY:",
    "OUTPUT_REPORT_PATH:",
    "DEADLINE_AT:",
    "PARENT_NOTIFICATION:",
    "MODEL_SELECTOR:",
    "EFFORT:",
  ];
  for (const file of prompts) {
    const prompt = await text(file);
    for (const field of fields) assert.ok(prompt.includes(field), `${path.basename(file)} missing ${field}`);
    assert.match(prompt, /os\.chdir\(worktree_root\)/);
    assert.match(prompt, /agent_message\.send\(receiver_role="parent"\)/);
    assert.match(prompt, /absolute/i);
  }
});

test("novelty is frozen before specification with real-risk evidence and Opus frontier seat", async () => {
  const novelty = await text(skill("model-policy", "novelty-prompt.md"));
  for (const token of ["before any spec is frozen", "value hypothesis", "two materially competing approaches", "cost-if-wrong", "real-source/real-format spike", "prime-proxy-anthropic/claude-opus-5", "EFFORT: `high`"]) {
    assert.ok(novelty.toLowerCase().includes(token.toLowerCase()), `missing novelty token: ${token}`);
  }
  assert.match(novelty, /actual dependency, protocol, file format, scale shape/i);
});

test("SDD is incremental and keeps product edits out of coordinator and reviewers", async () => {
  const sdd = await text(skill("subagent-driven-development", "SKILL.md"));
  for (const token of ["makes no product edits", "one plan item at a time", "Never batch plan items", "exact absence/import red", "named behavioral red", "fresh", "real source", "real binary/interface", "format-identical", "one exact `rlm.find_models` pass"]) {
    assert.ok(sdd.includes(token), `missing SDD token: ${token}`);
  }
  assert.match(sdd, /Rounds 1–3 may resume the original implementer; rounds 4–5 use a fresh, more capable implementer/);
  for (const reviewer of ["subagent-driven-development/task-reviewer-prompt.md", "subagent-driven-development/re-review-prompt.md", "subagent-driven-development/final-reviewer-prompt.md", "prime-rlm-dispatch/reviewer-prompt.md"]) {
    assert.match(await text(skill(...reviewer.split("/"))), /MUTATION_POLICY: `READ_ONLY`/);
  }
});

test("all later resources and local links resolve without false Prime mechanics", async () => {
  for (const relative of INTRODUCED_LATER_RESOURCES) await assert.doesNotReject(access(path.join(agentHome, relative)));
  await assert.rejects(access(path.join(agentHome, "resources.lock.json")), { code: "ENOENT" });

  for (const file of task10Files) {
    const body = await text(file);
    for (const match of body.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1].split("#", 1)[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      await assert.doesNotReject(access(path.resolve(path.dirname(file), target)), `${path.relative(root, file)} -> ${target}`);
    }
  }

  const all = await combined();
  assert.doesNotMatch(all, /\/rlm-max-depth/);
  assert.doesNotMatch(all, /depth (?:distinguishes|identifies|determines) (?:workers?|reviewers?|roles?)/i);
  assert.doesNotMatch(all, /RLM returns child results/i);
  assert.doesNotMatch(all, /Pi has no native subagent/i);
  assert.doesNotMatch(all, /(?:^|\s)(?:read|write|grep|ls) tool(?:s| mapping)/im);
  assert.equal((await readdir(skill("prime-rlm-dispatch"))).sort().join(","), "SKILL.md,reviewer-prompt.md,worker-prompt.md");
});
