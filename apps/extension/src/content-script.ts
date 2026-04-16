import { buildAmazonProductPayload, isLikelyAmazonPdp } from './lib/amazon-product-from-dom'

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

publishPayload()

const observer = new MutationObserver(() => {
  publishPayload()
})

observer.observe(document.documentElement, { childList: true, subtree: true })
