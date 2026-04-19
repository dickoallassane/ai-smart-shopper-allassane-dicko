import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { insightRequestSchema } from "@shopfriend/shared"
import { afterEach, describe, expect, it, vi } from "vitest"
import { persistInsightJsonSnapshot, shouldPersistInsightJson } from "./persist-insight-json"

describe("persistInsightJsonSnapshot", () => {
  const prevLog = process.env.SHOPFRIEND_INSIGHT_LOG
  const prevDir = process.env.SHOPFRIEND_INSIGHT_LOG_DIR

  afterEach(() => {
    process.env.SHOPFRIEND_INSIGHT_LOG = prevLog
    process.env.SHOPFRIEND_INSIGHT_LOG_DIR = prevDir
  })

  it("writes a JSON file when SHOPFRIEND_INSIGHT_LOG=1", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "shopfriend-insight-"))
    process.env.SHOPFRIEND_INSIGHT_LOG = "1"
    process.env.SHOPFRIEND_INSIGHT_LOG_DIR = tmp

    const requestId = crypto.randomUUID()
    await persistInsightJsonSnapshot({
      routeRequestId: "route-correlation",
      request: insightRequestSchema.parse({
        product: {
          retailer: "amazon",
          locale: "en-US",
          url: "https://www.amazon.com/dp/B0TEST1234",
          title: "Test",
          reviewExcerpts: [],
          extractedAt: "2026-04-17T12:00:00.000Z"
        },
        flags: {
          llmEnabled: true,
          pricingBetaEnabled: false,
          skipAffiliate: false,
          insightKind: "price_check",
          isServiceSite: false
        }
      }),
      response: {
        version: "1",
        requestId,
        cards: [
          {
            id: "c1",
            kind: "reality_check",
            title: "T",
            bullets: [{ text: "b" }]
          }
        ],
        limitations: ["stub"],
        generatedAt: "2026-04-17T12:00:01.000Z"
      }
    })

    const names = await fs.readdir(tmp)
    expect(names.length).toBe(1)
    expect(names[0]).toMatch(/\.json$/)
    const raw = await fs.readFile(path.join(tmp, names[0]!), "utf8")
    const parsed = JSON.parse(raw) as { routeRequestId: string; response: { requestId: string } }
    expect(parsed.routeRequestId).toBe("route-correlation")
    expect(parsed.response.requestId).toBe(requestId)

    await fs.rm(tmp, { recursive: true, force: true })
  })

  it("does nothing when logging disabled", async () => {
    process.env.SHOPFRIEND_INSIGHT_LOG = "0"
    const spy = vi.spyOn(fs, "mkdir")
    await persistInsightJsonSnapshot({
      routeRequestId: "x",
      request: insightRequestSchema.parse({
        product: {
          retailer: "amazon",
          locale: "en-US",
          url: "https://www.amazon.com/dp/B0TEST1234",
          title: "Test",
          reviewExcerpts: [],
          extractedAt: "2026-04-17T12:00:00.000Z"
        },
        flags: {
          llmEnabled: false,
          pricingBetaEnabled: false,
          skipAffiliate: false,
          insightKind: "price_check",
          isServiceSite: false
        }
      }),
      response: {
        version: "1",
        requestId: crypto.randomUUID(),
        cards: [
          { id: "off", kind: "reality_check", title: "Off", bullets: [{ text: "off" }] }
        ],
        limitations: ["l"],
        generatedAt: "2026-04-17T12:00:01.000Z"
      }
    })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe("shouldPersistInsightJson", () => {
  const prevLog = process.env.SHOPFRIEND_INSIGHT_LOG
  const prevNode = process.env.NODE_ENV

  afterEach(() => {
    process.env.SHOPFRIEND_INSIGHT_LOG = prevLog
    vi.stubEnv("NODE_ENV", prevNode)
  })

  it("respects SHOPFRIEND_INSIGHT_LOG=0", () => {
    process.env.SHOPFRIEND_INSIGHT_LOG = "0"
    vi.stubEnv("NODE_ENV", "development")
    expect(shouldPersistInsightJson()).toBe(false)
  })

  it("respects SHOPFRIEND_INSIGHT_LOG=1", () => {
    process.env.SHOPFRIEND_INSIGHT_LOG = "1"
    vi.stubEnv("NODE_ENV", "production")
    expect(shouldPersistInsightJson()).toBe(true)
  })
})
