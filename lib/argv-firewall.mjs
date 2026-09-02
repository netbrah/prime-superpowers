const SOL_SELECTOR = "prime-proxy-openai/gpt-5.6-sol:max";

const publicCommands = new Set([
  "help", "agents", "list", "attach", "stop", "rename", "send", "schedule",
  "status", "doctor", "shutdown", "mcp", "package", "update", "model",
  "session", "config", "app", "daemon", "install", "manage", "remove",
  "uninstall",
]);

const allowedBooleans = new Set(["--print", "-p", "--verbose"]);
const valueOptions = new Set(["--mode", "--color"]);
const allowedValues = {
  "--mode": new Set(["text", "json", "rpc"]),
  "--color": new Set(["auto", "always", "never"]),
};

export class FirewallError extends Error {
  constructor(code, argument, detail = "argument refused") {
    super(`${code}: ${detail}`);
    this.name = "FirewallError";
    this.code = code;
    this.diagnostic = Object.freeze({ code, argument: redactArgument(argument) });
  }
}

function redactArgument(argument) {
  if (typeof argument !== "string") return "<invalid>";
  const equal = argument.indexOf("=");
  return equal < 0 ? argument : argument.slice(0, equal);
}

function refusal(code, argument, detail) {
  throw new FirewallError(code, argument, detail);
}

function unsafeIsHeadless(args, options) {
  if (!options.stdinIsTTY || !options.stdoutIsTTY) return true;
  return args.some((arg, index) =>
    arg === "-p" ||
    arg === "--print" ||
    arg.startsWith("--print=") ||
    arg === "--mode" && ["json", "rpc"].includes(args[index + 1]) ||
    /^--mode=(json|rpc)$/.test(arg)
  );
}

export async function applyArgvFirewall(args, options = {}) {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    refusal("E_ARG_TYPE", "<invalid>", "argv must be an array of strings");
  }

  if (args[0] === "--unsafe-prime-args") {
    const passthrough = args.slice(1);
    if (unsafeIsHeadless(passthrough, options)) {
      refusal("E_UNSAFE_HEADLESS", "--unsafe-prime-args", "unsafe mode requires an interactive TTY");
    }
    const banner = "WORKFLOW GUARANTEES ARE DISABLED: arguments will be passed to Prime without policy enforcement.";
    if (typeof options.confirmUnsafe !== "function" || !(await options.confirmUnsafe(banner))) {
      refusal("E_UNSAFE_DECLINED", "--unsafe-prime-args", "unsafe mode was not confirmed");
    }
    return Object.freeze({
      forwardedArgv: Object.freeze([...passthrough]),
      presentationEnv: Object.freeze({}),
      unsafe: true,
      diagnostics: Object.freeze([{ code: "W_UNSAFE", message: banner }]),
    });
  }
  if (args.includes("--unsafe-prime-args")) {
    refusal("E_ARG_POSITION", "--unsafe-prime-args", "unsafe escape hatch must be first");
  }

  const accepted = [];
  const presentationEnv = {};
  const seen = new Set();
  let firstPositional = true;
  let endOfOptions = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--" && !endOfOptions) {
      endOfOptions = true;
      accepted.push(argument);
      continue;
    }
    if (!endOfOptions && allowedBooleans.has(argument)) {
      if (seen.has(argument) || (argument === "-p" && seen.has("--print")) ||
          (argument === "--print" && seen.has("-p"))) {
        refusal("E_ARG_REPEATED", argument, "option may appear only once");
      }
      seen.add(argument);
      accepted.push(argument);
      continue;
    }

    if (!endOfOptions && argument.startsWith("--")) {
      const equal = argument.indexOf("=");
      const name = equal < 0 ? argument : argument.slice(0, equal);
      if (!valueOptions.has(name)) {
        refusal("E_ARG_DENIED", argument, "option is not on the safe allowlist");
      }
      if (seen.has(name)) refusal("E_ARG_REPEATED", name, "option may appear only once");
      seen.add(name);
      const value = equal < 0 ? args[++index] : argument.slice(equal + 1);
      if (!value || !allowedValues[name].has(value)) {
        refusal("E_ARG_VALUE", name, "invalid or missing option value");
      }
      if (name === "--color") {
        if (value === "never") presentationEnv.NO_COLOR = "1";
        if (value === "always") presentationEnv.FORCE_COLOR = "1";
      } else {
        accepted.push(name, value);
      }
      continue;
    }
    if (!endOfOptions && argument.startsWith("-") && !argument.startsWith("@")) {
      refusal("E_ARG_DENIED", argument, "short option is not on the safe allowlist");
    }
    if (firstPositional && !argument.startsWith("@")) {
      firstPositional = false;
      if (publicCommands.has(argument)) {
        refusal("E_PUBLIC_COMMAND", argument, "Prime command names are not prompts");
      }
    }
    accepted.push(argument);
  }
  return Object.freeze({
    forwardedArgv: Object.freeze(["--model", SOL_SELECTOR, ...accepted]),
    presentationEnv: Object.freeze(presentationEnv),
    unsafe: false,
    diagnostics: Object.freeze([]),
  });
}
