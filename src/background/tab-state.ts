import type { SiteRule } from "../shared/settings.ts";
import type { ChromeApi } from "./chrome.ts";

export const TAB_STATE_KEY = "tabStateV1";

export interface TabEntry {
  tabOverride?: SiteRule;
  lockedTimezone?: string;
}

export type TabState = Record<string, TabEntry>;

export interface TabStateStore {
  get(): Promise<TabState>;
  mutate(change: (state: TabState) => void | false): Promise<void>;
  clear(tabId: number): Promise<void>;
}

export function createTabStateStore(api: ChromeApi): TabStateStore {
  let cache: TabState | null = null;
  let load: Promise<TabState> | null = null;
  let mutations: Promise<void> = Promise.resolve();

  async function get(): Promise<TabState> {
    if (cache) return cache;
    if (!load) {
      load = api.storage.session
        .get(TAB_STATE_KEY)
        .then((fromSession) => {
          const stored = fromSession[TAB_STATE_KEY];
          cache = stored && typeof stored === "object" ? (stored as TabState) : {};
          return cache;
        })
        .finally(() => {
          load = null;
        });
    }
    return load;
  }

  function mutate(change: (state: TabState) => void | false): Promise<void> {
    const mutation: Promise<void> = mutations
      .catch(() => {})
      .then(async () => {
        const state = await get();
        const next = structuredClone(state);
        if (change(next) === false) return;
        await api.storage.session.set({ [TAB_STATE_KEY]: next });
        // Publish only committed state. Failed writes must never become active or
        // hitchhike on a later tab's successful persistence.
        cache = next;
      });
    mutations = mutation;
    return mutation;
  }

  async function clear(tabId: number): Promise<void> {
    await mutate((state) => {
      if (!state[tabId]) return false;
      delete state[tabId];
    });
  }

  return { get, mutate, clear };
}
