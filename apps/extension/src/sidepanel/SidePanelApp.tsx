import { useQuery } from '@tanstack/react-query'
import { type InsightResponse } from '@shopfriend/shared'
import { useEffect, useState } from 'react'

const fetchLatestInsight = async (): Promise<InsightResponse | null> => {
  return new Promise((resolve) => {
    chrome.storage.local.get(['lastInsight'], (result) => {
      resolve((result.lastInsight as InsightResponse | undefined) ?? null)
    })
  })
}

export const SidePanelApp = () => {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const insightQuery = useQuery({
    queryKey: ['latest-insight'],
    queryFn: fetchLatestInsight,
    enabled: hydrated
  })

  useEffect(() => {
    const listener = (
      message: { type?: string; insight?: InsightResponse },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (value?: unknown) => void
    ) => {
      if (message.type === 'INSIGHT_READY' && message.insight) {
        void chrome.storage.local.set({ lastInsight: message.insight })
        void insightQuery.refetch()
      }
      sendResponse()
      return true
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => {
      chrome.runtime.onMessage.removeListener(listener)
    }
  }, [insightQuery])

  if (!hydrated) {
    return <p>Loading…</p>
  }

  if (insightQuery.isLoading) {
    return <p>Fetching last insight…</p>
  }

  const insight = insightQuery.data

  if (!insight) {
    return (
      <main style={{ fontFamily: 'system-ui', padding: 12 }}>
        <h1 style={{ fontSize: 18 }}>ShopFriend</h1>
        <p>No insight yet. Use the popup on an Amazon PDP to run an insight.</p>
      </main>
    )
  }

  return (
    <main style={{ fontFamily: 'system-ui', padding: 12, maxWidth: 520 }}>
      <h1 style={{ fontSize: 18 }}>ShopFriend</h1>
      <p style={{ color: '#4b5563', fontSize: 13 }}>Request {insight.requestId}</p>
      {insight.cards.map((card) => (
        <section key={card.id} style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 15 }}>{card.title}</h2>
          <ul>
            {card.bullets.map((bullet, idx) => (
              <li key={`${card.id}-${idx}`} style={{ marginBottom: 6 }}>
                {bullet.text}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section>
        <h2 style={{ fontSize: 15 }}>Limitations</h2>
        <ul>
          {insight.limitations.map((line, idx) => (
            <li key={`lim-${idx}`}>{line}</li>
          ))}
        </ul>
      </section>
    </main>
  )
}
