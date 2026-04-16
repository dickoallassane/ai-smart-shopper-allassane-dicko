import { type InsightRequest, type InsightResponse } from '@shopfriend/shared'

const DEFAULT_TIMEOUT_MS = 14_000

/**
 * Asks the service worker to run an insight request (see `REQUEST_INSIGHT` in background).
 */
export const requestInsight = async (
  payload: InsightRequest,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<InsightResponse> => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'REQUEST_INSIGHT', payload, timeoutMs }, (response) => {
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
