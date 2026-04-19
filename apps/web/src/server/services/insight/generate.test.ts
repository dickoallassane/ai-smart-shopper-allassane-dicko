import { insightRequestSchema, insightResponseSchema, type InsightRequest } from "@shopfriend/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as affiliate from "../affiliate/searchAffiliateProducts"
import { generateInsight } from "./generate"

const baseProduct = {
  retailer: "amazon",
  locale: "en-US",
  url: "https://www.amazon.com/dp/B0DZZWMB2L",
  title: "Test product title for insight generation",
  reviewExcerpts: ["First review says the keyboard is fine for daily use."],
  extractedAt: "2026-04-15T12:00:00.000Z"
}

const request = (overrides: Partial<InsightRequest> = {}): InsightRequest =>
  insightRequestSchema.parse({
    product: { ...baseProduct, ...overrides.product },
    flags: {
      llmEnabled: true,
      pricingBetaEnabled: false,
      skipAffiliate: false,
      unsupportedDomainDiscovery: false,
      isServiceSite: false,
      insightKind: "price_check",
      ...overrides.flags
    }
  })

describe("generateInsight", () => {
  const prevOpenRouterKey = process.env.OPENROUTER_API_KEY

  beforeEach(() => {
    vi.useFakeTimers()
    delete process.env.OPENROUTER_API_KEY
  })

  afterEach(() => {
    vi.useRealTimers()
    if (prevOpenRouterKey === undefined) {
      delete process.env.OPENROUTER_API_KEY
    } else {
      process.env.OPENROUTER_API_KEY = prevOpenRouterKey
    }
  })

  it("returns response that satisfies insightResponseSchema when LLM is enabled", async () => {
    const ac = new AbortController()
    const promise = generateInsight(request(), ac.signal)
    await vi.advanceTimersByTimeAsync(200)
    const result = await promise
    expect(() => insightResponseSchema.parse(result)).not.toThrow()
    expect(result.cards.some((c) => c.id === "reality-check")).toBe(true)
  })

  it("returns LLM-off stub when llmEnabled is false", async () => {
    const ac = new AbortController()
    const promise = generateInsight(
      request({
        flags: {
          llmEnabled: false,
          pricingBetaEnabled: false,
          skipAffiliate: false,
          insightKind: "price_check",
          isServiceSite: false,
          unsupportedDomainDiscovery: false
        }
      }),
      ac.signal
    )
    await vi.advanceTimersByTimeAsync(50)
    const result = await promise
    expect(result.cards.some((c) => c.id === "reality-off")).toBe(true)
    expect(result.limitations.some((l) => l.includes("Summaries are disabled"))).toBe(true)
  })

  it("includes citation from first review excerpt when LLM is enabled", async () => {
    const ac = new AbortController()
    const promise = generateInsight(request(), ac.signal)
    await vi.advanceTimersByTimeAsync(200)
    const result = await promise
    const reality = result.cards.find((c) => c.id === "reality-check")
    expect(reality?.bullets[0]?.citation?.anchorHint).toBe("first-review")
  })

  it("rejects when parent signal is aborted before stub LLM completes", async () => {
    const ac = new AbortController()
    const promise = generateInsight(request(), ac.signal)
    const rejection = expect(promise).rejects.toThrow("aborted")
    await vi.advanceTimersByTimeAsync(50)
    ac.abort()
    await vi.advanceTimersByTimeAsync(100)
    await rejection
  })

  it("includes pricingRows stub when pricingBetaEnabled and no research token", async () => {
    const ac = new AbortController()
    const promise = generateInsight(
      request({
        flags: {
          llmEnabled: false,
          pricingBetaEnabled: true,
          skipAffiliate: false,
          insightKind: "price_check",
          isServiceSite: false,
          unsupportedDomainDiscovery: false
        }
      }),
      ac.signal
    )
    await vi.advanceTimersByTimeAsync(200)
    const result = await promise
    expect(result.pricingRows?.length).toBeGreaterThan(0)
    expect(result.pricingRows?.[0]?.label).toBe("Research provider")
  })

  describe("affiliate product search", () => {
    const prevKey = process.env.AFFILIATE_NETWORKS_API_KEY
    const prevBase = process.env.AFFILIATE_NETWORKS_API_BASE_URL

    beforeEach(() => {
      process.env.AFFILIATE_NETWORKS_API_KEY = "test-affiliate-key"
      process.env.AFFILIATE_NETWORKS_API_BASE_URL = "https://affiliate-api.test"
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          text: async () => "",
          json: async () => ({
            data: [
              {
                id: "offer-a",
                name: "Matched product title",
                final_price: 1299,
                currency: "USD",
                commission_url: "https://track.test/out",
                merchant: { name: "Other Store" },
                network: { name: "Net1" }
              }
            ]
          })
        })
      )
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

    it("merges affiliateMatches when Affiliate API returns rows", async () => {
      const ac = new AbortController()
      const promise = generateInsight(request(), ac.signal)
      await vi.advanceTimersByTimeAsync(200)
      const result = await promise
      expect(result.affiliateMatches).toHaveLength(1)
      expect(result.affiliateMatches?.[0]?.merchantName).toBe("Other Store")
      expect(result.affiliateMatches?.[0]?.clickUrl).toBe("https://track.test/out")
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://affiliate-api.test/v1/products",
        expect.objectContaining({ method: "POST" })
      )
    })

    it("does not call affiliate search when skipAffiliate is true", async () => {
      const spy = vi.spyOn(affiliate, "searchAffiliateProducts").mockResolvedValue({
        matches: [{ offerId: "x" } as never]
      })
      const ac = new AbortController()
      const promise = generateInsight(
        request({
          flags: {
            llmEnabled: true,
            pricingBetaEnabled: false,
            skipAffiliate: true,
            insightKind: "price_check",
            isServiceSite: false,
            unsupportedDomainDiscovery: false
          }
        }),
        ac.signal
      )
      await vi.advanceTimersByTimeAsync(200)
      const result = await promise
      expect(spy).toHaveBeenCalledTimes(0)
      expect(result.affiliateMatches).toBeUndefined()
      expect(result.limitations.some((l) => l.includes("Affiliate search skipped"))).toBe(true)
      spy.mockRestore()
    })
  })
})

describe("generateInsight review discovery (web research)", () => {
  const prevBright = process.env.BRIGHT_DATA_API_TOKEN

  afterEach(() => {
    vi.unstubAllGlobals()
    if (prevBright === undefined) {
      delete process.env.BRIGHT_DATA_API_TOKEN
    } else {
      process.env.BRIGHT_DATA_API_TOKEN = prevBright
    }
  })

  it("returns reviewDiscovery with ranked results when Discover succeeds", async () => {
    process.env.BRIGHT_DATA_API_TOKEN = "test-bright-token"
    const rows = Array.from({ length: 10 }, (_, i) => ({
      link: `https://example.com/review-${i}`,
      title: `Result ${i}`,
      description: `Snippet ${i}`,
      relevance_score: 0.9 - i * 0.01
    }))
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify({ status: "ok", task_id: "task-abc" })
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify({ status: "done", results: rows })
        })
    )

    const ac = new AbortController()
    const result = await generateInsight(
      request({
        flags: {
          llmEnabled: false,
          pricingBetaEnabled: false,
          skipAffiliate: true,
          insightKind: "review_discovery",
          isServiceSite: false,
          unsupportedDomainDiscovery: false
        }
      }),
      ac.signal
    )

    expect(result.reviewDiscovery?.results).toHaveLength(10)
    expect(result.reviewDiscovery?.results?.[0]?.title).toBe("Result 0")
    expect(result.cards.some((c) => c.id === "review-discovery-disclaimer")).toBe(true)
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalled()
    const postInit = vi.mocked(globalThis.fetch).mock.calls[0][1] as { body?: string }
    const posted = JSON.parse(postInit.body ?? "{}") as Record<string, unknown>
    expect(posted.query).toBeDefined()
    expect(posted.intent).toBeDefined()
    expect(posted.dedupe).toBeUndefined()
    expect(posted.include_content).toBeUndefined()
  })

  it("returns a neutral limitation when upstream research returns HTTP 401", async () => {
    process.env.BRIGHT_DATA_API_TOKEN = "test-bright-token"
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized"
      })
    )

    const ac = new AbortController()
    const result = await generateInsight(
      request({
        flags: {
          llmEnabled: false,
          pricingBetaEnabled: false,
          skipAffiliate: true,
          insightKind: "review_discovery",
          isServiceSite: false,
          unsupportedDomainDiscovery: false
        }
      }),
      ac.signal
    )

    expect(result.limitations.some((l) => l.includes("research authentication"))).toBe(true)
    expect(
      result.limitations.some((l) => l.toLowerCase().includes("bright data"))
    ).toBe(false)
  })

  it("does not call affiliate search for review_discovery", async () => {
    process.env.BRIGHT_DATA_API_TOKEN = "test-bright-token"
    const spy = vi.spyOn(affiliate, "searchAffiliateProducts").mockResolvedValue({
      matches: [{ offerId: "x" } as never]
    })
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          text: async () => JSON.stringify({ status: "ok", task_id: "t1" })
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () =>
            JSON.stringify({
              status: "done",
              results: [
                {
                  link: "https://www.trustpilot.com/review/example",
                  title: "Trustpilot page",
                  relevance_score: 0.91
                }
              ]
            })
        })
    )

    const ac = new AbortController()
    await generateInsight(
      request({
        flags: {
          llmEnabled: false,
          pricingBetaEnabled: false,
          skipAffiliate: false,
          insightKind: "review_discovery",
          isServiceSite: false,
          unsupportedDomainDiscovery: false
        }
      }),
      ac.signal
    )

    expect(spy).toHaveBeenCalledTimes(0)
    spy.mockRestore()
  })
})
