import type { SiteLocation } from './build-product-payload-from-config'
import type { SiteExtractorSite } from './site-extractor-config'

/** Session dismiss key: one dismissal per site + full URL for this tab session. */
export const autoSurfaceDismissStorageKey = (siteId: string, href: string): string =>
  `shopfriend:autoSurface:dismissed:${siteId}:${href}`

/**
 * Site must already match host + PDP patterns (`findSiteForLocation`).
 * Returns whether to show the in-page auto-surface overlay.
 */
export const shouldOfferAutoSurfaceForMatchedSite = (
  site: SiteExtractorSite,
  location: SiteLocation
): boolean => {
  const cfg = site.autoSurface
  if (!cfg) {
    return false
  }
  if (cfg.enabled === false) {
    return false
  }
  if (!cfg.urlRegex || cfg.urlRegex.trim().length === 0) {
    return true
  }
  try {
    const re = new RegExp(cfg.urlRegex, cfg.flags ?? '')
    return re.test(location.href)
  } catch {
    console.warn('[ShopFriend][autoSurface] Invalid urlRegex for site', site.id)
    return false
  }
}
