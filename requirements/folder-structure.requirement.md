# Folder structure (target) — ShopFriend monorepo

This document is the **single source of truth** for where code and assets should live. It mirrors the **feature-first + server layer** layout you outlined, adapted to our **pnpm monorepo** and stack: **Next.js (App Router)**, **Supabase** (no Prisma), **Chrome MV3 extension**, **`packages/shared`** (Zod).

---

## Repo root (`/`)

```text
shopfriend/
├── apps/
│   ├── web/                 # Next.js — landing, auth, Route Handlers (BFF)
│   └── extension/           # Chrome MV3 — Vite + React
├── packages/
│   └── shared/              # Shared Zod schemas + types (ProductPayload, API contracts)
├── requirements/          # Product / tech / architecture docs (this folder)
├── supabase/
│   └── migrations/          # SQL migrations (Postgres + RLS); optional local `config.toml` later
├── package.json             # Root workspace scripts (turbo, pnpm)
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

---

## Web app — `apps/web/src/` (same *shape* as your `app`, `features`, `lib`, `server`, `ui`)

Next.js keeps the **App Router** under `src/app/`. Everything else stays **colocated by domain** under `src/features`, `src/server`, etc.

```text
apps/web/src/
├── app/                              # App Router (your top-level "app")
│   ├── (auth)/                       # Route group — auth + client binding (same mental bucket)
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── callback/                 # e.g. Supabase OAuth / magic-link return
│   │   │   └── route.ts              # or page.tsx, depending on provider flow
│   │   └── extension-connect/        # “Connect extension” — token / one-time code / deep link UX
│   │       └── page.tsx
│   ├── (marketing)/                  # Route group — public marketing pages
│   │   ├── page.tsx                  # landing (or move root page here)
│   │   └── pricing/
│   │       └── page.tsx
│   ├── (dashboard)/                  # optional — signed-in web-only areas (not extension UI)
│   │   └── profile/
│   ├── api/                          # Route Handlers (BFF)
│   │   ├── insight/
│   │   │   └── route.ts              # POST /api/insight
│   │   ├── health/
│   │   │   └── route.ts
│   │   └── auth/
│   │       └── extension/
│   │           └── route.ts          # POST validate / exchange session for extension
│   ├── layout.tsx
│   ├── page.tsx                      # Root entry (or thin redirect into (marketing))
│   ├── providers.tsx                 # e.g. TanStack Query
│   └── globals.css                   # or re-export from styles/
│
├── features/                         # Domain vertical slices (your "features")
│   ├── auth/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── actions.ts                # Server Actions if used for auth-adjacent forms
│   │   ├── index.ts                  # public API of the feature
│   │   └── extension-connect/        # Wizard / copy code / deep link (lives under auth feature)
│   │       ├── components/
│   │       ├── hooks/
│   │       └── index.ts
│   └── insights/                     # UI + hooks for “insight preview” on web, if any
│       ├── components/
│       ├── hooks/
│       └── index.ts
│
├── ui/                               # Design-system level primitives (your "ui")
│   └── …                             # buttons, inputs, layout shells — no domain logic
│
├── lib/                              # Cross-cutting client-safe utilities (your "lib")
│   ├── env.ts                        # env parsing / validation
│   └── …                             # formatters, cn(), etc.
│
├── server/                           # Server-only code (your "server")
│   ├── auth/
│   │   ├── config.ts                 # auth-related constants
│   │   └── session.ts                # Supabase server client helpers, getSession, etc.
│   ├── db/                           # Supabase — replaces Prisma in our stack
│   │   ├── client.ts                 # service-role or server client factories
│   │   └── types.ts                  # generated or hand-written DB row types (optional)
│   ├── mutations/                    # optional — named server mutations
│   │   └── …
│   ├── queries/                      # optional — server data reads used by RSC / actions
│   │   └── …
│   └── services/                     # BFF orchestration — LLM, Bright Data, insight assembly
│       ├── insight/
│       │   └── generate.ts           # (move from lib/insight when aligning repo)
│       ├── llm/
│       └── pricing/
│
├── styles/                           # optional — tokens, global partials if not only globals.css
│   └── …
│
├── tests/                            # your "tests" — web app integration / unit
│   └── …
│
└── middleware.ts                     # Next.js middleware at src/ (Supabase cookie refresh)
```

**Notes**

- **`(auth)` / `(marketing)` / `(dashboard)`** are **route groups** (parentheses = no URL segment). **`extension-connect`** lives under **`(auth)`** so sign-in and “prove this extension is yours” stay together.
- **`server/db`**: Supabase Postgres + RLS; SQL lives under repo **`supabase/migrations/`**, not `schema.prisma`.
- **`app/api`**: stays the HTTP surface for the **Chrome extension** and any non-RSC callers.
- Today some paths differ slightly (e.g. `lib/supabase` vs `server/auth`); **this document is the target** to migrate toward.

---

## Extension — `apps/extension/src/`

```text
apps/extension/src/
├── background.ts                     # service worker — network hub, storage
├── content-script.ts                 # PDP extract → ProductPayload
├── popup/
│   ├── index.html
│   ├── main.tsx
│   └── PopupApp.tsx
├── sidepanel/
│   ├── index.html
│   ├── main.tsx
│   └── SidePanelApp.tsx
└── lib/                              # optional — message helpers, tiny pure utils
    └── messaging.ts
```

Manifest / Vite config stay at **`apps/extension/`** root (`manifest.config.ts`, `vite.config.ts`).

---

## Shared package — `packages/shared/src/`

```text
packages/shared/src/
├── index.ts                          # barrel exports
├── product-payload.ts                # Zod + types
└── insight-contract.ts               # request/response Zod
```

Add more files here only for **cross-runtime** contracts (web + extension + future workers).

---

## What we are **not** doing in this structure

- **No Prisma** in `server/db` — database schema is **Supabase migrations** + optional typegen.
- **No Redux folder** by default — TanStack Query + small `features/*/hooks` unless product later mandates Redux.

---

## Summary

| Your original bucket | Where it lives in this repo |
| --- | --- |
| `app` (routes + api) | `apps/web/src/app/` |
| `features` | `apps/web/src/features/` |
| `lib` | `apps/web/src/lib/` |
| `server` | `apps/web/src/server/` |
| `ui` | `apps/web/src/ui/` |
| `styles` | `apps/web/src/styles/` + `app/globals.css` as needed |
| `tests` | `apps/web/src/tests/` (or root `tests/web/` if you prefer repo-level tests later) |
| `middleware.ts` | `apps/web/src/middleware.ts` |
| Extension connect (route) | `apps/web/src/app/(auth)/extension-connect/` |
| Extension connect (feature UI) | `apps/web/src/features/auth/extension-connect/` |
| Extension (not in your first sketch) | `apps/extension/src/` |
| Shared contracts | `packages/shared/src/` |

This is the structure we intend to **follow and converge on** during implementation.
