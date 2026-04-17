import { buildAmazonProductPayload, isLikelyAmazonPdp } from './lib/amazon-product-from-dom'

const PUBLISH_DEBOUNCE_MS = 320

let publishTimer: ReturnType<typeof setTimeout> | null = null

const publishPayload = () => {
  if (!isLikelyAmazonPdp(window.location)) {
    return
  }
  try {
    const payload = buildAmazonProductPayload(document, window.location, document.title)
    console.debug('[ShopFriend] ProductPayload extracted', payload)
    console.debug(
      '[ShopFriend] POST /api/insight body would include `product` as above plus `flags` (e.g. from popup)',
      { product: payload, flags: { llmEnabled: true, pricingBetaEnabled: false } }
    )
    void chrome.runtime.sendMessage({
      type: 'PRODUCT_PAYLOAD',
      payload
    })
  } catch (error) {
    console.warn('[ShopFriend] Product extract / validate failed', error)
  }
}

const schedulePublish = () => {
  if (publishTimer !== null) {
    clearTimeout(publishTimer)
  }
  publishTimer = setTimeout(() => {
    publishTimer = null
    publishPayload()
  }, PUBLISH_DEBOUNCE_MS)
}

publishPayload()

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
