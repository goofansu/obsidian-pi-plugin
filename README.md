# wterm Pi

A terminal in Obsidian's right sidebar, and a one-command way to hand the note
you are reading to the Pi coding agent.

Personal, single-machine plugin: Apple Silicon macOS, Obsidian 1.13.7. Not
distributed. The spec lives in `.scratch/obsidian-wterm-spec.md`.

## Commands

| Command | What it runs |
| --- | --- |
| **Open terminal** | `fish -l` in the vault root |
| **Open Pi for current note** | Pi in the vault root, with the active note as an `@file` argument |

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
