import { accessSync, constants, mkdirSync, statSync } from "node:fs";
import { WTerm } from "@wterm/dom";
import type { IPty } from "node-pty";
import {
  type EventRef,
  FileSystemAdapter,
  ItemView,
  type WorkspaceLeaf,
} from "obsidian";
import {
  agentDirPath,
  candidatePaths,
  nodePtyPath,
  resolveLaunch,
  vaultSkillsPath,
} from "./launch.js";
import { bracketedPaste } from "./paste.js";
import type { Settings } from "./settings.js";
import { type Appearance, TerminalQueryFilter } from "./terminal-queries.js";

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
type TerminalSize = { cols: number; rows: number };

const INITIAL_TERMINAL_SIZE: TerminalSize = { cols: 1, rows: 1 };

export class TerminalView extends ItemView {
  private term: WTerm | null = null;
  private initializingTerm: WTerm | null = null;
  private terminalInitialization: Promise<WTerm | null> | null = null;
  private hostWait: {
    observer: ResizeObserver;
    resolve: (measurable: boolean) => void;
  } | null = null;
  private cancelTerminalMeasurement: (() => void) | null = null;
  private process: IPty | null = null;
  private subscriptions: Subscription[] = [];
  private appearanceEvent: EventRef | null = null;
  private appearance: Appearance = "light";
  private started = false;
  private queries = new TerminalQueryFilter();
  private host: HTMLElement | null = null;
  private altScreen = false;
  private mainScrollTop = 0;
  private mainScrollPinned = true;
  private pendingPaste: string | null = null;
  private settleTimer: number | null = null;
  private focusTimer: number | null = null;
  private disposed = false;

  constructor(
    leaf: WorkspaceLeaf,
    /** The plugin's folder inside the vault, used to locate the PTY addon. */
    private readonly pluginDir: string | undefined,
    /** Read at spawn time, so a key added in settings applies to the next start. */
    private readonly readSettings: () => Settings,
    private readonly onOpenView: (view: TerminalView) => void,
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
    // Obsidian normally creates a new view after close, but keeping lifecycle
    // state re-armable makes reopening the same instance safe as well.
    this.disposed = false;
    this.terminalInitialization = null;
    this.onOpenView(this);
    this.contentEl.empty();

    const host = this.contentEl.createDiv({ cls: "pi-terminal" });
    this.host = host;
    this.appearance = obsidianAppearance(host);
    this.appearanceEvent = this.app.workspace.on("css-change", () =>
      this.handleAppearanceChange(),
    );

    // After a failure the pane is idle; a click retries it. Terminal creation
    // is deferred until the host is laid out, because wterm cannot recover when
    // its first auto-resize measurement happens while hidden.
    this.registerDomEvent(host, "mousedown", () => {
      if (!this.started) void this.start();
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

    // A pane is never started by existing. It starts when it is activated —
    // by selecting its tab, or by a command revealing it — which covers both
    // the pane that sits waiting in the sidebar and the one a command opens.
    //
    // Registered once the layout has settled, so restoring a pane cannot look
    // like the user selecting it.
    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(
        this.app.workspace.on("active-leaf-change", (leaf) => {
          if (leaf === this.leaf && !this.started) void this.start();
        }),
      );
    });
  }

  override async onClose(): Promise<void> {
    this.dispose();
  }

  /**
   * Creates at most one terminal, and only once the host has real layout.
   * Activation, focus, click, and paste all meet at this promise so none can
   * race another terminal or process into existence.
   */
  private ensureTerminal(): Promise<WTerm | null> {
    if (this.term) return Promise.resolve(this.term);
    if (this.disposed) return Promise.resolve(null);

    if (!this.terminalInitialization) {
      this.terminalInitialization = this.initializeTerminal();
    }
    return this.terminalInitialization;
  }

  private async initializeTerminal(): Promise<WTerm | null> {
    const host = this.host;
    if (!host) return null;

    while (!this.disposed && this.host === host) {
      if (!(await this.waitForMeasurableHost(host))) return null;

      let resolveMeasurement: (size: TerminalSize | null) => void = () => {};
      const measurement = new Promise<TerminalSize | null>((resolve) => {
        resolveMeasurement = resolve;
      });
      let settled = false;
      let cancelMeasurement: () => void = () => {};
      const settleMeasurement = (size: TerminalSize | null) => {
        if (settled) return;
        settled = true;
        if (this.cancelTerminalMeasurement === cancelMeasurement) {
          this.cancelTerminalMeasurement = null;
        }
        resolveMeasurement(size);
      };
      cancelMeasurement = () => settleMeasurement(null);
      this.cancelTerminalMeasurement = cancelMeasurement;

      // Starting from 1-by-1 makes every normal pane produce a public resize
      // callback. That callback, not animation-frame timing, proves wterm has
      // measured the host and replaced the sentinel dimensions. A genuinely
      // 1-by-1 host intentionally remains pending until its geometry changes:
      // there is no public signal that distinguishes it from an unmeasured one.
      const candidate = new WTerm(host, {
        ...INITIAL_TERMINAL_SIZE,
        autoResize: true,
        onData: (data) => this.handleInput(data),
        onResize: (cols, rows) => {
          settleMeasurement({ cols, rows });
          this.process?.resize(cols, rows);
        },
      });
      this.initializingTerm = candidate;

      try {
        await candidate.init();
      } catch (error) {
        cancelMeasurement();
        this.discardCandidate(candidate);
        if (!this.disposed && this.host === host) {
          host.setText(`Could not initialize terminal: ${errorMessage(error)}`);
        }
        return null;
      }

      if (!this.isLiveCandidate(candidate, host)) {
        cancelMeasurement();
        this.discardCandidate(candidate);
        return null;
      }

      // The host may have become hidden while wterm was loading its core. In
      // that case wterm installed no resize observer, so discard this attempt
      // and wait for a new positive-size notification before trying again.
      if (!isMeasurableHost(host)) {
        cancelMeasurement();
        this.discardCandidate(candidate);
        continue;
      }

      // ResizeObserver delivery follows requestAnimationFrame in this runtime;
      // only wterm's onResize callback above is evidence that cols/rows are real.
      const measuredSize = await measurement;
      if (!measuredSize || !this.isLiveCandidate(candidate, host)) {
        this.discardCandidate(candidate);
        return null;
      }

      this.initializingTerm = null;
      this.term = candidate;
      this.writeIdleTip();
      return candidate;
    }

    return null;
  }

  private isLiveCandidate(candidate: WTerm, host: HTMLElement): boolean {
    return (
      !this.disposed &&
      this.host === host &&
      this.initializingTerm === candidate
    );
  }

  private discardCandidate(candidate: WTerm): void {
    candidate.destroy();
    if (this.initializingTerm === candidate) this.initializingTerm = null;
  }

  private waitForMeasurableHost(host: HTMLElement): Promise<boolean> {
    if (isMeasurableHost(host)) return Promise.resolve(true);
    if (this.disposed || this.host !== host) return Promise.resolve(false);

    return new Promise((resolve) => {
      const observer = new ResizeObserver(() => {
        if (this.hostWait?.observer !== observer) return;
        if (this.disposed || this.host !== host) {
          this.finishHostWait(false);
        } else if (isMeasurableHost(host)) {
          this.finishHostWait(true);
        }
      });
      this.hostWait = { observer, resolve };
      observer.observe(host);
    });
  }

  private finishHostWait(measurable: boolean): void {
    const wait = this.hostWait;
    if (!wait) return;
    this.hostWait = null;
    wait.observer.disconnect();
    wait.resolve(measurable);
  }

  /** Gives the keyboard to the terminal. Safe to call before it exists. */
  focusTerminal(): void {
    if (this.term) {
      this.term.focus();
      return;
    }

    void this.ensureTerminal().then((term) => term?.focus());
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
    if (!this.started) void this.start();
    return true;
  }

  /** Whether the keyboard is currently in this pane. */
  hasFocus(): boolean {
    const active = this.containerEl.ownerDocument.activeElement;
    return active !== null && this.containerEl.contains(active);
  }

  /** Called by the plugin on unload, so no process outlives the plugin. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.settleTimer !== null) window.clearTimeout(this.settleTimer);
    this.settleTimer = null;
    if (this.focusTimer !== null) window.clearTimeout(this.focusTimer);
    this.focusTimer = null;
    this.pendingPaste = null;
    this.finishHostWait(false);
    this.cancelTerminalMeasurement?.();
    this.cancelTerminalMeasurement = null;
    this.disposeSubscriptions();
    if (this.appearanceEvent) {
      this.app.workspace.offref(this.appearanceEvent);
      this.appearanceEvent = null;
    }
    this.process?.kill();
    this.process = null;
    this.initializingTerm?.destroy();
    this.initializingTerm = null;
    this.term?.destroy();
    this.term = null;
    this.terminalInitialization = null;
    this.host = null;
    this.altScreen = false;
    this.mainScrollTop = 0;
    this.mainScrollPinned = true;
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
   * vi. Hiding it is a stylesheet matter; this tracks the state and carries the
   * session's scroll position across the switch.
   *
   * The position has to be carried by hand because the pane is the thing that
   * scrolls, and while the alternate screen is up the session's rows are hidden
   * and the pane sits at offset zero. The emulator decides whether to keep the
   * pane pinned to the newest output by reading its scroll offset at the start
   * of every write, so a pane still sitting at zero when the first line of
   * output after vi arrives is read as a reader who has scrolled back to the
   * beginning of the session — and the session stays there, at the top, rather
   * than where it was left. Restoring the offset the moment the program leaves,
   * before any of that output is written, is what keeps the place.
   */
  private syncAltScreen(term: WTerm): void {
    const alt = term.bridge?.usingAltScreen() ?? false;
    if (alt === this.altScreen) return;

    this.altScreen = alt;
    const host = this.host;
    if (!host) return;

    if (alt) {
      // Read before the rows are hidden: hiding them collapses the pane's
      // scrollable height, and the browser clamps the offset to zero with it.
      this.mainScrollTop = host.scrollTop;
      this.mainScrollPinned = isScrolledToBottom(host);
      host.classList.add("pi-alt-screen");
      // The alternate screen starts at the top; any inherited scroll offset
      // would leave the program drawn partly out of view.
      host.scrollTop = 0;
      return;
    }

    host.classList.remove("pi-alt-screen");
    // Pinned to the newest output is a position too, and one that a saved
    // offset would miss whenever the session grew while the program was up.
    host.scrollTop = this.mainScrollPinned
      ? host.scrollHeight
      : this.mainScrollTop;
  }

  private disposeSubscriptions(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
    this.subscriptions = [];
  }

  private handleAppearanceChange(): void {
    const appearance = obsidianAppearance(this.containerEl);
    if (appearance === this.appearance) return;

    this.appearance = appearance;
    const proc = this.process;
    if (!proc) return;

    const report = this.queries.appearanceChanged(appearance);
    if (report) proc.write(report);
  }

  private handleInput(data: string): void {
    if (!this.started) {
      // Only reachable after a failure or a non-zero exit: the keystroke
      // retries rather than being echoed into nothing.
      void this.start();
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

  private async start(): Promise<void> {
    if (this.started || this.disposed) return;

    const term = await this.ensureTerminal();
    // Every trigger shares terminal initialization. Once it resolves, the
    // first continuation claims startup synchronously and all others stop.
    if (this.started || this.disposed || !term || term !== this.term) return;

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
      vaultSkillsDirectoryExists: isDirectory(vaultSkillsPath(vaultRoot)),
      settings,
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

    // Subscription state belongs to this process and must not survive a
    // restart in the same view.
    this.queries = new TerminalQueryFilter();
    this.process = proc;

    this.subscriptions.push(
      proc.onData((data) => {
        // Filtered before display: some queries the core cannot handle would
        // otherwise be printed as text, and some need an answer.
        const { text, reply } = this.queries.process(
          data,
          obsidianAppearance(this.containerEl),
        );
        if (text) {
          term.write(text);
          this.syncAltScreen(term);
        }
        if (reply) proc.write(reply);
        if (this.pendingPaste) this.deliverPasteWhenSettled(proc);
      }),
      proc.onExit(({ exitCode }) => this.handleExit(exitCode)),
    );

    term.focus();
  }
}

/** Read from the document Obsidian marks with its current mode. */
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

/** A missing optional directory is ordinary, not a startup error. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
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

/** Public host geometry is the boundary wterm itself is allowed to measure. */
function isMeasurableHost(host: HTMLElement): boolean {
  if (!host.isConnected) return false;
  const { width, height } = host.getBoundingClientRect();
  return width > 0 && height > 0;
}

/**
 * Whether a scrollable element is at its end, with the same few pixels of
 * tolerance the emulator itself allows, so the two agree about a pane that is
 * pinned to the newest output.
 */
function isScrolledToBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 5;
}

/** Whether an ephemeral state asks for the keyboard. */
function isFocusRequest(state: unknown): boolean {
  if (typeof state !== "object" || state === null) return false;
  return Boolean((state as { focus?: unknown }).focus);
}
