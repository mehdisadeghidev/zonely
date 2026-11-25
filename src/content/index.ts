import spoofScript from "./spoof.ts?script&iife";
import { ACTIONS, type PageConfig } from "../shared/protocol.ts";

const hostname = window.location.hostname;
if (hostname) {
  chrome.runtime.sendMessage({ action: ACTIONS.getPageConfig, hostname }, (config: PageConfig) => {
    if (chrome.runtime.lastError || !config || !config.shouldSpoof || !config.timezone) {
      return;
    }

    document.documentElement.dataset.tzChanger = config.timezone;

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL(spoofScript);
    script.dataset.tz = config.timezone;
    script.async = false;
    (document.head || document.documentElement).append(script);
    script.onload = () => script.remove();
  });
}
