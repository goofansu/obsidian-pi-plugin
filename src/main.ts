import {
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  type WorkspaceLeaf,
} from "obsidian";
import {
  DEFAULT_SETTINGS,
  MODELS,
  type ModelId,
  parseSettings,
  type Settings,
} from "./settings.js";
import { TERMINAL_VIEW_TYPE, TerminalView } from "./terminal-view.js";

export default class WTermPiPlugin extends Plugin {
  private views = new Set<TerminalView>();
  override settings: Settings = { ...DEFAULT_SETTINGS };

  override async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());

    this.registerView(TERMINAL_VIEW_TYPE, (leaf) => {
      // Anything built before the layout is ready came from the saved
      // workspace rather than from a command.
      const restored = !this.app.workspace.layoutReady;
      const view = new TerminalView(
        leaf,
        this.manifest.dir,
        () => this.settings,
        restored,
        (v: TerminalView) => this.views.delete(v),
      );
      this.views.add(view);
      return view;
    });

    this.addSettingTab(new WTermPiSettingTab(this));

    this.addCommand({
      id: "toggle-pi",
      name: "Show or hide Pi",
      callback: () => void this.togglePi(),
    });

    this.addCommand({
      id: "send-selection-to-pi",
      name: "Send selected text to Pi",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "." }],
      callback: () => void this.sendSelectionToPi(),
    });

    this.addCommand({
      id: "focus-pi",
      name: "Jump between your note and Pi",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "/" }],
      callback: () => void this.jumpBetweenNoteAndPi(),
    });
  }

  override onunload(): void {
    for (const view of [...this.views]) view.dispose();
    this.views.clear();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Opens Pi if it is closed, closes it if it is open. */
  private async togglePi(): Promise<void> {
    const existing = this.piLeaf();
    if (existing) {
      existing.detach();
      return;
    }
    await this.openPi();
  }

  /**
   * One key for both directions: bring Pi up and start typing to it, or, when
   * it already has the keyboard, hand the keyboard back to the note.
   */
  private async jumpBetweenNoteAndPi(): Promise<void> {
    const leaf = this.piLeaf();
    if (!leaf) {
      await this.openPi();
      return;
    }

    const { view } = leaf;
    if (view instanceof TerminalView && view.hasFocus()) {
      this.focusNote();
      return;
    }

    await this.app.workspace.revealLeaf(leaf);
    if (view instanceof TerminalView) view.focusTerminal();
  }

  /**
   * The selection is read from the last active editor rather than from whatever
   * has focus, so this works while the keyboard is already in Pi.
   */
  private async sendSelectionToPi(): Promise<void> {
    const selection =
      this.app.workspace.activeEditor?.editor?.getSelection() ?? "";
    if (selection.trim() === "") {
      new Notice("Select some text in a note first");
      return;
    }

    if (!this.piLeaf()) await this.openPi();
    const leaf = this.piLeaf();
    const view = leaf?.view;
    if (!(view instanceof TerminalView)) {
      new Notice("wterm Pi: could not reach Pi");
      return;
    }

    if (leaf) await this.app.workspace.revealLeaf(leaf);
    view.paste(selection);
    view.focusTerminal();
  }

  /** The note the user was last in, which is where the keyboard goes back to. */
  private focusNote(): void {
    const leaf = this.app.workspace.getMostRecentLeaf();
    if (leaf) this.app.workspace.setActiveLeaf(leaf, { focus: true });
  }

  private piLeaf(): WorkspaceLeaf | null {
    return this.app.workspace.getLeavesOfType(TERMINAL_VIEW_TYPE)[0] ?? null;
  }

  private async openPi(): Promise<void> {
    const leaf = this.rightSidebarLeaf();
    if (!leaf) {
      new Notice("wterm Pi: could not open a pane for Pi");
      return;
    }

    await leaf.setViewState({ type: TERMINAL_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);

    // After revealing, not before: revealing moves focus to the pane container.
    const { view } = leaf;
    if (view instanceof TerminalView) view.focusTerminal();
  }

  /** There is one Pi session, so a sidebar leaf is only ever created once. */
  private rightSidebarLeaf(): WorkspaceLeaf | null {
    return (
      this.app.workspace.getRightLeaf(true) ?? this.app.workspace.getLeaf("tab")
    );
  }
}

class WTermPiSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: WTermPiPlugin) {
    super(plugin.app, plugin);
  }

  override display(): void {
    this.containerEl.empty();

    new Setting(this.containerEl)
      .setName("DeepSeek API key")
      .setDesc(
        "Required. Stored in this plugin's data file inside the vault, and passed to Pi as an environment variable rather than on the command line.",
      )
      .addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "off";
        text
          .setPlaceholder("sk-…")
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(this.containerEl)
      .setName("Model")
      .setDesc(
        "Applies to sessions started from now on. Both models can be cycled inside a session.",
      )
      .addDropdown((dropdown) => {
        for (const model of MODELS) dropdown.addOption(model.id, model.name);
        dropdown
          .setValue(this.plugin.settings.model)
          .onChange(async (value) => {
            this.plugin.settings.model = value as ModelId;
            await this.plugin.saveSettings();
          });
      });
  }
}
