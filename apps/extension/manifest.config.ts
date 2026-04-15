import { defineManifest } from '@crxjs/vite-plugin'

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
  permissions: ['storage', 'sidePanel', 'scripting', 'tabs'],
  host_permissions: ['https://www.amazon.com/*', 'http://localhost:3000/*'],
  content_scripts: [
    {
      matches: ['https://www.amazon.com/*'],
      js: ['src/content-script.ts'],
      run_at: 'document_idle'
    }
  ]
})
