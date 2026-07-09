# Codex SEO: статус встановлення

Дата перевірки: 18 червня 2026 року. Google data оновлено 28 червня 2026 року.

## Підтверджено

| Компонент | Стан |
|---|---|
| Codex SEO | `v1.9.6-codex.5` |
| SEO skills | 27 |
| SEO agents | 24 |
| Python | `3.13.1`, вимога репозиторію `3.10+` |
| Git | `2.39.5` |
| Codex CLI | `0.128.0` |
| Playwright | `1.60.0` |
| Chromium | встановлений; у sandbox може падати з `SIGTRAP/EPERM` |
| Core SEO workflows | готові |
| Visual workflows | частково: Playwright package є, browser launch треба перевіряти поза sandbox |
| Google API Python packages | встановлені |
| Google Search Console | підключено через OAuth |
| GA4 | підключено через OAuth |
| Merchant Center diagnostics | підключено через unified OAuth у Mercato AI |
| Google Ads diagnostics | підключено через unified OAuth у Mercato AI |

Skills розміщені в `~/.codex/skills/seo*`, agents — у `~/.codex/agents/seo-*.toml`.

## Що ще не підключено / обмежено

- Немає API key для PageSpeed/CrUX/CrUX History.
- Indexing API scope не підключений і не є критичним для товарів Mercato: Google офіційно не позиціонує Indexing API як загальний submit для ecommerce-сторінок.
- Public tracking не може працювати на localhost; потрібен публічний HTTPS URL.
- DataForSEO, Firecrawl та Ahrefs не підключені.
- PDF через WeasyPrint не працює без Pango; це необов’язково для поточної роботи.

Поточний Google snapshot:

```text
seo-system/audits/runtime/google-data-snapshot-2026-06-28.json
```

Результат live-read:

- GSC: 379 page rows, 110 clicks, 20 003 impressions.
- GA4: 160 organic sessions.

## Чиста установка на macOS

Офіційний release:

```bash
curl -fsSL \
  https://raw.githubusercontent.com/AgriciDaniel/codex-seo/v1.9.6-codex.5/install.sh \
  | bash
```

Безпечніший варіант із переглядом коду:

```bash
git clone https://github.com/AgriciDaniel/codex-seo.git
cd codex-seo
git checkout v1.9.6-codex.5
bash install.sh
```

Після установки треба перезапустити Codex.

Installer:

- копіює skills у `~/.codex/skills`;
- копіює agents у `~/.codex/agents`;
- створює `~/.codex/skills/seo/.venv`;
- встановлює Python-залежності;
- встановлює Playwright/Chromium;
- запускає перевірку середовища.

Основні Python-залежності: `requests`, `beautifulsoup4`, `lxml`, `defusedxml`, `Pillow`, `validators`, `Markdown`.

Додаткові групи:

- visual: `playwright`;
- Google: `google-api-python-client`, `google-auth`, `google-auth-oauthlib`, `google-analytics-data`;
- reports: `matplotlib`, `openpyxl`, `weasyprint`;
- OCR: `rapidocr-onnxruntime`.

Node.js не є основною вимогою Codex SEO, але корисний для локальних проєктів і додаткових перевірок. VS Code потрібен як робочий інтерфейс, а не як runtime-залежність SEO skills.
