/** Prefix for `runtime.connect` name; full name is `${PREFIX}:${tabId}` so disconnect clears the right tab. */
export const SIDE_PANEL_LIVE_PORT_PREFIX = 'shopfriend-side-panel-live' as const

export const sidePanelLivePortNameForTab = (tabId: number): string =>
  `${SIDE_PANEL_LIVE_PORT_PREFIX}:${tabId}`

export const parseTabIdFromSidePanelLivePortName = (portName: string): number | undefined => {
  const prefix = `${SIDE_PANEL_LIVE_PORT_PREFIX}:`
  if (!portName.startsWith(prefix)) {
    return undefined
  }
  const n = Number.parseInt(portName.slice(prefix.length), 10)
  return Number.isFinite(n) ? n : undefined
}

export const sidePanelAutoSuppressSessionKey = (tabId: number): string =>
  `shopfriend:sidePanelSuppressAuto:${tabId}`

export const setSidePanelAutoSuppressForTab = async (tabId: number): Promise<void> => {
  await chrome.storage.session.set({ [sidePanelAutoSuppressSessionKey(tabId)]: true })
}

export const clearSidePanelAutoSuppressForTab = async (tabId: number): Promise<void> => {
  await chrome.storage.session.remove(sidePanelAutoSuppressSessionKey(tabId))
}

export const isSidePanelAutoSuppressedForTab = async (tabId: number): Promise<boolean> => {
  const key = sidePanelAutoSuppressSessionKey(tabId)
  const got = await chrome.storage.session.get(key)
  return got[key] === true
}
