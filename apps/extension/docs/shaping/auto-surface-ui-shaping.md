---
shaping: true
---

# Automatic surface UI on supported URLs — Shaping

## Source (verbatim)

> Build a feature for automatic popup display … automatically show pop when the url is one of the url supported and match it's regex, if it doesn't have a regex show it automatically

> update the popup to be on the top right and look exactly like the pop that show up when we click on the extension button. When we click on the extension button, just make this new popup to show up manually instead of the current popup

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| R0 | When the active tab URL is a **supported site** (same notion as today’s extractor routing), the product should **surface ShopFriend UI without requiring the user to click the extension icon first** | Core goal |
| R1 | If a site defines an **optional URL/path regex gate**, only surface UI when the current URL **matches that regex** | Must-have |
| R2 | If that optional regex is **omitted**, surface UI whenever the tab is already considered a **supported match** by existing site detection (host + PDP path patterns today) | Must-have |
| R3 | Behavior must be **per-site configurable** (not one global switch only) so some retailers can be aggressive and others narrow | Must-have |
| R4 | Must not create a **spam loop** (re-open on every tiny URL change / SPA churn); debounce or “once per navigation / per tab session until dismissed” | Must-have |
| R5 | Must respect **Chrome extension UI rules**: if the chosen surface is the **native extension popup**, it may **not** open from passive `tabs.onUpdated` without a user gesture | Constraint (platform) |
| R6 | User can **turn off** auto-surface globally or per-site (storage-backed), default conservative if needed | Nice-to-have |
| R7 | **Toolbar click** surfaces the **same** ShopFriend promo UI as the in-page flow (pixel-identical), replacing the browser **native** `action.default_popup` (which cannot coexist with `chrome.action.onClicked` for the same gesture) | Must-have |

**Constraint (toolbar):** Chrome does not fire `chrome.action.onClicked` while `default_popup` is set; shipping R7 requires removing `default_popup` and driving the UI from the content script (e.g. extension-origin iframe).

---

## Shapes (S)

### CURRENT: Manual open

User clicks toolbar icon / uses existing flow to open popup or side panel. No URL-based automation.

### A: Background-driven native popup / side panel

**Mechanism:** `tabs.onUpdated` → `chrome.action.openPopup()` and/or `chrome.sidePanel.open()`.

**Platform reality:** `chrome.action.openPopup()` is **user-activation gated** and is unreliable outside a direct user gesture; `sidePanel.open()` from the service worker similarly does not give you a free “open on navigation” path. This shape **fails R0/R5** in practice unless paired with a user click somewhere.

### B: In-page “popup” (content script + extension iframe) — **selected**

**Mechanism:** On URL match (or toolbar click), a **content script** mounts a **fixed top-right** host with an **extension-origin iframe** that loads the same React + CSS shell as the former toolbar popup (`PopupPanel`). **Start Now** sends `OPEN_SIDE_PANEL` with the shopper tab id; **Close** uses `postMessage` to tear down the host. **Toolbar:** `chrome.action.onClicked` → `tabs.sendMessage` → content script mounts the same iframe (no `default_popup`).

### C: Hybrid (attempt A, fall back to B)

Try `openPopup` once on match; on failure/no-op, show B. Adds complexity; only justified after a short spike proves A ever fires on your target Chrome versions.

---

## Fit check (R × shape)

| Req | Requirement | Status | CURRENT | A | B | C |
|-----|-------------|--------|---------|---|---|---|
| R0 | Auto-surface UI on supported navigation | Core goal | ❌ | ❌ | ✅ | ✅ |
| R1 | Optional regex narrows when UI appears | Must-have | ❌ | ✅ | ✅ | ✅ |
| R2 | No regex → surface on supported match | Must-have | ❌ | ✅ | ✅ | ✅ |
| R3 | Per-site configuration | Must-have | ❌ | ✅ | ✅ | ✅ |
| R4 | No spam / debounce | Must-have | ✅ | ❌ | ✅ | ⚠️ |
| R5 | Complies with Chrome gesture rules for native popup | Constraint | ✅ | ❌ | ✅ | ⚠️ |
| R7 | Toolbar click surfaces the same pixel-identical promo UI as in-page (no native `default_popup`) | Must-have | ❌ | ❌ | ✅ | ⚠️ |

**Notes**

- A fails R0/R5 for **native** extension popup / un-gestured side panel open.
- R4 for C is ❌/⚠️ until explicit debounce/dedupe is specified; B implements debounce + dismiss key.
- R7 for C is ⚠️ until toolbar path is specified; B implements `action.onClicked` + iframe.

**Selected shape:** **B**

---

## Shape B — parts (mechanisms)

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **B1** | Extend site config schema (`autoSurface?: { enabled?, urlRegex?, flags? }`) in `site-extractor-config.ts` | |
| **B2** | Content script: URL / SPA hooks reuse existing `schedulePublish` pattern; debounced `evaluateAutoSurface` | |
| **B3** | Dedupe: `sessionStorage` dismiss key per `siteId` + `href`; debounce ~400ms | |
| **B4** | Top-right **shadow** host + **React** `PopupPanel` + `extension-ui.css` linked into shadow (`?url`) so UI matches the former toolbar popup without leaking styles onto the host page | |
| **B5** | Background: `OPEN_SIDE_PANEL` / `GET_SHOPPER_TAB_ID`; `chrome.action.onClicked` → `tabs.sendMessage(SHOW_SHOPFRIEND_PAGE_POPUP, tabId)`; fallback `sidePanel.open` when no CS | |
| **B6** | `PopupPanel` `onRequestClose` / Escape → CS removes host + optional `sessionStorage` dismiss | |
| **B7** | Manifest: no `default_popup`; `web_accessible_resources` includes `assets/*.css` for shadow `<link>` | |
| **B8** | `registerContentScripts` unchanged (per-site `matchPatterns`) | |

---

## Slices

1. **V1 — Config + matcher:** Zod + `shouldOfferAutoSurfaceForMatchedSite` + tests.
2. **V2 — Overlay + message:** Content script + background handler.
3. **V3 — Anti-spam + settings:** Dismiss persistence + global disable in `chrome.storage.local` + Settings checkbox.

---

## Product note

Native extension **action popup** cannot open automatically on navigation without a user gesture on Chrome. The **promo** UI is an **in-page** top-right **shadow** host rendering the same **React `PopupPanel`** as the former toolbar popup, with **extension CSS** loaded via `<link>` into the shadow root so host-page styles are not overwritten. **Start Now** opens the **side panel** on the shopper tab. The **toolbar icon** no longer opens Chrome’s built-in popup (`default_popup` removed); it messages the content script to mount that same panel when injection is available (otherwise the side panel opens as a fallback).
