import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineManifest } from '@crxjs/vite-plugin'
import { loadEnv } from 'vite'

const extensionRoot = path.dirname(fileURLToPath(import.meta.url))
const viteEnv = loadEnv(process.env.MODE ?? 'development', extensionRoot, 'VITE_')
const apiOrigin = (viteEnv.VITE_SHOPFRIEND_API_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '')

const insightApiHostPermission = (() => {
  try {
    return `${new URL(apiOrigin).origin}/*`
  } catch {
    return 'http://localhost:3000/*'
  }
})()

export default defineManifest({
  manifest_version: 3,
  name: 'ShopFriend (dev)',
  version: '0.0.1',
  description: 'Smart Shopper companion — development build',
  action: {
    default_title: 'ShopFriend'
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html'
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module'
  },
  permissions: ['storage', 'sidePanel', 'scripting', 'tabs', 'windows'],
  host_permissions: [
    'https://www.amazon.com/*',
    'https://madmuscles.com/*',
    'https://www.madmuscles.com/*',
    insightApiHostPermission
  ],
  /** Grant when adding non-Amazon sites in Settings (POC); `registerContentScripts` needs host access. */
  optional_host_permissions: ['https://*/*', 'http://*/*'],
  /**
   * Placeholder match so Vite emits the content-script bundle; real sites are
   * registered at runtime via `chrome.scripting.registerContentScripts`.
   */
  content_scripts: [
    {
      matches: ['https://shopfriend-build-placeholder.invalid/*'],
      js: ['src/content-script.ts'],
      run_at: 'document_idle'
    }
  ],
  /**
   * Loader uses `import(chrome.runtime.getURL("assets/…"))`; crxjs default WAR only
   * matched the build placeholder. Real PDP origins must be allowed or Chrome
   * denies loading the ESM chunk from the page world.
   */
  web_accessible_resources: [
    {
      resources: ['assets/*.js', 'assets/*.css'],
      matches: ['<all_urls>']
    }
  ]
})
