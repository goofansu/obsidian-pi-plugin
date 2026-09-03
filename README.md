# wterm Pi

A terminal in Obsidian's right sidebar, and a one-command way to hand the note
you are reading to the Pi coding agent.

Personal, single-machine plugin: Apple Silicon macOS, Obsidian 1.13.7. Not
distributed. The spec lives in `.scratch/obsidian-wterm-spec.md`.

## Commands

| Command | Default key | What it does |
| --- | --- | --- |
| **Show or hide Pi** | — | Opens the Pi pane, or closes it if it is open |
| **Jump between your note and Pi** | `Cmd+Shift+/` | Moves the keyboard to Pi, or back to your note if you are already in Pi. Opens Pi if it is not open. |
| **Send selected text to Pi** | `Cmd+Shift+>` | Puts the selected note text into Pi's editor and focuses it. Inserted, never submitted — add your question and press enter yourself. |

One session, in the right sidebar, running in your vault. There is no shell
command and no per-note command: Pi reads any note it needs with its own tools.

Rebind the key in Settings → Hotkeys if it clashes with something.

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

## External editor

Pi's Ctrl+G opens `vi`. Pi would otherwise fall back to `nano`, since Obsidian
launched from the Finder passes no `EDITOR` or `VISUAL`. Change `EDITOR_COMMAND`
in the launch module to use something else.

## Self-contained agent

This plugin's Pi does not share anything with a Pi you have installed yourself:

- it uses its own configuration directory, `pi-agent/` inside the plugin folder,
  so its credentials, sessions, extensions, skills, and trust decisions are
  separate;
- every `PI_*` variable in the environment is dropped before it starts, along
  with any `DEEPSEEK_API_KEY`, so nothing ambient leaks in;
- `--approve` trusts the vault on every launch, so no trust prompt appears and
  no decision is written anywhere — note that a trusted project may load `.pi`
  resources and run project extensions from inside the vault;
- `--no-skills` disables skill loading entirely, which the separate
  configuration directory cannot do on its own — skills are also discovered from
  `~/.agents/skills` and from `.agents/skills` above the working directory;
- `PI_OFFLINE` suppresses update checks and telemetry, but not model requests.

Your own `~/.pi` is never read or written by this plugin.

Both open a new tab in the right sidebar, expanding it if collapsed. Panes can be
dragged into the main editor area without interrupting the session. Closing a
pane kills its process.

Quitting Pi closes the pane. If Pi exits with an error the pane stays open
instead, showing the exit code, and a keystroke restarts it.

Pi's pane is not restored when you reopen your vault. Obsidian saves it in the
workspace layout, but the plugin closes it as the layout settles, without
starting anything — opening a vault should show your notes, not launch an agent.

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
5. From a note, press `Cmd+Shift+/`: focus lands in Pi. Press it again: focus
   returns to the note. Press it with Pi closed: Pi opens and takes focus.
6. Select a few lines in a note and press `Cmd+Shift+>`: the passage appears in
   Pi's editor, unsent, with the cursor there. Press it with nothing selected:
   a notice says so.
7. The shell pane and the Pi pane coexist as separate sidebar tabs.
8. Ask Pi to read a second note in the vault.
9. Drag a live pane into the main editor area: the session continues.
10. Close a pane mid-response: `ps` shows no orphaned process.
11. Restart Obsidian with Pi open: the pane does not come back, and no `pi`
    process is running.
12. Quit Pi with `Ctrl+D`: the pane closes on its own.

## Theme

Pi is started with its own `light` or `dark` theme to match Obsidian's current
mode. Pi normally chooses by asking the terminal for its background colour; this
emulator does not answer that, so without being told it would always assume dark.
The mode is read when a session starts, so switching Obsidian's theme applies to
panes opened afterwards, not to running ones. That limit is Pi's: it detects
appearance only at startup, and rewriting its theme file mid-session was measured
to have no effect, even after `/reload`. Restart a pane to change its theme.

The sixteen ANSI colours are handled separately by the stylesheet. The palette
there is Pi's own, copied from its built-in `dark.json` and `light.json`
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
