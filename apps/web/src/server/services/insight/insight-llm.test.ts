import { insightRequestSchema, type InsightRequest } from "@shopfriend/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { runPriceCheckLlm, runReviewDiscoverySynthesis } from "./insight-llm"

type RequestOverrides = {
  product?: Partial<InsightRequest["product"]>
  flags?: Partial<InsightRequest["flags"]>
}

const mkPriceCheckRequest = (overrides?: RequestOverrides): InsightRequest =>
  insightRequestSchema.parse({
    product: {
      retailer: "amazon",
      locale: "en-US",
      url: "https://www.amazon.com/dp/B0DZZWMB2L",
      title: "Test product for LLM",
      reviewExcerpts: ["Snippet about quality from a review."],
      extractedAt: "2026-04-15T12:00:00.000Z",
      ...overrides?.product
    },
    flags: {
      llmEnabled: true,
      pricingBetaEnabled: false,
      skipAffiliate: false,
      insightKind: "price_check",
      isServiceSite: false,
      unsupportedDomainDiscovery: false,
      ...overrides?.flags
    }
  })

const mkReviewRequest = (overrides?: RequestOverrides): InsightRequest =>
  insightRequestSchema.parse({
    product: {
      retailer: "amazon",
      locale: "en-US",
      url: "https://www.amazon.com/dp/B0DZZWMB2L",
      title: "Test",
      reviewExcerpts: [],
      extractedAt: "2026-04-15T12:00:00.000Z",
      ...overrides?.product
    },
    flags: {
      llmEnabled: true,
      pricingBetaEnabled: false,
      skipAffiliate: true,
      insightKind: "review_discovery",
      isServiceSite: false,
      unsupportedDomainDiscovery: false,
      ...overrides?.flags
    }
  })

const openRouterAssistantBody = (content: string) =>
  JSON.stringify({
    choices: [{ message: { content } }]
  })

describe("runPriceCheckLlm", () => {
  const prevOpenRouter = process.env.OPENROUTER_API_KEY

  beforeEach(() => {
    vi.useFakeTimers()
    delete process.env.OPENROUTER_API_KEY
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    if (prevOpenRouter === undefined) {
      delete process.env.OPENROUTER_API_KEY
    } else {
      process.env.OPENROUTER_API_KEY = prevOpenRouter
    }
  })

  it("returns LLM-off card immediately when llmEnabled is false", async () => {
    const req = mkPriceCheckRequest({ flags: { llmEnabled: false } })
    const ac = new AbortController()
    const p = runPriceCheckLlm(req, {}, ac.signal)
    const result = await p
    expect(result.cards[0]?.id).toBe("reality-off")
  })

  it("uses stub and adds limitation when OPENROUTER_API_KEY is unset", async () => {
    const req = mkPriceCheckRequest()
    const ac = new AbortController()
    const p = runPriceCheckLlm(req, {}, ac.signal)
    await vi.advanceTimersByTimeAsync(150)
    const result = await p
    expect(result.cards.some((c) => c.id === "reality-check")).toBe(true)
    expect(result.limitations.some((l) => l.includes("OPENROUTER_API_KEY"))).toBe(true)
  })

  it("returns model cards when OpenRouter returns valid JSON", async () => {
    process.env.OPENROUTER_API_KEY = "test-or-key"
    const payload = {
      cards: [
        {
          id: "from-model",
          kind: "reality_check" as const,
          title: "API title",
          bullets: [{ text: "Only grounded claim per affiliate rows." }]
        }
      ],
      limitations: ["Test limitation"]
    }
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => openRouterAssistantBody(JSON.stringify(payload))
      })
    )

    const req = mkPriceCheckRequest()
    const ac = new AbortController()
    const result = await runPriceCheckLlm(req, {}, ac.signal)
    expect(result.cards).toEqual(payload.cards)
    expect(result.limitations).toEqual(payload.limitations)
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1)
  })

  it("falls back to stub when OpenRouter JSON fails schema validation", async () => {
    process.env.OPENROUTER_API_KEY = "test-or-key"
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => openRouterAssistantBody(JSON.stringify({ cards: [], limitations: [] }))
      })
    )

    const req = mkPriceCheckRequest()
    const ac = new AbortController()
    const p = runPriceCheckLlm(req, {}, ac.signal)
    await vi.advanceTimersByTimeAsync(150)
    const result = await p
    expect(result.cards.some((c) => c.id === "reality-check")).toBe(true)
    expect(result.limitations.some((l) => l.includes("failed validation"))).toBe(true)
  })

  it("falls back to stub when fetch rejects (e.g. aborted)", async () => {
    process.env.OPENROUTER_API_KEY = "test-or-key"
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError"))
    )

    const req = mkPriceCheckRequest()
    const ac = new AbortController()
    const p = runPriceCheckLlm(req, {}, ac.signal)
    await vi.advanceTimersByTimeAsync(150)
    const result = await p
    expect(result.cards.some((c) => c.id === "reality-check")).toBe(true)
    expect(result.limitations.some((l) => l.includes("OpenRouter error"))).toBe(true)
  })
})

describe("runReviewDiscoverySynthesis", () => {
  const prevOpenRouter = process.env.OPENROUTER_API_KEY

  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (prevOpenRouter === undefined) {
      delete process.env.OPENROUTER_API_KEY
    } else {
      process.env.OPENROUTER_API_KEY = prevOpenRouter
    }
  })

  it("returns null card when llm is disabled", async () => {
    const req = mkReviewRequest({ flags: { llmEnabled: false } })
    const out = await runReviewDiscoverySynthesis(
      req,
      [{ link: "https://a.com/1", title: "A", description: "d" }],
      new AbortController().signal
    )
    expect(out.card).toBeNull()
    expect(out.limitations).toHaveLength(0)
  })

  it("returns null card and limitation when API key is missing", async () => {
    const req = mkReviewRequest()
    const out = await runReviewDiscoverySynthesis(
      req,
      [{ link: "https://a.com/1", title: "A", description: "d" }],
      new AbortController().signal
    )
    expect(out.card).toBeNull()
    expect(out.limitations.some((l) => l.includes("OPENROUTER_API_KEY"))).toBe(true)
  })

  it("maps valid synthesis JSON to a review_themes card with discover citations", async () => {
    process.env.OPENROUTER_API_KEY = "test-or-key"
    const synthesis = {
      bullets: [
        { text: "First result looks relevant.", source_index: [0] },
        { text: "Second source adds context.", source_index: [1, 0] }
      ],
      sources_overview:
        "Sources 0–1 include forum-style discussion and a second page that adds context; themes focus on relevance and mixed signals.",
      limitations: ["Synthetic test"]
    }
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => openRouterAssistantBody(JSON.stringify(synthesis))
      })
    )

    const results = [
      { link: "https://ex.com/0", title: "T0", description: "D0" },
      { link: "https://ex.com/1", title: "T1", description: "D1" }
    ]
    const req = mkReviewRequest()
    const out = await runReviewDiscoverySynthesis(req, results, new AbortController().signal)
    expect(out.card?.id).toBe("discover-summary")
    expect(out.card?.kind).toBe("review_themes")
    expect(out.card?.bullets[0]?.citation?.anchorHint).toBe("discover:0")
    expect(out.card?.sourcesOverview).toContain("Sources 0–1")
    expect(out.limitations).toContain("Synthetic test")
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1)
  })

  it("returns null when model JSON fails validation after all retries", async () => {
    process.env.OPENROUTER_API_KEY = "test-or-key"
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => openRouterAssistantBody(JSON.stringify({ bullets: [] }))
      })
    )

    const req = mkReviewRequest()
    const out = await runReviewDiscoverySynthesis(
      req,
      [{ link: "https://a.com/1", title: "A", description: "d" }],
      new AbortController().signal
    )
    expect(out.card).toBeNull()
    expect(out.limitations.some((l) => l.includes("failed validation"))).toBe(true)
    expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(3)
  })

  it("retries synthesis and succeeds when a later attempt returns valid JSON", async () => {
    process.env.OPENROUTER_API_KEY = "test-or-key"
    const bad = { bullets: [] }
    const good = {
      bullets: [{ text: "Recovered on retry.", source_index: [0] }],
      sources_overview: "Single source (0) summarized after earlier invalid responses.",
      limitations: []
    }
    let calls = 0
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        calls += 1
        const payload = calls < 3 ? bad : good
        return Promise.resolve({
          ok: true,
          text: async () => openRouterAssistantBody(JSON.stringify(payload))
        })
      })
    )

    const req = mkReviewRequest()
    const out = await runReviewDiscoverySynthesis(
      req,
      [{ link: "https://a.com/1", title: "A", description: "d" }],
      new AbortController().signal
    )
    expect(out.card?.bullets[0]?.text).toBe("Recovered on retry.")
    expect(out.card?.sourcesOverview).toContain("Single source")
    expect(calls).toBe(3)
  })
})
