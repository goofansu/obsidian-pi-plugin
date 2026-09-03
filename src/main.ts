import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";
import { serializeLaunch, type Launch } from "./launch.js";
import { TERMINAL_VIEW_TYPE, TerminalView } from "./terminal-view.js";

export default class WTermPiPlugin extends Plugin {
  private views = new Set<TerminalView>();

  override async onload(): Promise<void> {
    this.registerView(TERMINAL_VIEW_TYPE, (leaf) => {
      const view = new TerminalView(leaf, this.manifest.dir, (v) =>
        this.views.delete(v),
      );
      this.views.add(view);
      return view;
    });

    this.addCommand({
      id: "open-terminal",
      name: "Open terminal",
      callback: () => void this.openLaunch({ kind: "shell" }),
    });

    this.addCommand({
      id: "open-pi-for-current-note",
      name: "Open Pi for current note",
      callback: () => {
        // Read before opening: focusing the new pane changes the active file.
        const notePath = this.app.workspace.getActiveFile()?.path;
        void this.openLaunch({ kind: "pi", notePath });
      },
    });
  }

  override onunload(): void {
    for (const view of [...this.views]) view.dispose();
    this.views.clear();
  }

  private async openLaunch(launch: Launch): Promise<void> {
    const leaf = this.rightSidebarLeaf();
    if (!leaf) {
      new Notice("wterm Pi: could not open a terminal pane");
      return;
    }

    // autostart rides in the view state because Obsidian delivers that
    // reliably; getState() omits it, so it is never persisted.
    await leaf.setViewState({
      type: TERMINAL_VIEW_TYPE,
      active: true,
      state: { ...serializeLaunch(launch), autostart: true },
    });
    await this.app.workspace.revealLeaf(leaf);

    // After revealing, not before: revealing moves focus to the pane container.
    const { view } = leaf;
    if (view instanceof TerminalView) view.focusTerminal();
  }

  /** A fresh sidebar leaf, so a shell pane and a Pi pane coexist as tabs. */
  private rightSidebarLeaf(): WorkspaceLeaf | null {
    return this.app.workspace.getRightLeaf(true) ?? this.app.workspace.getLeaf("tab");
  }
}
