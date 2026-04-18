import { chatTurnRequestSchema, insightErrorBodySchema } from "@shopfriend/shared"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { runInsightChatTurn } from "@/server/services/insight/insight-chat-llm"
import {
  CHAT_ASSISTANT_UNAVAILABLE_BODY,
  CHAT_ASSISTANT_UNAVAILABLE_CODE,
  CHAT_BAD_RESPONSE_BODY,
  CHAT_BAD_RESPONSE_CODE,
  CHAT_INVALID_RESEARCH_BODY,
  CHAT_INVALID_RESEARCH_CONTEXT_CODE
} from "@/server/services/insight/user-facing-messages"

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
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined
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

const insightAuthRequired = () =>
  process.env.SHOPFRIEND_REQUIRE_INSIGHT_AUTH === "true" && isSupabaseConfigured()

const MAX_BODY_BYTES = 512_000

export const maxDuration = 60

export const POST = async (request: NextRequest) => {
  const routeRequestId = crypto.randomUUID()
  const controller = new AbortController()

  try {
    if (insightAuthRequired()) {
      const { userId } = await verifyBearer(request)
      if (!userId) {
        return jsonError(401, { error: "Unauthorized", code: "UNAUTHORIZED", requestId: routeRequestId })
      }
    }

    const rawText = await request.text()
    if (rawText.length > MAX_BODY_BYTES) {
      return jsonError(400, { error: "Request body too large", code: "BAD_REQUEST", requestId: routeRequestId })
    }

    let json: unknown
    try {
      json = JSON.parse(rawText) as unknown
    } catch {
      return jsonError(400, { error: "Invalid JSON", code: "BAD_REQUEST", requestId: routeRequestId })
    }

    const parsed = chatTurnRequestSchema.safeParse(json)
    if (!parsed.success) {
      return jsonError(400, { error: "Invalid chat payload", code: "BAD_REQUEST", requestId: routeRequestId })
    }

    const out = await runInsightChatTurn(parsed.data, controller.signal)
    return NextResponse.json(out, { headers: corsHeaders })
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      return jsonError(504, { error: "Chat timed out", code: "TIMEOUT", requestId: routeRequestId })
    }
    if (error instanceof Error) {
      if (error.message === CHAT_ASSISTANT_UNAVAILABLE_CODE) {
        return jsonError(503, {
          error: CHAT_ASSISTANT_UNAVAILABLE_BODY,
          code: "UPSTREAM",
          requestId: routeRequestId
        })
      }
      if (error.message === CHAT_INVALID_RESEARCH_CONTEXT_CODE) {
        return jsonError(400, {
          error: CHAT_INVALID_RESEARCH_BODY,
          code: "BAD_REQUEST",
          requestId: routeRequestId
        })
      }
      if (error.message === CHAT_BAD_RESPONSE_CODE) {
        return jsonError(502, {
          error: CHAT_BAD_RESPONSE_BODY,
          code: "UPSTREAM",
          requestId: routeRequestId
        })
      }
    }
    console.error("[ShopFriend] /api/insight/chat", routeRequestId, error)
    return jsonError(500, {
      error: "Server error. Please try again.",
      code: "INTERNAL",
      requestId: routeRequestId
    })
  }
}

export const OPTIONS = () =>
  new NextResponse(null, {
    status: 204,
    headers: corsHeaders
  })
