import type { InsightRequest } from "@shopfriend/shared"

const hostFromProductUrl = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return "unknown"
  }
}

/** SERP / Discover backends often reject very long queries; Amazon titles can be huge. */
const MAX_DISCOVER_QUERY_CHARS = 420
const MAX_TITLE_SNIPPET_CHARS = 220
const MAX_TITLE_WITH_ASIN_CHARS = 100
const MAX_INTENT_CHARS = 2800

const compactWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim()

const stripInvisibleAndPipes = (value: string): string =>
  value
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
    .replace(/\|/g, " ")

/**
 * Strip characters that have caused 400s on some search proxies (unbalanced `"`, control chars).
 */
const titleSnippetForQuery = (title: string, maxLen: number): string =>
  stripInvisibleAndPipes(
    compactWhitespace(title)
      .replace(/"/g, "")
      .replace(/[\u0000-\u001f]/g, " ")
      .slice(0, maxLen)
  )

const buildDiscoverQuery = (segments: string[]): string => {
  const raw = compactWhitespace(segments.filter(Boolean).join(" "))
  if (raw.length <= MAX_DISCOVER_QUERY_CHARS) {
    return raw
  }
  return `${raw.slice(0, MAX_DISCOVER_QUERY_CHARS - 1)}…`
}

const capIntent = (intent: string): string =>
  intent.length <= MAX_INTENT_CHARS ? intent : `${intent.slice(0, MAX_INTENT_CHARS - 1)}…`

const sourceMixIntent = `Prioritize diverse third-party sources including Trustpilot, Reddit, YouTube, independent review sites, consumer forums, and reputable editorial reviews.
Focus on authentic user experiences, concrete pros/cons, and verifiable claims where possible.
Strictly exclude the brand's own marketing landing pages as primary evidence when independent sources exist.`

/** For open-web / unknown-site discovery: keep diversity but force topical overlap with THIS hostname. */
const domainAnchoredInclude = (hostname: string): string =>
  `Prioritize pages that clearly discuss "${hostname}" or the same product/program named in the tab title (synonyms only if unambiguous). ` +
  `Use Trustpilot, Reddit, YouTube, forums, podcasts, or editorials when they mention this site or offering by name. ` +
  `Strongly down-rank generic articles about online reviews, fake reviews, FTC rules, or consumer-reporting topics that never name "${hostname}".`

const retailSerpTail =
  "reviews pros cons trustpilot reddit youtube"

const isTenCharAsin = (value: string): boolean => /^[A-Z0-9]{10}$/i.test(value)

const asinFromAmazonStyleUrl = (url: string): string => {
  try {
    const m = new URL(url).pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|\?|$)/i)
    return m?.[1]?.toUpperCase() ?? ""
  } catch {
    return ""
  }
}

/**
 * Bright Data Discover `query` (SERP string) and `intent` (AI relevance ranking brief).
 * @see https://docs.brightdata.com/api-reference/discover/overview
 */
export const buildReviewDiscoveryPrompts = (
  request: InsightRequest
): { query: string; intent: string } => {
  const { product, flags } = request
  const domain = hostFromProductUrl(product.url)
  const titlePart = titleSnippetForQuery(product.title, MAX_TITLE_SNIPPET_CHARS)

  if (flags.unsupportedDomainDiscovery) {
    /** Lead with hostname twice + title so the SERP-style string stays anchored; generic tails alone drift to unrelated “review industry” pages. */
    const query = buildDiscoverQuery([
      domain,
      `${domain} reviews experience`,
      titlePart,
      "reddit forum trustpilot scam refund"
    ])
    const intent = capIntent(`[ANCHOR]: Rank highest only sources that substantively mention hostname "${domain}" OR the specific offering implied by the tab title. Treat generic guidance about online reviews, FTC enforcement, or “how to spot fake reviews” as low relevance unless "${domain}" appears.
[CONTEXT]: I am evaluating this exact website before trusting it (ShopFriend has no structured PDP for this tab).
[INCLUDE]: ${domainAnchoredInclude(domain)}
[DEPTH]: User satisfaction or complaints about this site/program, scam or legitimacy signals tied to "${domain}", refund or chargeback stories naming this business, and whether third parties call it trustworthy.
[EXCLUDE]: Thin SEO pages with no named tie to "${domain}"; the site's own marketing as sole evidence when independent discussion exists.`)

    return { query, intent }
  }

  if (flags.isServiceSite) {
    const query = buildDiscoverQuery([
      domain,
      titlePart,
      "reviews scam refund policy pricing alternatives"
    ])
    const intent = capIntent(`[CONTEXT]: I am a shopper evaluating a subscription or service before paying.
[INCLUDE]: ${sourceMixIntent}
[DEPTH]: Emphasis on overall user satisfaction, return/refund/cancellation policy quality, scam or legitimacy red flags, and whether pricing feels fair versus credible alternatives.
[EXCLUDE]: Generic SEO listicles with no substantive discussion; unmoderated spam pages.`)

    return { query, intent }
  }

  const asinRaw = typeof product.asin === "string" ? product.asin.trim() : ""
  const asinFromField = isTenCharAsin(asinRaw) ? asinRaw.toUpperCase() : ""
  const asinFromLinkRaw = asinFromAmazonStyleUrl(product.url)
  const asinFromLink = isTenCharAsin(asinFromLinkRaw) ? asinFromLinkRaw : ""
  const asin = asinFromField || asinFromLink

  /**
   * Retail PDPs (Amazon especially): long titles + odd punctuation often trigger Discover 400s.
   * When we have a canonical ASIN, lead with it and keep the title fragment short — same broad
   * shape as the service branch (stable leading token + shorter tail).
   */
  const query = asin
    ? buildDiscoverQuery([
        asin,
        titleSnippetForQuery(product.title, MAX_TITLE_WITH_ASIN_CHARS),
        retailSerpTail,
        domain
      ])
    : buildDiscoverQuery([domain, titlePart, retailSerpTail])

  const intent = capIntent(`[CONTEXT]: I am comparing a physical or digital product before purchase.
[INCLUDE]: ${sourceMixIntent}
[DEPTH]: Emphasis on user satisfaction with the product, durability and longevity, real-world use cases, clear pros and cons from owners, plus light signals on seller or domain reliability (shipping, authenticity, support) when relevant.
[EXCLUDE]: Thin affiliate roundup pages with no user substance; duplicate retailer catalog copy.`)

  return { query, intent }
}
