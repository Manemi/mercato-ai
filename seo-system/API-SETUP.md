# Підключення Google та SEO API

Секрети не зберігати в цьому репозиторії.

## Поточний стан на 2026-06-28

Підключено:

- Google Search Console через unified OAuth;
- GA4 Data API через unified OAuth;
- Merchant Center diagnostics через unified OAuth у Mercato AI;
- Google Ads diagnostics через unified OAuth у Mercato AI;
- Codex SEO читає GSC/GA4 з `~/.config/codex-seo/google-api.json` і `~/.config/codex-seo/oauth-token.json`.

Ще потрібно:

- `GOOGLE_API_KEY` для PageSpeed Insights / CrUX / CrUX History;
- публічний HTTPS endpoint для email/public tracking, бо localhost не приймає зовнішні tracking events.

## Рекомендований порядок

### 1. PageSpeed Insights і CrUX

Потрібен Google Cloud API key. Увімкнути:

- PageSpeed Insights API;
- Chrome UX Report API;
- Chrome UX Report History API.

Це дасть реальні або офіційні Google-дані для LCP, INP і CLS замість локальних евристик.

### 2. Google Search Console

Уже працює через OAuth. Якщо робити заново: створити service account або OAuth credentials та увімкнути:

- Google Search Console API;
- URL Inspection API.

Email service account треба додати користувачем у Search Console для обох properties:

- `sc-domain:mercato.com.ua`;
- `sc-domain:prom3d.com.ua`.

### 3. GA4

Уже працює через OAuth. Якщо робити service account-варіант: увімкнути Google Analytics Data API, service account додати у GA4 як Viewer.

Потрібні окремі property ID для Mercato та Prom3D.

### 4. Google Merchant Center

Для Mercato підключити Merchant Center до Search Console і GA4. Щотижня забирати:

- disapproved і limited products;
- price/availability mismatch;
- missing identifiers;
- image issues;
- landing page issues;
- free listings та Shopping performance.

## Конфіг Codex SEO

Файл:

```text
~/.config/codex-seo/google-api.json
```

Шаблон:

```json
{
  "oauth_client_path": "/absolute/path/to/client_secret.json",
  "api_key": "GOOGLE_API_KEY",
  "service_account_path": "/absolute/path/to/service-account.json",
  "default_property": "sc-domain:mercato.com.ua",
  "ga4_property_id": "properties/123456789"
}
```

Права доступу:

```bash
chmod 600 ~/.config/codex-seo/google-api.json
chmod 600 ~/.config/codex-seo/oauth-token.json
chmod 600 /absolute/path/to/service-account.json
```

Перевірка:

```bash
~/.codex/skills/seo/.venv/bin/python \
  ~/.codex/skills/seo/scripts/google_auth.py \
  --check \
  --json
```

Після підключення:

```text
/seo google pagespeed https://mercato.com.ua
/seo google crux-history https://mercato.com.ua
/seo google gsc sc-domain:mercato.com.ua
/seo google inspect https://mercato.com.ua/kava-v-zernah
/seo google sitemaps sc-domain:mercato.com.ua
/seo google ga4 properties/123456789
```

## Додаткові платні або опціональні джерела

| Джерело | Для чого | Пріоритет |
|---|---|---|
| DataForSEO | SERP, volume, intent, конкуренти, Shopping, backlinks, AI visibility | високий після Google API |
| Ahrefs | backlinks, content gap, конкуренти | опціонально, якщо є бюджет |
| Firecrawl | повний JS-crawl і site map | опціонально |
| Bing Webmaster Tools | Bing/indexation/backlinks | корисно |
| Google Ads Keyword Planner | офіційні volume/CPC | після підключення Ads |

Спочатку достатньо Google API. Не купувати всі сервіси одночасно.
