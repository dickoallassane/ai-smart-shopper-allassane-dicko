import {
  buildProductPayloadFromConfig,
  findSiteForLocation
} from './lib/build-product-payload-from-config'
import {
  defaultSiteExtractorConfigJson,
  parseSiteExtractorConfigJson,
  SITE_EXTRACTOR_CONFIG_JSON_KEY
} from './lib/site-extractor-config'

const PUBLISH_DEBOUNCE_MS = 320

let publishTimer: ReturnType<typeof setTimeout> | null = null

const loadSitesConfig = async () => {
  const stored = await chrome.storage.local.get(SITE_EXTRACTOR_CONFIG_JSON_KEY)
  const raw = stored[SITE_EXTRACTOR_CONFIG_JSON_KEY] as string | undefined
  const parsed =
    typeof raw === 'string' && raw.trim().length > 0
      ? parseSiteExtractorConfigJson(raw)
      : parseSiteExtractorConfigJson(defaultSiteExtractorConfigJson())
  if (!parsed.success) {
    console.warn('[ShopFriend] Site config invalid', parsed.error)
    return null
  }
  return parsed.data.sites
}

const publishPayload = async () => {
  const sites = await loadSitesConfig()
  if (!sites?.length) {
    return
  }
  const site = findSiteForLocation(sites, window.location)
  if (!site) {
    return
  }
  try {
    const payload = await buildProductPayloadFromConfig(
      document,
      window.location,
      document.title,
      site
    )
    console.debug('[ShopFriend] ProductPayload extracted', payload)
    void chrome.runtime.sendMessage({
      type: 'PRODUCT_PAYLOAD',
      payload
    })
  } catch (error) {
    console.warn('[ShopFriend] Product extract / validate failed', error)
  }
}

const schedulePublish = () => {
  if (publishTimer !== null) {
    clearTimeout(publishTimer)
  }
  publishTimer = setTimeout(() => {
    publishTimer = null
    void publishPayload()
  }, PUBLISH_DEBOUNCE_MS)
}

void publishPayload()

const observer = new MutationObserver(() => {
  schedulePublish()
})

observer.observe(document.documentElement, { childList: true, subtree: true })

window.addEventListener('popstate', () => {
  schedulePublish()
})

const originalPushState = history.pushState.bind(history)
history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
  originalPushState(data, unused, url)
  schedulePublish()
}

const originalReplaceState = history.replaceState.bind(history)
history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
  originalReplaceState(data, unused, url)
  schedulePublish()
}
