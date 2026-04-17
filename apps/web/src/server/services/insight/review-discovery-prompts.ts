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

  if (flags.isServiceSite) {
    const query = buildDiscoverQuery([
      domain,
      titlePart,
      "reviews scam refund policy pricing alternatives"
    ])
    const intent = capIntent(`[CONTEXT]: I am a shopper evaluating a subscription or service before paying.
[INCLUDE]: ${sourceMixIntent}
[DEPTH]: Emphasis on whether the business/domain appears legitimate (not a scam), quality of refund/cancellation/return policy, overall customer satisfaction signals, and whether pricing is considered expensive compared to credible alternatives (value for money).
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
[DEPTH]: Emphasis on product pros and cons, real-world user satisfaction, recurring complaints or praise, and basic signals about seller or domain reliability (shipping, authenticity, support).
[EXCLUDE]: Thin affiliate roundup pages with no user substance; duplicate retailer catalog copy.`)

  return { query, intent }
}
