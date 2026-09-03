/**
 * Pi has a native `deepseek` provider, so no custom provider configuration is
 * needed: the plugin only has to supply a key and name a model. The key's
 * variable name and the model ids below come from pi's own bundled catalog.
 */

export const PROVIDER = "deepseek";
export const API_KEY_ENV = "DEEPSEEK_API_KEY";

export const MODELS = [
  { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
  { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export type Settings = {
  apiKey: string;
  model: ModelId;
  /**
   * Extra directories for the agent's `PATH`, as typed. Kept as the raw string
   * so the settings screen shows back exactly what was entered; `parsePathDirs`
   * turns it into the list actually used.
   */
  pathDirs: string;
};

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "deepseek-v4-flash",
  pathDirs: "",
};

/** How pi names a model on the command line: `provider/id`. */
export function modelPattern(model: ModelId): string {
  return `${PROVIDER}/${model}`;
}

/** Both models, so they can be cycled inside a session. */
export function modelCycleList(): string {
  return MODELS.map((m) => modelPattern(m.id)).join(",");
}

function isModelId(value: unknown): value is ModelId {
  return MODELS.some((m) => m.id === value);
}

/** Total: anything unrecognised in the stored data falls back to a default. */
export function parseSettings(stored: unknown): Settings {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) {
    return { ...DEFAULT_SETTINGS };
  }

  const { apiKey, model, pathDirs } = stored as {
    apiKey?: unknown;
    model?: unknown;
    pathDirs?: unknown;
  };
  return {
    apiKey:
      typeof apiKey === "string" ? apiKey.trim() : DEFAULT_SETTINGS.apiKey,
    model: isModelId(model) ? model : DEFAULT_SETTINGS.model,
    pathDirs:
      typeof pathDirs === "string" ? pathDirs : DEFAULT_SETTINGS.pathDirs,
  };
}

/**
 * The directories to put at the front of the agent's `PATH`, read from what the
 * user typed. Accepts either the colon-separated form a terminal uses or one
 * per line, since a text box invites the latter.
 *
 * Only absolute paths survive: a relative one would be read against the vault,
 * which is not what anyone means by a `PATH` entry.
 */
export function parsePathDirs(typed: unknown): string[] {
  if (typeof typed !== "string") return [];

  const seen = new Set<string>();
  return typed
    .split(/[:\n]/)
    .map((dir) => dir.trim())
    .filter((dir) => dir.startsWith("/"))
    .filter((dir) => {
      if (seen.has(dir)) return false;
      seen.add(dir);
      return true;
    });
}
