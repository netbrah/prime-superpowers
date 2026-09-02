export const INTRODUCED_LATER_RESOURCES = new Set([
  "skills/using-superpowers/SKILL.md",
  "skills/subagent-driven-development/SKILL.md",
  "skills/subagent-driven-development/implementer-prompt.md",
  "skills/subagent-driven-development/task-reviewer-prompt.md",
  "skills/subagent-driven-development/re-review-prompt.md",
  "skills/subagent-driven-development/final-reviewer-prompt.md",
  "skills/prime-rlm-dispatch/SKILL.md",
  "skills/prime-rlm-dispatch/worker-prompt.md",
  "skills/prime-rlm-dispatch/reviewer-prompt.md",
  "skills/model-policy/SKILL.md",
  "skills/model-policy/novelty-prompt.md",
]);

export function createExtensionApi() {
  const handlers = new Map();
  const registrations = [];
  const commands = [];
  return {
    handlers,
    registrations,
    commands,
    registerProvider(id, config) {
      registrations.push({ id, config });
    },
    registerCommand(name, config) {
      commands.push({ name, config });
    },
    on(event, handler) {
      const existing = handlers.get(event) ?? [];
      existing.push(handler);
      handlers.set(event, existing);
    },
    async emit(event, payload) {
      let result;
      for (const handler of handlers.get(event) ?? []) {
        result = await handler(payload, {});
      }
      return result;
    },
  };
}
