import { describe, expect, it } from 'vitest'
import { DEFAULT_SITE_EXTRACTOR_CONFIG, siteExtractorSiteSchema } from './site-extractor-config'
import { mergeAutoSurfaceFromBuiltInDefaults } from './load-sites-config'

describe('mergeAutoSurfaceFromBuiltInDefaults', () => {
  it('adds autoSurface from built-in default when the stored site omits it', () => {
    const amazon = DEFAULT_SITE_EXTRACTOR_CONFIG.sites[0]
    const { autoSurface: _drop, ...withoutAuto } = amazon
    const parsed = siteExtractorSiteSchema.parse(withoutAuto)
    expect(parsed.autoSurface).toBeUndefined()

    const merged = mergeAutoSurfaceFromBuiltInDefaults([parsed])
    expect(merged[0].autoSurface).toEqual({ enabled: true })
  })

  it('does not override an explicit autoSurface on the stored site', () => {
    const amazon = DEFAULT_SITE_EXTRACTOR_CONFIG.sites[0]
    const { autoSurface: _drop, ...rest } = amazon
    const parsed = siteExtractorSiteSchema.parse({
      ...rest,
      autoSurface: { enabled: false },
    })
    const merged = mergeAutoSurfaceFromBuiltInDefaults([parsed])
    expect(merged[0].autoSurface).toEqual({ enabled: false })
  })

  it('leaves unknown site ids unchanged when they omit autoSurface', () => {
    const site = siteExtractorSiteSchema.parse({
      id: 'custom-retailer',
      isService: false,
      matchPatterns: ['https://custom.example/*'],
      pdpPathPatterns: [{ name: 'p', regex: '/', flags: '' }],
      selectors: { title: { primary: '#t' } },
    })
    const merged = mergeAutoSurfaceFromBuiltInDefaults([site])
    expect(merged[0].autoSurface).toBeUndefined()
  })
})
