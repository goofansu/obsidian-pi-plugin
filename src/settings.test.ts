import { describe, expect, it } from "vitest";
import {
  API_KEY_ENV,
  DEFAULT_SETTINGS,
  MODELS,
  modelCycleList,
  modelPattern,
  parseSettings,
} from "./settings.js";

describe("the two models on offer", () => {
  it("offers exactly the flash and pro models, flash first", () => {
    expect(MODELS.map((m) => m.id)).toEqual([
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ]);
  });

  it("names each model for the settings dropdown", () => {
    expect(MODELS.every((m) => m.name.length > 0)).toBe(true);
  });

  it("defaults to flash", () => {
    expect(DEFAULT_SETTINGS.model).toBe("deepseek-v4-flash");
  });

  it("starts with no key", () => {
    expect(DEFAULT_SETTINGS.apiKey).toBe("");
  });
});

describe("model patterns passed to pi", () => {
  it("qualifies a model with its provider", () => {
    expect(modelPattern("deepseek-v4-pro")).toBe("deepseek/deepseek-v4-pro");
  });

  it("offers both models for in-session cycling", () => {
    expect(modelCycleList()).toBe(
      "deepseek/deepseek-v4-flash,deepseek/deepseek-v4-pro",
    );
  });
});

describe("parseSettings is total", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "nope"],
    ["an array", []],
    ["an empty object", {}],
  ])("falls back to the defaults for %s", (_label, stored) => {
    expect(parseSettings(stored)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps a stored key and model", () => {
    expect(
      parseSettings({ apiKey: "sk-abc", model: "deepseek-v4-pro" }),
    ).toEqual({
      apiKey: "sk-abc",
      model: "deepseek-v4-pro",
    });
  });

  it("rejects a model that is not one of the two on offer", () => {
    expect(parseSettings({ apiKey: "sk-abc", model: "gpt-4" }).model).toBe(
      DEFAULT_SETTINGS.model,
    );
  });

  it("rejects a non-string key rather than passing it on", () => {
    expect(parseSettings({ apiKey: 42 }).apiKey).toBe("");
  });

  it("trims surrounding whitespace from a pasted key", () => {
    expect(parseSettings({ apiKey: "  sk-abc\n" }).apiKey).toBe("sk-abc");
  });
});

describe("the environment variable pi reads", () => {
  it("is the one pi's own catalog names for deepseek", () => {
    expect(API_KEY_ENV).toBe("DEEPSEEK_API_KEY");
  });
});
