# Pi fullscreen TUI in the Obsidian pane

## Question

How should the plugin support Pi's experimental fullscreen TUI, and why does it currently render at less than the pane's full height after fullscreen mode is enabled?

## Conclusion

There are two separate gaps:

1. **The plugin does not expose fullscreen mode.** Pi defaults to `regular`; fullscreen currently works only if the user changes Pi's private `settings.json` through `/settings` (or edits it by hand). The live private config in this checkout contains `"tuiMode": "fullscreen"`, confirming that fullscreen is already enabled for the reported case.
2. **The likely cause of the short fullscreen viewport is initialization while the Obsidian leaf is hidden.** `@wterm/dom` 0.5.0 abandons auto-resize setup if it cannot measure a character during `init()`. A restored sidebar tab can be hidden when `TerminalView.onOpen()` initializes wterm, so measurement returns zero, no `ResizeObserver` is installed, and the terminal remains at wterm's default **80×24**. Regular mode conceals this because it uses terminal scrollback; Pi fullscreen makes the stale 24-row PTY immediately visible.

The recommended plugin fix is to initialize wterm only after the leaf is visible and has a non-zero layout box, then spawn Pi using that measured terminal size. The plugin should also pass `--tui-mode fullscreen` unconditionally so fullscreen is the default behavior without adding an option.

## What Pi fullscreen mode requires

Pi supports two interactive renderers:

- `regular` (default): renders on the terminal's main screen and relies on terminal-owned scrollback;
- experimental `fullscreen`: enters the alternate screen and owns a fixed-height viewport, including transcript scrolling and mouse handling.

Pi exposes this through the `--tui-mode regular|fullscreen` CLI flag and the `tuiMode` setting. A CLI flag overrides the saved setting. [Pi README, CLI Reference](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md#cli-reference); [Pi settings documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md#ui--display).

The implementation creates `TuiAltScreen` for fullscreen mode (`dist/modes/interactive/tui-renderer.js`). That renderer reads `terminal.rows` on every frame and renders exactly that many rows (`pi-tui/dist/tui-alt-screen.js:1426-1488`). `ProcessTerminal.rows` is `process.stdout.rows`, falling back to `LINES` and then 24 (`pi-tui/dist/terminal.js:400-405`). Therefore Pi is not choosing a partial-height layout: if it paints only 24 rows, the PTY is reporting only 24 rows.

Fullscreen's terminal requirements are otherwise covered by wterm 0.5.0:

- alternate-screen buffers;
- SGR mouse reports;
- synchronized output (`CSI ?2026`);
- resize callbacks.

These are documented in the [official `@wterm/dom` README](https://github.com/vercel-labs/wterm/tree/main/packages/%40wterm/dom#readme) and implemented in the installed dependency.

## Current plugin behavior

### Fullscreen is not a plugin option

`src/launch.ts:99-127` constructs Pi's arguments but does not pass `--tui-mode`. `src/settings.ts` also has no `tuiMode` field. Pi therefore starts from its own private saved setting, or from the upstream `regular` default on a fresh install.

The plugin-private `pi-agent/settings.json` in this working copy currently contains:

```json
{
  "tuiMode": "fullscreen"
}
```

That file is ignored by Git, so this choice is local runtime state and will not be reproduced by a fresh install.

### The CSS already offers the full pane

`src/plugin.css:3-16` makes `.view-content` a flex container and `.pi-terminal` a growing item with `width: 100%`, `height: 100%`, and `min-height: 0`. No fixed 24-row height is imposed by plugin CSS.

`src/terminal-view.ts:100-104` creates wterm with `autoResize: true` and forwards every resize to `node-pty`. Pi is spawned using `term.cols` and `term.rows` at `src/terminal-view.ts:441-449`.

That pipeline is correct **if wterm successfully installs its resize observer**.

## Likely failure: hidden initialization permanently disables auto-resize

The installed `@wterm/dom` 0.5.0 does the following:

1. Starts with `cols = 80`, `rows = 24` (`node_modules/@wterm/dom/dist/wterm.js:34-36`).
2. During `init()`, calls `_setupResizeObserver()` (`:89-130`).
3. `_setupResizeObserver()` first calls `_measureCharSize()` (`:496-500`).
4. `_measureCharSize()` returns `null` when its probe has zero width or height (`:478-494`).
5. If that happens, `_setupResizeObserver()` returns **before constructing or attaching a `ResizeObserver`** (`:496-516`). There is no later retry.

The same logic remains on wterm's current `main`: [`packages/@wterm/dom/src/wterm.ts`](https://github.com/vercel-labs/wterm/blob/main/packages/%40wterm/dom/src/wterm.ts).

This interacts badly with the plugin lifecycle:

- `TerminalView.onOpen()` always initializes wterm immediately (`src/terminal-view.ts:90-104`).
- The design deliberately permits restored sidebar panes to exist without being active and delays starting Pi until a later `active-leaf-change` (`src/terminal-view.ts:121-134`; `docs/spec.md`, “Terminal view”).
- A hidden or not-yet-laid-out leaf has zero-sized font probes. In that state wterm silently retains 80×24 and never begins observing later visibility or pane resizes.
- Pi is then spawned with those stale values (`src/terminal-view.ts:443-447`). Fullscreen uses all 24 reported rows and cannot know that the browser pane could hold more.

This explains why ordinary full-screen applications may work in some openings while a restored/inactive pane fails: the outcome depends on whether the host was measurable at the instant asynchronous wterm initialization reached its probe.

### How to confirm in Obsidian DevTools

On an affected pane, evaluate the following against the active Pi view/host:

- host `getBoundingClientRect().height` — expected to be the full pane height;
- the running `TerminalView`'s wterm `rows` — expected to remain 24;
- resize the pane vertically — on the bug path, `rows` remains unchanged and the PTY receives no resize.

As a simpler black-box check, run `stty size` in an embedded shell or inspect `process.stdout.rows` in Pi. If the pane can visibly hold substantially more lines but the process reports 24, this diagnosis is confirmed.

## Recommended design

### 1. Make terminal initialization visibility-safe

Do not call `new WTerm(...).init()` while the leaf may be hidden. Split the current `onOpen()` path:

- `onOpen()` creates the host and installs Obsidian lifecycle/input listeners.
- A single idempotent `ensureTerminal()` promise waits until the host is connected and its layout box has non-zero width and height (normally one animation frame after the leaf is revealed).
- Only then construct and initialize wterm, write the idle tip, and start Pi.
- Activation, click-to-retry, focus, and queued-paste paths all await/reuse that same promise.
- Preserve the existing disposal guards so a completed initialization cannot attach after the view closes.

This uses wterm's public API and avoids depending on private `_measureCharSize()` or `_setupResizeObserver()` methods.

A smaller but more brittle workaround would be to measure `.term-row` DOM internals and call `term.resize()` manually after reveal. Avoid it: those classes and wterm's private cell metrics are not part of the documented API, and it would duplicate the dependency's fit calculation.

### 2. Enable Pi fullscreen unconditionally

Add the following directly to the launch arguments in `src/launch.ts`:

```text
--tui-mode fullscreen
```

Do not add a plugin setting. This is preferable to creating or editing `pi-agent/settings.json`:

- the launch remains fully described by `resolveLaunch`, consistent with the rest of this plugin;
- no configuration file needs to be seeded;
- behavior is deterministic on a fresh install;
- the CLI flag overrides stale private Pi settings that might otherwise select regular mode.

### 3. Keep the existing alternate-screen adaptation

`TerminalView.syncAltScreen()` and the `.pi-alt-screen` CSS should remain. Pi fullscreen itself enters the alternate screen, so the existing logic hides stale main-screen scrollback and prevents the DOM host from scrolling (`src/terminal-view.ts:277-322`, `src/plugin.css:18-30`). Pi's fullscreen renderer then owns transcript scrolling and mouse input, as intended.

## Tests and verification

### Automated

- `src/launch.test.ts`: `--tui-mode fullscreen` is always present.
- Extract the “is host measurable?” predicate if useful and unit-test zero/non-zero boxes; the actual visibility/`ResizeObserver` behavior still needs an Electron integration or manual test.

### Manual regression matrix

1. Freshly command-opened pane: fullscreen editor/footer reaches the bottom immediately.
2. Restored inactive sidebar tab: activate it after layout; its process reports the actual row count, not 24.
3. Open Pi while another right-sidebar tab is active, then select Pi.
4. Resize the sidebar vertically and horizontally; verify `process.stdout.rows/columns` change and Pi redraws.
5. Drag the pane into the main editor area; verify the session remains full height.
6. Start Pi fullscreen, then open and close `vi` via Ctrl+G; verify nested alternate-screen transitions do not reveal old scrollback.
7. Switch back to regular mode and verify terminal-owned scrollback still works.
8. Close the pane during deferred initialization and confirm no terminal or PTY is created afterward.

## Upstream follow-up

This is also a wterm defect: `autoResize: true` should not permanently disable itself merely because its first font measurement occurs while hidden. An upstream fix should attach the `ResizeObserver` regardless and defer/retry cell measurement when a later callback has non-zero geometry. The plugin should still avoid initializing a hidden terminal because it also needs correct `term.cols/rows` before the initial PTY spawn.
