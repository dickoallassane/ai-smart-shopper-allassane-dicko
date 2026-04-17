import { DEFAULT_SITE_EXTRACTOR_CONFIG } from './site-extractor-config'
import {
  buildProductPayloadFromConfig,
  isSiteHostAndPdp,
  type SiteLocation
} from './build-product-payload-from-config'

const amazonSite = DEFAULT_SITE_EXTRACTOR_CONFIG.sites[0]

export type AmazonLocation = SiteLocation

export const isLikelyAmazonPdp = (
  location: Pick<Location, 'hostname' | 'pathname' | 'href'>
): boolean =>
  isSiteHostAndPdp(location, amazonSite)

export const buildAmazonProductPayload = async (
  document: Document,
  location: AmazonLocation,
  pageTitle: string
) => buildProductPayloadFromConfig(document, location, pageTitle, amazonSite)
