# Mercato ↔ ChatGPT без Work і TinyFish

Це канал виконання запитів тільки на читання через наявний Mercato Bridge та приватний репозиторій Manemi/mercato-ai. Ніякого другого PHP-мосту не потрібно.

## Одноразове налаштування
1. Переконатись, що на хостингу є діючий mercato-bridge.php.
2. GitHub → Manemi/mercato-ai → Settings → Secrets and variables → Actions → New repository secret.
3. Створити секрет із назвою MERCATO_BRIDGE_SECRET, значення: чинний BRIDGE_SECRET з живого PHP-мосту. Не надсилати значення в чат і не додавати до Git.
4. GitHub → Settings → Actions → General → Workflow permissions: дозволити GITHUB_TOKEN право Contents: write, якщо політика репозиторію цього вимагає.
5. Злити Pull Request у main. До злиття ніяких запитів до живого магазину не виконується.

## Робота через ChatGPT та GitHub
ChatGPT створює у репозиторії НОВИЙ файл mercato-ops/requests/20261028-test-health.json з таким JSON:
{"action":"health"}

Подія push запускає GitHub Actions. Скрипт виконує лише GET до існуючого PHP-мосту і записує відповідь в приватний файл mercato-ops/results/20261028-test-health.json. ChatGPT може його прочитати через GitHub-конектор. Імена запитів мають бути унікальними: однаковий запит вдруге не виконується, якщо результат вже існує.

Дозволені дії:
- health або version — без параметрів.
- product_search — {"action":"product_search","params":{"q":"арабіка","limit":10}}
- product_read — {"action":"product_read","params":{"product_id":123}}
- product_audit_list — {"action":"product_audit_list","params":{"page":1,"limit":30}}
- content_read — {"action":"content_read","params":{"type":"category","id":10}}

Запис/видалення товарів, зміна цін, замовлень та особистих даних покупців НА ЦЬОМУ ЕТАПІ НЕДОСТУПНІ. Додати ці дії можна лише з окремою авторизацією, підтвердженням і перевіркою змін.

## Захист
- Репозиторій має залишатися приватним.
- Секрет доступний лише GitHub Actions, не зберігається у файлах чи JSON-результатах.
- PHP-міст історично передає секрет як GET-параметр. Це неідеально через access logs; наступним кроком варто перевести авторизацію на заголовки.
- Адреса мосту зафіксована як HTTPS https://mercato.com.ua/mercato-bridge.php. Довільні адреси і дії заборонені.
- Дії GitHub Actions можуть обмежуватися квотами.
- Коміт у GitHub НЕ означає змін на живому сайті.

## Готовність
Після налаштування перевірити health і product_search, порівняти результати з діючою адмінпанеллю. До успішного тесту write-операції не додавати.
