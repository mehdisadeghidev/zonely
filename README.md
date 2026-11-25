# Zonely

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.02-blue.svg)](#)
[![Browser](https://img.shields.io/badge/Chrome-Extension-green.svg)](#)

`Zonely` is a Chrome extension (Manifest V3) that aligns browser timezone behavior with your network/IP location, while giving full per-site and per-tab control over spoofing.

## Highlights (v2.02)

- Automatic timezone detection by IP (`ipwho.is`, `freeipapi.com`)
- Domain exclusions with wildcard support (`*.domain.com`)
- Whitelist mode support
- Per-site rules:
  - `Do not spoof`
  - `Fixed timezone`
  - `Auto by IP`
- Per-tab overrides (session-scoped)
- Tab-lifetime timezone lock in auto mode (stable behavior while tab is open)
- Safe patching strategy (Proxy-based where possible)
- Popup and Options UI for rule management

## Default Protected Domains

Spoofing is disabled by default on critical Google/Gemini domains to avoid breaking uploads and auth flows:

- `*.google.com`
- `gemini.google.com`
- `*.googleapis.com`
- `upload.googleapis.com`
- `*.gstatic.com`
- `accounts.google.com`

On these hosts the extension falls back to real system timezone behavior.

## Rule Priority

Rules are resolved in this order:

1. Per-tab override
2. Exclusion / whitelist decision
3. Per-site rule (most specific matching pattern)
4. Global default mode (`auto`)

A per-tab override can explicitly bypass an exclusion. A site rule cannot.
`*.example.com` matches subdomains, not the apex `example.com`; add that domain
separately if needed. Existing protected-domain defaults are unchanged.

**Auto locks:** a successfully detected timezone stays locked for the lifetime of
the tab, including reloads and navigation. Refreshing IP data does not change an
existing lock; open a new tab to use the new timezone. On first detection failure,
the system timezone is a temporary fallback and is not locked. Reload that page
after IP detection recovers to apply the newly available timezone.

**Rule editing:** `Auto by IP` is an explicit rule. `Use inherited policy` removes
the exact site rule or tab override, depending on the selected scope. A broader
wildcard site rule can still apply after removing an exact rule. `Apply and reload`
reloads the current tab after a successful save; other open tabs on that site still
need their own reload. Settings changed in Options also require page reloads.

## Storage Model

- `chrome.storage.sync`: settings, domain lists, site rules
- `chrome.storage.local`: runtime IP/timezone metadata
- `chrome.storage.session`: per-tab temporary state (lock/override)

## UI

- **Popup**
  - Current timezone/IP/location status
  - Current host + active mode
  - One quick rule editor: choose This site / This tab only, mode and optional timezone
  - Independent unsaved drafts when switching scope
  - Apply and reload the current tab after a successful save
  - All rules and exclusions opens the global Options page
  - Rules disabled on extension, Chrome internal, Chrome Web Store and other
    unsupported non-HTTP(S) pages; IP refresh and Options remain available
- **Options page**
  - Manage excluded domains
  - Manage whitelist domains
  - Manage per-site rules

## Installation

1. Clone or download this repository.
2. `pnpm install && pnpm build`
3. Open `chrome://extensions/`.
4. Enable `Developer mode`.
5. Click `Load unpacked`.
6. Select the `dist/` folder.

## Project structure

```text
src/
  background/       MV3 service worker (ES modules)
    index.ts        entry: wires the worker
    app.ts          message router + event listeners
    page-config.ts  hostname -> effective mode/timezone
    settings-store.ts, tab-state.ts, timezone.ts
  content/
    index.ts        isolated-world content script
    spoof.ts        page-world Date/Intl patching script
  shared/           settings rules, message protocol, messenger
  popup/            popup page (index.html, main.ts, style.css)
  options/          options page (index.html, main.ts, style.css)
public/icons/       extension icons
manifest.config.ts  generated into dist/manifest.json
```

## Technical Notes

- TypeScript + Vite + CRXJS; `dist/` is the only loadable artifact
- Uses content-script + page-context injection model
- Checks `location.hostname` before applying spoof logic
- Supports all frames (`all_frames: true`)
- Maintains MV3 compatibility

## Development and verification

```sh
pnpm install
pnpm dev        # Vite + CRXJS dev server with HMR
pnpm build      # typecheck, then bundle into dist/
pnpm typecheck  # tsc --noEmit
pnpm test       # node --test, no build required
```

The regression suite runs isolated VM/Chrome-API-double tests and native Date
oracle checks in separate timezone-configured processes, importing the TypeScript
sources directly through Node's built-in type stripping (Node.js 22.18 or newer).
It does not replace Chrome testing.

```sh
pnpm test:smoke
```

The optional integration probe builds first, then uses installed Chrome and its
DevTools protocol to load the unpacked extension in a **new temporary headless
profile**, not your regular browser. On Windows it defaults to the standard Chrome
installation; set `CHROME_PATH` for another installation. It needs a Chrome version
supporting `Extensions.loadUnpacked` with `--enable-unsafe-extension-debugging`.
Temporary profiles are retained under `%LOCALAPPDATA%\Temp\opencode\tzc-chrome-*`
for diagnosis.

The probe checks normal/strict-CSP pages, same/cross-origin frames, popup
validation, site rules and tab disable/fixed/inherit. Chrome may canonicalize
timezone aliases (for example `Asia/Kathmandu` to `Asia/Katmandu`).

### Known limitations

- Configuration and page-context injection are asynchronous. Early page scripts
  can see system timezone and retain original constructors before spoofing starts.
- Workers, `about:blank` and `srcdoc` frames are not spoofed by the current
  injection path. This is not a comprehensive fingerprinting/privacy boundary.
- Changes to settings require reload; changing an already-confirmed auto lock
  requires a new tab.- Date/Intl patching cannot be indistinguishable from native APIs. Nonstandard
  date-string parsing is engine-specific; standard ISO and common legacy forms,
  local setters and DST transitions have regression coverage, not a guarantee
  of compatibility with every exotic Date use.

## License

MIT. See [LICENSE](LICENSE).
