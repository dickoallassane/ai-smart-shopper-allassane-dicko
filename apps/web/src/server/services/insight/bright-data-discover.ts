import {
  NETWORK_RESEARCH_POLL_FAILED,
  NETWORK_RESEARCH_POST_FAILED,
  RESEARCH_POLL_TIMED_OUT,
  SERVER_RESEARCH_INCOMPLETE_START,
  SERVER_RESEARCH_UNEXPECTED_POLL,
  SERVER_RESEARCH_UNEXPECTED_START
} from "./user-facing-messages"

const DISCOVER_URL = "https://api.brightdata.com/discover"

export type RawDiscoverItem = {
  link: string
  title: string
  description?: string
  relevance_score?: number
  content?: string | null
}

export class DiscoverHttpError extends Error {
  readonly status: number
  readonly responseBody: string | undefined

  constructor(message: string, status: number, responseBody?: string) {
    super(message)
    this.name = "DiscoverHttpError"
    this.status = status
    this.responseBody = responseBody
  }
}

const truncate = (value: string, max: number): string =>
  value.length <= max ? value : value.slice(0, max)

const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }
    const id = setTimeout(() => resolve(), ms)
    const onAbort = () => {
      clearTimeout(id)
      reject(new DOMException("Aborted", "AbortError"))
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })

const discoverFetch = async (phase: "POST" | "poll", run: () => Promise<Response>): Promise<Response> => {
  try {
    return await run()
  } catch (err) {
    const detail = phase === "POST" ? NETWORK_RESEARCH_POST_FAILED : NETWORK_RESEARCH_POLL_FAILED
    throw new Error(detail, { cause: err })
  }
}

const flattenErrorForRetry = (err: unknown): string => {
  const parts: string[] = []
  let cur: unknown = err
  for (let depth = 0; depth < 12 && cur instanceof Error; depth += 1) {
    parts.push(cur.message)
    const code = (cur as NodeJS.ErrnoException).code
    if (typeof code === "string" && code.length > 0) {
      parts.push(code)
    }
    if (cur instanceof AggregateError && Array.isArray(cur.errors)) {
      for (const sub of cur.errors) {
        if (sub instanceof Error) {
          parts.push(sub.message)
          const subCode = (sub as NodeJS.ErrnoException).code
          if (typeof subCode === "string" && subCode.length > 0) {
            parts.push(subCode)
          }
        }
      }
    }
    cur = cur.cause
  }
  return parts.join(" ").toLowerCase()
}

const RETRYABLE_FETCH_SUBSTRINGS = [
  "fetch failed",
  "econnrefused",
  "etimedout",
  "enetunreach",
  "eai_again",
  "und_err_socket",
  "und_err",
  "other side closed",
  "socket hang up",
  "network error"
] as const

const isRetryableDiscoverFetchFailure = (err: unknown): boolean => {
  if (err instanceof DOMException && err.name === "AbortError") {
    return false
  }
  const hay = flattenErrorForRetry(err)
  return RETRYABLE_FETCH_SUBSTRINGS.some((s) => hay.includes(s))
}

/**
 * Bright Data exposes multiple A records; the first IP can time out while another works (curl retries).
 * Node may fail fast on one address — brief backoff retries usually land on a healthy endpoint.
 */
const discoverFetchWithRetries = async (
  phase: "POST" | "poll",
  signal: AbortSignal,
  attempts: number,
  run: () => Promise<Response>
): Promise<Response> => {
  let last: unknown
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await discoverFetch(phase, run)
    } catch (err) {
      last = err
      const canRetry = i < attempts && isRetryableDiscoverFetchFailure(err)
      if (!canRetry) {
        throw err
      }
      const backoffMs = i === 1 ? 500 : 1500
      await sleep(backoffMs, signal)
    }
  }
  throw last
}

export type ExecuteDiscoverOptions = {
  /** Wall-clock budget for polling after task_id is issued */
  maxPollMs?: number
  pollIntervalMs?: number
}

/**
 * One Discover job: a **single POST** with `query`, `intent`, etc., then **repeated GET** polls
 * (`?task_id=…`) until Bright Data returns `status === "done"` — not multiple prompt submissions.
 */
export const executeDiscover = async (
  body: Record<string, unknown>,
  apiToken: string,
  signal: AbortSignal,
  options?: ExecuteDiscoverOptions
): Promise<RawDiscoverItem[]> => {
  const maxPollMs = options?.maxPollMs ?? 72_000
  const pollIntervalMs = options?.pollIntervalMs ?? 750

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiToken}`
  }

  const postRes = await discoverFetchWithRetries("POST", signal, 4, () =>
    fetch(DISCOVER_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal
    })
  )
  const postText = await postRes.text()
  if (!postRes.ok) {
    throw new DiscoverHttpError(`discover_post_http_${postRes.status}`, postRes.status, postText)
  }

  let postJson: { task_id?: string }
  try {
    postJson = JSON.parse(postText) as { task_id?: string }
  } catch {
    throw new Error(SERVER_RESEARCH_UNEXPECTED_START)
  }

  const taskId = postJson.task_id
  if (typeof taskId !== "string" || taskId.length === 0) {
    throw new Error(SERVER_RESEARCH_INCOMPLETE_START)
  }

  const deadline = Date.now() + maxPollMs

  while (Date.now() < deadline) {
    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError")
    }

    const getRes = await discoverFetchWithRetries("poll", signal, 2, () =>
      fetch(`${DISCOVER_URL}?task_id=${encodeURIComponent(taskId)}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiToken}` },
        signal
      })
    )
    const getText = await getRes.text()
    if (!getRes.ok) {
      throw new DiscoverHttpError(`discover_get_http_${getRes.status}`, getRes.status, getText)
    }

    let getJson: { status?: string; results?: RawDiscoverItem[] }
    try {
      getJson = JSON.parse(getText) as { status?: string; results?: RawDiscoverItem[] }
    } catch {
      throw new Error(SERVER_RESEARCH_UNEXPECTED_POLL)
    }

    if (getJson.status === "done" && Array.isArray(getJson.results)) {
      return getJson.results
    }

    const remaining = deadline - Date.now()
    if (remaining <= 0) {
      break
    }
    await sleep(Math.min(pollIntervalMs, remaining), signal)
  }

  throw new Error(RESEARCH_POLL_TIMED_OUT)
}

export const mapDiscoverItemToReviewResult = (item: RawDiscoverItem) => {
  const description =
    typeof item.description === "string" && item.description.length > 0
      ? truncate(item.description, 2000)
      : undefined
  const contentRaw = item.content
  const content =
    typeof contentRaw === "string" && contentRaw.length > 0
      ? truncate(contentRaw, 8000)
      : undefined

  return {
    link: item.link,
    title: truncate(item.title ?? "", 500),
    description,
    relevanceScore: typeof item.relevance_score === "number" ? item.relevance_score : undefined,
    content
  }
}
