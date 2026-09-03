/**
 * The plugin's only decision-making. Pure: no Obsidian, no PTY, no DOM.
 *
 * Turns a launch intent into a concrete spawn specification, and moves that
 * intent to and from the plain state Obsidian persists on a workspace leaf.
 */

/** Absolute so the launch does not depend on Obsidian's GUI `PATH`. */
export const SHELL_COMMAND = "/bin/zsh";
export const SHELL_ARGS = ["-l"];
export const PI_COMMAND = "/Users/james/.npm-global/bin/pi";

/**
 * Pi is a Node script started via `#!/usr/bin/env node`, so `node` itself must
 * be findable. Obsidian launched from the Finder inherits a bare `PATH` that
 * contains neither the Nix profile holding `node` nor the npm global bin, so
 * both are prepended here.
 */
export const PATH_PREPEND = [
  "/etc/profiles/per-user/james/bin",
  "/Users/james/.npm-global/bin",
];

export type Launch =
  | { kind: "shell" }
  | { kind: "pi"; notePath?: string };

export type SpawnSpec = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
};

export type LaunchContext = {
  vaultRoot: string;
  processEnv: NodeJS.ProcessEnv;
};

export function resolveLaunch(launch: Launch, ctx: LaunchContext): SpawnSpec {
  const [command, args] =
    launch.kind === "pi"
      ? [PI_COMMAND, launch.notePath ? [`@${launch.notePath}`] : []]
      : [SHELL_COMMAND, [...SHELL_ARGS]];

  return {
    command,
    args,
    cwd: ctx.vaultRoot,
    env: resolveEnv(ctx.processEnv),
  };
}

function resolveEnv(processEnv: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(processEnv)) {
    if (value !== undefined) env[key] = value;
  }

  const inherited = env.PATH ? env.PATH.split(":").filter(Boolean) : [];
  env.PATH = [
    ...PATH_PREPEND,
    ...inherited.filter((dir) => !PATH_PREPEND.includes(dir)),
  ].join(":");

  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  return env;
}

export function serializeLaunch(launch: Launch): Record<string, unknown> {
  if (launch.kind !== "pi") return { kind: "shell" };
  // The key is omitted rather than set to undefined, so the persisted state is
  // plain JSON either way.
  return launch.notePath
    ? { kind: "pi", notePath: launch.notePath }
    : { kind: "pi" };
}

const SHELL_LAUNCH: Launch = { kind: "shell" };

/**
 * Total by design: a workspace layout saved by an older or broken version must
 * degrade to a plain shell rather than prevent the plugin from loading.
 */
export function parseLaunch(state: unknown): Launch {
  if (typeof state !== "object" || state === null || Array.isArray(state)) {
    return SHELL_LAUNCH;
  }

  const { kind, notePath } = state as { kind?: unknown; notePath?: unknown };
  if (kind !== "pi") return SHELL_LAUNCH;

  return typeof notePath === "string" && notePath.length > 0
    ? { kind: "pi", notePath }
    : { kind: "pi" };
}

/** Short name for the pane holding this launch. */
export function launchTitle(launch: Launch): string {
  return launch.kind === "pi" ? "Pi" : "Terminal";
}

/** The title, plus the note when there is one. Used in the waiting notice. */
export function launchDescription(launch: Launch): string {
  const title = launchTitle(launch);
  return launch.kind === "pi" && launch.notePath
    ? `${title} for ${launch.notePath}`
    : title;
}
