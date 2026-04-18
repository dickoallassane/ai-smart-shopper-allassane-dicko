import { type InsightResponse } from '@shopfriend/shared'

/** Plain-text assistant reply for the side panel discussion thread */
export const formatInsightAsAssistantText = (insight: InsightResponse): string => {
  const blocks: string[] = []
  for (const card of insight.cards) {
    const bulletLines = card.bullets.map((b) => {
      const cite = b.citation ? `\n  “${b.citation.text}”` : ''
      return `• ${b.text}${cite}`
    })
    const overview =
      card.sourcesOverview && card.sourcesOverview.trim().length > 0
        ? `\n\n${card.sourcesOverview.trim()}`
        : ''
    blocks.push(`${card.title}\n${bulletLines.join('\n')}${overview}`)
  }
  if (insight.pricingRows && insight.pricingRows.length > 0) {
    const rows = insight.pricingRows.map((r) => `• ${r.label}: ${r.value} (${r.caveat})`)
    blocks.push(`Pricing\n${rows.join('\n')}`)
  }
  if (insight.limitations.length > 0) {
    blocks.push(`Notes\n${insight.limitations.map((l) => `• ${l}`).join('\n')}`)
  }
  blocks.push(`Request ${insight.requestId.slice(0, 8)}…`)
  return blocks.join('\n\n')
}
