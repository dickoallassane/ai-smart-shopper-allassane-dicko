import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadInsightSessionContext } from './insight-session-context'
import {
  DEFAULT_SITE_EXTRACTOR_CONFIG,
  SITE_EXTRACTOR_CONFIG_JSON_KEY
} from './site-extractor-config'
import {
  INSIGHT_CONTEXT_TAB_BY_WINDOW_ID,
  PRODUCT_PAYLOAD_BY_TAB_ID
} from './pdp-session-storage'
import { createChromeMock } from '../test-utils/chrome-mock'

describe('loadInsightSessionContext', () => {
  let chromeMock: ReturnType<typeof createChromeMock>
  let stored: Record<string, unknown>
  let sessionValues: Record<string, unknown>

  beforeEach(() => {
    stored = { [SITE_EXTRACTOR_CONFIG_JSON_KEY]: JSON.stringify(DEFAULT_SITE_EXTRACTOR_CONFIG) }
    sessionValues = {
      [INSIGHT_CONTEXT_TAB_BY_WINDOW_ID]: { '10': 55 },
      [PRODUCT_PAYLOAD_BY_TAB_ID]: {
        '55': {
          retailer: 'madmuscles',
          locale: 'en-US',
          url: 'https://www.madmuscles.com/',
          title: 'Coaching',
          reviewExcerpts: [],
          extractedAt: '2026-04-17T12:00:00.000Z',
        },
      },
    }
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
    chromeMock.storageSessionGet.mockImplementation(
      async (keys: string | string[] | Record<string, unknown> | null | undefined) => {
        const names =
          keys === null || keys === undefined
            ? Object.keys(sessionValues)
            : typeof keys === 'string'
              ? [keys]
              : Array.isArray(keys)
                ? keys
                : typeof keys === 'object'
                  ? Object.keys(keys)
                  : []
        const out: Record<string, unknown> = {}
        for (const n of names) {
          if (Object.prototype.hasOwnProperty.call(sessionValues, n)) {
            out[n] = sessionValues[n]
          }
        }
        return out
      }
    )
    chromeMock.windowsGetCurrent.mockResolvedValue({ id: 10 })
  })

  afterEach(() => {
    chromeMock.remove()
  })

  it('marks service site and sets skipAffiliate on insight request', async () => {
    const ctx = await loadInsightSessionContext()
    expect(ctx.isServiceSite).toBe(true)
    expect(ctx.insightRequest?.flags.skipAffiliate).toBe(true)
    expect(ctx.insightRequest?.product.retailer).toBe('madmuscles')
  })

  it('does not mark service for amazon retailer', async () => {
    const map = sessionValues[PRODUCT_PAYLOAD_BY_TAB_ID] as Record<string, unknown>
    map['55'] = {
      retailer: 'amazon',
      locale: 'en-US',
      url: 'https://www.amazon.com/dp/B0TEST1234',
      title: 'Thing',
      reviewExcerpts: [],
      extractedAt: '2026-04-17T12:00:00.000Z',
    }
    const ctx = await loadInsightSessionContext()
    expect(ctx.isServiceSite).toBe(false)
    expect(ctx.insightRequest?.flags.skipAffiliate).toBe(false)
  })
})
