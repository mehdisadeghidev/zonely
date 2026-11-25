# Zonely

[![Release](https://img.shields.io/github/v/release/mehdisadeghidev/zonely?style=flat-square)](https://github.com/mehdisadeghidev/zonely/releases/latest)
[![Release workflow](https://img.shields.io/github/actions/workflow/status/mehdisadeghidev/zonely/release.yml?style=flat-square&label=build)](https://github.com/mehdisadeghidev/zonely/actions/workflows/release.yml)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-34a853?style=flat-square)](manifest.config.ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

Chrome extension that makes your browser timezone match your IP location, with
per-site and per-tab control over when it does.

## Features

- **Auto by IP** — detects your location timezone via `ipwho.is`, falling back to `freeipapi.com`
- **Per-site rules** — `Do not spoof`, `Fixed timezone`, `Auto by IP`
- **Per-tab overrides** — session-scoped, can bypass exclusions
- **Default mode** — `Auto by IP`, `Fixed timezone` or `Do not spoof` for every site without a rule
- **Excluded domains** — wildcard support (`*.example.com`)
- **Stable in-tab behavior** — a confirmed auto timezone stays locked for the tab's lifetime
- **Protected domains by default** — Google/Gemini hosts keep the real system timezone so uploads and auth keep working

## Install

**From a release:** download `zonely-v<version>.zip` from the
[latest release](https://github.com/mehdisadeghidev/zonely/releases/latest), unzip it,
open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and
pick the unzipped folder.

**From source:**

```sh
pnpm install
pnpm build        # emits the loadable extension into dist/
```

Then load `dist/` as an unpacked extension.

## How rules resolve

Highest priority first:

1. Per-tab override
2. Per-site rule (most specific matching pattern wins)
3. Exclusion
4. Default mode (`auto`, `fixed` + timezone, or `disable`)

A per-tab override can override anything; a site rule outranks an exclusion, so
an excluded host with its own rule follows that rule.
`*.example.com` matches subdomains only — add the apex `example.com` separately.

**Auto locks:** a detected timezone is locked for the tab's lifetime, including
reloads and navigation. Refreshing IP data does not change an existing lock; open
a new tab to pick up the new timezone. A first-detection failure falls back to the
system timezone *without* locking, so the page picks up the real value on reload.

**Editing rules:** `Auto by IP` is an explicit rule; `Use inherited policy` removes
the exact site rule or tab override for the selected scope. **Apply and reload**
reloads the current tab only — other tabs on that site need their own reload, and
Options-page changes require page reloads.

### Protected domains

Spoofing is off by default on hosts where a fake clock breaks things:
`*.google.com`, `gemini.google.com`, `*.googleapis.com`, `upload.googleapis.com`,
`*.gstatic.com`, `accounts.google.com`.

## UI

**Popup** — current IP/location/timezone, current host and active mode, and one
quick rule editor scoped to *This site* or *This tab only* (drafts are kept
independently per scope). Rules are disabled on Chrome internal, Web Store and
other non-HTTP(S) pages; IP refresh and Options stay available.

**Options** — set the default mode, manage excluded domains and per-site rules
(comma-separated patterns are accepted).

## Storage

| Area | Contents |
| --- | --- |
| `chrome.storage.sync` | settings, domain lists, site rules |
| `chrome.storage.local` | runtime IP/timezone metadata |
| `chrome.storage.session` | per-tab lock/override state |

## Development

```sh
pnpm dev        # Vite + CRXJS with HMR
pnpm build      # typecheck, then bundle into dist/
pnpm typecheck  # tsc --noEmit
pnpm test       # node --test, no build needed
```

`pnpm test` runs VM/Chrome-API-double tests plus native `Date` oracle checks in
separate timezone-configured processes, importing the TypeScript sources via
Node's built-in type stripping (Node.js 22.18+). It is not a substitute for
testing in Chrome.

```sh
pnpm test:smoke
```

The optional probe builds the extension and drives installed Chrome over the
DevTools protocol in a **new temporary headless profile**, never your real one.
It needs a Chrome version supporting `Extensions.loadUnpacked` with
`--enable-unsafe-extension-debugging`; set `CHROME_PATH` for non-standard installs.
It covers strict-CSP pages, same- and cross-origin frames, popup validation, and
site/tab rules. Chrome may canonicalize timezone aliases (`Asia/Kathmandu` →
`Asia/Katmandu`).

### Project layout

```text
src/
  background/       MV3 service worker
    index.ts        entry: wires the worker
    app.ts          message router + event listeners
    page-config.ts  hostname -> effective mode/timezone
    settings-store.ts, tab-state.ts, timezone.ts
  content/
    index.ts        isolated-world content script
    spoof.ts        page-world Date/Intl patching script
  shared/           settings rules, message protocol, messenger
  popup/            popup page
  options/          options page
public/icons/       extension icons
manifest.config.ts  generated into dist/manifest.json
```

TypeScript + Vite + CRXJS. MV3 with a content script that injects a page-world
patch at `document_start` in all frames.

## Releases

Pushing a `v*` tag (or running the workflow manually) builds `dist/`, zips it as
`zonely-v<version>.zip`, and attaches it to a GitHub release.

```sh
pnpm version patch        # bumps package.json, which drives the manifest version
git push --follow-tags    # tag must be v<package.json version> or the job fails
```

## Known limitations

- Config and page-context injection are asynchronous: early page scripts can see
  the system timezone and capture original constructors before spoofing starts.
- Workers, `about:blank` and `srcdoc` frames are not spoofed. This is not a
  fingerprinting/privacy boundary.
- Patched `Date`/`Intl` are not byte-identical to native. Standard ISO and common
  legacy date forms, local setters and DST transitions have regression coverage —
  not a guarantee for every exotic usage.
- Settings changes need a page reload; changing an already-confirmed auto lock
  needs a new tab.

## License

MIT. See [LICENSE](LICENSE).
