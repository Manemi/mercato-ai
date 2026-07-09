# Щотижневий SEO-аудит Mercato

Тривалість: 45–90 хвилин. Один звіт, максимум 3–5 дій на тиждень.

## 1. Дані

- GSC: clicks, impressions, CTR, position за 7/28 днів.
- GA4: organic sessions, product views, add-to-cart, purchases, revenue.
- Merchant Center: disapproved/limited products і mismatch.
- OpenCart: stock, price, enabled products.
- CrUX/PSI: головна, головна категорія, 3 основні PDP.

## 2. Автоматичні перевірки

```text
/seo drift compare https://mercato.com.ua
/seo technical https://mercato.com.ua
/seo sitemap https://mercato.com.ua
/seo google gsc sc-domain:mercato.com.ua
/seo google pagespeed https://mercato.com.ua/kava-v-zernah
/seo ecommerce https://mercato.com.ua/kava-v-zernah/kava-gvatemala-huehuetenango
```

## 3. Щотижневий watchlist

- головна;
- `/kava-v-zernah`;
- арабіка;
- фермерська кава;
- бленди;
- без кофеїну;
- 10 товарів із найбільшим revenue;
- 10 URL із найбільшими impressions без достатнього CTR.

## 4. Пріоритизація

Кожна задача оцінюється:

| Поле | Питання |
|---|---|
| URL | Де проблема? |
| Evidence | Які GSC/GA4/HTML/Merchant дані це доводять? |
| Priority | Critical / Important / Later |
| Impact | Трафік, продажі, індексація або conversion |
| Effort | До 1 год, 1 день, кілька днів |
| Safety | Preview, dry-run, rollback |
| Success metric | Як зрозуміти, що стало краще? |

## 5. Контентний gate

Стаття або landing page не створюється, якщо немає:

- підтвердженого intent;
- SERP/page-type evidence;
- унікального досвіду Mercato;
- комерційного маршруту;
- відповідального за ручну перевірку;
- KPI через 28 днів.

## 6. Формат підсумку

```text
Що змінилось за тиждень:
1.
2.

Три дії:
1. URL — причина — вплив — перевірка.
2. URL — причина — вплив — перевірка.
3. URL — причина — вплив — перевірка.

Що не робимо:
- задачі без доказів;
- масові статті;
- live-зміни без preview/dry-run.
```
