import { productPayloadSchema, type ProductPayload } from "@shopfriend/shared"

export type AmazonLocation = Pick<Location, 'href' | 'pathname' | 'hostname'>

export const isLikelyAmazonPdp = (location: Pick<Location, 'hostname' | 'pathname'>): boolean => {
  const { hostname, pathname } = location
  if (!hostname.endsWith('amazon.com')) {
    return false
  }
  return /\/dp\/[A-Z0-9]{10}/i.test(pathname) || /\/gp\/product\//i.test(pathname)
}

const readText = (document: Document, selector: string): string | undefined => {
  const el = document.querySelector(selector)
  if (!el?.textContent) {
    return undefined
  }
  return el.textContent.replace(/\s+/g, ' ').trim().slice(0, 2000)
}

const extractAsin = (pathname: string): string | undefined => {
  const match = pathname.match(/\/dp\/([A-Z0-9]{10})/i)
  return match?.[1]
}

const extractReviewSnippets = (document: Document): string[] => {
  const nodes = Array.from(
    document.querySelectorAll('[data-hook="review-collapsed"] span, #reviewsMedley .review-text')
  )
  return nodes
    .map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean)
    .slice(0, 10)
}

/**
 * Build and validate {@link ProductPayload} from a DOM snapshot (Amazon PDP).
 */
export const buildAmazonProductPayload = (
  document: Document,
  location: AmazonLocation,
  pageTitle: string
): ProductPayload => {
  const title =
    readText(document, '#productTitle') ??
    readText(document, 'h1.a-size-large') ??
    pageTitle

  const extractedAt = new Date().toISOString()

  return productPayloadSchema.parse({
    retailer: 'amazon',
    locale: 'en-US',
    url: location.href,
    asin: extractAsin(location.pathname),
    title,
    displayedPrice: readText(document, '.a-price .a-offscreen'),
    ratingSummary: readText(document, '#acrPopover'),
    reviewExcerpts: extractReviewSnippets(document),
    sellerFulfillment: readText(document, '#merchant-info'),
    extractedAt
  })
}
