import { isValidTimezone } from "../shared/settings.ts";
import type { RuntimeState } from "../shared/protocol.ts";
import type { ChromeApi } from "./chrome.ts";

export const SYSTEM_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const CHECK_TTL = 5 * 60_000;
const API_TIMEOUT = 5_000;

interface IpProvider {
  name: string;
  load(init: RequestInit & { fetchImpl: typeof fetch }): Promise<Response>;
  parse(data: any): RuntimeState;
}

// Fixed provider allowlist: URLs are literals, never caller-controlled.
const APIS: IpProvider[] = [
  {
    name: "ipwho.is",
    load: ({ fetchImpl, ...init }) => fetchImpl("https://ipwho.is/", init),
    parse: (data) => ({
      timezone: data.timezone?.id,
      ip: data.ip,
      country: data.country,
      city: data.city
    })
  },
  {
    name: "freeipapi.com",
    load: ({ fetchImpl, ...init }) => fetchImpl("https://freeipapi.com/api/json", init),
    parse: (data) => ({
      timezone: Array.isArray(data.timeZones) ? data.timeZones[0] : data.timeZone || data.timezones?.[0],
      ip: data.ipAddress || data.ip,
      country: data.countryName || data.country,
      city: data.cityName || data.city
    })
  }
];

export interface RuntimeService {
  getRuntimeState(): Promise<RuntimeState>;
  updateTimezone(force?: boolean): Promise<boolean>;
}

export interface RuntimeServiceOptions {
  fetch?: typeof fetch;
  apiTimeoutMs?: number;
}

export function createRuntimeService(api: ChromeApi, { fetch: fetchImpl = fetch, apiTimeoutMs = API_TIMEOUT }: RuntimeServiceOptions = {}): RuntimeService {
  let updatePromise: Promise<boolean> | null = null;

  function getRuntimeState(): Promise<RuntimeState> {
    return api.storage.local.get(["timezone", "ip", "country", "city", "lastUpdate"]) as Promise<RuntimeState>;
  }

  async function updateTimezone(force = false): Promise<boolean> {
    if (updatePromise) return updatePromise;
    // ponytail: freshness is the stored lastUpdate, so restarts and navigations
    // reuse it. A changed IP is only seen after CHECK_TTL; upgrade path is a
    // network-change signal instead of a periodic poll.
    if (!force) {
      const stored = await getRuntimeState();
      if (isValidTimezone(stored.timezone) && Date.now() - Number(stored.lastUpdate || 0) < CHECK_TTL) return false;
    }
    updatePromise = (async () => {
      for (const provider of APIS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), apiTimeoutMs);
        try {
          const response = await provider.load({ cache: "no-store", signal: controller.signal, fetchImpl });
          if (!response.ok) continue;
          const parsed = provider.parse(await response.json());
          if (!isValidTimezone(parsed.timezone)) continue;

          const stored = await getRuntimeState();
          const changed = stored.ip !== parsed.ip || stored.timezone !== parsed.timezone;

          await api.storage.local.set({
            timezone: parsed.timezone,
            ip: parsed.ip,
            country: parsed.country,
            city: parsed.city,
            lastUpdate: Date.now()
          });

          if (changed) {
            console.log(`[Zonely] Updated timezone: ${stored.timezone || "none"} -> ${parsed.timezone}`);
          }
          return true;
        } catch (error) {
          console.warn(`[Zonely] API ${provider.name} failed:`, (error as Error)?.message || error);
        } finally {
          clearTimeout(timer);
        }
      }
      return false;
    })();
    try {
      return await updatePromise;
    } finally {
      updatePromise = null;
    }
  }

  return { getRuntimeState, updateTimezone };
}
