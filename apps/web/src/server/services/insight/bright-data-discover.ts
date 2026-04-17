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

export type ExecuteDiscoverOptions = {
  /** Wall-clock budget for polling after task_id is issued */
  maxPollMs?: number
  pollIntervalMs?: number
}

/**
 * POST Discover task, then poll GET until `status === "done"` or timeout.
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

  const postRes = await fetch(DISCOVER_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal
  })
  const postText = await postRes.text()
  if (!postRes.ok) {
    throw new DiscoverHttpError(
      `Bright Data Discover POST failed (${postRes.status})`,
      postRes.status,
      postText
    )
  }

  let postJson: { task_id?: string }
  try {
    postJson = JSON.parse(postText) as { task_id?: string }
  } catch {
    throw new Error("Bright Data Discover POST returned invalid JSON")
  }

  const taskId = postJson.task_id
  if (typeof taskId !== "string" || taskId.length === 0) {
    throw new Error("Bright Data Discover POST response missing task_id")
  }

  const deadline = Date.now() + maxPollMs

  while (Date.now() < deadline) {
    if (signal.aborted) {
      throw new DOMException("Aborted", "AbortError")
    }

    const getRes = await fetch(`${DISCOVER_URL}?task_id=${encodeURIComponent(taskId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiToken}` },
      signal
    })
    const getText = await getRes.text()
    if (!getRes.ok) {
      throw new DiscoverHttpError(
        `Bright Data Discover GET failed (${getRes.status})`,
        getRes.status,
        getText
      )
    }

    let getJson: { status?: string; results?: RawDiscoverItem[] }
    try {
      getJson = JSON.parse(getText) as { status?: string; results?: RawDiscoverItem[] }
    } catch {
      throw new Error("Bright Data Discover GET returned invalid JSON")
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

  throw new Error("Bright Data Discover poll timed out before results were ready")
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
