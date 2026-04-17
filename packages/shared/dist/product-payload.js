import { z } from 'zod';
/** Bounded on-page product context extracted from a retailer or service PDP. */
export const productPayloadSchema = z.object({
    /** Stable site id from extension config (e.g. `amazon`, `acme-store`) */
    retailer: z.string().min(1).max(64),
    locale: z.string().min(2).max(16).default('en-US'),
    url: z.string().url(),
    asin: z.string().min(8).max(16).optional(),
    title: z.string().min(1).max(500),
    displayedPrice: z.string().max(64).optional(),
    ratingSummary: z.string().max(200).optional(),
    reviewExcerpts: z.array(z.string().max(2000)).max(20).default([]),
    sellerFulfillment: z.string().max(500).optional(),
    extractedAt: z.string().datetime({ offset: true })
});
