# First Order Popup For Mercato

Мета: рекламний трафік -> контакт -> персональний перший промокод -> другий промокод після першого завершеного замовлення.

## Files

- `public/mercato-first-order-popup.js`
- `public/mercato-first-order-popup.css`
- `public/first-order-popup-preview.html`
- `public/app-v3/js/app.js` -> Settings -> `Попап першого замовлення`
- `first-order-popup-config.json` runtime config, created after first save
- `mercato-bridge.php` / `merchant-system/mercato-bridge.php` version `2026-07-09-first-order-popup-v36`

## Preview And Enable

Local preview:

```text
http://127.0.0.1:3000/first-order-popup-preview.html
```

The preview page loads the same production JS/CSS in forced mode, so it opens even while the campaign is disabled.

Enable from the app:

```text
http://127.0.0.1:3000/app-v3/#settings
```

Open `Налаштування` -> `Попап першого замовлення`, set:

- `Показувати попап новим відвідувачам`
- `Публічна адреса Mercato AI`, for example `https://crm.mercato.com.ua`
- first coupon: `10%`, `600 грн`, `3 дні`
- second coupon: `15%`, `800 грн`, `21-25 днів`

If the server has `COMMAND_API_KEY`, paste it in that form once. The browser stores it locally and uses it for protected saves.

## Storefront Install

Додати один раз перед `</body>` у OpenCart theme footer. The exact snippet is shown in Settings after saving `Публічна адреса Mercato AI`:

```html
<script src="https://crm.mercato.com.ua/mercato-first-order-popup.js" async></script>
```

Optional, but recommended: for logged-in customers pass the state before the script:

```html
<script>
  window.MercatoFirstOrderPopup = {
    apiBase: "https://crm.mercato.com.ua",
    loggedIn: true,
    customerId: "123"
  };
</script>
```

Скрипт сам не показується на `checkout`, `payment`, `success`, `account`, HoReCa, opt/corporate сторінках.

## Lead Submit API

Public endpoint:

```text
POST /api/first-order-popup/lead
```

Payload:

```json
{
  "email": "client@example.com",
  "phone": "",
  "consent": true,
  "landingPage": "https://mercato.com.ua/?utm_source=google",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "coffee",
  "utm_content": "ad-1",
  "utm_term": "kava",
  "gclid": "...",
  "device": "mobile"
}
```

Result: creates a one-use `F10...` coupon:

- discount: `-10%`
- minimum order total: `600`
- lifetime: `3 days`
- uses total/customer: `1`

The endpoint is public even when `COMMAND_API_KEY` protects admin APIs. It refuses requests while the campaign is disabled.

Lead fields are stored in operational SQLite table `growth_leads` and JSON fallback `first-order-popup-leads.json`.

## Config API

Public storefront config:

```text
GET /api/first-order-popup/config
```

Protected admin config:

```text
GET /api/first-order-popup/admin-config
POST /api/first-order-popup/admin-config
X-API-Key: COMMAND_API_KEY
```

## Second Coupon Automation

Protected endpoint:

```text
POST /api/first-order-popup/order-completed
X-API-Key: COMMAND_API_KEY

{"order_id":12345}
```

The bridge checks `coupon_history` for a used `F10...` coupon on that completed order, then creates one `F15...` coupon:

- discount: `-15%`
- minimum order total: `800`
- lifetime: `23 days` by default, bounded to `21-25`
- uses total/customer: `1`

If SMTP is configured, Mercato AI emails the second coupon. SMS is not sent until an SMS transport is configured.

Cron fallback:

```text
POST /api/first-order-popup/sync-second-coupons
X-API-Key: COMMAND_API_KEY

{"days":14,"limit":25}
```

## GA4 Purchase

On checkout success, expose order data before the popup script:

```html
<script>
  window.MercatoGrowthPurchase = {
    transaction_id: "{{ order_id }}",
    value: {{ order_total_number }},
    currency: "UAH",
    coupon: "{{ coupon_code }}",
    items: [
      { item_id: "{{ product_id }}", item_name: "{{ name }}", price: {{ price_number }}, quantity: {{ quantity }} }
    ]
  };
</script>
```

The script pushes:

- `popup_view`
- `popup_close`
- `popup_submit`
- `first_discount_code_created`
- `first_discount_used`
- `second_discount_code_created`
- `second_discount_used`
- `add_to_cart`
- `begin_checkout`
- `purchase`

`purchase` is pushed only when `window.MercatoGrowthPurchase.transaction_id` is available.
