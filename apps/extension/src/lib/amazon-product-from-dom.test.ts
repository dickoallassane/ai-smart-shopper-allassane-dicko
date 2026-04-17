import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { buildAmazonProductPayload, isLikelyAmazonPdp } from './amazon-product-from-dom'

describe('isLikelyAmazonPdp', () => {
  it('returns true for amazon.com /dp/ASIN path', () => {
    expect(
      isLikelyAmazonPdp({
        hostname: 'www.amazon.com',
        pathname: '/Some-Product/dp/B0DZZWMB2L/ref',
        href: 'https://www.amazon.com/Some-Product/dp/B0DZZWMB2L/ref'
      })
    ).toBe(true)
  })

  it('returns true for /gp/product/', () => {
    expect(
      isLikelyAmazonPdp({
        hostname: 'www.amazon.com',
        pathname: '/gp/product/B0123456789',
        href: 'https://www.amazon.com/gp/product/B0123456789'
      })
    ).toBe(true)
  })

  it('returns false when hostname is not amazon.com', () => {
    expect(
      isLikelyAmazonPdp({
        hostname: 'www.ebay.com',
        pathname: '/dp/B0DZZWMB2L',
        href: 'https://www.ebay.com/dp/B0DZZWMB2L'
      })
    ).toBe(false)
  })

  it('returns false when path lacks ASIN pattern', () => {
    expect(
      isLikelyAmazonPdp({
        hostname: 'www.amazon.com',
        pathname: '/s?k=laptop',
        href: 'https://www.amazon.com/s?k=laptop'
      })
    ).toBe(false)
  })
})

describe('buildAmazonProductPayload', () => {
  it('extracts title, ASIN, price, and reviews from fixture HTML', async () => {
    const html = `
      <html><body>
        <span id="productTitle">  ASUS ROG  </span>
        <span class="a-price"><span class="a-offscreen">$1,399.99</span></span>
        <span id="acrPopover">4.5 out of 5 stars</span>
        <div data-hook="review-collapsed"><span>Great laptop for gaming.</span></div>
      </body></html>
    `
    const dom = new JSDOM(html, { url: 'https://www.amazon.com/dp/B0DZZWMB2L' })
    const payload = await buildAmazonProductPayload(
      dom.window.document,
      dom.window.location,
      'Fallback title'
    )
    expect(payload.retailer).toBe('amazon')
    expect(payload.asin).toBe('B0DZZWMB2L')
    expect(payload.title).toContain('ASUS ROG')
    expect(payload.displayedPrice).toBe('$1,399.99')
    expect(payload.ratingSummary).toContain('4.5')
    expect(payload.reviewExcerpts).toContain('Great laptop for gaming.')
  })

  it('uses h1.a-size-large when #productTitle is missing', async () => {
    const html = '<html><body><h1 class="a-size-large">Alt title</h1></body></html>'
    const dom = new JSDOM(html, { url: 'https://www.amazon.com/dp/B0123456789' })
    const payload = await buildAmazonProductPayload(
      dom.window.document,
      dom.window.location,
      'Page title'
    )
    expect(payload.title).toBe('Alt title')
  })

  it('uses page title when no product heading is found', async () => {
    const dom = new JSDOM('<html><body></body></html>', {
      url: 'https://www.amazon.com/dp/B0123456789'
    })
    const payload = await buildAmazonProductPayload(
      dom.window.document,
      dom.window.location,
      'Amazon.com: Widget'
    )
    expect(payload.title).toBe('Amazon.com: Widget')
  })

  it('throws when page title is empty and no heading is found', async () => {
    const dom = new JSDOM('<html><body></body></html>', {
      url: 'https://www.amazon.com/dp/B0123456789'
    })
    await expect(
      buildAmazonProductPayload(dom.window.document, dom.window.location, '')
    ).rejects.toThrow()
  })
})
