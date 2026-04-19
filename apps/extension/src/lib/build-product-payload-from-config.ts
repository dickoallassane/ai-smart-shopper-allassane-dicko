import { productPayloadSchema, type ProductPayload } from '@shopfriend/shared'
import type { SiteExtractorSite } from './site-extractor-config'

/** Retail PDP config always includes DOM selectors (validated before extraction). */
type RetailSiteWithSelectors = SiteExtractorSite & {
  selectors: NonNullable<SiteExtractorSite['selectors']>
}

export type SiteLocation = Pick<Location, 'href' | 'pathname' | 'hostname'>

const READ_TIMEOUT_MS = 8_000

/**
 * Hard caps before `productPayloadSchema.parse` — must match `packages/shared/src/product-payload.ts`.
 * Review excerpts are capped tighter (200) than schema max (2000): server only uses ~160 chars from
 * the first excerpt for prompts, and tiny snippets avoid huge DOM blobs from Amazon.
 */
const PAYLOAD_LIMITS = {
  title: 500,
  displayedPrice: 64,
  ratingSummary: 200,
  sellerFulfillment: 500,
  /** Per excerpt; schema allows 2000 each — we stay well under for stability. */
  reviewExcerpt: 200,
  asin: 16
} as const

type TruncateContext = { field: string; selector?: string }

const clampWithLog = (raw: string, maxLen: number, ctx: TruncateContext): string => {
  const t = raw.replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) {
    return t
  }
  console.warn('[ShopFriend][extract] Truncated DOM text to fit schema', {
    field: ctx.field,
    selector: ctx.selector,
    rawChars: t.length,
    maxLen,
    preview: `${t.slice(0, 80)}${t.length > 80 ? '…' : ''}`
  })
  return t.slice(0, maxLen)
}

const readTextFromElement = (el: Element | null, maxLen: number, ctx: TruncateContext): string | undefined => {
  if (!el?.textContent) {
    return undefined
  }
  return clampWithLog(el.textContent, maxLen, ctx)
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
  rule: { selector: string; waitUntilVisible?: boolean } | undefined,
  maxLen: number,
  field: string
): Promise<string | undefined> => {
  if (!rule) {
    return undefined
  }
  const el = rule.waitUntilVisible
    ? await waitForSelector(document, rule.selector, READ_TIMEOUT_MS)
    : document.querySelector(rule.selector)
  const out = readTextFromElement(el, maxLen, { field, selector: rule.selector })
  if (out !== undefined) {
    console.info('[ShopFriend][extract] Field captured', { field, selector: rule.selector, charCount: out.length })
  }
  return out
}

const readTitle = async (
  document: Document,
  pageTitle: string,
  site: RetailSiteWithSelectors
): Promise<string> => {
  const cfg = site.selectors.title
  const readOne = async (sel: string, wait: boolean, label: 'primary' | 'fallback') => {
    const el = wait ? await waitForSelector(document, sel, READ_TIMEOUT_MS) : document.querySelector(sel)
    return readTextFromElement(el, PAYLOAD_LIMITS.title, { field: `title.${label}`, selector: sel })
  }
  const waitPrimary = Boolean(cfg.waitUntilVisible)
  const fromPrimary = await readOne(cfg.primary, waitPrimary, 'primary')
  const fromFallback = cfg.fallback ? await readOne(cfg.fallback, waitPrimary, 'fallback') : undefined
  const fromPage = pageTitle.trim()
  const fromDocTitle = document.title.trim()
  const picked =
    fromPrimary !== undefined && fromPrimary.length > 0
      ? { text: fromPrimary, source: 'selector.primary' as const }
      : fromFallback !== undefined && fromFallback.length > 0
        ? { text: fromFallback, source: 'selector.fallback' as const }
        : fromPage.length > 0
          ? { text: fromPage, source: 'pageTitle' as const }
          : fromDocTitle.length > 0
            ? { text: fromDocTitle, source: 'document.title' as const }
            : null
  if (picked === null) {
    throw new Error('[ShopFriend] No product title found on page')
  }
  const title = clampWithLog(picked.text, PAYLOAD_LIMITS.title, {
    field: 'title',
    selector: picked.source.startsWith('selector') ? cfg.primary : undefined
  })
  console.info('[ShopFriend][extract] Title resolved', {
    retailer: site.id,
    source: picked.source,
    charCount: title.length
  })
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
    const raw = full[g] ?? undefined
    if (raw === undefined) {
      return undefined
    }
    if (raw.length > PAYLOAD_LIMITS.asin) {
      console.warn('[ShopFriend][extract] Truncated asin from URL capture', {
        field: 'asin',
        rawChars: raw.length,
        maxLen: PAYLOAD_LIMITS.asin
      })
    }
    return raw.slice(0, PAYLOAD_LIMITS.asin)
  } catch {
    return undefined
  }
}

const extractReviewSnippets = async (
  document: Document,
  site: RetailSiteWithSelectors
): Promise<string[]> => {
  const cfg = site.selectors.reviewSnippets
  if (!cfg) {
    return []
  }
  if (cfg.waitUntilVisible) {
    const firstSel = cfg.querySelectorAll.split(',')[0]?.trim() ?? cfg.querySelectorAll
    await waitForSelector(document, firstSel, READ_TIMEOUT_MS)
  }
  const nodes = Array.from(document.querySelectorAll(cfg.querySelectorAll))
  const maxItems = cfg.maxItems ?? 10
  const perNode: Array<{ index: number; rawChars: number; keptChars: number; truncated: boolean }> = []
  const excerpts = nodes
    .map((n, index) => {
      const raw = n.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      const maxLen = PAYLOAD_LIMITS.reviewExcerpt
      const kept = clampWithLog(raw, maxLen, {
        field: `reviewExcerpts[${index}]`,
        selector: cfg.querySelectorAll
      })
      perNode.push({
        index,
        rawChars: raw.length,
        keptChars: kept.length,
        truncated: raw.length > maxLen
      })
      return kept
    })
    .filter(Boolean)
    .slice(0, maxItems)

  console.info('[ShopFriend][extract] reviewSnippets', {
    retailer: site.id,
    querySelectorAll: cfg.querySelectorAll,
    maxItems,
    nodesMatched: nodes.length,
    excerptsKept: excerpts.length,
    perNode
  })
  return excerpts
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
  const extractedAt = new Date().toISOString()

  if (site.isService) {
    const rawTitle = pageTitle.trim() || document.title.trim() || 'Service'
    const title = clampWithLog(rawTitle, PAYLOAD_LIMITS.title, { field: 'title', selector: '(service site)' })
    console.info('[ShopFriend][extract] Service site payload', { retailer: site.id, titleChars: title.length })
    const parsed = productPayloadSchema.safeParse({
      retailer: site.id,
      locale: 'en-US',
      url: location.href,
      title,
      reviewExcerpts: [],
      extractedAt
    })
    if (!parsed.success) {
      console.error('[ShopFriend][extract] Service payload rejected by schema', parsed.error.flatten())
      throw new Error('[ShopFriend] Product payload validation failed')
    }
    return parsed.data
  }

  const selectors = site.selectors
  if (!selectors) {
    throw new Error(`[ShopFriend] Retail site "${site.id}" is missing selectors in config`)
  }
  const retailSite: RetailSiteWithSelectors = { ...site, selectors }

  const title = await readTitle(document, pageTitle, retailSite)
  const asin = extractProductIdFromUrl(location.pathname, site)

  const rawPayload = {
    retailer: site.id,
    locale: 'en-US',
    url: location.href,
    asin,
    title,
    displayedPrice: await readOptionalField(
      document,
      selectors.displayedPrice,
      PAYLOAD_LIMITS.displayedPrice,
      'displayedPrice'
    ),
    ratingSummary: await readOptionalField(
      document,
      selectors.ratingSummary,
      PAYLOAD_LIMITS.ratingSummary,
      'ratingSummary'
    ),
    reviewExcerpts: await extractReviewSnippets(document, retailSite),
    sellerFulfillment: await readOptionalField(
      document,
      selectors.sellerFulfillment,
      PAYLOAD_LIMITS.sellerFulfillment,
      'sellerFulfillment'
    ),
    extractedAt
  }

  const parsed = productPayloadSchema.safeParse(rawPayload)
  if (!parsed.success) {
    console.error('[ShopFriend][extract] Retail payload rejected by schema', {
      retailer: site.id,
      url: location.href,
      fieldLengths: {
        title: rawPayload.title.length,
        displayedPrice: rawPayload.displayedPrice?.length,
        ratingSummary: rawPayload.ratingSummary?.length,
        sellerFulfillment: rawPayload.sellerFulfillment?.length,
        reviewExcerptLengths: rawPayload.reviewExcerpts.map((s, i) => ({ i, len: s.length }))
      },
      zod: parsed.error.flatten()
    })
    throw new Error('[ShopFriend] Product payload validation failed')
  }
  console.info('[ShopFriend][extract] Retail payload OK', {
    retailer: site.id,
    titleChars: parsed.data.title.length,
    reviewExcerptCount: parsed.data.reviewExcerpts.length
  })
  return parsed.data
}
