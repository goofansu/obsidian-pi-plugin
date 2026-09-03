import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { defineConfig } from "vitest/config";

// The same machine paths the build injects, so the tests exercise real values.
function pathDirs(): string[] {
  const read = (file: string, args: string[]) =>
    execFileSync(file, args, { encoding: "utf8" }).trim();
  const dirs: string[] = [];
  try {
    dirs.push(dirname(read("/bin/sh", ["-c", "command -v node"])));
  } catch {
    dirs.push(dirname(process.execPath));
  }
  try {
    dirs.push(`${read("npm", ["prefix", "-g"])}/bin`);
  } catch {
    /* left out, as in the build */
  }
  return dirs;
}

export default defineConfig({
  define: { __PI_PATH_DIRS__: JSON.stringify(pathDirs()) },
});
