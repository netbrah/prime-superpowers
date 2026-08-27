# Sol Design Review — Round 4

**Spec reviewed:** `docs/specs/2026-08-26-prime-superpowers-design.md` (current working-tree version)  
**Baselines checked:** Prime Agent `0.8.1`; Superpowers `v6.3.0`  
**Review disposition:** **Not approved — 1 Blocker, 1 Major**

## Scope and method

This is a fresh release-readiness review, not a prose-only comparison with round 3. I checked the current design against:

- the downloaded Prime Agent `0.8.1` release asset at
  `/home/user/workspace/review-artifacts/prime-agent-0.8.1.tgz`, whose SHA-256 is
  `46c24bc3db98fd3fc6957ce1af183c9888e38f055201604cebc3da2974bf4475`;
- its extracted contents at
  `/home/user/workspace/review-artifacts/prime-agent-0.8.1-extracted/package/`;
- the local Prime Agent source tree at `/home/user/workspace/prime-agent`;
- the local Superpowers `v6.3.0` source tree at
  `/home/user/workspace/superpowers`; and
- both round-3 reviews in `docs/reviews/`.

The design now closes most round-3 failures. Two load-bearing gaps remain:
the named extension hook cannot perform the required request-header mutation,
and the bootstrap still does not define how an npm package tarball becomes the
isolated executable it promises to run.

## Findings

### SOL-R4-B1 — `before_provider_request` cannot read or mutate the Anthropic request headers

**Severity:** Blocker  
**Status:** Open  
**Affected spec lines:** 17, 115, 190, 197, 205, 225–226, 229

**Evidence**

1. Prime's extension type exposes `before_provider_request` as a payload-only
   event. In
   `/home/user/workspace/prime-agent/packages/coding-agent/src/core/extensions/types.ts:613-617`,
   the event is `{ type: "before_provider_request"; payload: unknown }` and the
   documented replacement value is the payload.
2. The extension runner transforms only `currentPayload` in
   `/home/user/workspace/prime-agent/packages/coding-agent/src/core/extensions/runner.ts:896-927`.
   It has no header parameter or request-client object.
3. The SDK integration resolves provider headers separately and passes the hook
   only as `onPayload` in
   `/home/user/workspace/prime-agent/packages/coding-agent/src/core/sdk.ts:286-306`.
4. The Anthropic provider computes the runtime beta list and constructs the
   client/default headers in
   `/home/user/workspace/prime-agent/packages/ai/src/providers/anthropic.ts:843-940`.
   The message payload is then built, passed through `onPayload`, and sent in
   `anthropic.ts:480-526`. Therefore the hook runs after client/header
   construction and can replace only the request body.
5. This is not merely a source-tree drift issue. The shipped release declaration
   at
   `/home/user/workspace/review-artifacts/prime-agent-0.8.1-extracted/package/dist/core/extensions/types.d.ts:491-495`
   has the same payload-only contract, and the shipped provider bundle computes
   headers before invoking `onPayload` in
   `/home/user/workspace/review-artifacts/prime-agent-0.8.1-extracted/package/dist/bundle/anthropic-JNTJ63BA.js`.

**Concrete failure**

The design requires the extension to “inspect the final beta header immediately
before dispatch” and union `extended-cache-ttl-2025-04-11` with Prime's
runtime-computed beta tokens. Prime Agent 0.8.1 gives that hook neither the
computed header list nor any way to replace HTTP headers. Returning an
`anthropic-beta` property from this hook would alter the JSON message body, not
the HTTP request headers. Consequently a gateway requiring the extended-cache
beta token receives no such token, while any attempt to force a static
`anthropic-beta` model header can overwrite Prime's conditional
fine-grained-tool-streaming or interleaved-thinking tokens. The mandatory
request-time union, preservation, and doctor-capture success criteria cannot be
implemented through the mechanism the design names.

**Required correction**

Choose and specify a mechanism that really owns the final outbound headers.
For example:

- add a Prime API/extension point whose input includes the fully computed
  request headers and whose output replaces those headers; or
- patch/vendor the Anthropic provider to append the cache token while it builds
  `betaFeatures`, before `createClient`; or
- use a verified transport/client wrapper that merges the header after all
  Prime and model overrides, with an executable test proving preservation of
  every runtime token.

The design must identify the exact 0.8.1 surface, ordering, merge semantics, and
failure behavior. A test that merely sees the token in configuration or request
JSON is insufficient; verification must capture the actual outbound HTTP
header for ordinary, thinking, and fine-grained-tool-streaming requests.

### SOL-R4-M1 — The pinned release is an npm package tarball, but the bootstrap specifies only extraction

**Severity:** Major  
**Status:** Open  
**Affected spec lines:** 39–40, 61, 72–75, 80, 211, 223, 229

**Evidence**

1. The pinned artifact and SHA-256 are real and match the downloaded release.
   This closes the prior nonexistent-package finding.
2. The archive root is `package/`. Its
   `/home/user/workspace/review-artifacts/prime-agent-0.8.1-extracted/package/package.json`
   declares
   `"name": "prime-agent"`, `"version": "0.8.1"`, and the npm bin mapping
   `"prime-agent": "dist/bundle/cli.js"`. It also declares runtime
   dependencies and a Node engine requirement.
3. The tarball contains neither a top-level `prime-agent` executable nor
   `node_modules`. The executable shim named `prime-agent` is produced by an npm
   installation; it is not produced by tar extraction.
4. Prime's own installer confirms the intended lifecycle:
   `/home/user/workspace/prime-agent/install.sh:1454-1480` downloads and verifies
   the release archive, while `install.sh:1592-1616` runs `npm install -g` on
   that verified tarball. The design cannot use that global installation
   unchanged because it promises an isolated kit-owned toolchain and an absolute
   kit-owned binary.
5. Current spec line 80 says the bootstrap verifies before extraction, installs
   under `<kit>/toolchain/prime-agent-0.8.1`, and invokes its absolute
   `prime-agent` binary, but it never defines the local npm installation step,
   prefix/layout, dependency materialization, required Node/npm version, or
   resulting executable path.

**Concrete failure**

A conforming implementer can download the exact verified tarball and extract it
under the stated toolchain directory, then fail the very next step: there is no
`<toolchain>/prime-agent` binary and the bundled CLI's runtime dependencies are
absent. If the implementer copies the upstream `npm install -g` behavior, the
binary and dependencies are instead placed in a mutable machine-global prefix,
violating the design's isolation and absolute-path guarantees. Different
implementers must invent a load-bearing installation contract, and the current
doctor/version check has no unambiguous executable to call.

**Required correction**

Specify a clean-machine installation algorithm, including:

- the supported Node and npm versions and how they are discovered or supplied;
- the exact kit-local npm prefix (or another deterministic materialization
  strategy);
- the exact resulting absolute binary path, such as a defined
  `node_modules/.bin/prime-agent` location;
- treatment of lifecycle scripts and runtime dependencies;
- atomic installation/rollback behavior; and
- a clean-environment test that starts that exact binary with no preinstalled
  global `prime-agent`.

If dependency reproducibility is part of the checksum guarantee, the design
must also pin or vendor the installed dependency closure; hashing only the npm
package tarball does not identify dependencies resolved later by npm.

## Round-3 closure verification

| Prior finding | Round-4 result | Verification |
|---|---|---|
| Sol R3 B1 — detached launch could not re-enter the same parent | **Closed in design** | Lines 86 and 156 now make the parent persistent, record its exact identity, restrict attach/status/stop to that identity, reconcile before clearing, and fail closed on an orphan or ambiguous record. Prime's child registry is parent-scoped, so exact parent re-entry is the necessary invariant. |
| Sol R3 B2 / Opus R3 B1 — nonexistent package/release source | **Partly closed; superseded by SOL-R4-M1** | The GitHub release asset and digest are valid. The remaining issue is installation semantics, not artifact identity. |
| Sol R3 M1 — auth strategy contradicted explicit-header mode | **Closed** | Lines 49 and 193–195 retain bearer/native authentication only; the contradictory explicit-header branch is gone. |
| Sol R3 M2 — aliases could silently lose provider metadata | **Closed** | Lines 118–128 define complete fixed role profiles. An alias changes only the transport model ID, and token-family validation rejects aliases that would leave the profile on a different provider path. |
| Opus R3 B2 — coordinator ran in the source checkout | **Closed** | Lines 30 and 134 require worktree creation before Prime startup and make the coordinator session cwd the worktree root. Line 139 also requires implementers to `chdir` explicitly. Prime defaults session cwd from process cwd, and child sessions inherit the parent's cwd. |
| Opus R3 B3 — whole-directory skill collision dropped sibling assets | **Closed in design** | Line 84 vendors the used sibling templates, scripts, and safe references into each colliding override and records provenance/hashes. Line 233 verifies every relative reference. This matches Prime's whole-skill, first-winner loading behavior rather than assuming file-level overlay. |
| Opus R3 B4 — a prompt-leading token could route as a public command | **Closed** | Lines 201–203 place an internal option before user text, reject every public/removed command token in the positional prompt, and default-deny unsupported flags. This addresses Prime's pre-parse routing on `args[0]` and preserves an explicit wrapper path for exact-session attach/status/stop. |
| Opus R3 M1 — unsupported thinking `off` mappings | **Closed** | The maps now use Prime's provider-native values: OpenAI `none`, Anthropic `off`, and null where Gemini has no corresponding level. |
| Opus R3 M2 — static Anthropic beta header overwrote runtime tokens | **Not closed; SOL-R4-B1** | The intended union is correct, but the named request hook cannot perform it. |
| Opus R3 M3 — one-active-coordinator lock ended with launcher process | **Closed in design** | Lines 86 and 156 tie the record to the daemon/session, not launcher lifetime; new runs query live/retained state and refuse instead of assuming process exit means completion. |
| Opus R3 M4 — taxonomy discarded upstream review signals | **Closed** | Lines 146–148 map Critical→Blocker and Important→Major, treat failed upstream spec verdicts as Major gates, own “Cannot verify,” preserve deferred Minors, and prohibit unresolved gated states. |
| Opus R3 M5 — severity downgrade was rewarded | **Closed** | Line 148 requires fresh cross-family concurrence, preserves original and final severity with rationale, and audits downgrades independently of finding-count improvement. |
| Opus R3 M6 — aliases could change Anthropic execution paths | **Closed** | Lines 126–128 constrain aliases to provider-recognized family tokens (`opus-5`, `sonnet-5`, etc.), retain the complete role profile, and require doctor verification of the resulting effort-vs-budget branch. |
| Opus R3 M7 — reviewer ceremony lacked measurable governance | **Closed in design** | Lines 108 and 146–148 define capped admissions, sealed evidence, baseline/demotion rules, reconciliation gates, and durable severity accounting. |

## Focus-area conclusions

- **Real release artifact:** identity and digest are now correct; local
  installation remains underspecified (**SOL-R4-M1**).
- **Worktree/session cwd:** closed.
- **Same-parent persistence:** closed in design, including detached-launch and
  orphan handling.
- **Argument routing:** closed by internal-option-first invocation plus
  positional-command and flag firewalls.
- **Skill collision sibling files:** closed in design by self-contained override
  directories and relative-reference verification.
- **Model alias profiles:** closed through complete fixed profiles and
  provider-token validation.
- **Request-time Anthropic header union:** not implementable through the named
  Prime 0.8.1 hook (**SOL-R4-B1**).
- **Review taxonomy:** closed, including failed spec verdicts, “Cannot verify,”
  deferred Minors, and downgrade accounting.

## Final verdict

**Blockers: 1**  
**Majors: 1**

Round 4 is **nonzero Blocker/Major** and therefore not release-ready. The spec
should not advance until it names an actual final-header mutation surface and a
deterministic kit-local installation procedure for the verified npm release
artifact.
