import { z } from 'zod';
/** Bounded on-page product context extracted from a retailer or service PDP. */
export declare const productPayloadSchema: z.ZodObject<{
    /** Stable site id from extension config (e.g. `amazon`, `acme-store`) */
    retailer: z.ZodString;
    locale: z.ZodDefault<z.ZodString>;
    url: z.ZodString;
    asin: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    displayedPrice: z.ZodOptional<z.ZodString>;
    ratingSummary: z.ZodOptional<z.ZodString>;
    reviewExcerpts: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    sellerFulfillment: z.ZodOptional<z.ZodString>;
    extractedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    retailer: string;
    locale: string;
    url: string;
    title: string;
    reviewExcerpts: string[];
    extractedAt: string;
    asin?: string | undefined;
    displayedPrice?: string | undefined;
    ratingSummary?: string | undefined;
    sellerFulfillment?: string | undefined;
}, {
    retailer: string;
    url: string;
    title: string;
    extractedAt: string;
    locale?: string | undefined;
    asin?: string | undefined;
    displayedPrice?: string | undefined;
    ratingSummary?: string | undefined;
    reviewExcerpts?: string[] | undefined;
    sellerFulfillment?: string | undefined;
}>;
export type ProductPayload = z.infer<typeof productPayloadSchema>;
//# sourceMappingURL=product-payload.d.ts.map