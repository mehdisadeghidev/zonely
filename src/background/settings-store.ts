import { sanitizeSettings, type Settings } from "../shared/settings.ts";
import type { ChromeApi } from "./chrome.ts";

export interface SettingsStore {
  get(): Promise<Settings>;
  set(next: unknown): Promise<Settings>;
  mutate(change: (settings: Settings) => Settings | Promise<Settings>): Promise<Settings>;
}

export function createSettingsStore(api: ChromeApi): SettingsStore {
  async function get(): Promise<Settings> {
    const { settings } = await api.storage.sync.get("settings");
    const safe = sanitizeSettings(settings);
    if (!settings) await api.storage.sync.set({ settings: safe });
    return safe;
  }

  async function set(next: unknown): Promise<Settings> {
    const safe = sanitizeSettings(next);
    await api.storage.sync.set({ settings: safe });
    return safe;
  }

  // Serialize writes so concurrent editors cannot interleave read-modify-write.
  let writes: Promise<unknown> = Promise.resolve();
  function mutate(change: (settings: Settings) => Settings | Promise<Settings>): Promise<Settings> {
    const write = writes.catch(() => {}).then(async () => set(await change(await get())));
    writes = write;
    return write;
  }

  return { get, set, mutate };
}
