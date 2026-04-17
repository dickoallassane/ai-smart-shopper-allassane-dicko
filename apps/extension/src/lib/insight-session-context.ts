import { insightRequestSchema, type InsightRequest } from '@shopfriend/shared'
import { getStoredProductPayloadForTab, resolveInsightSourceTabId } from './pdp-session-storage'
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

export const loadInsightSessionContext = async (): Promise<InsightSessionContext> => {
  const tabId = await resolveInsightSourceTabId()
  if (tabId === undefined) {
    return { insightRequest: null, isServiceSite: false }
  }
  const raw = await getStoredProductPayloadForTab(tabId)
  if (!raw) {
    return { insightRequest: null, isServiceSite: false }
  }
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
