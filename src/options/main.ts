import { ACTIONS, type SettingsPayload } from "../shared/protocol.ts";
import { createMessenger } from "../shared/messaging.ts";
import { fillTimezoneSelect } from "../shared/timezones.ts";
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

    const rulesList = $("rules-list");
    rulesList.replaceChildren();
    renderDefault(settings);

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

  function renderDefault(settings: Settings): void {
    $<HTMLSelectElement>("default-mode").value = settings.defaultMode;
    fillTimezoneSelect(doc, $<HTMLSelectElement>("default-timezone"), settings.defaultTimezone);
    toggleDefaultTimezone();
  }

  function toggleDefaultTimezone(): void {
    const fixed = $<HTMLSelectElement>("default-mode").value === "fixed";
    $<HTMLSelectElement>("default-timezone").hidden = !fixed;
    $("default-timezone-label").hidden = !fixed;
  }

  async function saveDefault(): Promise<void> {
    const settings = await loadSettings();
    if (!settings) return;
    const mode = $<HTMLSelectElement>("default-mode").value as RuleMode;
    settings.defaultMode = mode;
    settings.defaultTimezone = mode === "fixed" ? $<HTMLSelectElement>("default-timezone").value : "";
    await saveSettings(settings);
    $("status-message").textContent = "Saved. Reload affected pages to apply.";
  }

  function splitPatterns(value: string): string[] {
    const patterns = value.split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean);
    return [...new Set(patterns)];
  }

  function start(): void {
    $<HTMLSelectElement>("default-mode").addEventListener("change", () => {
      toggleDefaultTimezone();
      saveDefault().catch((error) => showError(error as Error));
    });
    $<HTMLSelectElement>("default-timezone").addEventListener("change", () => {
      saveDefault().catch((error) => showError(error as Error));
    });
    fillTimezoneSelect(doc, $<HTMLSelectElement>("rule-timezone"));
    onAction("add-rule-btn", async () => {
      const patterns = splitPatterns($<HTMLInputElement>("rule-pattern").value);
      const mode = $<HTMLSelectElement>("rule-mode").value as RuleMode;
      const timezone = $<HTMLSelectElement>("rule-timezone").value;
      if (!patterns.length) return;

      const settings = await loadSettings();
      if (!settings) return;
      for (const pattern of patterns) settings.siteRules[pattern] = { mode, timezone: mode === "fixed" ? timezone : "" };

      await saveSettings(settings);
      $<HTMLInputElement>("rule-pattern").value = "";
      $<HTMLSelectElement>("rule-timezone").value = "";
      await render();
    });

    render().catch(showError);
  }

  return { start };
}

if (globalThis.document && globalThis.chrome) {
  createOptions().start();
}
