import { describe, expect, it } from "vitest"
import { isSameRegistrableDomainAsProduct } from "./same-retail-domain"

describe("isSameRegistrableDomainAsProduct", () => {
  const amazonPdp = "https://www.amazon.com/dp/B09MQLP33J"

  it("returns true for www vs smile on same registrable domain", () => {
    expect(
      isSameRegistrableDomainAsProduct(amazonPdp, {
        directUrl: "https://smile.amazon.com/gp/product/B00OTHER",
        clickUrl: "https://track.example/out"
      })
    ).toBe(true)
  })

  it("returns false when direct targets a different retailer", () => {
    expect(
      isSameRegistrableDomainAsProduct(amazonPdp, {
        directUrl: "https://www.walmart.com/ip/Example/123",
        clickUrl: "https://track.example/out"
      })
    ).toBe(false)
  })

  it("uses clickUrl when directUrl is absent", () => {
    expect(
      isSameRegistrableDomainAsProduct(amazonPdp, {
        clickUrl: "https://www.amazon.com/gp/aw/d/B00OTHER",
        directUrl: undefined
      })
    ).toBe(true)
  })

  it("returns false for invalid product URL", () => {
    expect(
      isSameRegistrableDomainAsProduct("not-a-url", {
        clickUrl: "https://www.amazon.com/",
        directUrl: undefined
      })
    ).toBe(false)
  })
})
