import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  chmod,
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const skillsRoot = path.join(root, "agent-home", "skills");
const usingRoot = path.join(skillsRoot, "using-superpowers");
const sddRoot = path.join(skillsRoot, "subagent-driven-development");

const upstream = {
  commit: "b36e0829c6d0140e93cfef2ca599b1b07d4a7797",
  scripts: {
    "scripts/review-package": "fac3d4bd7f94369e8037b9ead2a8a502dca6ab333902b560b9455dbb3c450ebe",
    "scripts/sdd-workspace": "95a09d9d3983ad1aafd093ca72b4587946dea885c6e302caa02a779a2f911c31",
    "scripts/task-brief": "d6954ef7841c7da3d77373e6ff5118b3f2f2e998606fd95d33e6527851bce044",
  },
  references: {
    "references/antigravity-tools.md": "4880f6de3da4e32f9659ebe7a72b9e0ebfff04e028c2ed96173f86d0387a04c0",
    "references/codex-tools.md": "1a38ad9b188c393052f58d95657a1c35ea6aafc8b5a27f198f3922912f70bbe7",
    "references/gemini-tools.md": "62b9157bcb0ee3c6784e3d0da0798ddfa5872f9e0c34bea48f3079dabea71965",
    "references/hermes-tools.md": "e2185c976a3c87503910e05e2aea58cc89bc8e569bb624b93df9958ac47a9190",
  },
  finalReviewer: "5eca5fcfd48a50e0a526ce5ffd64bf625d6b81bb46d11795274dae451fe6ffd4",
};

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(absolute)));
    else if (entry.name.endsWith(".md")) files.push(absolute);
  }
  return files;
}

test("both whole-directory skill overrides are vendored", async () => {
  assert.equal((await stat(usingRoot)).isDirectory(), true);
  assert.equal((await stat(sddRoot)).isDirectory(), true);
});

test("all overriding-skill relative links resolve locally", async () => {
  for (const directory of [usingRoot, sddRoot]) {
    for (const file of await markdownFiles(directory)) {
      const text = await readFile(file, "utf8");
      for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1].split("#", 1)[0];
        if (!target || /^[a-z]+:/i.test(target) || target.startsWith("#")) continue;
        const absolute = path.resolve(path.dirname(file), target);
        await assert.doesNotReject(
          access(absolute),
          `missing localized final-reviewer-prompt.md path: ${path.relative(root, file)} -> ${target}`,
        );
      }
    }
  }
});

test("incompatible Pi resources and extension-loading claims are absent", async () => {
  await assert.rejects(access(path.join(usingRoot, "references", "pi-tools.md")), { code: "ENOENT" });
  const text = (
    await Promise.all(
      [...(await markdownFiles(usingRoot)), ...(await markdownFiles(sddRoot))].map((file) =>
        readFile(file, "utf8"),
      ),
    )
  ).join("\n");
  assert.doesNotMatch(text, /pi-tools\.md/i);
  assert.doesNotMatch(text, /Pi has no native subagent/i);
  assert.doesNotMatch(text, /load(?:ing)? (?:the )?upstream (?:Superpowers )?extension/i);
});

test("skill frontmatter names exactly match directory names", async () => {
  for (const directory of [usingRoot, sddRoot]) {
    const skill = await readFile(path.join(directory, "SKILL.md"), "utf8");
    const name = /^---\nname:\s*([^\n]+)$/m.exec(skill)?.[1];
    assert.equal(name, path.basename(directory));
  }
});

test("vendored scripts are byte-identical and executable", async () => {
  for (const [relative, digest] of Object.entries(upstream.scripts)) {
    const file = path.join(sddRoot, relative);
    assert.equal(await sha256(file), digest);
    assert.notEqual((await stat(file)).mode & 0o111, 0, `${relative} is not executable`);
  }
});

test("safe sibling references and localized final reviewer preserve pinned bytes", async () => {
  for (const [relative, digest] of Object.entries(upstream.references)) {
    assert.equal(await sha256(path.join(usingRoot, relative)), digest);
  }
  const task10Manifest = path.join(root, "tests", "package-manifest.d", "10-workflow-contract.sh");
  const task10Present = await access(task10Manifest).then(
    () => true,
    () => false,
  );
  if (!task10Present) {
    assert.equal(await sha256(path.join(sddRoot, "final-reviewer-prompt.md")), upstream.finalReviewer);
  }
});

test("UPSTREAM records exact provenance and intentional policy-body diffs", async () => {
  const provenance = await readFile(path.join(root, "UPSTREAM.md"), "utf8");
  assert.match(provenance, new RegExp(upstream.commit));
  assert.match(provenance, /Superpowers v6\.3\.0/);
  for (const [relative, digest] of Object.entries({
    ...upstream.scripts,
    ...upstream.references,
  })) {
    assert.match(provenance, new RegExp(relative.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(provenance, new RegExp(digest));
  }
  assert.match(provenance, /intentional (?:Task 9|policy) diff/i);
  assert.match(provenance, /local SHA-256/i);
});

test("real helper interfaces create ignored workspace, task brief, and non-empty diff package", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "prime-vendor-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: temp });
    execFileSync("git", ["config", "user.email", "fixture@example.test"], { cwd: temp });
    execFileSync("git", ["config", "user.name", "Fixture"], { cwd: temp });
    const plan = path.join(temp, "minimal.md");
    await cp(path.join(root, "tests", "fixtures", "plans", "minimal.md"), plan);
    await writeFile(path.join(temp, "product.txt"), "before\n");
    execFileSync("git", ["add", "."], { cwd: temp });
    execFileSync("git", ["commit", "-qm", "base"], { cwd: temp });
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: temp, encoding: "utf8" }).trim();
    await writeFile(path.join(temp, "product.txt"), "after\n");
    execFileSync("git", ["add", "product.txt"], { cwd: temp });
    execFileSync("git", ["commit", "-qm", "change"], { cwd: temp });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: temp, encoding: "utf8" }).trim();

    const workspace = execFileSync(path.join(sddRoot, "scripts", "sdd-workspace"), [plan], {
      cwd: temp,
      encoding: "utf8",
    }).trim();
    assert.equal(workspace, path.join(temp, ".superpowers", "sdd", "minimal"));
    execFileSync("git", ["check-ignore", "-q", workspace], { cwd: temp });

    const brief = path.join(temp, "task-brief.md");
    execFileSync(path.join(sddRoot, "scripts", "task-brief"), [plan, "1", brief], { cwd: temp });
    assert.match(await readFile(brief, "utf8"), /^## Task 1: Fixture$/m);

    const review = path.join(temp, "review.diff");
    execFileSync(path.join(sddRoot, "scripts", "review-package"), [plan, base, head, review], {
      cwd: temp,
    });
    const packageText = await readFile(review, "utf8");
    assert.match(packageText, /## Commits/);
    assert.match(packageText, /change/);
    assert.match(packageText, /[-+]before|[-+]after/);
    assert.ok(packageText.length > 100);
  } finally {
    await chmod(temp, 0o700).catch(() => {});
    await rm(temp, { recursive: true, force: true });
  }
});
