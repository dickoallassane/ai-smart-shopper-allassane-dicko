import { productPayloadSchema, type ProductPayload } from '@shopfriend/shared'
import type { SiteExtractorSite } from './site-extractor-config'

export type SiteLocation = Pick<Location, 'href' | 'pathname' | 'hostname'>

const READ_TIMEOUT_MS = 8_000

const readTextFromElement = (el: Element | null): string | undefined => {
  if (!el?.textContent) {
    return undefined
  }
  return el.textContent.replace(/\s+/g, ' ').trim().slice(0, 2000)
}

/** Resolve host part from a Chrome-style match pattern like `https://www.amazon.com/*` */
export const hostFromMatchPattern = (pattern: string): string | null => {
  const m = pattern.match(/^https?:\/\/([^/*]+)/)
  return m?.[1] ?? null
}

export const hostMatchesSitePatterns = (hostname: string, matchPatterns: string[]): boolean => {
  return matchPatterns.some((p) => {
    const h = hostFromMatchPattern(p)
    if (!h) {
      return false
    }
    return hostname === h || hostname.endsWith(`.${h}`)
  })
}

export const urlMatchesPdpPatterns = (
  pathname: string,
  href: string,
  patterns: SiteExtractorSite['pdpPathPatterns']
): boolean => {
  return patterns.some(({ regex, flags }) => {
    try {
      const re = new RegExp(regex, flags ?? '')
      return re.test(pathname) || re.test(href)
    } catch {
      return false
    }
  })
}

export const findSiteForLocation = (
  sites: SiteExtractorSite[],
  location: SiteLocation
): SiteExtractorSite | undefined =>
  sites.find(
    (s) =>
      hostMatchesSitePatterns(location.hostname, s.matchPatterns) &&
      urlMatchesPdpPatterns(location.pathname, location.href, s.pdpPathPatterns)
  )

export const isSiteHostAndPdp = (location: SiteLocation, site: SiteExtractorSite): boolean => {
  if (!hostMatchesSitePatterns(location.hostname, site.matchPatterns)) {
    return false
  }
  return urlMatchesPdpPatterns(location.pathname, location.href, site.pdpPathPatterns)
}

export const waitForSelector = (
  root: Document,
  selector: string,
  timeoutMs: number
): Promise<Element | null> =>
  new Promise((resolve) => {
    const pick = () => root.querySelector(selector)
    const immediate = pick()
    if (immediate) {
      resolve(immediate)
      return
    }
    const deadline = Date.now() + timeoutMs
    const finish = (el: Element | null) => {
      cleanup()
      resolve(el)
    }
    const check = () => {
      const el = pick()
      if (el || Date.now() >= deadline) {
        finish(el)
      }
    }
    const iv = setInterval(check, 50)
    const obs = new MutationObserver(() => {
      check()
    })
    obs.observe(root.documentElement, { childList: true, subtree: true })
    const cleanup = () => {
      clearInterval(iv)
      obs.disconnect()
    }
    check()
  })

const readOptionalField = async (
  document: Document,
  rule: { selector: string; waitUntilVisible?: boolean } | undefined
): Promise<string | undefined> => {
  if (!rule) {
    return undefined
  }
  const el = rule.waitUntilVisible
    ? await waitForSelector(document, rule.selector, READ_TIMEOUT_MS)
    : document.querySelector(rule.selector)
  return readTextFromElement(el)
}

const readTitle = async (
  document: Document,
  pageTitle: string,
  site: SiteExtractorSite
): Promise<string> => {
  const cfg = site.selectors.title
  const readOne = async (sel: string, wait: boolean) => {
    const el = wait ? await waitForSelector(document, sel, READ_TIMEOUT_MS) : document.querySelector(sel)
    return readTextFromElement(el)
  }
  const waitPrimary = Boolean(cfg.waitUntilVisible)
  const title =
    (await readOne(cfg.primary, waitPrimary)) ??
    (cfg.fallback ? await readOne(cfg.fallback, waitPrimary) : undefined) ??
    pageTitle
  return title
}

const extractProductIdFromUrl = (pathname: string, site: SiteExtractorSite): string | undefined => {
  const rule = site.productIdFromUrl
  if (!rule) {
    return undefined
  }
  try {
    const re = new RegExp(rule.regex, rule.flags ?? '')
    const full = pathname.match(re)
    if (!full) {
      return undefined
    }
    const g = rule.group ?? 1
    return full[g] ?? undefined
  } catch {
    return undefined
  }
}

const extractReviewSnippets = async (document: Document, site: SiteExtractorSite): Promise<string[]> => {
  const cfg = site.selectors.reviewSnippets
  if (!cfg) {
    return []
  }
  if (cfg.waitUntilVisible) {
    const firstSel = cfg.querySelectorAll.split(',')[0]?.trim() ?? cfg.querySelectorAll
    await waitForSelector(document, firstSel, READ_TIMEOUT_MS)
  }
  const nodes = Array.from(document.querySelectorAll(cfg.querySelectorAll))
  return nodes
    .map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean)
    .slice(0, cfg.maxItems ?? 10)
}

/**
 * Build {@link ProductPayload} for a tab using a validated site extractor config entry.
 */
export const buildProductPayloadFromConfig = async (
  document: Document,
  location: SiteLocation,
  pageTitle: string,
  site: SiteExtractorSite
): Promise<ProductPayload> => {
  const title = await readTitle(document, pageTitle, site)
  const extractedAt = new Date().toISOString()
  const asin = extractProductIdFromUrl(location.pathname, site)

  return productPayloadSchema.parse({
    retailer: site.id,
    locale: 'en-US',
    url: location.href,
    asin,
    title,
    displayedPrice: await readOptionalField(document, site.selectors.displayedPrice),
    ratingSummary: await readOptionalField(document, site.selectors.ratingSummary),
    reviewExcerpts: await extractReviewSnippets(document, site),
    sellerFulfillment: await readOptionalField(document, site.selectors.sellerFulfillment),
    extractedAt
  })
}
