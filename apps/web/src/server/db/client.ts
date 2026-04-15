import { createClient } from "@supabase/supabase-js"

/**
 * Service-role Supabase client for trusted server-only work (bypasses RLS).
 * Returns null when `SUPABASE_SERVICE_ROLE_KEY` is not configured.
 */
export const createServiceRoleClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return null
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}
