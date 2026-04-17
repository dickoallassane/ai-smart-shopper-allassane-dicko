import { insightRequestSchema, type InsightRequest } from '@shopfriend/shared'
import { isRestrictedBrowserUrl } from './request-product-snapshot'

const OPEN_WEB_RETAILER = 'open_web'

/**
 * Build a minimal {@link InsightRequest} for Bright Data Discover when the active tab URL
 * does not match any configured extractor site (no content-script product snapshot).
 */
export const buildDomainDiscoveryRequest = async (): Promise<InsightRequest | null> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    return null
  }
  const urlRaw = tab.url?.trim()
  if (!urlRaw) {
    return null
  }
  if (isRestrictedBrowserUrl(urlRaw)) {
    return null
  }
  const lower = urlRaw.toLowerCase()
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) {
    return null
  }

  let resolved = tab
  try {
    resolved = await chrome.tabs.get(tab.id)
  } catch {
    /* use tab from query */
  }

  let hostname = ''
  try {
    hostname = new URL(urlRaw).hostname
  } catch {
    return null
  }

  let title = typeof resolved.title === 'string' ? resolved.title.trim() : ''
  if (title.length === 0) {
    title = hostname
  }
  if (title.length === 0) {
    title = 'Website'
  }

  const extractedAt = new Date().toISOString()
  const parsed = insightRequestSchema.safeParse({
    product: {
      retailer: OPEN_WEB_RETAILER,
      locale: 'en-US',
      url: urlRaw,
      title: title.slice(0, 500),
      reviewExcerpts: [],
      extractedAt
    },
    flags: {
      llmEnabled: true,
      pricingBetaEnabled: false,
      skipAffiliate: true,
      insightKind: 'review_discovery',
      isServiceSite: false,
      unsupportedDomainDiscovery: true
    }
  })

  return parsed.success ? parsed.data : null
}
