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
import { DiscoverHttpError, executeDiscover, mapDiscoverItemToReviewResult } from "./bright-data-discover"
import { formatInsightNetworkError } from "./format-insight-network-error"
import { runPriceCheckLlm, runReviewDiscoverySynthesis } from "./insight-llm"
import { buildReviewDiscoveryPrompts } from "./review-discovery-prompts"
import {
  OPENWEB_ADVICE_DISCLAIMER,
  RESEARCH_DISCLAIMER_CARD_TITLE,
  serverResearchBadRequest,
  serverResearchUpstream,
  SERVER_FEATURE_NOT_AVAILABLE,
  SERVER_RATE_LIMITED,
  SERVER_RESEARCH_AUTH_FAILED,
  WEB_RESEARCH_CANCELLED_OR_TIMED_OUT,
  WEB_RESEARCH_NOT_CONFIGURED,
  WEB_RESEARCH_UNKNOWN_FAILURE
} from "./user-facing-messages"

/** Affiliate + optional pricing research can take several seconds; summary step has its own budget. */
const INSIGHT_TIMEOUT_MS = 28_000
const REVIEW_DISCOVERY_TIMEOUT_MS = 78_000

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
        label: "Research provider",
        value: "not configured",
        sourceUrl: request.product.url,
        fetchedAt: new Date().toISOString(),
        caveat: "Pricing research token missing on server — stub row for wiring verification."
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
      caveat: "Vendor pipeline not implemented — replace with real pricing research mapping."
    }
  ]
}

const reviewDiscoveryDisclaimerCard = {
  id: "review-discovery-disclaimer",
  kind: "reputation" as const,
  title: RESEARCH_DISCLAIMER_CARD_TITLE,
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
      limitations: [WEB_RESEARCH_NOT_CONFIGURED],
      generatedAt
    })
  }

  const { query, intent } = buildReviewDiscoveryPrompts(request)
  /** Only fields documented for the Discover API — extra keys can return 400 upstream. */
  const discoverBody: Record<string, unknown> = {
    query,
    intent,
    num_results: 10,
    language: "en",
    format: "json"
  }

  const limitations: string[] = [OPENWEB_ADVICE_DISCLAIMER]

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

    const synth = await runReviewDiscoverySynthesis(request, results, signal)
    const mergedLimitations = [...limitations, ...synth.limitations]
    const cards = synth.card
      ? [reviewDiscoveryDisclaimerCard, synth.card]
      : [reviewDiscoveryDisclaimerCard]

    return insightResponseSchema.parse({
      version: "1",
      requestId,
      cards,
      reviewDiscovery,
      limitations: mergedLimitations,
      generatedAt
    })
  } catch (error) {
    if (error instanceof DiscoverHttpError) {
      if (error.status === 401) {
        limitations.push(SERVER_RESEARCH_AUTH_FAILED)
      } else if (error.status === 403) {
        limitations.push(SERVER_FEATURE_NOT_AVAILABLE)
      } else if (error.status === 429) {
        limitations.push(SERVER_RATE_LIMITED)
      } else if (error.status === 400) {
        const detail = error.responseBody?.trim() ?? ""
        limitations.push(serverResearchBadRequest(detail))
      } else {
        const detail = error.responseBody?.trim() ?? ""
        limitations.push(serverResearchUpstream(error.status, detail))
      }
    } else if (error instanceof DOMException && error.name === "AbortError") {
      limitations.push(WEB_RESEARCH_CANCELLED_OR_TIMED_OUT)
      throw error
    } else if (error instanceof Error) {
      limitations.push(formatInsightNetworkError(error))
    } else {
      limitations.push(WEB_RESEARCH_UNKNOWN_FAILURE)
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

    const [pricingRows, affiliate] = await Promise.all([
      runStubBrightData(request, controller.signal),
      skipAffiliate
        ? Promise.resolve({} as AffiliateSearchResult)
        : searchAffiliateProducts(request, controller.signal)
    ])

    const llm = await runPriceCheckLlm(request, affiliate, controller.signal)

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
