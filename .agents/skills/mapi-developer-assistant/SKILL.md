---
name: mapi-developer-assistant
description: >
  Google Merchant API integration and diagnostics assistant for Mercato.
  Use when working on Merchant API, Merchant Center diagnostics, Content API
  migration, Merchant API MCP, product statuses, account issues, data sources,
  automatic improvements, product performance reports, or Google Shopping feed
  troubleshooting. Default to official Google documentation and read-only
  diagnostics; never enable live writes without an explicit tool allowlist and
  owner approval.
compatibility: "Mercato AI, Google Merchant API, Google Merchant API DevDocs MCP"
source: "Google Merchant API Agent Skills / mapi-developer-assistant"
---

# Merchant API Developer Assistant for Mercato

This is a Mercato-safe wrapper around Google's official Merchant API agentic
guidance. It is not a mass feed publisher.

## Official sources

Use these first:

- Merchant API MCP Access Service:
  `https://developers.google.com/merchant/api/guides/agentic-tools/merchant-data-mcp`
- API Integration and Code Assist Toolkit:
  `https://developers.google.com/merchant/api/guides/agentic-tools/integration-and-code-assist`
- DevDocs MCP endpoint:
  `https://merchantapi.googleapis.com/devdocs/mcp/`
- Google sample skill repository:
  `https://github.com/google/merchant-api-samples/tree/main/agent-skills`

## Mercato safety contract

- Treat Merchant API MCP as alpha until proven stable in this project.
- Use read-only diagnostics first.
- Do not expose all MCP tools to an agent.
- Do not use live write-like tools such as data source creation/fetch or product
  insert/update/delete unless the user explicitly approves a named action.
- Do not publish to Merchant Center from the Merchant Feed dashboard.
- Do not invent GTIN, MPN, SKU, brand, price, stock, shipping, returns, ratings,
  reviews, variants, or landing-page behavior.
- Every proposed fix must name the evidence source:
  OpenCart bridge, Merchant Center diagnostics, product page, schema, GSC/GA4,
  or owner-confirmed catalog policy.

## Recommended read-only MCP tool allowlist

When the real Google Merchant data MCP is connected, restrict the first phase to:

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

Blocked until separate approval:

- `create_data_source`
- `fetch_data_source`
- product insert/update/delete operations
- shipping/return policy writes
- automatic improvement writes

## Workflow

1. Read the current Mercato Merchant dashboard: `GET /api/merchant-feed`.
2. If no fresh OpenCart scan exists, run the normal Merchant scan first.
3. Check whether Merchant diagnostics are connected.
4. Compare Merchant Center issues with OpenCart facts:
   - product ID / offer ID;
   - URL;
   - title;
   - description;
   - image;
   - price and currency;
   - availability;
   - brand;
   - identifiers;
   - variant `item_group_id`.
5. Produce a practical result:
   - issue;
   - affected products;
   - Google evidence;
   - OpenCart evidence;
   - proposed fix;
   - write target;
   - risk;
   - verification method.
6. If a fix is deterministic, route it into preview -> owner approval -> readback.
7. If a fix requires a new fact, image, GTIN, MPN, shipping, return policy,
   review, or variant URL, route it to manual decision.

## Content API migration rule

Existing Mercato code may still verify the legacy Content API endpoint. Do not
replace a working verification path blindly. When implementing Merchant API v1
code, first query the official DevDocs MCP and copy current method/resource
patterns from official examples.

Never use Merchant API `v1beta` for new code.
