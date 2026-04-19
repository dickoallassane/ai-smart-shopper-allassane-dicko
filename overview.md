# ShopFriend — Project overview

This document summarizes what was delivered for the **Smart Shopper** course brief, how the system works today, and how someone would actually use it.

## Brief and scope

- **Chosen brief:** [requirements/brief.requirement.md](requirements/brief.requirement.md) — *Smart Shopper*: a Chrome companion that detects product context and surfaces decision support (price pointers, review judgment, pros/cons, etc.) without replacing the user’s own verification.
- **What we built:** A **Chrome MV3 extension** plus a **Next.js App Router backend-for-frontend (BFF)**. **BFF** means the browser never talks to OpenAI, Bright Data, or affiliate APIs directly. The extension sends a small, bounded **product payload** to our Next.js routes (`POST /api/insight` and `POST /api/insight/chat`); the server holds API keys, calls vendors and models as needed, and returns structured JSON the UI can render. That keeps secrets off the user’s machine and gives one place to change behavior or add safeguards.
- **Surfaces:** The extension extracts the payload from supported pages (Amazon first; more domains can be added via storage). It shows **insights, disclosures, and controls** in Chrome’s **side panel** and in an **in-page shadow-root panel** (the compact card on the product page). **Auto-surface** can open that card when the URL and domain match your rules, until the user dismisses it for the session.

## Key features

- **Auto panel on match** — When auto-surface is on and the page matches your URL/domain rules, ShopFriend can show the compact panel without an extra click.
- **Chrome side panel** — Full-height companion UI in Chrome’s native side panel for reading longer insight threads and settings.
- **Extensible domains** — Site list and extractors live in extension storage so you can add more retailers over time (not locked to a single host in code).
- **Price comparison** — Uses the **Affiliate.com**-style product search API (when configured) to suggest offers with outbound links. For development, same-retailer (same-domain) suppression is currently disabled because cross-retailer alternatives were too sparse to reliably test the flow.
- **Review insight (“get review insight”)** — Uses **Bright Data Discover** (when configured) so the user can dig into reviews, spot repeated themes, and get pointers that would otherwise mean opening many tabs; the UI is honest about what is inferred vs what is on the page.
- **LLM layer** — When OpenAI (or compatible) env is set, the server can **summarize** structured data returned from Bright Data and related steps, and `**/api/insight/chat`** lets the user **ask follow-up questions** in a thread grounded on that context.

## Typical user flow

1. **Install and load** the unpacked extension (after a build) and ensure the web app URL is configured so the extension can reach `/api/insight`.
2. **First visit** — Open the side panel or the on-page panel, walk through **data handling / disclosure** copy, and choose whether to leave LLM-related features on or turn them off in settings.
3. **Browse normally** — On a non–product page, ShopFriend stays quiet or shows a short “unsupported here” style state depending on context.
4. **Land on a product page** — The content script classifies the page and extracts title, price hints, rating text, and bounded review snippets into a payload.
5. **See the compact card** — Either because **auto-surface** matched your rules, or because you clicked the **toolbar icon** (which asks the page to mount the shadow panel, or falls back to the side panel if messaging is unavailable).
6. **Choose an action** — For example **compare price**, **get review insight**, or **start** the guided flow; the service worker calls the BFF; you see loading, cancel, timeout, or retry as implemented.
7. **Read and verify** — Cards show **sources, links, and caveats** where vendor or model data is involved so you can open primary pages yourself instead of trusting a black box summary.
8. **Go deeper** — Open the **side panel** for the same session, adjust **settings** (domains, auto-surface, module toggles), or use **chat** for follow-ups when enabled.

## Tools and stack


| Area                    | Choice                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo                | pnpm workspaces, Turborepo                                                                                                                                       |
| Web / API               | Next.js 15, React 19, Route Handlers, Zod                                                                                                                        |
| Extension               | Vite 6, `@crxjs/vite-plugin`, React 19, TanStack Query, Tailwind CSS v4                                                                                          |
| Shared contracts        | `packages/shared` — Zod schemas for insight request/response                                                                                                     |
| Optional at deploy time | OpenAI (summaries + chat), Bright Data (Discover / pricing paths), Affiliate Networks API (product search), Supabase (strict auth when you choose to turn it on) |


For a **minimal local demo**, you only need the web app running and the extension built with `VITE_SHOPFRIEND_API_ORIGIN` pointing at it; see [README.md](README.md) and [apps/web/.env.example](apps/web/.env.example).

## Key decisions

1. **No `default_popup` in the manifest** — The toolbar action uses `chrome.action.onClicked` to message the content script, which mounts **ShopFriend** in a **closed shadow root** so styles do not leak onto the retailer page. If messaging fails (e.g. no content script), the **side panel** opens as a fallback.
2. **Show sources, not only a blur of text** — We leave **lists of sources and the data returned from Bright Data** visible (links, merchants, caveats, timestamps where applicable) instead of collapsing everything into a single polished paragraph. The goal is that the shopper still **clicks through**, reads a real review page, and feels **informed**, not spoon-fed. ShopFriend is meant to **replace the chore of hunting** the same clues across the open web; if we only showed a summary, people might treat ShopFriend as **one more opinion** instead of the **place they trust to assemble the trail** they would have opened manually.
3. **Supabase not required for the demo path** — Auth middleware and JWT validation exist for when you wire a Supabase project; until then, `/api/insight` can stay open for local iteration unless you enable strict insight auth in env.

## What we learned

- **Chrome extension UX** — A small panel **inside the page** (using a **shadow root**) gives a popup-like card without needing a separate popup HTML entry in the extension package, and it keeps our styles isolated from Amazon’s CSS.
- **Content script registration** — Real retailer origins are registered at runtime from stored site config; the manifest keeps a placeholder match so the build still outputs the loader and script chunks correctly.
- **Planning with AI skills** — Using **Cursor skills** (including **shaping**) produced clearer, more organized plans than ad-hoc prompts alone: requirements and steps stayed easier to follow end to end.

## Future perspective

- **Supabase** — When you are ready for accounts, saved preferences, and server-side history with strong access rules, a hosted Postgres + auth stack is the natural next step so the BFF can persist per-user state safely.
- **Deploy on Vercel** — Ship the Next.js BFF close to users with managed env vars, previews for each change, and the same Route Handlers the extension already calls.

---

For setup commands and an architecture diagram, see [README.md](README.md).