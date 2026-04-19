import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SITE_EXTRACTOR_CONFIG,
  parseSiteExtractorConfigJson,
  siteExtractorConfigFileSchema
} from './site-extractor-config'

describe('parseSiteExtractorConfigJson', () => {
  it('rejects empty input', () => {
    const r = parseSiteExtractorConfigJson('')
    expect(r.success).toBe(false)
  })

  it('rejects invalid JSON', () => {
    const r = parseSiteExtractorConfigJson('{')
    expect(r.success).toBe(false)
  })

  it('parses default config string', () => {
    const raw = JSON.stringify(DEFAULT_SITE_EXTRACTOR_CONFIG)
    const r = parseSiteExtractorConfigJson(raw)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.sites[0]?.id).toBe('amazon')
    }
  })
})

describe('siteExtractorConfigFileSchema', () => {
  it('requires at least one site', () => {
    const r = siteExtractorConfigFileSchema.safeParse({ sites: [] })
    expect(r.success).toBe(false)
  })

  it('rejects retail site missing selectors.title', () => {
    const r = siteExtractorConfigFileSchema.safeParse({
      sites: [
        {
          id: 'x',
          isService: false,
          matchPatterns: ['https://a.com/*'],
          pdpPathPatterns: [{ name: 'p', regex: '/', flags: '' }],
          selectors: {},
        },
      ],
    })
    expect(r.success).toBe(false)
  })

  it('accepts service site without selectors', () => {
    const r = siteExtractorConfigFileSchema.safeParse({
      sites: [
        {
          id: 'svc',
          isService: true,
          matchPatterns: ['https://svc.example/*'],
          pdpPathPatterns: [{ name: 'any', regex: '.*', flags: '' }],
        },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('accepts retail site with autoSurface empty object', () => {
    const r = siteExtractorConfigFileSchema.safeParse({
      sites: [
        {
          id: 'x',
          isService: false,
          matchPatterns: ['https://a.com/*'],
          pdpPathPatterns: [{ name: 'p', regex: '/', flags: '' }],
          autoSurface: {},
          selectors: {
            title: { primary: '#t' },
          },
        },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('accepts autoSurface with urlRegex and flags', () => {
    const r = siteExtractorConfigFileSchema.safeParse({
      sites: [
        {
          id: 'x',
          isService: false,
          matchPatterns: ['https://a.com/*'],
          pdpPathPatterns: [{ name: 'p', regex: '/', flags: '' }],
          autoSurface: { enabled: true, urlRegex: '\\/dp\\/', flags: 'i' },
          selectors: {
            title: { primary: '#t' },
          },
        },
      ],
    })
    expect(r.success).toBe(true)
  })

  it('accepts autoSurface enabled false', () => {
    const r = siteExtractorConfigFileSchema.safeParse({
      sites: [
        {
          id: 'x',
          isService: false,
          matchPatterns: ['https://a.com/*'],
          pdpPathPatterns: [{ name: 'p', regex: '/', flags: '' }],
          autoSurface: { enabled: false },
          selectors: {
            title: { primary: '#t' },
          },
        },
      ],
    })
    expect(r.success).toBe(true)
  })
})
