# Spec: Pi for Obsidian — the agent in a sidebar pane

## Problem Statement

I keep notes in an Obsidian vault, and I keep a coding agent (Pi) in a terminal.
Today those are two separate applications. When I am reading a note and want the
agent to work with it, I have to leave Obsidian, find a terminal, navigate to the
vault directory, work out the note's path, and type it in by hand. The agent has
no idea which note I was looking at, so I have to describe it. The context switch
is the whole cost: by the time I have set the terminal up, the thought that
prompted it has usually gone.

I also want an ordinary shell in the same place — for `git`, `rg`, and the
occasional one-off command against the vault — without leaving the window I am
already reading in.

This is for one person on one machine (Apple Silicon macOS, Obsidian 1.13.7 on
Electron 43.3.0). It will not be distributed.

## Solution

A desktop-only Obsidian plugin that puts a real terminal in Obsidian's right
sidebar, beside the note I am reading rather than on top of it.

Two commands, named for what they do rather than for what they run:

- **Show or hide Pi** toggles the pane. One session, one place.
- **Jump between your note and Pi**, on `Cmd+Shift+/` by default, moves the
  keyboard where you want it: to Pi if you are in a note, back to the note if
  you are in Pi. It opens Pi if it is not open yet, so one key covers every
  case.

There is no per-note command. Pi runs in the vault and reads any note it needs
with its own tools, so handing it one file at launch bought little and meant a
second command to remember.
There is no shell command. This pane exists to run Pi, and a second way to get
a shell would only be a second thing to maintain.

Pi runs self-contained. It uses a configuration directory belonging to this
plugin, not the user's own installation, so the extensions, skills, credentials,
sessions, and trust decisions of the system-wide Pi have no effect here and are
never modified. The agent is configured from Obsidian's settings: a DeepSeek API
key, and a choice between two models.

Both commands expand the sidebar if it is collapsed and focus the new pane, so
the terminal is ready to type into. Panes stack as sidebar tabs, so a shell and
an agent can be open at once, and either can be dragged out into the main editor
area if it needs the full window.

The second command is the point of the whole plugin. Pi starts already knowing
which note I was reading, and because it is running inside the vault it can read,
search, and edit every other note using its ordinary tools. Persistent vault-wide
instructions live in a vault-level `AGENTS.md`, which Pi discovers on its own.

The terminal is a full terminal emulator, not a log pane: it renders colour,
handles interactive programs such as `vim`, and resizes with the Obsidian pane.
Closing the pane kills the process.

## User Stories

### Opening Pi

1. As a vault owner, I want an **Open terminal** command in the Obsidian command palette, so that I can start Pi without leaving the application.
2. As a vault owner, I want Pi to start in my vault's root directory, so that it can read and search my notes with its ordinary tools.
3. As a vault owner, I want Pi located by an absolute path, so that it starts reliably even though Obsidian was launched from the graphical desktop rather than from a terminal.
4. As a vault owner, I want the pane titled "Pi", so that I can tell it apart from my notes at a glance.
5. As a vault owner, I want no shell command at all, so that there is one way in and nothing extra to maintain.

### Reaching Pi

7. As a note author, I want one key that takes me to Pi and the same key that brings me back to my note, so that moving between writing and asking costs nothing.
8. As a note author, I want either command to start Pi when it is not running, so that I never need a separate command to open it.
9. As a note author, I want the key bound by default, so that it works without my configuring anything.
10. As a note author, I want to be able to rebind it in Obsidian's hotkey settings, so that it can fit around my other shortcuts.
11b. As a note author, I want quitting Pi to close its pane, so that finishing a session takes one action rather than two.
11c. As a note author, I want a pane whose process failed to stay open with its exit code, so that I can see what went wrong rather than watching the evidence disappear.
11d. As a note author, I want Pi's pane not to come back when I reopen my vault, so that starting Obsidian shows my notes and nothing else.
11e. As a note author, I want no agent process started during that restore, so that a pane I forgot about costs nothing at all.
12. As a note author, I want commands named for what they do rather than for the program they run, so that I can find them in the palette without knowing the plumbing.
13. As a note author, I want one Pi session rather than a new one per invocation, so that my conversation is where I left it.
14. As a note author, I want to select text in a note and send it to Pi with a key, so that I can ask about a passage without retyping or describing it.
15. As a note author, I want the selection inserted into Pi's editor rather than submitted, so that I can add my question before anything is sent.
16. As a note author, I want a multi-line selection to arrive as one block, so that a passage is not chopped into separate messages.
17. As a note author, I want the send key to work while the keyboard is already in Pi, so that I do not have to click back into the note first.
18. As a note author, I want Pi opened and focused by the send, so that the passage and my cursor end up in the same place.
19. As a note author, I want a selection sent while Pi is still starting to arrive anyway, so that the key works the very first time I press it.
20. As a note author, I want to be told when nothing is selected, so that a silent no-op does not look like a broken key.
21. As a note author, I want Pi's external editor to be `vi`, so that Ctrl+G opens the editor I know rather than `nano`.
22. As a note author, I want no startup banner, so that a small pane shows my conversation rather than a version number I already know.
23. As a note author, I want to be able to turn the banner back on from inside Pi and have that stick, so that the plugin sets a default rather than enforcing a policy.

### Using the terminal

17. As a terminal user, I want my keystrokes delivered to the running process, so that the pane behaves like a terminal rather than a read-only transcript.
18. As a terminal user, I want the process's output rendered with colour and cursor positioning, so that interactive programs such as `vim`, `top`, and Pi's own interface display correctly.
19. As a terminal user, I want the terminal to resize when I resize the Obsidian pane, and the running process to be told the new size, so that full-screen programs redraw at the right dimensions.
20. As a terminal user, I want the terminal to fill its pane and follow my Obsidian theme's background, so that it does not look pasted in.
21. As a terminal user, I want no stray local echo before the process has started, so that early keystrokes are not duplicated or lost.
22. As a terminal user, I want to see a clear notice in the pane when the process exits, including its exit code, so that I can tell the difference between a finished command and a hung one.

### Where the terminal lives

23. As a vault owner, I want terminal panes to open in the right sidebar, so that they sit alongside my notes instead of displacing the note I am reading.
24. As a vault owner, I want the right sidebar to expand and the new pane to take focus when I run either command, so that I can start typing immediately even if the sidebar was collapsed.
25. As a vault owner, I want a shell pane and an agent pane to coexist as separate tabs in the sidebar, so that I can switch between them without closing either.
26. As a vault owner, I want the terminal to reflow when I drag the sidebar wider or narrower, so that I can give an agent session more room when I need to read its output.
27. As a vault owner, I want to be able to drag a terminal pane out of the sidebar into the main editor area, so that a session I want to watch closely can take the full window without being restarted.

### Lifecycle

28. As a vault owner, I want each command invocation to open its own pane with its own process, so that I can have a shell and an agent running at the same time.
29. As a vault owner, I want closing a pane to kill its process, so that no orphaned shell or agent keeps running in the background.
30. As a vault owner, I want closing a pane during an active agent response to kill that process cleanly, so that a long-running agent turn cannot outlive its pane.
31. As a vault owner, I want disabling or reloading the plugin to terminate every process it started, so that reloading during development does not accumulate stray processes.
32. As a vault owner, I want a pane's launch details stored as plain serializable state on the workspace leaf, so that Obsidian's own workspace handling does not encounter a pane whose configuration lives only in a closure.
33. As a vault owner, I want a restored pane whose stored state is missing or malformed to fall back to a plain shell rather than crash, so that a stale workspace layout cannot break plugin loading.
34. As a vault owner, I want a terminal pane that Obsidian restored at startup to sit idle until I activate it, so that opening Obsidian never silently launches a shell or an agent I did not ask for.
35. As a vault owner, I want an idle restored pane to say plainly that it is waiting and how to start it, so that an empty black rectangle is never ambiguous.

### Configuring the agent

36. As a vault owner, I want a settings tab in Obsidian asking for a DeepSeek API key, so that I can configure the agent without editing files.
37. As a vault owner, I want the key field masked as a password, so that it is not readable over my shoulder.
38. As a vault owner, I want to choose between the flash and pro models, so that I can trade speed against capability.
39. As a vault owner, I want a model change to apply to sessions I start from then on, so that the change is predictable rather than retroactive.
40. As a vault owner, I want both models offered for in-session cycling, so that I can switch mid-conversation without restarting.
41. As a vault owner, I want a pane opened with no key configured to say so plainly and tell me where to set it, so that I am not left looking at a silent failure.
42. As a vault owner, I want the key passed to Pi as an environment variable rather than a command-line argument, so that it cannot be read from the process list.
43. As a vault owner, I want settings that are missing, corrupt, or from an older version to fall back to defaults, so that bad stored data cannot stop the plugin loading.

### Keeping the agent self-contained

44. As a vault owner, I want this plugin's Pi to use its own configuration directory, so that it is unaffected by my system-wide Pi setup.
45. As a vault owner, I want my existing Pi installation left completely untouched, so that using this plugin cannot disturb work I do in a terminal.
46. As a vault owner, I want the plugin's Pi to ignore the extensions, skills, credentials, sessions, and trust decisions of my system installation, so that its behaviour here is predictable.
47. As a vault owner, I want every `PI_*` variable in my environment dropped before Pi starts, so that a system-wide key, model, or directory cannot leak in.
48. As a vault owner, I want a DeepSeek key that happens to be in my environment ignored too, so that the plugin either uses the key I configured or fails clearly.
49. As a vault owner, I want the vault trusted on every launch, so that no trust prompt or warning ever appears.
49c. As a vault owner, I want trust handled without writing to my own Pi's configuration, so that this plugin never alters decisions I made elsewhere.
49b. As a vault owner, I want no skills loaded at all, so that skills written for my own Pi setup do not change how the agent behaves here.
50. As a vault owner, I want Pi's startup update checks and telemetry disabled, so that opening a pane does not chatter over the network.

### Safety

36. As a vault owner, I want the plugin never to build a shell command string from a filename, so that note titles cannot become command injection.
37. As a vault owner, I want the plugin never to submit note content as a command on my behalf, so that nothing runs that I did not type.
38. As a vault owner, I want terminal output and environment variables never written to logs or disk by the plugin, so that agent conversations and credentials are not duplicated somewhere I am not tracking.
39. As a vault owner, I want to understand that Pi launched this way runs with my full user permissions and is not sandboxed to the vault, so that I judge its requests accordingly.

### Installing and verifying

40. As the developer, I want the plugin marked desktop-only, so that Obsidian does not attempt to load native code on a platform that cannot support it.
41. As the developer, I want the native PTY module kept as an installed dependency and loaded at runtime rather than bundled into the plugin's JavaScript, so that its platform-specific binary is not mangled by the bundler.
42. As the developer, I want a documented fallback of rebuilding the PTY module against Obsidian's Electron version, so that a native module load failure has a known remedy that does not involve building a binary distribution system.
43. As the developer, I want a short manual verification checklist, so that I can confirm the behaviour that automated tests deliberately do not cover.

## Implementation Decisions

### Shape

One Obsidian plugin, desktop-only: three pure modules (a launch resolver, a
settings model, and a device attribute responder), a terminal view, and an entry
point registering two commands, the view type, and a settings tab. No session
management, no transport layer, no UI framework.

### The launch resolver — the plugin's only real logic

All of the decision-making is concentrated in one pure module with no Obsidian
and no PTY imports. It converts a launch intent plus environment facts into a
concrete spawn specification, and it owns the serialization of that intent to and
from workspace leaf state.

This shape was agreed with the developer as the plugin's single test seam. It
began carrying a launch intent — which harness, and which note — and lost both
as the design narrowed to one Pi session per vault, so a launch is now fully
described by its context:

```ts
type SpawnSpec = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
};

resolveLaunch(ctx: {
  vaultRoot: string;
  agentDir: string;
  settings: Settings;
  appearance: "light" | "dark";
  processEnv: NodeJS.ProcessEnv;
}): SpawnSpec;

parseAutostart(state: unknown): boolean;
```

Rules the resolver encodes:

- Every launch runs `pi`, resolved through the `PATH` the process is given
  rather than by absolute path. node-pty resolves a bare command against the
  environment it is handed, not the one Obsidian holds, so prepending the
  directory that contains `pi` makes this as deterministic as an absolute path
  while surviving a reinstall elsewhere on that path. Verified by spawning with
  the bare environment Obsidian passes.
- `--approve` trusts project-local files for the run, so the vault is trusted
  every session and the trust prompt never appears. Nothing is saved because
  nothing needs to be. Its opposite, `--no-approve`, was tried first and made
  `/trust` look broken: it ignores project-local files whatever decision was
  saved, so a decision saved in one session was overridden by the next launch.
  The developer weighed the trade and accepted it: the vault holds the
  developer's own notes, and a trusted project may load `.pi` resources and run
  project extensions. `--no-skills` still applies, so trusting the vault does not
  bring skills back.
- `--no-skills` is always passed. The private config directory cannot cover this
  on its own: skills are also discovered from `~/.agents/skills` and from
  `.agents/skills` in the working directory and its parents, and neither path
  moves with `PI_CODING_AGENT_DIR`. A flag is the only way to be sure none load.
- The configured model is passed as `--model provider/id`, and both models are
  passed as `--models` so they can be cycled inside a session.
- `--use-theme` names Pi's own `light` or `dark` theme, matching Obsidian's
  current mode. This is per session by necessity, not by choice — see below. Pi otherwise picks a theme by probing the terminal for its
  background colour, a query this emulator does not answer, so it would always
  assume dark and draw a dark interface on a light vault. The appearance is read
  when the process starts, so switching Obsidian's theme affects sessions started
  afterwards rather than running ones.
- A note path becomes exactly one trailing argument, the path prefixed with `@`.
  No note path means no such argument.
- Working directory is always the vault root.
- The environment is the process environment with undefined values dropped, with
  the terminal type and colour terminal variables set for a 256-colour truecolor
  terminal.
- The environment's `PATH` gains two machine directories at its front, ahead of
  whatever was inherited and without duplicating entries already there. Pi is a
  Node script started through a `#!/usr/bin/env node` line, and Obsidian launched
  from the Finder inherits a bare `PATH` containing neither the profile directory
  holding `node` nor the npm global directory. Without this the launch fails with
  `env: node: No such file or directory`.
- `PI_CODING_AGENT_DIR` points at a directory inside the plugin's own folder, and
  every `PI_*` variable inherited from the user's environment is dropped first.
  `PI_PACKAGE_DIR` is deliberately not set: it exists for Nix-style store paths
  and breaks Pi's own version reporting.
- `PI_OFFLINE` is set, which suppresses update checks and install telemetry but
  not model requests.
- `LANG` and `LC_ALL` declare a UTF-8 locale. Without one, terminal programs
  fall back to latin1: vim was rendering a UTF-8 apostrophe as three stray
  glyphs. Obsidian launched from the Finder passes no locale at all. Measured:
  vim reports `latin1` with no locale and `utf-8` with one.
- `EDITOR` and `VISUAL` are set to `vi` for Pi's Ctrl+G external editor. Pi falls back to `nano` when neither is set, and Obsidian
  launched from the Finder passes neither. They are set unconditionally rather
  than only when absent, so the editor does not depend on what the environment
  happens to hold.
- The provider's API key variable is dropped from the inherited environment and
  set only from the plugin's settings, so an ambient key can never silently stand
  in for a missing one. When no key is configured the variable is absent entirely.
- A restored pane persists no state at all: the view's saved state is empty, so
  there is nothing that can be malformed, and `parseAutostart` is total.

Executable names are module-level constants, resolved through the `PATH` the
process is given. That `PATH` is the application's own, with the user's
configured directories in front and the standard system ones guaranteed at the
back. Nothing about any particular machine is written down, injected at build
time, or discovered by running a shell.

The consequence is faced rather than hidden: Obsidian launched from the Finder
inherits a bare `PATH` that reaches neither `node` nor `pi`, so the setting is
normally required, and a pane that cannot find `pi` says exactly that and names
the setting to fill in. An earlier version read those two directories from the
build machine and baked them into the bundle, which worked but made the built
artifact specific to one computer and silently wrong on any other.

Whether the command can be run is checked before spawning, because a missing
executable would otherwise surface as an exit code with no explanation. The
search itself — which paths to try, in order — is a pure function; only the
existence check touches the filesystem.
The API key and model are not constants, and are the only things the settings
tab exists for.

### Configuration

A second pure module owns everything about the provider. Pi ships a native
`deepseek` provider, so no custom provider file, base URL, or catalog entry is
needed — the plugin supplies a key and names a model, and Pi does the rest. The
model ids, the provider id, and the name of the environment variable the key
travels in are taken from Pi's own bundled catalog rather than invented.

The module holds the two models on offer, the default (flash), how a model is
named on the command line, an optional list of extra `PATH` directories, and a
total parser turning whatever Obsidian has stored into valid settings.

The `PATH` directories are stored as the raw string the user typed, so the
settings screen shows back exactly what was entered, and parsed separately into
the list actually used: colon-separated or one per line, trimmed, de-duplicated,
and absolute paths only, since a relative one would be read against the vault.
They lead the `PATH`, ahead of the directories found at build time, so a wrong
value baked into a build can be corrected without rebuilding. Nothing about the key or the model is decided
anywhere else.

The key is stored by Obsidian in the plugin's data file inside the vault, in
plain text, because Obsidian offers no secret storage. It is passed to Pi in an
environment variable and never as an argument, so it does not appear in the
process list. This is written down rather than glossed: the key is as safe as the
vault, and no safer.

A pane opened with no key configured does not spawn. It names the missing setting
and waits, so a missing key looks like a missing key rather than a crash.

### Terminal view

An Obsidian item view hosting one framework-free wterm terminal instance bound to
one PTY process.

Startup order matters and is fixed: create and initialise the terminal first,
supplying its input and resize callbacks up front so that the terminal never
echoes locally while no process exists, then read the terminal's negotiated column
and row count and spawn the process at that size. The callbacks forward to the
process through a mutable reference that is empty until the spawn returns, so
pre-spawn input is discarded rather than echoed.

Wiring is symmetric and minimal: terminal input to process input, terminal resize
to process resize, process output to terminal output, and process exit to a
written notice carrying the exit code.

A clean exit empties the pane and leaves it in place. The tab is a fixture of the
sidebar, so removing it on quit would take away the way back in; clearing the
screen and the scrollback instead leaves nothing to dismiss and nothing of the
finished session behind. This replaced two earlier behaviours: leaving the dead
session on screen with a restart prompt, where a stray keystroke stacked two dead
sessions in one pane, and closing the pane outright, which predates the pane
being permanent.

A non-zero exit does the opposite and keeps the pane open, showing the code and
offering a restart: something went wrong, and the pane is the only place the
evidence exists. Either way the subscriptions are disposed and the process
handle cleared first, so no keystroke is ever swallowed by a dead handle.

The view obtains the vault root from Obsidian's filesystem adapter and fails
loudly if the vault is not filesystem-backed, since there is nothing sensible to
do with a non-local vault.

Because sidebar panes are part of the saved workspace layout, Obsidian will
reconstruct a terminal pane every time it starts. Such a pane keeps its place —
its tab in the sidebar is a permanent way back to Pi — but starts nothing until
it is selected. A pane left open when Obsidian was quit is not a request to run
an agent now.

A restored pane is told apart from a commanded one by whether the workspace
layout was ready when it was built: nothing is ready before the restore, and
everything is ready by the time a command runs. The restored pane builds its
terminal, so the tab and the empty pane are there, and waits for the leaf to
become active before spawning. That listener is registered only once the layout
has settled, so the restore itself cannot be mistaken for the user selecting the
tab.

The waiting pane carries a short tip: that Pi is ready, and that clicking will
begin. It names no shortcut. The binding belongs to the user, is not readable
through Obsidian's public API, and a tip that quietly goes stale after a rebind
would be worse than a shorter one that cannot. An empty terminal says nothing about why it is empty, and
this is the only text the plugin ever puts on screen that is not an error — so it
stays to two short lines that fit a narrow sidebar, and is cleared the moment Pi
starts, which also means Pi paints from a clean screen.

The cursor is hidden while the tip is showing. Nothing is accepting input, so a
blinking cursor would suggest otherwise; it is restored when Pi starts, so a
process that never shows its own cannot leave the pane without one. A clean quit clears the
session and writes the tip again, returning the pane to where it began.

An earlier version of this notice read as an instruction to dismiss —
"[waiting] press any key" — which is what made it noise. The difference is that
this one describes a pane at rest rather than one demanding something.

Historically such a pane instead waited for a keystroke before starting. That
was dropped once quitting Pi began closing its own pane, which made a surviving
pane a deliberate one rather than a forgotten one — and then dropped further, to
not restoring at all.

Teardown disposes every process subscription, kills the process, and destroys the
terminal, in that order.

### Answering, and hiding, terminal queries the emulator does not handle

The wterm core does not handle two kinds of query that programs routinely send,
and each fails differently.

Device attribute queries (`CSI c`, `CSI > c`) are consumed but never answered.
Pi sends one at startup and blocks for its full ten-second timeout waiting, then
warns and disables optional features. Measured: ten seconds to a prompt against a
tenth of a second once answered. The query is left in the stream, since the core
consumes it correctly; only a reply is needed.

Terminfo capability queries (`DCS + q … ST`, XTGETTCAP) are not recognised at all,
so the core prints the payload as text. vim sends a batch of them on startup — 37,
measured — which appeared as a line of `+q436f+q6b75…` rubbish across the pane.
These are removed from the stream as well as answered, each capability reported
unsupported so the program falls back to its terminfo entry instead of waiting.

One module therefore filters everything arriving from the process, returning what
should reach the terminal and what should be written back. It is a small state
machine because a query can be split across two reads, and a partial query is held
back rather than printed — printing half of one is exactly the bug being fixed.
The buffer is bounded, so a stream that merely looks like a query cannot stall the
pane.

A related gap is handled in the stylesheet rather than here. A program on the
alternate screen has no scrollback, but the core keeps reporting the main
screen's, so the renderer drew the earlier session above the program — Pi's
output appearing over vi. The view tracks the alternate-screen state and marks
the pane; the stylesheet hides scrollback rows and stops the pane scrolling while
it is set.

All of this compensates for gaps in the emulator. If wterm handles these itself in
a later version, the compensation should be deleted rather than kept.

### The pane's icon

Pi's own mark, traced from its logo rather than drawn by hand or approximated:
the logo is seven rectangles on a four-by-four grid, which map exactly onto the
0-100 canvas Obsidian expects, so the icon is the logo at a different scale
rather than a likeness of it. Filled with `currentColor`, so it follows the
theme like every other icon.

It is registered with Obsidian rather than named from the built-in set. That set
follows Lucide, which does not carry a pi glyph in every version, and a name
Obsidian cannot resolve renders as nothing at all.

### Commands and focus

Two commands, both named for the user's intent rather than the mechanism, and
both carrying a default key. One moves the keyboard between the note and Pi. One
adds the selected text to the thread.

A ribbon icon was tried and removed. It existed to be a permanent, discoverable
way in, which the sidebar tab now is: once a restored pane keeps its place, the
tab does that job where the user asked for it, and a second entry point in the
left ribbon was redundant.

Neither command is an "open Pi" action, because each one opens it: anything that
needs Pi running starts it rather than refusing. That removes the only reason a
third command existed, and with it the question of whether Pi is running.

The focus command is deliberately one command rather than two, because "go to Pi"
and "come back" are the same thought in opposite directions. It asks where the
keyboard is: if Pi has it, focus returns to the most recent note; otherwise Pi is
revealed and focused, opening it first if it is not open. That makes the key safe
to press repeatedly and means the user never has to know whether Pi is running.

Only one Pi session exists. The commands look for an existing pane before creating
one, so a session is never duplicated and the conversation stays where the user
left it.

### Sending a selection

Modelled on the editor convention of quoting a selection into an assistant panel.
The selection is read from the last active editor rather than from whatever
currently holds focus, so the key works when the keyboard is already in Pi.

The text is written to the process as a bracketed paste, which Pi enables at
startup. That is what makes it arrive as text: a whole multi-line passage lands in
Pi's editor at once, escape sequences inside a note are literal rather than
interpreted, and nothing is submitted. Carriage returns are normalised away for
the same reason — a carriage return is what a terminal reads as "submit", and a
pasted note must never press enter on the user's behalf.

If Pi is not running, the command starts it and holds the text until its interface
has settled, detected as a pause in its output rather than a fixed delay. An empty
selection is reported rather than silently ignored.

This reverses an earlier decision to leave selection-sending out of scope. The
reasoning there — that Pi can read any vault path itself — held for whole notes
but not for a passage the user is looking at.

### Plugin entry point

Registers one view type, three commands, and a settings tab. Opening asks for a
leaf in the right sidebar, falling back to a main-area tab only when the workspace
declines to supply one, since an unexpected placement is better than a command
that silently does nothing. It then reveals the leaf and focuses the terminal —
after revealing, not before, because revealing moves focus to the pane container.

### Build and packaging

Bundle the terminal emulator into the plugin's JavaScript — its WASM core is
embedded in its own package, so nothing extra needs shipping. Mark the PTY module
external alongside Obsidian, Electron, and Node built-ins, and keep its installed
package directory in the plugin folder inside the vault, because it is required at
runtime. The PTY package's bundled Apple Silicon prebuild is used as-is; its spawn
helper must be executable after installation.

The addon must be required by absolute path, built from the vault root and the
plugin's own folder as reported by its manifest. Obsidian evaluates a plugin's
bundle without a module path, so a bare specifier resolves against Electron's
internals and fails with `Cannot find module 'node-pty'` — observed on first run,
not theoretical.

The terminal emulator dependency is pinned to an exact version because the package
is young.

Styling is the emulator's own stylesheet plus sizing rules: remove the pane's
content padding, hide overflow, and let the terminal host fill the pane with the
theme's primary background. These rules are written against the view type rather
than a sidebar-specific container, so the pane looks the same in the sidebar and
in the main editor area.

The sidebar is narrow by default and the terminal will be correspondingly narrow.
That is accepted rather than compensated for: the emulator's automatic resizing
reflows the terminal and notifies the process when the sidebar is dragged wider.
No minimum width is imposed.

The palette is Pi's own, copied from its built-in `dark.json` and `light.json`, so
the agent looks in this pane as it does in a terminal. Obsidian's light or dark
mode selects which applies. The background stays Obsidian's, because Pi's themes
deliberately set none and inherit the terminal's, which lets the pane blend with
the app while every foreground colour is Pi's. Two mappings needed a decision: Pi
has a brighter second tone for only some colours, so the bright half repeats the
normal half except where a real one exists; and the ends of the scale invert
between themes, since black must sit near the background on dark and be the text
tone on light, where a true bright white would vanish.

This stylesheet governs only the sixteen ANSI colours. Pi draws its interface in
24-bit colour from whichever theme it loaded, which the stylesheet cannot reach —
so the matching `--use-theme` argument is what actually keeps Pi in step with
Obsidian, and the palette here covers everything else.

### Why the theme cannot follow Obsidian live

A session started before the mode changed keeps the theme it started with. This
was investigated rather than assumed.

Pi detects terminal appearance exactly once, at startup, so it will not notice a
change. It does watch its active theme file and reload it, which suggested a way
round: write both palettes into one custom theme file inside the private config
directory and rewrite it whenever Obsidian's mode changes. That was built and
measured against a real Pi on a pseudo-terminal, using a deliberately
unmistakable accent colour to see which palette was in force.

The result: the custom theme file is picked up correctly at startup, whether named
by `--use-theme` or saved as the theme setting. But rewriting it mid-session
changed nothing — not after a forced full repaint, and not after `/reload`, which
Pi documents as reloading themes. Pi 0.84.4 keeps the palette a session started
with.

The machinery was therefore removed rather than kept, since it bought nothing over
naming the built-in theme, and a copy of Pi's palettes embedded here would only
drift. Panes opened after a mode change match Obsidian; panes already open keep
their colours until restarted.

### Nothing is written to a configuration file

Everything Pi needs is passed as a command-line flag or an environment variable.
A `quietStartup` setting to hide Pi's startup banner was tried and reverted: it
was the only thing that required writing a file into the private configuration
directory, and the developer preferred no such file to a hidden banner. Note that
reverting the code does not unwrite the file — the key had to be removed by hand
from the settings Pi had already saved.

### Not decided by code

The vault-level `AGENTS.md` is a document the developer writes in the vault, not
something the plugin generates or manages.

## Testing Decisions

### What a good test looks like here

A good test states a rule about observable behaviour: given these inputs, this is
the command, these are the arguments, this is the environment. It does not assert
on how a module is structured internally, and it does not reach into the view or
the emulator.

### The seam

The launch resolver is the primary automated test target. It is pure, has no
Obsidian or PTY imports, and can be exercised with plain unit tests and no test
doubles at all — which is precisely why it was chosen as the seam. Coverage
includes: Pi run by absolute path; the trust and skills flags present on every
launch and the opposite trust flag never present; the configured model selected
and both offered for cycling; the theme named; the vault root as working
directory; the key in the environment variable Pi reads and never on the command
line; no key variable when none is configured; an inherited key dropped; every
`PI_*` variable dropped and the private configuration directory set; the package
directory left alone; a UTF-8 locale declared and a non-UTF-8 one overridden; the
external editor set by absolute path and an inherited one overridden; undefined
environment values dropped; the terminal type and colour variables set; the
interpreter directories prepended to `PATH` without duplication; and the
plugin-relative paths for the PTY addon and the agent directory.

### The settings model

The third pure unit. Coverage includes the two models on offer and their order,
the default, model patterns as Pi names them, the cycling list, and a total
parser: undefined, null, a string, an array, an empty object, an unrecognised
model, and a non-string key all fall back to defaults, while a pasted key has
surrounding whitespace trimmed.

The resolver's own tests carry the key rules, since that is where the key reaches
Pi: the configured key appears in the environment variable Pi reads, never on the
command line; no variable is set at all when no key is configured; a key
inherited from the user's environment is dropped rather than used as a fallback;
and a configured key wins over an inherited one.

### The paste builder

A fourth pure unit, and the whole of the sending logic. Coverage includes the
bracketed wrapping, a multi-line passage staying in one paste, no payload ever
ending in a carriage return, Windows and classic-Mac line endings normalised,
interior blank lines preserved, escape sequences passed through as literal text,
an empty or whitespace-only selection declined, and text that only looks empty
at the edges kept.

### The terminal query filter

A pure unit, no imports and no doubles. Coverage includes each device attribute
form answered and left in the stream; each capability query removed from the
stream and answered as unsupported; a batched capability query answered once per
capability; both terminators accepted; surrounding output kept intact; queries of
either kind split across two reads handled without printing half of one; ordinary
text, colour and cursor sequences passed through untouched; a lone escape emitted
rather than swallowed; and a bounded buffer.

### What is verified by hand instead

Terminal rendering, keyboard input, resize propagation, process teardown, and the
native module loading inside Obsidian's Electron runtime are all confirmed
manually, because reproducing them in an automated harness would mean building an
Obsidian and Electron test environment far larger than the plugin. The checklist:
install and enable the plugin; run **Open terminal** with the right sidebar
collapsed and confirm it expands with the pane focused; exercise plain output,
`vim`, and a sidebar drag-resize; open Pi for a note and confirm both that the
note is in its opening context and that the sidebar taking focus did not change
which note was captured; confirm the shell pane and the Pi pane coexist as sidebar
tabs; ask Pi to read a second vault note; drag a live pane into the main editor
area and confirm the session continues; close a pane mid-response and confirm no
orphaned process survives; restart Obsidian and confirm the restored panes are
idle rather than running, then confirm activating one starts it; confirm the
shell reaches a prompt at once and prints no device attribute warning.

### Prior art

None — this is a greenfield repository with no existing tests. The resolver's
tests establish the pattern for anything added later.

## Out of Scope

- **Any second agent harness**, Claude Code included.
- **A shell.** Removed deliberately: this pane runs Pi and nothing else.
- **Any provider other than DeepSeek**, and any model beyond the two on offer.
- **Secret storage for the key.** Obsidian provides none; the key sits in the
  plugin's data file inside the vault, in plain text.
- **Overriding project trust.** Pi decides, and remembers the decision in the
  plugin's own configuration directory.
- **Session tabs, history, restoration, and transcript persistence.** Pi already
  manages its own sessions, and storing transcripts would duplicate sensitive
  conversation data.
- **A WebSocket or any other transport.** The terminal and the process live in one
  Electron process.
- **A UI framework wrapper.** Obsidian supplies the view lifecycle.
- **Native binary downloading, checksum verification, or multi-platform builds.**
  Only Apple Silicon macOS matters, and the plugin is built and installed locally.
- **Distribution, community plugin submission, and versioning policy.**
- **Sandboxing the agent.** Out of scope technically, but see the note below.
- **Automated tests for the view, the emulator, or the PTY.** Deliberately
  excluded by the seam decision above, not an oversight.

## Further Notes

The plugin does not confine Pi to the vault. It runs with full user filesystem and
shell permissions and can act anywhere the user can. The plugin's contribution to
safety is narrow and specific: fixed absolute executable paths, arguments passed
as arrays and never interpolated into a command string, the vault root as working
directory, processes killed when their pane closes, no logging of terminal output
or environment, and nothing ever auto-submitted on the user's behalf. Everything
beyond that is a matter of judging the agent's requests.

If the prebuilt native PTY module fails to load inside Obsidian, the remedy is to
rebuild that one module against Obsidian's Electron runtime. A download or
distribution system should not be introduced unless that local rebuild proves
insufficient.

The order of work is: resolver and its tests, then the view, then the entry point
and commands, then installation and the manual checklist. The resolver can be
written and fully tested before any Obsidian or native code exists.
