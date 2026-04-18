import { chatTurnRequestSchema } from "@shopfriend/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { runInsightChatTurn } from "./insight-chat-llm"
import { CHAT_ASSISTANT_UNAVAILABLE_CODE } from "./user-facing-messages"

const openRouterAssistantBody = (content: string) =>
  JSON.stringify({
    choices: [{ message: { content } }]
  })

const mkChatRequest = () =>
  chatTurnRequestSchema.parse({
    userMessage: "What stands out in source 2?",
    researchContext: {
      reviewDiscovery: {
        query: "example reviews",
        results: [
          { link: "https://ex.com/a", title: "Source A", description: "A desc" },
          { link: "https://ex.com/b", title: "Source B" }
        ]
      },
      summaryBullets: [{ text: "Mixed signals on A.", sourceIndex: 0 }]
    },
    history: [{ role: "user", text: "Earlier question" }]
  })

describe("runInsightChatTurn", () => {
  const prevKey = process.env.OPENROUTER_API_KEY

  beforeEach(() => {
    vi.unstubAllGlobals()
    delete process.env.OPENROUTER_API_KEY
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (prevKey === undefined) {
      delete process.env.OPENROUTER_API_KEY
    } else {
      process.env.OPENROUTER_API_KEY = prevKey
    }
  })

  it("throws a stable code when the assistant service is not configured", async () => {
    await expect(runInsightChatTurn(mkChatRequest(), new AbortController().signal)).rejects.toThrow(
      CHAT_ASSISTANT_UNAVAILABLE_CODE
    )
  })

  it("returns parsed reply when the upstream service returns valid JSON", async () => {
    process.env.OPENROUTER_API_KEY = "test-key"
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          openRouterAssistantBody(JSON.stringify({ reply: "Source 2 focuses on shipping gripes." }))
      })
    )

    const out = await runInsightChatTurn(mkChatRequest(), new AbortController().signal)
    expect(out.reply).toContain("Source 2")
    expect(out.requestId).toMatch(/^[0-9a-f-]{36}$/i)
  })
})
