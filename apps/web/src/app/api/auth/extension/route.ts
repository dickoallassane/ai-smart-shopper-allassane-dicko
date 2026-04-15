import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * Validates a Supabase user JWT and returns a minimal profile payload.
 * The Chrome extension should send the same access token it received from the web session.
 */
export const POST = async (request: NextRequest) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return NextResponse.json(
      { ok: false, error: "Supabase is not configured on the server" },
      { status: 503 }
    )
  }

  const header = request.headers.get("authorization") ?? ""
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined

  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing Authorization bearer token" }, { status: 401 })
  }

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    return NextResponse.json({ ok: false, error: "Invalid or expired session" }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: data.user.id,
      email: data.user.email
    }
  })
}
