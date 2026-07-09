# Bridge And Live Deploy Runbook

Ціль: зробити live deploy повторюваним, а не залежним від памʼяті розробника.

## Golden Rule

Після будь-якого запису в OpenCart має бути readback і live verification.

Не достатньо, що bridge відповів `ok: true`. Треба перевірити:

- що запис пішов у правильний `language_id`;
- що зміни читаються назад із БД;
- що live-сторінка показує ці зміни після cache clear;
- що preview, OpenCart attributes і live theme не розходяться.

## Pre-Deploy Checklist

- локальний `mercato-bridge.php` має актуальну версію;
- PHP compatibility не використовує синтаксис вище PHP 7.3, якщо хостинг старий;
- `.env` має правильні `BRIDGE_URL` і `BRIDGE_SECRET`;
- є доступ до OpenCart admin для cache clear;
- є rollback copy попереднього bridge;
- є тестовий товар або непублічний dry-run сценарій.

## Deploy Steps

### 1. Upload Bridge

Завантажити `mercato-bridge.php` на хостинг.

Не змінювати одразу theme/Twig, якщо задача тільки bridge.

### 2. Check Version And Health

Перевірити:

```text
bridge?action=version
bridge?action=health
```

Очікувано:

- JSON response;
- bridge version visible;
- DB connection OK;
- secret accepted;
- features list містить потрібні actions.

### 3. Check Read

Перевірити product read:

```text
GET /opencart/read-product?url=https://store.ua/product
```

Для категорій:

```text
GET /opencart/read-entry?type=category&url=https://store.ua/category
```

Якщо bridge read не працює, live HTML fallback може допомогти для title/meta/H1, але це не повноцінний product read.

### 4. Check Publish In Dry Run

Перед реальним записом:

- dry-run payload;
- title/meta/H1/content не пусті;
- attributes не містять числовий `Смак`;
- для category/information не додаються кавові product attributes;
- payload mode працює з хостингом.

### 5. Publish With Diagnostics

Після publish bridge має повернути або дати можливість зрозуміти:

- `language_id`;
- affected rows;
- content length;
- readback fields;
- warnings.

Якщо publish `ok`, але live не змінився, перші підозри:

- wrong `language_id`;
- cache;
- theme reads different field;
- old bridge version;
- payload body не розібрався PHP;
- OCMOD/compiled Twig перекриває шаблон.

### 6. Clear Cache

Після theme/Twig/OCMOD змін:

- OpenCart modifications cache;
- theme cache;
- storage/cache, якщо тема використовує compiled cache;
- Cloudflare/page cache, якщо увімкнено;
- browser private window або cache-busted URL.

Після звичайного product content publish cache clear може бути не потрібен, але якщо live verification не бачить змін, cache clear обовʼязковий.

## Right Card Source Of Truth

Для товарної правої картки правило жорстке:

- шкали беруться тільки з `Кислотність`, `Солодкість`, `Тіло`, `Фруктовість`;
- смак береться тільки з точного атрибута `Смак`;
- `Післясмак` не може бути джерелом смакових нот;
- число ніколи не може бути смаковою нотою;
- generator preview має будувати праву картку з тих самих attributes, які підуть у OpenCart;
- live Twig має читати ті самі attributes, а не текст із right-card preview.

Перевірка:

```text
GET /trust/product-consistency?url=https://store.ua/product
```

## Rollback

Якщо deploy зламав live:

1. повернути попередній `mercato-bridge.php`;
2. очистити OpenCart modifications/theme cache;
3. перевірити `bridge?action=version`;
4. перевірити product read;
5. не запускати mass publish до зʼясування причини.

Якщо проблема в Twig:

1. повернути попередній `product.twig` або OCMOD;
2. refresh modifications;
3. clear theme cache;
4. перевірити 1 товар у private window;
5. запустити trust-check.

## Done Criteria

Deploy вважається завершеним тільки якщо:

- version/health OK;
- read works;
- publish або dry-run works;
- readback works;
- live verification works;
- consistency check не має `critical/high` issues;
- rollback path відомий.

