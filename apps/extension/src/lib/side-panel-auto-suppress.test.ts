import { describe, expect, it } from 'vitest'
import {
  parseTabIdFromSidePanelLivePortName,
  sidePanelAutoSuppressSessionKey,
  sidePanelLivePortNameForTab,
} from './side-panel-auto-suppress'

describe('side-panel-auto-suppress', () => {
  it('roundtrips tab id in port name', () => {
    expect(sidePanelLivePortNameForTab(42)).toBe('shopfriend-side-panel-live:42')
    expect(parseTabIdFromSidePanelLivePortName(sidePanelLivePortNameForTab(42))).toBe(42)
  })

  it('returns undefined for unrelated port names', () => {
    expect(parseTabIdFromSidePanelLivePortName('other')).toBeUndefined()
  })

  it('uses stable session keys', () => {
    expect(sidePanelAutoSuppressSessionKey(7)).toBe('shopfriend:sidePanelSuppressAuto:7')
  })
})
