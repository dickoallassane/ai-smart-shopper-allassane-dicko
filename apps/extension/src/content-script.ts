import { productPayloadSchema } from '@shopfriend/shared'

const isLikelyAmazonPdp = (): boolean => {
  const { hostname, pathname } = window.location
  if (!hostname.endsWith('amazon.com')) {
    return false
  }
  return /\/dp\/[A-Z0-9]{10}/i.test(pathname) || /\/gp\/product\//i.test(pathname)
}

const readText = (selector: string): string | undefined => {
  const el = document.querySelector(selector)
  if (!el?.textContent) {
    return undefined
  }
  return el.textContent.replace(/\s+/g, ' ').trim().slice(0, 2000)
}

const extractAsin = (): string | undefined => {
  const match = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/i)
  return match?.[1]
}

const extractReviewSnippets = (): string[] => {
  const nodes = Array.from(
    document.querySelectorAll('[data-hook="review-collapsed"] span, #reviewsMedley .review-text')
  )
  return nodes
    .map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean)
    .slice(0, 10)
}

const buildPayload = () => {
  const title =
    readText('#productTitle') ??
    readText('h1.a-size-large') ??
    document.title

  const extractedAt = new Date().toISOString()

  return productPayloadSchema.parse({
    retailer: 'amazon',
    locale: 'en-US',
    url: window.location.href,
    asin: extractAsin(),
    title,
    displayedPrice: readText('.a-price .a-offscreen'),
    ratingSummary: readText('#acrPopover'),
    reviewExcerpts: extractReviewSnippets(),
    sellerFulfillment: readText('#merchant-info'),
    extractedAt
  })
}

const publishPayload = () => {
  if (!isLikelyAmazonPdp()) {
    return
  }
  try {
    const payload = buildPayload()
    void chrome.runtime.sendMessage({
      type: 'PRODUCT_PAYLOAD',
      payload
    })
  } catch {
    /* ignore parse errors on non-standard pages */
  }
}

publishPayload()

const observer = new MutationObserver(() => {
  publishPayload()
})

observer.observe(document.documentElement, { childList: true, subtree: true })
