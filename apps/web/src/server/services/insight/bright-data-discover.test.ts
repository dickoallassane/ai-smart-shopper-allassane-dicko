import { afterEach, describe, expect, it, vi } from "vitest"
import { executeDiscover } from "./bright-data-discover"

describe("executeDiscover", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("retries POST when the first fetch throws a transient network error", async () => {
    const postOk = {
      ok: true,
      text: async () => JSON.stringify({ task_id: "task-xyz" })
    }
    const getDone = {
      ok: true,
      text: async () =>
        JSON.stringify({
          status: "done",
          results: [{ link: "https://ex.example/a", title: "A", relevance_score: 0.9 }]
        })
    }

    let postAttempt = 0
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString()
        if (url.includes("task_id=")) {
          return getDone
        }
        postAttempt += 1
        if (postAttempt === 1) {
          throw new TypeError("fetch failed", { cause: new Error("ECONNREFUSED") })
        }
        return postOk
      })
    )

    const ac = new AbortController()
    const results = await executeDiscover(
      { query: "q", intent: "intent", num_results: 2 },
      "tok",
      ac.signal,
      {
        maxPollMs: 4000,
        pollIntervalMs: 30
      }
    )

    expect(results).toHaveLength(1)
    expect(postAttempt).toBe(2)
  })
})
