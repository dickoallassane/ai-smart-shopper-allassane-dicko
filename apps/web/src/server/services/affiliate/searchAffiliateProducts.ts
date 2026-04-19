import {
  affiliateMatchSchema,
  type AffiliateMatch,
  type InsightRequest
} from "@shopfriend/shared"
import { getServerEnv } from "@/lib/env"
import { z } from "zod"
import { isSameRegistrableDomainAsProduct } from "./same-retail-domain"

const AFFILIATE_PATH = "/v1/products"
const MAX_TITLE_LEN = 200
/** Rows to request from Affiliate API before shaping/capping. */
const PER_PAGE = 15
const MAX_MATCHES_RETURNED = 2

const networksBodySchema = z.record(
  z.string().min(1),
  z.object({
    affiliate_id: z.string().min(1),
    sub_id: z.string().min(1)
  })
)

const affiliateUrlsSchema = z
  .object({
    outclick: z.string().nullable().optional(),
    direct: z.string().nullable().optional(),
    affiliate: z.string().nullable().optional(),
    shopnomix: z.string().nullable().optional()
  })
  .partial()
  .passthrough()

const affiliateApiRowSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    name: z.string(),
    description: z.string().nullable().optional(),
    final_price: z.union([z.number(), z.string()]).optional(),
    currency: z.string().nullable().optional(),
    commission_url: z.string().nullable().optional(),
    direct_url: z.string().nullable().optional(),
    image_url: z.string().nullable().optional(),
    urls: affiliateUrlsSchema.optional(),
    merchant: z
      .object({
        id: z.number().optional(),
        name: z.string().optional()
      })
      .optional(),
    network: z
      .object({
        id: z.number().optional(),
        name: z.string().optional()
      })
      .optional()
  })
  .passthrough()

const affiliateApiResponseSchema = z.object({
  data: z.array(affiliateApiRowSchema)
})

const stripBomAndTrim = (raw: string): string => {
  const trimmed = raw.trim()
  return trimmed.charCodeAt(0) === 0xfeff ? trimmed.slice(1) : trimmed
}

/** Remove line/block comments while respecting JSON strings. */
const stripJsonCommentsLoose = (input: string): string => {
  let out = ""
  let i = 0
  let inString = false
  let escape = false
  while (i < input.length) {
    const c = input[i]!
    if (escape) {
      out += c
      escape = false
      i += 1
      continue
    }
    if (inString) {
      if (c === "\\") {
        escape = true
      } else if (c === '"') {
        inString = false
      }
      out += c
      i += 1
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      i += 1
      continue
    }
    if (c === "/" && input[i + 1] === "/") {
      i += 2
      while (i < input.length && input[i] !== "\n" && input[i] !== "\r") i += 1
      continue
    }
    if (c === "/" && input[i + 1] === "*") {
      i += 2
      while (i < input.length - 1) {
        if (input[i] === "*" && input[i + 1] === "/") {
          i += 2
          break
        }
        i += 1
      }
      continue
    }
    out += c
    i += 1
  }
  return out
}

const snippetForLog = (raw: string, max = 120): string => {
  const s = raw.replace(/\s+/g, " ").trim()
  return s.length <= max ? s : `${s.slice(0, max)}…`
}

const parseNetworksJson = (raw: string | undefined): z.infer<typeof networksBodySchema> | undefined => {
  if (!raw?.trim()) {
    return undefined
  }
  const normalized = stripJsonCommentsLoose(stripBomAndTrim(raw)).trim()
  if (!normalized) {
    console.warn("[ShopFriend] AFFILIATE_NETWORKS_REQUEST_JSON empty after trimming/comments; ignoring")
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(normalized)
    const validated = networksBodySchema.safeParse(parsed)
    if (!validated.success) {
      console.warn(
        "[ShopFriend] AFFILIATE_NETWORKS_REQUEST_JSON schema validation failed; ignoring.",
        "issues:",
        JSON.stringify(validated.error.flatten()),
        "| snippet:",
        snippetForLog(normalized)
      )
      return undefined
    }
    return validated.data
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      "[ShopFriend] AFFILIATE_NETWORKS_REQUEST_JSON JSON.parse failed:",
      message,
      "| snippet:",
      snippetForLog(normalized)
    )
    return undefined
  }
}

const resolveCurrency = (locale: string): string => {
  const upper = locale.toUpperCase()
  if (upper.includes("GB") || upper.endsWith("UK")) {
    return "GBP"
  }
  if (upper.includes("EUR") || upper.includes("DE") || upper.includes("FR")) {
    return "EUR"
  }
  return "USD"
}

const buildProductUrl = (baseUrl: string): string => {
  const trimmed = baseUrl.replace(/\/+$/, "")
  return `${trimmed}${AFFILIATE_PATH}`
}

/** Tracked / affiliate URLs only (not the retailer direct PDP). */
const pickAffiliateTrackedUrl = (row: z.infer<typeof affiliateApiRowSchema>): string | undefined => {
  const candidates = [row.urls?.affiliate, row.commission_url, row.urls?.outclick, row.urls?.shopnomix]
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0 && URL.canParse(c)) {
      return c
    }
  }
  return undefined
}

const pickDirectUrl = (row: z.infer<typeof affiliateApiRowSchema>): string | undefined => {
  const d = row.urls?.direct ?? row.direct_url
  if (typeof d === "string" && d.length > 0 && URL.canParse(d)) {
    return d
  }
  return undefined
}

/** First `affiliate_id` from networks config (Impact/Walmart-style URLs use it to replace `@@@`). */
export const firstAffiliateIdFromNetworks = (
  networks: z.infer<typeof networksBodySchema> | undefined
): string | undefined => {
  if (!networks) {
    return undefined
  }
  for (const v of Object.values(networks)) {
    const id = v.affiliate_id?.trim()
    if (id) {
      return id
    }
  }
  return undefined
}

/**
 * Replaces `@@@` in tracking URLs when `affiliate_id` is configured.
 * If `affiliate_id` is missing, returns the **raw** URL so the client can still show it alongside `directUrl`.
 */
export const normalizeAffiliateClickUrl = (url: string, affiliateId: string | undefined): string => {
  if (!URL.canParse(url)) {
    return url
  }
  if (!url.includes("@@@")) {
    return url
  }
  if (!affiliateId?.trim()) {
    console.info(
      "[ShopFriend] Affiliate URL contains @@@ but no affiliate_id; keeping raw tracked URL (use direct link for a working PDP)"
    )
    return url
  }
  const out = url.replaceAll("@@@", affiliateId.trim())
  if (!URL.canParse(out)) {
    return url
  }
  return out.includes("@@@") ? url : out
}

const formatPrice = (row: z.infer<typeof affiliateApiRowSchema>): string => {
  if (row.final_price === undefined || row.final_price === null) {
    return "—"
  }
  return typeof row.final_price === "number" ? String(row.final_price) : row.final_price
}

const mapRowToMatch = (
  row: z.infer<typeof affiliateApiRowSchema>,
  affiliateId: string | undefined
): AffiliateMatch | undefined => {
  const rawAffiliate = pickAffiliateTrackedUrl(row)
  const directUrl = pickDirectUrl(row)

  if (!rawAffiliate && !directUrl) {
    return undefined
  }

  const clickUrl = rawAffiliate ? normalizeAffiliateClickUrl(rawAffiliate, affiliateId) : directUrl!
  const directUrlOptional =
    rawAffiliate && directUrl && directUrl !== clickUrl ? directUrl : undefined

  const desc =
    typeof row.description === "string" && row.description.trim().length > 0
      ? row.description.trim().slice(0, 2000)
      : undefined
  const draft = {
    offerId: String(row.id),
    productName: row.name.slice(0, 500),
    description: desc,
    merchantName: (row.merchant?.name ?? "Unknown merchant").slice(0, 200),
    networkName: (row.network?.name ?? "Unknown network").slice(0, 200),
    priceDisplay: formatPrice(row).slice(0, 64),
    currency: row.currency?.slice(0, 16) ?? undefined,
    clickUrl,
    directUrl: directUrlOptional,
    imageUrl:
      typeof row.image_url === "string" && row.image_url.length > 0 && URL.canParse(row.image_url)
        ? row.image_url
        : undefined
  }
  const parsed = affiliateMatchSchema.safeParse(draft)
  return parsed.success ? parsed.data : undefined
}

export type AffiliateSearchResult = {
  matches?: AffiliateMatch[]
  limitation?: string
}

/**
 * Development toggle: temporarily disable same-retailer suppression so we can validate end-to-end
 * affiliate integrations even when alternative merchants are sparse.
 */
export const shouldFilterSameRetailerOffers = (): boolean => false

/** Future hook when same-retailer filtering is re-enabled. Intentionally not called for now. */
export const isSameRetailerOfferAsProduct = (
  productUrl: string,
  match: Pick<AffiliateMatch, "clickUrl" | "directUrl">
): boolean => isSameRegistrableDomainAsProduct(productUrl, match)

/**
 * Calls Affiliate.com Product API search. Returns matches and/or a limitation line on failure.
 * Skips entirely when API key or base URL is unset.
 */
export const searchAffiliateProducts = async (
  request: InsightRequest,
  signal: AbortSignal
): Promise<AffiliateSearchResult> => {
  const env = getServerEnv()
  const apiKey = env.AFFILIATE_NETWORKS_API_KEY?.trim()
  const baseUrl = env.AFFILIATE_NETWORKS_API_BASE_URL?.trim()
  if (!apiKey || !baseUrl) {
    return {}
  }

  const title = request.product.title.trim().slice(0, MAX_TITLE_LEN)
  if (!title) {
    return {}
  }

  const currency = resolveCurrency(request.product.locale)
  const networks = parseNetworksJson(env.AFFILIATE_NETWORKS_REQUEST_JSON)

  const affiliateId = firstAffiliateIdFromNetworks(networks)

  const body: Record<string, unknown> = {
    page: 1,
    per_page: PER_PAGE,
    sort_by: "final_price",
    sort_order: "asc",
    search: [
      { field: "name||description", value: title, operator: "LIKE" },
      { field: "currency", value: currency, operator: "=" }
    ]
  }
  if (networks) {
    body.networks = networks
  }

  try {
    const url = buildProductUrl(baseUrl)
    const response = await fetch(url, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      const msg = text ? `${response.status}: ${text.slice(0, 200)}` : String(response.status)
      console.warn("[ShopFriend] Affiliate product API error", msg)
      return {
        limitation: `Affiliate product search returned ${response.status}. Check AFFILIATE_NETWORKS_* env and request body.`
      }
    }

    const json: unknown = await response.json()
    const parsed = affiliateApiResponseSchema.safeParse(json)
    if (!parsed.success) {
      console.warn("[ShopFriend] Affiliate product API response shape unexpected")
      return {
        limitation: "Affiliate product search returned an unexpected response shape."
      }
    }

    const rawRows = parsed.data.data
    console.info(
      `[ShopFriend] Affiliate API raw products (${rawRows.length} row(s), unfiltered before map/cap)`,
      JSON.stringify(rawRows, null, 2)
    )

    const matches: AffiliateMatch[] = []
    for (const row of rawRows) {
      const mapped = mapRowToMatch(row, affiliateId)
      if (!mapped) {
        continue
      }
      matches.push(mapped)
      if (matches.length >= MAX_MATCHES_RETURNED) {
        break
      }
    }

    if (matches.length > 0) {
      return { matches: matches.slice(0, MAX_MATCHES_RETURNED) }
    }
    return {}
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    if ((error as Error)?.name === "AbortError") {
      return { limitation: "Affiliate product search aborted." }
    }
    console.warn("[ShopFriend] Affiliate product search failed", message)
    return {
      limitation: `Affiliate product search failed: ${message.slice(0, 200)}`
    }
  }
}
