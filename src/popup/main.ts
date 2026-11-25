import { ACTIONS, type RuleChoice, type SettingsPayload, type TabStatus } from "../shared/protocol.ts";
import { createMessenger } from "../shared/messaging.ts";

interface PopupEnv {
  document: Document;
  chrome: typeof chrome;
}

const MODE_LABELS: Record<string, string> = { auto: "Auto by IP", fixed: "Fixed timezone", disable: "Do not spoof" };
const SOURCE_LABELS: Record<string, string> = {
  tabOverride: "Tab override",
  siteRule: "Site rule",
  excluded: "Excluded site",
  whitelist: "Outside whitelist",
  default: "Default policy"
};
const ERRORS: Record<string, string> = {
  "invalid-timezone": "Enter a valid timezone, for example America/New_York.",
  "unsupported-tab": "Timezone spoofing is not available on this page.",
  "invalid-tab": "This tab is no longer available. Reopen the popup."
};

export function createPopup({ document: doc, chrome: api }: PopupEnv = { document, chrome }) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => doc.getElementById(id) as T;
  const send = createMessenger(api);

  let currentHost = "";
  let currentTabId: number | null = null;
  let pageStatus: TabStatus | null = null;
  let currentScope: "site" | "tab" = "site";
  let editorBusy = false;
  let drafts: Record<"site" | "tab", { mode: RuleChoice; timezone: string }> = {
    site: { mode: "inherit", timezone: "" },
    tab: { mode: "inherit", timezone: "" }
  };

  function canEditRules(): boolean {
    return pageStatus?.supported === true && Number.isInteger(currentTabId) && !!currentHost;
  }

  function updateEditorAvailability(): void {
    for (const id of ["rule-scope", "rule-mode", "rule-timezone", "apply-rule-btn"]) {
      $<HTMLInputElement>(id).disabled = editorBusy || !canEditRules();
    }
  }

  function readRuleForm(): { mode: RuleChoice; timezone: string } {
    return { mode: $<HTMLSelectElement>("rule-mode").value as RuleChoice, timezone: $<HTMLInputElement>("rule-timezone").value };
  }

  function toggleTimezoneInput(): void {
    const hidden = $<HTMLSelectElement>("rule-mode").value !== "fixed";
    $<HTMLInputElement>("rule-timezone").hidden = hidden;
    $("timezone-label").hidden = hidden;
  }

  function renderRuleEditor(): void {
    const rule = drafts[currentScope];
    $<HTMLSelectElement>("rule-scope").value = currentScope;
    $<HTMLSelectElement>("rule-mode").value = rule.mode;
    $<HTMLInputElement>("rule-timezone").value = rule.timezone;
    let hint =
      currentScope === "tab"
        ? "Temporary: applies only to this tab. Inherited policy removes its override."
        : "Saved for this exact hostname. Other open tabs need their own reload.";
    if (currentScope === "site") {
      if (pageStatus?.tabOverride) hint += " A tab override currently takes priority over site rules.";
      else if (pageStatus?.source === "excluded") hint += " An exclusion takes priority; manage it in All rules and exclusions.";
      else if (pageStatus?.source === "whitelist") hint += " This site is outside the whitelist; manage it in All rules and exclusions.";
    }
    $("scope-hint").textContent = canEditRules() ? hint : "Open an HTTP or HTTPS web page to edit its rule.";
    toggleTimezoneInput();
    updateEditorAvailability();
  }

  async function updateUI({ preserveDrafts = false, savedScope = null as "site" | "tab" | null } = {}): Promise<void> {
    const [settingsPayload, status] = await Promise.all([
      send<SettingsPayload>({ action: ACTIONS.getSettings }),
      send<TabStatus>({ action: ACTIONS.getTabStatus })
    ]);
    const samePage = currentTabId === status.tabId && currentHost === status.hostname;
    const savedRules: typeof drafts = {
      site: { mode: status.siteRule?.mode || "inherit", timezone: status.siteRule?.timezone || "" },
      tab: { mode: status.tabOverride?.mode || "inherit", timezone: status.tabOverride?.timezone || "" }
    };
    if (samePage && (preserveDrafts || savedScope)) {
      drafts[currentScope] = readRuleForm();
      if (savedScope) drafts[savedScope] = savedRules[savedScope];
    } else {
      drafts = savedRules;
    }
    if (!samePage) currentScope = status.tabOverride ? "tab" : "site";
    currentTabId = status.tabId ?? null;
    currentHost = status.hostname || "";
    pageStatus = status;

    const runtime = settingsPayload.runtime || {};
    $("timezone").textContent = runtime.timezone || "Unknown";
    $("location").textContent = runtime.city && runtime.country ? `${runtime.city}, ${runtime.country}` : "Unknown";
    $("ip").textContent = runtime.ip || "Unknown";
    $("last-update").textContent = runtime.lastUpdate ? new Date(runtime.lastUpdate).toLocaleTimeString() : "--";

    const supported = canEditRules();
    $("current-host").textContent = supported ? currentHost : "Not a supported web page";
    $("current-mode").textContent = supported ? MODE_LABELS[status.mode] || status.mode : "Not available";
    $("effective-timezone").textContent = supported ? status.timezone || "Unknown" : "Not available";
    $("rule-source").textContent = supported ? SOURCE_LABELS[status.source] || status.source : "Not applicable";
    $("page-message").hidden = supported;
    $("page-message").textContent = supported ? "" : "Timezone spoofing is not available on this page.";
    renderRuleEditor();
    if (status.error) throw new Error(status.error);
  }

  function showError(error: Error | null | undefined): void {
    $("status-message").textContent = (error?.message && ERRORS[error.message]) || error?.message || "Operation failed.";
    if (!pageStatus) {
      $("page-message").textContent = "Unable to read the current page. Try Refresh or reopen the popup.";
      $("effective-timezone").textContent = "Not available";
    }
  }

  function onAction(id: string, action: () => unknown | Promise<unknown>): void {
    const button = $<HTMLButtonElement>(id);
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      $("status-message").textContent = "";
      try {
        await action();
      } catch (error) {
        showError(error as Error);
      } finally {
        button.disabled = false;
        updateEditorAvailability();
      }
    });
  }

  function start(): void {
    $<HTMLSelectElement>("rule-mode").addEventListener("change", toggleTimezoneInput);
    $<HTMLSelectElement>("rule-scope").addEventListener("change", () => {
      drafts[currentScope] = readRuleForm();
      currentScope = $<HTMLSelectElement>("rule-scope").value === "tab" ? "tab" : "site";
      renderRuleEditor();
    });

    onAction("apply-rule-btn", async () => {
      if (!canEditRules() || editorBusy) return;
      const tabId = currentTabId as number;
      const hostname = currentHost;
      const scope = currentScope;
      const rule = readRuleForm();
      const timezone = rule.timezone.trim();
      editorBusy = true;
      updateEditorAvailability();
      try {
        await send(
          scope === "tab"
            ? { action: ACTIONS.setTabRule, tabId, mode: rule.mode, timezone }
            : { action: ACTIONS.setSiteRule, pattern: hostname, rule: { mode: rule.mode, timezone } }
        );
        await api.tabs.reload(tabId);
        await updateUI({ savedScope: scope });
        $("status-message").textContent =
          scope === "tab" ? "Saved for this tab. Page reloaded." : "Saved for this site. Page reloaded; other open tabs need a reload.";
      } finally {
        editorBusy = false;
      }
    });

    onAction("refresh-btn", async () => {
      const result = await send<{ success: boolean }>({ action: ACTIONS.refresh });
      if (!result.success) throw new Error("IP lookup failed. Last known data has been kept.");
      await updateUI({ preserveDrafts: true });
    });
    onAction("open-options-btn", () => api.runtime.openOptionsPage());

    renderRuleEditor();
    updateUI().catch(showError);
  }

  return { start };
}

if (globalThis.document && globalThis.chrome) {
  createPopup().start();
}
