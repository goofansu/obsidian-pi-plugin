import {
  FileSystemAdapter,
  ItemView,
  type ViewStateResult,
  type WorkspaceLeaf,
} from "obsidian";
import { WTerm } from "@wterm/dom";
import { DeviceAttributeResponder } from "./device-attributes.js";
import type { IPty } from "node-pty";
import {
  launchDescription,
  launchTitle,
  nodePtyPath,
  parseAutostart,
  parseLaunch,
  resolveLaunch,
  serializeLaunch,
  type Launch,
} from "./launch.js";

export const TERMINAL_VIEW_TYPE = "wterm-pi-terminal";

type Subscription = { dispose(): void };

export class TerminalView extends ItemView {
  private launch: Launch = { kind: "shell" };
  private term: WTerm | null = null;
  private process: IPty | null = null;
  private subscriptions: Subscription[] = [];
  private started = false;
  private autostart = false;
  private deviceAttributes = new DeviceAttributeResponder();

  constructor(
    leaf: WorkspaceLeaf,
    /** The plugin's folder inside the vault, used to locate the PTY addon. */
    private readonly pluginDir: string | undefined,
    private readonly onDispose: (view: TerminalView) => void,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return TERMINAL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return launchTitle(this.launch);
  }

  override getIcon(): string {
    return "terminal";
  }

  override async setState(state: unknown, result: ViewStateResult): Promise<void> {
    this.launch = parseLaunch(state);
    if (parseAutostart(state)) this.autostart = true;
    await super.setState(state, result);
  }

  override getState(): Record<string, unknown> {
    return serializeLaunch(this.launch);
  }

  override async onOpen(): Promise<void> {
    const host = this.contentEl.createDiv({ cls: "wterm-pi-host" });

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

  /** Called by the plugin on unload, so no process outlives the plugin. */
  dispose(): void {
    this.disposeSubscriptions();
    this.process?.kill();
    this.process = null;
    this.term?.destroy();
    this.term = null;
    this.started = false;
    this.onDispose(this);
  }

  /**
   * The process is cleared so that later keystrokes are not swallowed by a dead
   * handle, and the pane can be started again the same way a waiting one is.
   */
  private handleExit(exitCode: number): void {
    // Safe from inside the handler: node-pty copies its listener list before
    // dispatching.
    this.disposeSubscriptions();
    this.process = null;
    this.started = false;
    this.dim(`\r\n[process exited ${exitCode}] Press any key to start again.`);
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
    this.dim(
      `[waiting] Click or press any key to start ${launchDescription(this.launch)}.`,
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
    this.started = true;

    // Required lazily so a native addon that fails to load reports itself in
    // the pane instead of preventing the whole plugin from loading.
    let vaultRoot: string;
    let spawn: typeof import("node-pty").spawn;
    try {
      vaultRoot = vaultRootOf(this);
      const modulePath = nodePtyPath(vaultRoot, this.pluginDir);
      ({ spawn } = require(modulePath) as typeof import("node-pty"));
    } catch (error) {
      this.failToStart(`Could not load node-pty: ${errorMessage(error)}`);
      return;
    }

    const spec = resolveLaunch(this.launch, { vaultRoot, processEnv: process.env });

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
        term.write(data);
        // The emulator does not answer device attribute queries; fish blocks
        // for ten seconds waiting on one, so answer on its behalf.
        const reply = this.deviceAttributes.respond(data);
        if (reply) proc.write(reply);
      }),
      proc.onExit(({ exitCode }) => this.handleExit(exitCode)),
    );

    this.deviceAttributes = new DeviceAttributeResponder();
    this.process = proc;
    term.focus();
  }
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
