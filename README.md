# ShopFriend (Smart Shopper)

Monorepo for the **Next.js** web app (landing + auth + API) and the **Chrome MV3** extension.

## Structure


| Path                   | Description                                                  |
| ---------------------- | ------------------------------------------------------------ |
| `apps/web`             | Next.js 15 — `/`, `/login`, `/api/insight`, Supabase helpers |
| `apps/extension`       | Chrome extension — build output in `dist/`                   |
| `packages/shared`      | Zod schemas shared by web + extension                        |
| `requirements/`        | Product and technical requirement docs                       |
| `supabase/migrations/` | Example SQL (profiles + RLS)                                 |


## Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
# fill Supabase keys when ready; insight API works without them for local dev
# Optional: Affiliate.com product search on insight — see apps/web/docs/affiliate-network.md
#   AFFILIATE_NETWORKS_API_KEY, AFFILIATE_NETWORKS_API_BASE_URL, AFFILIATE_NETWORKS_REQUEST_JSON
pnpm build
```

## Development

```bash
pnpm --filter web dev
pnpm --filter @shopfriend/extension dev
```

Load **Unpacked** extension from `apps/extension/dist` after a build. The dev manifest allows `http://localhost:3000` for API calls.

## Docs

- [requirements/tech-stack.requirement.md](requirements/tech-stack.requirement.md)
- [apps/web/docs/extension-auth-flow.md](apps/web/docs/extension-auth-flow.md)
- [apps/web/docs/affiliate-network.md](apps/web/docs/affiliate-network.md) — Affiliate.com product search on `/api/insight`

