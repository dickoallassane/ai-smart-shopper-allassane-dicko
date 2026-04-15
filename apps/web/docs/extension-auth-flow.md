# Extension authentication flow

ShopFriend keeps **LLM and vendor keys on the Next.js server**. The Chrome extension should **not** embed the Supabase **service role** key.

## Recommended flow (production)

1. User signs in on the **Next.js** site using **Supabase Auth** (cookies / SSR on the web app).
2. The web app exposes a **“Connect extension”** step that retrieves the Supabase **access token** (JWT) after login — for example via `supabase.auth.getSession()` in the browser.
3. The extension stores the access token in `chrome.storage.local` under `extensionAccessToken` (or `chrome.storage.session` for shorter-lived storage).
4. The extension calls Next.js routes with `Authorization: Bearer <supabase_access_token>`.
5. Next.js validates the JWT using `supabase.auth.getUser()` with the **anon** key + `Authorization` header (see [`src/app/api/auth/extension/route.ts`](../src/app/api/auth/extension/route.ts) and [`src/app/api/insight/route.ts`](../src/app/api/insight/route.ts)).

### Optional hardening (later)

- Exchange the Supabase JWT for a **narrow, opaque extension token** minted by Next.js and stored in Postgres with expiry + rotation.
- Add per-user **rate limits** on `/api/insight` keyed by `auth.uid()`.

## Local development

If `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are **not** set, `/api/insight` currently allows **unauthenticated** requests so you can iterate on the extension without wiring Supabase first.

**Before production**, set Supabase env vars and treat unauthenticated insight calls as **disabled**.

## Related files

- [`src/server/auth/session.ts`](../src/server/auth/session.ts) — cookie-bound Supabase client for Next.js Server Components / Route Handlers that read the logged-in web user.
- [`src/lib/supabase-browser.ts`](../src/lib/supabase-browser.ts) — browser client for the marketing / auth pages.
- [`src/middleware.ts`](../src/middleware.ts) — entry; delegates cookie refresh to [`src/server/auth/middleware.ts`](../src/server/auth/middleware.ts).
- [`src/server/auth/route-handler.ts`](../src/server/auth/route-handler.ts) — Supabase client for Route Handlers that set cookies on a redirect `Response` (e.g. `/callback`).
