# Власна AI SEO-система

Ця папка — робочий центр SEO для двох сайтів:

- `https://mercato.com.ua` — e-commerce, товари, категорії, Merchant Center і повторні продажі.
- `https://prom3d.com.ua` — B2B-ліди, промислові послуги, кейси та локальний попит.

## Статус Codex SEO

Перевірено 18 червня 2026 року, Google data оновлено 28 червня 2026 року:

- встановлено Codex SEO `v1.9.6-codex.5`;
- доступні 27 skills: головний `seo` + 26 спеціалізованих;
- доступні 24 TOML agents у `~/.codex/agents`;
- Python `3.13.1`, Git, Codex CLI та окреме Python-середовище працюють;
- Playwright `1.60.0` встановлений; у sandbox-перевірці Chromium може падати з `SIGTRAP/EPERM`, тому live Safari/UI перевіряти окремо;
- Mercato та Prom3D доступні для read-only аудиту;
- Google Search Console і GA4 підключені до SEO Center через `~/.config/codex-seo`;
- Merchant Center і Google Ads підключені у Mercato AI через unified Google OAuth;
- PageSpeed/CrUX ще потребують `GOOGLE_API_KEY`;
- необов’язковий PDF-експорт не готовий через відсутню системну бібліотеку Pango для WeasyPrint. На звичайні аудити, JSON, Markdown і screenshots це не впливає.

Останній read-only Google snapshot:

```text
seo-system/audits/runtime/google-data-snapshot-2026-06-28.json
```

Коротко: GSC прочитав 379 page rows, 110 кліків і 20 003 покази; GA4 прочитав 160 organic sessions.

Офіційна команда перевірки:

```bash
~/.codex/skills/seo/.venv/bin/python \
  ~/.codex/skills/seo/scripts/verify_environment.py \
  --target https://mercato.com.ua \
  --json
```

## Де система знаходиться в Mercato AI

SEO більше не є лише набором документів у цій папці. Він вбудований у робочий застосунок:

```text
http://127.0.0.1:3000/app-v3/#seo
```

У розділі `SEO-система` можна:

- перемикати окремі профілі Mercato і Prom3D;
- бачити встановлені Codex SEO skills, agents, Python і Playwright;
- запускати read-only повний, page, technical, schema, performance, content, GEO, sitemap та images аудит;
- бачити Google API readiness;
- переглядати критичні, важливі та відкладені задачі;
- контролювати щотижневий план та історію аудитів;
- перейти до старого редактора сторінок і безпечного `preview → dry-run → approval → publish`.

Backend:

```text
GET  /api/seo-center?siteId=mercato
GET  /api/seo-center?siteId=prom3d
GET  /api/seo-center/jobs/:id
POST /api/seo-center/audits
POST /api/seo-center/weekly
```

Історія зберігається локально в `seo-center-state.json`. Сирі артефакти аудитів — у `seo-system/audits/runtime/`. Обидва шляхи виключені з Git.

## Як запускати в Codex

Природні запити:

```text
Проведи повний SEO-аудит https://mercato.com.ua. Спочатку тільки перевірка, без змін.
```

```text
Перевір категорію https://mercato.com.ua/kava-v-zernah:
індексацію, intent, внутрішні посилання, mobile UX і конверсію.
```

```text
Перевір товарну сторінку Mercato на Product/Offer/Review/AggregateRating,
Google Merchant readiness і відповідність ціни та наявності.
```

```text
Проведи SEO-аудит Prom3D як B2B lead-generation сайту.
Оціни послуги, кейси, локальний попит, заявки й технічну готовність.
```

Командні промпти:

```text
/seo audit https://mercato.com.ua
/seo technical https://mercato.com.ua
/seo ecommerce https://mercato.com.ua
/seo schema https://mercato.com.ua/kava-v-zernah/kava-gvatemala-huehuetenango
/seo performance https://mercato.com.ua/kava-v-zernah
/seo geo https://mercato.com.ua
/seo drift baseline https://mercato.com.ua
/seo local https://prom3d.com.ua
/seo plan ecommerce
```

## Правила роботи

1. Аудит за замовчуванням read-only.
2. Не змінювати live-сайт без preview, dry-run і явного погодження.
3. Не створювати масово статті або посадкові сторінки.
4. Кожна пропозиція повинна містити URL, доказ, пріоритет, очікуваний вплив і спосіб перевірки.
5. Спочатку виправляти індексацію, шаблони, schema, швидкість і вимірювання. Контент — після технічної основи.
6. Для масових шаблонних змін спочатку перевіряти 3–5 сторінок, потім масштабувати.
7. Завершений аудит має залишати baseline та список перевірок для наступного тижня.

## Робочі документи

- [Статус встановлення](INSTALLATION-STATUS.md)
- [Підключення Google та SEO API](API-SETUP.md)
- [Базовий аудит Mercato](mercato/BASELINE-AUDIT-2026-06-18.md)
- [30-денний план Mercato](mercato/30-DAY-PLAN.md)
- [Щотижневий процес Mercato](mercato/WEEKLY-AUDIT.md)
- [SEO-процес Prom3D](prom3d/SEO-PROCESS.md)

Сирі локальні результати зберігаються у `seo-system/audits/` і не призначені для коміту.
