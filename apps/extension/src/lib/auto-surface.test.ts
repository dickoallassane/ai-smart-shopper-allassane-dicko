import { describe, expect, it } from 'vitest'
import { siteExtractorSiteSchema } from './site-extractor-config'
import {
  autoSurfaceShownInMemoryKey,
  shouldOfferAutoSurfaceForMatchedSite
} from './auto-surface'

const retailSiteBase = {
  id: 'demo',
  isService: false,
  matchPatterns: ['https://example.com/*'],
  pdpPathPatterns: [{ name: 'p', regex: '/p/', flags: '' }],
  selectors: { title: { primary: '#t' } },
}

describe('shouldOfferAutoSurfaceForMatchedSite', () => {
  it('returns false when autoSurface is omitted', () => {
    const site = siteExtractorSiteSchema.parse({ ...retailSiteBase })
    expect(
      shouldOfferAutoSurfaceForMatchedSite(site, {
        href: 'https://example.com/p/1',
        pathname: '/p/1',
        hostname: 'example.com',
      })
    ).toBe(false)
  })

  it('returns true for empty autoSurface object (enabled defaults on)', () => {
    const site = siteExtractorSiteSchema.parse({ ...retailSiteBase, autoSurface: {} })
    expect(
      shouldOfferAutoSurfaceForMatchedSite(site, {
        href: 'https://example.com/p/1',
        pathname: '/p/1',
        hostname: 'example.com',
      })
    ).toBe(true)
  })

  it('returns false when enabled is false', () => {
    const site = siteExtractorSiteSchema.parse({
      ...retailSiteBase,
      autoSurface: { enabled: false },
    })
    expect(
      shouldOfferAutoSurfaceForMatchedSite(site, {
        href: 'https://example.com/p/1',
        pathname: '/p/1',
        hostname: 'example.com',
      })
    ).toBe(false)
  })

  it('when urlRegex is set, requires href match', () => {
    const site = siteExtractorSiteSchema.parse({
      ...retailSiteBase,
      autoSurface: { urlRegex: '/only-special/', flags: '' },
    })
    expect(
      shouldOfferAutoSurfaceForMatchedSite(site, {
        href: 'https://example.com/p/1',
        pathname: '/p/1',
        hostname: 'example.com',
      })
    ).toBe(false)
    expect(
      shouldOfferAutoSurfaceForMatchedSite(site, {
        href: 'https://example.com/p/only-special/x',
        pathname: '/p/only-special/x',
        hostname: 'example.com',
      })
    ).toBe(true)
  })
})

describe('autoSurfaceShownInMemoryKey', () => {
  it('builds a stable in-memory key per site + full href', () => {
    expect(autoSurfaceShownInMemoryKey('amazon', 'https://www.amazon.com/dp/B012345678')).toBe(
      'shopfriend:autoSurface:shown:in-memory:amazon:https://www.amazon.com/dp/B012345678'
    )
  })
})
