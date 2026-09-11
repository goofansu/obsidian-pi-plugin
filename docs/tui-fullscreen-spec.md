# Full-height Pi TUI

## Problem Statement

Pi can run a fullscreen TUI that keeps its transcript, editor, and footer arranged across the terminal viewport. In the Obsidian pane, fullscreen is neither selected deterministically nor reliably given the pane's real dimensions. A terminal initialized while its sidebar leaf is hidden can remain at its 80-by-24 fallback because the emulator does not install auto-resize after an initial zero-size measurement. The resulting fullscreen interface occupies only part of a taller pane.

## Solution

Every Pi session launched by the plugin uses Pi's fullscreen TUI with no setting or opt-out. The terminal is initialized only when its host is visible and measurable, and Pi is spawned only after that initialization has established the terminal's real row and column count. Restored inactive panes continue to start no process. When activated, they initialize and start normally at the correct size.

## User Stories

1. As a note author, I want Pi to use its fullscreen TUI automatically, so that the pane has one consistent interface without configuration.
2. As a note author, I want the editor and footer at the bottom of the pane, so that the TUI uses the pane's full height.
3. As a note author, I want a fresh install to use fullscreen, so that behavior does not depend on private saved Pi settings.
4. As a note author, I want a restored inactive Pi tab to start no process, so that reopening Obsidian remains passive.
5. As a note author, I want activating a restored tab to size Pi from the now-visible pane, so that it does not remain at the terminal's 24-row fallback.
6. As a note author, I want command-opened and restored panes to behave identically once visible, so that lifecycle history does not affect layout.
7. As a note author, I want pane resizing and dragging into the main editor area to resize the running TUI, so that it continues to fill its host.
8. As a note author, I want a note paste requested while Pi is unopened or initializing to arrive after startup, so that visibility-safe initialization loses no input.
9. As a note author, I want closing the pane during initialization to cancel startup, so that no terminal or agent process outlives its view.
10. As a note author, I want external full-screen programs such as `vi` to continue working inside Pi, so that Pi's fullscreen mode does not regress alternate-screen handling.

## Implementation Decisions

- Fullscreen is launch policy, not a preference. Every launch passes Pi's fullscreen TUI CLI option. No plugin setting is introduced and no private Pi configuration file is seeded or edited.
- Terminal creation becomes idempotent asynchronous initialization shared by activation, click, focus, and pending-paste entry points. Concurrent requests reuse one in-flight initialization rather than constructing multiple emulators.
- Initialization waits for a connected host with positive width and height. It must not wait indefinitely inside the Obsidian `onOpen` lifecycle; a hidden restored leaf remains cheap and uninitialized until activation makes it measurable.
- Pi is spawned only after terminal initialization completes, using the terminal's measured columns and rows. It must never be spawned from the emulator's unmeasured 80-by-24 defaults.
- A request made before measurement remains pending and resumes after the host becomes measurable. Existing pending bracketed-paste behavior is preserved.
- Disposal invalidates pending initialization. An asynchronous continuation must check that the view is still live before attaching a terminal or spawning Pi.
- Existing process input/output, resize propagation, appearance-query handling, focus repair, idle/error states, and alternate-screen scroll preservation remain behaviorally unchanged.
- The emulator is treated through its public API. The plugin does not invoke private sizing methods or calculate cell geometry from private DOM classes.

## Testing Decisions

- Launch resolution remains the highest automated seam for the policy change. A test asserts that every spawn specification contains the fullscreen TUI option and that no user setting participates in it.
- The Obsidian view and browser measurement lifecycle remain manual-test territory, consistent with the repository's existing testing boundary. Tests should not assert private emulator fields or DOM implementation details.
- Required repository checks are the unit suite, typecheck, lint, and production build.
- Manual verification covers a freshly opened pane, a restored inactive pane, vertical and horizontal resize, dragging into the main editor area, a paste that triggers startup, disposal during initialization, and opening and closing `vi` inside Pi fullscreen.

## Out of Scope

- A regular/fullscreen mode setting or opt-out.
- Writing `tuiMode` into Pi's private settings file.
- Forking or patching `@wterm/dom`.
- Replacing the terminal emulator.
- Automated Electron or Obsidian integration infrastructure.
- Changes to Pi's fullscreen renderer, scrolling model, mouse behavior, or exit-output preferences.

## Further Notes

The emulator's current auto-resize setup returns before installing its `ResizeObserver` when its first character measurement is zero. Avoiding hidden initialization is therefore required even though the plugin's CSS already gives the host the full pane. An upstream emulator fix would still be useful, but this plugin must know the initial terminal dimensions before it spawns the PTY, so visibility-safe startup remains the correct local boundary.

Supporting research and primary-source references are in `docs/tui-fullscreen-research.md`.
