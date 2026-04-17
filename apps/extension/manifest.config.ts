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
    default_title: 'ShopFriend',
    default_popup: 'src/popup/index.html'
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html'
  },
  background: {
    service_worker: 'src/background.ts',
    type: 'module'
  },
  permissions: ['storage', 'sidePanel', 'scripting', 'tabs', 'windows'],
  host_permissions: ['https://www.amazon.com/*', insightApiHostPermission],
  content_scripts: [
    {
      matches: ['https://www.amazon.com/*'],
      js: ['src/content-script.ts'],
      run_at: 'document_idle'
    }
  ]
})
