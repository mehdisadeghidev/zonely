import { ACTIONS, type SettingsPayload } from "../shared/protocol.ts";
import { createMessenger } from "../shared/messaging.ts";
import type { RuleMode, Settings } from "../shared/settings.ts";

interface OptionsEnv {
  document: Document;
  chrome: typeof chrome;
}

const ERRORS: Record<string, string> = {
  "invalid-timezone": "Enter a valid timezone, for example America/New_York."
};

export function createOptions({ document: doc, chrome: api }: OptionsEnv = { document, chrome }) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => doc.getElementById(id) as T;
  const send = createMessenger(api);

  function showError(error: Error | null | undefined): void {
    $("status-message").textContent = (error?.message && ERRORS[error.message]) || error?.message || "Operation failed.";
  }

  async function runAction(button: HTMLButtonElement, action: () => Promise<void>): Promise<void> {
    button.disabled = true;
    $("status-message").textContent = "";
    try {
      await action();
      $("status-message").textContent = "Saved. Reload affected pages to apply.";
    } catch (error) {
      showError(error as Error);
    } finally {
      button.disabled = false;
    }
  }

  function onAction(id: string, action: () => Promise<void>): void {
    const button = $<HTMLButtonElement>(id);
    button.addEventListener("click", () => runAction(button, action));
  }

  function createListItem(text: string, onDelete: () => Promise<void>): HTMLLIElement {
    const li = doc.createElement("li");
    const label = doc.createElement("span");
    label.textContent = text;
    const button = doc.createElement("button");
    button.textContent = "Delete";
    button.className = "del-btn";
    button.addEventListener("click", () => runAction(button, onDelete));
    li.append(label, button);
    return li;
  }

  async function loadSettings(): Promise<Settings | null> {
    const payload = await send<SettingsPayload>({ action: ACTIONS.getSettings });
    return payload?.settings || null;
  }

  async function saveSettings(settings: Settings): Promise<void> {
    await send({ action: ACTIONS.updateSettings, settings });
  }

  async function render(): Promise<void> {
    const settings = await loadSettings();
    if (!settings) return;

    const excludeList = $("exclude-list");
    const whitelistList = $("whitelist-list");
    const rulesList = $("rules-list");
    excludeList.replaceChildren();
    whitelistList.replaceChildren();
    rulesList.replaceChildren();

    for (const pattern of settings.excludedDomains) {
      excludeList.append(
        createListItem(pattern, async () => {
          settings.excludedDomains = settings.excludedDomains.filter((entry) => entry !== pattern);
          await saveSettings(settings);
          await render();
        })
      );
    }

    for (const pattern of settings.whitelistDomains) {
      whitelistList.append(
        createListItem(pattern, async () => {
          settings.whitelistDomains = settings.whitelistDomains.filter((entry) => entry !== pattern);
          await saveSettings(settings);
          await render();
        })
      );
    }

    for (const [pattern, rule] of Object.entries(settings.siteRules)) {
      const text = `${pattern} -> ${rule.mode}${rule.timezone ? ` (${rule.timezone})` : ""}`;
      rulesList.append(
        createListItem(text, async () => {
          delete settings.siteRules[pattern];
          await saveSettings(settings);
          await render();
        })
      );
    }
  }

  function addPattern(inputId: string, list: "excludedDomains" | "whitelistDomains"): () => Promise<void> {
    return async () => {
      const input = $<HTMLInputElement>(inputId);
      const value = input.value.trim().toLowerCase();
      if (!value) return;
      const settings = await loadSettings();
      if (!settings) return;
      if (!settings[list].includes(value)) settings[list].push(value);
      await saveSettings(settings);
      input.value = "";
      await render();
    };
  }

  function start(): void {
    onAction("add-exclude-btn", addPattern("exclude-input", "excludedDomains"));
    onAction("add-whitelist-btn", addPattern("whitelist-input", "whitelistDomains"));
    onAction("add-rule-btn", async () => {
      const pattern = $<HTMLInputElement>("rule-pattern").value.trim().toLowerCase();
      const mode = $<HTMLSelectElement>("rule-mode").value as RuleMode;
      const timezone = $<HTMLInputElement>("rule-timezone").value.trim();
      if (!pattern) return;

      const settings = await loadSettings();
      if (!settings) return;
      settings.siteRules[pattern] = { mode, timezone: mode === "fixed" ? timezone : "" };

      await saveSettings(settings);
      $<HTMLInputElement>("rule-pattern").value = "";
      $<HTMLInputElement>("rule-timezone").value = "";
      await render();
    });

    render().catch(showError);
  }

  return { start };
}

if (globalThis.document && globalThis.chrome) {
  createOptions().start();
}
