/**
 * Links this project into a vault's plugin folder. A symlink is used so the
 * folder keeps node_modules/node-pty, which is loaded at runtime.
 *
 *   npm run install-to -- "/path/to/Vault"
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";

const vault = process.argv[2];
if (!vault) {
  console.error('Usage: npm run install-to -- "/path/to/Vault"');
  process.exit(1);
}

const { id } = JSON.parse(readFileSync("manifest.json", "utf8"));
const source = resolve(".");
const target = resolve(vault, ".obsidian/plugins", id);

if (!existsSync(resolve(vault, ".obsidian"))) {
  console.error(`Not an Obsidian vault (no .obsidian folder): ${vault}`);
  process.exit(1);
}
if (!existsSync(resolve(source, "main.js"))) {
  console.error("main.js is missing — run `npm run build` first.");
  process.exit(1);
}

mkdirSync(resolve(vault, ".obsidian/plugins"), { recursive: true });
// lstat rather than exists, so a dangling symlink from an earlier install is
// replaced instead of tripping the symlink call.
if (lstatSafe(target)) rmSync(target, { recursive: true, force: true });
symlinkSync(source, target, "dir");

console.log(`Linked ${source}\n     -> ${target}`);
console.log("Enable community plugins in Obsidian, then enable “wterm Pi”.");

function lstatSafe(path) {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
}
