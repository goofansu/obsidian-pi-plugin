/**
 * The plugin's only decision-making. Pure: no Obsidian, no PTY, no DOM.
 *
 * Turns a launch intent into a concrete spawn specification, and moves that
 * intent to and from the plain state Obsidian persists on a workspace leaf.
 */

/**
 * Resolved through the `PATH` built below rather than hard-coded. node-pty
 * resolves a bare command against the environment it is given, not the one
 * Obsidian happens to hold, so prepending the directory that contains `pi` is
 * enough to make this deterministic — and it keeps working if pi is reinstalled
 * somewhere else on that path.
 */
export const PI_COMMAND = "pi";

/**
 * Pi's Ctrl+G opens `$VISUAL`, then `$EDITOR`, then falls back to `nano`.
 * Obsidian launched from the Finder passes neither, so both are set here,
 * unconditionally rather than only when absent, so the editor is the same
 * whatever the environment holds.
 */
export const EDITOR_COMMAND = "vi";

/** Any UTF-8 locale will do; this one is present on macOS. */
export const LOCALE = "en_US.UTF-8";

/**
 * Appended, not prepended, so they never shadow the user's own tools. They are
 * guaranteed rather than assumed because every command name here has to resolve
 * against this `PATH` alone.
 */
export const PATH_APPEND = ["/usr/bin", "/bin"];

/**
 * `--approve` trusts project-local files for the run, so the vault is trusted
 * every time and the trust prompt never appears. Nothing is saved, because
 * nothing needs to be. Its opposite, `--no-approve`, was tried first and made
 * `/trust` look broken: it ignores project-local files whatever decision was
 * saved, so a decision saved in one session was overridden by the next launch.
 *
 * `--no-skills` disables skill loading outright, which the private config
 * directory alone cannot do: skills are also discovered from `~/.agents/skills`
 * and from `.agents/skills` in the working directory and its parents, none of
 * which move with `PI_CODING_AGENT_DIR`. It still applies to a trusted project,
 * so trusting the vault does not bring skills back.
 */
export const PI_ARGS = ["--approve", "--no-skills"];

import {
  API_KEY_ENV,
  modelCycleList,
  modelPattern,
  parsePathDirs,
  type Settings,
} from "./settings.js";

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
  /**
   * What Pi should know about the note the user was reading, composed by
   * `note-context.ts`, or null for none — no note in view, or the setting off.
   */
  noteContext: string | null;
};

export function resolveLaunch(ctx: LaunchContext): SpawnSpec {
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

  // The note reaches Pi as an addition to its system prompt rather than as a
  // message or an `@file` argument: both of those are submitted the moment Pi
  // starts, which would spend a turn on a question the user has not asked yet.
  // An appended system prompt starts no turn at all — Pi simply knows.
  if (ctx.noteContext) args.push("--append-system-prompt", ctx.noteContext);

  return {
    command: PI_COMMAND,
    args,
    cwd: ctx.vaultRoot,
    env: resolveEnv(ctx.processEnv, ctx.agentDir, ctx.settings),
  };
}

function dedupe(dirs: string[]): string[] {
  return [...new Set(dirs)];
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
  // Whatever the app already has, with the user's own directories in front and
  // the standard ones guaranteed at the back. Nothing about this machine is
  // written down: if `pi` is not on the result, the pane says so.
  env.PATH = dedupe([
    ...parsePathDirs(settings.pathDirs),
    ...inherited,
    ...PATH_APPEND,
  ]).join(":");

  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";
  env.EDITOR = EDITOR_COMMAND;
  env.VISUAL = EDITOR_COMMAND;

  // Without a UTF-8 locale, terminal programs fall back to latin1 and render
  // multi-byte characters as mojibake — vim shows a UTF-8 apostrophe as three
  // stray glyphs. Obsidian launched from the Finder passes no locale at all.
  env.LANG = LOCALE;
  env.LC_ALL = LOCALE;

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
export function nodePtyPath(
  vaultRoot: string,
  pluginDir: string | undefined,
): string {
  if (!pluginDir) return "node-pty";
  return `${vaultRoot}/${pluginDir}/node_modules/node-pty`;
}

/** The plugin's private Pi configuration directory, inside the plugin folder. */
export function agentDirPath(
  vaultRoot: string,
  pluginDir: string | undefined,
): string {
  return `${vaultRoot}/${pluginDir ?? ".obsidian/plugins/obsidian-pi-plugin"}/pi-agent`;
}

/**
 * Where a bare command could be found on this `PATH`, in search order. The
 * caller checks which of them exists — this stays free of the filesystem so it
 * can be tested as a rule rather than against a machine.
 */
export function candidatePaths(command: string, path: string): string[] {
  if (command.includes("/")) return [command];
  return path
    .split(":")
    .filter(Boolean)
    .map((dir) => `${dir.replace(/\/$/, "")}/${command}`);
}
