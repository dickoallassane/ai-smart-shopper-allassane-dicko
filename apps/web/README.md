# ShopFriend — web (Next.js BFF)

This package is the **Next.js 15** app for ShopFriend: marketing and auth routes, plus Route Handlers that implement `**/api/insight`** and `**/api/insight/chat**` (secrets and optional LLM/vendor calls stay on the server).

## Where to look

- Monorepo setup, architecture diagram, and extension workflow: [../README.md](../README.md)
- Delivered scope, tools, decisions, learnings, and Supabase inventory: [../overview.md](../overview.md)
- Extension ↔ API auth: [docs/extension-auth-flow.md](docs/extension-auth-flow.md)
- Optional affiliate search: [docs/affiliate-network.md](docs/affiliate-network.md)

## Commands

```bash
pnpm dev      # from apps/web — Next dev server
pnpm build
```

From repo root: `pnpm --filter web dev`