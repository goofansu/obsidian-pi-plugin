# obsidian-pi-plugin

A Pi-powered reading companion in the Obsidian sidebar.

## Commands

| Command | Default key | What it does |
| --- | --- | --- |
| **Pi: Toggle focus** | `Cmd+Shift+/` | Moves the keyboard to Pi, or back to your note if you are already in Pi |
| **Pi: Add the note you are reading to thread** | `Cmd+Shift+>` | Describes the note you are in and puts that description into Pi's editor. Inserted, never submitted — add your question and press enter yourself. |

## Requirements

Requires macOS, Obsidian 1.13.7 or newer, and pi.

## Install

macOS only, Obsidian 1.13.7 or newer. Built and used on Apple Silicon; the
Intel binaries are shipped but untested.

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
