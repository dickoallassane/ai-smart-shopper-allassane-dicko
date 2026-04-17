import {
  insightBulletSchema,
  insightCardSchema,
  type AffiliateMatch,
  type InsightRequest,
  type InsightResponse,
  type ReviewDiscoveryResult
} from "@shopfriend/shared"
import { z } from "zod"
import { getServerEnv } from "@/lib/env"
import type { AffiliateSearchResult } from "@/server/services/affiliate/searchAffiliateProducts"
import { openRouterChatCompletionContent } from "./openrouter"

type InsightBullet = z.infer<typeof insightBulletSchema>
type InsightCard = z.infer<typeof insightCardSchema>

export type LlmResult = Pick<InsightResponse, "cards" | "limitations">

const DEFAULT_OPENROUTER_BASE = "https://openrouter.ai/api/v1"
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini"
const PRICE_CHECK_LLM_TIMEOUT_MS = 18_000
const REVIEW_SYNTH_LLM_TIMEOUT_MS = 18_000

const llmCardsPayloadSchema = z.object({
  cards: z.array(insightCardSchema).min(1).max(6),
  limitations: z.array(z.string().max(500)).max(12)
})

const discoverySynthesisSchema = z.object({
  bullets: z
    .array(
      z.object({
        text: z.string().min(1).max(900),
        /** 0-based indices into the Discover results list passed to the model */
        source_index: z.array(z.number().int().min(0).max(9)).min(1).max(3)
      })
    )
    .min(1)
    .max(6),
  limitations: z.array(z.string().max(500)).max(4).optional()
})

const withTimeoutSignal = (parent: AbortSignal, ms: number): AbortSignal => {
  if (typeof AbortSignal.any === "function" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.any([parent, AbortSignal.timeout(ms)])
  }
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  const onParent = () => c.abort()
  parent.addEventListener("abort", onParent)
  c.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(t)
      parent.removeEventListener("abort", onParent)
    },
    { once: true }
  )
  return c.signal
}

const runStubPriceCheckLlm = async (request: InsightRequest, signal: AbortSignal): Promise<LlmResult> => {
  if (!request.flags.llmEnabled) {
    return {
      cards: [
        {
          id: "reality-off",
          kind: "reality_check",
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
        kind: "reality_check",
        title: "Reality check (stub)",
        bullets: [
          {
            text: `Grounded stub summary for “${request.product.title.slice(0, 80)}”.`,
            citation: excerpt ? { text: excerpt, anchorHint: "first-review" } : undefined
          },
          {
            text: "Set OPENROUTER_API_KEY on the server to replace this stub with live OpenRouter summaries."
          }
        ]
      },
      {
        id: "returns",
        kind: "returns",
        title: "Returns & shipping",
        bullets: [
          {
            text: "Use retailer link-out in product UI; this card is a placeholder until LLM is configured."
          }
        ]
      }
    ],
    limitations: [
      "Stub response — configure OPENROUTER_API_KEY for live OpenRouter commentary.",
      "Always cite on-page excerpts when the live model runs."
    ]
  }
}

const serializeAffiliateForPrompt = (rows: AffiliateMatch[]): unknown[] =>
  rows.map((m) => ({
    productName: m.productName,
    merchantName: m.merchantName,
    priceDisplay: m.priceDisplay,
    currency: m.currency ?? null,
    description: m.description?.slice(0, 400) ?? null
  }))

const buildPriceCheckSystemPrompt = (): string =>
  [
    "You are ShopFriend's shopping assistant. Reply with JSON only matching this shape:",
    '{"cards":[{"id":"string","kind":"reality_check|returns|review_themes|reputation|pricing_beta","title":"string","bullets":[{"text":"string","citation":{"text":"string","anchorHint":"string"}}]}],"limitations":["string"]}',
    "Rules:",
    "- 1–4 cards, max 4 bullets per card, each bullet text under 900 chars.",
    "- Use only facts grounded in the JSON product and affiliate_rows (prices, merchants, names). Never invent URLs or prices.",
    "- Compare value among affiliate rows when multiple exist; if zero rows, say affiliate data was unavailable.",
    "- Do NOT lead with refund, return, or shipping policy unless a review_excerpt explicitly mentions it.",
    "- Prefer kind reality_check for main commentary; optional review_themes for short themes from excerpts.",
    "- limitations: 0–4 short strings (disclaimers, uncertainty)."
  ].join("\n")

const buildPriceCheckUserPayload = (request: InsightRequest, affiliate: AffiliateSearchResult): string => {
  const rows = affiliate.matches ?? []
  return JSON.stringify({
    product: {
      title: request.product.title,
      url: request.product.url,
      displayedPrice: request.product.displayedPrice ?? null,
      retailer: request.product.retailer,
      review_excerpts: request.product.reviewExcerpts.slice(0, 5)
    },
    affiliate_rows: serializeAffiliateForPrompt(rows),
    affiliate_limitation: affiliate.limitation ?? null
  })
}

export const runPriceCheckLlm = async (
  request: InsightRequest,
  affiliate: AffiliateSearchResult,
  signal: AbortSignal
): Promise<LlmResult> => {
  if (!request.flags.llmEnabled) {
    return runStubPriceCheckLlm(request, signal)
  }

  const env = getServerEnv()
  const apiKey = env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    const stub = await runStubPriceCheckLlm(request, signal)
    return {
      ...stub,
      limitations: [...stub.limitations, "OPENROUTER_API_KEY is not set; using stub LLM output."]
    }
  }

  const baseUrl = (env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE).replace(/\/$/, "")
  const model = env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL
  const timed = withTimeoutSignal(signal, PRICE_CHECK_LLM_TIMEOUT_MS)

  try {
    const raw = await openRouterChatCompletionContent({
      baseUrl,
      apiKey,
      model,
      messages: [
        { role: "system", content: buildPriceCheckSystemPrompt() },
        { role: "user", content: buildPriceCheckUserPayload(request, affiliate) }
      ],
      signal: timed,
      maxTokens: 1400,
      jsonMode: true
    })

    const parsedJson: unknown = JSON.parse(raw)
    const parsed = llmCardsPayloadSchema.safeParse(parsedJson)
    if (!parsed.success) {
      const stub = await runStubPriceCheckLlm(request, signal)
      return {
        ...stub,
        limitations: [...stub.limitations, "OpenRouter returned JSON that failed validation; showing stub cards."]
      }
    }
    return { cards: parsed.data.cards, limitations: parsed.data.limitations }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenRouter request failed"
    const stub = await runStubPriceCheckLlm(request, signal)
    return {
      ...stub,
      limitations: [...stub.limitations, `OpenRouter error: ${msg.slice(0, 240)}`]
    }
  }
}

const buildReviewSynthesisSystemPrompt = (request: InsightRequest): string => {
  const service = request.flags.isServiceSite
  const openWeb = request.flags.unsupportedDomainDiscovery
  const depth = service
    ? "Surface refund, cancellation, chargeback, scam/legitimacy, and satisfaction ONLY when the numbered snippets support those themes. If sources omit a topic, say it is not covered in these results."
    : openWeb
      ? "Focus on whether independent sources trust this site/domain; satisfaction and scam signals. Do NOT lead with generic refund advice unless snippets are mainly about that."
      : "Emphasize product satisfaction, durability, use cases, pros/cons. Do NOT prioritize refund/returns unless the snippets are overwhelmingly about returns."

  return [
    "You summarize Bright Data Discover search results for a browser extension user.",
    "Reply with JSON only:",
    '{"bullets":[{"text":"string under 900 chars","source_index":[0]}],"limitations":["optional short strings"]}',
    "Each bullet must cite 1–3 integers from source_index matching the provided results[] order (0 = first result).",
    "Every substantive claim must include at least one valid source_index. No new URLs.",
    "3–6 bullets.",
    depth
  ].join("\n")
}

const buildReviewSynthesisUserPayload = (results: ReviewDiscoveryResult[]): string =>
  JSON.stringify({
    results: results.map((r, i) => ({
      index: i,
      title: r.title,
      link: r.link,
      description: (r.description ?? "").slice(0, 600)
    }))
  })

const mapSynthesisToCard = (
  parsed: z.infer<typeof discoverySynthesisSchema>,
  results: ReviewDiscoveryResult[]
): InsightCard => {
  const bullets: InsightBullet[] = parsed.bullets
    .map((b) => {
      const validIdx = b.source_index.filter((i) => Number.isInteger(i) && i >= 0 && i < results.length)
      if (validIdx.length === 0) {
        return null
      }
      const primary = validIdx[0]!
      const row = results[primary]
      const citeText = [row.title, row.description ?? ""].join(" — ").slice(0, 1900)
      const parsedBullet = insightBulletSchema.safeParse({
        text: b.text,
        citation: { text: citeText, anchorHint: `discover:${primary}` }
      })
      return parsedBullet.success ? parsedBullet.data : { text: b.text.slice(0, 1000) }
    })
    .filter((b): b is InsightBullet => b !== null)

  return {
    id: "discover-summary",
    kind: "review_themes",
    title: "Source-grounded summary",
    bullets: bullets.length > 0 ? bullets : [{ text: "No valid cited bullets returned by the model." }]
  }
}

export const runReviewDiscoverySynthesis = async (
  request: InsightRequest,
  results: ReviewDiscoveryResult[],
  signal: AbortSignal
): Promise<{ card: InsightCard | null; limitations: string[] }> => {
  const limitations: string[] = []
  if (!request.flags.llmEnabled || results.length === 0) {
    return { card: null, limitations }
  }

  const env = getServerEnv()
  const apiKey = env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    limitations.push("OPENROUTER_API_KEY is not set; skipping web summary synthesis.")
    return { card: null, limitations }
  }

  const baseUrl = (env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE).replace(/\/$/, "")
  const model = env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL
  const timed = withTimeoutSignal(signal, REVIEW_SYNTH_LLM_TIMEOUT_MS)

  try {
    const raw = await openRouterChatCompletionContent({
      baseUrl,
      apiKey,
      model,
      messages: [
        { role: "system", content: buildReviewSynthesisSystemPrompt(request) },
        { role: "user", content: buildReviewSynthesisUserPayload(results) }
      ],
      signal: timed,
      maxTokens: 1200,
      jsonMode: true
    })

    const parsedJson: unknown = JSON.parse(raw)
    const parsed = discoverySynthesisSchema.safeParse(parsedJson)
    if (!parsed.success) {
      limitations.push("OpenRouter summary JSON failed validation; links below are unchanged.")
      return { card: null, limitations }
    }

    const card = mapSynthesisToCard(parsed.data, results)
    const cardParsed = insightCardSchema.safeParse(card)
    if (!cardParsed.success) {
      limitations.push("Summary card failed schema check; showing sources only.")
      return { card: null, limitations }
    }

    return {
      card: cardParsed.data,
      limitations: [...limitations, ...(parsed.data.limitations ?? [])]
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenRouter synthesis failed"
    limitations.push(`Web summary skipped: ${msg.slice(0, 240)}`)
    return { card: null, limitations }
  }
}
