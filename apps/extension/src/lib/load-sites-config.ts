import type { SiteExtractorSite } from './site-extractor-config'
import {
  defaultSiteExtractorConfigJson,
  parseSiteExtractorConfigJson,
  SITE_EXTRACTOR_CONFIG_JSON_KEY
} from './site-extractor-config'

/** Loads validated site list from `chrome.storage.local` (or defaults). */
export const loadSitesFromStorage = async (): Promise<SiteExtractorSite[] | null> => {
  const stored = await chrome.storage.local.get(SITE_EXTRACTOR_CONFIG_JSON_KEY)
  const raw = stored[SITE_EXTRACTOR_CONFIG_JSON_KEY] as string | undefined
  const parsed =
    typeof raw === 'string' && raw.trim().length > 0
      ? parseSiteExtractorConfigJson(raw)
      : parseSiteExtractorConfigJson(defaultSiteExtractorConfigJson())
  if (!parsed.success) {
    console.warn('[ShopFriend] Site config invalid', parsed.error)
    return null
  }
  return parsed.data.sites
}
