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
})
