import { useMutation } from '@tanstack/react-query'
import {
  insightRequestSchema,
  type AffiliateMatch,
  type InsightRequest,
  type InsightResponse
} from '@shopfriend/shared'
import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'
import { getStoredProductPayloadForTab, resolveInsightSourceTabId } from '../lib/pdp-session-storage'
import { requestInsight } from '../lib/request-insight'

const DISPLAY_NAME_KEY = 'extensionDisplayName'
/** Until auth writes a real name, default shown in the header */
const DEFAULT_DISPLAY_NAME = 'Guest'

const PRICE_MATCH_INTRO = 'Here are few matches I found'
const NO_AFFILIATE_PRODUCTS = 'No product is found'

type ChatMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; kind: 'text'; text: string }
  | { id: string; role: 'assistant'; kind: 'price_matches'; intro: string; matches: AffiliateMatch[] }

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const buildCheckPriceUserText = (payload: InsightRequest): string => {
  const title = payload.product.title
  const pricePhrase = payload.product.displayedPrice?.trim() || 'the listed price'
  return `Look for the best prices for this product: ${title} - costing less than ${pricePhrase}`
}

const buildPriceCheckAssistantMessage = (insight: InsightResponse): ChatMessage => {
  if (insight.affiliateMatches && insight.affiliateMatches.length > 0) {
    return {
      id: createId(),
      role: 'assistant',
      kind: 'price_matches',
      intro: PRICE_MATCH_INTRO,
      matches: insight.affiliateMatches.slice(0, 2)
    }
  }
  return {
    id: createId(),
    role: 'assistant',
    kind: 'text',
    text: NO_AFFILIATE_PRODUCTS
  }
}

/** Latest PDP payload for the insight source tab (re-read on each Check Price). */
const loadInsightRequestFromSession = async (): Promise<InsightRequest | null> => {
  const tabId = await resolveInsightSourceTabId()
  if (tabId === undefined) {
    return null
  }
  const raw = await getStoredProductPayloadForTab(tabId)
  if (!raw) {
    return null
  }
  const parsed = insightRequestSchema.safeParse({
    product: raw,
    flags: { llmEnabled: true, pricingBetaEnabled: false }
  })
  return parsed.success ? parsed.data : null
}

const appendOnceForInsight = (
  seen: Set<string>,
  insight: InsightResponse,
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
) => {
  if (seen.has(insight.requestId)) {
    return
  }
  seen.add(insight.requestId)
  setMessages((prev) => [...prev, buildPriceCheckAssistantMessage(insight)])
}

const AffiliateMatchCard = ({ match }: { match: AffiliateMatch }) => {
  const bodyText = match.description?.trim() || match.productName
  const priceLine = [match.priceDisplay, match.currency].filter(Boolean).join(' ')

  return (
    <article className="sf-surface-card-subtle flex flex-col gap-2 rounded-xl p-3">
      {match.imageUrl ? (
        <img
          src={match.imageUrl}
          alt=""
          className="mx-auto h-28 w-full max-w-[200px] rounded-lg object-contain"
          loading="lazy"
        />
      ) : null}
      <p className="text-sm leading-snug text-sf-on-surface">{bodyText}</p>
      <p className="text-xs text-sf-on-surface-variant">
        {match.merchantName} — {priceLine}
      </p>
      <div className="flex flex-col gap-1.5">
        <a
          href={match.clickUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-sf-primary underline-offset-2 hover:underline"
          aria-label="Open affiliate or tracked offer link"
        >
          Affiliate / tracked link
        </a>
        {match.directUrl ? (
          <a
            href={match.directUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-sf-on-surface-variant underline-offset-2 hover:underline"
            aria-label="View product on retailer site without affiliate redirect"
          >
            View on retailer
          </a>
        ) : null}
      </div>
    </article>
  )
}

export const SidePanelApp = () => {
  const [hydrated, setHydrated] = useState(false)
  const [displayName, setDisplayName] = useState(DEFAULT_DISPLAY_NAME)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [requestPayload, setRequestPayload] = useState<InsightRequest | null>(null)
  const seenInsightIdsRef = useRef(new Set<string>())

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    chrome.storage.local.get([DISPLAY_NAME_KEY], (result) => {
      const name = result[DISPLAY_NAME_KEY]
      if (typeof name === 'string' && name.trim().length > 0) {
        setDisplayName(name.trim())
      }
    })
  }, [hydrated])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    const loadSession = async () => {
      setRequestPayload(await loadInsightRequestFromSession())
    }
    void loadSession()
  }, [hydrated])

  const appendInsightToThread = useCallback((insight: InsightResponse) => {
    appendOnceForInsight(seenInsightIdsRef.current, insight, setMessages)
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }
    const listener = (
      message: { type?: string; insight?: InsightResponse },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (value?: unknown) => void
    ) => {
      if (message.type === 'INSIGHT_READY' && message.insight) {
        appendInsightToThread(message.insight)
      }
      sendResponse()
      return true
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => {
      chrome.runtime.onMessage.removeListener(listener)
    }
  }, [hydrated, appendInsightToThread])

  const priceMutation = useMutation({
    mutationFn: (payload: InsightRequest) => requestInsight(payload),
    onSuccess: (insight) => {
      appendInsightToThread(insight)
    },
    onError: (error: Error) => {
      setMessages((prev) => [
        ...prev,
        { id: createId(), role: 'assistant', kind: 'text', text: `Could not check price: ${error.message}` }
      ])
    }
  })

  const handleCheckPrice = async () => {
    const freshPayload = await loadInsightRequestFromSession()
    setRequestPayload(freshPayload)

    if (!freshPayload) {
      setMessages((prev) => [
        ...prev,
        { id: createId(), role: 'user', text: 'Check the prices for this product.' },
        {
          id: createId(),
          role: 'assistant',
          kind: 'text',
          text: 'Open an Amazon product page in this tab first so ShopFriend can read the listing.'
        }
      ])
      return
    }

    setMessages((prev) => [...prev, { id: createId(), role: 'user', text: buildCheckPriceUserText(freshPayload) }])
    priceMutation.mutate(freshPayload)
  }

  const handleReviewInsightStub = () => {
    setMessages((prev) => [
      ...prev,
      { id: createId(), role: 'user', text: 'Get review insight for this product.' },
      {
        id: createId(),
        role: 'assistant',
        kind: 'text',
        text: 'Review-focused insights will run here in a future update. For now, use Check Price after opening a PDP.'
      }
    ])
  }

  const handleSettings = () => {
    console.debug('[ShopFriend] Settings (stub until auth)')
  }

  const handleLogout = () => {
    console.debug('[ShopFriend] Logout (stub until auth)')
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sf-surface px-4 text-sm text-sf-on-surface-variant">
        Loading…
      </div>
    )
  }

  return (
    <div className="flex h-screen min-h-0 flex-col bg-sf-surface text-sf-on-surface">
      <header className="sf-surface-header shrink-0 border-b border-sf-outline/10 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sf-primary-dark text-sm font-bold text-sf-on-chat-user"
              aria-hidden="true"
            >
              SF
            </div>
            <div className="min-w-0">
              <p className="sf-font-display truncate text-base font-bold text-sf-secondary-dark">{displayName}</p>
              <p className="sf-text-muted">Discussion</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="sf-btn-secondary px-3 py-1.5 text-xs"
              onClick={handleSettings}
              aria-label="Open settings (coming soon)"
            >
              Settings
            </button>
            <button
              type="button"
              className="sf-btn-secondary px-3 py-1.5 text-xs"
              onClick={handleLogout}
              aria-label="Log out (coming soon)"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mx-auto flex max-w-xl flex-col gap-2">
          <p className="sf-text-muted px-1">Thread</p>
          <div
            className="flex min-h-[120px] flex-col gap-2 rounded-2xl bg-sf-surface-container-low/80 p-3"
            role="log"
            aria-relevant="additions"
            aria-live="polite"
          >
            {messages.length === 0 ? (
              <p className="sf-text-muted px-1 py-2 text-center">No messages yet — try Check Price on a product tab.</p>
            ) : (
              messages.map((m) => {
                if (m.role === 'user') {
                  return (
                    <div key={m.id} className="sf-chat-user">
                      {m.text}
                    </div>
                  )
                }
                if (m.kind === 'text') {
                  return (
                    <div key={m.id} className="sf-chat-assistant">
                      {m.text}
                    </div>
                  )
                }
                return (
                  <div key={m.id} className="sf-chat-assistant flex flex-col gap-3">
                    <p className="m-0 text-sm leading-snug">{m.intro}</p>
                    <div className="flex flex-col gap-3">
                      {m.matches.map((match) => (
                        <AffiliateMatchCard key={match.offerId} match={match} />
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-2 border-t border-sf-outline/10 bg-sf-surface-container-low/60 px-4 py-3">
        <div className="mx-auto flex max-w-xl flex-col gap-2 sm:flex-row">
          <button
            type="button"
            className="sf-btn-primary flex-1"
            onClick={() => void handleCheckPrice()}
            disabled={priceMutation.isPending}
            aria-busy={priceMutation.isPending}
          >
            {priceMutation.isPending ? 'Checking price…' : 'Check Price'}
          </button>
          <button type="button" className="sf-btn-secondary flex-1" onClick={handleReviewInsightStub}>
            Get Review Insight
          </button>
        </div>
      </div>

      <footer className="shrink-0 border-t border-sf-outline/15 bg-sf-surface-container-low px-4 py-3 opacity-75">
        <p className="sf-text-muted mb-2 text-center">Chat is disabled in this build.</p>
        <label htmlFor="sf-chat-disabled" className="sr-only">
          Message (disabled)
        </label>
        <textarea
          id="sf-chat-disabled"
          rows={2}
          disabled
          placeholder="Type a message…"
          className="w-full resize-none rounded-2xl border border-sf-outline/20 bg-sf-surface-container-highest px-3 py-2 text-sm text-sf-on-surface placeholder:text-sf-on-surface-variant/60"
          aria-disabled="true"
        />
      </footer>
    </div>
  )
}
