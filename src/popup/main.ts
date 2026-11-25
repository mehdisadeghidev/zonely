import { ACTIONS, type SettingsPayload, type TabStatus } from "../shared/protocol.ts";
import { createMessenger } from "../shared/messaging.ts";

interface PopupEnv {
  document: Document;
  chrome: typeof chrome;
}

const MODE_LABELS: Record<string, string> = { auto: "Auto by IP", fixed: "Fixed timezone", disable: "Do not spoof" };
const SOURCE_LABELS: Record<string, string> = {
  tabOverride: "Tab override",
  siteRule: "Site rule",
  default: "Default policy"
};

export function createPopup({ document: doc, chrome: api }: PopupEnv = { document, chrome }) {
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => doc.getElementById(id) as T;
  const send = createMessenger(api);

  let pageStatus: TabStatus | null = null;

  async function updateUI(): Promise<void> {
    const [settingsPayload, status] = await Promise.all([
      send<SettingsPayload>({ action: ACTIONS.getSettings }),
      send<TabStatus>({ action: ACTIONS.getTabStatus })
    ]);
    pageStatus = status;

    const runtime = settingsPayload.runtime || {};
    $("timezone").textContent = runtime.timezone || "Unknown";
    $("location").textContent = runtime.city && runtime.country ? `${runtime.city}, ${runtime.country}` : "Unknown";
    $("ip").textContent = runtime.ip || "Unknown";
    $("last-update").textContent = runtime.lastUpdate ? new Date(runtime.lastUpdate).toLocaleTimeString() : "--";

    const supported = status.supported === true;
    $("current-host").textContent = supported ? status.hostname : "Not a supported web page";
    $("current-mode").textContent = supported ? MODE_LABELS[status.mode] || status.mode : "Not available";
    $("effective-timezone").textContent = supported ? status.timezone || "Unknown" : "Not available";
    $("rule-source").textContent = supported ? SOURCE_LABELS[status.source] || status.source : "Not applicable";
    $("page-message").hidden = supported;
    $("page-message").textContent = supported ? "" : "Timezone spoofing is not available on this page.";
    if (status.error) throw new Error(status.error);
  }

  function showError(error: Error | null | undefined): void {
    $("status-message").textContent = error?.message || "Operation failed.";
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
      }
    });
  }

  function start(): void {
    onAction("refresh-btn", async () => {
      const result = await send<{ success: boolean }>({ action: ACTIONS.refresh });
      if (!result.success) throw new Error("IP lookup failed. Last known data has been kept.");
      await updateUI();
    });
    onAction("open-options-btn", () => api.runtime.openOptionsPage());

    updateUI().catch(showError);
  }

  return { start };
}

if (globalThis.document && globalThis.chrome) {
  createPopup().start();
}
