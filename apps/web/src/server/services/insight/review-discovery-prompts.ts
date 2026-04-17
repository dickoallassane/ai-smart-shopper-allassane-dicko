import type { InsightRequest } from "@shopfriend/shared"

const hostFromProductUrl = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return "unknown"
  }
}

const sourceMixIntent = `Prioritize diverse third-party sources including Trustpilot, Reddit, YouTube, independent review sites, consumer forums, and reputable editorial reviews.
Focus on authentic user experiences, concrete pros/cons, and verifiable claims where possible.
Strictly exclude the brand's own marketing landing pages as primary evidence when independent sources exist.`

/**
 * Bright Data Discover `query` (SERP string) and `intent` (AI relevance ranking brief).
 * @see https://docs.brightdata.com/api-reference/discover/overview
 */
export const buildReviewDiscoveryPrompts = (
  request: InsightRequest
): { query: string; intent: string } => {
  const { product, flags } = request
  const domain = hostFromProductUrl(product.url)

  if (flags.isServiceSite) {
    const query = `${domain} ${product.title} reviews scam refund policy pricing alternatives`
    const intent = `[CONTEXT]: I am a shopper evaluating a subscription or service before paying.
[INCLUDE]: ${sourceMixIntent}
[DEPTH]: Emphasis on whether the business/domain appears legitimate (not a scam), quality of refund/cancellation/return policy, overall customer satisfaction signals, and whether pricing is considered expensive compared to credible alternatives (value for money).
[EXCLUDE]: Generic SEO listicles with no substantive discussion; unmoderated spam pages.`

    return { query, intent }
  }

  const query = `"${product.title}" reviews pros cons ${domain}`
  const intent = `[CONTEXT]: I am comparing a physical or digital product before purchase.
[INCLUDE]: ${sourceMixIntent}
[DEPTH]: Emphasis on product pros and cons, real-world user satisfaction, recurring complaints or praise, and basic signals about seller or domain reliability (shipping, authenticity, support).
[EXCLUDE]: Thin affiliate roundup pages with no user substance; duplicate retailer catalog copy.`

  return { query, intent }
}
