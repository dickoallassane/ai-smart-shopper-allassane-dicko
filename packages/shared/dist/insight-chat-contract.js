import { z } from 'zod';
import { reviewDiscoverySchema } from './insight-contract';
/** One summary bullet sent with chat context (mirrors UI, optional source index). */
export const chatSummaryBulletPayloadSchema = z.object({
    text: z.string().max(1000),
    sourceIndex: z.number().int().min(0).max(9).optional()
});
/** Bright Data Discover + optional discover-summary fields for LLM grounding. */
export const chatResearchContextSchema = z.object({
    reviewDiscovery: reviewDiscoverySchema,
    summaryBullets: z.array(chatSummaryBulletPayloadSchema).max(12).optional(),
    summaryOverview: z.string().max(1200).optional()
});
export const chatHistoryTurnSchema = z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string().max(4000)
});
export const chatTurnRequestSchema = z.object({
    userMessage: z.string().min(1).max(4000),
    researchContext: chatResearchContextSchema,
    history: z.array(chatHistoryTurnSchema).max(20).optional()
});
export const chatTurnResponseSchema = z.object({
    reply: z.string().max(8000),
    requestId: z.string().uuid()
});
/** Parsed OpenRouter JSON body for chat completions. */
export const chatReplyFromModelSchema = z.object({
    reply: z.string().min(1).max(8000)
});
