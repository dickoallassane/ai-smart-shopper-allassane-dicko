import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

type CookieToSet = {
  name: string
  value: string
  options: CookieOptions
}

/**
 * Supabase client for Route Handlers that must set cookies on a mutable `NextResponse`
 * (e.g. OAuth / PKCE `exchangeCodeForSession` before redirect).
 */
export const createSupabaseRouteHandlerClient = (request: NextRequest, response: NextResponse) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      }
    }
  })
}
