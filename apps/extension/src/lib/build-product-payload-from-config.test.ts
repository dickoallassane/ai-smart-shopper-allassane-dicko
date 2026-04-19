import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SITE_EXTRACTOR_CONFIG, siteExtractorSiteSchema } from './site-extractor-config'
import {
  findSiteForLocation,
  hostFromMatchPattern,
  hostMatchesSitePatterns,
  urlMatchesPdpPatterns
} from './build-product-payload-from-config'

const amazonSite = DEFAULT_SITE_EXTRACTOR_CONFIG.sites[0]

describe('hostFromMatchPattern', () => {
  it('extracts host from https pattern', () => {
    expect(hostFromMatchPattern('https://www.amazon.com/*')).toBe('www.amazon.com')
  })
})

describe('hostMatchesSitePatterns', () => {
  it('matches exact host', () => {
    expect(hostMatchesSitePatterns('www.amazon.com', ['https://www.amazon.com/*'])).toBe(true)
  })

  it('matches subdomain suffix', () => {
    expect(hostMatchesSitePatterns('smile.amazon.com', ['https://amazon.com/*'])).toBe(true)
  })
})

describe('urlMatchesPdpPatterns', () => {
  it('matches dp path', () => {
    expect(
      urlMatchesPdpPatterns('/dp/B0DZZWMB2L', 'https://www.amazon.com/dp/B0DZZWMB2L', amazonSite.pdpPathPatterns)
    ).toBe(true)
  })
})

describe('findSiteForLocation', () => {
  it('returns undefined when host matches but PDP patterns do not', () => {
    const loc = {
      hostname: 'www.amazon.com',
      pathname: '/s?k=tent',
      href: 'https://www.amazon.com/s?k=tent',
    }
    expect(findSiteForLocation(DEFAULT_SITE_EXTRACTOR_CONFIG.sites, loc)).toBeUndefined()
  })

  it('returns amazon site for matching PDP URL', () => {
    const loc = {
      hostname: 'www.amazon.com',
      pathname: '/dp/B0DZZWMB2L',
      href: 'https://www.amazon.com/dp/B0DZZWMB2L'
    }
    const site = findSiteForLocation(DEFAULT_SITE_EXTRACTOR_CONFIG.sites, loc)
    expect(site?.id).toBe('amazon')
  })

  it('returns undefined when host does not match', () => {
    const loc = {
      hostname: 'www.ebay.com',
      pathname: '/dp/B0DZZWMB2L',
      href: 'https://www.ebay.com/dp/B0DZZWMB2L'
    }
    expect(findSiteForLocation(DEFAULT_SITE_EXTRACTOR_CONFIG.sites, loc)).toBeUndefined()
  })

  it('matches amazon dp URL with ref/query params from detail page', () => {
    const href =
      'https://www.amazon.com/dp/B09MQLP33J/ref=sspa_dk_detail_5?pd_rd_i=B09MQLP33J&pd_rd_w=MSx2Z&content-id=amzn1.sym.85ceacba-39b1-4243-8f28-2e014f9512c7&pf_rd_p=85ceacba-39b1-4243-8f28-2e014f9512c7&pf_rd_r=NNYGDYSRTKKZFWGEQ2TA&pd_rd_wg=YzUaL&pd_rd_r=02ceda99-fb67-4557-8b2c-f960249a62be&sp_csd=d2lkZ2V0TmFtZT1zcF9kZXRhaWxfdGhlbWF0aWM&th=1'
    const loc = {
      hostname: 'www.amazon.com',
      pathname: '/dp/B09MQLP33J/ref=sspa_dk_detail_5',
      href,
    }
    const site = findSiteForLocation(DEFAULT_SITE_EXTRACTOR_CONFIG.sites, loc)
    expect(site?.id).toBe('amazon')
  })

  it('matches amazon gp/product URL with query params', () => {
    const href =
      'https://www.amazon.com/gp/product/B0CT5GHZ8Q/ref=ox_sc_act_title_2?smid=A3Q58RZI91UC7I&th=1'
    const loc = {
      hostname: 'www.amazon.com',
      pathname: '/gp/product/B0CT5GHZ8Q/ref=ox_sc_act_title_2',
      href,
    }
    const site = findSiteForLocation(DEFAULT_SITE_EXTRACTOR_CONFIG.sites, loc)
    expect(site?.id).toBe('amazon')
  })

  it('matches madmuscles on root domain itself', () => {
    const loc = {
      hostname: 'madmuscles.com',
      pathname: '/',
      href: 'https://madmuscles.com/',
    }
    const site = findSiteForLocation(DEFAULT_SITE_EXTRACTOR_CONFIG.sites, loc)
    expect(site?.id).toBe('madmuscles')
  })
})

describe('waitForSelector', () => {
  it('resolves null within timeout when selector missing', async () => {
    const { waitForSelector } = await import('./build-product-payload-from-config')
    const dom = new JSDOM('<html><body></body></html>', { url: 'https://www.amazon.com/dp/B0DZZWMB2L' })
    const p = waitForSelector(dom.window.document, '#does-not-exist', 200)
    await expect(p).resolves.toBeNull()
  })
})

describe('buildProductPayloadFromConfig', () => {
  it('builds payload for a minimal custom site when title selector matches', async () => {
    const { buildProductPayloadFromConfig } = await import('./build-product-payload-from-config')
    const site = siteExtractorSiteSchema.parse({
      id: 'demo-retailer',
      isService: false,
      matchPatterns: ['https://demo.example/*'],
      pdpPathPatterns: [{ name: 'p', regex: '/p/', flags: '' }],
      selectors: {
        title: { primary: 'h1' },
      },
    })
    const dom = new JSDOM('<html><body><h1>Hello PDP</h1></body></html>', {
      url: 'https://demo.example/p/item-1',
    })
    const loc = {
      href: dom.window.location.href,
      pathname: dom.window.location.pathname,
      hostname: dom.window.location.hostname,
    }
    const payload = await buildProductPayloadFromConfig(
      dom.window.document,
      loc,
      dom.window.document.title,
      site
    )
    expect(payload.retailer).toBe('demo-retailer')
    expect(payload.title).toBe('Hello PDP')
    expect(payload.url).toBe('https://demo.example/p/item-1')
  })

  it('maps productIdFromUrl capture group into asin on payload', async () => {
    const { buildProductPayloadFromConfig } = await import('./build-product-payload-from-config')
    const site = siteExtractorSiteSchema.parse({
      id: 'demo-sku',
      isService: false,
      matchPatterns: ['https://demo.example/*'],
      pdpPathPatterns: [{ name: 'p', regex: '/p/', flags: '' }],
      productIdFromUrl: { regex: '/p/([a-z0-9-]+)', flags: 'i', group: 1 },
      selectors: {
        title: { primary: 'h1' },
      },
    })
    const dom = new JSDOM('<html><body><h1>Item</h1></body></html>', {
      url: 'https://demo.example/p/abc-123-z',
    })
    const loc = {
      href: dom.window.location.href,
      pathname: dom.window.location.pathname,
      hostname: dom.window.location.hostname,
    }
    const payload = await buildProductPayloadFromConfig(
      dom.window.document,
      loc,
      'x',
      site
    )
    expect(payload.asin).toBe('abc-123-z')
  })

  it('builds minimal service payload without DOM selectors', async () => {
    const { buildProductPayloadFromConfig } = await import('./build-product-payload-from-config')
    const site = siteExtractorSiteSchema.parse({
      id: 'madmuscles',
      isService: true,
      matchPatterns: ['https://www.madmuscles.com/*'],
      pdpPathPatterns: [{ name: 'any', regex: '.*', flags: '' }],
    })
    const dom = new JSDOM('<html><head><title>Plans | MM</title></head><body></body></html>', {
      url: 'https://www.madmuscles.com/',
    })
    const loc = {
      href: dom.window.location.href,
      pathname: dom.window.location.pathname,
      hostname: dom.window.location.hostname,
    }
    const payload = await buildProductPayloadFromConfig(
      dom.window.document,
      loc,
      'Plans | MM',
      site
    )
    expect(payload.retailer).toBe('madmuscles')
    expect(payload.title).toBe('Plans | MM')
    expect(payload.reviewExcerpts).toEqual([])
    expect(payload.asin).toBeUndefined()
  })

  it('truncates review excerpts to extract cap so parse never fails on long DOM text', async () => {
    const { buildProductPayloadFromConfig } = await import('./build-product-payload-from-config')
    const long = `${'x'.repeat(2500)} end`
    const site = siteExtractorSiteSchema.parse({
      id: 'demo-retailer',
      isService: false,
      matchPatterns: ['https://demo.example/*'],
      pdpPathPatterns: [{ name: 'p', regex: '/p/', flags: '' }],
      selectors: {
        title: { primary: 'h1' },
        reviewSnippets: { querySelectorAll: '.rev', maxItems: 2 },
      },
    })
    const dom = new JSDOM(
      `<html><body><h1>Item</h1><div class="rev">${long}</div><div class="rev">short</div></body></html>`,
      { url: 'https://demo.example/p/1' }
    )
    const loc = {
      href: dom.window.location.href,
      pathname: dom.window.location.pathname,
      hostname: dom.window.location.hostname,
    }
    const payload = await buildProductPayloadFromConfig(
      dom.window.document,
      loc,
      'x',
      site
    )
    expect(payload.reviewExcerpts).toHaveLength(2)
    expect(payload.reviewExcerpts[0]).toBe('x'.repeat(200))
    expect(payload.reviewExcerpts[1]).toBe('short')
  })
})
