/**
 * Pi's own settings file, inside the plugin's private configuration directory.
 *
 * Only one value is seeded: the startup header is off, because a banner
 * re-announcing the same version and key bindings on every launch is noise in a
 * pane this small. There is no command-line flag for it.
 *
 * Seeding is one-way and once only. Pi writes this file too, so a key that is
 * already present is left exactly as it is — otherwise the plugin would undo a
 * choice the user made inside Pi on the next launch.
 */

export const PI_SETTINGS_FILE = "settings.json";

export type SeedResult = {
  settings: Record<string, unknown>;
  /** Whether the file needs writing back. */
  changed: boolean;
};

export function piSettingsPath(agentDir: string): string {
  return `${agentDir}/${PI_SETTINGS_FILE}`;
}

export function seedPiSettings(stored: unknown): SeedResult {
  const existing =
    typeof stored === "object" && stored !== null && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};

  if ("quietStartup" in existing) return { settings: existing, changed: false };
  return { settings: { ...existing, quietStartup: true }, changed: true };
}
