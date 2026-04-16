import { z } from 'zod'
import { productPayloadSchema } from './product-payload'

export const insightFlagsSchema = z.object({
  llmEnabled: z.boolean(),
  pricingBetaEnabled: z.boolean()
})

export type InsightFlags = z.infer<typeof insightFlagsSchema>

export const insightRequestSchema = z.object({
  product: productPayloadSchema,
  flags: insightFlagsSchema
})

export type InsightRequest = z.infer<typeof insightRequestSchema>

export const citationSchema = z.object({
  text: z.string().max(2000),
  anchorHint: z.string().max(256).optional()
})

export const insightBulletSchema = z.object({
  text: z.string().max(1000),
  citation: citationSchema.optional()
})

export const insightCardSchema = z.object({
  id: z.string().max(64),
  kind: z.enum(['reality_check', 'returns', 'review_themes', 'reputation', 'pricing_beta']),
  title: z.string().max(200),
  bullets: z.array(insightBulletSchema).max(24)
})

export const pricingRowSchema = z.object({
  label: z.string().max(120),
  value: z.string().max(120),
  sourceUrl: z.string().url(),
  fetchedAt: z.string().datetime({ offset: true }),
  caveat: z.string().max(500)
})

/** Normalized Affiliate.com (or compatible) product row for UI / extension text */
export const affiliateMatchSchema = z.object({
  offerId: z.string().max(128),
  productName: z.string().max(500),
  description: z.string().max(2000).optional(),
  merchantName: z.string().max(200),
  networkName: z.string().max(200),
  priceDisplay: z.string().max(64),
  currency: z.string().max(16).optional(),
  /** Tracked / affiliate chain URL (may still contain `@@@` if publisher id is not configured) */
  clickUrl: z.string().url(),
  /** Retailer product page when API provides it (second option when commission link is uncertain) */
  directUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional()
})

export type AffiliateMatch = z.infer<typeof affiliateMatchSchema>

export const insightResponseSchema = z.object({
  version: z.literal('1'),
  requestId: z.string().uuid(),
  cards: z.array(insightCardSchema),
  pricingRows: z.array(pricingRowSchema).max(20).optional(),
  affiliateMatches: z.array(affiliateMatchSchema).max(15).optional(),
  limitations: z.array(z.string().max(500)).max(32),
  generatedAt: z.string().datetime({ offset: true })
})

export type InsightResponse = z.infer<typeof insightResponseSchema>

export const insightErrorBodySchema = z.object({
  error: z.string(),
  code: z.enum(['BAD_REQUEST', 'UNAUTHORIZED', 'TIMEOUT', 'UPSTREAM', 'INTERNAL']).default('INTERNAL'),
  requestId: z.string().uuid().optional()
})

export type InsightErrorBody = z.infer<typeof insightErrorBodySchema>
