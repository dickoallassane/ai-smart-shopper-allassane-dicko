import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { InsightResponse } from "@shopfriend/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SidePanelApp } from "./SidePanelApp"
import { createChromeMock } from "../test-utils/chrome-mock"

const validProduct = {
  retailer: "amazon" as const,
  locale: "en-US",
  url: "https://www.amazon.com/dp/B0DZZWMB2L",
  title: "Example product",
  extractedAt: "2026-04-15T12:00:00.000Z",
  reviewExcerpts: [] as string[]
}

const mockInsight: InsightResponse = {
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
    chromeMock.storageSessionGet.mockResolvedValue({})
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByText(/No messages yet/i)).toBeInTheDocument()
    })
  })

  it("renders disabled chat composer", async () => {
    chromeMock.storageSessionGet.mockResolvedValue({})
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByLabelText(/Message \(disabled\)/i)).toBeDisabled()
    })
  })

  it("appends stub assistant reply when Get Review Insight is clicked", async () => {
    const user = userEvent.setup()
    chromeMock.storageSessionGet.mockResolvedValue({})
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Get Review Insight/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /Get Review Insight/i }))
    await waitFor(() => {
      expect(screen.getByText(/Review-focused insights will run here/i)).toBeInTheDocument()
    })
  })

  it("requests insight when Check Price is clicked with valid session payload", async () => {
    const user = userEvent.setup()
    chromeMock.storageSessionGet.mockResolvedValue({
      lastProductPayload: validProduct
    })
    chromeMock.runtimeSendMessage.mockImplementation(
      (msg: { type?: string }, cb?: (r: unknown) => void) => {
        if (typeof cb === "function") {
          cb({ ok: true, insight: mockInsight })
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
      expect(screen.getByText(/Returns/i)).toBeInTheDocument()
    })
  })

  it("shows guidance in thread when Check Price is clicked without product context", async () => {
    const user = userEvent.setup()
    chromeMock.storageSessionGet.mockResolvedValue({})
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
    chromeMock.storageSessionGet.mockResolvedValue({})
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByText(/No messages yet/i)).toBeInTheDocument()
    })
    const listener = chromeMock.messageListeners[0]
    expect(listener).toBeDefined()
    const sendResponse = vi.fn()
    listener!(
      { type: "INSIGHT_READY", insight: mockInsight },
      {},
      sendResponse
    )
    await waitFor(() => {
      expect(screen.getByText(/Returns/i)).toBeInTheDocument()
    })
  })
})
