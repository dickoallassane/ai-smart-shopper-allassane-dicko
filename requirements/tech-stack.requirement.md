# ShopFriend / Smart Shopper — Technical stack

This document captures the **engineering stack** and **runtime architecture** agreed for the monorepo. Product rules remain in [bussiness.requirement.md](bussiness.requirement.md); integration flow in [project.requirement.md](project.requirement.md).

---

## 1. Monorepo layout

| Path | Purpose |
| --- | --- |
| [apps/web](../apps/web) | Next.js 15 (App Router): marketing + auth pages, Supabase session refresh, Route Handlers (`/api/*`). |
| [apps/extension](../apps/extension) | Chrome MV3 extension (Vite + React + CRXJS): content script, service worker, popup, side panel. |
| [packages/shared](../packages/shared) | Shared **Zod** schemas and types (`ProductPayload`, `/api/insight` contracts). |
| [supabase/migrations](../supabase/migrations) | Example **Postgres + RLS** migration (`profiles`). |

**Package manager:** `pnpm` workspaces. **Task runner:** Turborepo (`turbo.json`).

---

## 2. Versions (pinned at bootstrap)

| Area | Package | Notes |
| --- | --- | --- |
| Runtime | Node 20+ | Matches Next.js 15 / modern `fetch` / `crypto.randomUUID`. |
| Web | `next@15.5`, `react@19`, `react-dom@19` | App Router, Route Handlers as BFF. |
| Auth + DB | `@supabase/supabase-js`, `@supabase/ssr` | Web cookies via middleware; extension uses **Bearer JWT** to Next.js (see auth diagram). |
| Validation | `zod@3.24` | Shared package + Route Handlers + LLM output validation (future). |
| Data fetching (UI) | `@tanstack/react-query@5` | Web + extension React surfaces. **Redux** not required for v1. |
| Extension build | `vite@6`, `@crxjs/vite-plugin@2`, `@vitejs/plugin-react@4` | MV3 bundle + HMR during development. |

---

## 3. Authentication (web + extension)

```mermaid
sequenceDiagram
  participant User
  participant Web as Nextjs_web
  participant Supa as Supabase_Auth
  participant Ext as Chrome_extension
  participant API as Nextjs_API

  User->>Web: Magic link login
  Web->>Supa: signInWithOtp
  Supa-->>Web: Session cookies SSR
  User->>Ext: Paste_or_sync_session
  Ext->>API: POST_api_insight_Bearer_JWT
  API->>Supa: auth_getUser_with_JWT
  Supa-->>API: user_or_error
  API-->>Ext: Insight_JSON
```

**Authoritative write-up:** [apps/web/docs/extension-auth-flow.md](../apps/web/docs/extension-auth-flow.md).

**Rule:** Supabase **service role** never ships in the extension bundle. Local dev may run `/api/insight` **without** Supabase env vars; production must set env and enforce auth.

---

## 4. External services

| Service | Where secrets live | Used for |
| --- | --- | --- |
| **LLM provider** | Next.js server env (`OPENAI_*` stub path) | Grounded summaries + citations (future wiring). |
| **Bright Data (or equivalent)** | Next.js server env (`BRIGHT_DATA_API_TOKEN`) | Optional A9 beta pricing rows with provenance. |

---

## 5. Commands

```bash
pnpm install        # root — installs all workspaces
pnpm dev            # turbo dev (web + extension watch — see package scripts)
pnpm build          # turbo build
```

**Per app:**

- Web: `pnpm --filter web dev` → http://localhost:3000  
- Extension: `pnpm --filter @shopfriend/extension dev` → load unpacked `apps/extension/dist` in Chrome.

---

## 6. Chrome extension permissions (dev)

Manifest includes `https://www.amazon.com/*` and `http://localhost:3000/*` for local API calls from the service worker. Tighten or parameterize before store release.

---

## 7. References

- [project.requirement.md](project.requirement.md) — sequence diagram Next ↔ extension ↔ LLM ↔ Bright Data.
- [bussiness.requirement.md](bussiness.requirement.md) — R0–R8 and UX breadboard.
