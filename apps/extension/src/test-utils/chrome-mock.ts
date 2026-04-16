import { vi } from "vitest"

export type ChromeMock = {
  storageSessionGet: ReturnType<typeof vi.fn>
  storageLocalGet: ReturnType<typeof vi.fn>
  storageLocalSet: ReturnType<typeof vi.fn>
  runtimeSendMessage: ReturnType<typeof vi.fn>
  tabsQuery: ReturnType<typeof vi.fn>
  messageListeners: Array<(message: unknown, sender: unknown, sendResponse: (v?: unknown) => void) => boolean | void>
  install: () => void
  remove: () => void
}

export const createChromeMock = (): ChromeMock => {
  const messageListeners: ChromeMock["messageListeners"] = []
  const storageSessionGet = vi.fn()
  const storageLocalGet = vi.fn()
  const storageLocalSet = vi.fn()
  const runtimeSendMessage = vi.fn()
  const tabsQuery = vi.fn()

  const chromeObj = {
    storage: {
      session: { get: storageSessionGet },
      local: {
        get: storageLocalGet,
        set: storageLocalSet
      }
    },
    runtime: {
      sendMessage: runtimeSendMessage,
      lastError: undefined as { message: string } | undefined,
      onMessage: {
        addListener: vi.fn(
          (fn: (message: unknown, sender: unknown, sendResponse: (v?: unknown) => void) => boolean | void) => {
            messageListeners.push(fn)
          }
        ),
        removeListener: vi.fn()
      }
    },
    tabs: {
      query: tabsQuery
    }
  }

  const install = () => {
    vi.stubGlobal("chrome", chromeObj as unknown as typeof chrome)
  }

  const remove = () => {
    vi.unstubAllGlobals()
  }

  return {
    storageSessionGet,
    storageLocalGet,
    storageLocalSet,
    runtimeSendMessage,
    tabsQuery,
    messageListeners,
    install,
    remove
  }
}
