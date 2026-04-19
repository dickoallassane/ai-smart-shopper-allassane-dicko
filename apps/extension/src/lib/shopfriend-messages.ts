/** Content script: run extraction now and respond to the caller (side panel / popup). */
export const SHOPFRIEND_SNAPSHOT_PRODUCT = 'SHOPFRIEND_SNAPSHOT_PRODUCT' as const

/** Background → content script: show the embedded popup iframe (toolbar icon). */
export const SHOW_SHOPFRIEND_PAGE_POPUP = 'SHOW_SHOPFRIEND_PAGE_POPUP' as const

/** Content script → background: resolve `sender.tab.id` for the calling content script. */
export const GET_SHOPPER_TAB_ID = 'GET_SHOPPER_TAB_ID' as const

