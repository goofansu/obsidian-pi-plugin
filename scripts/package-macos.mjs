/**
 * Builds the macOS release archive: the plugin folder Obsidian expects, with
 * node-pty's macOS runtime already inside it, so installing is an unzip.
 *
 *   npm run build && npm run package
 *   npm run package -- --tag 0.0.1   # also checks the tag against manifest.json
 *
 * Obsidian's own plugin installer would fetch main.js, manifest.json, and
 * styles.css and nothing else, which cannot work here: the native
 * pseudo-terminal addon is deliberately not bundled and is loaded from
 * node_modules inside the plugin folder at runtime.
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { enableSpawnHelpers } from "./spawn-helper.mjs";

/** What the community-plugin installer would have delivered. */
const PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"];

/**
 * The parts of node-pty a running plugin touches. The rest of the package is
 * addon sources, headers, and build scripts, plus 58 MB of Windows prebuilds.
 */
const NODE_PTY_FILES = [
  "package.json",
  "LICENSE",
  "lib",
  "typings",
  "prebuilds/darwin-arm64",
  "prebuilds/darwin-x64",
];

/** The binaries an installed pane depends on; all four must reach the zip. */
const BINARIES = [
  "prebuilds/darwin-arm64/pty.node",
  "prebuilds/darwin-arm64/spawn-helper",
  "prebuilds/darwin-x64/pty.node",
  "prebuilds/darwin-x64/spawn-helper",
];

/** These are posix_spawned rather than dlopened, so the mode matters. */
const HELPERS = BINARIES.filter((binary) => binary.endsWith("spawn-helper"));

const root = resolve(import.meta.dirname, "..");
const { id, version } = JSON.parse(
  readFileSync(resolve(root, "manifest.json"), "utf8"),
);

// `ditto` keeps the executable bits and the adhoc signatures on the prebuilt
// binaries, and this is a macOS-only plugin in the first place.
if (process.platform !== "darwin") {
  fail(`Packaging needs macOS; this is ${process.platform}.`);
}

checkVersions();

for (const file of PLUGIN_FILES) {
  if (!existsSync(resolve(root, file))) {
    fail(`${file} is missing — run \`npm run build\` first.`);
  }
}

const stage = resolve(root, "dist", id);
const zip = resolve(root, "dist", `${id}-${version}-macos.zip`);

rmSync(resolve(root, "dist"), { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

for (const file of PLUGIN_FILES) {
  cpSync(resolve(root, file), resolve(stage, file));
}

const nodePty = resolve(stage, "node_modules/node-pty");
for (const file of NODE_PTY_FILES) {
  const source = resolve(root, "node_modules/node-pty", file);
  if (!existsSync(source))
    fail(`node-pty is missing ${file} — run \`npm ci\`.`);
  const target = resolve(nodePty, file);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true });
}
enableSpawnHelpers(nodePty);

for (const binary of BINARIES) {
  if (!existsSync(resolve(nodePty, binary))) {
    fail(`The staged copy is missing ${binary}.`);
  }
}
for (const helper of HELPERS) {
  if (!(statSync(resolve(nodePty, helper)).mode & 0o111)) {
    fail(`${helper} is not executable.`);
  }
}

execFileSync("ditto", ["-c", "-k", "--keepParent", stage, zip]);
checkArchive();

const megabytes = (statSync(zip).size / 1024 / 1024).toFixed(1);
console.log(`Packaged ${id} ${version} (${megabytes} MB)\n  -> ${zip}`);

/** The zip is named after the manifest, so a release tag has to agree with it. */
function checkVersions() {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  if (pkg.version !== version) {
    fail(
      `package.json is at ${pkg.version} but manifest.json is at ${version}.`,
    );
  }
  const flag = process.argv.indexOf("--tag");
  if (flag === -1) return;
  const tag = (process.argv[flag + 1] ?? "").replace(/^v/, "");
  if (tag !== version) {
    fail(
      `Tag ${tag || "(none)"} does not match manifest.json version ${version}.`,
    );
  }
}

/**
 * Reads the modes back out of the finished archive. A lost executable bit is
 * the one packaging mistake that survives every other check and only shows up
 * when someone tries to start a session.
 */
function checkArchive() {
  const listing = execFileSync("unzip", ["-Z", zip], { encoding: "utf8" });
  for (const helper of HELPERS) {
    const line = listing
      .split("\n")
      .find((candidate) => candidate.endsWith(helper));
    if (!line) fail(`${helper} did not reach the archive.`);
    if (!line.slice(0, 10).includes("x")) {
      fail(`${helper} lost its executable bit in the archive:\n  ${line}`);
    }
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
