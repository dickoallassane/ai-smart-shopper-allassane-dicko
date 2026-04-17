import { insightRequestSchema, type InsightRequest } from "@shopfriend/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { searchAffiliateProducts } from "./searchAffiliateProducts"

const amazonRequest = (): InsightRequest =>
  insightRequestSchema.parse({
    product: {
      retailer: "amazon",
      locale: "en-US",
      url: "https://www.amazon.com/dp/B09MQLP33J",
      title: "HDMI cable pack",
      reviewExcerpts: [],
      extractedAt: "2026-04-17T12:00:00.000Z"
    },
    flags: { llmEnabled: true, pricingBetaEnabled: false, skipAffiliate: false }
  })

describe("searchAffiliateProducts same-retailer filter", () => {
  const prevKey = process.env.AFFILIATE_NETWORKS_API_KEY
  const prevBase = process.env.AFFILIATE_NETWORKS_API_BASE_URL

  beforeEach(() => {
    process.env.AFFILIATE_NETWORKS_API_KEY = "test-key"
    process.env.AFFILIATE_NETWORKS_API_BASE_URL = "https://affiliate-api.test"
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (prevKey === undefined) {
      delete process.env.AFFILIATE_NETWORKS_API_KEY
    } else {
      process.env.AFFILIATE_NETWORKS_API_KEY = prevKey
    }
    if (prevBase === undefined) {
      delete process.env.AFFILIATE_NETWORKS_API_BASE_URL
    } else {
      process.env.AFFILIATE_NETWORKS_API_BASE_URL = prevBase
    }
  })

  it("skips rows whose direct URL is on the same domain as the PDP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "",
        json: async () => ({
          data: [
            {
              id: "a1",
              name: "Same on Amazon",
              final_price: 10,
              currency: "USD",
              commission_url: "https://track.test/a1",
              direct_url: "https://www.amazon.com/dp/B0OTHER",
              merchant: { name: "Amazon" },
              network: { name: "N1" }
            },
            {
              id: "a2",
              name: "Also Amazon",
              final_price: 11,
              currency: "USD",
              commission_url: "https://track.test/a2",
              direct_url: "https://amazon.com/gp/product/X",
              merchant: { name: "Amazon" },
              network: { name: "N1" }
            },
            {
              id: "w1",
              name: "Walmart listing",
              final_price: 9,
              currency: "USD",
              commission_url: "https://track.test/w1",
              direct_url: "https://www.walmart.com/ip/hdmi-cable/12345",
              merchant: { name: "Walmart" },
              network: { name: "N1" }
            }
          ]
        })
      })
    )

    const ac = new AbortController()
    const result = await searchAffiliateProducts(amazonRequest(), ac.signal)

    expect(result.matches).toHaveLength(1)
    expect(result.matches?.[0]?.merchantName).toBe("Walmart")
    expect(result.matches?.[0]?.directUrl).toContain("walmart.com")
    expect(result.limitation).toBeUndefined()
  })

  it("returns a limitation when every mappable row is the same retailer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => "",
        json: async () => ({
          data: [
            {
              id: "x1",
              name: "On Amazon",
              final_price: 10,
              currency: "USD",
              commission_url: "https://track.test/x1",
              direct_url: "https://www.amazon.com/dp/B0AAA",
              merchant: { name: "A" },
              network: { name: "N" }
            }
          ]
        })
      })
    )

    const ac = new AbortController()
    const result = await searchAffiliateProducts(amazonRequest(), ac.signal)

    expect(result.matches).toBeUndefined()
    expect(result.limitation).toMatch(/same retailer/i)
  })
})
