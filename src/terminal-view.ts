import { accessSync, constants, mkdirSync } from "node:fs";
import { WTerm } from "@wterm/dom";
import type { IPty } from "node-pty";
import { FileSystemAdapter, ItemView, type WorkspaceLeaf } from "obsidian";
import {
  type Appearance,
  agentDirPath,
  candidatePaths,
  nodePtyPath,
  resolveLaunch,
} from "./launch.js";
import { bracketedPaste } from "./paste.js";
import type { Settings } from "./settings.js";
import { TerminalQueryFilter } from "./terminal-queries.js";

export const TERMINAL_VIEW_TYPE = "pi-agent";

/**
 * Pi's own mark, traced from its logo: seven rectangles on a four-by-four grid,
 * scaled onto the 0-100 canvas Obsidian expects and filled with `currentColor`
 * so it follows the theme.
 *
 * Registered rather than taken from Obsidian's built-in set, which follows
 * Lucide and carries no pi glyph in every version — a missing name renders as
 * nothing at all.
 */
export const PI_ICON_ID = "pi-symbol";
export const PI_ICON_SVG = [
  '<g fill="currentColor">',
  '<rect x="10" y="10" width="60" height="20" />',
  '<rect x="10" y="30" width="20" height="20" />',
  '<rect x="50" y="30" width="20" height="20" />',
  '<rect x="10" y="50" width="40" height="20" />',
  '<rect x="70" y="50" width="20" height="20" />',
  '<rect x="10" y="70" width="20" height="20" />',
  '<rect x="70" y="70" width="20" height="20" />',
  "</g>",
].join("");

type Subscription = { dispose(): void };

export class TerminalView extends ItemView {
  private term: WTerm | null = null;
  private process: IPty | null = null;
  private subscriptions: Subscription[] = [];
  private started = false;
  private queries = new TerminalQueryFilter();
  private host: HTMLElement | null = null;
  private altScreen = false;
  private pendingPaste: string | null = null;
  private settleTimer: number | null = null;
  private focusTimer: number | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    /** The plugin's folder inside the vault, used to locate the PTY addon. */
    private readonly pluginDir: string | undefined,
    /** Read at spawn time, so a key added in settings applies to the next start. */
    private readonly readSettings: () => Settings,
    private readonly onDispose: (view: TerminalView) => void,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return TERMINAL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Pi";
  }

  override getIcon(): string {
    return PI_ICON_ID;
  }

  override getState(): Record<string, unknown> {
    // Deliberately empty: a pane needs to know nothing to be restored.
    return {};
  }

  override async onOpen(): Promise<void> {
    const host = this.contentEl.createDiv({ cls: "pi-terminal" });
    this.host = host;

    // The callbacks are supplied up front so the terminal never handles input
    // on its own while there is no process to send it to.
    this.term = await new WTerm(host, {
      autoResize: true,
      onData: (data) => this.handleInput(data),
      onResize: (cols, rows) => this.process?.resize(cols, rows),
    }).init();

    // After a failure the pane is idle; a click retries it.
    this.registerDomEvent(host, "mousedown", () => {
      if (!this.started) this.start();
      this.focusTerminal();
      this.focusTerminalAfterPress();
    });

    // A second line of defence, for focus that lands inside the pane without a
    // request having been made of the view: anything here that is not the
    // terminal's own textarea should not be holding the keyboard.
    this.registerDomEvent(this.contentEl, "focusin", (event) => {
      if (event.target instanceof HTMLTextAreaElement) return;
      this.focusTerminal();
    });

    this.writeIdleTip();

    // A pane is never started by existing. It starts when it is activated —
    // by selecting its tab, or by a command revealing it — which covers both
    // the pane that sits waiting in the sidebar and the one a command opens.
    //
    // Registered once the layout has settled, so restoring a pane cannot look
    // like the user selecting it.
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(
        this.app.workspace.on("active-leaf-change", (leaf) => {
          if (leaf === this.leaf && !this.started) this.start();
        }),
      );
    });
  }

  override async onClose(): Promise<void> {
    this.dispose();
  }

  /** Gives the keyboard to the terminal. Safe to call before it exists. */
  focusTerminal(): void {
    this.term?.focus();
  }

  /**
   * How Obsidian asks a view for the keyboard, and the last thing it does when
   * a leaf is activated: it blurs whatever had focus outside the leaf, then
   * hands the request to the view. A view that ignores the request is left
   * with the keyboard on nothing at all — which is why the pane could be
   * selected, or clicked to start a session, and still not take typing until
   * it was clicked a second time.
   *
   * The terminal's input is a hidden textarea, so nothing else in the pane can
   * usefully hold focus; every focus request goes to it.
   */
  override setEphemeralState(state: unknown): void {
    if (isFocusRequest(state)) this.focusTerminal();
  }

  /**
   * Gives the keyboard to the terminal once the press asking for it is over.
   *
   * A press moves focus itself, as part of its default action, after every
   * handler has run — so focusing from the handler is undone a moment later.
   * The emulator repairs that when the click arrives, which covers a press on
   * a running session but not the press that starts one: clearing the screen
   * for Pi replaces the row elements, and a press whose element has been
   * removed produces no click at all, so nothing puts focus back.
   *
   * Left alone while text is selected, so this cannot collapse a selection
   * made by dragging, which is the same reserve the emulator keeps.
   */
  private focusTerminalAfterPress(): void {
    if (this.focusTimer !== null) window.clearTimeout(this.focusTimer);
    // A timeout rather than a microtask: the default action runs after the
    // handlers but before the task ends, so only a later task is after it.
    this.focusTimer = window.setTimeout(() => {
      this.focusTimer = null;
      const selection = this.containerEl.ownerDocument.getSelection();
      if (selection && !selection.isCollapsed) return;
      this.focusTerminal();
    }, 0);
  }

  /**
   * Puts text into Pi's editor without submitting it. If Pi is still starting,
   * the text is held and delivered once its interface has settled — otherwise
   * it would be written into a terminal that is not yet listening.
   */
  paste(text: string): boolean {
    const payload = bracketedPaste(text);
    if (payload === null) return false;

    if (this.process) {
      this.process.write(payload);
      return true;
    }

    this.pendingPaste = payload;
    if (!this.started) this.start();
    return true;
  }

  /** Whether the keyboard is currently in this pane. */
  hasFocus(): boolean {
    const active = this.containerEl.ownerDocument.activeElement;
    return active !== null && this.containerEl.contains(active);
  }

  /** Called by the plugin on unload, so no process outlives the plugin. */
  dispose(): void {
    if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
    this.settleTimer = null;
    if (this.focusTimer !== null) window.clearTimeout(this.focusTimer);
    this.focusTimer = null;
    this.pendingPaste = null;
    this.disposeSubscriptions();
    this.process?.kill();
    this.process = null;
    this.term?.destroy();
    this.term = null;
    this.host = null;
    this.altScreen = false;
    this.started = false;
    this.onDispose(this);
  }

  /**
   * Quitting Pi empties the pane rather than closing it: the tab is a fixture
   * of the sidebar, so it stays, and clearing the screen leaves nothing to
   * dismiss. Selecting or clicking the pane starts a fresh session.
   *
   * A non-zero exit keeps its output instead: something went wrong, and the
   * code on screen is the only evidence of what.
   */
  private handleExit(exitCode: number): void {
    // Safe from inside the handler: node-pty copies its listener list before
    // dispatching.
    this.disposeSubscriptions();
    this.process = null;
    this.started = false;

    if (exitCode === 0) {
      // Clear the screen and the scrollback, so nothing of the finished
      // session is left behind, and offer the way back in.
      this.term?.write("\x1b[2J\x1b[3J\x1b[H");
      this.writeIdleTip();
      return;
    }

    this.dim(`\r\n[process exited ${exitCode}] Press any key to start again.`);
  }

  /**
   * Pi's interface paints for a moment after it starts. Waiting for a pause in
   * its output is a better signal that it is ready than any fixed delay.
   */
  private deliverPasteWhenSettled(proc: IPty): void {
    if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
    this.settleTimer = window.setTimeout(() => {
      this.settleTimer = null;
      const payload = this.pendingPaste;
      this.pendingPaste = null;
      if (payload) proc.write(payload);
    }, 400);
  }

  /**
   * A full-screen program such as vi switches the terminal to its alternate
   * screen, which has no scrollback. The emulator still reports the main
   * screen's scrollback while that is happening, so the renderer keeps drawing
   * the earlier session above the program — Pi's startup output appearing over
   * vi. Hiding it is a stylesheet matter; this only tracks the state.
   */
  private syncAltScreen(term: WTerm): void {
    const alt = term.bridge?.usingAltScreen() ?? false;
    if (alt === this.altScreen) return;

    this.altScreen = alt;
    this.host?.classList.toggle("pi-alt-screen", alt);
    // The alternate screen starts at the top; any inherited scroll offset
    // would leave the program drawn partly out of view.
    if (alt && this.host) this.host.scrollTop = 0;
  }

  private disposeSubscriptions(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
    this.subscriptions = [];
  }

  private handleInput(data: string): void {
    if (!this.started) {
      // Only reachable after a failure or a non-zero exit: the keystroke
      // retries rather than being echoed into nothing.
      this.start();
      return;
    }
    this.process?.write(data);
  }

  /**
   * An empty terminal says nothing about why it is empty. This is the only
   * text the plugin puts on screen that is not an error, so it stays short.
   *
   * It names no shortcut: the binding is the user's to change and is not
   * readable through Obsidian's public API, so a tip mentioning one would go
   * quietly wrong after a rebind. Clicking always works.
   */
  private writeIdleTip(): void {
    const dim = "\x1b[2m";
    const off = "\x1b[0m";

    this.term?.write(
      [
        "",
        `  ${dim}Pi is ready when you are.${off}`,
        "",
        `  ${dim}Click here to begin.${off}`,
        "",
        // Nothing is accepting input yet, so a cursor would only suggest
        // otherwise. Pi shows and places its own once it starts.
        "\x1b[?25l",
      ].join("\r\n"),
    );
  }

  private dim(message: string): void {
    this.term?.write(`\x1b[2m${message}\x1b[0m\r\n`);
  }

  /** Reports a failed start in the pane and leaves it startable again. */
  private failToStart(message: string): void {
    this.started = false;
    this.term?.write(`\r\n\x1b[31m[error] ${message}\x1b[0m\r\n`);
  }

  private start(): void {
    const term = this.term;
    if (this.started || !term) return;

    const settings = this.readSettings();
    if (!settings.apiKey) {
      this.dim(
        "[not configured] Add your DeepSeek API key in Settings \u2192 Community plugins \u2192 Pi, then press any key.",
      );
      return;
    }

    this.started = true;
    // The tip has served its purpose; Pi paints from a clean screen, with the
    // cursor restored so it is not left hidden if the process never shows it.
    term.write("\x1b[2J\x1b[3J\x1b[H\x1b[?25h");

    // Required lazily so a native addon that fails to load reports itself in
    // the pane instead of preventing the whole plugin from loading.
    let vaultRoot: string;
    let agentDir: string;
    let spawn: typeof import("node-pty").spawn;
    try {
      vaultRoot = vaultRootOf(this);
      agentDir = agentDirPath(vaultRoot, this.pluginDir);
      // Pi writes its settings, credentials, and sessions here; it must exist.
      mkdirSync(agentDir, { recursive: true });
      ({ spawn } = require(
        nodePtyPath(vaultRoot, this.pluginDir),
      ) as typeof import("node-pty"));
    } catch (error) {
      this.failToStart(`Could not start the agent: ${errorMessage(error)}`);
      return;
    }

    const spec = resolveLaunch({
      vaultRoot,
      vaultName: this.app.vault.getName(),
      agentDir,
      settings,
      appearance: obsidianAppearance(this.containerEl),
      processEnv: process.env,
    });

    if (!isExecutable(spec.command, spec.env.PATH)) {
      this.failToStart(
        [
          `Could not find ${spec.command} on this PATH.`,
          "",
          "  Add the directory holding it under",
          "  Extra PATH directories in this plugin's settings,",
          "  then press any key.",
        ].join("\r\n"),
      );
      return;
    }

    let proc: IPty;
    try {
      proc = spawn(spec.command, spec.args, {
        cwd: spec.cwd,
        cols: term.cols,
        rows: term.rows,
        name: "xterm-256color",
        env: spec.env,
      });
    } catch (error) {
      this.failToStart(
        `Could not start ${spec.command}: ${errorMessage(error)}`,
      );
      return;
    }

    this.subscriptions.push(
      proc.onData((data) => {
        // Filtered before display: some queries the core cannot handle would
        // otherwise be printed as text, and some need an answer.
        const { text, reply } = this.queries.process(data);
        if (text) {
          term.write(text);
          this.syncAltScreen(term);
        }
        if (reply) proc.write(reply);
        if (this.pendingPaste) this.deliverPasteWhenSettled(proc);
      }),
      proc.onExit(({ exitCode }) => this.handleExit(exitCode)),
    );

    this.queries = new TerminalQueryFilter();
    this.process = proc;
    term.focus();
  }
}

/**
 * Read at spawn time from the document Obsidian marks with its current mode.
 * Switching theme affects sessions started afterwards, not running ones.
 */
function obsidianAppearance(el: HTMLElement): Appearance {
  return el.ownerDocument.body.classList.contains("theme-dark")
    ? "dark"
    : "light";
}

function vaultRootOf(view: ItemView): string {
  const adapter = view.app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    throw new Error("Pi requires a filesystem-backed vault");
  }
  return adapter.getBasePath();
}

/** Whether a command can actually be run, given the PATH it will be run with. */
function isExecutable(command: string, path: string): boolean {
  return candidatePaths(command, path).some((candidate) => {
    try {
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Whether an ephemeral state asks for the keyboard. */
function isFocusRequest(state: unknown): boolean {
  if (typeof state !== "object" || state === null) return false;
  return Boolean((state as { focus?: unknown }).focus);
}
