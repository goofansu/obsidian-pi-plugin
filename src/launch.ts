/**
 * The plugin's only decision-making. Pure: no Obsidian, no PTY, no DOM.
 *
 * Turns a launch intent into a concrete spawn specification, and moves that
 * intent to and from the plain state Obsidian persists on a workspace leaf.
 */

/** Absolute so the launch does not depend on Obsidian's GUI `PATH`. */
export const PI_COMMAND = "/Users/james/.npm-global/bin/pi";

/**
 * Pi is a Node script started through a `#!/usr/bin/env node` line, so `node`
 * itself must be findable. Obsidian launched from the Finder inherits a bare
 * `PATH` containing neither the profile directory holding `node` nor the npm
 * global directory, so both are prepended here.
 */
export const PATH_PREPEND = [
  "/etc/profiles/per-user/james/bin",
  "/Users/james/.npm-global/bin",
];

/**
 * `--no-skills` disables skill loading outright, which the private config
 * directory alone cannot do: skills are also discovered from `~/.agents/skills`
 * and from `.agents/skills` in the working directory and its parents, none of
 * which move with `PI_CODING_AGENT_DIR`.
 *
 * `--no-approve` is deliberately not passed. It ignores project-local files for
 * the run regardless of any saved decision, which made `/trust` appear broken:
 * the decision was saved and then overridden on the next launch. Trust is left
 * to pi, and the decision is written to the private config directory rather than
 * the user's own.
 */
export const PI_ARGS = ["--no-skills"];

import {
  API_KEY_ENV,
  modelCycleList,
  modelPattern,
  type Settings,
} from "./settings.js";

export type Launch = { notePath?: string };

export type SpawnSpec = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
};

/** Obsidian's current mode, which selects Pi's matching built-in theme. */
export type Appearance = "light" | "dark";

export type LaunchContext = {
  vaultRoot: string;
  /** The plugin's private Pi configuration directory. */
  agentDir: string;
  settings: Settings;
  appearance: Appearance;
  processEnv: NodeJS.ProcessEnv;
};

export function resolveLaunch(launch: Launch, ctx: LaunchContext): SpawnSpec {
  const args = [
    ...PI_ARGS,
    // Pi picks a theme by probing the terminal's background colour, which this
    // emulator does not answer, so it would always assume dark. Naming the
    // theme keeps it in step with Obsidian instead.
    "--use-theme",
    ctx.appearance,
    "--model",
    modelPattern(ctx.settings.model),
    // Both models, so they can be cycled from inside the session.
    "--models",
    modelCycleList(),
  ];
  if (launch.notePath) args.push(`@${launch.notePath}`);

  return {
    command: PI_COMMAND,
    args,
    cwd: ctx.vaultRoot,
    env: resolveEnv(ctx.processEnv, ctx.agentDir, ctx.settings),
  };
}

function resolveEnv(
  processEnv: NodeJS.ProcessEnv,
  agentDir: string,
  settings: Settings,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(processEnv)) {
    // Every PI_* variable the user's own environment sets is dropped, so a
    // system-wide key, model, or config directory cannot leak into this agent.
    // The provider key is dropped for the same reason: this plugin's key is
    // the only one that should ever be in play, and an ambient one silently
    // standing in for a missing setting would be worse than a clear failure.
    if (value === undefined || key.startsWith("PI_") || key === API_KEY_ENV) {
      continue;
    }
    env[key] = value;
  }

  const inherited = env.PATH ? env.PATH.split(":").filter(Boolean) : [];
  env.PATH = [
    ...PATH_PREPEND,
    ...inherited.filter((dir) => !PATH_PREPEND.includes(dir)),
  ].join(":");

  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";

  // PI_CODING_AGENT_DIR alone isolates settings, credentials, extensions,
  // skills, sessions, and trust. PI_PACKAGE_DIR is deliberately not set: it
  // exists for Nix-style store paths and breaks pi's own version reporting.
  env.PI_CODING_AGENT_DIR = agentDir;
  // Suppresses update checks and install telemetry, not model requests.
  env.PI_OFFLINE = "1";

  if (settings.apiKey) env[API_KEY_ENV] = settings.apiKey;
  return env;
}

/**
 * Obsidian evaluates a plugin's bundle without a module path, so a bare
 * `require("node-pty")` resolves against Electron's internals rather than the
 * installed plugin folder. The addon is therefore required by absolute path,
 * built from the vault root and the plugin's own folder.
 */
export function nodePtyPath(vaultRoot: string, pluginDir: string | undefined): string {
  if (!pluginDir) return "node-pty";
  return `${vaultRoot}/${pluginDir}/node_modules/node-pty`;
}

/** The plugin's private Pi configuration directory, inside the plugin folder. */
export function agentDirPath(vaultRoot: string, pluginDir: string | undefined): string {
  return `${vaultRoot}/${pluginDir ?? ".obsidian/plugins/wterm-pi"}/pi-agent`;
}

/**
 * Whether the pane was opened by a command (start now) rather than rebuilt from
 * the saved workspace layout (wait). It travels in the leaf's view state but is
 * deliberately absent from `serializeLaunch`, so it is never persisted.
 */
export function parseAutostart(state: unknown): boolean {
  if (typeof state !== "object" || state === null) return false;
  return (state as { autostart?: unknown }).autostart === true;
}

export function serializeLaunch(launch: Launch): Record<string, unknown> {
  // The key is omitted rather than set to undefined, so the persisted state is
  // plain JSON either way.
  return launch.notePath ? { notePath: launch.notePath } : {};
}

/**
 * Total by design: a workspace layout saved by an older or broken version must
 * degrade to a plain Pi session rather than prevent the plugin from loading.
 */
export function parseLaunch(state: unknown): Launch {
  if (typeof state !== "object" || state === null || Array.isArray(state)) {
    return {};
  }

  const { notePath } = state as { notePath?: unknown };
  return typeof notePath === "string" && notePath.length > 0 ? { notePath } : {};
}

/** Short name for the pane holding this launch. */
export function launchTitle(): string {
  return "Pi";
}

/** The title, plus the note when there is one. Used in the waiting notice. */
export function launchDescription(launch: Launch): string {
  return launch.notePath ? `Pi for ${launch.notePath}` : "Pi";
}
