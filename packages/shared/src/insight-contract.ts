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

export const insightResponseSchema = z.object({
  version: z.literal('1'),
  requestId: z.string().uuid(),
  cards: z.array(insightCardSchema),
  pricingRows: z.array(pricingRowSchema).max(20).optional(),
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
