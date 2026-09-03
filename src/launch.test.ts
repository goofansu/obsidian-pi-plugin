import { describe, expect, it } from "vitest";
import {
  agentDirPath,
  EDITOR_COMMAND,
  LOCALE,
  nodePtyPath,
  PATH_PREPEND,
  PI_COMMAND,
  resolveLaunch,
} from "./launch.js";
import { API_KEY_ENV, DEFAULT_SETTINGS, type Settings } from "./settings.js";

const VAULT = "/Users/james/Vault";
const AGENT_DIR =
  "/Users/james/Vault/.obsidian/plugins/obsidian-pi-plugin/pi-agent";

const SETTINGS: Settings = { apiKey: "sk-test", model: "deepseek-v4-flash" };

const resolve = (
  processEnv: NodeJS.ProcessEnv = {},
  settings: Settings = SETTINGS,
  appearance: "light" | "dark" = "dark",
) =>
  resolveLaunch({
    vaultRoot: VAULT,
    agentDir: AGENT_DIR,
    settings,
    appearance,
    processEnv,
  });

describe("resolveLaunch — command and arguments", () => {
  it("runs pi, resolved through the PATH it is given", () => {
    const spec = resolve();

    expect(spec.command).toBe(PI_COMMAND);
    // The directories holding it lead that PATH, ahead of anything inherited.
    expect(spec.env.PATH.split(":").slice(0, PATH_PREPEND.length)).toEqual(
      PATH_PREPEND,
    );
  });

  it("trusts the vault on every launch, so the trust prompt never appears", () => {
    expect(resolve().args).toContain("--approve");
    expect(resolve().args).toContain("--approve");
  });

  it("never passes the opposite flag, which would override a saved decision", () => {
    expect(resolve().args).not.toContain("--no-approve");
  });

  it("keeps skills off even though the project is trusted", () => {
    expect(resolve().args).toContain("--no-skills");
  });

  it("loads no skills on every launch", () => {
    // The private config directory cannot cover this: skills also come from
    // ~/.agents/skills and from .agents/skills above the working directory.
    expect(resolve().args).toContain("--no-skills");
    expect(resolve().args).toContain("--no-skills");
  });

  it.each(["light", "dark"] as const)(
    "asks pi for the %s theme, matching Obsidian",
    (appearance) => {
      const args = resolve({}, SETTINGS, appearance).args;

      expect(args[args.indexOf("--use-theme") + 1]).toBe(appearance);
    },
  );

  it("selects the configured model, and offers both for cycling", () => {
    const args = resolve({}, { apiKey: "sk", model: "deepseek-v4-pro" }).args;

    expect(args[args.indexOf("--model") + 1]).toBe("deepseek/deepseek-v4-pro");
    expect(args[args.indexOf("--models") + 1]).toBe(
      "deepseek/deepseek-v4-flash,deepseek/deepseek-v4-pro",
    );
  });

  it("always runs in the vault root", () => {
    expect(resolve().cwd).toBe(VAULT);
    expect(resolve().cwd).toBe(VAULT);
  });
});

describe("resolveLaunch — the api key", () => {
  it("passes the configured key in the variable pi reads", () => {
    expect(
      resolve({}, { apiKey: "sk-live", model: "deepseek-v4-flash" }).env[
        API_KEY_ENV
      ],
    ).toBe("sk-live");
  });

  it("never puts the key on the command line", () => {
    const spec = resolve({}, { apiKey: "sk-live", model: "deepseek-v4-flash" });

    expect(spec.args.join(" ")).not.toContain("sk-live");
  });

  it("sets no key variable at all when none is configured", () => {
    const spec = resolve({}, DEFAULT_SETTINGS);

    expect(spec.env[API_KEY_ENV]).toBeUndefined();
  });

  it("drops a key inherited from the environment rather than falling back to it", () => {
    const spec = resolve({ [API_KEY_ENV]: "sk-ambient" }, DEFAULT_SETTINGS);

    expect(spec.env[API_KEY_ENV]).toBeUndefined();
  });

  it("prefers the configured key over an inherited one", () => {
    const spec = resolve(
      { [API_KEY_ENV]: "sk-ambient" },
      {
        apiKey: "sk-configured",
        model: "deepseek-v4-flash",
      },
    );

    expect(spec.env[API_KEY_ENV]).toBe("sk-configured");
  });
});

describe("resolveLaunch — a self-contained agent", () => {
  it("points pi at the plugin's own configuration directory", () => {
    const spec = resolve();

    expect(spec.env.PI_CODING_AGENT_DIR).toBe(AGENT_DIR);
  });

  it("leaves the package directory alone, which pi needs to identify itself", () => {
    expect(resolve().env.PI_PACKAGE_DIR).toBeUndefined();
  });

  it("drops every PI_ variable inherited from the user's environment", () => {
    const spec = resolve({
      PI_KEY: "the-user-system-key",
      PI_MODEL: "something-else",
      PI_CODING_AGENT_DIR: "/Users/james/.pi/agent",
      PI_PACKAGE_DIR: "/Users/james/.pi/packages",
      PI_OFFLINE: "0",
    });

    expect(spec.env.PI_KEY).toBeUndefined();
    expect(spec.env.PI_MODEL).toBeUndefined();
    expect(spec.env.PI_CODING_AGENT_DIR).toBe(AGENT_DIR);
    expect(spec.env.PI_PACKAGE_DIR).toBeUndefined();
    expect(spec.env.PI_OFFLINE).toBe("1");
  });

  it("keeps non-PI variables from the environment", () => {
    const spec = resolve({ HOME: "/Users/james", PIPENV: "keep-me" });

    expect(spec.env.HOME).toBe("/Users/james");
    expect(spec.env.PIPENV).toBe("keep-me");
  });

  it("disables startup network chatter", () => {
    expect(resolve().env.PI_OFFLINE).toBe("1");
  });
});

describe("resolveLaunch — the external editor", () => {
  it("gives pi vi for its Ctrl+G editor", () => {
    const spec = resolve();

    expect(spec.env.EDITOR).toBe(EDITOR_COMMAND);
    expect(spec.env.VISUAL).toBe(EDITOR_COMMAND);
  });

  it("overrides an inherited editor, so the choice does not depend on the environment", () => {
    const spec = resolve({ EDITOR: "nano", VISUAL: "emacs" });

    expect(spec.env.EDITOR).toBe(EDITOR_COMMAND);
    expect(spec.env.VISUAL).toBe(EDITOR_COMMAND);
  });
});

describe("the directories read from the machine", () => {
  it("are absolute, and lead with somewhere node can be found", () => {
    expect(PATH_PREPEND.length).toBeGreaterThan(0);
    for (const dir of PATH_PREPEND) expect(dir.startsWith("/")).toBe(true);
  });
});

describe("resolveLaunch — the locale", () => {
  it("declares a UTF-8 locale, without which programs render mojibake", () => {
    const spec = resolve();

    expect(spec.env.LANG).toBe(LOCALE);
    expect(spec.env.LC_ALL).toBe(LOCALE);
    expect(LOCALE).toMatch(/UTF-8$/);
  });

  it("overrides a non-UTF-8 locale inherited from the environment", () => {
    const spec = resolve({ LANG: "C", LC_ALL: "POSIX" });

    expect(spec.env.LANG).toBe(LOCALE);
    expect(spec.env.LC_ALL).toBe(LOCALE);
  });
});

describe("resolveLaunch — environment", () => {
  it("drops entries with no value", () => {
    const spec = resolve({ KEEP: "yes", DROP: undefined });

    expect(spec.env.KEEP).toBe("yes");
    expect("DROP" in spec.env).toBe(false);
  });

  it("declares a 256-colour truecolor terminal", () => {
    const spec = resolve({ TERM: "dumb", COLORTERM: "" });

    expect(spec.env.TERM).toBe("xterm-256color");
    expect(spec.env.COLORTERM).toBe("truecolor");
  });

  it("puts the interpreter directories on PATH ahead of the inherited one", () => {
    const dirs = resolve({ PATH: "/usr/bin:/bin" }).env.PATH.split(":");

    for (const dir of PATH_PREPEND) expect(dirs).toContain(dir);
    expect(dirs.indexOf(PATH_PREPEND[0])).toBeLessThan(
      dirs.indexOf("/usr/bin"),
    );
  });

  it("guarantees the system directories, so a bare command always resolves", () => {
    const dirs = resolve({ PATH: "/opt/homebrew/bin" }).env.PATH.split(":");

    expect(dirs).toContain("/usr/bin");
    expect(dirs).toContain("/bin");
    // Appended, so they never shadow the user's own tools.
    expect(dirs.indexOf("/opt/homebrew/bin")).toBeLessThan(
      dirs.indexOf("/usr/bin"),
    );
  });

  it("does not repeat a system directory the environment already had", () => {
    const dirs = resolve({ PATH: "/usr/bin:/bin" }).env.PATH.split(":");

    expect(dirs.filter((d) => d === "/usr/bin")).toHaveLength(1);
  });

  it("still provides a PATH when none is inherited", () => {
    const spec = resolve();

    for (const dir of PATH_PREPEND) expect(spec.env.PATH).toContain(dir);
    expect(spec.env.PATH.endsWith(":")).toBe(false);
  });

  it("does not repeat a directory already present on the inherited PATH", () => {
    const dirs = resolve({
      PATH: `${PATH_PREPEND[0]}:/bin`,
    }).env.PATH.split(":");

    expect(dirs.filter((d) => d === PATH_PREPEND[0])).toHaveLength(1);
  });
});

describe("locating plugin-relative paths", () => {
  it("builds the node-pty path from the vault root and the plugin folder", () => {
    expect(
      nodePtyPath("/Users/james/Vault", ".obsidian/plugins/obsidian-pi-plugin"),
    ).toBe(
      "/Users/james/Vault/.obsidian/plugins/obsidian-pi-plugin/node_modules/node-pty",
    );
  });

  it("falls back to the bare module name when the plugin folder is unknown", () => {
    expect(nodePtyPath("/Users/james/Vault", undefined)).toBe("node-pty");
    expect(nodePtyPath("/Users/james/Vault", "")).toBe("node-pty");
  });

  it("keeps the agent directory inside the plugin folder", () => {
    expect(
      agentDirPath(
        "/Users/james/Vault",
        ".obsidian/plugins/obsidian-pi-plugin",
      ),
    ).toBe("/Users/james/Vault/.obsidian/plugins/obsidian-pi-plugin/pi-agent");
  });

  it("still produces an agent directory when the plugin folder is unknown", () => {
    expect(agentDirPath("/Users/james/Vault", undefined)).toBe(
      "/Users/james/Vault/.obsidian/plugins/obsidian-pi-plugin/pi-agent",
    );
  });
});
