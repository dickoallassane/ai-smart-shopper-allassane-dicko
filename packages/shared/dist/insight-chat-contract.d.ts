import { z } from 'zod';
/** One summary bullet sent with chat context (mirrors UI, optional source index). */
export declare const chatSummaryBulletPayloadSchema: z.ZodObject<{
    text: z.ZodString;
    sourceIndex: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    text: string;
    sourceIndex?: number | undefined;
}, {
    text: string;
    sourceIndex?: number | undefined;
}>;
/** Bright Data Discover + optional discover-summary fields for LLM grounding. */
export declare const chatResearchContextSchema: z.ZodObject<{
    reviewDiscovery: z.ZodObject<{
        query: z.ZodString;
        intent: z.ZodOptional<z.ZodString>;
        results: z.ZodArray<z.ZodObject<{
            link: z.ZodString;
            title: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            relevanceScore: z.ZodOptional<z.ZodNumber>;
            content: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            link: string;
            title: string;
            description?: string | undefined;
            relevanceScore?: number | undefined;
            content?: string | undefined;
        }, {
            link: string;
            title: string;
            description?: string | undefined;
            relevanceScore?: number | undefined;
            content?: string | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        query: string;
        results: {
            link: string;
            title: string;
            description?: string | undefined;
            relevanceScore?: number | undefined;
            content?: string | undefined;
        }[];
        intent?: string | undefined;
    }, {
        query: string;
        results: {
            link: string;
            title: string;
            description?: string | undefined;
            relevanceScore?: number | undefined;
            content?: string | undefined;
        }[];
        intent?: string | undefined;
    }>;
    summaryBullets: z.ZodOptional<z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        sourceIndex: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        text: string;
        sourceIndex?: number | undefined;
    }, {
        text: string;
        sourceIndex?: number | undefined;
    }>, "many">>;
    summaryOverview: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reviewDiscovery: {
        query: string;
        results: {
            link: string;
            title: string;
            description?: string | undefined;
            relevanceScore?: number | undefined;
            content?: string | undefined;
        }[];
        intent?: string | undefined;
    };
    summaryBullets?: {
        text: string;
        sourceIndex?: number | undefined;
    }[] | undefined;
    summaryOverview?: string | undefined;
}, {
    reviewDiscovery: {
        query: string;
        results: {
            link: string;
            title: string;
            description?: string | undefined;
            relevanceScore?: number | undefined;
            content?: string | undefined;
        }[];
        intent?: string | undefined;
    };
    summaryBullets?: {
        text: string;
        sourceIndex?: number | undefined;
    }[] | undefined;
    summaryOverview?: string | undefined;
}>;
export type ChatResearchContext = z.infer<typeof chatResearchContextSchema>;
export declare const chatHistoryTurnSchema: z.ZodObject<{
    role: z.ZodEnum<["user", "assistant"]>;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    text: string;
    role: "user" | "assistant";
}, {
    text: string;
    role: "user" | "assistant";
}>;
export type ChatHistoryTurn = z.infer<typeof chatHistoryTurnSchema>;
export declare const chatTurnRequestSchema: z.ZodObject<{
    userMessage: z.ZodString;
    researchContext: z.ZodObject<{
        reviewDiscovery: z.ZodObject<{
            query: z.ZodString;
            intent: z.ZodOptional<z.ZodString>;
            results: z.ZodArray<z.ZodObject<{
                link: z.ZodString;
                title: z.ZodString;
                description: z.ZodOptional<z.ZodString>;
                relevanceScore: z.ZodOptional<z.ZodNumber>;
                content: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                link: string;
                title: string;
                description?: string | undefined;
                relevanceScore?: number | undefined;
                content?: string | undefined;
            }, {
                link: string;
                title: string;
                description?: string | undefined;
                relevanceScore?: number | undefined;
                content?: string | undefined;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            query: string;
            results: {
                link: string;
                title: string;
                description?: string | undefined;
                relevanceScore?: number | undefined;
                content?: string | undefined;
            }[];
            intent?: string | undefined;
        }, {
            query: string;
            results: {
                link: string;
                title: string;
                description?: string | undefined;
                relevanceScore?: number | undefined;
                content?: string | undefined;
            }[];
            intent?: string | undefined;
        }>;
        summaryBullets: z.ZodOptional<z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            sourceIndex: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            text: string;
            sourceIndex?: number | undefined;
        }, {
            text: string;
            sourceIndex?: number | undefined;
        }>, "many">>;
        summaryOverview: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        reviewDiscovery: {
            query: string;
            results: {
                link: string;
                title: string;
                description?: string | undefined;
                relevanceScore?: number | undefined;
                content?: string | undefined;
            }[];
            intent?: string | undefined;
        };
        summaryBullets?: {
            text: string;
            sourceIndex?: number | undefined;
        }[] | undefined;
        summaryOverview?: string | undefined;
    }, {
        reviewDiscovery: {
            query: string;
            results: {
                link: string;
                title: string;
                description?: string | undefined;
                relevanceScore?: number | undefined;
                content?: string | undefined;
            }[];
            intent?: string | undefined;
        };
        summaryBullets?: {
            text: string;
            sourceIndex?: number | undefined;
        }[] | undefined;
        summaryOverview?: string | undefined;
    }>;
    history: z.ZodOptional<z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<["user", "assistant"]>;
        text: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        text: string;
        role: "user" | "assistant";
    }, {
        text: string;
        role: "user" | "assistant";
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    userMessage: string;
    researchContext: {
        reviewDiscovery: {
            query: string;
            results: {
                link: string;
                title: string;
                description?: string | undefined;
                relevanceScore?: number | undefined;
                content?: string | undefined;
            }[];
            intent?: string | undefined;
        };
        summaryBullets?: {
            text: string;
            sourceIndex?: number | undefined;
        }[] | undefined;
        summaryOverview?: string | undefined;
    };
    history?: {
        text: string;
        role: "user" | "assistant";
    }[] | undefined;
}, {
    userMessage: string;
    researchContext: {
        reviewDiscovery: {
            query: string;
            results: {
                link: string;
                title: string;
                description?: string | undefined;
                relevanceScore?: number | undefined;
                content?: string | undefined;
            }[];
            intent?: string | undefined;
        };
        summaryBullets?: {
            text: string;
            sourceIndex?: number | undefined;
        }[] | undefined;
        summaryOverview?: string | undefined;
    };
    history?: {
        text: string;
        role: "user" | "assistant";
    }[] | undefined;
}>;
export type ChatTurnRequest = z.infer<typeof chatTurnRequestSchema>;
export declare const chatTurnResponseSchema: z.ZodObject<{
    reply: z.ZodString;
    requestId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reply: string;
    requestId: string;
}, {
    reply: string;
    requestId: string;
}>;
export type ChatTurnResponse = z.infer<typeof chatTurnResponseSchema>;
/** Parsed OpenRouter JSON body for chat completions. */
export declare const chatReplyFromModelSchema: z.ZodObject<{
    reply: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reply: string;
}, {
    reply: string;
}>;
export type ChatReplyFromModel = z.infer<typeof chatReplyFromModelSchema>;
//# sourceMappingURL=insight-chat-contract.d.ts.map