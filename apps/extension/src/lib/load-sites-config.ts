import type { SiteExtractorSite } from './site-extractor-config'
import {
  DEFAULT_SITE_EXTRACTOR_CONFIG,
  defaultSiteExtractorConfigJson,
  parseSiteExtractorConfigJson,
  SITE_EXTRACTOR_CONFIG_JSON_KEY
} from './site-extractor-config'

/**
 * Older installs have `siteExtractorConfigJson` without `autoSurface`. Merge from the
 * built-in default for the same `id` so new defaults (e.g. Amazon prompt) apply without
 * wiping user edits. If a site omits `autoSurface` intentionally, set `autoSurface: { enabled: false }`.
 */
export const mergeAutoSurfaceFromBuiltInDefaults = (sites: SiteExtractorSite[]): SiteExtractorSite[] => {
  const defaultsById = new Map(DEFAULT_SITE_EXTRACTOR_CONFIG.sites.map((s) => [s.id, s]))
  return sites.map((site) => {
    if (site.autoSurface !== undefined) {
      return site
    }
    const builtin = defaultsById.get(site.id)
    if (!builtin?.autoSurface) {
      return site
    }
    return { ...site, autoSurface: builtin.autoSurface }
  })
}

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
  return mergeAutoSurfaceFromBuiltInDefaults(parsed.data.sites)
}
