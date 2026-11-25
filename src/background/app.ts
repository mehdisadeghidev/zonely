import { ACTIONS, isAction, type Message, type PageConfig, type SettingsPayload, type TabStatus } from "../shared/protocol.ts";
import { isValidTimezone, matchesPattern, resolveHostnameBehavior, sanitizeSettings, findBestRule, DEFAULT_SETTINGS } from "../shared/settings.ts";
import type { ChromeApi } from "./chrome.ts";
import { createPageConfigService, getHostname } from "./page-config.ts";
import { createSettingsStore } from "./settings-store.ts";
import { createTabStateStore } from "./tab-state.ts";
import { createRuntimeService, SYSTEM_TIMEZONE, type RuntimeServiceOptions } from "./timezone.ts";
import type { Settings } from "../shared/settings.ts";

function invalidFixedRule(rule: { mode?: string; timezone?: unknown } | null | undefined): boolean {
  return rule?.mode === "fixed" && !isValidTimezone(String(rule.timezone || "").trim());
}

function normalizeMode(mode: unknown): "auto" | "fixed" | "disable" {
  return mode === "disable" || mode === "fixed" ? mode : "auto";
}

function reportFailure(error: unknown): void {
  console.warn("[Zonely] Operation failed:", (error as Error)?.message || error);
}

export function createBackground(api: ChromeApi, options: RuntimeServiceOptions = {}) {
  const settingsStore = createSettingsStore(api);
  const tabState = createTabStateStore(api);
  const runtime = createRuntimeService(api, options);
  const pages = createPageConfigService({ settings: settingsStore, tabState, runtime });

  async function initialize(): Promise<void> {
    api.alarms.create("check-ip-periodic", { periodInMinutes: 5 });
    await settingsStore.get();
    await runtime.updateTimezone(true);
  }

  async function refresh(): Promise<{ success: boolean }> {
    return { success: await runtime.updateTimezone(true) };
  }

  async function pageConfigForSender(msg: Message & { hostname?: string }, sender: chrome.runtime.MessageSender): Promise<PageConfig> {
    const tabId = sender?.tab?.id;
    const hostname = String(msg.hostname || "").trim().toLowerCase();
    if (tabId === undefined || !Number.isInteger(tabId) || tabId < 0 || !hostname) {
      return { shouldSpoof: false, mode: "disable", timezone: SYSTEM_TIMEZONE, source: "invalid" };
    }
    return pages.getPageConfig(tabId, hostname);
  }

  async function readSettings(): Promise<SettingsPayload> {
    const [settings, currentRuntime] = await Promise.all([settingsStore.get(), runtime.getRuntimeState()]);
    return { settings, runtime: currentRuntime, systemTimezone: SYSTEM_TIMEZONE };
  }

  async function updateSettings(next: Partial<Settings>): Promise<{ ok: boolean; error?: string; settings?: Settings }> {
    if (next?.defaultMode === "fixed" && !isValidTimezone(String(next.defaultTimezone || "").trim())) return { ok: false, error: "invalid-timezone" };
    if (Object.values(next?.siteRules || {}).some(invalidFixedRule)) return { ok: false, error: "invalid-timezone" };
    return { ok: true, settings: await settingsStore.mutate(() => sanitizeSettings(next || {})) };
  }

  async function addExcludedSite(hostname: string): Promise<{ ok: boolean; error?: string; settings?: Settings }> {
    const pattern = String(hostname || "").trim().toLowerCase();
    if (!pattern) return { ok: false, error: "empty-pattern" };
    const settings = await settingsStore.mutate((current) => {
      if (!current.excludedDomains.includes(pattern)) current.excludedDomains.push(pattern);
      return current;
    });
    return { ok: true, settings };
  }

  async function setSiteRule(pattern: string, rule: { mode?: string; timezone?: unknown } | null | undefined): Promise<{ ok: boolean; error?: string; settings?: Settings }> {
    const normalized = String(pattern || "").trim().toLowerCase();
    const nextRule = rule || {};
    if (!normalized) return { ok: false, error: "empty-pattern" };
    if (invalidFixedRule(nextRule)) return { ok: false, error: "invalid-timezone" };
    const settings = await settingsStore.mutate((current) => {
      if (nextRule.mode === "inherit") delete current.siteRules[normalized];
      else
        current.siteRules[normalized] = {
          mode: normalizeMode(nextRule.mode),
          timezone: nextRule.mode === "fixed" ? String(nextRule.timezone || "").trim() : ""
        };
      return current;
    });
    return { ok: true, settings };
  }

  async function setTabRule(msg: { mode?: string; timezone?: unknown; tabId?: number }, sender: chrome.runtime.MessageSender): Promise<{ ok: boolean; error?: string }> {
    const tabId = Number(msg.tabId ?? sender?.tab?.id);
    if (!Number.isInteger(tabId) || tabId < 0) return { ok: false, error: "invalid-tab" };
    let tab: chrome.tabs.Tab;
    try {
      tab = await api.tabs.get(tabId);
    } catch {
      return { ok: false, error: "invalid-tab" };
    }
    if (!getHostname(tab.url || "")) return { ok: false, error: "unsupported-tab" };
    if (invalidFixedRule(msg)) return { ok: false, error: "invalid-timezone" };
    await tabState.mutate((state) => {
      const entry = { ...state[tabId] };
      if (msg.mode === "inherit") delete entry.tabOverride;
      else
        entry.tabOverride = {
          mode: normalizeMode(msg.mode),
          timezone: msg.mode === "fixed" ? String(msg.timezone || "").trim() : ""
        };
      state[tabId] = entry;
    });
    return { ok: true };
  }

  async function getTabStatus(): Promise<TabStatus> {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    return pages.getTabStatus(tab);
  }

  async function handleMessage(msg: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
    switch (msg.action) {
      case ACTIONS.refresh:
        return refresh();
      case ACTIONS.getPageConfig:
        return pageConfigForSender(msg, sender);
      case ACTIONS.getSettings:
        return readSettings();
      case ACTIONS.updateSettings:
        return updateSettings(msg.settings);
      case ACTIONS.addExcludedSite:
        return addExcludedSite(msg.hostname);
      case ACTIONS.setSiteRule:
        return setSiteRule(msg.pattern, msg.rule);
      case ACTIONS.setTabRule:
        return setTabRule(msg, sender);
      case ACTIONS.getTabStatus:
        return getTabStatus();
    }
  }

  api.runtime.onInstalled.addListener(() => {
    initialize().catch(reportFailure);
  });
  api.runtime.onStartup.addListener(() => {
    initialize().catch(reportFailure);
  });
  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "check-ip-periodic") runtime.updateTimezone().catch(reportFailure);
  });
  api.webNavigation.onBeforeNavigate.addListener((details) => {
    if (details.frameId === 0) runtime.updateTimezone().catch(reportFailure);
  });
  api.tabs.onRemoved.addListener((tabId) => {
    tabState.clear(tabId).catch(reportFailure);
  });

  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!isAction((msg as Message | undefined)?.action)) return false;
    handleMessage(msg as Message, sender).then(sendResponse, (error) => {
      reportFailure(error);
      sendResponse({ ok: false, error: "storage-error" });
    });
    return true;
  });

  // Exposed for tests and future in-worker callers.
  return {
    handleMessage,
    initialize,
    getPageConfig: pages.getPageConfig,
    getTabStatus: pages.getTabStatus,
    getHostname,
    getTabState: tabState.get,
    clearTabState: tabState.clear,
    updateTimezone: runtime.updateTimezone,
    getSettings: settingsStore.get,
    shared: { DEFAULT_SETTINGS, matchesPattern, findBestRule, resolveHostnameBehavior, sanitizeSettings, isValidTimezone, SYSTEM_TIMEZONE }
  };
}
