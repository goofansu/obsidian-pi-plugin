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
};

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "deepseek-v4-flash",
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

  const { apiKey, model } = stored as { apiKey?: unknown; model?: unknown };
  return {
    apiKey:
      typeof apiKey === "string" ? apiKey.trim() : DEFAULT_SETTINGS.apiKey,
    model: isModelId(model) ? model : DEFAULT_SETTINGS.model,
  };
}
