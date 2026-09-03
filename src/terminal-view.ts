import {
  FileSystemAdapter,
  ItemView,
  type ViewStateResult,
  type WorkspaceLeaf,
} from "obsidian";
import { WTerm } from "@wterm/dom";
import { mkdirSync } from "node:fs";
import { TerminalQueryFilter } from "./terminal-queries.js";
import { bracketedPaste } from "./paste.js";
import type { Settings } from "./settings.js";
import type { IPty } from "node-pty";
import {
  agentDirPath,
  nodePtyPath,
  parseAutostart,
  resolveLaunch,
  type Appearance,
} from "./launch.js";

export const TERMINAL_VIEW_TYPE = "wterm-pi-terminal";

type Subscription = { dispose(): void };

export class TerminalView extends ItemView {
  private term: WTerm | null = null;
  private process: IPty | null = null;
  private subscriptions: Subscription[] = [];
  private started = false;
  private autostart = false;
  private queries = new TerminalQueryFilter();
  private host: HTMLElement | null = null;
  private altScreen = false;
  private pendingPaste: string | null = null;
  private settleTimer: number | null = null;

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
    return "terminal";
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    if (parseAutostart(state)) this.autostart = true;
    await super.setState(state, result);
  }

  override getState(): Record<string, unknown> {
    // Deliberately empty: autostart must never be persisted, and there is
    // nothing else a restored pane needs to know.
    return {};
  }

  override async onOpen(): Promise<void> {
    const host = this.contentEl.createDiv({ cls: "wterm-pi-host" });
    this.host = host;

    // The callbacks are supplied up front so the terminal never handles input
    // on its own while there is no process to send it to.
    this.term = await new WTerm(host, {
      autoResize: true,
      onData: (data) => this.handleInput(data),
      onResize: (cols, rows) => this.process?.resize(cols, rows),
    }).init();

    // A click is the other way a waiting pane is activated.
    this.registerDomEvent(host, "mousedown", () => {
      if (!this.started) this.start();
      this.focusTerminal();
    });

    // Obsidian focuses the pane's own container when the leaf is revealed or
    // its tab is selected, which would otherwise leave the terminal's hidden
    // textarea unfocused and the keyboard dead. Hand focus back to it.
    this.registerDomEvent(this.contentEl, "focusin", (event) => {
      if (event.target instanceof HTMLTextAreaElement) return;
      this.focusTerminal();
    });

    if (this.autostart) {
      this.start();
    } else {
      this.writeIdleNotice();
    }
  }

  override async onClose(): Promise<void> {
    this.dispose();
  }

  /** Gives the keyboard to the terminal. Safe to call before it exists. */
  focusTerminal(): void {
    this.term?.focus();
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
   * Quitting Pi closes the pane, which is what quitting is meant to mean. A
   * non-zero exit keeps the pane open instead: something went wrong, and the
   * code on screen is the only evidence of what.
   */
  private handleExit(exitCode: number): void {
    // Safe from inside the handler: node-pty copies its listener list before
    // dispatching.
    this.disposeSubscriptions();
    this.process = null;
    this.started = false;

    if (exitCode === 0) {
      this.leaf.detach();
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
    this.host?.classList.toggle("wterm-pi-alt", alt);
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
      // First keystroke in a waiting pane starts it rather than being echoed.
      this.start();
      return;
    }
    this.process?.write(data);
  }

  private writeIdleNotice(): void {
    this.dim("[waiting] Click or press any key to start Pi.");
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
        "[not configured] Add your DeepSeek API key in Settings \u2192 Community plugins \u2192 wterm Pi, then press any key.",
      );
      return;
    }

    this.started = true;

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
      ({ spawn } = require(nodePtyPath(vaultRoot, this.pluginDir)) as typeof import("node-pty"));
    } catch (error) {
      this.failToStart(`Could not start the agent: ${errorMessage(error)}`);
      return;
    }

    const spec = resolveLaunch({
      vaultRoot,
      agentDir,
      settings,
      appearance: obsidianAppearance(this.containerEl),
      processEnv: process.env,
    });

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
      this.failToStart(`Could not start ${spec.command}: ${errorMessage(error)}`);
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
  return el.ownerDocument.body.classList.contains("theme-dark") ? "dark" : "light";
}

function vaultRootOf(view: ItemView): string {
  const adapter = view.app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    throw new Error("wterm Pi requires a filesystem-backed vault");
  }
  return adapter.getBasePath();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
