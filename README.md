# Pi for Obsidian

A terminal in Obsidian's right sidebar, and a one-command way to hand the note
you are reading to the Pi coding agent.

macOS only, Obsidian 1.13.7 or newer. Built and used on Apple Silicon; the
Intel binaries are shipped but untested. The spec lives in `.scratch/spec.md`;
the original research that preceded it is in `docs/research.md`.

## Install

Each release carries one archive, `obsidian-pi-plugin-<version>-macos.zip`,
which is the finished plugin folder with the native pseudo-terminal addon
already inside it. There is nothing to clone and nothing to build.

1. Download the zip from the
   [latest release](https://github.com/goofansu/obsidian-pi-plugin/releases/latest).
2. Unzip it into your vault's `.obsidian/plugins/`, so the plugin lands at
   `<Vault>/.obsidian/plugins/obsidian-pi-plugin/`.
3. Clear the quarantine flag your browser attached to the download:

   ```bash
   xattr -dr com.apple.quarantine "<Vault>/.obsidian/plugins/obsidian-pi-plugin"
   ```

   Harmless if there is none, and it saves a puzzling `Could not load node-pty`
   should macOS decide to enforce it against the unsigned addon.
4. In Obsidian: Settings → Community plugins, turn them on if they are off,
   then enable **Pi**.
5. Configure the plugin, below. **Extra PATH directories** is normally
   required, and the **DeepSeek API key** always is.

Obsidian's own community-plugin installer could not deliver this plugin: it
fetches `main.js`, `manifest.json`, and `styles.css` and nothing else, and this
plugin also needs `node_modules/node-pty` in its folder. Hence the zip.

Pi itself is not in the archive. The plugin runs the `pi` on your `PATH`.

## Commands

| Command | Default key | What it does |
| --- | --- | --- |
| **Pi: Toggle focus** | `Cmd+Shift+/` | Moves the keyboard to Pi, or back to your note if you are already in Pi |
| **Pi: Add selection to thread** | `Cmd+Shift+>` | Puts the selected note text into Pi's editor and focuses it. Inserted, never submitted — add your question and press enter yourself. |

Either command starts Pi if it is not running, so there is no separate command
to open it. If a pane is already in the sidebar, selecting its tab starts it too. Close the pane the way you close any Obsidian pane, or quit Pi.

One session, in the right sidebar, running in your vault. There is no shell
command and no per-note command: Pi reads any note it needs with its own tools.

Rebind the key in Settings → Hotkeys if it clashes with something.

## Configuration

Settings → Community plugins → Pi:

- **Extra PATH directories** — where to look for `pi` and `node`. Obsidian
  launched from the Finder inherits a bare `PATH` that usually reaches neither,
  so this is normally required. One per line or colon-separated; absolute paths
  only. To find yours, run `command -v node` and `npm prefix -g` in a terminal —
  the answers are the directory holding node, and npm's prefix with `/bin`.
  A pane that cannot find `pi` says so and names this setting.
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
launched from the Finder passes no `EDITOR` or `VISUAL`. Change `EDITOR_COMMAND` in
`src/launch.ts` to use something else.

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

Pi keeps a tab in the right sidebar, the way Obsidian's own panes do, so there
is always somewhere to click. Nothing runs until the pane is asked for: select
its tab, click in it, or use either command. Until then the pane shows a short
tip saying so. Opening a vault does not launch an agent.

Quitting Pi empties the pane and leaves the tab in place; selecting it again
starts a fresh session. If Pi exits with an error the output stays on screen,
showing the exit code, and a keystroke restarts it.

## Build from source

```bash
npm install                      # also makes node-pty's spawn-helpers executable
npm run build                    # typechecks, then writes main.js and styles.css
npm run install-to -- "/path/to/Vault"
```

`install-to` symlinks this folder into the vault's `.obsidian/plugins/obsidian-pi-plugin`.
A symlink rather than a copy matters: `node_modules/node-pty` must be present in
the installed folder, because the native pseudo-terminal addon is deliberately
not bundled into `main.js` and is loaded from there at runtime.

Then, in Obsidian: enable community plugins, and enable **Pi**.

### If the native addon fails to load

The pane will show `[error] Could not load node-pty: …` rather than the plugin
failing to load. From an unzipped release, try clearing the quarantine flag
first, as in the install steps above. Otherwise the remedy is to rebuild that
one module against Obsidian's Electron version:

```bash
npx @electron/rebuild -v 43.3.0 -f -o node-pty
```

Do not introduce a binary download system unless this proves insufficient.

## Releasing

A pushed version tag publishes a release. `.github/workflows/release.yml` runs
the lint, the tests, and the build on a macOS runner, then packages the archive
and attaches it to a new GitHub release.

```bash
# bump the version in both manifest.json and package.json first
git tag 0.0.2 && git push origin 0.0.2
```

The tag has to match `manifest.json`, and `manifest.json` has to match
`package.json`; the packaging script fails the run otherwise. Tags may be
written `0.0.2` or `v0.0.2`.

To see what a release would contain without tagging anything:

```bash
npm run build && npm run package   # writes dist/, and checks the archive
```

`scripts/package-macos.mjs` copies the three plugin files and the parts of
node-pty a running pane touches — its `lib/` and the two macOS prebuilds,
leaving behind the addon sources and 58 MB of Windows binaries — makes both
`spawn-helper` binaries executable, and zips the folder with `ditto`, which
keeps those modes and the prebuilt binaries' adhoc signatures. It then reads
the modes back out of the finished zip, because a lost executable bit is the
one mistake that would otherwise surface only when a session refuses to start.

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
11. Restart Obsidian: the tab is in the sidebar and empty, with no `pi` process
    running. Select it: Pi starts.
12. Quit Pi with `Ctrl+D`: the pane empties and the tab stays. Click it: a fresh
    session starts.
13. Unzip a release archive into a vault on a machine with no checkout of this
    repository, and start a session. This is the one check the packaging script
    cannot make for itself: it verifies the archive's contents and modes, not
    that Obsidian's Electron can load the addon out of it.

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
.pi-terminal.wterm { --term-font-size: 15px; }
```

## Where things are

| File | What it holds |
| --- | --- |
| `src/launch.ts` | Everything about how Pi is started: the command, its arguments, the environment, and the machine-specific directories put on `PATH`. Pure — no Obsidian, no terminal. |
| `src/settings.ts` | The two models on offer and the stored settings. |
| `src/paste.ts` | Turning a note selection into something safe to paste. |
| `src/terminal-queries.ts` | Answering and hiding the terminal queries the emulator does not handle. |
| `src/terminal-view.ts` | The pane: the terminal, the process, and their lifecycle. |
| `src/main.ts` | The plugin: commands, the sidebar tab, and the settings screen. |
| `src/plugin.css` | Sizing and the colour palette. |

The first four are pure and carry the tests. The last three need a running
Obsidian and are checked by hand.

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
