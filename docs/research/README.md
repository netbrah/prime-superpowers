# Research Evidence

This directory preserves the authored source-analysis needed to continue the
Prime Superpowers design and implementation locally.

## Documents

- `prime-agent-integration-findings.md` is the concise Prime Agent 0.8.1
  configuration, model, RLM, skill, context, extension, and cache analysis.
- `prime-agent-hooks-analysis.md` is the corresponding long-form analysis with
  source paths, line references, schema details, and integration caveats.
- `superpowers-to-prime-adaptation-findings.md` analyzes Superpowers v6.3.0
  against Prime Agent's package, skill, extension, and RLM behavior.
- `source-provenance.md` freezes upstream repositories, commits, releases, and
  verification-artifact hashes used by the design and review rounds.

## Deliberate Exclusions

The repository does not vendor the Prime Agent, Prime RL, Superpowers,
Verifiers, or Prime Environments repositories. It also does not commit the
downloaded Prime Agent release tarball. These are third-party, reproducible
inputs whose exact revisions are recorded in `source-provenance.md`.

Sandbox session state, memory, uploaded attachments, credentials, environment
files, package caches, and generated runtime state are not part of the handoff.
