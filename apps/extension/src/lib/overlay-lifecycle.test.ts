import { afterEach, describe, expect, it } from 'vitest'
import { AUTO_SURFACE_HOST_ID } from './auto-surface-overlay'
import { getOverlayHost, isManualInPageOverlay } from './overlay-lifecycle'

describe('overlay-lifecycle', () => {
  afterEach(() => {
    document.getElementById(AUTO_SURFACE_HOST_ID)?.remove()
  })

  describe('isManualInPageOverlay', () => {
    it('returns true when persistDismiss is 0', () => {
      const el = document.createElement('div')
      el.dataset.persistDismiss = '0'
      expect(isManualInPageOverlay(el)).toBe(true)
    })

    it('returns false when persistDismiss is 1', () => {
      const el = document.createElement('div')
      el.dataset.persistDismiss = '1'
      expect(isManualInPageOverlay(el)).toBe(false)
    })

    it('returns false when persistDismiss is missing', () => {
      const el = document.createElement('div')
      expect(isManualInPageOverlay(el)).toBe(false)
    })
  })

  describe('getOverlayHost', () => {
    it('returns null when host is absent', () => {
      expect(getOverlayHost()).toBeNull()
    })

    it('returns element when host id is present', () => {
      const host = document.createElement('div')
      host.id = AUTO_SURFACE_HOST_ID
      document.documentElement.appendChild(host)
      expect(getOverlayHost()).toBe(host)
    })
  })
})
