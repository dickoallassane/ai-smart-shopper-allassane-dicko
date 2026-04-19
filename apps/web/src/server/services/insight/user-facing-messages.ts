/**
 * Copy shown in insight `limitations`, cards, and API error bodies — no vendor or infra names.
 */

export const RESEARCH_DISCLAIMER_CARD_TITLE = "Web research"

export const NETWORK_RESEARCH_POST_FAILED = "Network error: could not start web research."
export const NETWORK_RESEARCH_POLL_FAILED = "Network error: could not refresh web research results."

export const WEB_RESEARCH_NOT_CONFIGURED = "Web research is not configured on this server."

export const SERVER_RESEARCH_AUTH_FAILED =
  "Server error: research authentication failed. Contact support if this continues."

export const SERVER_FEATURE_NOT_AVAILABLE =
  "This feature is not available for your account. Contact support if you expected access."

export const SERVER_RATE_LIMITED = "Too many requests. Try again in a few minutes."

export const serverResearchBadRequest = (detail: string): string => {
  const d = detail.trim().slice(0, 200)
  return d.length > 0
    ? `Server error: could not complete this request (${d})`.slice(0, 500)
    : "Server error: could not complete this request."
}

export const serverResearchUpstream = (status: number, detail: string): string => {
  const d = detail.trim().slice(0, 200)
  return d.length > 0
    ? `Server error while loading web research (${status}): ${d}`.slice(0, 500)
    : `Server error while loading web research (${status}).`.slice(0, 500)
}

export const RESEARCH_POLL_TIMED_OUT = "Network or server busy: web research did not finish in time."
export const SERVER_RESEARCH_UNEXPECTED_START = "Server error: unexpected response while starting web research."
export const SERVER_RESEARCH_INCOMPLETE_START = "Server error: incomplete response while starting web research."
export const SERVER_RESEARCH_UNEXPECTED_POLL = "Server error: unexpected response while loading web research."

export const WEB_RESEARCH_UNKNOWN_FAILURE = "Something went wrong while loading web research."
export const WEB_RESEARCH_CANCELLED_OR_TIMED_OUT = "Web research was cancelled or timed out."

export const OPENWEB_ADVICE_DISCLAIMER =
  "Third-party opinions from the open web only — not financial, legal, or medical advice."

/** Route maps this `Error.message` to a generic HTTP body (no env var names leak). */
export const CHAT_ASSISTANT_UNAVAILABLE_CODE = "INSIGHT_CHAT_ASSISTANT_UNAVAILABLE"
export const CHAT_BAD_RESPONSE_CODE = "INSIGHT_CHAT_BAD_RESPONSE"
export const CHAT_INVALID_RESEARCH_CONTEXT_CODE = "INSIGHT_CHAT_INVALID_RESEARCH_CONTEXT"

export const CHAT_ASSISTANT_UNAVAILABLE_BODY = "Assistant is temporarily unavailable."
export const CHAT_BAD_RESPONSE_BODY = "Server error: could not complete chat."
export const CHAT_INVALID_RESEARCH_BODY = "Chat needs web research results first."

export const PRICE_SUMMARY_DISABLED =
  "Summaries are turned off for this request. Turn on summaries in settings for richer cards."

export const PRICE_SUMMARY_DISABLED_LIMITATION = "Summaries are disabled for this request."

export const PRICE_STUB_CONFIGURE_SERVER =
  "Ask your admin to enable the summary service on the server for live commentary."

export const PRICE_STUB_PLACEHOLDER_RETURNS = "Use retailer link-out in product UI; this card is a placeholder."

export const PRICE_STUB_LIMITATIONS = [
  "Showing placeholder cards until the summary service is configured.",
  "Always cite on-page excerpts when live summaries are enabled."
] as const

export const PRICE_MISSING_KEY_LIMITATION = "Summary service is not configured; showing placeholder output."

export const PRICE_JSON_VALIDATION_FAILED = "Server error: summary response did not match the expected format."

export const priceSummaryRuntime = (detail: string): string =>
  `Server error while generating summary: ${detail.slice(0, 200)}`.slice(0, 500)

export const REVIEW_SYNTH_KEY_MISSING = "Summary service is not configured; web summary was skipped."

export const REVIEW_SYNTH_ABORTED = "Web summary skipped: request was cancelled."

export const REVIEW_SYNTH_VALIDATION_FAILED =
  "Server error: summary response did not match the expected format after several tries. Listed sources are unchanged."

export const REVIEW_SYNTH_CARD_SCHEMA_FAILED =
  "Server error: could not build the summary card after several tries. Showing sources only."

export const REVIEW_SYNTH_RUNTIME_FAILED =
  "Web summary is unavailable after several tries. Please try again or check your connection."
