import type { ProductPayload } from '@shopfriend/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getStoredProductPayloadForTab, mergeProductPayloadForTab, PRODUCT_PAYLOAD_BY_TAB_ID } from './pdp-session-storage'
import { createChromeMock } from '../test-utils/chrome-mock'

const sampleProduct = (titleSuffix: string): ProductPayload => ({
  retailer: 'amazon',
  locale: 'en-US',
  url: 'https://www.amazon.com/dp/B0DZZWMB2L',
  title: `Example ${titleSuffix}`,
  extractedAt: '2026-04-15T12:00:00.000Z',
  reviewExcerpts: []
})

describe('mergeProductPayloadForTab', () => {
  it('adds payload when map was empty', () => {
    const p = sampleProduct('a')
    const out = mergeProductPayloadForTab(undefined, '7', p)
    expect(out['7']).toEqual(p)
    expect(Object.keys(out)).toHaveLength(1)
  })

  it('overwrites existing tab entry', () => {
    const first = sampleProduct('v1')
    const second = sampleProduct('v2')
    const out = mergeProductPayloadForTab({ '3': first }, '3', second)
    expect(out['3']).toEqual(second)
    expect(Object.keys(out)).toHaveLength(1)
  })

  it('drops other tabs when count exceeds cap while keeping the written tab', () => {
    const prev: Record<string, ProductPayload> = {}
    for (let i = 0; i < 32; i += 1) {
      prev[String(i)] = sampleProduct(`t${i}`)
    }
    const incoming = sampleProduct('new-tab')
    const out = mergeProductPayloadForTab(prev, '99', incoming)
    expect(out['99']).toEqual(incoming)
    expect(Object.keys(out)).toHaveLength(32)
    expect(out['99']).toBeDefined()
  })
})

describe('getStoredProductPayloadForTab', () => {
  let chromeMock: ReturnType<typeof createChromeMock>
  let sessionValues: Record<string, unknown>

  beforeEach(() => {
    sessionValues = {}
    chromeMock = createChromeMock()
    chromeMock.install()
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
  })

  afterEach(() => {
    chromeMock.remove()
  })

  it('returns null when map is missing', async () => {
    await expect(getStoredProductPayloadForTab(1)).resolves.toBeNull()
  })

  it('returns null when tab has no entry', async () => {
    sessionValues = {
      [PRODUCT_PAYLOAD_BY_TAB_ID]: { '42': sampleProduct('x') }
    }
    await expect(getStoredProductPayloadForTab(99)).resolves.toBeNull()
  })

  it('returns stored product for tab id', async () => {
    const p = sampleProduct('y')
    sessionValues = {
      [PRODUCT_PAYLOAD_BY_TAB_ID]: { '42': p }
    }
    await expect(getStoredProductPayloadForTab(42)).resolves.toEqual(p)
  })
})
