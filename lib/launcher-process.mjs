import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const SOL_SELECTOR = "prime-proxy-openai/gpt-5.6-sol:max";

export function buildPrimeEnvironment(env = {}, runtimeHome) {
  return {
    ...env,
    PRIME_AGENT_CODING_AGENT_DIR: runtimeHome,
    PI_CACHE_RETENTION: "long",
    PRIME_AGENT_TELEMETRY: "off",
  };
}

const signalNumber = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 };

export async function runPrimeProcess({
  binary,
  cwd,
  runtimeHome,
  args = [],
  internalArgs = [],
  baseEnv = process.env,
  preflight,
  loadCredentials,
  spawnImpl = spawn,
  signalBus = process,
  prependModel = true,
  afterSpawn,
}) {
  if (!binary?.startsWith("/")) {
    throw new Error("E_BINARY_UNVERIFIED: Prime binary must be absolute");
  }
  await preflight();
  const credentials = await loadCredentials();
  const env = buildPrimeEnvironment({ ...baseEnv, ...credentials }, runtimeHome);
  const forwarded = prependModel
    ? ["--model", SOL_SELECTOR, ...internalArgs, ...args]
    : [...internalArgs, ...args];
  const child = spawnImpl(binary, forwarded, { cwd, env, stdio: "inherit" });
  const handlers = new Map();
  for (const signal of Object.keys(signalNumber)) {
    const handler = () => child.kill(signal);
    handlers.set(signal, handler);
    signalBus.on(signal, handler);
  }
  const completion = new Promise((resolve) => {
    const cleanup = () => {
      for (const [signal, handler] of handlers) {
        signalBus.removeListener(signal, handler);
      }
    };
    child.once("error", (error) => {
      cleanup();
      resolve({ error });
    });
    child.once("exit", (code, signal) => {
      cleanup();
      resolve({ code: code ?? 128 + (signalNumber[signal] ?? 0) });
    });
  });
  try {
    await afterSpawn?.(child);
  } catch (error) {
    child.kill("SIGTERM");
    for (const [signal, handler] of handlers) {
      signalBus.removeListener(signal, handler);
    }
    throw error;
  }
  const result = await completion;
  if (result.error) throw result.error;
  return result.code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.stderr.write("E_NOT_COMPOSED: launcher controller is not installed\n");
  process.exitCode = 78;
}
