import type { InsightRequest, InsightResponse, ProductPayload } from '@shopfriend/shared'
import {
  INSIGHT_CONTEXT_TAB_BY_WINDOW_ID,
  PRODUCT_PAYLOAD_BY_TAB_ID,
  mergeProductPayloadForTab,
  type InsightContextTabByWindowId,
  type ProductPayloadByTabId
} from './lib/pdp-session-storage'

const stripTrailingSlash = (value: string) => value.replace(/\/$/, '')

const resolveApiBase = (): string => {
  const fromEnv = import.meta.env.VITE_SHOPFRIEND_API_ORIGIN?.trim()
  if (fromEnv && fromEnv.length > 0) {
    return stripTrailingSlash(fromEnv)
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:3000'
  }
  console.warn('[ShopFriend] VITE_SHOPFRIEND_API_ORIGIN is unset; set it at build time in apps/extension/.env')
  return ''
}

const getApiBase = (): string => {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return resolveApiBase()
  }
  return resolveApiBase()
}

const fetchInsight = async (
  body: InsightRequest,
  accessToken: string | undefined,
  signal: AbortSignal
): Promise<InsightResponse> => {
  const base = getApiBase()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }
  const response = await fetch(`${base}/api/insight`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Insight failed (${response.status})`)
  }
  return (await response.json()) as InsightResponse
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'OPEN_SIDE_PANEL') {
    const open = async () => {
      const tabId = message.tabId as number | undefined
      if (tabId === undefined) {
        return
      }
      // Must open the side panel before any other `await` — Chrome ties
      // `sidePanel.open` to the user gesture from the popup; earlier awaits
      // (tabs.get, storage) consume that chain and the open silently fails.
      await chrome.sidePanel.open({ tabId })
      try {
        const tab = await chrome.tabs.get(tabId)
        const session = await chrome.storage.session.get(INSIGHT_CONTEXT_TAB_BY_WINDOW_ID)
        const prev =
          (session[INSIGHT_CONTEXT_TAB_BY_WINDOW_ID] as InsightContextTabByWindowId | undefined) ?? {}
        await chrome.storage.session.set({
          [INSIGHT_CONTEXT_TAB_BY_WINDOW_ID]: {
            ...prev,
            [String(tab.windowId)]: tabId
          }
        })
      } catch (error) {
        console.warn('[ShopFriend] Could not persist insight context tab for window', error)
      }
    }
    void open()
    return
  }

  if (message?.type === 'REQUEST_INSIGHT') {
    const controller = new AbortController()
    const timeoutMs = typeof message.timeoutMs === 'number' ? message.timeoutMs : 14_000
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    const run = async () => {
      try {
        const stored = await chrome.storage.local.get(['extensionAccessToken'])
        const accessToken = stored.extensionAccessToken as string | undefined
        const insight = await fetchInsight(
          message.payload as InsightRequest,
          accessToken,
          controller.signal
        )
        await chrome.storage.local.set({ lastInsight: insight })
        try {
          await chrome.runtime.sendMessage({ type: 'INSIGHT_READY', insight })
        } catch {
          /* no listeners */
        }
        sendResponse({ ok: true as const, insight })
      } catch (error) {
        const err = error instanceof Error ? error.message : 'Unknown error'
        sendResponse({ ok: false as const, error: err })
      } finally {
        clearTimeout(timeout)
      }
    }

    void run()
    return true
  }

  if (message?.type === 'PRODUCT_PAYLOAD') {
    const tabId = sender.tab?.id
    if (tabId === undefined) {
      return undefined
    }
    const product = message.payload as ProductPayload
    console.debug('[ShopFriend] PRODUCT_PAYLOAD received', { tabId, product })
    void (async () => {
      const session = await chrome.storage.session.get(PRODUCT_PAYLOAD_BY_TAB_ID)
      const prev = session[PRODUCT_PAYLOAD_BY_TAB_ID] as ProductPayloadByTabId | undefined
      const map = mergeProductPayloadForTab(prev, String(tabId), product)
      await chrome.storage.session.set({ [PRODUCT_PAYLOAD_BY_TAB_ID]: map })
    })()
  }

  return undefined
})

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
})
