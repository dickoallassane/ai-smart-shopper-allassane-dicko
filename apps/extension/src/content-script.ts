import type { ProductPayload } from '@shopfriend/shared'
import {
  buildProductPayloadFromConfig,
  findSiteForLocation
} from './lib/build-product-payload-from-config'
import {
  autoSurfaceDismissStorageKey,
  autoSurfaceShownInMemoryKey,
  shouldOfferAutoSurfaceForMatchedSite
} from './lib/auto-surface'
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
import { isManualInPageOverlay } from './lib/overlay-lifecycle'
import {
  GET_SHOPPER_TAB_ID,
  SHOPFRIEND_SNAPSHOT_PRODUCT,
  SHOW_SHOPFRIEND_PAGE_POPUP
} from './lib/shopfriend-messages'

const PUBLISH_DEBOUNCE_MS = 320
const AUTOSURFACE_DEBOUNCE_MS = 400
const MUTATION_IGNORED_LOG_THROTTLE_MS = 10_000

let publishTimer: ReturnType<typeof setTimeout> | null = null
let autoSurfaceTimer: ReturnType<typeof setTimeout> | null = null
let lastKnownHref = window.location.href
const shownAutoSurfaceThisPageLoad = new Set<string>()
const throttledLogLastAtByKey = new Map<string, number>()

const SHOPFRIEND_LOG_PREFIX = '[ShopFriend]'
const logAutoSurface = (message: string, details?: Record<string, unknown>): void => {
  if (details) {
    console.info(`${SHOPFRIEND_LOG_PREFIX} [autoSurface] ${message}`, details)
    return
  }
  console.info(`${SHOPFRIEND_LOG_PREFIX} [autoSurface] ${message}`)
}

const logAutoSurfaceThrottled = (
  throttleKey: string,
  message: string,
  details?: Record<string, unknown>
): void => {
  const now = Date.now()
  const last = throttledLogLastAtByKey.get(throttleKey) ?? 0
  if (now - last < MUTATION_IGNORED_LOG_THROTTLE_MS) {
    return
  }
  throttledLogLastAtByKey.set(throttleKey, now)
  logAutoSurface(message, details)
}

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
  console.info(`${SHOPFRIEND_LOG_PREFIX} [publish] schedulePublish queued`, {
    href: window.location.href,
    debounceMs: PUBLISH_DEBOUNCE_MS,
  })
  publishTimer = setTimeout(() => {
    publishTimer = null
    console.info(`${SHOPFRIEND_LOG_PREFIX} [publish] run publishPayload`, { href: window.location.href })
    void publishPayload()
  }, PUBLISH_DEBOUNCE_MS)
}

const scheduleForUrlChangeIfNeeded = (): void => {
  const href = window.location.href
  if (href === lastKnownHref) {
    logAutoSurfaceThrottled(`mutation-ignored:${href}`, 'mutation ignored (href unchanged)', { href })
    return
  }
  logAutoSurface('mutation detected href change', { from: lastKnownHref, to: href })
  lastKnownHref = href
  schedulePublish()
  scheduleAutoSurface()
}

const removeAutoOverlayOnly = (): void => {
  const host = document.getElementById(AUTO_SURFACE_HOST_ID)
  if (isManualInPageOverlay(host)) {
    return
  }
  removeAutoSurfaceOverlay()
}

const evaluateAutoSurface = async (): Promise<void> => {
  logAutoSurface('evaluate start', { href: window.location.href })
  const stored = await chrome.storage.local.get(AUTO_SURFACE_GLOBALLY_DISABLED_KEY)
  if (stored[AUTO_SURFACE_GLOBALLY_DISABLED_KEY] === true) {
    logAutoSurface('skip: globally disabled')
    removeAutoOverlayOnly()
    return
  }
  const sites = await loadSitesFromStorage()
  if (!sites?.length) {
    logAutoSurface('skip: no valid site config loaded')
    removeAutoOverlayOnly()
    return
  }
  const site = findSiteForLocation(sites, window.location)
  const href = window.location.href
  if (!site || !shouldOfferAutoSurfaceForMatchedSite(site, window.location)) {
    logAutoSurface('skip: site or autoSurface.urlRegex did not match', {
      matchedSiteId: site?.id,
      href,
    })
    removeAutoOverlayOnly()
    return
  }
  logAutoSurface('site matched', { siteId: site.id, href })
  const dismissKey = autoSurfaceDismissStorageKey(site.id, href)
  const shownKey = autoSurfaceShownInMemoryKey(site.id, href)
  try {
    if (sessionStorage.getItem(dismissKey) === '1') {
      logAutoSurface('skip: dismissed for this site+href', { dismissKey })
      removeAutoOverlayOnly()
      return
    }
  } catch {
    logAutoSurface('sessionStorage unavailable while checking dismiss key')
    /* sessionStorage unavailable */
  }
  if (shownAutoSurfaceThisPageLoad.has(shownKey)) {
    logAutoSurface('skip: already shown once for this site+href in this page load', { shownKey })
    return
  }
  const tabId = await getShopperTabId()
  if (tabId === undefined) {
    logAutoSurface('skip: shopper tab id unavailable')
    removeAutoOverlayOnly()
    return
  }
  logAutoSurface('resolved shopper tab id', { tabId })
  const existing = document.getElementById(AUTO_SURFACE_HOST_ID)
  if (
    existing instanceof HTMLElement &&
    isManualInPageOverlay(existing) &&
    existing.dataset.tabId === String(tabId) &&
    existing.dataset.href === href
  ) {
    logAutoSurface('skip: manual in-page popup already open for same tab+href')
    return
  }
  if (
    existing?.dataset.siteId === site.id &&
    existing?.dataset.href === href &&
    existing?.dataset.tabId === String(tabId)
  ) {
    logAutoSurface('skip: identical auto popup host already mounted')
    return
  }
  logAutoSurface('mounting auto popup', { siteId: site.id, tabId, href })
  removeAutoSurfaceOverlay()
  shownAutoSurfaceThisPageLoad.add(shownKey)
  logAutoSurface('marked shown-once key in memory', { shownKey })
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
  logAutoSurface('scheduleAutoSurface queued', {
    href: window.location.href,
    debounceMs: AUTOSURFACE_DEBOUNCE_MS,
  })
  autoSurfaceTimer = setTimeout(() => {
    autoSurfaceTimer = null
    logAutoSurface('running evaluateAutoSurface from timer', { href: window.location.href })
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
      logAutoSurface('received SHOW_SHOPFRIEND_PAGE_POPUP', { tabId, href: window.location.href })
      removeAutoSurfaceOverlay()
      const href = window.location.href
      mountShopFriendPagePopupIframe({
        tabId,
        persistDismissOnClose: false,
        href,
      })
      void loadSitesFromStorage().then((sites) => {
        const matched = sites?.length ? findSiteForLocation(sites, window.location) : undefined
        const host = document.getElementById(AUTO_SURFACE_HOST_ID)
        if (!host || !matched?.id || host.dataset.persistDismiss !== '0') {
          logAutoSurface('manual popup mounted without siteId enrichment', {
            hasHost: Boolean(host),
            matchedSiteId: matched?.id,
          })
          return
        }
        host.dataset.siteId = matched.id
        logAutoSurface('manual popup enriched with siteId', { siteId: matched.id, href })
      })
    }
    return false
  }
  return false
})

const observer = new MutationObserver(() => {
  // Amazon mutates the DOM constantly; only re-run URL-driven flows when URL actually changes.
  scheduleForUrlChangeIfNeeded()
})

observer.observe(document.documentElement, { childList: true, subtree: true })

window.addEventListener('popstate', () => {
  logAutoSurface('popstate detected')
  lastKnownHref = window.location.href
  schedulePublish()
  scheduleAutoSurface()
})

const originalPushState = history.pushState.bind(history)
history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
  originalPushState(data, unused, url)
  logAutoSurface('history.pushState detected', { url: String(url ?? '') })
  lastKnownHref = window.location.href
  schedulePublish()
  scheduleAutoSurface()
}

const originalReplaceState = history.replaceState.bind(history)
history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
  originalReplaceState(data, unused, url)
  logAutoSurface('history.replaceState detected', { url: String(url ?? '') })
  lastKnownHref = window.location.href
  schedulePublish()
  scheduleAutoSurface()
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') {
    return
  }
  if (changes[AUTO_SURFACE_GLOBALLY_DISABLED_KEY] !== undefined || changes[SITE_EXTRACTOR_CONFIG_JSON_KEY] !== undefined) {
    logAutoSurface('storage change triggers auto-surface reevaluation', {
      changedKeys: Object.keys(changes),
    })
    scheduleAutoSurface()
  }
})
