import { Notice, Plugin, PluginSettingTab, Setting, type WorkspaceLeaf } from "obsidian";
import { serializeLaunch, type Launch } from "./launch.js";
import {
  DEFAULT_SETTINGS,
  MODELS,
  parseSettings,
  type ModelId,
  type Settings,
} from "./settings.js";
import { TERMINAL_VIEW_TYPE, TerminalView } from "./terminal-view.js";

export default class WTermPiPlugin extends Plugin {
  private views = new Set<TerminalView>();
  override settings: Settings = { ...DEFAULT_SETTINGS };

  override async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());

    this.registerView(TERMINAL_VIEW_TYPE, (leaf) => {
      const view = new TerminalView(
        leaf,
        this.manifest.dir,
        () => this.settings,
        (v) => this.views.delete(v),
      );
      this.views.add(view);
      return view;
    });

    this.addSettingTab(new WTermPiSettingTab(this));

    this.addCommand({
      id: "open-terminal",
      name: "Open terminal",
      callback: () => void this.openLaunch({}),
    });

    this.addCommand({
      id: "open-pi-for-current-note",
      name: "Open Pi for current note",
      callback: () => {
        // Read before opening: focusing the new pane changes the active file.
        const notePath = this.app.workspace.getActiveFile()?.path;
        void this.openLaunch({ notePath });
      },
    });
  }

  override onunload(): void {
    for (const view of [...this.views]) view.dispose();
    this.views.clear();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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

  /** A fresh sidebar leaf, so several sessions coexist as tabs. */
  private rightSidebarLeaf(): WorkspaceLeaf | null {
    return this.app.workspace.getRightLeaf(true) ?? this.app.workspace.getLeaf("tab");
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
      .setDesc("Applies to sessions started from now on. Both models can be cycled inside a session.")
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
