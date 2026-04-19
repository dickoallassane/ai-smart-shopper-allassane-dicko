import { describe, expect, it } from "vitest"
import { formatInsightNetworkError } from "./format-insight-network-error"
import {
  NETWORK_RESEARCH_POLL_FAILED,
  NETWORK_RESEARCH_POST_FAILED,
  WEB_RESEARCH_UNKNOWN_FAILURE
} from "./user-facing-messages"

describe("formatInsightNetworkError", () => {
  it("returns a stable message for non-Errors", () => {
    expect(formatInsightNetworkError(null)).toBe(WEB_RESEARCH_UNKNOWN_FAILURE)
  })

  it("compresses research fetch failures with a timeout hint", () => {
    const inner = Object.assign(new Error("connect ETIMEDOUT example.com:443"), {
      code: "ETIMEDOUT"
    })
    const agg = new AggregateError([inner], "")
    const leaf = new TypeError("fetch failed", { cause: agg })
    const wrapped = new Error(NETWORK_RESEARCH_POLL_FAILED, { cause: leaf })
    const line = formatInsightNetworkError(wrapped)
    expect(line).toContain("Network error while loading web research")
    expect(line).toContain("timed out")
  })

  it("dedupes repeated fragments for generic errors", () => {
    const err = new Error("fetch failed", {
      cause: new TypeError("fetch failed")
    })
    const line = formatInsightNetworkError(err)
    expect(line).toBe("fetch failed")
  })

  it("truncates very long combined output", () => {
    const long = "x".repeat(300)
    const err = new Error(long, { cause: new Error(long) })
    const line = formatInsightNetworkError(err)
    expect(line.length).toBeLessThanOrEqual(500)
  })

  it("compresses research fetch failures with a connection-refused hint", () => {
    const a = Object.assign(new Error("connect ECONNREFUSED 3.232.8.188:443"), { code: "ECONNREFUSED" })
    const b = Object.assign(new Error("connect ECONNREFUSED 3.232.71.244:443"), { code: "ECONNREFUSED" })
    const agg = new AggregateError([a, b], "")
    const leaf = new TypeError("fetch failed", { cause: agg })
    const wrapped = new Error(NETWORK_RESEARCH_POST_FAILED, { cause: leaf })
    const line = formatInsightNetworkError(wrapped)
    expect(line).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)
    expect(line).toContain("Network error while loading web research")
    expect(line.toLowerCase()).toContain("refused")
  })
})
