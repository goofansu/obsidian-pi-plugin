/**
 * Makes node-pty's macOS `spawn-helper` binaries executable.
 *
 * node-pty 1.1.0 publishes both of them without the executable bit. The addon
 * posix_spawns that file to start a session, so without this a pane reports a
 * permission error instead of a prompt. Run after `npm install` against the
 * checkout, and again by the packaging script against the copy it puts in the
 * archive.
 *
 *   node scripts/spawn-helper.mjs [path/to/node-pty]
 */
import { chmodSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** The prebuilds a macOS Obsidian can load; the rest are Windows. */
const DARWIN_PREBUILDS = ["darwin-arm64", "darwin-x64"];

/** Returns the helpers it made executable, which is none off macOS. */
export function enableSpawnHelpers(nodePtyDir) {
  const enabled = [];
  for (const prebuild of DARWIN_PREBUILDS) {
    const helper = resolve(nodePtyDir, "prebuilds", prebuild, "spawn-helper");
    if (!existsSync(helper)) continue;
    chmodSync(helper, 0o755);
    enabled.push(helper);
  }
  return enabled;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const nodePtyDir = process.argv[2] ?? "node_modules/node-pty";
  for (const helper of enableSpawnHelpers(nodePtyDir)) {
    console.log(`Made executable: ${helper}`);
  }
}
