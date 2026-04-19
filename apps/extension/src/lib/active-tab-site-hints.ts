import { findSiteForLocation } from './build-product-payload-from-config'
import { loadSitesFromStorage } from './load-sites-config'

export type ActiveTabSiteHint = {
  supportedPage: boolean
  isServiceSite: boolean
}

/**
 * URL-only hint for UI (which tab is active, does it match a configured site, is it a service site).
 * Does not touch the DOM — use alongside {@link requestProductSnapshotFromActiveTab} on actions.
 */
export const loadActiveTabSiteHints = async (): Promise<ActiveTabSiteHint> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url?.trim()) {
    return { supportedPage: false, isServiceSite: false }
  }
  let url: URL
  try {
    url = new URL(tab.url)
  } catch {
    return { supportedPage: false, isServiceSite: false }
  }
  const sites = await loadSitesFromStorage()
  if (!sites?.length) {
    return { supportedPage: false, isServiceSite: false }
  }
  const site = findSiteForLocation(sites, {
    href: url.href,
    pathname: url.pathname,
    hostname: url.hostname
  })
  if (!site) {
    return { supportedPage: false, isServiceSite: false }
  }
  return { supportedPage: true, isServiceSite: Boolean(site.isService) }
}
