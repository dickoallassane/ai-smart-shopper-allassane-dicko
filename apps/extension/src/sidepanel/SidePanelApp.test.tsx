import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { InsightResponse } from "@shopfriend/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SidePanelApp } from "./SidePanelApp"
import {
  INSIGHT_CONTEXT_TAB_BY_WINDOW_ID,
  PRODUCT_PAYLOAD_BY_TAB_ID
} from "../lib/pdp-session-storage"
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
  let sessionValues: Record<string, unknown>

  beforeEach(() => {
    stored = {}
    sessionValues = {}
    chromeMock = createChromeMock()
    chromeMock.install()
    chromeMock.storageLocalGet.mockImplementation(
      (_keys: string | string[] | Record<string, unknown> | null, cb?: (r: Record<string, unknown>) => void) => {
        if (cb) {
          cb({ ...stored })
        }
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
    chromeMock.storageSessionGet.mockImplementation(
      async (keys: string | string[] | Record<string, unknown> | null | undefined) => {
        const names =
          keys === null || keys === undefined
            ? Object.keys(sessionValues)
            : typeof keys === "string"
              ? [keys]
              : Array.isArray(keys)
                ? keys
                : typeof keys === "object"
                  ? Object.keys(keys)
                  : []
        const out: Record<string, unknown> = {}
        for (const n of names) {
          if (Object.prototype.hasOwnProperty.call(sessionValues, n)) {
            out[n] = sessionValues[n]
          }
        }
        return out
      }
    )
    chromeMock.windowsGetCurrent.mockResolvedValue({ id: 10 })
    chromeMock.tabsQuery.mockResolvedValue([{ id: 77 }])
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

  it("appends stub assistant reply when Get Review Insight is clicked", async () => {
    const user = userEvent.setup()
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Get Review Insight/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /Get Review Insight/i }))
    await waitFor(() => {
      expect(screen.getByText(/Review-focused insights will run here/i)).toBeInTheDocument()
    })
  })

  it("requests insight and shows price-check user copy when Check Price is clicked with valid session", async () => {
    const user = userEvent.setup()
    sessionValues = {
      [INSIGHT_CONTEXT_TAB_BY_WINDOW_ID]: { "10": 55 },
      [PRODUCT_PAYLOAD_BY_TAB_ID]: { "55": validProduct }
    }
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
    sessionValues = {
      [INSIGHT_CONTEXT_TAB_BY_WINDOW_ID]: { "10": 55 },
      [PRODUCT_PAYLOAD_BY_TAB_ID]: { "55": validProduct }
    }
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
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Check Price$/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /^Check Price$/i }))
    await waitFor(() => {
      expect(
        screen.getByText(/Open an Amazon product page in this tab first/i)
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
})
