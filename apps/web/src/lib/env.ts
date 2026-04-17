import { z } from "zod"

/** `process.env` often yields `""` for unset keys; Zod `.optional()` does not accept empty string for `.url()`. */
const pickEnv = (value: string | undefined): string | undefined => {
  const t = value?.trim()
  return t && t.length > 0 ? t : undefined
}

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  /** Bearer for Bright Data APIs; also accepts `BRIGHT_DATA_API_KEY` as an alias. */
  BRIGHT_DATA_API_TOKEN: z.string().optional(),
  /** Bearer token for Affiliate.com Product API (server-only) */
  AFFILIATE_NETWORKS_API_KEY: z.string().min(1).optional(),
  /** Origin only, e.g. `https://api.example.com` — path `/v1/products` is appended in code */
  AFFILIATE_NETWORKS_API_BASE_URL: z.string().url().optional(),
  /** Optional JSON string: `{ "NETWORK_ID": { "affiliate_id": "…", "sub_id": "…" } }` for request body `networks` */
  AFFILIATE_NETWORKS_REQUEST_JSON: z.string().optional()
})

export type ServerEnv = z.infer<typeof serverEnvSchema>

export const getServerEnv = (): ServerEnv => {
  return serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: pickEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: pickEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: pickEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
    OPENAI_API_KEY: pickEnv(process.env.OPENAI_API_KEY),
    OPENAI_BASE_URL: pickEnv(process.env.OPENAI_BASE_URL),
    BRIGHT_DATA_API_TOKEN:
      pickEnv(process.env.BRIGHT_DATA_API_TOKEN) ?? pickEnv(process.env.BRIGHT_DATA_API_KEY),
    AFFILIATE_NETWORKS_API_KEY: pickEnv(process.env.AFFILIATE_NETWORKS_API_KEY),
    AFFILIATE_NETWORKS_API_BASE_URL: pickEnv(process.env.AFFILIATE_NETWORKS_API_BASE_URL),
    AFFILIATE_NETWORKS_REQUEST_JSON: pickEnv(process.env.AFFILIATE_NETWORKS_REQUEST_JSON)
  })
}
