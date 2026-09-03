import { describe, expect, it } from "vitest";
import { PI_SETTINGS_FILE, piSettingsPath, seedPiSettings } from "./pi-settings.js";

describe("seeding pi's own settings", () => {
  it("turns off the startup header when nothing is configured yet", () => {
    const { settings, changed } = seedPiSettings(undefined);

    expect(settings).toEqual({ quietStartup: true });
    expect(changed).toBe(true);
  });

  it("leaves the file alone once the key is present", () => {
    const { changed } = seedPiSettings({ quietStartup: true });

    expect(changed).toBe(false);
  });

  it("respects a later decision to turn the header back on", () => {
    // Pi writes this file too. Seeding must not fight the user's own choice.
    const { settings, changed } = seedPiSettings({ quietStartup: false });

    expect(settings).toEqual({ quietStartup: false });
    expect(changed).toBe(false);
  });

  it("preserves everything else pi has written", () => {
    const existing = { theme: "light", defaultProjectTrust: "always" };

    const { settings, changed } = seedPiSettings(existing);

    expect(settings).toEqual({ ...existing, quietStartup: true });
    expect(changed).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "not settings"],
    ["a number", 7],
    ["an array", []],
  ])("starts fresh rather than throwing on %s", (_label, stored) => {
    const { settings, changed } = seedPiSettings(stored);

    expect(settings).toEqual({ quietStartup: true });
    expect(changed).toBe(true);
  });

  it("writes to pi's settings file inside the private config directory", () => {
    expect(piSettingsPath("/vault/.obsidian/plugins/wterm-pi/pi-agent")).toBe(
      `/vault/.obsidian/plugins/wterm-pi/pi-agent/${PI_SETTINGS_FILE}`,
    );
  });
});
