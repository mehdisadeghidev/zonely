import type { RuleMode, Settings, SiteRule } from "./settings.ts";

export const ACTIONS = {
  refresh: "refresh",
  getPageConfig: "tzc:get-page-config",
  getSettings: "tzc:get-settings",
  updateSettings: "tzc:update-settings",
  setSiteRule: "tzc:set-site-rule",
  setTabRule: "tzc:set-tab-rule",
  getTabStatus: "tzc:get-tab-status"
} as const;

export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];

export type RuleChoice = RuleMode | "inherit";

export interface RuntimeState {
  timezone?: string;
  ip?: string;
  country?: string;
  city?: string;
  lastUpdate?: number;
}

export interface PageConfig {
  shouldSpoof: boolean;
  mode: RuleMode;
  timezone: string;
  source: string;
  matchedPattern?: string;
  error?: string;
}

export interface TabStatus extends PageConfig {
  tabId: number | null;
  supported: boolean;
  hostname: string;
  siteRule: SiteRule | null;
  tabOverride: SiteRule | null;
}

export interface SettingsPayload {
  settings: Settings;
  runtime: RuntimeState;
  systemTimezone: string;
}

export type Message =
  | { action: typeof ACTIONS.refresh }
  | { action: typeof ACTIONS.getPageConfig; hostname: string }
  | { action: typeof ACTIONS.getSettings }
  | { action: typeof ACTIONS.updateSettings; settings: Partial<Settings> }
  | { action: typeof ACTIONS.setSiteRule; pattern: string; rule: { mode: RuleChoice; timezone?: string } }
  | { action: typeof ACTIONS.setTabRule; tabId?: number; mode: RuleChoice; timezone?: string }
  | { action: typeof ACTIONS.getTabStatus };

export type Response<T = unknown> = { ok: false; error: string } | ({ ok: true } & T);

const MESSAGE_ACTIONS: ReadonlySet<string> = new Set(Object.values(ACTIONS));

export function isAction(action: unknown): action is Action {
  return typeof action === "string" && MESSAGE_ACTIONS.has(action);
}
