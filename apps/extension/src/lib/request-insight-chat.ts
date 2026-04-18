import { type ChatTurnRequest, type ChatTurnResponse, chatTurnResponseSchema } from '@shopfriend/shared'

const DEFAULT_TIMEOUT_MS = 64_000

/**
 * Asks the service worker to POST `/api/insight/chat` (see `REQUEST_INSIGHT_CHAT` in background).
 */
export const requestInsightChat = async (
  payload: ChatTurnRequest,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<ChatTurnResponse> => {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'REQUEST_INSIGHT_CHAT', payload, timeoutMs }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      if (response?.ok) {
        const parsed = chatTurnResponseSchema.safeParse(response.data)
        if (!parsed.success) {
          reject(new Error('Invalid chat response from extension'))
          return
        }
        resolve(parsed.data)
        return
      }
      reject(new Error(response?.error ?? 'Chat request failed'))
    })
  })
}
