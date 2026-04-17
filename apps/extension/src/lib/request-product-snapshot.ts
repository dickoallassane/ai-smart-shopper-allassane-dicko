import type { ProductPayload } from '@shopfriend/shared'
import { SHOPFRIEND_SNAPSHOT_PRODUCT } from './shopfriend-messages'

export type ProductSnapshotResult =
  | { ok: true; product: ProductPayload }
  | { ok: false; error: string }

type SnapshotResponse = ProductSnapshotResult

export const isRestrictedBrowserUrl = (url: string): boolean => {
  const u = url.trim().toLowerCase()
  return (
    u.startsWith('chrome://') ||
    u.startsWith('chrome-search://') ||
    u.startsWith('edge://') ||
    u.startsWith('about:') ||
    u.startsWith('devtools:') ||
    u.startsWith('chrome-extension://') ||
    u.startsWith('view-source:') ||
    u.startsWith('file:') ||
    u.startsWith('https://chrome.google.com/webstore') ||
    u.startsWith('https://chromewebstore.google.com/')
  )
}

const sendSnapshotToTab = (tabId: number): Promise<SnapshotResponse> =>
  new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: SHOPFRIEND_SNAPSHOT_PRODUCT }, (response: unknown) => {
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          error:
            chrome.runtime.lastError.message ??
            'No ShopFriend content script on this page (refresh the tab or open a supported store page).'
        })
        return
      }
      const body = response as Partial<SnapshotResponse> | undefined
      if (body && typeof body === 'object' && 'ok' in body && body.ok === true && body.product) {
        resolve({ ok: true, product: body.product })
        return
      }
      if (body && typeof body === 'object' && 'ok' in body && body.ok === false && typeof body.error === 'string') {
        resolve({ ok: false, error: body.error })
        return
      }
      resolve({ ok: false, error: 'Unexpected response from the page.' })
    })
  })

export const requestProductSnapshotFromTabId = async (tabId: number): Promise<ProductSnapshotResult> =>
  sendSnapshotToTab(tabId)

/**
 * Snapshot the **active tab** in the window that hosts this extension page (side panel / popup).
 * Uses `chrome.tabs.sendMessage` so extraction always matches what the user is looking at.
 */
export const requestProductSnapshotFromActiveTab = async (): Promise<ProductSnapshotResult> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    return { ok: false, error: 'No active tab in this window.' }
  }
  if (!tab.url || tab.url.trim().length === 0) {
    return { ok: false, error: 'Active tab has no URL yet.' }
  }
  if (isRestrictedBrowserUrl(tab.url)) {
    return {
      ok: false,
      error: 'ShopFriend cannot read this kind of page — open a supported product or service tab.'
    }
  }
  return sendSnapshotToTab(tab.id)
}
