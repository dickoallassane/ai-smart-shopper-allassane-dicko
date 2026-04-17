import { describe, expect, it } from "vitest"
import { insightRequestSchema } from "@shopfriend/shared"
import { buildReviewDiscoveryPrompts } from "./review-discovery-prompts"

const baseProduct = {
  retailer: "amazon",
  locale: "en-US",
  url: "https://www.amazon.com/dp/B0TEST1234",
  title: 'Widget 6" Pro — "Best Seller" Edition for Home & Office Use',
  reviewExcerpts: [],
  extractedAt: "2026-04-17T12:00:00.000Z"
}

describe("buildReviewDiscoveryPrompts", () => {
  it("does not wrap retail product title in double quotes", () => {
    const req = insightRequestSchema.parse({
      product: baseProduct,
      flags: {
        llmEnabled: true,
        pricingBetaEnabled: false,
        skipAffiliate: false,
        insightKind: "review_discovery",
        isServiceSite: false
      }
    })
    const { query } = buildReviewDiscoveryPrompts(req)
    expect(query.startsWith('"')).toBe(false)
    expect(query).not.toContain('"Best Seller"')
  })

  it("derives ASIN from Amazon-style URL when the payload omits asin", () => {
    const { asin: _omitAsin, ...productWithoutAsin } = baseProduct
    const req = insightRequestSchema.parse({
      product: {
        ...productWithoutAsin,
        url: "https://www.amazon.com/dp/B0ZZZZZZZZ/ref=something"
      },
      flags: {
        llmEnabled: true,
        pricingBetaEnabled: false,
        skipAffiliate: false,
        insightKind: "review_discovery",
        isServiceSite: false
      }
    })
    const { query } = buildReviewDiscoveryPrompts(req)
    expect(query.startsWith("B0ZZZZZZZZ")).toBe(true)
  })

  it("leads retail query with normalized ASIN when provided", () => {
    const req = insightRequestSchema.parse({
      product: { ...baseProduct, asin: "b0test1234" },
      flags: {
        llmEnabled: true,
        pricingBetaEnabled: false,
        skipAffiliate: false,
        insightKind: "review_discovery",
        isServiceSite: false
      }
    })
    const { query } = buildReviewDiscoveryPrompts(req)
    expect(query.startsWith("B0TEST1234")).toBe(true)
    expect(query).toContain("reviews pros cons trustpilot")
  })

  it("without ASIN, leads with domain like the service branch", () => {
    const longTitle = "B".repeat(500)
    const req = insightRequestSchema.parse({
      product: {
        ...baseProduct,
        retailer: "target",
        url: "https://www.target.com/p/long-slug/-/A-12345678",
        title: longTitle
      },
      flags: {
        llmEnabled: true,
        pricingBetaEnabled: false,
        skipAffiliate: false,
        insightKind: "review_discovery",
        isServiceSite: false
      }
    })
    const { query } = buildReviewDiscoveryPrompts(req)
    expect(query.startsWith("www.target.com")).toBe(true)
    expect(query).toContain("reviews pros cons trustpilot")
    expect(query.length).toBeLessThan(360)
  })

  it("uses domain-led query when unsupportedDomainDiscovery is true", () => {
    const req = insightRequestSchema.parse({
      product: {
        retailer: "open_web",
        locale: "en-US",
        url: "https://weird.shop/deal",
        title: "Flash deals landing",
        reviewExcerpts: [],
        extractedAt: "2026-04-17T12:00:00.000Z"
      },
      flags: {
        llmEnabled: true,
        pricingBetaEnabled: false,
        skipAffiliate: true,
        insightKind: "review_discovery",
        isServiceSite: false,
        unsupportedDomainDiscovery: true
      }
    })
    const { query, intent } = buildReviewDiscoveryPrompts(req)
    expect(query.startsWith("weird.shop")).toBe(true)
    expect(query).toContain("weird.shop reviews experience")
    expect(query).toMatch(/trustpilot|reddit/i)
    expect(intent).toContain("[ANCHOR]")
    expect(intent).toContain("weird.shop")
    expect(intent.toLowerCase()).toContain("fake reviews")
  })

  it("service branch intent stresses satisfaction, refund policy, and scam signals", () => {
    const req = insightRequestSchema.parse({
      product: {
        retailer: "madmuscles",
        locale: "en-US",
        url: "https://www.madmuscles.com/",
        title: "Coaching",
        reviewExcerpts: [],
        extractedAt: "2026-04-17T12:00:00.000Z"
      },
      flags: {
        llmEnabled: true,
        pricingBetaEnabled: false,
        skipAffiliate: true,
        insightKind: "review_discovery",
        isServiceSite: true,
        unsupportedDomainDiscovery: false
      }
    })
    const { intent } = buildReviewDiscoveryPrompts(req)
    const lower = intent.toLowerCase()
    expect(lower).toContain("user satisfaction")
    expect(lower).toContain("return/refund")
    expect(lower).toContain("scam")
  })

  it("retail branch intent stresses durability, use cases, and pros and cons", () => {
    const req = insightRequestSchema.parse({
      product: baseProduct,
      flags: {
        llmEnabled: true,
        pricingBetaEnabled: false,
        skipAffiliate: false,
        insightKind: "review_discovery",
        isServiceSite: false,
        unsupportedDomainDiscovery: false
      }
    })
    const { intent } = buildReviewDiscoveryPrompts(req)
    const lower = intent.toLowerCase()
    expect(lower).toContain("user satisfaction")
    expect(lower).toContain("durability")
    expect(lower).toContain("use cases")
    expect(lower).toContain("pros and cons")
  })
})
