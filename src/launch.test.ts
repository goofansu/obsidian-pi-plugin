import { describe, expect, it } from "vitest";
import {
  PI_COMMAND,
  parseAutostart,
  nodePtyPath,
  SHELL_COMMAND,
  launchDescription,
  launchTitle,
  parseLaunch,
  resolveLaunch,
  serializeLaunch,
  type Launch,
} from "./launch.js";

const VAULT = "/Users/james/Vault";

const resolve = (launch: Launch, processEnv: NodeJS.ProcessEnv = {}) =>
  resolveLaunch(launch, { vaultRoot: VAULT, processEnv });

describe("resolveLaunch — shell", () => {
  it("runs zsh by absolute path as a login shell", () => {
    const spec = resolve({ kind: "shell" });

    expect(spec.command).toBe(SHELL_COMMAND);
    expect(spec.command.startsWith("/")).toBe(true);
    expect(spec.args).toEqual(["-l"]);
  });
});

describe("resolveLaunch — pi", () => {
  it("runs pi by absolute path with the note as a single @-prefixed argument", () => {
    const spec = resolve({ kind: "pi", notePath: "notes/daily.md" });

    expect(spec.command).toBe(PI_COMMAND);
    expect(spec.command.startsWith("/")).toBe(true);
    expect(spec.args).toEqual(["@notes/daily.md"]);
  });

  it("passes note paths containing shell metacharacters through unaltered in one argument", () => {
    const hostile = `notes/a b; rm -rf $HOME/'quoted' & "x" | y \`z\`.md`;

    const spec = resolve({ kind: "pi", notePath: hostile });

    expect(spec.args).toEqual([`@${hostile}`]);
    expect(spec.args).toHaveLength(1);
  });

  it("takes no arguments when no note is open", () => {
    expect(resolve({ kind: "pi" }).args).toEqual([]);
    expect(resolve({ kind: "pi", notePath: undefined }).args).toEqual([]);
  });

  it("takes no arguments when the note path is empty", () => {
    expect(resolve({ kind: "pi", notePath: "" }).args).toEqual([]);
  });
});

describe("resolveLaunch — working directory", () => {
  it("always runs in the vault root", () => {
    expect(resolve({ kind: "shell" }).cwd).toBe(VAULT);
    expect(resolve({ kind: "pi", notePath: "a.md" }).cwd).toBe(VAULT);
  });
});

describe("resolveLaunch — environment", () => {
  it("drops entries with no value", () => {
    const spec = resolve({ kind: "shell" }, { KEEP: "yes", DROP: undefined });

    expect(spec.env.KEEP).toBe("yes");
    expect("DROP" in spec.env).toBe(false);
  });

  it("declares a 256-colour truecolor terminal", () => {
    const spec = resolve({ kind: "shell" });

    expect(spec.env.TERM).toBe("xterm-256color");
    expect(spec.env.COLORTERM).toBe("truecolor");
  });

  it("overrides an inherited terminal type", () => {
    const spec = resolve({ kind: "shell" }, { TERM: "dumb", COLORTERM: "" });

    expect(spec.env.TERM).toBe("xterm-256color");
    expect(spec.env.COLORTERM).toBe("truecolor");
  });

  it("puts the interpreter directories on PATH ahead of the inherited one", () => {
    const spec = resolve({ kind: "pi" }, { PATH: "/usr/bin:/bin" });
    const dirs = spec.env.PATH.split(":");

    expect(dirs).toContain("/etc/profiles/per-user/james/bin");
    expect(dirs.indexOf("/etc/profiles/per-user/james/bin")).toBeLessThan(
      dirs.indexOf("/usr/bin"),
    );
    expect(dirs).toContain("/bin");
  });

  it("still provides a PATH when none is inherited", () => {
    const spec = resolve({ kind: "pi" }, {});

    expect(spec.env.PATH).toContain("/etc/profiles/per-user/james/bin");
    expect(spec.env.PATH.endsWith(":")).toBe(false);
  });

  it("does not repeat a directory already present on the inherited PATH", () => {
    const spec = resolve({ kind: "pi" }, { PATH: "/etc/profiles/per-user/james/bin:/bin" });
    const dirs = spec.env.PATH.split(":");

    expect(dirs.filter((d) => d === "/etc/profiles/per-user/james/bin")).toHaveLength(1);
  });
});

describe("launch state round trip", () => {
  it.each<Launch>([
    { kind: "shell" },
    { kind: "pi" },
    { kind: "pi", notePath: "notes/with space.md" },
  ])("survives serialize then parse: %j", (launch) => {
    expect(parseLaunch(serializeLaunch(launch))).toEqual(launch);
  });

  it.each<Launch>([
    { kind: "shell" },
    { kind: "pi" },
    { kind: "pi", notePath: "a.md" },
  ])("produces plain JSON-safe state: %j", (launch) => {
    const state = serializeLaunch(launch);

    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("omits the note path key entirely when there is no note", () => {
    expect(Object.keys(serializeLaunch({ kind: "pi" }))).toEqual(["kind"]);
  });
});

describe("parseLaunch is total", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty object", {}],
    ["an unrecognised kind", { kind: "rm-rf" }],
    ["a string", "shell"],
    ["a number", 7],
    ["an array", []],
  ])("falls back to a shell launch for %s", (_label, input) => {
    expect(parseLaunch(input)).toEqual({ kind: "shell" });
  });

  it("drops a non-string note path but keeps the pi launch", () => {
    expect(parseLaunch({ kind: "pi", notePath: 42 })).toEqual({ kind: "pi" });
  });

  it("keeps a valid pi launch", () => {
    expect(parseLaunch({ kind: "pi", notePath: "a.md" })).toEqual({
      kind: "pi",
      notePath: "a.md",
    });
  });
});

describe("naming a launch", () => {
  it("titles panes by what they run", () => {
    expect(launchTitle({ kind: "shell" })).toBe("Terminal");
    expect(launchTitle({ kind: "pi" })).toBe("Pi");
    expect(launchTitle({ kind: "pi", notePath: "a.md" })).toBe("Pi");
  });

  it("describes a launch using the same words as its title", () => {
    expect(launchDescription({ kind: "shell" })).toBe("Terminal");
    expect(launchDescription({ kind: "pi" })).toBe("Pi");
  });

  it("names the note in a pi launch's description", () => {
    expect(launchDescription({ kind: "pi", notePath: "notes/a.md" })).toBe(
      "Pi for notes/a.md",
    );
  });
});

describe("locating node-pty inside the installed plugin folder", () => {
  it("builds an absolute path from the vault root and the plugin folder", () => {
    expect(nodePtyPath("/Users/james/Vault", ".obsidian/plugins/wterm-pi")).toBe(
      "/Users/james/Vault/.obsidian/plugins/wterm-pi/node_modules/node-pty",
    );
  });

  it("falls back to the bare module name when the plugin folder is unknown", () => {
    expect(nodePtyPath("/Users/james/Vault", undefined)).toBe("node-pty");
    expect(nodePtyPath("/Users/james/Vault", "")).toBe("node-pty");
  });
});

describe("parseAutostart", () => {
  it("is true only when the opening command asked for it", () => {
    expect(parseAutostart({ kind: "shell", autostart: true })).toBe(true);
  });

  it.each([
    ["a restored pane", { kind: "shell" }],
    ["a falsy flag", { kind: "shell", autostart: false }],
    ["a non-boolean flag", { kind: "shell", autostart: "yes" }],
    ["undefined", undefined],
    ["null", null],
  ])("is false for %s", (_label, state) => {
    expect(parseAutostart(state)).toBe(false);
  });

  it("is never persisted, because serializeLaunch does not emit it", () => {
    expect(serializeLaunch({ kind: "pi", notePath: "a.md" })).not.toHaveProperty(
      "autostart",
    );
  });
});
