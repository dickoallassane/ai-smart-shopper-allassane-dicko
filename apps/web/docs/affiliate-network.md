# Affiliate.com product search (server)

ShopFriend’s **Next.js server** can call the **Affiliate.com Product API** during `POST /api/insight` to attach optional **`affiliateMatches`**: alternative merchant offers for the same PDP context (search is driven mainly by the product **title**).

## What it does

- **Input:** On-page product payload from the extension (`title`, `locale`, etc.).
- **Upstream:** `POST {AFFILIATE_NETWORKS_API_BASE_URL}/v1/products` with a JSON body (required `search` filters, optional `networks` per Affiliate.com’s contract).
- **Output:** A bounded list of offers mapped to `affiliateMatches` on the insight response (merchant, network, display price, **tracked `clickUrl`**, optional retailer **`directUrl`** when the API provides it).
- **Security:** The API key is **never** sent to the browser; only the Next server reads env vars.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AFFILIATE_NETWORKS_API_KEY` | For live search | Bearer token (`Authorization: Bearer …`). |
| `AFFILIATE_NETWORKS_API_BASE_URL` | For live search | **HTTPS origin** only (no path). The code appends **`/v1/products`**. Obtain the host from Affiliate.com (dashboard, Query Builder, or docs issued with your account). |
| `AFFILIATE_NETWORKS_REQUEST_JSON` | Often, if API returns 422 | Stringified JSON for the `networks` object, e.g. `{ "335": { "affiliate_id": "…", "sub_id": "…" } }`. Shape must match what Affiliate.com expects for your enabled networks. |

If the key or base URL is **missing**, insight generation **skips** affiliate search (no error). If both are set but the request fails, a **limitation** line is added and the rest of the insight still returns.

## `@@@` in click URLs (Impact / Walmart)

Some networks return tracking URLs that contain the literal placeholder **`@@@`** (e.g. `https://goto.walmart.com/c/@@@/…`). Until that segment is replaced with your **publisher `affiliate_id`**, the destination site may show “malformed link”. This is **not** an environment (dev vs prod) issue.

ShopFriend replaces every `@@@` in the tracked URL with the **first `affiliate_id`** found in `AFFILIATE_NETWORKS_REQUEST_JSON` when that value is set. If **`affiliate_id` is missing**, the **raw** tracked URL is still returned on `clickUrl` (it may still show “malformed” on the merchant site), and when the API supplies a **direct** retailer URL we also set **`directUrl`** so the extension can offer a working second link. Configure `affiliate_id` for commission-correct tracked links.

## Linking and compliance

- Prefer **publisher-tracked** URLs from the API response (`urls.affiliate`, `commission_url`, or `urls.outclick`) for user navigation. Exact rules follow **Affiliate.com** and each merchant program.
- Disclose affiliate relationships in the product UI where regulations require (e.g. FTC-style disclosure); this doc does not replace legal review.

## Operational notes

- **429** rate limits: handle backoff or reduce call volume in production.
- **422** invalid network parameters: fix `AFFILIATE_NETWORKS_REQUEST_JSON` or credentials in the Affiliate.com UI.

## Related code

- Client: [`src/server/services/affiliate/searchAffiliateProducts.ts`](../src/server/services/affiliate/searchAffiliateProducts.ts)
- Orchestration: [`src/server/services/insight/generate.ts`](../src/server/services/insight/generate.ts)
- Shared type: [`packages/shared/src/insight-contract.ts`](../../../packages/shared/src/insight-contract.ts) (`affiliateMatches`)
