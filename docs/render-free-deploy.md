# Mercato AI On Render Free

Це безкоштовний шлях, якщо cPanel не має Node.js.

## What This Gives

- `https://crm.mercato.com.ua/app-v3/` для програми.
- `https://crm.mercato.com.ua/mercato-first-order-popup.js` для OpenCart popup.
- Без VPS, без Nginx, без ручного `pm2`.

## Free Limits

Render Free підходить для старту, але має обмеження:

- сервіс засинає після простою;
- локальні файли/SQLite можуть зникати після restart/redeploy;
- прямий SMTP на портах `465/587` на Free не працює.

Тому popup-ліди після створення першого купона дублюються в OpenCart через bridge action `growth_lead_upsert`.

## Steps

1. Створити безкоштовний акаунт на Render.
2. Завести приватний GitHub repo, наприклад `mercato-ai`.
3. Завантажити туди цей проєкт без `.env`, `node_modules`, локальних `.json`, `.sqlite`.
4. У Render натиснути `New` -> `Blueprint`.
5. Обрати repo. Render прочитає `render.yaml`.
6. У Environment Variables вставити секрети:

```text
BRIDGE_URL=https://mercato.com.ua/mercato-bridge.php
BRIDGE_SECRET=...
COMMAND_API_KEY=...
OPENAI_API_KEY=...
```

SMTP можна додати, але на Render Free прямий SMTP може не працювати. Другий промокод все одно буде створюватися через bridge, а email-відправку краще пізніше перевести на API-сервіс.

7. Після першого deploy Render дасть адресу типу:

```text
https://mercato-ai.onrender.com
```

8. Перевірити:

```text
https://mercato-ai.onrender.com/api/first-order-popup/config
https://mercato-ai.onrender.com/first-order-popup-preview.html
```

9. У Render додати custom domain:

```text
crm.mercato.com.ua
```

10. У DNS домену додати запис, який покаже Render для custom domain.

11. Після SSL перевірити:

```text
https://crm.mercato.com.ua/api/first-order-popup/config
https://crm.mercato.com.ua/first-order-popup-preview.html
https://crm.mercato.com.ua/app-v3/#settings
```

12. У OpenCart footer додати:

```html
<script src="https://crm.mercato.com.ua/mercato-first-order-popup.js" async></script>
```

## Important

Do not upload this Node app into the old cPanel folder `crm.mercato.com.ua`. That folder currently contains the old PHP/HTML CRM and should remain untouched until a backup/migration is planned.
