import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadInsightSessionContext, parseInsightRequestFromProduct } from './insight-session-context'
import { DEFAULT_SITE_EXTRACTOR_CONFIG, SITE_EXTRACTOR_CONFIG_JSON_KEY } from './site-extractor-config'
import { createChromeMock } from '../test-utils/chrome-mock'

describe('loadInsightSessionContext', () => {
  let chromeMock: ReturnType<typeof createChromeMock>
  let stored: Record<string, unknown>

  const madmusclesProduct = {
    retailer: 'madmuscles',
    locale: 'en-US',
    url: 'https://www.madmuscles.com/',
    title: 'Coaching',
    reviewExcerpts: [],
    extractedAt: '2026-04-17T12:00:00.000Z'
  }

  const amazonProduct = {
    retailer: 'amazon',
    locale: 'en-US',
    url: 'https://www.amazon.com/dp/B0TEST1234',
    title: 'Thing',
    reviewExcerpts: [],
    extractedAt: '2026-04-17T12:00:00.000Z'
  }

  beforeEach(() => {
    stored = { [SITE_EXTRACTOR_CONFIG_JSON_KEY]: JSON.stringify(DEFAULT_SITE_EXTRACTOR_CONFIG) }
    chromeMock = createChromeMock()
    chromeMock.install()
    chromeMock.storageLocalGet.mockImplementation(
      (keys: string | string[] | Record<string, unknown> | null, cb?: (r: Record<string, unknown>) => void) => {
        const list =
          keys === null
            ? Object.keys(stored)
            : typeof keys === 'string'
              ? [keys]
              : Array.isArray(keys)
                ? keys
                : typeof keys === 'object'
                  ? Object.keys(keys)
                  : []
        const out: Record<string, unknown> = {}
        for (const k of list) {
          if (Object.prototype.hasOwnProperty.call(stored, k)) {
            out[k] = stored[k]
          }
        }
        if (typeof cb === 'function') {
          cb(out)
          return undefined
        }
        return Promise.resolve(out)
      }
    )
    chromeMock.tabsQuery.mockResolvedValue([{ id: 55, url: 'https://www.madmuscles.com/' }])
    chromeMock.tabsSendMessage.mockImplementation(
      (_tabId: number, _msg: unknown, cb?: (r: unknown) => void) => {
        if (typeof cb === 'function') {
          cb({ ok: true, product: madmusclesProduct })
        }
      }
    )
  })

  afterEach(() => {
    chromeMock.remove()
  })

  it('marks service site and sets skipAffiliate on insight request from active-tab snapshot', async () => {
    const ctx = await loadInsightSessionContext()
    expect(chromeMock.tabsSendMessage).toHaveBeenCalled()
    expect(ctx.isServiceSite).toBe(true)
    expect(ctx.insightRequest?.flags.skipAffiliate).toBe(true)
    expect(ctx.insightRequest?.flags.isServiceSite).toBe(true)
    expect(ctx.insightRequest?.product.retailer).toBe('madmuscles')
  })

  it('does not mark service for amazon retailer', async () => {
    chromeMock.tabsSendMessage.mockImplementation((_tabId: number, _msg: unknown, cb?: (r: unknown) => void) => {
      if (typeof cb === 'function') {
        cb({ ok: true, product: amazonProduct })
      }
    })
    chromeMock.tabsQuery.mockResolvedValue([{ id: 55, url: 'https://www.amazon.com/dp/B0TEST1234' }])
    const ctx = await loadInsightSessionContext()
    expect(ctx.isServiceSite).toBe(false)
    expect(ctx.insightRequest?.flags.skipAffiliate).toBe(false)
    expect(ctx.insightRequest?.flags.isServiceSite).toBe(false)
  })

  it('parseInsightRequestFromProduct matches loadInsightSessionContext for snapshot product', async () => {
    const fromParse = await parseInsightRequestFromProduct(amazonProduct)
    chromeMock.tabsSendMessage.mockImplementation((_tabId: number, _msg: unknown, cb?: (r: unknown) => void) => {
      if (typeof cb === 'function') {
        cb({ ok: true, product: amazonProduct })
      }
    })
    chromeMock.tabsQuery.mockResolvedValue([{ id: 55, url: 'https://www.amazon.com/dp/B0TEST1234' }])
    const fromLoad = await loadInsightSessionContext()
    expect(fromParse.insightRequest?.product.url).toBe(fromLoad.insightRequest?.product.url)
    expect(fromParse.isServiceSite).toBe(fromLoad.isServiceSite)
  })
})
