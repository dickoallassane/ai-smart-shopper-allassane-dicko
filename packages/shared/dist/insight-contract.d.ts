import { z } from 'zod';
export declare const insightFlagsSchema: z.ZodObject<{
    llmEnabled: z.ZodBoolean;
    pricingBetaEnabled: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    llmEnabled: boolean;
    pricingBetaEnabled: boolean;
}, {
    llmEnabled: boolean;
    pricingBetaEnabled: boolean;
}>;
export type InsightFlags = z.infer<typeof insightFlagsSchema>;
export declare const insightRequestSchema: z.ZodObject<{
    product: z.ZodObject<{
        retailer: z.ZodLiteral<"amazon">;
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
        retailer: "amazon";
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
        retailer: "amazon";
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
    flags: z.ZodObject<{
        llmEnabled: z.ZodBoolean;
        pricingBetaEnabled: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        llmEnabled: boolean;
        pricingBetaEnabled: boolean;
    }, {
        llmEnabled: boolean;
        pricingBetaEnabled: boolean;
    }>;
}, "strip", z.ZodTypeAny, {
    product: {
        retailer: "amazon";
        locale: string;
        url: string;
        title: string;
        reviewExcerpts: string[];
        extractedAt: string;
        asin?: string | undefined;
        displayedPrice?: string | undefined;
        ratingSummary?: string | undefined;
        sellerFulfillment?: string | undefined;
    };
    flags: {
        llmEnabled: boolean;
        pricingBetaEnabled: boolean;
    };
}, {
    product: {
        retailer: "amazon";
        url: string;
        title: string;
        extractedAt: string;
        locale?: string | undefined;
        asin?: string | undefined;
        displayedPrice?: string | undefined;
        ratingSummary?: string | undefined;
        reviewExcerpts?: string[] | undefined;
        sellerFulfillment?: string | undefined;
    };
    flags: {
        llmEnabled: boolean;
        pricingBetaEnabled: boolean;
    };
}>;
export type InsightRequest = z.infer<typeof insightRequestSchema>;
export declare const citationSchema: z.ZodObject<{
    text: z.ZodString;
    anchorHint: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    text: string;
    anchorHint?: string | undefined;
}, {
    text: string;
    anchorHint?: string | undefined;
}>;
export declare const insightBulletSchema: z.ZodObject<{
    text: z.ZodString;
    citation: z.ZodOptional<z.ZodObject<{
        text: z.ZodString;
        anchorHint: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        text: string;
        anchorHint?: string | undefined;
    }, {
        text: string;
        anchorHint?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    text: string;
    citation?: {
        text: string;
        anchorHint?: string | undefined;
    } | undefined;
}, {
    text: string;
    citation?: {
        text: string;
        anchorHint?: string | undefined;
    } | undefined;
}>;
export declare const insightCardSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodEnum<["reality_check", "returns", "review_themes", "reputation", "pricing_beta"]>;
    title: z.ZodString;
    bullets: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        citation: z.ZodOptional<z.ZodObject<{
            text: z.ZodString;
            anchorHint: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            text: string;
            anchorHint?: string | undefined;
        }, {
            text: string;
            anchorHint?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        text: string;
        citation?: {
            text: string;
            anchorHint?: string | undefined;
        } | undefined;
    }, {
        text: string;
        citation?: {
            text: string;
            anchorHint?: string | undefined;
        } | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    title: string;
    id: string;
    kind: "reality_check" | "returns" | "review_themes" | "reputation" | "pricing_beta";
    bullets: {
        text: string;
        citation?: {
            text: string;
            anchorHint?: string | undefined;
        } | undefined;
    }[];
}, {
    title: string;
    id: string;
    kind: "reality_check" | "returns" | "review_themes" | "reputation" | "pricing_beta";
    bullets: {
        text: string;
        citation?: {
            text: string;
            anchorHint?: string | undefined;
        } | undefined;
    }[];
}>;
export declare const pricingRowSchema: z.ZodObject<{
    label: z.ZodString;
    value: z.ZodString;
    sourceUrl: z.ZodString;
    fetchedAt: z.ZodString;
    caveat: z.ZodString;
}, "strip", z.ZodTypeAny, {
    value: string;
    label: string;
    sourceUrl: string;
    fetchedAt: string;
    caveat: string;
}, {
    value: string;
    label: string;
    sourceUrl: string;
    fetchedAt: string;
    caveat: string;
}>;
/** Normalized Affiliate.com (or compatible) product row for UI / extension text */
export declare const affiliateMatchSchema: z.ZodObject<{
    offerId: z.ZodString;
    productName: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    merchantName: z.ZodString;
    networkName: z.ZodString;
    priceDisplay: z.ZodString;
    currency: z.ZodOptional<z.ZodString>;
    /** Tracked / affiliate chain URL (may still contain `@@@` if publisher id is not configured) */
    clickUrl: z.ZodString;
    /** Retailer product page when API provides it (second option when commission link is uncertain) */
    directUrl: z.ZodOptional<z.ZodString>;
    imageUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    offerId: string;
    productName: string;
    merchantName: string;
    networkName: string;
    priceDisplay: string;
    clickUrl: string;
    description?: string | undefined;
    currency?: string | undefined;
    directUrl?: string | undefined;
    imageUrl?: string | undefined;
}, {
    offerId: string;
    productName: string;
    merchantName: string;
    networkName: string;
    priceDisplay: string;
    clickUrl: string;
    description?: string | undefined;
    currency?: string | undefined;
    directUrl?: string | undefined;
    imageUrl?: string | undefined;
}>;
export type AffiliateMatch = z.infer<typeof affiliateMatchSchema>;
export declare const insightResponseSchema: z.ZodObject<{
    version: z.ZodLiteral<"1">;
    requestId: z.ZodString;
    cards: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodEnum<["reality_check", "returns", "review_themes", "reputation", "pricing_beta"]>;
        title: z.ZodString;
        bullets: z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            citation: z.ZodOptional<z.ZodObject<{
                text: z.ZodString;
                anchorHint: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                text: string;
                anchorHint?: string | undefined;
            }, {
                text: string;
                anchorHint?: string | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            text: string;
            citation?: {
                text: string;
                anchorHint?: string | undefined;
            } | undefined;
        }, {
            text: string;
            citation?: {
                text: string;
                anchorHint?: string | undefined;
            } | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        title: string;
        id: string;
        kind: "reality_check" | "returns" | "review_themes" | "reputation" | "pricing_beta";
        bullets: {
            text: string;
            citation?: {
                text: string;
                anchorHint?: string | undefined;
            } | undefined;
        }[];
    }, {
        title: string;
        id: string;
        kind: "reality_check" | "returns" | "review_themes" | "reputation" | "pricing_beta";
        bullets: {
            text: string;
            citation?: {
                text: string;
                anchorHint?: string | undefined;
            } | undefined;
        }[];
    }>, "many">;
    pricingRows: z.ZodOptional<z.ZodArray<z.ZodObject<{
        label: z.ZodString;
        value: z.ZodString;
        sourceUrl: z.ZodString;
        fetchedAt: z.ZodString;
        caveat: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        value: string;
        label: string;
        sourceUrl: string;
        fetchedAt: string;
        caveat: string;
    }, {
        value: string;
        label: string;
        sourceUrl: string;
        fetchedAt: string;
        caveat: string;
    }>, "many">>;
    affiliateMatches: z.ZodOptional<z.ZodArray<z.ZodObject<{
        offerId: z.ZodString;
        productName: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        merchantName: z.ZodString;
        networkName: z.ZodString;
        priceDisplay: z.ZodString;
        currency: z.ZodOptional<z.ZodString>;
        /** Tracked / affiliate chain URL (may still contain `@@@` if publisher id is not configured) */
        clickUrl: z.ZodString;
        /** Retailer product page when API provides it (second option when commission link is uncertain) */
        directUrl: z.ZodOptional<z.ZodString>;
        imageUrl: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        offerId: string;
        productName: string;
        merchantName: string;
        networkName: string;
        priceDisplay: string;
        clickUrl: string;
        description?: string | undefined;
        currency?: string | undefined;
        directUrl?: string | undefined;
        imageUrl?: string | undefined;
    }, {
        offerId: string;
        productName: string;
        merchantName: string;
        networkName: string;
        priceDisplay: string;
        clickUrl: string;
        description?: string | undefined;
        currency?: string | undefined;
        directUrl?: string | undefined;
        imageUrl?: string | undefined;
    }>, "many">>;
    limitations: z.ZodArray<z.ZodString, "many">;
    generatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    version: "1";
    requestId: string;
    cards: {
        title: string;
        id: string;
        kind: "reality_check" | "returns" | "review_themes" | "reputation" | "pricing_beta";
        bullets: {
            text: string;
            citation?: {
                text: string;
                anchorHint?: string | undefined;
            } | undefined;
        }[];
    }[];
    limitations: string[];
    generatedAt: string;
    pricingRows?: {
        value: string;
        label: string;
        sourceUrl: string;
        fetchedAt: string;
        caveat: string;
    }[] | undefined;
    affiliateMatches?: {
        offerId: string;
        productName: string;
        merchantName: string;
        networkName: string;
        priceDisplay: string;
        clickUrl: string;
        description?: string | undefined;
        currency?: string | undefined;
        directUrl?: string | undefined;
        imageUrl?: string | undefined;
    }[] | undefined;
}, {
    version: "1";
    requestId: string;
    cards: {
        title: string;
        id: string;
        kind: "reality_check" | "returns" | "review_themes" | "reputation" | "pricing_beta";
        bullets: {
            text: string;
            citation?: {
                text: string;
                anchorHint?: string | undefined;
            } | undefined;
        }[];
    }[];
    limitations: string[];
    generatedAt: string;
    pricingRows?: {
        value: string;
        label: string;
        sourceUrl: string;
        fetchedAt: string;
        caveat: string;
    }[] | undefined;
    affiliateMatches?: {
        offerId: string;
        productName: string;
        merchantName: string;
        networkName: string;
        priceDisplay: string;
        clickUrl: string;
        description?: string | undefined;
        currency?: string | undefined;
        directUrl?: string | undefined;
        imageUrl?: string | undefined;
    }[] | undefined;
}>;
export type InsightResponse = z.infer<typeof insightResponseSchema>;
export declare const insightErrorBodySchema: z.ZodObject<{
    error: z.ZodString;
    code: z.ZodDefault<z.ZodEnum<["BAD_REQUEST", "UNAUTHORIZED", "TIMEOUT", "UPSTREAM", "INTERNAL"]>>;
    requestId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code: "BAD_REQUEST" | "UNAUTHORIZED" | "TIMEOUT" | "UPSTREAM" | "INTERNAL";
    error: string;
    requestId?: string | undefined;
}, {
    error: string;
    code?: "BAD_REQUEST" | "UNAUTHORIZED" | "TIMEOUT" | "UPSTREAM" | "INTERNAL" | undefined;
    requestId?: string | undefined;
}>;
export type InsightErrorBody = z.infer<typeof insightErrorBodySchema>;
//# sourceMappingURL=insight-contract.d.ts.map