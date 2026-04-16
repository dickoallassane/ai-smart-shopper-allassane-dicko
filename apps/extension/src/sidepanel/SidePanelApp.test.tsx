import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import type { InsightResponse } from "@shopfriend/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SidePanelApp } from "./SidePanelApp"
import { createChromeMock } from "../test-utils/chrome-mock"

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
          cb({ lastInsight: stored.lastInsight })
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

  it("shows empty state when no insight is stored", async () => {
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByText(/No insight yet/i)).toBeInTheDocument()
    })
  })

  it("renders cards from stored insight", async () => {
    stored.lastInsight = mockInsight
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByText(/Request b0eebc99/i)).toBeInTheDocument()
    })
    expect(screen.getByText("Returns")).toBeInTheDocument()
    expect(screen.getByText("See retailer policy.")).toBeInTheDocument()
  })

  it("updates when INSIGHT_READY message is received", async () => {
    renderSidePanel()
    await waitFor(() => {
      expect(screen.getByText(/No insight yet/i)).toBeInTheDocument()
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
      expect(screen.getByText(/Request b0eebc99/i)).toBeInTheDocument()
    })
    expect(chromeMock.storageLocalSet).toHaveBeenCalledWith({
      lastInsight: mockInsight
    })
  })
})
