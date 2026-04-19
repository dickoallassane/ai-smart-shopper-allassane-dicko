import {
  chatReplyFromModelSchema,
  type ChatResearchContext,
  type ChatTurnRequest,
  type ChatTurnResponse
} from "@shopfriend/shared"
import { getServerEnv } from "@/lib/env"
import { openRouterChatCompletionContent } from "./openrouter"
import {
  CHAT_ASSISTANT_UNAVAILABLE_CODE,
  CHAT_BAD_RESPONSE_CODE,
  CHAT_INVALID_RESEARCH_CONTEXT_CODE
} from "./user-facing-messages"

const DEFAULT_OPENROUTER_BASE = "https://openrouter.ai/api/v1"
const DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini"
const CHAT_LLM_TIMEOUT_MS = 55_000
const MAX_DESC_CHARS = 500
const MAX_CONTENT_CHARS = 2000

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

const trimResearchForPrompt = (ctx: ChatResearchContext): ChatResearchContext => ({
  reviewDiscovery: {
    query: ctx.reviewDiscovery.query,
    intent: ctx.reviewDiscovery.intent?.slice(0, 2000),
    results: ctx.reviewDiscovery.results.map((r) => ({
      link: r.link,
      title: r.title,
      description: r.description ? r.description.slice(0, MAX_DESC_CHARS) : undefined,
      relevanceScore: r.relevanceScore,
      content: r.content ? r.content.slice(0, MAX_CONTENT_CHARS) : undefined
    }))
  },
  summaryBullets: ctx.summaryBullets,
  summaryOverview: ctx.summaryOverview?.slice(0, 1200)
})

const buildChatSystemPrompt = (): string =>
  [
    "You are ShopFriend, a shopping assistant speaking directly to the user in a friendly, natural tone (use “you”).",
    "You will receive JSON with: ranked web search results, optional summary bullets and overview, optional prior chat turns, and the latest user_message.",
    "Rules:",
    "- Answer ONLY the latest user_message. Do not re-run research; use only the provided context.",
    "- Ground claims in the numbered sources when relevant; refer to them as “source 1”, “source 2”, etc. (1-based index matching the results array order). Never invent URLs or facts.",
    "- If the answer is not supported by the context, say so briefly and suggest what they could check in the listed sources.",
    "- Do not paste the entire source list unless the user explicitly asks for it.",
    "- Keep replies concise unless the user asks for detail.",
    "Reply with JSON only: {\"reply\":\"your message to the user\"}"
  ].join("\n")

const buildChatUserPayload = (body: ChatTurnRequest): string =>
  JSON.stringify({
    user_message: body.userMessage,
    research: trimResearchForPrompt(body.researchContext),
    history: body.history ?? []
  })

export const runInsightChatTurn = async (
  body: ChatTurnRequest,
  signal: AbortSignal
): Promise<ChatTurnResponse> => {
  const env = getServerEnv()
  const apiKey = env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(CHAT_ASSISTANT_UNAVAILABLE_CODE)
  }

  if (body.researchContext.reviewDiscovery.results.length === 0) {
    throw new Error(CHAT_INVALID_RESEARCH_CONTEXT_CODE)
  }

  const baseUrl = (env.OPENROUTER_BASE_URL?.trim() || DEFAULT_OPENROUTER_BASE).replace(/\/$/, "")
  const model = env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL
  const timed = withTimeoutSignal(signal, CHAT_LLM_TIMEOUT_MS)
  const requestId = crypto.randomUUID()

  const raw = await openRouterChatCompletionContent({
    baseUrl,
    apiKey,
    model,
    messages: [
      { role: "system", content: buildChatSystemPrompt() },
      { role: "user", content: buildChatUserPayload(body) }
    ],
    signal: timed,
    maxTokens: 900,
    jsonMode: true
  })

  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw)
  } catch {
    throw new Error(CHAT_BAD_RESPONSE_CODE)
  }

  const parsed = chatReplyFromModelSchema.safeParse(parsedJson)
  if (!parsed.success) {
    throw new Error(CHAT_BAD_RESPONSE_CODE)
  }

  return {
    reply: parsed.data.reply,
    requestId
  }
}
