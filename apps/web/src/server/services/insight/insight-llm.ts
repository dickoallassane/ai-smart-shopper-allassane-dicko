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
import {
  PRICE_JSON_VALIDATION_FAILED,
  PRICE_MISSING_KEY_LIMITATION,
  PRICE_STUB_CONFIGURE_SERVER,
  PRICE_STUB_LIMITATIONS,
  PRICE_STUB_PLACEHOLDER_RETURNS,
  PRICE_SUMMARY_DISABLED,
  PRICE_SUMMARY_DISABLED_LIMITATION,
  priceSummaryRuntime,
  REVIEW_SYNTH_ABORTED,
  REVIEW_SYNTH_CARD_SCHEMA_FAILED,
  REVIEW_SYNTH_KEY_MISSING,
  REVIEW_SYNTH_RUNTIME_FAILED,
  REVIEW_SYNTH_VALIDATION_FAILED
} from "./user-facing-messages"

type InsightBullet = z.infer<typeof insightBulletSchema>
type InsightCard = z.infer<typeof insightCardSchema>

export type LlmResult = Pick<InsightResponse, "cards" | "limitations">

const DEFAULT_OPENROUTER_BASE = "https://openrouter.ai/api/v1"
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini"
const PRICE_CHECK_LLM_TIMEOUT_MS = 18_000
const REVIEW_SYNTH_LLM_TIMEOUT_MS = 18_000
/** Initial attempt + 2 retries for Discover summary synthesis */
const MAX_REVIEW_SYNTH_ATTEMPTS = 3

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
  /** 2–4 sentences: what source types/themes the bullets summarized (no new URLs). */
  sources_overview: z.string().max(800).optional(),
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
              text: PRICE_SUMMARY_DISABLED
            }
          ]
        }
      ],
      limitations: [PRICE_SUMMARY_DISABLED_LIMITATION]
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
            text: PRICE_STUB_CONFIGURE_SERVER
          }
        ]
      },
      {
        id: "returns",
        kind: "returns",
        title: "Returns & shipping",
        bullets: [
          {
            text: PRICE_STUB_PLACEHOLDER_RETURNS
          }
        ]
      }
    ],
    limitations: [...PRICE_STUB_LIMITATIONS]
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
      limitations: [...stub.limitations, PRICE_MISSING_KEY_LIMITATION]
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
        limitations: [...stub.limitations, PRICE_JSON_VALIDATION_FAILED]
      }
    }
    return { cards: parsed.data.cards, limitations: parsed.data.limitations }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Summary request failed"
    const stub = await runStubPriceCheckLlm(request, signal)
    return {
      ...stub,
      limitations: [...stub.limitations, priceSummaryRuntime(msg)]
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
    "You summarize ranked web search results for a browser extension user.",
    "Reply with JSON only:",
    '{"bullets":[{"text":"string under 900 chars","source_index":[0]}],"sources_overview":"string","limitations":["optional short strings"]}',
    "Each bullet must cite 1–3 integers from source_index matching the provided results[] order (0 = first result).",
    "Every substantive claim must include at least one valid source_index. No new URLs.",
    "3–6 bullets.",
    "After bullets, include sources_overview: 2–4 short sentences that recap what kinds of themes or source types the bullets summarized (forums, retailers, scam reports, etc.). Reference sources by their list index (0-based) where helpful. No new URLs; do not claim anything not supported by the numbered results.",
    "Always include sources_overview when you return bullets (non-empty string).",
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

  const overviewTrimmed = parsed.sources_overview?.trim() ?? ""
  const sourcesOverview =
    overviewTrimmed.length > 0 ? overviewTrimmed.slice(0, 1000) : undefined

  return {
    id: "discover-summary",
    kind: "review_themes",
    title: "Source-grounded summary",
    bullets: bullets.length > 0 ? bullets : [{ text: "No valid cited bullets were returned." }],
    ...(sourcesOverview ? { sourcesOverview } : {})
  }
}

type SynthAttemptResult =
  | { ok: true; card: InsightCard; modelLimitations: string[] }
  | { ok: false; kind: "zod" | "card" | "runtime"; detail: string }

const runOneReviewSynthAttempt = async (
  request: InsightRequest,
  results: ReviewDiscoveryResult[],
  baseUrl: string,
  model: string,
  apiKey: string,
  signal: AbortSignal,
  timeoutMs: number
): Promise<SynthAttemptResult> => {
  if (signal.aborted) {
    return { ok: false, kind: "runtime", detail: "Request aborted" }
  }
  const timed = withTimeoutSignal(signal, timeoutMs)
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
      return { ok: false, kind: "zod", detail: "summary_json_failed_validation" }
    }

    const card = mapSynthesisToCard(parsed.data, results)
    const cardParsed = insightCardSchema.safeParse(card)
    if (!cardParsed.success) {
      return { ok: false, kind: "card", detail: "Summary card failed schema check" }
    }

    return {
      ok: true,
      card: cardParsed.data,
      modelLimitations: parsed.data.limitations ?? []
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Summary synthesis failed"
    return { ok: false, kind: "runtime", detail: msg.slice(0, 240) }
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
    limitations.push(REVIEW_SYNTH_KEY_MISSING)
    return { card: null, limitations }
  }

  const baseUrl = (env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE).replace(/\/$/, "")
  const model = env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL

  let lastFailure: SynthAttemptResult & { ok: false } | null = null

  for (let attempt = 0; attempt < MAX_REVIEW_SYNTH_ATTEMPTS; attempt++) {
    if (signal.aborted) {
      limitations.push(REVIEW_SYNTH_ABORTED)
      return { card: null, limitations }
    }
    const timeoutMs = REVIEW_SYNTH_LLM_TIMEOUT_MS * (attempt + 1)
    const result = await runOneReviewSynthAttempt(
      request,
      results,
      baseUrl,
      model,
      apiKey,
      signal,
      timeoutMs
    )
    if (result.ok) {
      return {
        card: result.card,
        limitations: [...limitations, ...result.modelLimitations]
      }
    }
    lastFailure = result
  }

  if (lastFailure?.kind === "zod") {
    limitations.push(REVIEW_SYNTH_VALIDATION_FAILED)
    return { card: null, limitations }
  }
  if (lastFailure?.kind === "card") {
    limitations.push(REVIEW_SYNTH_CARD_SCHEMA_FAILED)
    return { card: null, limitations }
  }

  limitations.push(REVIEW_SYNTH_RUNTIME_FAILED)
  return { card: null, limitations }
}
