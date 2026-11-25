import { isValidTimezone, resolveHostnameBehavior, type Behavior, type SiteRule } from "../shared/settings.ts";
import type { PageConfig, TabStatus } from "../shared/protocol.ts";
import type { SettingsStore } from "./settings-store.ts";
import type { TabEntry, TabStateStore } from "./tab-state.ts";
import { SYSTEM_TIMEZONE, type RuntimeService } from "./timezone.ts";

export interface PageConfigDeps {
  settings: SettingsStore;
  tabState: TabStateStore;
  runtime: RuntimeService;
}

export function getHostname(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    if (parsed.hostname === "chromewebstore.google.com") return "";
    if (parsed.hostname === "chrome.google.com" && /^\/webstore(?:\/|$)/.test(parsed.pathname)) return "";
    return parsed.hostname;
  } catch {
    return "";
  }
}

function pickModeTimezone(entry: TabEntry | undefined, behavior: Behavior, runtimeTimezone: string): { mode: PageConfig["mode"]; timezone: string } {
  const mode = entry?.tabOverride?.mode || behavior.mode;
  if (mode === "disable") return { mode: "disable", timezone: "" };
  if (mode === "fixed") {
    const fixedTimezone = entry?.tabOverride ? entry.tabOverride.timezone : behavior.timezone || "";
    return { mode: "fixed", timezone: fixedTimezone };
  }

  const lockedTimezone = isValidTimezone(entry?.lockedTimezone) ? entry.lockedTimezone : runtimeTimezone || SYSTEM_TIMEZONE;
  return { mode: "auto", timezone: lockedTimezone };
}

export function createPageConfigService({ settings: settingsStore, tabState, runtime }: PageConfigDeps) {
  async function getPageConfig(tabId: number, hostname: string): Promise<PageConfig> {
    const [settings, initialRuntime, state] = await Promise.all([settingsStore.get(), runtime.getRuntimeState(), tabState.get()]);
    let currentRuntime = initialRuntime;
    const behavior = resolveHostnameBehavior(hostname, settings);
    let entry = state[tabId] || {};

    if (behavior.mode === "disable" && !entry.tabOverride) {
      return { shouldSpoof: false, mode: "disable", timezone: SYSTEM_TIMEZONE, source: behavior.source };
    }

    const mode = entry.tabOverride?.mode || behavior.mode;
    if (mode === "auto" && !isValidTimezone(entry.lockedTimezone) && !isValidTimezone(currentRuntime.timezone)) {
      await runtime.updateTimezone();
      currentRuntime = await runtime.getRuntimeState();
      entry = (await tabState.get())[tabId] || {};
    }
    const runtimeTimezone = isValidTimezone(currentRuntime.timezone) ? currentRuntime.timezone : "";
    let selection = pickModeTimezone(entry, behavior, runtimeTimezone);
    if (selection.mode === "auto" && (isValidTimezone(entry.lockedTimezone) || runtimeTimezone)) {
      await tabState.mutate((nextState) => {
        entry = nextState[tabId] || {};
        selection = pickModeTimezone(entry, behavior, runtimeTimezone);
        if (selection.mode !== "auto" || isValidTimezone(entry.lockedTimezone)) return false;
        nextState[tabId] = { ...entry, lockedTimezone: selection.timezone };
      });
    }
    if (selection.mode === "fixed" && !isValidTimezone(selection.timezone)) {
      return {
        shouldSpoof: false,
        mode: "disable",
        timezone: SYSTEM_TIMEZONE,
        source: entry.tabOverride ? "tabOverride" : behavior.source,
        error: "invalid-timezone"
      };
    }

    return {
      shouldSpoof: selection.mode !== "disable",
      mode: selection.mode,
      timezone: selection.timezone || SYSTEM_TIMEZONE,
      source: entry?.tabOverride ? "tabOverride" : behavior.source,
      matchedPattern: behavior.pattern || ""
    };
  }

  async function getTabStatus(tab: chrome.tabs.Tab | undefined): Promise<TabStatus> {
    const tabId = tab?.id;
    const hostname = getHostname(tab?.url || "");
    if (tabId === undefined || !hostname) {
      return {
        tabId: tabId ?? null,
        supported: false,
        hostname: "",
        mode: "disable",
        timezone: "",
        shouldSpoof: false,
        source: "unsupported",
        siteRule: null,
        tabOverride: null
      };
    }
    const [config, settings, state] = await Promise.all([getPageConfig(tabId, hostname), settingsStore.get(), tabState.get()]);
    const siteRule: SiteRule | null = settings.siteRules[hostname] || null;
    return {
      tabId,
      supported: true,
      hostname,
      ...config,
      siteRule,
      tabOverride: state[tabId]?.tabOverride || null
    };
  }

  return { getPageConfig, getTabStatus };
}
