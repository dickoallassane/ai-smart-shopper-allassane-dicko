# Amazon tab console: ShopFriend vs noise

Use this when debugging the extension on `amazon.com` (or other PDP hosts). Most console output on Amazon is **not** from ShopFriend.

## `Cannot use import statement outside a module`

**Meaning:** A file uses ES module syntax (`import ...`) at the top level but Chrome ran it as a **classic** script (not `type="module"`).

**How to tell who caused it:** In DevTools, click the error and read the **source URL** on the right.

| URL pattern | Source |
|-------------|--------|
| `chrome-extension://…/assets/content-script.ts-….js` (hashed name, **no** `loader` in the filename) | ShopFriend **bug** if this file was injected **alone** via `registerContentScripts`. The service worker must register the **loader** (`content-script.ts-loader-….js`) from `manifest.content_scripts`; see `getBundledContentScriptLoaderPath` in `src/background.ts`. |
| Long Amazon URL such as `…AUIClients…` or `41Vu0w0zP-L._RC%7C…` | **Amazon’s** scripts (e.g. video / AUI). Ignore for ShopFriend. |
| Another `chrome-extension://<other-id>/…` | **Another extension**. Compare the extension ID to ShopFriend on `chrome://extensions`. |

**ShopFriend success path (high level):**

1. Chrome injects the **IIFE loader** (no top-level `import`).
2. The loader `import()`s the ESM chunk.
3. The content script logs `[ShopFriend] ProductPayload extracted` and sends `PRODUCT_PAYLOAD` to the background.

If you still see ShopFriend’s **inner** chunk in the syntax error after a fix: reload the extension, refresh the product tab, and confirm you loaded a fresh build (`dist/` or dev output) whose `manifest.json` still lists `content-script.ts-loader-*.js` under `content_scripts`.

## Other common messages (usually not ShopFriend)

| Message | Typical source |
|---------|------------------|
| VIDEOJS / `hls` deprecated / use `vhs` | Amazon video / AUI client bundles. |
| `/gp/product/ajax/billOfMaterial` **404** | Amazon internal PDP AJAX; common noise. |
| `chrome-extension://…/content-script.js:…` **Uncaught (in promise)** | Often **another** extension (generic `content-script.js`). Open the link and check the extension ID. ShopFriend bundles usually live under `assets/content-script.ts-*.js`. |
| Preload “not used within a few seconds” | Browser / site performance hint. |
| “Unsafe attempt to load URL … amazon-adsystem” | Ads / tracking iframes; third-party. |

## Checklist: ShopFriend is working on the PDP tab

1. Open DevTools on the **Amazon product tab** (not the side panel).
2. Filter console by `[ShopFriend]` if needed.
3. After navigation or refresh, you should see: **`[ShopFriend] ProductPayload extracted`** (from `src/content-script.ts`).
4. You should **not** see a syntax error whose URL is ShopFriend’s **non-loader** ESM chunk if registration is correct.

## Loader + `import()` on real sites

If you see **“Denying load of chrome-extension://…/assets/content-script.ts-….js”** and **“Resources must be listed in web_accessible_resources”**, the ESM chunk is blocked for that page origin. The manifest must expose those assets for the URLs where the loader runs (see `web_accessible_resources` in `manifest.config.ts`).

## Service worker

If the side panel never gets product context, confirm the background is not logging `[ShopFriend] registerContentScripts failed` (inspect the extension service worker console).

**Duplicate script ID `shopfriend-site-…`:** Usually overlapping `registerContentScripts` calls. The background serializes sync and unregisters existing `shopfriend-site-*` ids before registering again; reload the extension after updating.
