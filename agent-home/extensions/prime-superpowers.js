import { readFileSync } from "node:fs";

export const COORDINATOR_CONTRACT = readFileSync(
  new URL("../prompts/coordinator.md", import.meta.url),
  "utf8",
).trim();
export const CHILD_CONTRACT = readFileSync(
  new URL("../prompts/child.md", import.meta.url),
  "utf8",
).trim();

export function resolveConfigModuleUrl(extensionUrl = import.meta.url) {
  const url = new URL(extensionUrl);
  return new URL(
    /\/\.state\/runs\/[^/]+\/agent-home\/extensions\//.test(url.pathname)
      ? "../../../../../lib/config.mjs"
      : "../../lib/config.mjs",
    url,
  );
}

export async function installPrimeSuperpowers(
  pi,
  {
    kitRoot = new URL("..", resolveConfigModuleUrl(import.meta.url)).pathname,
    targetRoot = process.cwd(),
    env = process.env,
  } = {},
) {
  const { PROTECTED_VARIABLES, generateModelsJson, loadConfig } = await import(
    resolveConfigModuleUrl(import.meta.url)
  );
  // Launcher-owned controls are necessarily present by the time Prime loads
  // extensions. They are not operator configuration inputs; protected values
  // in kit/target env files remain visible to loadConfig and fail closed.
  const configEnv = Object.fromEntries(
    Object.entries(env).filter(([name]) => !PROTECTED_VARIABLES.includes(name)),
  );
  const config = loadConfig({ kitRoot, targetRoot, env: configEnv });
  const generated = generateModelsJson(config);
  for (const provider of Object.values(generated.providers)) {
    const { id, models, ...providerConfig } = provider;
    pi.registerProvider(id, {
      ...providerConfig,
      models: models.map(({ provider: _provider, ...model }) => model),
    });
  }
  pi.on("before_agent_start", (event) => ({
    systemPrompt:
      (event.systemPromptOptions.rlmDepth ?? 0) > 0
        ? CHILD_CONTRACT
        : COORDINATOR_CONTRACT,
  }));
}

export default async function primeSuperpowers(pi) {
  await installPrimeSuperpowers(pi);
}
