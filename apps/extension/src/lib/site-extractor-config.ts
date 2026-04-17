import { z } from 'zod'

/** `chrome.storage.local` key for the JSON string of {@link SiteExtractorConfigFile} */
export const SITE_EXTRACTOR_CONFIG_JSON_KEY = 'siteExtractorConfigJson' as const

/** Side panel → background: re-run `registerContentScripts` after config save */
export const SITE_CONFIGS_UPDATED = 'SITE_CONFIGS_UPDATED' as const

const pathPatternSchema = z.object({
  name: z.string().min(1).max(64),
  regex: z.string().min(1),
  flags: z.string().max(8).optional()
})

const optionalSelectorRuleSchema = z.object({
  selector: z.string().min(1).max(512),
  waitUntilVisible: z.boolean().optional()
})

const titleSelectorsSchema = z.object({
  primary: z.string().min(1).max(512),
  fallback: z.string().min(1).max(512).optional(),
  waitUntilVisible: z.boolean().optional()
})

const reviewSnippetsSelectorsSchema = z.object({
  querySelectorAll: z.string().min(1).max(1024),
  maxItems: z.number().int().min(1).max(50).default(10),
  waitUntilVisible: z.boolean().optional()
})

const siteSelectorsSchema = z.object({
  title: titleSelectorsSchema,
  displayedPrice: optionalSelectorRuleSchema.optional(),
  ratingSummary: optionalSelectorRuleSchema.optional(),
  sellerFulfillment: optionalSelectorRuleSchema.optional(),
  reviewSnippets: reviewSnippetsSelectorsSchema.optional()
})

const productIdFromUrlSchema = z.object({
  regex: z.string().min(1),
  flags: z.string().max(8).optional(),
  group: z.number().int().min(1).max(9).default(1)
})

export const siteExtractorSiteSchema = z.object({
  id: z.string().min(1).max(64),
  isService: z.boolean().default(false),
  matchPatterns: z.array(z.string().min(1).max(512)).min(1),
  pdpPathPatterns: z.array(pathPatternSchema).min(1),
  productIdFromUrl: productIdFromUrlSchema.optional(),
  selectors: siteSelectorsSchema
})

export type SiteExtractorSite = z.infer<typeof siteExtractorSiteSchema>

export const siteExtractorConfigFileSchema = z.object({
  sites: z.array(siteExtractorSiteSchema).min(1)
})

export type SiteExtractorConfigFile = z.infer<typeof siteExtractorConfigFileSchema>

export const DEFAULT_SITE_EXTRACTOR_CONFIG: SiteExtractorConfigFile = {
  sites: [
    {
      id: 'amazon',
      isService: false,
      matchPatterns: ['https://www.amazon.com/*'],
      pdpPathPatterns: [
        { name: 'dp_asin', regex: '\\/dp\\/[A-Z0-9]{10}', flags: 'i' },
        { name: 'gp_product', regex: '\\/gp\\/product\\/', flags: 'i' }
      ],
      productIdFromUrl: {
        regex: '\\/dp\\/([A-Z0-9]{10})',
        flags: 'i',
        group: 1
      },
      selectors: {
        title: {
          primary: '#productTitle',
          fallback: 'h1.a-size-large'
        },
        displayedPrice: { selector: '.a-price .a-offscreen' },
        ratingSummary: { selector: '#acrPopover' },
        sellerFulfillment: { selector: '#merchant-info' },
        reviewSnippets: {
          querySelectorAll:
            '[data-hook="review-collapsed"] span, #reviewsMedley .review-text',
          maxItems: 10
        }
      }
    }
  ]
}

export const defaultSiteExtractorConfigJson = (): string =>
  JSON.stringify(DEFAULT_SITE_EXTRACTOR_CONFIG, null, 2)

export const parseSiteExtractorConfigJson = (
  raw: string | undefined | null
): { success: true; data: SiteExtractorConfigFile } | { success: false; error: string } => {
  if (raw === undefined || raw === null || raw.trim().length === 0) {
    return { success: false, error: 'Configuration is empty' }
  }
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(raw) as unknown
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid JSON'
    return { success: false, error: msg }
  }
  const result = siteExtractorConfigFileSchema.safeParse(parsedJson)
  if (!result.success) {
    return { success: false, error: result.error.flatten().formErrors.join('; ') }
  }
  return { success: true, data: result.data }
}
