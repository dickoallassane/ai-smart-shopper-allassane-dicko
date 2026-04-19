import { AUTO_SURFACE_HOST_ID } from './auto-surface-overlay'

/** In-page ShopFriend shadow host, if present. */
export const getOverlayHost = (): HTMLElement | null => {
  const el = document.getElementById(AUTO_SURFACE_HOST_ID)
  return el instanceof HTMLElement ? el : null
}

/**
 * Toolbar / user-gesture mount uses `persistDismissOnClose: false` → `dataset.persistDismiss === '0'`.
 * Auto-surface uses `'1'`. Manual hosts must not be torn down by auto-surface evaluation.
 */
export const isManualInPageOverlay = (el: Element | null): boolean =>
  el instanceof HTMLElement && el.dataset.persistDismiss === '0'
