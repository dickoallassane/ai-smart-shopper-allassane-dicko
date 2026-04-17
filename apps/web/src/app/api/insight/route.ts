import { insightRequestSchema, insightErrorBodySchema } from "@shopfriend/shared"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { generateInsight } from "@/server/services/insight/generate"
import { persistInsightJsonSnapshot } from "@/server/services/insight/persist-insight-json"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
}

const jsonError = (
  status: number,
  body: { error: string; code: NonNullable<ReturnType<typeof insightErrorBodySchema.parse>["code"]>; requestId?: string }
) => {
  const parsed = insightErrorBodySchema.parse(body)
  return NextResponse.json(parsed, { status, headers: corsHeaders })
}

const verifyBearer = async (request: NextRequest) => {
  const header = request.headers.get("authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined

  if (!token) {
    return { userId: null as string | null }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return { userId: null as string | null }
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) {
    return { userId: null as string | null }
  }

  return { userId: data.user.id }
}

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

/** Opt-in: set `SHOPFRIEND_REQUIRE_INSIGHT_AUTH=true` when Supabase is ready and callers must send a Bearer token. */
const insightAuthRequired = () =>
  process.env.SHOPFRIEND_REQUIRE_INSIGHT_AUTH === "true" && isSupabaseConfigured()

/** Bright Data Discover polling can exceed default serverless limits on Vercel. */
export const maxDuration = 120

export const POST = async (request: NextRequest) => {
  const requestId = crypto.randomUUID()
  const controller = new AbortController()

  try {
    if (insightAuthRequired()) {
      const { userId } = await verifyBearer(request)
      if (!userId) {
        return jsonError(401, { error: "Unauthorized", code: "UNAUTHORIZED", requestId })
      }
    }

    const json: unknown = await request.json()
    const parsed = insightRequestSchema.safeParse(json)

    if (!parsed.success) {
      return jsonError(400, { error: "Invalid payload", code: "BAD_REQUEST", requestId })
    }

    const insight = await generateInsight(parsed.data, controller.signal)
    void persistInsightJsonSnapshot({
      routeRequestId: requestId,
      request: parsed.data,
      response: insight
    }).catch((err) => {
      console.warn("[ShopFriend] insight JSON snapshot failed (non-fatal)", err)
    })
    return NextResponse.json(insight, { headers: corsHeaders })
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      return jsonError(504, { error: "Insight timed out", code: "TIMEOUT", requestId })
    }
    console.error("[ShopFriend] /api/insight", requestId, error)
    return jsonError(500, { error: "Insight failed", code: "INTERNAL", requestId })
  }
}

export const OPTIONS = () => {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders
  })
}
