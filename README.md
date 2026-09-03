# Pi for Obsidian

A terminal in Obsidian's right sidebar, and a one-command way to hand the note
you are reading to the Pi coding agent.

macOS only, Obsidian 1.13.7 or newer. Built and used on Apple Silicon; the
Intel binaries are shipped but untested.

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
5. In Settings → Community plugins → Pi, fill in **Extra PATH directories**,
   so the plugin can find `pi` and `node`, and the **DeepSeek API key**. The
   first is normally required, the second always is.

Obsidian's own community-plugin installer could not deliver this plugin: it
fetches `main.js`, `manifest.json`, and `styles.css` and nothing else, and this
plugin also needs `node_modules/node-pty` in its folder. Hence the zip.

Requires macOS, Obsidian 1.13.7 or newer, and `pi` on disk: Pi itself is not in
the archive, and the plugin runs the `pi` on your `PATH`.

## Commands

| Command | Default key | What it does |
| --- | --- | --- |
| **Pi: Toggle focus** | `Cmd+Shift+/` | Moves the keyboard to Pi, or back to your note if you are already in Pi |
| **Pi: Add selection to thread** | `Cmd+Shift+>` | Puts the selected note text into Pi's editor and focuses it. Inserted, never submitted — add your question and press enter yourself. |

Either command starts Pi if it is not running, so there is no separate command
to open it. If a pane is already in the sidebar, selecting its tab starts it too. Close the pane the way you close any Obsidian pane, or quit Pi.

One session, in the right sidebar, running in your vault. There is no shell
command and no per-note command: Pi reads any note it needs with its own tools.

Pi keeps a tab in the right sidebar, the way Obsidian's own panes do, so there
is always somewhere to click. Nothing runs until the pane is asked for: select
its tab, click in it, or use either command. Until then the pane shows a short
tip saying so. Opening a vault does not launch an agent.

Quitting Pi empties the pane and leaves the tab in place; selecting it again
starts a fresh session. If Pi exits with an error the output stays on screen,
showing the exit code, and a keystroke restarts it.

The sidebar expands if it is collapsed. Panes can be dragged into the main
editor area without interrupting the session. Closing a pane kills its process.

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
