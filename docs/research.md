# Minimal wterm terminal plugin for Obsidian on this Mac

**Revised scope:** personal use, macOS only, no distribution, with Pi as the only required harness.  
**Machine inspected:** Apple Silicon macOS; Obsidian 1.13.7 / Electron 43.3.0; Pi installed at `/Users/james/.npm-global/bin/pi`.

## Recommendation

Build one desktop-only Obsidian plugin containing:

1. one `ItemView`;
2. one framework-free `@wterm/dom` instance;
3. one local `node-pty` process;
4. two Obsidian commands:
   - **Open terminal** — starts `/bin/zsh -l` in the vault root;
   - **Open Pi for current note** — starts Pi directly in the vault root and passes the active note as an `@file` argument.

That is enough for a general terminal and for Pi to use the vault as its working context. Do not add tabs, session restoration, a WebSocket server, React, settings UI, Claude Code support, binary downloads, or cross-platform packaging initially.

```text
Obsidian ItemView
  └── WTerm (terminal emulator)
       ├── user input ─────► node-pty ─────► zsh or pi
       ├── resize ─────────► node-pty.resize
       ◄── terminal output ─ node-pty
```

## Why this is now small

The earlier design's largest risk was distributing native PTY binaries for several Electron versions, operating systems, and CPU architectures. None of that is necessary for a personal plugin on one Mac.

`node-pty` 1.1.0 already includes `darwin-arm64/pty.node` and `darwin-arm64/spawn-helper` prebuilds in its npm package. Keep `node-pty` in the plugin's local `node_modules` directory and mark it external in esbuild rather than attempting to bundle the native addon into `main.js`. Ensure `spawn-helper` is executable after installation.

wterm itself is uncomplicated to package. `@wterm/dom` is framework-free, and its default Zig/WASM core is embedded in its JavaScript package. Its API provides `onData`, `onResize`, `write`, `focus`, and `destroy`, which map directly to a PTY.[^wterm-dom]

## Vault context model

There is no need to copy the whole vault into a prompt.

### Base context

Spawn the shell or Pi with the vault root as `cwd`. Pi's tools can then read and search the vault naturally. Pi also discovers `AGENTS.md` or `CLAUDE.md` from its working directory and parents, so a vault-level `AGENTS.md` is the right place for stable instructions about the vault.[^pi-context]

For example, a vault `AGENTS.md` could say:

```md
# Vault context

This is an Obsidian vault.
- Notes are Markdown files.
- Preserve YAML frontmatter and wiki-link syntax.
- Do not modify `.obsidian/` unless explicitly asked.
- Prefer linking related notes with `[[wiki links]]`.
```

### Focused-note context

The **Open Pi for current note** command should launch:

```text
/Users/james/.npm-global/bin/pi @path/to/current-note.md
```

Pass the executable and arguments separately to `node-pty.spawn`; do not form a shell command string. Pi officially supports `@file` CLI arguments and opens interactively when `--print` is absent.[^pi-cli]

Use the note's vault-relative path while Pi's `cwd` is the vault root. This gives Pi both:

- direct awareness of the note that initiated the session; and
- normal tool access to the rest of the vault.

An optional initial message can be another argument:

```text
Use this note as the starting context. Wait for my request.
```

It may be nicer to omit this initially: the `@file` argument alone supplies the file, and the terminal opens with an empty editor for the user's actual request.

### Later enhancement, only if needed

Add **Send current note to Pi** or **Send selection to Pi** by writing a short prompt into the active PTY. Use bracketed-paste sequences around multiline text, and insert rather than automatically submit so the user can review it. This is not required for version one because Pi can read any vault-relative path itself.

## Minimal runtime behavior

### Command 1: Open terminal

Spawn:

```ts
pty.spawn("/bin/zsh", ["-l"], {
  cwd: vaultRoot,
  cols,
  rows,
  name: "xterm-256color",
  env,
});
```

The user can run `pi`, `git`, `rg`, or any other terminal command. Because this uses an absolute shell path, it does not depend on Obsidian's GUI `PATH` to locate zsh.

### Command 2: Open Pi for current note

Spawn:

```ts
const args = activeFile ? [`@${activeFile.path}`] : [];

pty.spawn("/Users/james/.npm-global/bin/pi", args, {
  cwd: vaultRoot,
  cols,
  rows,
  name: "xterm-256color",
  env,
});
```

Using Pi directly is simpler than launching a shell and injecting `pi ...` into it:

- no quoting problems;
- no dependency on shell startup files;
- deterministic executable selection;
- closing the view maps directly to the Pi process.

Pi's normal interactive TUI should be used. RPC mode is unnecessary because the requirement is a terminal interface, and print mode is not interactive.

## Minimal project shape

```text
obsidian-wterm/
├── package.json
├── manifest.json
├── esbuild.config.mjs
├── src/
│   ├── main.ts
│   └── terminal-view.ts
├── styles.css
└── node_modules/
    └── node-pty/          # retained at runtime; not bundled
```

Suggested dependencies:

```json
{
  "dependencies": {
    "@wterm/dom": "0.4.1",
    "node-pty": "1.1.0"
  },
  "devDependencies": {
    "esbuild": "^0.25.0",
    "obsidian": "latest",
    "typescript": "^5.8.0"
  }
}
```

Pin wterm initially because it is still a young package. Bundle `@wterm/dom` into `main.js`, but add `node-pty` to esbuild's `external` list alongside `obsidian`, `electron`, and Node built-ins. The plugin directory installed into the vault must retain `node_modules/node-pty`.

`manifest.json` must contain:

```json
{
  "id": "wterm-pi",
  "name": "wterm Pi",
  "version": "0.0.1",
  "minAppVersion": "1.13.7",
  "description": "A local wterm terminal for Pi.",
  "author": "James",
  "isDesktopOnly": true
}
```

## View implementation sketch

```ts
import { FileSystemAdapter, ItemView, WorkspaceLeaf } from "obsidian";
import { WTerm } from "@wterm/dom";
import * as pty from "node-pty";

const VIEW_TYPE = "wterm-pi-terminal";

type Launch =
  | { kind: "shell" }
  | { kind: "pi"; notePath?: string };

export class TerminalView extends ItemView {
  private term?: WTerm;
  private process?: pty.IPty;
  private subscriptions: Array<{ dispose(): void }> = [];

  constructor(leaf: WorkspaceLeaf, private launch: Launch) {
    super(leaf);
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.launch.kind === "pi" ? "Pi" : "Terminal"; }

  async onOpen() {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      throw new Error("A filesystem-backed vault is required");
    }

    const cwd = adapter.getBasePath();
    const host = this.contentEl.createDiv({ cls: "wterm-pi-host" });
    const env = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] =>
        entry[1] !== undefined
      )
    );

    const command = this.launch.kind === "pi"
      ? "/Users/james/.npm-global/bin/pi"
      : "/bin/zsh";
    const args = this.launch.kind === "pi"
      ? (this.launch.notePath ? [`@${this.launch.notePath}`] : [])
      : ["-l"];

    let proc: pty.IPty | undefined;
    const term = await new WTerm(host, {
      autoResize: true,
      // Supplying callbacks prevents wterm's standalone input echo while the
      // PTY is not ready. The current PTY size is read after initialization.
      onData: data => proc?.write(data),
      onResize: (cols, rows) => proc?.resize(cols, rows),
    }).init();

    proc = pty.spawn(command, args, {
      cwd,
      cols: term.cols,
      rows: term.rows,
      name: "xterm-256color",
      env: { ...env, TERM: "xterm-256color", COLORTERM: "truecolor" },
    });

    this.subscriptions.push(
      proc.onData(data => term.write(data)),
      proc.onExit(({ exitCode }) =>
        term.write(`\r\n[process exited ${exitCode}]\r\n`)
      ),
    );

    this.process = proc;
    this.term = term;
  }

  async onClose() {
    for (const subscription of this.subscriptions) subscription.dispose();
    this.subscriptions = [];
    this.process?.kill();
    this.term?.destroy();
  }
}
```

The actual plugin needs a small way to pass launch state into a view. Prefer storing serializable launch state in the leaf's view state rather than capturing mutable state in the registered view factory. Keep one leaf per command invocation or, for the absolute minimum, reuse one leaf and replace its process.

## Minimal CSS

Start with wterm's package CSS, then only add sizing:

```css
.workspace-leaf-content[data-type="wterm-pi-terminal"] .view-content {
  padding: 0;
  overflow: hidden;
}

.wterm-pi-host {
  width: 100%;
  height: 100%;
  background: var(--background-primary);
}
```

Map colors to Obsidian later only if wterm's defaults look out of place.

## Things deliberately omitted

- **WebSocket transport:** both components are in one process, so it adds no value.
- **React/Vue wrapper:** Obsidian already supplies the DOM lifecycle.
- **Claude Code:** Pi is installed and has a documented `@file` interface; supporting one harness keeps the first version testable.
- **Settings page:** paths can be constants for this machine.
- **Native binary downloader/checksums:** this plugin is built and installed locally.
- **Session tabs/history/restore:** Pi already saves sessions and provides `pi -c` and `pi -r`.[^pi-sessions]
- **Transcript persistence:** avoid duplicating sensitive conversation data.
- **Selection injection:** useful, but not needed to prove the workflow.
- **Cross-platform handling:** only `darwin-arm64` matters here.

## Build/install notes for this machine

1. Install dependencies locally with npm.
2. Confirm the helper is executable:

   ```bash
   chmod +x node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper
   ```

3. Build `main.js` and copy/symlink the project into the target vault's `.obsidian/plugins/wterm-pi/` directory.
4. Preserve `node_modules/node-pty` in that installed directory because it is loaded at runtime.
5. Enable the plugin and test **Open terminal** first with `printf`, `vim`, and resize.
6. Test **Open Pi for current note**, verify the note appears in Pi's initial context, and ask Pi to read a second vault note.
7. Close the pane during an active Pi response and confirm no orphan process remains.

If the prebuilt native addon fails to load inside Obsidian, rebuild only `node-pty` for Obsidian's Electron 43.3.0 runtime using `@electron/rebuild`. Do not introduce a download system unless that local rebuild is actually necessary.

## Security boundary

Even for personal use, Pi runs with this user's full filesystem and shell permissions; it is not confined to the vault. The minimal plugin should:

- use fixed absolute executable paths;
- pass arguments as arrays, never interpolated shell commands;
- use the filesystem adapter's vault root as `cwd`;
- kill the PTY when the view closes or plugin unloads;
- avoid logging terminal output or environment variables;
- avoid automatically submitting note content as commands.

## Bottom line

For this scope, the implementation is a thin adapter, not a terminal platform. The shortest useful version is:

- wterm for rendering/input;
- node-pty for one macOS PTY;
- zsh for a general terminal;
- direct Pi launch for the active note;
- vault root as CWD;
- optional vault-level `AGENTS.md` for persistent instructions.

The first version should be small enough to implement directly. There is no reason to solve distribution or Claude Code before validating this local Pi workflow.

## Sources

[^wterm-dom]: Vercel Labs, [`@wterm/dom` README](https://github.com/vercel-labs/wterm/blob/34cebd2b469e4ddad093511f0059f8b29e25004a/packages/%40wterm/dom/README.md), documenting embedded WASM and the terminal API.
[^pi-context]: Pi documentation, [Context Files](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md#context-files).
[^pi-cli]: Pi documentation, [CLI Reference and File Arguments](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md#cli-reference).
[^pi-sessions]: Pi documentation, [Sessions](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md#sessions).
