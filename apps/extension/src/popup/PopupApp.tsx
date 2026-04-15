import { useMutation } from '@tanstack/react-query'
import { insightRequestSchema, type InsightRequest, type InsightResponse } from '@shopfriend/shared'
import { useEffect, useState } from 'react'

const requestInsight = async (payload: InsightRequest): Promise<InsightResponse> => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'REQUEST_INSIGHT', payload, timeoutMs: 14_000 }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      if (response?.ok) {
        resolve(response.insight as InsightResponse)
        return
      }
      reject(new Error(response?.error ?? 'Insight failed'))
    })
  })
}

export const PopupApp = () => {
  const [message, setMessage] = useState('Open an Amazon product page to extract context.')

  const insightMutation = useMutation({
    mutationFn: requestInsight,
    onSuccess: () => {
      setMessage('Insight loaded — open the side panel to read details.')
    },
    onError: (error: Error) => {
      setMessage(error.message)
    }
  })

  useEffect(() => {
    const loadPayload = async () => {
      const session = await chrome.storage.session.get('lastProductPayload')
      const raw = session.lastProductPayload
      if (!raw) {
        setMessage('No product context yet. Visit an Amazon PDP.')
        return
      }
      const parsed = insightRequestSchema.safeParse({
        product: raw,
        flags: { llmEnabled: true, pricingBetaEnabled: false }
      })
      if (!parsed.success) {
        setMessage('Invalid product payload')
        return
      }
      setMessage('Product context found. Run insight.')
    }
    void loadPayload()
  }, [])

  const handleOpenSidePanel = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      return
    }
    await chrome.runtime.sendMessage({ type: 'OPEN_SIDE_PANEL', tabId: tab.id })
  }

  const handleRunInsight = async () => {
    const session = await chrome.storage.session.get('lastProductPayload')
    const raw = session.lastProductPayload
    if (!raw) {
      setMessage('No product payload in this tab session.')
      return
    }
    const parsed = insightRequestSchema.safeParse({
      product: raw,
      flags: { llmEnabled: true, pricingBetaEnabled: false }
    })
    if (!parsed.success) {
      setMessage('Payload invalid')
      return
    }
    setMessage('Requesting insight…')
    insightMutation.mutate(parsed.data)
  }

  return (
    <main className="sf-popup">
      <style>{`
        .sf-popup { width: 320px; padding: 12px; font-family: system-ui, sans-serif; }
        .sf-popup h1 { font-size: 16px; margin: 0 0 8px; }
        .sf-popup p { font-size: 13px; color: #374151; margin: 0 0 12px; }
        .sf-popup button { margin-right: 8px; margin-bottom: 8px; padding: 8px 10px; border-radius: 6px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; }
        .sf-popup button:focus { outline: 2px solid #2563eb; outline-offset: 2px; }
      `}</style>
      <h1>ShopFriend</h1>
      <p>{message}</p>
      <button type="button" onClick={() => void handleRunInsight()} disabled={insightMutation.isPending}>
        {insightMutation.isPending ? 'Loading…' : 'Run insight'}
      </button>
      <button type="button" onClick={() => void handleOpenSidePanel()}>
        Open side panel
      </button>
    </main>
  )
}
