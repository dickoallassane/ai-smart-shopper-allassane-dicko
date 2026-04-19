import {
  NETWORK_RESEARCH_POLL_FAILED,
  NETWORK_RESEARCH_POST_FAILED,
  WEB_RESEARCH_UNKNOWN_FAILURE
} from "./user-facing-messages"

const MAX_USER_MESSAGE_LEN = 500

/** Strip literal IPs from Undici / Node connect() lines (not useful in-product; duplicates collapse after redaction). */
const IPV4_WITH_OPTIONAL_PORT =
  /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?::\d{1,5})?\b/g

const sanitizeUserFacingNetworkDetail = (raw: string): string =>
  raw.replace(IPV4_WITH_OPTIONAL_PORT, "[host]").replace(/\s{2,}/g, " ").trim()

const errnoCodeFrom = (value: unknown): string | undefined => {
  if (!value || typeof value !== "object") {
    return undefined
  }
  const code = (value as NodeJS.ErrnoException).code
  return typeof code === "string" && code.length > 0 ? code : undefined
}

const pushUnique = (segments: string[], seen: Set<string>, raw: string) => {
  const text = sanitizeUserFacingNetworkDetail(raw.trim())
  if (!text || text.length > 240) {
    return
  }
  const key = text.toLowerCase()
  if (seen.has(key)) {
    return
  }
  seen.add(key)
  segments.push(text)
}

/**
 * Collects short, user-safe fragments from `Error` / `AggregateError` / `cause` chains
 * (typical of Node `fetch` / Undici failures) for insight `limitations` copy.
 */
const collectFromCause = (value: unknown, depth: number, segments: string[], seen: Set<string>) => {
  if (depth > 8 || value === undefined || value === null) {
    return
  }

  if (value instanceof Error) {
    pushUnique(segments, seen, value.message)
    const code = errnoCodeFrom(value)
    if (code) {
      pushUnique(segments, seen, code)
    }
    collectFromCause(value.cause, depth + 1, segments, seen)

    if (value instanceof AggregateError && Array.isArray(value.errors)) {
      for (const sub of value.errors) {
        collectFromCause(sub, depth + 1, segments, seen)
      }
    }
    return
  }

  const code = errnoCodeFrom(value)
  if (code) {
    pushUnique(segments, seen, code)
  }
}

const allMessagesLower = (error: Error): string => {
  const chunks: string[] = []
  const walk = (e: unknown, depth: number) => {
    if (depth > 10 || e === undefined || e === null) {
      return
    }
    if (e instanceof Error) {
      chunks.push(e.message)
      const code = errnoCodeFrom(e)
      if (code) {
        chunks.push(code)
      }
      if (e instanceof AggregateError && Array.isArray(e.errors)) {
        for (const sub of e.errors) {
          walk(sub, depth + 1)
        }
      }
      walk(e.cause, depth + 1)
    }
  }
  walk(error, 0)
  return chunks.join(" ").toLowerCase()
}

/**
 * Turns low-level `fetch failed` chains into a single readable line for the side panel.
 */
export const formatInsightNetworkError = (error: unknown): string => {
  if (!(error instanceof Error)) {
    return WEB_RESEARCH_UNKNOWN_FAILURE
  }

  const seen = new Set<string>()
  const segments: string[] = []

  pushUnique(segments, seen, error.message)
  collectFromCause(error.cause, 0, segments, seen)

  const flatLower = allMessagesLower(error)
  if (
    flatLower.includes(NETWORK_RESEARCH_POST_FAILED.toLowerCase()) ||
    flatLower.includes(NETWORK_RESEARCH_POLL_FAILED.toLowerCase())
  ) {
    let out = "Network error while loading web research."
    if (flatLower.includes("etimedout")) {
      out += " The connection timed out."
    } else if (flatLower.includes("econnrefused")) {
      out += " The connection was refused — try another network or VPN."
    } else {
      out += " Check your connection and try again."
    }
    return out.slice(0, MAX_USER_MESSAGE_LEN)
  }

  let line = segments.join(" — ")
  if (/\bECONNREFUSED\b/i.test(line)) {
    line = `${line} Check your network connection and try again.`
  }
  return line.length <= MAX_USER_MESSAGE_LEN ? line : line.slice(0, MAX_USER_MESSAGE_LEN)
}
