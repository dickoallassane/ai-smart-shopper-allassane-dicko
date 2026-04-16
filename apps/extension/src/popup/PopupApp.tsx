import { insightRequestSchema } from '@shopfriend/shared'
import { type KeyboardEvent, useEffect, useState } from 'react'
import { getStoredProductPayloadForTab } from '../lib/pdp-session-storage'
import { SmileLogo } from '../ui/SmileLogo'

type PdpHint = 'none' | 'invalid' | 'ready'

export const PopupApp = () => {
  const [pdpHint, setPdpHint] = useState<PdpHint>('none')

  useEffect(() => {
    const loadPayload = async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) {
        setPdpHint('none')
        return
      }
      const raw = await getStoredProductPayloadForTab(tab.id)
      if (!raw) {
        setPdpHint('none')
        return
      }
      const parsed = insightRequestSchema.safeParse({
        product: raw,
        flags: { llmEnabled: true, pricingBetaEnabled: false }
      })
      if (!parsed.success) {
        setPdpHint('invalid')
        return
      }
      setPdpHint('ready')
    }
    void loadPayload()
  }, [])

  const handleClose = () => {
    window.close()
  }

  const handleOpenSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      return
    }
    await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL', tabId: tab.id })
    window.close()
  }

  const handleStartNowKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      void handleOpenSidePanel()
    }
  }

  const pdpMessage =
    pdpHint === 'none'
      ? 'Open an Amazon product page to attach context.'
      : pdpHint === 'invalid'
        ? 'We could not read this page yet — try refreshing the listing.'
        : 'You are set on this page — open the panel when you want a check.'

  return (
    <div className="sf-popup-shell sf-surface-app border-none bg-transparent">
      <div className="sf-popup-accent-line rounded-t-[inherit]" aria-hidden="true" />
      <header className="sf-surface-header flex items-center justify-between gap-2 rounded-t-[1.4rem] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-sf-primary to-sf-primary-container text-sf-on-primary"
            aria-hidden="true"
          >
            <SmileLogo className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="sf-font-display text-xs font-bold uppercase tracking-wide text-sf-secondary-dark">ShopFriend</p>
            <p className="sf-text-muted mt-0.5 truncate">Smart shopping companion</p>
          </div>
        </div>
        <button
          type="button"
          className="sf-btn-ghost-icon text-sf-neutral-dark"
          onClick={handleClose}
          aria-label="Close extension popup"
        >
          <span className="text-lg leading-none" aria-hidden="true">
            ×
          </span>
        </button>
      </header>

      <div className="px-4 pb-4 pt-3">
        <h1 id="sf-popup-title" className="sf-text-title sf-font-display text-xl leading-snug">
          Need a second opinion?
        </h1>
        <p className="sf-text-body mt-2">
          I&apos;m watching this item for you. I can find a better price and summarize reviews about it.
        </p>
        <p className="sf-text-muted mt-2" role="status" aria-live="polite">
          {pdpMessage}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <article className="sf-surface-card-subtle flex flex-col gap-1 rounded-2xl p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sf-secondary/15 text-sf-secondary" aria-hidden="true">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <h2 className="sf-font-display text-sm font-semibold text-sf-secondary-dark">Compare price</h2>
            <p className="sf-text-muted">Save money</p>
          </article>
          <article className="sf-surface-card-subtle flex flex-col gap-1 rounded-2xl p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sf-primary/12 text-sf-primary" aria-hidden="true">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <h2 className="sf-font-display text-sm font-semibold text-sf-secondary-dark">Check Review</h2>
            <p className="sf-text-muted">AI insight</p>
          </article>
        </div>

        <button
          type="button"
          className="sf-btn-cta-yellow mt-5"
          onClick={() => void handleOpenSidePanel()}
          onKeyDown={handleStartNowKeyDown}
          aria-labelledby="sf-popup-title sf-start-now-label"
        >
          <span id="sf-start-now-label">Start Now</span>
          <span aria-hidden="true">→</span>
        </button>

        <div className="mt-4 flex justify-center">
          <span className="sf-badge-secure">
            <svg className="h-3.5 w-3.5 text-sf-secondary" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
            </svg>
            Private &amp; secure
          </span>
        </div>
      </div>
    </div>
  )
}
