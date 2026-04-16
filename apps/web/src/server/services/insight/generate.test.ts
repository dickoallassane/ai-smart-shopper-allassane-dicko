import { insightResponseSchema, type InsightRequest } from "@shopfriend/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { generateInsight } from "./generate"

const baseProduct = {
  retailer: "amazon" as const,
  locale: "en-US",
  url: "https://www.amazon.com/dp/B0DZZWMB2L",
  title: "Test product title for insight generation",
  reviewExcerpts: ["First review says the keyboard is fine for daily use."],
  extractedAt: "2026-04-15T12:00:00.000Z"
}

const request = (overrides: Partial<InsightRequest> = {}): InsightRequest => ({
  product: { ...baseProduct, ...overrides.product },
  flags: {
    llmEnabled: true,
    pricingBetaEnabled: false,
    ...overrides.flags
  }
})

describe("generateInsight", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
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
      request({ flags: { llmEnabled: false, pricingBetaEnabled: false } }),
      ac.signal
    )
    await vi.advanceTimersByTimeAsync(50)
    const result = await promise
    expect(result.cards.some((c) => c.id === "reality-off")).toBe(true)
    expect(result.limitations.some((l) => l.includes("LLM disabled"))).toBe(true)
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

  it("includes pricingRows stub when pricingBetaEnabled and no Bright Data token", async () => {
    const ac = new AbortController()
    const promise = generateInsight(
      request({
        flags: { llmEnabled: false, pricingBetaEnabled: true }
      }),
      ac.signal
    )
    await vi.advanceTimersByTimeAsync(200)
    const result = await promise
    expect(result.pricingRows?.length).toBeGreaterThan(0)
    expect(result.pricingRows?.[0]?.label).toBe("Bright Data")
  })
})
