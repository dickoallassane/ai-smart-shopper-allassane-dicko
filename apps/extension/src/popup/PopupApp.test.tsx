import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { InsightResponse } from "@shopfriend/shared"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PopupApp } from "./PopupApp"
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
  requestId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  cards: [
    {
      id: "reality-check",
      kind: "reality_check",
      title: "Reality check",
      bullets: [{ text: "Stub" }]
    }
  ],
  limitations: [],
  generatedAt: "2026-04-15T12:00:00.000Z"
}

const renderPopup = () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })
  return render(
    <QueryClientProvider client={client}>
      <PopupApp />
    </QueryClientProvider>
  )
}

describe("PopupApp", () => {
  let chromeMock: ReturnType<typeof createChromeMock>

  beforeEach(() => {
    chromeMock = createChromeMock()
    chromeMock.install()
    chromeMock.runtimeSendMessage.mockImplementation(
      (msg: { type?: string }, cb?: (r: unknown) => void) => {
        if (typeof cb === "function") {
          cb({ ok: true, insight: mockInsight })
          return
        }
        return Promise.resolve()
      }
    )
    chromeMock.tabsQuery.mockResolvedValue([{ id: 42 }])
  })

  afterEach(() => {
    cleanup()
    chromeMock.remove()
  })

  it("shows guidance when no product payload is in session storage", async () => {
    chromeMock.storageSessionGet.mockResolvedValue({})
    renderPopup()
    await waitFor(() => {
      expect(screen.getByText(/No product context yet/i)).toBeInTheDocument()
    })
  })

  it("shows invalid payload message when stored product fails schema", async () => {
    chromeMock.storageSessionGet.mockResolvedValue({
      lastProductPayload: { retailer: "amazon", title: "" }
    })
    renderPopup()
    await waitFor(() => {
      expect(screen.getByText(/Invalid product payload/i)).toBeInTheDocument()
    })
  })

  it("shows run insight when stored product is valid", async () => {
    chromeMock.storageSessionGet.mockResolvedValue({
      lastProductPayload: validProduct
    })
    renderPopup()
    await waitFor(() => {
      expect(screen.getByText(/Product context found/i)).toBeInTheDocument()
    })
  })

  it("requests insight when Run insight is clicked", async () => {
    const user = userEvent.setup()
    chromeMock.storageSessionGet.mockResolvedValue({
      lastProductPayload: validProduct
    })
    renderPopup()
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Run insight/i })).toBeEnabled()
    })
    await user.click(screen.getByRole("button", { name: /Run insight/i }))
    await waitFor(() => {
      expect(chromeMock.runtimeSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "REQUEST_INSIGHT" }),
        expect.any(Function)
      )
    })
  })

  it("opens side panel when Open side panel is clicked", async () => {
    const user = userEvent.setup()
    chromeMock.storageSessionGet.mockResolvedValue({})
    renderPopup()
    await user.click(screen.getByRole("button", { name: /Open side panel/i }))
    expect(chromeMock.tabsQuery).toHaveBeenCalled()
    expect(chromeMock.runtimeSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "OPEN_SIDE_PANEL", tabId: 42 })
    )
  })
})
