import { describe, expect, it } from "vitest"
import {
  insightErrorBodySchema,
  insightRequestSchema,
  insightResponseSchema
} from "./insight-contract"

const validProduct = {
  retailer: "amazon",
  locale: "en-US",
  url: "https://www.amazon.com/dp/B0DZZWMB2L",
  title: "Example product",
  extractedAt: "2026-04-15T12:00:00.000Z"
}

describe("insightRequestSchema", () => {
  it("parses product and flags together", () => {
    const parsed = insightRequestSchema.parse({
      product: validProduct,
      flags: { llmEnabled: true, pricingBetaEnabled: false }
    })
    expect(parsed.flags.llmEnabled).toBe(true)
    expect(parsed.product.title).toBe("Example product")
  })

  it("rejects when product is invalid", () => {
    const result = insightRequestSchema.safeParse({
      product: { ...validProduct, title: "" },
      flags: { llmEnabled: false, pricingBetaEnabled: false }
    })
    expect(result.success).toBe(false)
  })

  it("defaults skipAffiliate to false when omitted", () => {
    const parsed = insightRequestSchema.parse({
      product: validProduct,
      flags: { llmEnabled: true, pricingBetaEnabled: false }
    })
    expect(parsed.flags.skipAffiliate).toBe(false)
  })

  it("accepts skipAffiliate true", () => {
    const parsed = insightRequestSchema.parse({
      product: { ...validProduct, retailer: "acme-saas" },
      flags: { llmEnabled: true, pricingBetaEnabled: false, skipAffiliate: true }
    })
    expect(parsed.flags.skipAffiliate).toBe(true)
  })
})

describe("insightResponseSchema", () => {
  it("parses a minimal valid v1 response", () => {
    const body = {
      version: "1" as const,
      requestId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      cards: [
        {
          id: "card-1",
          kind: "reality_check" as const,
          title: "Title",
          bullets: [{ text: "Bullet" }]
        }
      ],
      limitations: ["None"],
      generatedAt: "2026-04-15T12:00:00.000Z"
    }
    const parsed = insightResponseSchema.parse(body)
    expect(parsed.version).toBe("1")
    expect(parsed.cards).toHaveLength(1)
  })

  it("rejects wrong version literal", () => {
    expect(() =>
      insightResponseSchema.parse({
        version: "2",
        requestId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        cards: [],
        limitations: [],
        generatedAt: "2026-04-15T12:00:00.000Z"
      })
    ).toThrow()
  })

  it("rejects non-UUID requestId", () => {
    expect(() =>
      insightResponseSchema.parse({
        version: "1",
        requestId: "not-uuid",
        cards: [
          {
            id: "x",
            kind: "reality_check",
            title: "t",
            bullets: [{ text: "b" }]
          }
        ],
        limitations: ["x"],
        generatedAt: "2026-04-15T12:00:00.000Z"
      })
    ).toThrow()
  })

  it("accepts optional pricingRows when valid", () => {
    const parsed = insightResponseSchema.parse({
      version: "1",
      requestId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      cards: [
        {
          id: "p",
          kind: "pricing_beta",
          title: "Pricing",
          bullets: [{ text: "Row" }]
        }
      ],
      pricingRows: [
        {
          label: "A",
          value: "1",
          sourceUrl: "https://example.com/",
          fetchedAt: "2026-04-15T12:00:00.000Z",
          caveat: "c"
        }
      ],
      limitations: [],
      generatedAt: "2026-04-15T12:00:00.000Z"
    })
    expect(parsed.pricingRows).toHaveLength(1)
  })

  it("accepts optional affiliateMatches when valid", () => {
    const parsed = insightResponseSchema.parse({
      version: "1",
      requestId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      cards: [
        {
          id: "c",
          kind: "reality_check",
          title: "T",
          bullets: [{ text: "b" }]
        }
      ],
      affiliateMatches: [
        {
          offerId: "offer-1",
          productName: "Other tent",
          description: "Lightweight 3-person tent",
          merchantName: "Example Merchant",
          networkName: "Example Network",
          priceDisplay: "99.00",
          currency: "USD",
          clickUrl: "https://example.com/out",
          directUrl: "https://example.com/product-direct",
          imageUrl: "https://example.com/i.jpg"
        }
      ],
      limitations: [],
      generatedAt: "2026-04-15T12:00:00.000Z"
    })
    expect(parsed.affiliateMatches).toHaveLength(1)
    expect(parsed.affiliateMatches?.[0]?.merchantName).toBe("Example Merchant")
  })
})

describe("insightErrorBodySchema", () => {
  it("defaults code to INTERNAL when omitted", () => {
    const parsed = insightErrorBodySchema.parse({ error: "oops" })
    expect(parsed.code).toBe("INTERNAL")
  })

  it("parses known error codes", () => {
    const parsed = insightErrorBodySchema.parse({
      error: "bad",
      code: "BAD_REQUEST",
      requestId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"
    })
    expect(parsed.code).toBe("BAD_REQUEST")
  })
})
