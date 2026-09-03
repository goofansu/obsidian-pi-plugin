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

export default class PiPlugin extends Plugin {
  private views = new Set<TerminalView>();
  override settings: Settings = { ...DEFAULT_SETTINGS };

  override async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());

    this.registerView(TERMINAL_VIEW_TYPE, (leaf) => {
      const view = new TerminalView(
        leaf,
        this.manifest.dir,
        () => this.settings,
        (v: TerminalView) => this.views.delete(v),
      );
      this.views.add(view);
      return view;
    });

    this.addSettingTab(new PiSettingTab(this));

    // Pi keeps a tab in the right sidebar, the way the built-in panes do, so
    // there is always somewhere to click. The pane is created without being
    // revealed or activated, so nothing starts until it is asked for.
    this.app.workspace.onLayoutReady(() => void this.ensurePane());

    this.addCommand({
      id: "toggle-focus",
      name: "Toggle focus",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "/" }],
      callback: () => void this.toggleFocus(),
    });

    this.addCommand({
      id: "add-selection-to-thread",
      name: "Add selection to thread",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "." }],
      callback: () => void this.addSelectionToThread(),
    });
  }

  override onunload(): void {
    for (const view of [...this.views]) view.dispose();
    this.views.clear();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * One key for both directions: bring Pi up and start typing to it, or, when
   * it already has the keyboard, hand the keyboard back to the note. Opens Pi
   * first if it is not running.
   */
  private async toggleFocus(): Promise<void> {
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
  private async addSelectionToThread(): Promise<void> {
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
      new Notice("Pi: could not reach Pi");
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

  /** Puts a pane in the sidebar if there is not one, without starting it. */
  private async ensurePane(): Promise<void> {
    if (this.piLeaf()) return;
    const leaf = this.app.workspace.getRightLeaf(false);
    await leaf?.setViewState({ type: TERMINAL_VIEW_TYPE });
  }

  private async openPi(): Promise<void> {
    const leaf = this.rightSidebarLeaf();
    if (!leaf) {
      new Notice("Pi: could not open a pane for Pi");
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

class PiSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: PiPlugin) {
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
