import { describe, expect, it } from "vitest";
import {
  PI_COMMAND,
  agentDirPath,
  launchDescription,
  launchTitle,
  nodePtyPath,
  parseAutostart,
  parseLaunch,
  resolveLaunch,
  serializeLaunch,
  type Launch,
} from "./launch.js";
import { API_KEY_ENV, DEFAULT_SETTINGS, type Settings } from "./settings.js";

const VAULT = "/Users/james/Vault";
const AGENT_DIR = "/Users/james/Vault/.obsidian/plugins/wterm-pi/pi-agent";

const SETTINGS: Settings = { apiKey: "sk-test", model: "deepseek-v4-flash" };

const resolve = (
  launch: Launch,
  processEnv: NodeJS.ProcessEnv = {},
  settings: Settings = SETTINGS,
) => resolveLaunch(launch, { vaultRoot: VAULT, agentDir: AGENT_DIR, settings, processEnv });

describe("resolveLaunch — command and arguments", () => {
  it("runs pi by absolute path", () => {
    const spec = resolve({});

    expect(spec.command).toBe(PI_COMMAND);
    expect(spec.command.startsWith("/")).toBe(true);
  });

  it("ignores project-local pi files on every launch", () => {
    expect(resolve({}).args).toContain("--no-approve");
    expect(resolve({ notePath: "a.md" }).args).toContain("--no-approve");
  });

  it("selects the configured model, and offers both for cycling", () => {
    const args = resolve({}, {}, { apiKey: "sk", model: "deepseek-v4-pro" }).args;

    expect(args[args.indexOf("--model") + 1]).toBe("deepseek/deepseek-v4-pro");
    expect(args[args.indexOf("--models") + 1]).toBe(
      "deepseek/deepseek-v4-flash,deepseek/deepseek-v4-pro",
    );
  });

  it("passes the note as a single @-prefixed argument, last", () => {
    const spec = resolve({ notePath: "notes/daily.md" });

    expect(spec.args.at(-1)).toBe("@notes/daily.md");
    expect(spec.args.filter((a) => a.startsWith("@"))).toHaveLength(1);
  });

  it("passes note paths containing shell metacharacters through unaltered", () => {
    const hostile = `notes/a b; rm -rf $HOME/'quoted' & "x" | y \`z\`.md`;

    const spec = resolve({ notePath: hostile });

    expect(spec.args.at(-1)).toBe(`@${hostile}`);
    expect(spec.args.filter((a) => a.startsWith("@"))).toHaveLength(1);
  });

  it("takes no note argument when no note is open", () => {
    for (const launch of [{}, { notePath: undefined }, { notePath: "" }]) {
      expect(resolve(launch).args.some((a) => a.startsWith("@"))).toBe(false);
    }
  });

  it("always runs in the vault root", () => {
    expect(resolve({}).cwd).toBe(VAULT);
    expect(resolve({ notePath: "a.md" }).cwd).toBe(VAULT);
  });
});

describe("resolveLaunch — the api key", () => {
  it("passes the configured key in the variable pi reads", () => {
    expect(resolve({}, {}, { apiKey: "sk-live", model: "deepseek-v4-flash" }).env[
      API_KEY_ENV
    ]).toBe("sk-live");
  });

  it("never puts the key on the command line", () => {
    const spec = resolve({}, {}, { apiKey: "sk-live", model: "deepseek-v4-flash" });

    expect(spec.args.join(" ")).not.toContain("sk-live");
  });

  it("sets no key variable at all when none is configured", () => {
    const spec = resolve({}, {}, DEFAULT_SETTINGS);

    expect(spec.env[API_KEY_ENV]).toBeUndefined();
  });

  it("drops a key inherited from the environment rather than falling back to it", () => {
    const spec = resolve({}, { [API_KEY_ENV]: "sk-ambient" }, DEFAULT_SETTINGS);

    expect(spec.env[API_KEY_ENV]).toBeUndefined();
  });

  it("prefers the configured key over an inherited one", () => {
    const spec = resolve({}, { [API_KEY_ENV]: "sk-ambient" }, {
      apiKey: "sk-configured",
      model: "deepseek-v4-flash",
    });

    expect(spec.env[API_KEY_ENV]).toBe("sk-configured");
  });
});

describe("resolveLaunch — a self-contained agent", () => {
  it("points pi at the plugin's own configuration directory", () => {
    const spec = resolve({});

    expect(spec.env.PI_CODING_AGENT_DIR).toBe(AGENT_DIR);
  });

  it("leaves the package directory alone, which pi needs to identify itself", () => {
    expect(resolve({}).env.PI_PACKAGE_DIR).toBeUndefined();
  });

  it("drops every PI_ variable inherited from the user's environment", () => {
    const spec = resolve(
      {},
      {
        PI_KEY: "the-user-system-key",
        PI_MODEL: "something-else",
        PI_CODING_AGENT_DIR: "/Users/james/.pi/agent",
        PI_PACKAGE_DIR: "/Users/james/.pi/packages",
        PI_OFFLINE: "0",
      },
    );

    expect(spec.env.PI_KEY).toBeUndefined();
    expect(spec.env.PI_MODEL).toBeUndefined();
    expect(spec.env.PI_CODING_AGENT_DIR).toBe(AGENT_DIR);
    expect(spec.env.PI_PACKAGE_DIR).toBeUndefined();
    expect(spec.env.PI_OFFLINE).toBe("1");
  });

  it("keeps non-PI variables from the environment", () => {
    const spec = resolve({}, { HOME: "/Users/james", PIPENV: "keep-me" });

    expect(spec.env.HOME).toBe("/Users/james");
    expect(spec.env.PIPENV).toBe("keep-me");
  });

  it("disables startup network chatter", () => {
    expect(resolve({}).env.PI_OFFLINE).toBe("1");
  });
});

describe("resolveLaunch — environment", () => {
  it("drops entries with no value", () => {
    const spec = resolve({}, { KEEP: "yes", DROP: undefined });

    expect(spec.env.KEEP).toBe("yes");
    expect("DROP" in spec.env).toBe(false);
  });

  it("declares a 256-colour truecolor terminal", () => {
    const spec = resolve({}, { TERM: "dumb", COLORTERM: "" });

    expect(spec.env.TERM).toBe("xterm-256color");
    expect(spec.env.COLORTERM).toBe("truecolor");
  });

  it("puts the interpreter directories on PATH ahead of the inherited one", () => {
    const dirs = resolve({}, { PATH: "/usr/bin:/bin" }).env.PATH.split(":");

    expect(dirs).toContain("/etc/profiles/per-user/james/bin");
    expect(dirs.indexOf("/etc/profiles/per-user/james/bin")).toBeLessThan(
      dirs.indexOf("/usr/bin"),
    );
  });

  it("still provides a PATH when none is inherited", () => {
    const spec = resolve({}, {});

    expect(spec.env.PATH).toContain("/etc/profiles/per-user/james/bin");
    expect(spec.env.PATH.endsWith(":")).toBe(false);
  });

  it("does not repeat a directory already present on the inherited PATH", () => {
    const dirs = resolve({}, {
      PATH: "/etc/profiles/per-user/james/bin:/bin",
    }).env.PATH.split(":");

    expect(dirs.filter((d) => d === "/etc/profiles/per-user/james/bin")).toHaveLength(1);
  });
});

describe("locating plugin-relative paths", () => {
  it("builds the node-pty path from the vault root and the plugin folder", () => {
    expect(nodePtyPath("/Users/james/Vault", ".obsidian/plugins/wterm-pi")).toBe(
      "/Users/james/Vault/.obsidian/plugins/wterm-pi/node_modules/node-pty",
    );
  });

  it("falls back to the bare module name when the plugin folder is unknown", () => {
    expect(nodePtyPath("/Users/james/Vault", undefined)).toBe("node-pty");
    expect(nodePtyPath("/Users/james/Vault", "")).toBe("node-pty");
  });

  it("keeps the agent directory inside the plugin folder", () => {
    expect(agentDirPath("/Users/james/Vault", ".obsidian/plugins/wterm-pi")).toBe(
      "/Users/james/Vault/.obsidian/plugins/wterm-pi/pi-agent",
    );
  });

  it("still produces an agent directory when the plugin folder is unknown", () => {
    expect(agentDirPath("/Users/james/Vault", undefined)).toBe(
      "/Users/james/Vault/.obsidian/plugins/wterm-pi/pi-agent",
    );
  });
});

describe("launch state round trip", () => {
  it.each<Launch>([{}, { notePath: "notes/with space.md" }])(
    "survives serialize then parse: %j",
    (launch) => {
      expect(parseLaunch(serializeLaunch(launch))).toEqual(launch);
    },
  );

  it.each<Launch>([{}, { notePath: "a.md" }])(
    "produces plain JSON-safe state: %j",
    (launch) => {
      const state = serializeLaunch(launch);

      expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    },
  );

  it("omits the note path key entirely when there is no note", () => {
    expect(Object.keys(serializeLaunch({}))).toEqual([]);
  });
});

describe("parseLaunch is total", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an empty object", {}],
    ["a string", "pi"],
    ["a number", 7],
    ["an array", []],
    ["a non-string note path", { notePath: 42 }],
    ["an empty note path", { notePath: "" }],
    ["stale state from the shell era", { kind: "shell" }],
  ])("falls back to a plain pi launch for %s", (_label, input) => {
    expect(parseLaunch(input)).toEqual({});
  });

  it("keeps a valid note path", () => {
    expect(parseLaunch({ notePath: "a.md" })).toEqual({ notePath: "a.md" });
  });
});

describe("parseAutostart", () => {
  it("is true only when the opening command asked for it", () => {
    expect(parseAutostart({ autostart: true })).toBe(true);
  });

  it.each([
    ["a restored pane", {}],
    ["a falsy flag", { autostart: false }],
    ["a non-boolean flag", { autostart: "yes" }],
    ["undefined", undefined],
    ["null", null],
  ])("is false for %s", (_label, state) => {
    expect(parseAutostart(state)).toBe(false);
  });

  it("is never persisted, because serializeLaunch does not emit it", () => {
    expect(serializeLaunch({ notePath: "a.md" })).not.toHaveProperty("autostart");
  });
});

describe("naming a launch", () => {
  it("titles every pane Pi", () => {
    expect(launchTitle()).toBe("Pi");
  });

  it("names the note in a launch description when there is one", () => {
    expect(launchDescription({})).toBe("Pi");
    expect(launchDescription({ notePath: "notes/a.md" })).toBe("Pi for notes/a.md");
  });
});
