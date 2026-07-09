# Bridge v36: First Order Popup Coupons

Bridge v36 replaces v35 when enabling the first-order popup.

## What changed

- `create_coupon` now accepts `total` / `minimum_total`, so popup coupons can require 600 or 800 грн.
- New `growth_contact_status` action blocks existing customers/buyers/leads before issuing a first coupon.
- New `growth_order_complete` action reads `coupon_history` for completed orders and creates the second one-use coupon only once.
- New `growth_second_coupon_sync` action can backfill second coupons for recent completed orders that used `F10...`.
- New OpenCart table: `oc_mercato_growth_lead` with contact, landing/UTM payload, coupons, used promocode, and status.

## Upload

Upload:

```text
mercato-bridge.php
```

to:

```text
/public_html/mercato-bridge.php
```

Expected:

```text
GET /bridge/version
version: 2026-07-09-first-order-popup-v36
features includes: growth_contact_status, growth_order_complete
```

## Smoke Test

1. `GET /bridge/version`
2. Submit a test lead through `/api/first-order-popup/lead`.
3. Confirm a coupon exists in OpenCart admin with:
   - code prefix `F10`
   - discount `10%`
   - total `600`
   - uses total `1`
   - date end in 3 days
4. Place a test order with that coupon or run against a known completed order.
5. Call:

```text
POST /api/first-order-popup/order-completed
X-API-Key: COMMAND_API_KEY
{"order_id":12345}
```

6. Confirm second coupon prefix `F15`, discount `15%`, total `800`, one use, date end 21-25 days.
