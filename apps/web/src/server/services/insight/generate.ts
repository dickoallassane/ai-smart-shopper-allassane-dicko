import {
  insightResponseSchema,
  type InsightRequest,
  type InsightResponse
} from "@shopfriend/shared"
import { getServerEnv } from "@/lib/env"

const INSIGHT_TIMEOUT_MS = 12_000

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

export const generateInsight = async (
  request: InsightRequest,
  signal: AbortSignal
): Promise<InsightResponse> => {
  const requestId = crypto.randomUUID()
  const generatedAt = new Date().toISOString()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), INSIGHT_TIMEOUT_MS)
  const onParentAbort = () => controller.abort()
  signal.addEventListener("abort", onParentAbort)

  try {
    const [llm, pricingRows] = await Promise.all([
      runStubLlm(request, controller.signal),
      runStubBrightData(request, controller.signal)
    ])

    const merged: InsightResponse = {
      version: "1",
      requestId,
      cards: llm.cards,
      pricingRows,
      limitations: llm.limitations,
      generatedAt
    }

    return insightResponseSchema.parse(merged)
  } finally {
    clearTimeout(timer)
    signal.removeEventListener("abort", onParentAbort)
  }
}
