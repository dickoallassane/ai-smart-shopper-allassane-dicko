import fs from "node:fs/promises"
import path from "node:path"
import type { InsightRequest, InsightResponse } from "@shopfriend/shared"

/** Persist snapshots to disk until Supabase (or another store) is wired. */
export const shouldPersistInsightJson = (): boolean => {
  if (process.env.SHOPFRIEND_INSIGHT_LOG === "0") {
    return false
  }
  if (process.env.SHOPFRIEND_INSIGHT_LOG === "1") {
    return true
  }
  return process.env.NODE_ENV === "development"
}

export const resolveInsightLogDirectory = (): string => {
  const fromEnv = process.env.SHOPFRIEND_INSIGHT_LOG_DIR?.trim()
  if (fromEnv && fromEnv.length > 0) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(process.cwd(), fromEnv)
  }
  return path.join(process.cwd(), "data", "insights")
}

export const persistInsightJsonSnapshot = async (params: {
  routeRequestId: string
  request: InsightRequest
  response: InsightResponse
}): Promise<void> => {
  if (!shouldPersistInsightJson()) {
    return
  }
  const dir = resolveInsightLogDirectory()
  await fs.mkdir(dir, { recursive: true })
  const safeId = params.response.requestId.replace(/[^a-zA-Z0-9-]/g, "_")
  const filePath = path.join(dir, `${safeId}.json`)
  const payload = {
    routeRequestId: params.routeRequestId,
    savedAt: new Date().toISOString(),
    request: params.request,
    response: params.response
  }
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8")
}
