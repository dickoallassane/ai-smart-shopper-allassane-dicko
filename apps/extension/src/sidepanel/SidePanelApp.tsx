import { useMutation } from '@tanstack/react-query'
import {
  type AffiliateMatch,
  type ChatHistoryTurn,
  type ChatResearchContext,
  type InsightRequest,
  type InsightResponse,
  type ReviewDiscoveryResult
} from '@shopfriend/shared'
import {
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'
import { loadActiveTabSiteHints } from '../lib/active-tab-site-hints'
import { buildDomainDiscoveryRequest } from '../lib/build-domain-discovery-request'
import { loadInsightSessionContext } from '../lib/insight-session-context'
import { requestInsightChat } from '../lib/request-insight-chat'
import { requestInsight } from '../lib/request-insight'
import { SettingsPanel } from './SettingsPanel'

const DISPLAY_NAME_KEY = 'extensionDisplayName'
/** Until auth writes a real name, default shown in the header */
const DEFAULT_DISPLAY_NAME = 'Guest'

const PRICE_MATCH_INTRO = 'Here are few matches I found'
const NO_AFFILIATE_PRODUCTS = 'No product is found'
const REVIEW_INSIGHT_TIMEOUT_MS = 82_000

/** Shown centered below the latest thread message (not inside the live region). */
const SHOPFRIEND_SOURCES_REMINDER =
  'Bad buzz online is not the whole story. Open several sources below before you decide.'

type ReviewDiscoverySummaryBullet = {
  text: string
  /** 0-based index into `results` when the server anchored the bullet to a Discover row */
  sourceIndex?: number
}

type ChatMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; kind: 'text'; text: string }
  | { id: string; role: 'assistant'; kind: 'price_matches'; intro: string; matches: AffiliateMatch[] }
  | {
      id: string
      role: 'assistant'
      kind: 'review_discovery'
      intro: string
      /** Server-side synthesis card (`discover-summary`) when summaries are enabled and returned valid JSON */
      summaryBullets?: ReviewDiscoverySummaryBullet[]
      /** When the API skipped or failed synthesis (e.g. missing server key), one limitation line for transparency */
      synthesisFootnote?: string
      /** Model-written recap below Summary bullets (`discover-summary.sourcesOverview`) */
      summarySourcesOverview?: string
      results: ReviewDiscoveryResult[]
    }

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const ChatThreadPendingIndicator = () => (
  <div
    className="sf-chat-assistant flex items-center gap-2 py-2 text-sm text-sf-on-surface-variant"
    role="status"
    aria-live="polite"
    aria-label="Waiting for response"
  >
    <span className="sr-only">Waiting for response</span>
    <span className="flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-full bg-sf-primary opacity-80 motion-safe:animate-bounce"
          style={{ animationDelay: `${i * 140}ms`, animationDuration: '0.6s' }}
        />
      ))}
    </span>
    <span className="text-xs">Loading…</span>
  </div>
)

const buildCheckPriceUserText = (payload: InsightRequest): string => {
  const title = payload.product.title
  const pricePhrase = payload.product.displayedPrice?.trim() || 'the listed price'
  return `Look for the best prices for this product: ${title} - costing less than ${pricePhrase}`
}

const isReviewDiscoveryResponse = (insight: InsightResponse): boolean =>
  insight.cards.some((c) => c.id === 'review-discovery-disclaimer')

const DISCOVER_ANCHOR = /^discover:(\d+)$/

const parseDiscoverAnchorHint = (hint: string | undefined): number | undefined => {
  if (!hint) {
    return undefined
  }
  const m = DISCOVER_ANCHOR.exec(hint.trim())
  if (!m) {
    return undefined
  }
  const n = Number(m[1])
  return Number.isInteger(n) && n >= 0 ? n : undefined
}

const extractReviewDiscoverySummaryBullets = (insight: InsightResponse): ReviewDiscoverySummaryBullet[] => {
  const card = insight.cards.find((c) => c.id === 'discover-summary')
  if (!card?.bullets?.length) {
    return []
  }
  return card.bullets.map((b) => ({
    text: b.text,
    sourceIndex: parseDiscoverAnchorHint(b.citation?.anchorHint)
  }))
}

const extractReviewDiscoverySourcesOverview = (insight: InsightResponse): string | undefined => {
  const card = insight.cards.find((c) => c.id === 'discover-summary')
  const t = card?.sourcesOverview?.trim()
  return t && t.length > 0 ? t : undefined
}

const buildChatResearchContextFromInsight = (insight: InsightResponse): ChatResearchContext | null => {
  const rd = insight.reviewDiscovery
  if (!rd || rd.results.length === 0) {
    return null
  }
  const bullets = extractReviewDiscoverySummaryBullets(insight)
  const overview = extractReviewDiscoverySourcesOverview(insight)
  return {
    reviewDiscovery: rd,
    summaryBullets: bullets.length > 0 ? bullets : undefined,
    summaryOverview: overview
  }
}

const buildChatHistory = (msgs: ChatMessage[]): ChatHistoryTurn[] => {
  const out: ChatHistoryTurn[] = []
  for (const m of msgs) {
    if (m.role === 'user') {
      out.push({ role: 'user', text: m.text })
    } else if (m.role === 'assistant' && m.kind === 'text') {
      out.push({ role: 'assistant', text: m.text })
    }
  }
  return out.slice(-20)
}

const pickReviewDiscoverySynthesisFootnote = (insight: InsightResponse): string | undefined => {
  return insight.limitations.find((l) => {
    const x = l.toLowerCase()
    return (
      x.includes('summary service is not configured') ||
      x.includes('web summary was skipped') ||
      x.includes('web summary skipped') ||
      x.includes('summary response did not match') ||
      x.includes('could not build the summary card') ||
      x.includes('unavailable after several tries') ||
      x.includes('server error while generating summary') ||
      x.includes('server error: could not complete')
    )
  })
}

const buildAssistantMessageFromInsight = (insight: InsightResponse): ChatMessage => {
  if (isReviewDiscoveryResponse(insight)) {
    const rows = insight.reviewDiscovery?.results ?? []
    if (rows.length > 0) {
      const summaryBullets = extractReviewDiscoverySummaryBullets(insight)
      const summarySourcesOverview = extractReviewDiscoverySourcesOverview(insight)
      const hasSummaryBody =
        summaryBullets.length > 0 || Boolean(summarySourcesOverview && summarySourcesOverview.length > 0)
      const synthesisFootnote = hasSummaryBody ? undefined : pickReviewDiscoverySynthesisFootnote(insight)
      const intro =
        summaryBullets.length > 0
          ? `Here are ${rows.length} ranked web sources from third-party pages. The numbered summary cites entries in the list below — it does not add new links.`
          : `Here are ${rows.length} ranked web sources from third-party pages.`
      return {
        id: createId(),
        role: 'assistant',
        kind: 'review_discovery',
        intro,
        summaryBullets: summaryBullets.length > 0 ? summaryBullets : undefined,
        summarySourcesOverview,
        synthesisFootnote,
        results: rows
      }
    }
    return {
      id: createId(),
      role: 'assistant',
      kind: 'text',
      text: insight.limitations.join('\n\n')
    }
  }

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

const appendOnceForInsight = (
  seen: Set<string>,
  insight: InsightResponse,
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
) => {
  if (seen.has(insight.requestId)) {
    return
  }
  seen.add(insight.requestId)
  setMessages((prev) => [...prev, buildAssistantMessageFromInsight(insight)])
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
  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages
  const lastResearchContextRef = useRef<ChatResearchContext | null>(null)
  const [hasChatContext, setHasChatContext] = useState(false)
  const [chatDraft, setChatDraft] = useState('')
  const [insightSourceIsService, setInsightSourceIsService] = useState(false)
  const [activeTabSupported, setActiveTabSupported] = useState(false)
  const [panelView, setPanelView] = useState<'chat' | 'settings'>('chat')
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
    const refreshTabHints = () => {
      void loadActiveTabSiteHints().then((hints) => {
        setInsightSourceIsService(hints.isServiceSite)
        setActiveTabSupported(hints.supportedPage)
      })
    }
    refreshTabHints()
    const onActivated = () => {
      refreshTabHints()
    }
    const onUpdated = () => {
      refreshTabHints()
    }
    chrome.tabs.onActivated.addListener(onActivated)
    chrome.tabs.onUpdated.addListener(onUpdated)
    return () => {
      chrome.tabs.onActivated.removeListener(onActivated)
      chrome.tabs.onUpdated.removeListener(onUpdated)
    }
  }, [hydrated])

  const appendInsightToThread = useCallback((insight: InsightResponse) => {
    appendOnceForInsight(seenInsightIdsRef.current, insight, setMessages)
    const ctx = buildChatResearchContextFromInsight(insight)
    if (ctx) {
      lastResearchContextRef.current = ctx
      setHasChatContext(true)
    }
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

  const reviewMutation = useMutation({
    mutationFn: (payload: InsightRequest) => requestInsight(payload, REVIEW_INSIGHT_TIMEOUT_MS),
    onSuccess: (insight) => {
      appendInsightToThread(insight)
    },
    onError: (error: Error) => {
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          kind: 'text',
          text: `Could not get review insight: ${error.message}`
        }
      ])
    }
  })

  const chatMutation = useMutation({
    mutationFn: (input: {
      userText: string
      researchContext: ChatResearchContext
      history: ChatHistoryTurn[]
    }) =>
      requestInsightChat({
        userMessage: input.userText,
        researchContext: input.researchContext,
        history: input.history.length > 0 ? input.history : undefined
      }),
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { id: createId(), role: 'assistant', kind: 'text', text: data.reply }
      ])
    },
    onError: (error: Error) => {
      setMessages((prev) => [
        ...prev,
        { id: createId(), role: 'assistant', kind: 'text', text: `Could not send chat: ${error.message}` }
      ])
    }
  })

  const handleSendChat = useCallback(() => {
    const text = chatDraft.trim()
    if (
      !text ||
      chatMutation.isPending ||
      priceMutation.isPending ||
      reviewMutation.isPending
    ) {
      return
    }
    const research = lastResearchContextRef.current
    if (!research) {
      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          kind: 'text',
          text: 'Run Get Review Insight first so ShopFriend has web sources to discuss.'
        }
      ])
      return
    }
    const history = buildChatHistory(messagesRef.current)
    setChatDraft('')
    setMessages((prev) => [...prev, { id: createId(), role: 'user', text }])
    chatMutation.mutate({ userText: text, researchContext: research, history })
  }, [chatDraft, chatMutation, priceMutation.isPending, reviewMutation.isPending])

  const handleChatKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSendChat()
      }
    },
    [handleSendChat]
  )

  const handleCheckPrice = async () => {
    const ctx = await loadInsightSessionContext()
    setInsightSourceIsService(ctx.isServiceSite)
    const freshPayload = ctx.insightRequest

    if (!freshPayload) {
      setMessages((prev) => [
        ...prev,
        { id: createId(), role: 'user', text: 'Check the prices for this product.' },
        {
          id: createId(),
          role: 'assistant',
          kind: 'text',
          text: 'Open a supported product or service page in this tab first so ShopFriend can read the context.'
        }
      ])
      return
    }

    setMessages((prev) => [...prev, { id: createId(), role: 'user', text: buildCheckPriceUserText(freshPayload) }])
    priceMutation.mutate(freshPayload)
  }

  const handleReviewInsight = async () => {
    const hints = await loadActiveTabSiteHints()
    setInsightSourceIsService(hints.isServiceSite)
    setActiveTabSupported(hints.supportedPage)

    let payload: InsightRequest | null = null
    let userPrompt =
      'Get review insight from the web (Trustpilot, Reddit, YouTube, forums, etc.).'

    if (hints.supportedPage) {
      const ctx = await loadInsightSessionContext()
      setInsightSourceIsService(ctx.isServiceSite)
      if (!ctx.insightRequest) {
        setMessages((prev) => [
          ...prev,
          { id: createId(), role: 'user', text: 'Get review insight for this page.' },
          {
            id: createId(),
            role: 'assistant',
            kind: 'text',
            text: 'ShopFriend could not read product context from this tab — try refreshing the page, or open another supported product listing.'
          }
        ])
        return
      }
      payload = {
        ...ctx.insightRequest,
        flags: {
          ...ctx.insightRequest.flags,
          insightKind: 'review_discovery',
          isServiceSite: ctx.isServiceSite,
          unsupportedDomainDiscovery: false
        }
      }
    } else {
      const domainPayload = await buildDomainDiscoveryRequest()
      if (!domainPayload) {
        setMessages((prev) => [
          ...prev,
          { id: createId(), role: 'user', text: 'Get review insight for this page.' },
          {
            id: createId(),
            role: 'assistant',
            kind: 'text',
            text: 'Get Review Insight needs a normal web address in this tab — use http(s), not the browser store, settings, or extension pages.'
          }
        ])
        return
      }
      payload = domainPayload
      userPrompt = 'Searching the web for reviews and reputation of this site (by domain).'
    }

    setMessages((prev) => [...prev, { id: createId(), role: 'user', text: userPrompt }])
    reviewMutation.mutate(payload)
  }

  const handleSettings = () => {
    setPanelView('settings')
  }

  const isThreadPending =
    chatMutation.isPending || priceMutation.isPending || reviewMutation.isPending

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sf-surface px-4 text-sm text-sf-on-surface-variant">
        Loading…
      </div>
    )
  }

  /** Retail PDP only: configured site match and not a service (`isService`) site in extractor config. */
  const showCheckPriceButton = activeTabSupported && !insightSourceIsService

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
              <p className="sf-text-muted">{panelView === 'settings' ? 'Settings' : 'Discussion'}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="sf-btn-secondary px-3 py-1.5 text-xs"
              onClick={handleSettings}
              aria-label="Open site extractor settings"
            >
              Settings
            </button>
          </div>
        </div>
      </header>

      {panelView === 'settings' ? (
        <SettingsPanel onBack={() => setPanelView('chat')} />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <div className="mx-auto flex max-w-xl flex-col gap-2">
              <p className="sf-text-muted px-1">Thread</p>
              <div
                className="flex min-h-[120px] flex-col gap-2 rounded-2xl bg-sf-surface-container-low/80 p-3"
                role="log"
                aria-relevant="additions"
                aria-live="polite"
              >
                {messages.length === 0 && !isThreadPending ? (
                  <p className="sf-text-muted px-1 py-2 text-center">
                    {!activeTabSupported
                      ? 'No messages yet — Get Review Insight can search the web for this tab’s domain. Open a supported store tab to use Check Price or richer on-page product insight.'
                      : insightSourceIsService
                        ? 'No messages yet — use Get Review Insight for web research on this service page.'
                        : 'No messages yet — try Check Price or Get Review Insight on a product tab.'}
                  </p>
                ) : (
                  <>
                  {messages.map((m) => {
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
                    if (m.kind === 'review_discovery') {
                      return (
                        <div key={m.id} className="sf-chat-assistant flex flex-col gap-3">
                          <p className="m-0 text-sm leading-snug">{m.intro}</p>
                          {m.synthesisFootnote ? (
                            <p className="m-0 text-xs leading-snug text-sf-on-surface-variant">{m.synthesisFootnote}</p>
                          ) : null}
                          {m.summaryBullets?.length || m.summarySourcesOverview?.trim() ? (
                            <div className="rounded-xl border border-sf-outline/20 bg-sf-surface-container-low/60 px-3 py-2">
                              <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-sf-on-surface-variant">
                                Summary
                              </p>
                              {m.summaryBullets?.length ? (
                                <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-sm leading-snug">
                                  {m.summaryBullets.map((b, i) => (
                                    <li key={`${m.id}-sum-${i}`}>
                                      <span>{b.text}</span>
                                      {typeof b.sourceIndex === 'number' ? (
                                        <span className="ml-1 text-xs text-sf-on-surface-variant">
                                          (source #{b.sourceIndex + 1} below)
                                        </span>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                              {m.summarySourcesOverview?.trim() ? (
                                <p className="mb-0 mt-2 text-sm leading-snug text-sf-on-surface-variant">
                                  {m.summarySourcesOverview.trim()}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          <ol className="m-0 flex list-decimal flex-col gap-3 pl-5 text-sm">
                            {m.results.map((r) => (
                              <li key={r.link} className="leading-snug">
                                <a
                                  href={r.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold text-sf-primary underline-offset-2 hover:underline"
                                >
                                  {r.title}
                                </a>
                                {typeof r.relevanceScore === 'number' ? (
                                  <span className="ml-2 text-xs text-sf-on-surface-variant">
                                    relevance {r.relevanceScore.toFixed(2)}
                                  </span>
                                ) : null}
                                {r.description ? (
                                  <p className="mt-1 mb-0 text-sf-on-surface-variant">{r.description}</p>
                                ) : null}
                              </li>
                            ))}
                          </ol>
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
                  })}
                  {isThreadPending ? <ChatThreadPendingIndicator /> : null}
                  </>
                )}
              </div>
              {messages.length > 0 ? (
                <p
                  className="mx-auto max-w-sm px-2 py-2 text-center text-xs leading-snug text-sf-on-surface-variant"
                  data-testid="sources-reminder-strip"
                  aria-label="Reminder to verify information using multiple sources"
                >
                  {SHOPFRIEND_SOURCES_REMINDER}
                </p>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 space-y-3 border-t border-sf-outline/10 bg-sf-surface-container-low/60 px-4 py-3">
            <div className="mx-auto flex max-w-xl flex-col gap-2">
              <label htmlFor="sf-chat-input" className="sr-only">
                Message to ShopFriend
              </label>
              <div className="flex gap-2">
                <textarea
                  id="sf-chat-input"
                  rows={2}
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  onKeyDown={handleChatKeyDown}
                  disabled={
                    !hasChatContext ||
                    chatMutation.isPending ||
                    priceMutation.isPending ||
                    reviewMutation.isPending
                  }
                  placeholder={
                    hasChatContext
                      ? 'Ask about the sources or summary… (Enter to send, Shift+Enter for newline)'
                      : 'Run Get Review Insight first to chat about the results'
                  }
                  className="min-h-0 flex-1 resize-none rounded-2xl border border-sf-outline/20 bg-sf-surface-container-highest px-3 py-2 text-sm text-sf-on-surface placeholder:text-sf-on-surface-variant/60 disabled:opacity-60"
                  aria-busy={chatMutation.isPending}
                />
                <button
                  type="button"
                  className="sf-btn-primary shrink-0 self-end px-4 py-2 text-sm"
                  onClick={() => void handleSendChat()}
                  disabled={
                    !hasChatContext ||
                    !chatDraft.trim() ||
                    chatMutation.isPending ||
                    priceMutation.isPending ||
                    reviewMutation.isPending
                  }
                  aria-label="Send chat message"
                >
                  {chatMutation.isPending ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
            <div className="mx-auto flex max-w-xl flex-col gap-2 sm:flex-row">
              {showCheckPriceButton ? (
                <button
                  type="button"
                  className="sf-btn-primary flex-1"
                  onClick={() => void handleCheckPrice()}
                  disabled={priceMutation.isPending || reviewMutation.isPending || chatMutation.isPending}
                  aria-busy={priceMutation.isPending}
                >
                  {priceMutation.isPending ? 'Checking price…' : 'Check Price'}
                </button>
              ) : null}
              <button
                type="button"
                className={showCheckPriceButton ? 'sf-btn-secondary flex-1' : 'sf-btn-primary flex-1'}
                onClick={() => void handleReviewInsight()}
                disabled={reviewMutation.isPending || priceMutation.isPending || chatMutation.isPending}
                aria-busy={reviewMutation.isPending}
              >
                {reviewMutation.isPending ? 'Searching web…' : 'Get Review Insight'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
