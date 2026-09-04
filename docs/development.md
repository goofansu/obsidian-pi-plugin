# Development

Everything about this plugin that an installer does not need. The user-facing
half — what it is, how to install it, the commands and the settings — is in the
[README](../README.md).

## Build from source

```bash
npm install                      # also makes node-pty's spawn-helpers executable
npm run build                    # typechecks, then writes main.js and styles.css
npm run install-to -- "/path/to/Vault"
```

`install-to` symlinks this folder into the vault's
`.obsidian/plugins/obsidian-pi-plugin`, named after the id in `manifest.json`.
A symlink rather than a copy matters: `node_modules/node-pty` must be present in
the installed folder, because the native pseudo-terminal addon is deliberately
not bundled into `main.js` and is loaded from there at runtime.

Then, in Obsidian: enable community plugins, and enable **Pi**.

### If the native addon fails to load

The pane will show `[error] Could not load node-pty: …` rather than the plugin
failing to load. From an unzipped release, try clearing the quarantine flag
first, as in the [install steps](../README.md#install). Otherwise the remedy is
to rebuild that one module against Obsidian's Electron version:

```bash
npx @electron/rebuild -v 43.3.0 -f -o node-pty
```

Do not introduce a binary download system unless this proves insufficient.

## Everyday commands

```bash
npm test        # unit tests for the pure modules
npm run typecheck
npm run dev     # esbuild watch
```

## Where things are

| File | What it holds |
| --- | --- |
| `src/launch.ts` | Everything about how Pi is started: the command, its arguments, the environment, and the machine-specific directories put on `PATH`. Pure — no Obsidian, no terminal. |
| `src/settings.ts` | The two models on offer and the stored settings. |
| `src/paste.ts` | Turning text into something safe to paste into a session. |
| `src/note-context.ts` | What Pi is told about the note in view, and what it is not. Pure — a plain snapshot in, the text the user hands to Pi out. |
| `src/vault-context.ts` | The two facts every session starts with: which vault, and that its root is the working directory. Pure. |
| `src/active-note.ts` | Reading Obsidian's metadata cache for that snapshot. The only module that touches the cache, and it decides nothing. |
| `src/terminal-queries.ts` | Answering and hiding the terminal queries the emulator does not handle. |
| `src/terminal-view.ts` | The pane: the terminal, the process, and their lifecycle. |
| `src/main.ts` | The plugin: commands, the sidebar tab, and the settings screen. |
| `src/plugin.css` | Sizing and the colour palette. |

The pure ones — the launch resolver, the settings, the paste builder, the
terminal queries, and the note composer — carry the tests. The rest need a
running Obsidian and are checked by hand.

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

## What every session starts with

Pi is told which vault it is in, that its working directory is that vault's
root, and that a note described to it carries no text so the path should be
opened and read. All three hold for the whole session, so they are paid once at
startup rather than on every note the user sends, and there is nothing in them
to guess wrong.

One side effect, measured against a real Pi: because Pi looks for an
`APPEND_SYSTEM.md` of its own only when the command line gives it no appended
prompt, passing this stops that file being found — both the vault's
`.pi/APPEND_SYSTEM.md` and the one in `pi-agent/`. A vault-level `AGENTS.md`
still loads, so vault-wide instructions belong there.

## The note in view

`Cmd+Shift+>` hands Pi a description of the note the user is reading: its path,
its length, the cursor's line with the headings above it, any selected lines,
its properties, aliases and tags, its outline, each of its links with the file
that link resolves to, and the notes that link back to it. Never the note's text
— Pi runs in the vault and reads the file itself.

It travels as a bracketed paste into Pi's editor, unsubmitted, so the user adds
their question to it and presses enter themselves. Nothing about a note is ever
passed on the command line: a message or an `@file` argument is submitted the
moment Pi starts, which would spend a turn answering a question nobody asked.

The description is written in the user's own voice, since that is where it
lands, and it ends on its last fact. It names no vault, no working directory,
and no instruction to read the file: the session was told all three at startup,
so a paste repeating them would spend context restating what Pi already knows.
It also makes no claim about being a snapshot — a pasted message is already read
as true when sent.

Everything but the resolved link paths and the backlinks is on the note's own
face. Those two are the reason this exists: `[[Some note]]` names a file that
only Obsidian's resolution rules can find, and backlinks are not visible from
the note at all. Both come from a cache Obsidian already holds, so the key press
reads no files.

An earlier version attached this to a starting session too, behind a setting. It
was dropped because Obsidian's active note is really the last file the user
touched, so a session could quietly start on a note they had left — a key press
says which moment they meant. What stayed behind in the system prompt is the
part that could not be wrong: the vault.

The description is captured when the process is spawned, so a pane that has sat
in the sidebar all day starts on the note being read now. It is not updated
afterwards, and says so to Pi. To point a session at a different note, quit it
and start again.

The rules about what goes in, and the limits that keep an index note with a
thousand backlinks from filling the context, are all in `src/note-context.ts`
next to their tests. `src/active-note.ts` only copies Obsidian's caches into the
snapshot that module formats.

The setting turns it off for sessions started from then on. It defaults to on.

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

### What goes in the archive

The plugin folder as Obsidian will use it: `main.js`, `manifest.json`,
`styles.css`, and `node_modules/node-pty`. Why the last one has to be there,
and why Obsidian's own plugin installer therefore cannot deliver this plugin,
is in the [install steps](../README.md#install).

`scripts/package-macos.mjs` copies the three plugin files and the parts of
node-pty a running pane touches — its `lib/` and the two macOS prebuilds,
leaving behind the addon sources and 58 MB of Windows binaries — makes both
`spawn-helper` binaries executable, and zips the folder with `ditto`, which
keeps those modes and the prebuilt binaries' adhoc signatures. It then reads
the modes back out of the finished zip, because a lost executable bit is the
one mistake that would otherwise surface only when a session refuses to start.

### What the release page says

The body is what changed, and nothing else: the commit subjects since the
previous tag, with a link comparing the two. Installing is the README's job,
and the release page does not repeat it.

The commits are read with `git log` rather than left to GitHub's own note
generator, which lists merged pull requests: this repository is committed to
directly, so the generator has nothing to say. The first release, having no
previous tag to compare against, says so instead of listing every commit in the
repository's history.

## Verification checklist

Automated tests cover the pure modules only. Everything below is checked by
hand, because the rest needs a real Obsidian and Electron runtime.

1. With the right sidebar collapsed, run **Open terminal**: the sidebar expands
   and the pane has focus.
2. The prompt appears immediately, with no "could not read response to Primary
   Device Attribute query" warning.
3. Plain output, `vim`, and colour render correctly.
4. Drag the sidebar wider: the terminal reflows and `vim` redraws at the new size.
5. From a note, press `Cmd+Shift+/`: focus lands in Pi. Press it again: focus
   returns to the note. Press it with Pi closed: Pi opens and takes focus.
6. From a note, press `Cmd+Shift+>`: a description of that note appears in Pi's
   editor, unsent, with the cursor after it. Press it from a pane holding no
   file at all: a notice says there is no note in view, and nothing is pasted.
7. The shell pane and the Pi pane coexist as separate sidebar tabs.
8. Ask Pi to read a second note in the vault.
9. In a note with frontmatter, headings, links, and at least one backlink, put
   the cursor inside a section and press `Cmd+Shift+>`, then press enter and ask
   which note you are in, which section, and what links to it: the answers
   should be that note, that section, and those notes, without Pi reading a file
   to find the backlinks.
10. Switch to another note and press the key again: the new description should
    name the new note, not the old one.
11. Start a fresh session and ask which note you are in without pressing the
    key: Pi should say it was not told.
12. Press `Cmd+Shift+>` with the keyboard already inside Pi: the description is
    still of the note you were last reading, not of nothing.
13. Press `Cmd+Shift+>` with no session running: Pi starts and the description
    arrives once its interface has settled, rather than being lost.
14. Drag a live pane into the main editor area: the session continues.
15. Close a pane mid-response: `ps` shows no orphaned process.
16. Restart Obsidian: the tab is in the sidebar and empty, with no `pi` process
    running. Select it: Pi starts.
17. Quit Pi with `Ctrl+D`: the pane empties and the tab stays. Click it: a fresh
    session starts.
18. Give the pane the keyboard three ways and type immediately each time,
    without clicking again: select its tab from a note, click the idle pane to
    start a session, and press the toggle-focus key. The first two are the ones
    that broke before — Obsidian ends activating a pane by asking the view for
    the keyboard, and a press that starts a session repaints the screen out
    from under its own click.
19. Unzip a release archive into a vault on a machine with no checkout of this
    repository, and start a session. This is the one check the packaging script
    cannot make for itself: it verifies the archive's contents and modes, not
    that Obsidian's Electron can load the addon out of it.

## Note on trust

Pi launched here runs with your full user permissions. It is not sandboxed to the
vault. The plugin's contribution is narrow: absolute executable paths, arguments
passed as an array and never interpolated into a shell string, the vault root as
working directory, processes killed with their pane, and nothing auto-submitted
on your behalf.
