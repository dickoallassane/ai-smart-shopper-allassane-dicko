import type { ProductPayload } from '@shopfriend/shared'
import {
  buildProductPayloadFromConfig,
  findSiteForLocation
} from './lib/build-product-payload-from-config'
import { autoSurfaceDismissStorageKey, shouldOfferAutoSurfaceForMatchedSite } from './lib/auto-surface'
import {
  AUTO_SURFACE_HOST_ID,
  mountShopFriendPagePopupIframe,
  removeAutoSurfaceOverlay
} from './lib/auto-surface-overlay'
import { loadSitesFromStorage } from './lib/load-sites-config'
import {
  AUTO_SURFACE_GLOBALLY_DISABLED_KEY,
  SITE_EXTRACTOR_CONFIG_JSON_KEY
} from './lib/site-extractor-config'
import {
  GET_SHOPPER_TAB_ID,
  SHOPFRIEND_SNAPSHOT_PRODUCT,
  SHOW_SHOPFRIEND_PAGE_POPUP
} from './lib/shopfriend-messages'

const PUBLISH_DEBOUNCE_MS = 320
const AUTOSURFACE_DEBOUNCE_MS = 400

let publishTimer: ReturnType<typeof setTimeout> | null = null
let autoSurfaceTimer: ReturnType<typeof setTimeout> | null = null

type SnapshotResult =
  | { ok: true; product: ProductPayload }
  | { ok: false; error: string }

const runProductSnapshot = async (): Promise<SnapshotResult> => {
  const sites = await loadSitesFromStorage()
  if (!sites?.length) {
    return { ok: false, error: 'Site configuration is missing or invalid.' }
  }
  const site = findSiteForLocation(sites, window.location)
  if (!site) {
    return { ok: false, error: 'This page is not a configured ShopFriend site.' }
  }
  try {
    const product = await buildProductPayloadFromConfig(
      document,
      window.location,
      document.title,
      site
    )
    return { ok: true, product }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extraction failed.'
    return { ok: false, error: message }
  }
}

const publishPayload = async () => {
  const result = await runProductSnapshot()
  if (!result.ok) {
    console.warn('[ShopFriend] Product extract / validate skipped', result.error)
    return
  }
  console.debug('[ShopFriend] ProductPayload extracted', result.product)
  void chrome.runtime.sendMessage({
    type: 'PRODUCT_PAYLOAD',
    payload: result.product
  })
}

const getShopperTabId = (): Promise<number | undefined> =>
  new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: GET_SHOPPER_TAB_ID }, (response: unknown) => {
      if (chrome.runtime.lastError) {
        resolve(undefined)
        return
      }
      resolve((response as { tabId?: number } | undefined)?.tabId)
    })
  })

const schedulePublish = () => {
  if (publishTimer !== null) {
    clearTimeout(publishTimer)
  }
  publishTimer = setTimeout(() => {
    publishTimer = null
    void publishPayload()
  }, PUBLISH_DEBOUNCE_MS)
}

const evaluateAutoSurface = async (): Promise<void> => {
  const stored = await chrome.storage.local.get(AUTO_SURFACE_GLOBALLY_DISABLED_KEY)
  if (stored[AUTO_SURFACE_GLOBALLY_DISABLED_KEY] === true) {
    removeAutoSurfaceOverlay()
    return
  }
  const sites = await loadSitesFromStorage()
  if (!sites?.length) {
    removeAutoSurfaceOverlay()
    return
  }
  const site = findSiteForLocation(sites, window.location)
  const href = window.location.href
  if (!site || !shouldOfferAutoSurfaceForMatchedSite(site, window.location)) {
    removeAutoSurfaceOverlay()
    return
  }
  const dismissKey = autoSurfaceDismissStorageKey(site.id, href)
  try {
    if (sessionStorage.getItem(dismissKey) === '1') {
      removeAutoSurfaceOverlay()
      return
    }
  } catch {
    /* sessionStorage unavailable */
  }
  const tabId = await getShopperTabId()
  if (tabId === undefined) {
    removeAutoSurfaceOverlay()
    return
  }
  const existing = document.getElementById(AUTO_SURFACE_HOST_ID)
  if (
    existing?.dataset.siteId === site.id &&
    existing?.dataset.href === href &&
    existing?.dataset.tabId === String(tabId)
  ) {
    return
  }
  removeAutoSurfaceOverlay()
  mountShopFriendPagePopupIframe({
    tabId,
    persistDismissOnClose: true,
    siteId: site.id,
    href,
  })
}

const scheduleAutoSurface = (): void => {
  if (autoSurfaceTimer !== null) {
    clearTimeout(autoSurfaceTimer)
  }
  autoSurfaceTimer = setTimeout(() => {
    autoSurfaceTimer = null
    void evaluateAutoSurface()
  }, AUTOSURFACE_DEBOUNCE_MS)
}

void publishPayload()
void evaluateAutoSurface()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === SHOPFRIEND_SNAPSHOT_PRODUCT) {
    void runProductSnapshot().then(sendResponse)
    return true
  }
  if (message?.type === SHOW_SHOPFRIEND_PAGE_POPUP) {
    const tabId = typeof message.tabId === 'number' ? message.tabId : undefined
    if (tabId !== undefined) {
      removeAutoSurfaceOverlay()
      mountShopFriendPagePopupIframe({ tabId, persistDismissOnClose: false })
    }
    return false
  }
  return false
})

const observer = new MutationObserver(() => {
  schedulePublish()
  scheduleAutoSurface()
})

observer.observe(document.documentElement, { childList: true, subtree: true })

window.addEventListener('popstate', () => {
  schedulePublish()
  scheduleAutoSurface()
})

const originalPushState = history.pushState.bind(history)
history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
  originalPushState(data, unused, url)
  schedulePublish()
  scheduleAutoSurface()
}

const originalReplaceState = history.replaceState.bind(history)
history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
  originalReplaceState(data, unused, url)
  schedulePublish()
  scheduleAutoSurface()
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') {
    return
  }
  if (changes[AUTO_SURFACE_GLOBALLY_DISABLED_KEY] !== undefined || changes[SITE_EXTRACTOR_CONFIG_JSON_KEY] !== undefined) {
    scheduleAutoSurface()
  }
})
