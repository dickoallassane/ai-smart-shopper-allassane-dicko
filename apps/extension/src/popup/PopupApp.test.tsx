import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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
  let closeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    closeSpy = vi.spyOn(window, "close").mockImplementation(() => {})
    chromeMock = createChromeMock()
    chromeMock.install()
    chromeMock.runtimeSendMessage.mockImplementation(
      (_msg: { type?: string }, cb?: (r: unknown) => void) => {
        if (typeof cb === "function") {
          cb({ ok: true })
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
    closeSpy.mockRestore()
  })

  it("shows PDP hint when no product payload is in session storage", async () => {
    chromeMock.storageSessionGet.mockResolvedValue({})
    renderPopup()
    await waitFor(() => {
      expect(screen.getByText(/Open an Amazon product page to attach context/i)).toBeInTheDocument()
    })
  })

  it("shows invalid payload hint when stored product fails schema", async () => {
    chromeMock.storageSessionGet.mockResolvedValue({
      lastProductPayload: { retailer: "amazon", title: "" }
    })
    renderPopup()
    await waitFor(() => {
      expect(
        screen.getByText(/We could not read this page yet — try refreshing the listing/i)
      ).toBeInTheDocument()
    })
  })

  it("shows ready hint when stored product is valid", async () => {
    chromeMock.storageSessionGet.mockResolvedValue({
      lastProductPayload: validProduct
    })
    renderPopup()
    await waitFor(() => {
      expect(
        screen.getByText(/You are set on this page — open the panel when you want a check/i)
      ).toBeInTheDocument()
    })
  })

  it("opens side panel when Start Now is clicked", async () => {
    const user = userEvent.setup()
    chromeMock.storageSessionGet.mockResolvedValue({})
    renderPopup()
    await user.click(screen.getByRole("button", { name: /Start Now/i }))
    expect(chromeMock.tabsQuery).toHaveBeenCalled()
    expect(chromeMock.runtimeSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "OPEN_SIDE_PANEL", tabId: 42 })
    )
    expect(closeSpy).toHaveBeenCalled()
  })

  it("renders hero title and secure badge", async () => {
    chromeMock.storageSessionGet.mockResolvedValue({})
    renderPopup()
    expect(screen.getByRole("heading", { name: /Need a second opinion/i })).toBeInTheDocument()
    expect(screen.getByText(/Private & secure/i)).toBeInTheDocument()
  })
})
