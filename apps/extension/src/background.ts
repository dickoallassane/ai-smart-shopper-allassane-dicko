import type { InsightRequest, InsightResponse, ProductPayload } from '@shopfriend/shared'
import { PRODUCT_PAYLOAD_BY_TAB_ID, mergeProductPayloadForTab, type ProductPayloadByTabId } from './lib/pdp-session-storage'
import {
  defaultSiteExtractorConfigJson,
  parseSiteExtractorConfigJson,
  SITE_CONFIGS_UPDATED,
  SITE_EXTRACTOR_CONFIG_JSON_KEY
} from './lib/site-extractor-config'

const stripTrailingSlash = (value: string) => value.replace(/\/$/, '')

const resolveApiBase = (): string => {
  const fromEnv = import.meta.env.VITE_SHOPFRIEND_API_ORIGIN?.trim()
  if (fromEnv && fromEnv.length > 0) {
    return stripTrailingSlash(fromEnv)
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:3000'
  }
  console.warn('[ShopFriend] VITE_SHOPFRIEND_API_ORIGIN is unset; set it at build time in apps/extension/.env')
  return ''
}

const getApiBase = (): string => {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return resolveApiBase()
  }
  return resolveApiBase()
}

const fetchInsight = async (
  body: InsightRequest,
  accessToken: string | undefined,
  signal: AbortSignal
): Promise<InsightResponse> => {
  const base = getApiBase()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }
  const response = await fetch(`${base}/api/insight`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Insight failed (${response.status})`)
  }
  return (await response.json()) as InsightResponse
}

const REGISTERED_CS_PREFIX = 'shopfriend-site-'

/**
 * Path for `registerContentScripts`: must be the Vite/crxjs **loader** (IIFE) that
 * `import()`s the ESM chunk. Registering the inner `content-script.ts-*.js` bundle
 * fails with "Cannot use import statement outside a module" on real pages.
 */
const getBundledContentScriptLoaderPath = async (): Promise<string> => {
  const manifestUrl = chrome.runtime.getURL('manifest.json')
  const manifest = (await fetch(manifestUrl).then((r) => r.json())) as {
    content_scripts?: { js?: string[] }[]
  }
  const fromContentScripts = manifest.content_scripts
    ?.flatMap((entry) => entry.js ?? [])
    .find((path) => path.includes('content-script') && path.includes('loader'))
  if (fromContentScripts) {
    return fromContentScripts
  }
  throw new Error(
    'ShopFriend: no content-script loader in manifest.content_scripts (expected crxjs loader bundle)'
  )
}

const seedSiteConfigIfEmpty = async () => {
  const cur = await chrome.storage.local.get(SITE_EXTRACTOR_CONFIG_JSON_KEY)
  const raw = cur[SITE_EXTRACTOR_CONFIG_JSON_KEY]
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return
  }
  await chrome.storage.local.set({
    [SITE_EXTRACTOR_CONFIG_JSON_KEY]: defaultSiteExtractorConfigJson()
  })
}

/** Serializes register/unregister to avoid Duplicate script ID races (startup + message + init). */
let registerContentScriptsChain: Promise<void> = Promise.resolve()

const unregisterShopfriendContentScripts = async (): Promise<void> => {
  const existing = await chrome.scripting.getRegisteredContentScripts()
  const toRemove = existing.map((s) => s.id).filter((id) => id.startsWith(REGISTERED_CS_PREFIX))
  if (toRemove.length === 0) {
    return
  }
  try {
    await chrome.scripting.unregisterContentScripts({ ids: toRemove })
  } catch (error) {
    console.warn('[ShopFriend] unregisterContentScripts failed', error)
  }
}

const performSyncRegisteredContentScripts = async (): Promise<void> => {
  try {
    const stored = await chrome.storage.local.get(SITE_EXTRACTOR_CONFIG_JSON_KEY)
    const raw = stored[SITE_EXTRACTOR_CONFIG_JSON_KEY] as string | undefined
    const parsed =
      typeof raw === 'string' && raw.trim().length > 0
        ? parseSiteExtractorConfigJson(raw)
        : parseSiteExtractorConfigJson(defaultSiteExtractorConfigJson())
    if (!parsed.success) {
      console.warn('[ShopFriend] Site config invalid; skipping registerContentScripts', parsed.error)
      return
    }
    const jsPath = await getBundledContentScriptLoaderPath()
    await unregisterShopfriendContentScripts()
    const scripts = parsed.data.sites.map((site) => ({
      id: `${REGISTERED_CS_PREFIX}${site.id.replace(/[^a-z0-9_-]/gi, '-').slice(0, 80)}`,
      matches: site.matchPatterns,
      js: [jsPath],
      runAt: 'document_idle' as const
    }))
    try {
      await chrome.scripting.registerContentScripts(scripts)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('Duplicate script ID')) {
        await unregisterShopfriendContentScripts()
        await chrome.scripting.registerContentScripts(scripts)
      } else {
        throw error
      }
    }
    console.debug('[ShopFriend] registerContentScripts for', parsed.data.sites.length, 'sites')
  } catch (error) {
    console.warn('[ShopFriend] registerContentScripts failed', error)
  }
}

const syncRegisteredContentScripts = async (): Promise<void> => {
  registerContentScriptsChain = registerContentScriptsChain.then(() => performSyncRegisteredContentScripts())
  await registerContentScriptsChain
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'OPEN_SIDE_PANEL') {
    const open = async () => {
      const tabId = message.tabId as number | undefined
      if (tabId === undefined) {
        return
      }
      // Must open the side panel before any other `await` — Chrome ties
      // `sidePanel.open` to the user gesture from the popup; earlier awaits
      // (tabs.get, storage) consume that chain and the open silently fails.
      await chrome.sidePanel.open({ tabId })
    }
    void open()
    return
  }

  if (message?.type === 'REQUEST_INSIGHT') {
    const controller = new AbortController()
    const timeoutMs = typeof message.timeoutMs === 'number' ? message.timeoutMs : 14_000
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    const run = async () => {
      try {
        const stored = await chrome.storage.local.get(['extensionAccessToken'])
        const accessToken = stored.extensionAccessToken as string | undefined
        const insight = await fetchInsight(
          message.payload as InsightRequest,
          accessToken,
          controller.signal
        )
        await chrome.storage.local.set({ lastInsight: insight })
        try {
          await chrome.runtime.sendMessage({ type: 'INSIGHT_READY', insight })
        } catch {
          /* no listeners */
        }
        sendResponse({ ok: true as const, insight })
      } catch (error) {
        const err = error instanceof Error ? error.message : 'Unknown error'
        sendResponse({ ok: false as const, error: err })
      } finally {
        clearTimeout(timeout)
      }
    }

    void run()
    return true
  }

  if (message?.type === SITE_CONFIGS_UPDATED) {
    void syncRegisteredContentScripts()
    return
  }

  if (message?.type === 'PRODUCT_PAYLOAD') {
    const tabId = sender.tab?.id
    if (tabId === undefined) {
      return undefined
    }
    const product = message.payload as ProductPayload
    console.debug('[ShopFriend] PRODUCT_PAYLOAD received', { tabId, product })
    void (async () => {
      const session = await chrome.storage.session.get(PRODUCT_PAYLOAD_BY_TAB_ID)
      const prev = session[PRODUCT_PAYLOAD_BY_TAB_ID] as ProductPayloadByTabId | undefined
      const map = mergeProductPayloadForTab(prev, String(tabId), product)
      await chrome.storage.session.set({ [PRODUCT_PAYLOAD_BY_TAB_ID]: map })
    })()
  }

  return undefined
})

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
  void (async () => {
    await seedSiteConfigIfEmpty()
    await syncRegisteredContentScripts()
  })()
})

chrome.runtime.onStartup.addListener(() => {
  void syncRegisteredContentScripts()
})

void (async () => {
  await seedSiteConfigIfEmpty()
  await syncRegisteredContentScripts()
})()
