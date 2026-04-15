import type { InsightRequest, InsightResponse } from '@shopfriend/shared'

const DEFAULT_API_BASE = 'http://localhost:3000'

const getApiBase = (): string => {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return DEFAULT_API_BASE
  }
  return DEFAULT_API_BASE
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'OPEN_SIDE_PANEL') {
    const open = async () => {
      const tabId = message.tabId as number | undefined
      if (tabId === undefined) {
        return
      }
      await chrome.sidePanel.open({ tabId })
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
    void chrome.storage.session.set({
      lastProductPayload: message.payload
    })
  }

  return undefined
})

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
})
