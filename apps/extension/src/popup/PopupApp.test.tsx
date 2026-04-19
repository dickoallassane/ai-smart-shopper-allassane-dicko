import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PopupApp } from "./PopupApp"
import { DEFAULT_SITE_EXTRACTOR_CONFIG, SITE_EXTRACTOR_CONFIG_JSON_KEY } from "../lib/site-extractor-config"
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
  let stored: Record<string, unknown>

  beforeEach(() => {
    stored = {}
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
    chromeMock.tabsQuery.mockResolvedValue([
      { id: 42, url: "https://www.amazon.com/dp/B0DZZWMB2L" }
    ])
    chromeMock.tabsSendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, cb?: (r: unknown) => void) => {
        if (typeof cb === "function") {
          cb({ ok: false, error: "No receiver" })
        }
      }
    )
    chromeMock.storageSessionGet.mockResolvedValue({})
  })

  afterEach(() => {
    cleanup()
    chromeMock.remove()
    closeSpy.mockRestore()
  })

  it("shows PDP hint when no product payload is in session storage", async () => {
    renderPopup()
    await waitFor(() => {
      expect(screen.getByText(/Open an Amazon product page to attach context/i)).toBeInTheDocument()
    })
  })

  it("shows invalid payload hint when stored product fails schema", async () => {
    stored[SITE_EXTRACTOR_CONFIG_JSON_KEY] = JSON.stringify(DEFAULT_SITE_EXTRACTOR_CONFIG)
    chromeMock.tabsSendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, cb?: (r: unknown) => void) => {
        if (typeof cb === "function") {
          cb({
            ok: true,
            product: {
              retailer: "amazon",
              locale: "en-US",
              url: "https://www.amazon.com/dp/B0DZZWMB2L",
              title: "",
              extractedAt: "2026-04-15T12:00:00.000Z",
              reviewExcerpts: []
            }
          })
        }
      }
    )
    renderPopup()
    await waitFor(() => {
      expect(
        screen.getByText(/We could not read this page yet — try refreshing the listing/i)
      ).toBeInTheDocument()
    })
  })

  it("shows ready hint when stored product is valid", async () => {
    stored[SITE_EXTRACTOR_CONFIG_JSON_KEY] = JSON.stringify(DEFAULT_SITE_EXTRACTOR_CONFIG)
    chromeMock.tabsSendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, cb?: (r: unknown) => void) => {
        if (typeof cb === "function") {
          cb({ ok: true, product: validProduct })
        }
      }
    )
    renderPopup()
    await waitFor(() => {
      expect(
        screen.getByText(/You are set on this page — open the panel when you want a check/i)
      ).toBeInTheDocument()
    })
  })

  it("opens side panel when Start Now is clicked", async () => {
    const user = userEvent.setup()
    renderPopup()
    await user.click(screen.getByRole("button", { name: /Start Now/i }))
    expect(chromeMock.tabsQuery).toHaveBeenCalled()
    expect(chromeMock.runtimeSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "OPEN_SIDE_PANEL", tabId: 42 })
    )
    expect(closeSpy).toHaveBeenCalled()
  })

  it("renders hero title and secure badge", async () => {
    renderPopup()
    expect(screen.getByRole("heading", { name: /Need a second opinion/i })).toBeInTheDocument()
    expect(screen.getByText(/Private & secure/i)).toBeInTheDocument()
  })
})
