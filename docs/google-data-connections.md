# Google data connections

Updated: 2026-07-05, Kyiv

## What changed

The app now treats Google access as one shared Google OAuth login instead of separate short-lived access tokens for each product.

One local OAuth client + one owner consent can unlock:

- Google Search Console: `webmasters.readonly`
- GA4 Data API: `analytics.readonly`
- Merchant Center / Content API diagnostics: `content`
- Google Ads API: `adwords`

The dashboard no longer treats an OAuth client JSON file as a working connection by itself. A connector becomes ready only when a real local token exists and includes the scope needed by that connector.

## Local files

- OAuth client JSON currently used: `/Users/macbook/Downloads/client_secret_741726896607-sfs93osdl3vadnrh5rr295j9g4p7g6l3.apps.googleusercontent.com.json`
- Saved local token: `gsc-oauth-token.json`
- Saved connector values: `connection-secrets.json`
- Verification cache: `connection-verification.json`
- Codex SEO Google config: `~/.config/codex-seo/google-api.json`
- Codex SEO OAuth token mirror: `~/.config/codex-seo/oauth-token.json`

Do not paste random one-time access tokens into the dashboard unless needed for debugging. They expire quickly and cause the “invalid authentication credentials” error seen in GA4.

## Current status

Connected and live-verified:

- Google Search Console via unified OAuth;
- GA4 Data API via unified OAuth;
- Google Merchant Center / Content API diagnostics via unified OAuth;
- Google Ads API via unified OAuth;
- Codex SEO layer can read GSC, GA4, PageSpeed Insights, CrUX and CrUX History through `~/.config/codex-seo`.

Merchant agent layer added on 2026-07-04:

- Project skill: `.agents/skills/mapi-developer-assistant/SKILL.md`.
- Project agent: `.codex/agents/merchant-api-diagnostics.toml`.
- Merchant Feed dashboard now returns `merchantApiIntelligence` with:
  - official Google Merchant API agentic tools;
  - read-only MCP allowlist;
  - blocked write-like MCP tools;
  - evidence graph: OpenCart bridge + Merchant diagnostics + SEO Center + approval executor;
  - feed rule engine for core fields, diagnostics, identifiers, variants, landing-page match, schema, images and Merchant-only overrides.
- This layer does not publish to Merchant Center and does not create/fetch data sources automatically.

Read-only Google Merchant diagnostics reader added on 2026-07-05:

- `GET /api/merchant-feed/google-diagnostics?limit=80` reads:
  - `accountstatuses.get`;
  - `productstatuses.list`;
  - `datafeeds.list`.
- It uses the existing unified Google OAuth scope `https://www.googleapis.com/auth/content`.
- It writes only a local cache:

```text
merchant-system/google-diagnostics-cache.json
```

- `GET /api/merchant-feed` includes that cache as `googleDiagnostics`, so agents can compare Google issue codes with the OpenCart scan before proposing fixes.
- `publishAllowed=false`; there is no Merchant Center write, data-source fetch, product insert/update/delete or feed publish in this flow.
- The reader is intentionally a transitional Content API v2.1 bridge. Google has announced the Content API for Shopping sunset for 2026-08-18, so the durable next step is Merchant API / MCP read-only diagnostics with the same approval gates.

Important nuance:

- The existing dashboard verification still uses the working Google Content API endpoint for account diagnostics.
- Google's new Merchant API MCP Access Service requires a service account for local headless MCP execution.
- Do not replace the working OAuth/Content verification path blindly. Add Merchant API v1 diagnostics gradually, with official DevDocs MCP context and read-only tool filtering first.

Read-only snapshot saved:

```text
seo-system/audits/runtime/google-data-snapshot-2026-06-28.json
```

Snapshot result:

- GSC: 379 page rows, 110 clicks, 20,003 impressions for 2026-05-31 → 2026-06-25.
- GA4: 160 organic sessions for 2026-05-31 → 2026-06-27.

Still missing:

- Public tracking URL. Localhost cannot receive tracking events from emails.

Newly connected on 2026-06-28:

- Restricted Google API key saved as `api_key` in `~/.config/codex-seo/google-api.json`.
- `google_auth.py --check --json` reports PageSpeed Insights, CrUX and CrUX History as available.
- CrUX live check for `https://mercato.com.ua` returned field data: LCP and CLS are good; TTFB needs improvement.
- First full PageSpeed check for `https://mercato.com.ua` after connecting the key:
  - mobile performance: 56; accessibility: 82; best practices: 96; SEO: 100;
  - desktop performance: 79; accessibility: 82; best practices: 96; SEO: 100;
  - lab mobile LCP is very slow, while CrUX field LCP is good. Treat this as a mobile-render investigation, not an automatic site-wide panic.
- Local Codex SEO script fix applied: `pagespeed_check.py` now initializes `audit_details`, preventing a `KeyError` during full PageSpeed JSON output.

## Correct setup path

1. In Google Cloud Console, create or open the project used for Mercato AI.
2. Enable the APIs you need:
   - Google Search Console API
   - Google Analytics Data API
   - Google Content API for Shopping / Merchant API access
   - Google Ads API
3. Create an OAuth Client.
   - Web application works with redirect URI:
     `http://127.0.0.1:3000/seo/gsc/oauth/callback`
   - Desktop client also works locally.
4. Download the JSON file and save it somewhere local. Current active file:
   `/Users/macbook/Downloads/client_secret_741726896607-sfs93osdl3vadnrh5rr295j9g4p7g6l3.apps.googleusercontent.com.json`
5. Open:
   `http://127.0.0.1:3000/seo/gsc/oauth/start`
6. Approve the requested scopes in the Google consent screen.
7. Return to:
   `http://127.0.0.1:3000/app-v3/#connect`
8. Click “Перевірити API” on GSC, GA4, Merchant and Ads.

## Merchant API MCP / agentic setup path

Use this only after the normal dashboard connectors are healthy.

Official references:

- Merchant API MCP Access Service:
  `https://developers.google.com/merchant/api/guides/agentic-tools/merchant-data-mcp`
- API Integration and Code Assist Toolkit:
  `https://developers.google.com/merchant/api/guides/agentic-tools/integration-and-code-assist`
- DevDocs MCP endpoint:
  `https://merchantapi.googleapis.com/devdocs/mcp/`
- Google sample skills:
  `https://github.com/google/merchant-api-samples/tree/main/agent-skills`

Phase 1 — read-only:

1. Create a Merchant API service account with the narrowest practical access.
2. Save the service-account JSON outside the repository.
3. Configure Merchant data MCP only with a read-only allowlist:
   - `list_accounts`
   - `list_products`
   - `get_product_by_name`
   - `report_search`
   - `list_account_issues`
   - `list_aggregate_product_statuses`
   - `list_data_sources`
   - `get_data_source`
   - `list_programs`
   - `get_automatic_improvements`
4. Compare Google diagnostics with the OpenCart bridge scan before proposing any fix.
5. Route deterministic fixes into the existing preview → approval → readback flow.

Blocked until explicit separate approval:

- `create_data_source`
- `fetch_data_source`
- product insert/update/delete
- shipping or return policy writes
- automatic improvement writes
- any direct Merchant Center publish

## PageSpeed / CrUX key

The Google API key should stay restricted in the same Google Cloud project to:

- PageSpeed Insights API;
- Chrome UX Report API;
- Chrome UX Report History API.

It is stored as `api_key` in:

```text
~/.config/codex-seo/google-api.json
```

Do not paste this key into public files, GitHub, screenshots or chat again. If it is exposed, rotate it in Google Cloud Credentials and replace the local value.

## Safari data extraction workflow

When you open Google pages under your own login, Codex can run:

```bash
node tools/safari-google-context.js
```

The script reads only visible page text, tab titles and URLs from Safari tabs. It does not read cookies, passwords, local storage, hidden tokens or browser profiles.

Use it for collecting non-secret IDs and visible diagnostics:

- GA4 property ID
- Merchant account ID
- Google Ads customer/MCC IDs
- visible API/permission errors
- visible account/property names
