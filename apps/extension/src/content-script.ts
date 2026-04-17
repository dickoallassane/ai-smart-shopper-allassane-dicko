import type { ProductPayload } from '@shopfriend/shared'
import {
  buildProductPayloadFromConfig,
  findSiteForLocation
} from './lib/build-product-payload-from-config'
import { loadSitesFromStorage } from './lib/load-sites-config'
import { SHOPFRIEND_SNAPSHOT_PRODUCT } from './lib/shopfriend-messages'

const PUBLISH_DEBOUNCE_MS = 320

let publishTimer: ReturnType<typeof setTimeout> | null = null

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

const schedulePublish = () => {
  if (publishTimer !== null) {
    clearTimeout(publishTimer)
  }
  publishTimer = setTimeout(() => {
    publishTimer = null
    void publishPayload()
  }, PUBLISH_DEBOUNCE_MS)
}

void publishPayload()

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === SHOPFRIEND_SNAPSHOT_PRODUCT) {
    void runProductSnapshot().then(sendResponse)
    return true
  }
  return false
})

const observer = new MutationObserver(() => {
  schedulePublish()
})

observer.observe(document.documentElement, { childList: true, subtree: true })

window.addEventListener('popstate', () => {
  schedulePublish()
})

const originalPushState = history.pushState.bind(history)
history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
  originalPushState(data, unused, url)
  schedulePublish()
}

const originalReplaceState = history.replaceState.bind(history)
history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
  originalReplaceState(data, unused, url)
  schedulePublish()
}
