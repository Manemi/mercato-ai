# Mercato Growth Intelligence

Це верхній SEO/GEO/Conversion шар над існуючим SEO control plane.

## Що він робить

- читає офіційні Google/OpenAI джерела;
- хешує контент документації й порівнює з попереднім станом;
- перетворює правила на задачі для SEO/Merchant/GEO агентів;
- не пише на сайт без `APPLY_SEO_CHANGES`;
- тримає фокус на конверсіях: organic sales, CTR, cart, purchase, Merchant/free listings, AI Search visibility.

## Ручний запуск

```bash
curl -sS --max-time 20 -X POST http://127.0.0.1:3000/api/seo-center/intelligence-refresh \
  -H 'Content-Type: application/json' \
  --data '{"siteId":"mercato","fetchDocs":true}'
```

Baseline без зовнішньої мережі:

```bash
curl -sS --max-time 5 -X POST http://127.0.0.1:3000/api/seo-center/intelligence-refresh \
  -H 'Content-Type: application/json' \
  --data '{"siteId":"mercato","fetchDocs":false}'
```

## Джерела під наглядом

- Google AI Search / AI Overviews / AI Mode guide;
- Google helpful people-first content;
- Google AI-generated content guidance;
- Google Merchant Center product data specification;
- Google Product structured data;
- Google Merchant listing structured data;
- OpenAI crawler docs.

## Важливі правила

- Google AI features все ще спираються на базове SEO: crawlability, indexation, snippet eligibility, helpful content, Merchant/Business data.
- `llms.txt` не є спеціальним фактором Google AI Overviews / AI Mode; його можна підтримувати для інших AI-систем.
- Для ChatGPT Search важливий `OAI-SearchBot`; `GPTBot` не є тим самим.
- Review / AggregateRating не створюються без реальних відгуків.
- Масова генерація SEO-текстів без доказів і користі для покупця заблокована.

## Нічний запуск

Рекомендація: запускати раз на ніч після старту локального сервера.

Приклад cron:

```cron
15 3 * * * curl -sS --max-time 30 -X POST http://127.0.0.1:3000/api/seo-center/intelligence-refresh -H 'Content-Type: application/json' --data '{"siteId":"mercato","fetchDocs":true}' >> /tmp/mercato-seo-growth-intelligence.log 2>&1
```

На macOS краще зробити LaunchAgent, але його треба встановлювати окремо в `~/Library/LaunchAgents`.
