import {
  insightResponseSchema,
  reviewDiscoveryResultSchema,
  type InsightRequest,
  type InsightResponse,
  type ReviewDiscovery
} from "@shopfriend/shared"
import { getServerEnv } from "@/lib/env"
import {
  searchAffiliateProducts,
  type AffiliateSearchResult
} from "@/server/services/affiliate/searchAffiliateProducts"
import {
  DiscoverHttpError,
  executeDiscover,
  mapDiscoverItemToReviewResult
} from "./bright-data-discover"
import { buildReviewDiscoveryPrompts } from "./review-discovery-prompts"

const INSIGHT_TIMEOUT_MS = 12_000
const REVIEW_DISCOVERY_TIMEOUT_MS = 78_000

type LlmResult = Pick<InsightResponse, "cards" | "limitations">

const runStubLlm = async (request: InsightRequest, signal: AbortSignal): Promise<LlmResult> => {
  if (!request.flags.llmEnabled) {
    return {
      cards: [
        {
          id: "reality-off",
          kind: "reality_check" as const,
          title: "Reality check",
          bullets: [
            {
              text: "LLM is disabled. Enable LLM in settings to generate richer summaries."
            }
          ]
        }
      ],
      limitations: ["LLM disabled for this request."]
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 120))
  if (signal.aborted) {
    throw new Error("aborted")
  }

  const excerpt = request.product.reviewExcerpts[0]?.slice(0, 160)
  return {
    cards: [
      {
        id: "reality-check",
        kind: "reality_check" as const,
        title: "Reality check (stub)",
        bullets: [
          {
            text: `Grounded stub summary for “${request.product.title.slice(0, 80)}”.`,
            citation: excerpt
              ? { text: excerpt, anchorHint: "first-review" }
              : undefined
          },
          {
            text: "Replace stub with real LLM output validated by Zod before returning."
          }
        ]
      },
      {
        id: "returns",
        kind: "returns" as const,
        title: "Returns & shipping",
        bullets: [
          {
            text: "Use retailer link-out (R3-A) in product UI; this card is a placeholder."
          }
        ]
      }
    ],
    limitations: [
      "Stub response only — no live model call in this build unless OPENAI_API_KEY is wired (future).",
      "Always cite on-page excerpts when using a real model."
    ]
  }
}

type PricingResult = NonNullable<InsightResponse["pricingRows"]>

const runStubBrightData = async (
  request: InsightRequest,
  signal: AbortSignal
): Promise<PricingResult | undefined> => {
  if (!request.flags.pricingBetaEnabled) {
    return undefined
  }

  const env = getServerEnv()
  if (!env.BRIGHT_DATA_API_TOKEN) {
    return [
      {
        label: "Bright Data",
        value: "not configured",
        sourceUrl: "https://docs.brightdata.com/",
        fetchedAt: new Date().toISOString(),
        caveat: "BRIGHT_DATA_API_TOKEN missing — stub row for wiring verification."
      }
    ]
  }

  await new Promise((resolve) => setTimeout(resolve, 80))
  if (signal.aborted) {
    throw new Error("aborted")
  }

  return [
    {
      label: "Example offer",
      value: request.product.displayedPrice ?? "n/a",
      sourceUrl: request.product.url,
      fetchedAt: new Date().toISOString(),
      caveat: "Vendor pipeline not implemented — replace with real Bright Data mapping."
    }
  ]
}

const reviewDiscoveryDisclaimerCard = {
  id: "review-discovery-disclaimer",
  kind: "reputation" as const,
  title: "Web research (Bright Data Discover)",
  bullets: [
    {
      text: "These links are ranked third-party web results, not verified facts. Treat as starting points for your own judgment."
    }
  ]
}

const generateReviewDiscoveryInsight = async (
  request: InsightRequest,
  signal: AbortSignal
): Promise<InsightResponse> => {
  const requestId = crypto.randomUUID()
  const generatedAt = new Date().toISOString()
  const env = getServerEnv()
  const token = env.BRIGHT_DATA_API_TOKEN

  if (!token) {
    return insightResponseSchema.parse({
      version: "1",
      requestId,
      cards: [reviewDiscoveryDisclaimerCard],
      limitations: [
        "Bright Data is not configured. Set BRIGHT_DATA_API_TOKEN or BRIGHT_DATA_API_KEY on the server."
      ],
      generatedAt
    })
  }

  const { query, intent } = buildReviewDiscoveryPrompts(request)
  /** Only fields documented in Bright Data Discover examples — extra keys return 400. */
  const discoverBody: Record<string, unknown> = {
    query,
    intent,
    num_results: 10,
    language: "en",
    format: "json"
  }

  const limitations: string[] = [
    "Third-party opinions from the open web only — not financial, legal, or medical advice."
  ]

  try {
    const rawItems = await executeDiscover(discoverBody, token, signal, {
      maxPollMs: REVIEW_DISCOVERY_TIMEOUT_MS - 4_000,
      pollIntervalMs: 600
    })
    const results = rawItems
      .map(mapDiscoverItemToReviewResult)
      .map((row) => reviewDiscoveryResultSchema.safeParse(row))
      .filter((r) => r.success)
      .map((r) => r.data)
      .slice(0, 10)

    const reviewDiscovery: ReviewDiscovery = {
      query,
      intent,
      results
    }

    return insightResponseSchema.parse({
      version: "1",
      requestId,
      cards: [reviewDiscoveryDisclaimerCard],
      reviewDiscovery,
      limitations,
      generatedAt
    })
  } catch (error) {
    if (error instanceof DiscoverHttpError) {
      if (error.status === 401) {
        limitations.push("Bright Data rejected the API key (401). Check BRIGHT_DATA_API_TOKEN / BRIGHT_DATA_API_KEY.")
      } else if (error.status === 403) {
        limitations.push(
          "Bright Data Discover may not be enabled for this account (403). Contact Bright Data support to enable Discover."
        )
      } else if (error.status === 429) {
        limitations.push("Bright Data rate limit (429). Try again in a few minutes.")
      } else if (error.status === 400) {
        const detail = error.responseBody?.trim() ?? ""
        const line =
          detail.length > 0
            ? `Bright Data rejected the request (400): ${detail}`
            : "Bright Data rejected the request (400). Check query length and supported body parameters."
        limitations.push(line.slice(0, 500))
      } else {
        const detail = error.responseBody?.trim() ?? ""
        const line =
          detail.length > 0
            ? `Bright Data request failed (${error.status}): ${detail}`
            : `Bright Data request failed (${error.status}).`
        limitations.push(line.slice(0, 500))
      }
    } else if (error instanceof DOMException && error.name === "AbortError") {
      limitations.push("Review discovery was cancelled or timed out.")
      throw error
    } else if (error instanceof Error) {
      limitations.push(error.message)
    } else {
      limitations.push("Review discovery failed with an unknown error.")
    }

    return insightResponseSchema.parse({
      version: "1",
      requestId,
      cards: [reviewDiscoveryDisclaimerCard],
      limitations,
      generatedAt
    })
  }
}

export const generateInsight = async (
  request: InsightRequest,
  signal: AbortSignal
): Promise<InsightResponse> => {
  if (request.flags.insightKind === "review_discovery") {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REVIEW_DISCOVERY_TIMEOUT_MS)
    const onParentAbort = () => controller.abort()
    signal.addEventListener("abort", onParentAbort)
    try {
      return await generateReviewDiscoveryInsight(request, controller.signal)
    } finally {
      clearTimeout(timer)
      signal.removeEventListener("abort", onParentAbort)
    }
  }

  const requestId = crypto.randomUUID()
  const generatedAt = new Date().toISOString()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), INSIGHT_TIMEOUT_MS)
  const onParentAbort = () => controller.abort()
  signal.addEventListener("abort", onParentAbort)

  try {
    const skipAffiliate = request.flags.skipAffiliate === true

    const [llm, pricingRows, affiliate] = await Promise.all([
      runStubLlm(request, controller.signal),
      runStubBrightData(request, controller.signal),
      skipAffiliate
        ? Promise.resolve({} as AffiliateSearchResult)
        : searchAffiliateProducts(request, controller.signal)
    ])

    const limitations = [...llm.limitations]
    if (skipAffiliate) {
      limitations.push("Affiliate search skipped (service or non-retail context).")
    } else if (affiliate.limitation) {
      limitations.push(affiliate.limitation)
    }

    const merged: InsightResponse = {
      version: "1",
      requestId,
      cards: llm.cards,
      pricingRows,
      affiliateMatches: affiliate.matches?.length ? affiliate.matches : undefined,
      limitations,
      generatedAt
    }

    return insightResponseSchema.parse(merged)
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", onParentAbort)
  }
}
