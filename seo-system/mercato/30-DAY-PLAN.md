# 30-денний SEO-план Mercato

Мета: не «зробити більше контенту», а створити вимірювану систему, яка підсилює органічні продажі.

## Тиждень 1 — вимірювання і технічна основа

- Підключити PageSpeed/CrUX API.
- Підключити GSC для `sc-domain:mercato.com.ua`.
- Підключити GA4 property.
- Підключити Merchant Center diagnostics.
- Зняти baseline: clicks, impressions, CTR, position, organic revenue, indexed pages, disapproved products.
- Підготувати staging-план переходу з PHP 7.3.
- Виправити H1 головної.
- Перевірити security headers.

Результат: відомо, що реально втрачає трафік і продажі.

## Тиждень 2 — шаблони e-commerce

- Вибрати 20 URL за impressions, revenue і позиціями 4–15.
- Переписати title/meta лише для цієї вибірки.
- Додати `Organization/WebSite/WebPage` на головну.
- Додати category schema.
- Доповнити Product/Offer schema полями seller, SKU/identifier policy, shipping і returns.
- Перевірити feed-description без навігаційних і промо-блоків.
- Перевірити price/availability match на 10 товарах.

Результат: перша контрольна група сторінок готова до повторного вимірювання.

## Тиждень 3 — структура та внутрішні посилання

- Побудувати карту: головна → категорія → підкатегорія → товар → related products.
- Знайти orphan і слабко пов’язані сторінки.
- Перевірити старі/translit/location URL за GSC і backlinks.
- Об’єднати лише підтверджені дублікати.
- Очистити sitemap від непотрібних/неcanonical URL після ручної верифікації.
- Додати контекстні посилання з інформаційних сторінок у категорії й товари.

Результат: Google і покупець швидше доходять до комерційних сторінок.

## Тиждень 4 — conversion, GEO і контроль

- Провести mobile UX-перевірку категорії та 3 головних PDP.
- Зменшити вплив banner/sticky elements.
- Оптимізувати LCP/INP за PSI/CrUX.
- Додати авторство/експертну перевірку на інформаційні матеріали.
- Створити `/llms.txt`, якщо технічні задачі закриті.
- Зафіксувати SEO drift baseline.
- Порівняти перші 20 оптимізованих URL: CTR, position, organic sessions, revenue.

Результат: є перший замкнений цикл «дані → зміна → перевірка результату».

## KPI

- valid/indexed URLs;
- Merchant disapprovals;
- clicks та impressions категорій;
- CTR сторінок із позиціями 4–15;
- organic revenue і conversion rate;
- mobile LCP/INP/CLS;
- частка товарів із повним Product/Offer schema;
- кількість підтверджених SEO-регресій.
