import { describe, expect, it } from "vitest";
import { productPayloadSchema } from "./product-payload";
const validBase = {
    retailer: "amazon",
    locale: "en-US",
    url: "https://www.amazon.com/dp/B0DZZWMB2L",
    title: "Example product title",
    extractedAt: "2026-04-15T12:00:00.000Z"
};
describe("productPayloadSchema", () => {
    it("parses a minimal valid Amazon payload", () => {
        const parsed = productPayloadSchema.parse(validBase);
        expect(parsed.retailer).toBe("amazon");
        expect(parsed.reviewExcerpts).toEqual([]);
    });
    it("parses optional fields when present", () => {
        const parsed = productPayloadSchema.parse({
            ...validBase,
            asin: "B0DZZWMB2L",
            displayedPrice: "$99.00",
            ratingSummary: "4.5 out of 5",
            reviewExcerpts: ["Great buy"],
            sellerFulfillment: "Ships from Amazon"
        });
        expect(parsed.asin).toBe("B0DZZWMB2L");
        expect(parsed.reviewExcerpts).toHaveLength(1);
    });
    it("rejects non-Amazon retailer", () => {
        expect(() => productPayloadSchema.parse({
            ...validBase,
            retailer: "ebay"
        })).toThrow();
    });
    it("rejects invalid URL", () => {
        expect(() => productPayloadSchema.parse({
            ...validBase,
            url: "not-a-url"
        })).toThrow();
    });
    it("rejects empty title", () => {
        expect(() => productPayloadSchema.parse({
            ...validBase,
            title: ""
        })).toThrow();
    });
    it("rejects title longer than 500 characters", () => {
        expect(() => productPayloadSchema.parse({
            ...validBase,
            title: "x".repeat(501)
        })).toThrow();
    });
    it("rejects more than 20 review excerpts", () => {
        expect(() => productPayloadSchema.parse({
            ...validBase,
            reviewExcerpts: Array.from({ length: 21 }, () => "short")
        })).toThrow();
    });
    it("rejects invalid extractedAt datetime", () => {
        expect(() => productPayloadSchema.parse({
            ...validBase,
            extractedAt: "not-a-date"
        })).toThrow();
    });
});
