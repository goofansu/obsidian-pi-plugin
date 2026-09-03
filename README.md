# wterm Pi

A terminal in Obsidian's right sidebar, and a one-command way to hand the note
you are reading to the Pi coding agent.

Personal, single-machine plugin: Apple Silicon macOS, Obsidian 1.13.7. Not
distributed. The spec lives in `.scratch/obsidian-wterm-spec.md`.

## Commands

| Command | What it runs |
| --- | --- |
| **Open terminal** | Pi in the vault root, with no note argument |
| **Open Pi for current note** | Pi in the vault root, with the active note as an `@file` argument |

There is no shell command; this pane runs Pi and nothing else.

## Configuration

Settings → Community plugins → wterm Pi:

- **DeepSeek API key** — required. A pane opened without one says so and waits.
- **Model** — `deepseek-v4-flash` (default) or `deepseek-v4-pro`. Applies to
  sessions started from then on; both can be cycled inside a running session.

Pi has a native `deepseek` provider, so nothing else needs configuring.

The key is stored by Obsidian in this plugin's `data.json` inside the vault, in
plain text — Obsidian offers no secret storage. It reaches Pi as the
`DEEPSEEK_API_KEY` environment variable, never as a command-line argument, so it
does not appear in the process list. It is as safe as your vault, and no safer.

## Self-contained agent

This plugin's Pi does not share anything with a Pi you have installed yourself:

- it uses its own configuration directory, `pi-agent/` inside the plugin folder,
  so its credentials, sessions, extensions, skills, and trust decisions are
  separate;
- every `PI_*` variable in the environment is dropped before it starts, along
  with any `DEEPSEEK_API_KEY`, so nothing ambient leaks in;
- `--no-approve` makes it ignore project-local `.pi` files inside the vault;
- `--no-skills` disables skill loading entirely, which the separate
  configuration directory cannot do on its own — skills are also discovered from
  `~/.agents/skills` and from `.agents/skills` above the working directory;
- `PI_OFFLINE` suppresses update checks and telemetry, but not model requests.

Your own `~/.pi` is never read or written by this plugin.

Both open a new tab in the right sidebar, expanding it if collapsed. Panes can be
dragged into the main editor area without interrupting the session. Closing a
pane kills its process.

A pane that Obsidian restores at startup waits rather than starting on its own —
click it or press a key to start. This is deliberate: opening Obsidian should
never silently launch an agent. A pane whose process has exited waits the same
way, so you can restart it without reopening the pane.

## Build and install

```bash
npm install                      # also makes node-pty's spawn-helper executable
npm run build                    # typechecks, then writes main.js and styles.css
npm run install-to -- "/path/to/Vault"
```

`install-to` symlinks this folder into the vault's `.obsidian/plugins/wterm-pi`.
A symlink rather than a copy matters: `node_modules/node-pty` must be present in
the installed folder, because the native pseudo-terminal addon is deliberately
not bundled into `main.js` and is loaded from there at runtime.

Then, in Obsidian: enable community plugins, and enable **wterm Pi**.

### If the native addon fails to load

The pane will show `[error] Could not load node-pty: …` rather than the plugin
failing to load. The remedy is to rebuild that one module against Obsidian's
Electron version:

```bash
npx @electron/rebuild -v 43.3.0 -f -o node-pty
```

Do not introduce a binary download system unless this proves insufficient.

## Verification checklist

Automated tests cover the two pure modules only. Everything below is checked by
hand, because the rest needs a real Obsidian and Electron runtime.

1. With the right sidebar collapsed, run **Open terminal**: the sidebar expands
   and the pane has focus.
2. The prompt appears immediately, with no "could not read response to Primary
   Device Attribute query" warning.
3. Plain output, `vim`, and colour render correctly.
4. Drag the sidebar wider: the terminal reflows and `vim` redraws at the new size.
5. Run **Open Pi for current note** from an open note: Pi starts with that note in
   context, and the note captured is the one you were reading — not the terminal.
6. The shell pane and the Pi pane coexist as separate sidebar tabs.
7. Ask Pi to read a second note in the vault.
8. Drag a live pane into the main editor area: the session continues.
9. Close a pane mid-response: `ps` shows no orphaned process.
10. Restart Obsidian: restored panes are idle, and clicking one starts it.
11. Type `exit` in a shell pane: the exit code is reported, and a keystroke
    starts a fresh shell in the same pane.

## Theme

The palette is Pi's own, copied from its built-in `dark.json` and `light.json`
themes, so Pi looks here as it does in a terminal. Obsidian's light or dark mode
picks which one applies, switching with no restart. The background stays
Obsidian's — Pi's themes set none, inheriting the terminal's — so the pane blends
with the app. The monospace font and size follow Obsidian too.

If Pi's themes change upstream, they are at
`dist/modes/interactive/theme/{dark,light}.json` in the installed package.

To adjust anything, override the emulator's custom properties in a CSS snippet,
for example:

```css
.wterm-pi-host.wterm { --term-font-size: 15px; }
```

## Development

```bash
npm test        # resolver unit tests
npm run typecheck
npm run dev     # esbuild watch
```

## Note on trust

Pi launched here runs with your full user permissions. It is not sandboxed to the
vault. The plugin's contribution is narrow: absolute executable paths, arguments
passed as an array and never interpolated into a shell string, the vault root as
working directory, processes killed with their pane, and nothing auto-submitted
on your behalf.
