# Spike: `chrome.action.openPopup` from passive navigation

## Context

Shape A considered opening the native extension popup from `tabs.onUpdated` / background timers when the URL matched a supported site.

## Goal

Document whether the native action popup can be opened without a direct user gesture in the extension UI.

## Questions

| # | Question |
|---|----------|
| **Q1** | Does `chrome.action.openPopup()` succeed when invoked from the service worker in a `tabs.onUpdated` listener (no user gesture)? |
| **Q2** | Is `chrome.action.openPopup` even defined in MV3 service workers when not in a user-gesture stack? |

## Findings (desk research)

- Chrome documents and community reports indicate **`chrome.action.openPopup()` requires user activation** and is intended for use from contexts tied to a user gesture (e.g. `onClicked`, keyboard command, or message handler that still carries activation).
- Calling it from passive navigation handlers is **expected to fail or no-op**, which matches Chrome’s broader user-activation model for disruptive UI.

## Acceptance

Spike is complete when we can describe that **automatic native popup on URL change is not a reliable supported path**, and that **Shape B (in-page overlay + click to open side panel)** is the viable approach.

## Conclusion

Do **not** rely on shape A for production. Prefer shape B unless Chrome changes platform rules.
