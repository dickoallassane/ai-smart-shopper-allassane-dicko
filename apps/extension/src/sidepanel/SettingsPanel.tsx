import { useCallback, useEffect, useState } from 'react'
import {
  AUTO_SURFACE_GLOBALLY_DISABLED_KEY,
  defaultSiteExtractorConfigJson,
  parseSiteExtractorConfigJson,
  SITE_CONFIGS_UPDATED,
  SITE_EXTRACTOR_CONFIG_JSON_KEY
} from '../lib/site-extractor-config'

type SettingsPanelProps = {
  onBack: () => void
}

export const SettingsPanel = ({ onBack }: SettingsPanelProps) => {
  const [jsonText, setJsonText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [autoSurfaceDisabled, setAutoSurfaceDisabled] = useState(false)

  useEffect(() => {
    const load = async () => {
      const stored = await chrome.storage.local.get([
        SITE_EXTRACTOR_CONFIG_JSON_KEY,
        AUTO_SURFACE_GLOBALLY_DISABLED_KEY,
      ])
      const raw = stored[SITE_EXTRACTOR_CONFIG_JSON_KEY]
      if (typeof raw === 'string' && raw.trim().length > 0) {
        setJsonText(raw)
      } else {
        setJsonText(defaultSiteExtractorConfigJson())
      }
      setAutoSurfaceDisabled(stored[AUTO_SURFACE_GLOBALLY_DISABLED_KEY] === true)
    }
    void load()
  }, [])

  const handleToggleAutoSurfaceDisabled = useCallback(async () => {
    const next = !autoSurfaceDisabled
    setAutoSurfaceDisabled(next)
    await chrome.storage.local.set({ [AUTO_SURFACE_GLOBALLY_DISABLED_KEY]: next })
  }, [autoSurfaceDisabled])

  const handleSave = useCallback(async () => {
    const parsed = parseSiteExtractorConfigJson(jsonText)
    if (!parsed.success) {
      setError(parsed.error)
      setSavedMessage(null)
      return
    }
    setError(null)
    const origins = parsed.data.sites.flatMap((s) => s.matchPatterns)
    try {
      await chrome.permissions.request({ origins })
    } catch {
      /* user may deny optional host access; registerContentScripts may still work for already-granted hosts */
    }
    await chrome.storage.local.set({ [SITE_EXTRACTOR_CONFIG_JSON_KEY]: jsonText.trim() })
    try {
      await chrome.runtime.sendMessage({ type: SITE_CONFIGS_UPDATED })
    } catch {
      /* service worker may be restarting */
    }
    setSavedMessage(
      'Saved. New hosts may need optional permission: try a page on that domain, then save again if injection fails.'
    )
  }, [jsonText])

  const handleValidate = useCallback(() => {
    const parsed = parseSiteExtractorConfigJson(jsonText)
    if (!parsed.success) {
      setError(parsed.error)
      setSavedMessage(null)
      return
    }
    setError(null)
    setSavedMessage('JSON is valid.')
  }, [jsonText])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="sf-font-display m-0 text-base font-bold text-sf-secondary-dark">Site extractors</h2>
          <button
            type="button"
            className="sf-btn-secondary px-3 py-1.5 text-xs"
            onClick={onBack}
            aria-label="Back to discussion"
          >
            Back
          </button>
        </div>
        <p className="sf-text-muted m-0 text-sm">
          Edit the JSON list of sites (match patterns, PDP regexes, selectors,{' '}
          <code className="rounded bg-sf-surface-container-highest px-1">waitUntilVisible</code>,{' '}
          <code className="rounded bg-sf-surface-container-highest px-1">isService</code>,{' '}
          <code className="rounded bg-sf-surface-container-highest px-1">autoSurface</code>). Stored in{' '}
          <code className="rounded bg-sf-surface-container-highest px-1">chrome.storage.local</code> as POC
          database.
        </p>
        <div className="flex items-start gap-2 rounded-xl border border-sf-outline/20 bg-sf-surface-container-highest px-3 py-2">
          <input
            id="sf-auto-surface-disabled"
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0"
            checked={autoSurfaceDisabled}
            onChange={() => void handleToggleAutoSurfaceDisabled()}
            aria-describedby="sf-auto-surface-disabled-help"
          />
          <div className="min-w-0 flex-1">
            <label htmlFor="sf-auto-surface-disabled" className="m-0 cursor-pointer text-sm font-medium text-sf-on-surface">
              Disable in-page ShopFriend prompts
            </label>
            <p id="sf-auto-surface-disabled-help" className="sf-text-muted m-0 mt-0.5 text-xs">
              When checked, the small on-page card (on supported sites with{' '}
              <code className="rounded bg-sf-surface px-1">autoSurface</code>) will not appear.
            </p>
          </div>
        </div>
        <label htmlFor="sf-site-config-json" className="sr-only">
          Site extractor configuration JSON
        </label>
        <textarea
          id="sf-site-config-json"
          value={jsonText}
          onChange={(e) => {
            setJsonText(e.target.value)
            setSavedMessage(null)
            setError(null)
          }}
          spellCheck={false}
          rows={18}
          className="font-mono min-h-[280px] w-full resize-y rounded-xl border border-sf-outline/20 bg-sf-surface-container-highest px-3 py-2 text-xs text-sf-on-surface"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'sf-site-config-error' : undefined}
        />
        {error ? (
          <p id="sf-site-config-error" className="m-0 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        {savedMessage ? (
          <p className="m-0 text-sm text-sf-secondary-dark" role="status">
            {savedMessage}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="sf-btn-secondary px-3 py-1.5 text-sm" onClick={() => void handleValidate()}>
            Validate
          </button>
          <button type="button" className="sf-btn-primary px-3 py-1.5 text-sm" onClick={() => void handleSave()}>
            Save &amp; register
          </button>
        </div>
      </div>
    </div>
  )
}
