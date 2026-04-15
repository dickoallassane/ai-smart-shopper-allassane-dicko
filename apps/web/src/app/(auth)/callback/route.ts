import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/server/auth/route-handler"

/** Supabase PKCE / OAuth redirect handler — sets session cookies on success. */
export const GET = async (request: NextRequest) => {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/"

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", origin))
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return NextResponse.redirect(new URL("/login?error=supabase_not_configured", origin))
  }

  const response = NextResponse.redirect(new URL(next, origin))

  try {
    const supabase = createSupabaseRouteHandlerClient(request, response)
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(error.message)}`, origin)
      )
    }
  } catch {
    return NextResponse.redirect(new URL("/login?error=exchange_failed", origin))
  }

  return response
}
