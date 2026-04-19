import { describe, expect, it } from "vitest"
import { getServerEnv } from "./env"

const OPTIONAL_ENV_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "BRIGHT_DATA_API_TOKEN",
  "AFFILIATE_NETWORKS_API_KEY",
  "AFFILIATE_NETWORKS_API_BASE_URL",
  "AFFILIATE_NETWORKS_REQUEST_JSON"
] as const

describe("getServerEnv", () => {
  it("does not throw when optional URL env vars are empty strings", () => {
    const prev: Record<string, string | undefined> = {}
    for (const key of OPTIONAL_ENV_KEYS) {
      prev[key] = process.env[key]
      process.env[key] = ""
    }
    try {
      expect(() => getServerEnv()).not.toThrow()
      const env = getServerEnv()
      expect(env.AFFILIATE_NETWORKS_API_BASE_URL).toBeUndefined()
      expect(env.OPENAI_BASE_URL).toBeUndefined()
      expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined()
    } finally {
      for (const key of OPTIONAL_ENV_KEYS) {
        const v = prev[key]
        if (v === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = v
        }
      }
    }
  })

  it("uses BRIGHT_DATA_API_KEY when BRIGHT_DATA_API_TOKEN is unset", () => {
    const prevToken = process.env.BRIGHT_DATA_API_TOKEN
    const prevKey = process.env.BRIGHT_DATA_API_KEY
    delete process.env.BRIGHT_DATA_API_TOKEN
    process.env.BRIGHT_DATA_API_KEY = "bd-key-from-alias"
    try {
      expect(getServerEnv().BRIGHT_DATA_API_TOKEN).toBe("bd-key-from-alias")
    } finally {
      if (prevToken === undefined) {
        delete process.env.BRIGHT_DATA_API_TOKEN
      } else {
        process.env.BRIGHT_DATA_API_TOKEN = prevToken
      }
      if (prevKey === undefined) {
        delete process.env.BRIGHT_DATA_API_KEY
      } else {
        process.env.BRIGHT_DATA_API_KEY = prevKey
      }
    }
  })

  it("treats whitespace-only optional strings as unset", () => {
    const prevKey = process.env.AFFILIATE_NETWORKS_API_KEY
    process.env.AFFILIATE_NETWORKS_API_KEY = "   \t"
    try {
      expect(getServerEnv().AFFILIATE_NETWORKS_API_KEY).toBeUndefined()
    } finally {
      if (prevKey === undefined) {
        delete process.env.AFFILIATE_NETWORKS_API_KEY
      } else {
        process.env.AFFILIATE_NETWORKS_API_KEY = prevKey
      }
    }
  })
})
