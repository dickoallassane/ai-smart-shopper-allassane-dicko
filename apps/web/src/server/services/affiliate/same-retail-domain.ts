import { getDomain } from "tldts"
import type { AffiliateMatch } from "@shopfriend/shared"

/**
 * True when the offer’s landing URL (prefer `directUrl`, else `clickUrl`) is on the same
 * registrable domain (eTLD+1) as the current product PDP — e.g. `www.amazon.com` vs `smile.amazon.com`.
 */
export const isSameRegistrableDomainAsProduct = (
  productUrl: string,
  match: Pick<AffiliateMatch, "clickUrl" | "directUrl">
): boolean => {
  if (!URL.canParse(productUrl)) {
    return false
  }

  const offerUrl = match.directUrl ?? match.clickUrl
  const productDomain = getDomain(productUrl)
  const offerDomain = getDomain(offerUrl)
  if (productDomain === null || offerDomain === null) {
    return false
  }
  return productDomain === offerDomain
}
