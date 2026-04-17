import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { InsightResponse } from "@shopfriend/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SidePanelApp } from "./SidePanelApp"
import {
  DEFAULT_SITE_EXTRACTOR_CONFIG,
  SITE_CONFIGS_UPDATED,
  SITE_EXTRACTOR_CONFIG_JSON_KEY
} from "../lib/site-extractor-config"
import { createChromeMock } from "../test-utils/chrome-mock"

const validProduct = {
  retailer: "amazon" as const,
  locale: "en-US",
  url: "https://www.amazon.com/dp/B0DZZWMB2L",
  title: "Example product",
  displayedPrice: "$42.00",
  extractedAt: "2026-04-15T12:00:00.000Z",
  reviewExcerpts: [] as string[]
}

const mockInsightNoAffiliate: InsightResponse = {
  version: "1",
  requestId: "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
  cards: [
    {
      id: "returns",
      kind: "returns",
      title: "Returns",
      bullets: [{ text: "See retailer policy." }]
    }
  ],
  limitations: ["Stub"],
  generatedAt: "2026-04-15T12:00:00.000Z"
}

const mockInsightReviewDiscovery: InsightResponse = {
  version: "1",
  requestId: "d0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44",
  cards: [
    {
      id: "review-discovery-disclaimer",
      kind: "reputation",
      title: "Web research (Bright Data Discover)",
      bullets: [{ text: "Third-party web results — not verified facts." }]
    }
  ],
  reviewDiscovery: {
    query: '"Example product" reviews pros cons www.amazon.com',
    intent: "Prioritize Trustpilot, Reddit, YouTube.",
    results: [
      {
        link: "https://www.reddit.com/r/example/comments/abc",
        title: "Reddit thread about product",
        description: "Mixed reviews here.",
        relevanceScore: 0.88
      }
    ]
  },
  limitations: ["Third-party opinions from the open web only — not financial, legal, or medical advice."],
  generatedAt: "2026-04-15T12:00:00.000Z"
}

const mockInsightWithAffiliate: InsightResponse = {
  version: "1",
  requestId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
  cards: [
    {
      id: "returns",
      kind: "returns",
      title: "Returns",
      bullets: [{ text: "See retailer policy." }]
    }
  ],
  limitations: ["Stub"],
  generatedAt: "2026-04-15T12:00:00.000Z",
  affiliateMatches: [
    {
      offerId: "a1",
      productName: "Product One Full Name",
      description: "Short desc one",
      merchantName: "Store A",
      networkName: "NetA",
      priceDisplay: "10",
      currency: "USD",
      clickUrl: "https://example.com/a1",
      directUrl: "https://example.com/direct1",
      imageUrl: "https://example.com/img1.png"
    },
    {
      offerId: "a2",
      productName: "Product Two Full Name",
      merchantName: "Store B",
      networkName: "NetB",
      priceDisplay: "20",
      currency: "USD",
      clickUrl: "https://example.com/a2",
      directUrl: "https://example.com/direct2"
    }
  ]
}

const renderSidePanel = () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })
  return render(
    <QueryClientProvider client={client}>
      <SidePanelApp />
    </QueryClientProvider>
  )
}

describe("SidePanelApp", () => {
  let chromeMock: ReturnType<typeof createChromeMock>
  let stored: Record<string, unknown>

  beforeEach(() => {
    stored = {}
    chromeMock = createChromeMock()
    chromeMock.install()
    chromeMock.storageLocalGet.mockImplementation(
      (keys: string | string[] | Record<string, unknown> | null, cb?: (r: Record<string, unknown>) => void) => {
        const list =
          keys === null
            ? Object.keys(stored)
            : typeof keys === "string"
              ? [keys]
              : Array.isArray(keys)
                ? keys
                : typeof keys === "object"
                  ? Object.keys(keys)
                  : []
        const out: Record<string, unknown> = {}
        for (const k of list) {
          if (Object.prototype.hasOwnProperty.call(stored, k)) {
            out[k] = stored[k]
          }
        }
        if (typeof cb === "function") {
          cb(out)
          return undefined
        }
        return Promise.resolve(out)
      }
    )
    chromeMock.storageLocalSet.mockImplementation(
      (patch: Record<string, unknown>, cb?: () => void) => {
        Object.assign(stored, patch)
        if (cb) {
          cb()
        }
      }
    )
    chromeMock.storageSessionGet.mockResolvedValue({})
    chromeMock.windowsGetCurrent.mockResolvedValue({ id: 10 })
    chromeMock.tabsQuery.mockResolvedValue([
      { id: 77, url: "https://www.amazon.com/dp/B0DZZWMB2L" }
    ])
    chromeMock.tabsSendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, cb?: (r: unknown) => void) => {
        if (typeof cb === "function") {
          cb({ ok: true, product: validProduct })
        }
      }
    )
  })

  afterEach(() => {
    cleanup()
    chromeMock.remove()
  })

  it("shows Guest when no display name is stored", async () => {
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByText("Guest")).toBeInTheDocument()
    })
  })

  it("shows stored display name from chrome.storage.local", async () => {
    stored.extensionDisplayName = "Alex"
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByText("Alex")).toBeInTheDocument()
    })
  })

  it("shows empty thread hint before any messages", async () => {
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByText(/No messages yet/i)).toBeInTheDocument()
    })
  })

  it("renders disabled chat composer", async () => {
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByLabelText(/Message \(disabled\)/i)).toBeDisabled()
    })
  })

  it("requests review discovery and shows source links when Get Review Insight succeeds", async () => {
    const user = userEvent.setup()
    stored[SITE_EXTRACTOR_CONFIG_JSON_KEY] = JSON.stringify(DEFAULT_SITE_EXTRACTOR_CONFIG)
    chromeMock.runtimeSendMessage.mockImplementation(
      (msg: { type?: string; payload?: { flags?: { insightKind?: string } } }, cb?: (r: unknown) => void) => {
        expect(msg.type).toBe("REQUEST_INSIGHT")
        expect(msg.payload?.flags?.insightKind).toBe("review_discovery")
        if (typeof cb === "function") {
          cb({ ok: true, insight: mockInsightReviewDiscovery })
        }
      }
    )
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Get Review Insight/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /Get Review Insight/i }))
    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Reddit thread about product/i })).toHaveAttribute(
        "href",
        "https://www.reddit.com/r/example/comments/abc"
      )
    })
    expect(screen.getByText(/ranked web sources/i)).toBeInTheDocument()
  })

  it("requests insight and shows price-check user copy when Check Price is clicked with valid session", async () => {
    const user = userEvent.setup()
    chromeMock.runtimeSendMessage.mockImplementation(
      (msg: { type?: string }, cb?: (r: unknown) => void) => {
        if (typeof cb === "function") {
          cb({ ok: true, insight: mockInsightNoAffiliate })
          return
        }
        return Promise.resolve()
      }
    )
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Check Price$/i })).toBeEnabled()
    })
    await user.click(screen.getByRole("button", { name: /^Check Price$/i }))
    await waitFor(() => {
      expect(chromeMock.runtimeSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "REQUEST_INSIGHT" }),
        expect.any(Function)
      )
    })
    await waitFor(() => {
      expect(
        screen.getByText(/Look for the best prices for this product: Example product - costing less than \$42\.00/i)
      ).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText("No product is found")).toBeInTheDocument()
    })
  })

  it("shows intro and two affiliate cards when insight includes affiliateMatches", async () => {
    const user = userEvent.setup()
    chromeMock.runtimeSendMessage.mockImplementation(
      (_msg: { type?: string }, cb?: (r: unknown) => void) => {
        if (typeof cb === "function") {
          cb({ ok: true, insight: mockInsightWithAffiliate })
          return
        }
        return Promise.resolve()
      }
    )
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Check Price$/i })).toBeEnabled()
    })
    await user.click(screen.getByRole("button", { name: /^Check Price$/i }))
    await waitFor(() => {
      expect(screen.getByText("Here are few matches I found")).toBeInTheDocument()
    })
    expect(screen.getByText("Short desc one")).toBeInTheDocument()
    expect(screen.getByText("Product Two Full Name")).toBeInTheDocument()
    const trackedLinks = screen.getAllByRole("link", { name: /Open affiliate or tracked offer link/i })
    expect(trackedLinks).toHaveLength(2)
    expect(trackedLinks[0]).toHaveAttribute("href", "https://example.com/a1")
    expect(trackedLinks[1]).toHaveAttribute("href", "https://example.com/a2")
    const retailerLinks = screen.getAllByRole("link", {
      name: /View product on retailer site without affiliate redirect/i
    })
    expect(retailerLinks).toHaveLength(2)
    expect(retailerLinks[0]).toHaveAttribute("href", "https://example.com/direct1")
    expect(retailerLinks[1]).toHaveAttribute("href", "https://example.com/direct2")
  })

  it("shows guidance in thread when Check Price is clicked without product context", async () => {
    const user = userEvent.setup()
    chromeMock.tabsSendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, cb?: (r: unknown) => void) => {
        if (typeof cb === "function") {
          cb({ ok: false, error: "No receiver" })
        }
      }
    )
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Check Price$/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /^Check Price$/i }))
    await waitFor(() => {
      expect(
        screen.getByText(/Open a supported product or service page in this tab first/i)
      ).toBeInTheDocument()
    })
    expect(chromeMock.runtimeSendMessage).not.toHaveBeenCalled()
  })

  it("updates discussion when INSIGHT_READY message is received", async () => {
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByText(/No messages yet/i)).toBeInTheDocument()
    })
    const listener = chromeMock.messageListeners[0]
    expect(listener).toBeDefined()
    const sendResponse = vi.fn()
    listener!(
      { type: "INSIGHT_READY", insight: mockInsightNoAffiliate },
      {},
      sendResponse
    )
    await waitFor(() => {
      expect(screen.getByText("No product is found")).toBeInTheDocument()
    })
  })

  it("opens site extractor settings and returns to discussion with Back", async () => {
    const user = userEvent.setup()
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByText(/^Thread$/)).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /Open site extractor settings/i }))
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /Site extractors/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/^Thread$/)).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Back to discussion/i }))
    await waitFor(() => {
      expect(screen.getByText(/^Thread$/)).toBeInTheDocument()
    })
    expect(screen.getByText(/^Discussion$/)).toBeInTheDocument()
  })

  it("shows a validation error when Site extractor JSON is invalid", async () => {
    const user = userEvent.setup()
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Open site extractor settings/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /Open site extractor settings/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Site extractor configuration JSON/i)).toBeInTheDocument()
    })
    const textarea = screen.getByLabelText(/Site extractor configuration JSON/i)
    fireEvent.change(textarea, { target: { value: "{" } })
    await user.click(screen.getByRole("button", { name: /^Validate$/i }))
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument()
    })
  })

  it("persists valid site config and notifies the service worker on Save", async () => {
    const user = userEvent.setup()
    chromeMock.runtimeSendMessage.mockClear()
    chromeMock.storageLocalSet.mockClear()
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Open site extractor settings/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /Open site extractor settings/i }))
    await waitFor(() => {
      expect(screen.getByLabelText(/Site extractor configuration JSON/i)).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /Save & register/i }))
    await waitFor(() => {
      expect(chromeMock.storageLocalSet).toHaveBeenCalledWith(
        expect.objectContaining({
          [SITE_EXTRACTOR_CONFIG_JSON_KEY]: expect.stringMatching(/"sites"\s*:\s*\[/),
        })
      )
    })
    await waitFor(() => {
      expect(chromeMock.runtimeSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: SITE_CONFIGS_UPDATED })
      )
    })
    expect(chrome.permissions.request).toHaveBeenCalled()
  })

  it("hides Check Price when the insight source tab is a service site (madmuscles)", async () => {
    chromeMock.tabsQuery.mockResolvedValue([
      { id: 77, url: "https://www.madmuscles.com/" }
    ])
    chromeMock.tabsSendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, cb?: (r: unknown) => void) => {
        if (typeof cb === "function") {
          cb({
            ok: true,
            product: {
              retailer: "madmuscles",
              locale: "en-US",
              url: "https://www.madmuscles.com/",
              title: "Coaching",
              reviewExcerpts: [] as string[],
              extractedAt: "2026-04-15T12:00:00.000Z"
            }
          })
        }
      }
    )
    stored[SITE_EXTRACTOR_CONFIG_JSON_KEY] = JSON.stringify(DEFAULT_SITE_EXTRACTOR_CONFIG)
    renderSidePanel()
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Check Price$/i })).not.toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: /Get Review Insight/i })).toBeInTheDocument()
  })

  it("shows service empty-thread hint when tab is a service site", async () => {
    chromeMock.tabsQuery.mockResolvedValue([
      { id: 77, url: "https://www.madmuscles.com/" }
    ])
    chromeMock.tabsSendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, cb?: (r: unknown) => void) => {
        if (typeof cb === "function") {
          cb({
            ok: true,
            product: {
              retailer: "madmuscles",
              locale: "en-US",
              url: "https://www.madmuscles.com/",
              title: "Coaching",
              reviewExcerpts: [] as string[],
              extractedAt: "2026-04-15T12:00:00.000Z"
            }
          })
        }
      }
    )
    stored[SITE_EXTRACTOR_CONFIG_JSON_KEY] = JSON.stringify(DEFAULT_SITE_EXTRACTOR_CONFIG)
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByText(/Get Review Insight for web research on this service page/i)).toBeInTheDocument()
    })
  })
})
