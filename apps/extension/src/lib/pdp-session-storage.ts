import type { ProductPayload } from '@shopfriend/shared'

/** Session key: tabId string → latest validated product snapshot from that tab */
export const PRODUCT_PAYLOAD_BY_TAB_ID = 'productPayloadByTabId' as const

/** Session key: Chrome window id string → tab id the side panel was opened for */
export const INSIGHT_CONTEXT_TAB_BY_WINDOW_ID = 'insightContextTabByWindowId' as const

export type ProductPayloadByTabId = Record<string, ProductPayload>

export type InsightContextTabByWindowId = Record<string, number>

const MAX_TAB_ENTRIES = 32

/** Merges payload for tabId and trims the map so session quota stays bounded */
export const mergeProductPayloadForTab = (
  prev: ProductPayloadByTabId | undefined,
  tabId: string,
  product: ProductPayload
): ProductPayloadByTabId => {
  const next = { ...(prev ?? {}), [tabId]: product }
  let keys = Object.keys(next)
  while (keys.length > MAX_TAB_ENTRIES) {
    const toRemove = keys.find((k) => k !== tabId) ?? keys[0]
    delete next[toRemove]
    keys = Object.keys(next)
  }
  return next
}

/**
 * Tab the side panel should use for PDP context: last tab used to open the panel
 * for this window, else the active tab in the current window.
 */
export const resolveInsightSourceTabId = async (): Promise<number | undefined> => {
  try {
    const currentWindow = await chrome.windows.getCurrent()
    const session = await chrome.storage.session.get(INSIGHT_CONTEXT_TAB_BY_WINDOW_ID)
    const ctxMap =
      (session[INSIGHT_CONTEXT_TAB_BY_WINDOW_ID] as InsightContextTabByWindowId | undefined) ?? {}
    const fromPanelOpen = ctxMap[String(currentWindow.id)]
    if (typeof fromPanelOpen === 'number') {
      return fromPanelOpen
    }
  } catch {
    /* chrome.windows can fail in restricted contexts */
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.id
}

export const getStoredProductPayloadForTab = async (tabId: number): Promise<ProductPayload | null> => {
  const session = await chrome.storage.session.get(PRODUCT_PAYLOAD_BY_TAB_ID)
  const map = session[PRODUCT_PAYLOAD_BY_TAB_ID] as ProductPayloadByTabId | undefined
  const raw = map?.[String(tabId)]
  return raw ?? null
}
