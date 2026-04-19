type ChatRole = "system" | "user" | "assistant"

export type OpenRouterChatMessage = {
  role: ChatRole
  content: string
}

export type OpenRouterChatParams = {
  baseUrl: string
  apiKey: string
  model: string
  messages: OpenRouterChatMessage[]
  signal: AbortSignal
  maxTokens?: number
  /** When true, request JSON-only assistant content (model must support it). */
  jsonMode?: boolean
}

/**
 * POST `/v1/chat/completions` (OpenAI-compatible). Returns raw assistant message string.
 * @see https://openrouter.ai/docs/api/reference/overview
 */
export const openRouterChatCompletionContent = async ({
  baseUrl,
  apiKey,
  model,
  messages,
  signal,
  maxTokens = 1200,
  jsonMode = true
}: OpenRouterChatParams): Promise<string> => {
  const root = baseUrl.replace(/\/$/, "")
  const url = `${root}/chat/completions`
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.25
  }
  if (jsonMode) {
    body.response_format = { type: "json_object" }
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://github.com/shopfriend",
      "X-Title": "ShopFriend insight"
    },
    body: JSON.stringify(body),
    signal
  })

  const rawText = await res.text()
  if (!res.ok) {
    const preview = rawText.trim().slice(0, 400)
    throw new Error(
      preview.length > 0
        ? `Summary service HTTP ${res.status}: ${preview}`
        : `Summary service HTTP ${res.status} (empty body)`
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawText) as unknown
  } catch {
    throw new Error("Summary service returned non-JSON body")
  }

  const rootObj = parsed as Record<string, unknown>
  const choices = rootObj.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new Error("Summary service response missing choices")
  }
  const first = choices[0] as Record<string, unknown>
  const message = first.message as Record<string, unknown> | undefined
  const content = message?.content
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Summary service response missing assistant content")
  }
  return content.trim()
}
