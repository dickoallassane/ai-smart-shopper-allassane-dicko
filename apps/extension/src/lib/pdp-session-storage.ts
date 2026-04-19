import type { ProductPayload } from '@shopfriend/shared'

/** Session key: tabId string → latest validated product snapshot from that tab (warm cache from content script). */
export const PRODUCT_PAYLOAD_BY_TAB_ID = 'productPayloadByTabId' as const

export type ProductPayloadByTabId = Record<string, ProductPayload>

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

export const getStoredProductPayloadForTab = async (tabId: number): Promise<ProductPayload | null> => {
  const session = await chrome.storage.session.get(PRODUCT_PAYLOAD_BY_TAB_ID)
  const map = session[PRODUCT_PAYLOAD_BY_TAB_ID] as ProductPayloadByTabId | undefined
  const raw = map?.[String(tabId)]
  return raw ?? null
}
