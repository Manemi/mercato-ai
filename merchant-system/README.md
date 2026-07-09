# Merchant Feed Agents

Open:

```text
http://127.0.0.1:3000/app-v3/#merchant
```

API:

```text
GET  /api/merchant-feed
GET  /api/merchant-feed/google-diagnostics
GET  /api/merchant-feed/jobs/:id
POST /api/merchant-feed/scan
POST /api/merchant-feed/fix-plan
POST /api/merchant-feed/test-batch
POST /api/merchant-feed/write-preview
POST /api/merchant-feed/approve
POST /api/merchant-feed/apply
```

`GET /api/merchant-feed` also returns:

- `merchantApiIntelligence`: the read-only Google Merchant diagnostics plan,
  official Google Merchant API agentic tools, MCP allowlist, blocked write-like
  tools, evidence graph, and feed rule engine;
- `googleDiagnostics`: the last local cache from the live Google read-only
  diagnostics reader, if it has been run.

There is intentionally no mass-publish endpoint and no Merchant Center publish.
The write flow is limited to five products and requires a fresh scan, an exact
preview fingerprint, explicit owner approval, bridge readback, and a new scan.

Safety flow:

```text
scan → validate → owner decisions → dry-run → approval
→ maximum 5 test products → readback → live verification → re-scan
```

The continuous remediation queue is currently packaged with bridge version
`2026-07-01-seo-schema-readback-v35`. Older bridges produce limited coverage;
unknown fields are not reported as confirmed product errors.

Bridge v35 keeps the bulk option scan, the approval gate, the Merchant
remediation queue, the SEO control plane, and fixed description readback for
product SEO entity patches. It also fixes Product Schema JSON/readback responses
that could be blank on dirty product HTML. The narrow
`merchant_apply_product_patch` action can now:

- set the approved OpenCart manufacturer;
- clear a confirmed invalid non-numeric GTIN value without inventing a new code;
- store Merchant-only title and description overrides in an OpenCart side table;
- return exact database readback for every changed field.

After every successful five-product batch, the scanner runs again and
automatically prepares the next five products. Five is a per-approval safety
limit, not a total catalog limit.

The local
scanner reads 50 products per page with a 30-second timeout and one retry.

## Merchant API / Google Shopping intelligence

Project-local agent files:

```text
.agents/skills/mapi-developer-assistant/SKILL.md
.codex/agents/merchant-api-diagnostics.toml
```

The `Merchant API Diagnostics` agent is read-only by default. It is designed to
compare Google Merchant Center issues and product statuses with OpenCart bridge
facts before any fix is proposed.

The first live diagnostics endpoint is still read-only and uses the existing
Content API for Shopping OAuth path:

```text
GET /api/merchant-feed/google-diagnostics?limit=80
```

It reads account status, product statuses and datafeeds, then saves a local
cache in:

```text
merchant-system/google-diagnostics-cache.json
```

This endpoint never publishes products, never fetches a data source, and never
writes to Merchant Center. Treat it as a transitional reader before the Merchant
API/MCP migration, not as the final write path.

Recommended first-phase MCP tool allowlist:

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

Blocked until separate explicit approval:

- `create_data_source`
- `fetch_data_source`
- product insert/update/delete operations;
- shipping or return-policy writes;
- automatic improvement writes;
- direct Merchant Center publish.

Catalog policy:

```text
merchant-system/catalog-policy.json
```

The owner confirmed that the canonical feed brand for all products is `Mercato`.
The storefront description, price, stock, options, status, images, and numeric
identifier values are not changed automatically.

Variant / packaging policy:

```text
variantExportMode: canonical_product
```

Default Mercato policy is one OpenCart product = one Merchant offer. Packaging
or grammage remains a storefront option for the buyer, not a separate product in
the Google feed. Do not switch to `split_by_package` unless stable landing URLs
can open a specific package with matching visible price and availability, and the
owner explicitly approves that UX.
