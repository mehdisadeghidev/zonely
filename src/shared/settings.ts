export type RuleMode = "auto" | "fixed" | "disable";

export interface SiteRule {
  mode: RuleMode;
  timezone: string;
}

export interface Settings {
  defaultMode: RuleMode;
  defaultTimezone: string;
  siteRules: Record<string, SiteRule>;
}

export interface Behavior {
  mode: RuleMode;
  source: "siteRule" | "default";
  timezone?: string;
  pattern?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultMode: "auto",
  defaultTimezone: "",
  siteRules: {}
};

function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function patternToRegex(pattern: string): RegExp | null {
  const trimmed = String(pattern || "").trim().toLowerCase();
  if (!trimmed) return null;
  return new RegExp("^" + trimmed.split("*").map(escapeRegex).join(".*") + "$", "i");
}

export function matchesPattern(hostname: string, pattern: string): boolean {
  const host = String(hostname || "").trim().toLowerCase();
  const normalizedPattern = String(pattern || "").trim().toLowerCase();
  if (!host || !normalizedPattern) return false;
  if (normalizedPattern === host) return true;
  const regex = patternToRegex(normalizedPattern);
  return !!regex && regex.test(host);
}

export function findBestRule(hostname: string, siteRules: Record<string, SiteRule>): { pattern: string | null; rule: SiteRule | null } {
  let bestRule: SiteRule | null = null;
  let bestPattern: string | null = null;
  let bestScore = -1;
  for (const [pattern, rule] of Object.entries(siteRules || {})) {
    if (!matchesPattern(hostname, pattern)) continue;
    const score = pattern.replace(/\*/g, "").length;
    if (score > bestScore) {
      bestScore = score;
      bestPattern = pattern;
      bestRule = rule;
    }
  }
  return { pattern: bestPattern, rule: bestRule };
}

export function resolveHostnameBehavior(hostname: string, settings: Partial<Settings> | null | undefined): Behavior {
  const safe: Settings = {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    siteRules: settings?.siteRules && typeof settings.siteRules === "object" ? settings.siteRules : {}
  };

  const { pattern, rule } = findBestRule(hostname, safe.siteRules);
  if (rule && typeof rule === "object") {
    return { mode: rule.mode || "auto", timezone: rule.timezone || "", source: "siteRule", pattern: pattern ?? undefined };
  }

  return { mode: safe.defaultMode || "auto", timezone: safe.defaultTimezone || "", source: "default" };
}

export function sanitizeSettings(raw: unknown): Settings {
  const input = (raw && typeof raw === "object" ? raw : {}) as Partial<Settings> & { defaultTimezone?: unknown };
  const requestedMode = input.defaultMode;
  const mode: RuleMode = requestedMode === "disable" || requestedMode === "fixed" ? requestedMode : "auto";
  // Legacy storage can hold a fixed default without a usable zone; fall back to auto.
  const defaultTimezone = String(input.defaultTimezone ?? "").trim();
  const fixedDefault = mode === "fixed" && isValidTimezone(defaultTimezone);
  const safe: Settings = {
    defaultMode: fixedDefault ? "fixed" : mode === "fixed" ? "auto" : mode,
    defaultTimezone: fixedDefault ? defaultTimezone : "",
    siteRules: {}
  };

  if (input.siteRules && typeof input.siteRules === "object") {
    for (const [pattern, rule] of Object.entries(input.siteRules)) {
      const normalizedPattern = String(pattern || "").trim();
      if (!normalizedPattern || !rule || typeof rule !== "object") continue;
      const mode = rule.mode === "disable" || rule.mode === "fixed" ? rule.mode : "auto";
      safe.siteRules[normalizedPattern] = {
        mode,
        timezone: mode === "fixed" ? String(rule.timezone || "").trim() : ""
      };
    }
  }

  return safe;
}

export function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
