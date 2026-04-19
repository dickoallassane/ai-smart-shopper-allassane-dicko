import { insightRequestSchema, type InsightRequest, type ProductPayload } from '@shopfriend/shared'
import { loadActiveTabSiteHints } from './active-tab-site-hints'
import { requestProductSnapshotFromActiveTab } from './request-product-snapshot'
import {
  defaultSiteExtractorConfigJson,
  parseSiteExtractorConfigJson,
  SITE_EXTRACTOR_CONFIG_JSON_KEY
} from './site-extractor-config'

export type InsightSessionContext = {
  insightRequest: InsightRequest | null
  /** True when the matched site config has `isService` (no retail PDP / no Check Price). */
  isServiceSite: boolean
}

/**
 * Map a freshly extracted {@link ProductPayload} to an {@link InsightRequest} using stored site config.
 * Used after {@link requestProductSnapshotFromActiveTab} / {@link requestProductSnapshotFromTabId}.
 */
export const parseInsightRequestFromProduct = async (raw: ProductPayload): Promise<InsightSessionContext> => {
  const stored = await chrome.storage.local.get(SITE_EXTRACTOR_CONFIG_JSON_KEY)
  const rawJson = stored[SITE_EXTRACTOR_CONFIG_JSON_KEY] as string | undefined
  const cfgParsed =
    typeof rawJson === 'string' && rawJson.trim().length > 0
      ? parseSiteExtractorConfigJson(rawJson)
      : parseSiteExtractorConfigJson(defaultSiteExtractorConfigJson())
  let skipAffiliate = false
  let isServiceSite = false
  if (cfgParsed.success) {
    const site = cfgParsed.data.sites.find((s) => s.id === raw.retailer)
    skipAffiliate = Boolean(site?.isService)
    isServiceSite = Boolean(site?.isService)
  }
  const parsed = insightRequestSchema.safeParse({
    product: raw,
    flags: {
      llmEnabled: true,
      pricingBetaEnabled: false,
      skipAffiliate,
      isServiceSite,
      insightKind: 'price_check'
    }
  })
  return {
    insightRequest: parsed.success ? parsed.data : null,
    isServiceSite
  }
}

/**
 * Build insight request from a **fresh** product snapshot on the **active tab**
 * (`chrome.tabs.sendMessage` → content script). Does not read session-cached payloads.
 */
export const loadInsightSessionContext = async (): Promise<InsightSessionContext> => {
  const snapshot = await requestProductSnapshotFromActiveTab()
  if (!snapshot.ok) {
    const hints = await loadActiveTabSiteHints()
    return { insightRequest: null, isServiceSite: hints.isServiceSite }
  }
  return parseInsightRequestFromProduct(snapshot.product)
}
