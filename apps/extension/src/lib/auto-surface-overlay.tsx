import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { autoSurfaceDismissStorageKey } from './auto-surface'
import { PopupPanel } from '../popup/PopupPanel'
import extensionUiCssUrl from '../styles/extension-ui.css?url'

export const AUTO_SURFACE_HOST_ID = 'shopfriend-auto-surface-host' as const

const extensionStylesheetHref = (): string =>
  new URL(extensionUiCssUrl, chrome.runtime.getURL('/')).href

type HostCleanup = {
  escapeHandler: (ev: globalThis.KeyboardEvent) => void
}

let activeCleanup: HostCleanup | null = null
let reactRoot: Root | null = null

const detachHostListeners = (): void => {
  if (!activeCleanup) {
    return
  }
  window.removeEventListener('keydown', activeCleanup.escapeHandler, true)
  activeCleanup = null
}

export const removeAutoSurfaceOverlay = (): void => {
  detachHostListeners()
  reactRoot?.unmount()
  reactRoot = null
  document.getElementById(AUTO_SURFACE_HOST_ID)?.remove()
}

export type MountShopFriendPagePopupArgs = {
  tabId: number
  persistDismissOnClose: boolean
  siteId?: string
  href?: string
}

/**
 * Fixed top-right shadow host + React {@link PopupPanel} + extension CSS (linked into shadow) so UI matches the former toolbar popup without leaking styles onto the host page.
 */
export const mountShopFriendPagePopupIframe = (args: MountShopFriendPagePopupArgs): void => {
  removeAutoSurfaceOverlay()

  const host = document.createElement('div')
  host.id = AUTO_SURFACE_HOST_ID
  host.dataset.tabId = String(args.tabId)
  host.dataset.href = args.href ?? ''
  host.dataset.siteId = args.siteId ?? ''
  host.dataset.persistDismiss = args.persistDismissOnClose ? '1' : '0'
  host.setAttribute('data-shopfriend-page-popup', 'true')

  const shadow = host.attachShadow({ mode: 'open' })

  const wrap = document.createElement('div')
  wrap.className = 'sf-embed-wrap'

  const styleHost = document.createElement('style')
  styleHost.textContent = `
    :host { all: initial; }
    .sf-embed-wrap {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483646;
      width: 360px;
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 24px);
      overflow: auto;
    }
  `

  const fontLink = document.createElement('link')
  fontLink.rel = 'stylesheet'
  fontLink.href =
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;600;700&display=swap'

  const cssLink = document.createElement('link')
  cssLink.rel = 'stylesheet'
  cssLink.href = extensionStylesheetHref()

  const mountPoint = document.createElement('div')
  mountPoint.className = 'sf-popup-html'

  const applyDismissIfNeeded = (persistDismiss: boolean): void => {
    if (!persistDismiss) {
      return
    }
    if (args.siteId === undefined || args.href === undefined) {
      return
    }
    try {
      sessionStorage.setItem(autoSurfaceDismissStorageKey(args.siteId, args.href), '1')
    } catch {
      /* sessionStorage unavailable */
    }
  }

  const tearDown = (persistDismiss: boolean): void => {
    applyDismissIfNeeded(persistDismiss)
    detachHostListeners()
    removeAutoSurfaceOverlay()
  }

  const escapeHandler = (ev: globalThis.KeyboardEvent): void => {
    if (ev.key !== 'Escape') {
      return
    }
    ev.stopPropagation()
    tearDown(args.persistDismissOnClose)
  }

  activeCleanup = { escapeHandler }
  window.addEventListener('keydown', escapeHandler, true)

  wrap.append(fontLink, cssLink, mountPoint)
  shadow.append(styleHost, wrap)
  document.documentElement.appendChild(host)

  const queryClient = new QueryClient()
  reactRoot = createRoot(mountPoint)
  reactRoot.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <PopupPanel
          placement="page-shadow"
          shopperTabId={args.tabId}
          persistDismissOnClose={args.persistDismissOnClose}
          onRequestClose={({ persistDismiss }) => {
            tearDown(persistDismiss)
          }}
        />
      </QueryClientProvider>
    </StrictMode>
  )
}
