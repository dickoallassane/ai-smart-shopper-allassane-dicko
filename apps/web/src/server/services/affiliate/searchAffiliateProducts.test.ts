import { describe, expect, it } from "vitest"
import { firstAffiliateIdFromNetworks, normalizeAffiliateClickUrl } from "./searchAffiliateProducts"

describe("normalizeAffiliateClickUrl", () => {
  it("replaces @@@ with affiliate_id when provided", () => {
    const out = normalizeAffiliateClickUrl(
      "https://goto.walmart.com/c/@@@/1279116/9383?u=https%3A%2F%2Fwww.walmart.com%2Fip%2Fx",
      "publisher-123"
    )
    expect(out).toBeDefined()
    expect(out).not.toContain("@@@")
    expect(out).toContain("publisher-123")
  })

  it("returns raw URL when @@@ present but no affiliate id (caller may pair with directUrl)", () => {
    const raw = "https://goto.walmart.com/c/@@@/1279116/9383"
    expect(normalizeAffiliateClickUrl(raw, undefined)).toBe(raw)
  })

  it("returns same URL when no placeholder", () => {
    const url = "https://example.com/track/abc"
    expect(normalizeAffiliateClickUrl(url, "ignored")).toBe(url)
  })
})

describe("firstAffiliateIdFromNetworks", () => {
  it("returns first affiliate_id from object values", () => {
    expect(
      firstAffiliateIdFromNetworks({
        "335": { affiliate_id: "aid-1", sub_id: "s1" },
        "812": { affiliate_id: "aid-2", sub_id: "s2" }
      })
    ).toBe("aid-1")
  })

  it("returns undefined for empty input", () => {
    expect(firstAffiliateIdFromNetworks(undefined)).toBeUndefined()
  })
})
