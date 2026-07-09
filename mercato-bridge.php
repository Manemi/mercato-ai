<?php
// ============================================================
// Mercato AI Bridge — завантажити на хостинг через FileZilla
// Шлях на сервері: /home2/mercatoc/public_html/mercato-bridge.php
// ============================================================
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
ob_start();
register_shutdown_function(function () {
    $error = error_get_last();
    if (!$error || !in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) return;
    while (ob_get_level() > 0) ob_end_clean();
    if (!headers_sent()) header('Content-Type: application/json; charset=utf-8');
    http_response_code(500);
    echo json_encode([
        'error' => 'Bridge PHP fatal error',
        'message' => $error['message'] ?? '',
        'file' => isset($error['file']) ? basename($error['file']) : '',
        'line' => $error['line'] ?? null
    ], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR);
});
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$bridgeSecrets = [];
$bridgeSecretsPath = __DIR__ . '/mercato-bridge-secrets.php';
if (is_readable($bridgeSecretsPath)) {
    $loadedSecrets = require $bridgeSecretsPath;
    if (is_array($loadedSecrets)) $bridgeSecrets = $loadedSecrets;
}

$openCartConfig = __DIR__ . '/config.php';
if (is_readable($openCartConfig)) {
    require_once $openCartConfig;
}

function bridgeValue(array $secrets, string $key, string $envKey = '', $fallback = null) {
    if (array_key_exists($key, $secrets) && $secrets[$key] !== '') return $secrets[$key];
    if ($envKey !== '') {
        $env = getenv($envKey);
        if ($env !== false && $env !== '') return $env;
        if (isset($_SERVER[$envKey]) && $_SERVER[$envKey] !== '') return $_SERVER[$envKey];
    }
    return $fallback;
}

function defineBridgeConstant(string $name, $value): void {
    if (!defined($name) && $value !== null && $value !== '') define($name, $value);
}

defineBridgeConstant('SECRET', bridgeValue($bridgeSecrets, 'BRIDGE_SECRET', 'MERCATO_BRIDGE_SECRET', bridgeValue($bridgeSecrets, 'SECRET')));
defineBridgeConstant('DB_HOST', bridgeValue($bridgeSecrets, 'DB_HOST', 'MERCATO_DB_HOST', defined('DB_HOSTNAME') ? DB_HOSTNAME : null));
defineBridgeConstant('DB_USER', bridgeValue($bridgeSecrets, 'DB_USER', 'MERCATO_DB_USER', defined('DB_USERNAME') ? DB_USERNAME : null));
defineBridgeConstant('DB_PASS', bridgeValue($bridgeSecrets, 'DB_PASS', 'MERCATO_DB_PASS', defined('DB_PASSWORD') ? DB_PASSWORD : null));
defineBridgeConstant('DB_NAME', bridgeValue($bridgeSecrets, 'DB_NAME', 'MERCATO_DB_NAME', defined('DB_DATABASE') ? DB_DATABASE : null));
defineBridgeConstant('PREFIX', bridgeValue($bridgeSecrets, 'PREFIX', 'MERCATO_DB_PREFIX', defined('DB_PREFIX') ? DB_PREFIX : 'oc_'));
defineBridgeConstant('LANG_ID', bridgeValue($bridgeSecrets, 'LANG_ID', 'MERCATO_LANG_ID', 2)); // Ukrainian storefront language in this OpenCart database
define('BRIDGE_VERSION', '2026-07-09-first-order-popup-v37-phone-guard');

// Auth
if (!defined('SECRET') || !SECRET) {
    http_response_code(500);
    echo json_encode(['error' => 'Bridge secret is not configured']);
    exit;
}
if (($_GET['secret'] ?? '') !== SECRET) {
    http_response_code(403);
    echo json_encode(['error' => 'Unauthorized']);
    exit;
}

// DB
foreach (['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'PREFIX'] as $requiredConstant) {
    if (!defined($requiredConstant)) {
        http_response_code(500);
        echo json_encode(['error' => 'Bridge DB config is not complete']);
        exit;
    }
}
$db = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
$db->set_charset('utf8mb4');
if ($db->connect_error) {
    echo json_encode(['error' => 'DB: ' . $db->connect_error]);
    exit;
}

$action = $_GET['action'] ?? '';

function bridgeJson(array $payload): void {
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR);
    exit;
}

if ($action === 'version' || $action === 'health') {
    bridgeJson([
        'ok' => true,
        'version' => BRIDGE_VERSION,
        'language_id' => LANG_ID,
        'prefix' => PREFIX,
        'features' => ['product_search', 'product_read', 'content_read', 'product_audit_list', 'merchant_feed_audit_list', 'merchant_apply_product_patch', 'merchant_feed_overrides', 'seo_apply_product_schema', 'seo_apply_product_basics', 'seo_approved_fixes', 'seo_control_inventory', 'seo_entity_patch', 'seo_managed_schema', 'seo_file_manifest', 'seo_file_read', 'seo_file_patch', 'seo_change_rollback', 'attribute_catalog', 'publish_content', 'product_attributes', 'product_commerce', 'product_publish_now', 'supplier_sync', 'publish_diagnostics', 'publish_readback', 'customer_360', 'create_coupon', 'repair_coupon', 'cleanup_coupons', 'coupon_usage', 'growth_contact_status', 'growth_lead_upsert', 'growth_order_complete', 'growth_second_coupon_sync']
    ]);
}

// ── Допоміжна функція для пошуку ─────────────────────────────
function escLike(mysqli $db, string $s): string {
    return '%' . $db->real_escape_string(str_replace(['%','_'], ['\%','\_'], $s)) . '%';
}

function normalizeRequestPayload(array $data): array {
    foreach (['attributes', 'updates', 'articles', 'pricing', 'supplierLot', 'config', 'input', 'optionPrices', 'productOptions', 'changes'] as $jsonField) {
        if (isset($data[$jsonField]) && is_string($data[$jsonField])) {
            $decoded = json_decode($data[$jsonField], true);
            if (is_array($decoded)) $data[$jsonField] = $decoded;
        }
    }
    return decodeBase64PayloadFields($data);
}

function readJsonBody(): array {
    $raw = file_get_contents('php://input');
    if ($raw) {
        $data = json_decode($raw, true);
        if (is_array($data)) return normalizeRequestPayload($data);

        $parsed = [];
        parse_str($raw, $parsed);
        if (is_array($parsed) && $parsed) return normalizeRequestPayload($parsed);
    }

    $data = $_POST ?: [];
    return is_array($data) ? normalizeRequestPayload($data) : [];
}

function stripMysqlUtf8Incompatible(string $s): string {
    $clean = preg_replace('/[\x{10000}-\x{10FFFF}]/u', '', $s);
    return $clean === null ? $s : $clean;
}

function decodeBase64PayloadFields(array $data): array {
    foreach (['title', 'metaDescription', 'meta_description', 'h1', 'meta_h1', 'productName', 'name', 'content', 'description', 'rightCard', 'right_card'] as $field) {
        $b64Key = $field . '_b64';
        if (!isset($data[$b64Key]) || $data[$b64Key] === '') continue;
        $decoded = base64_decode((string)$data[$b64Key], true);
        if ($decoded !== false) $data[$field] = $decoded;
    }
    return $data;
}

function tableHasColumn(mysqli $db, string $table, string $column): bool {
    $columns = tableColumnMeta($db, $table);
    return isset($columns[$column]);
}

function tableColumnMeta(mysqli $db, string $table): array {
    static $cache = [];
    if (array_key_exists($table, $cache)) return $cache[$table];
    $safeTable = $db->real_escape_string($table);
    $columns = [];
    $res = $db->query("SHOW COLUMNS FROM `$safeTable`");
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $columns[$row['Field']] = $row;
        }
    }
    $cache[$table] = $columns;
    return $cache[$table];
}

function merchantOptionPrice(float $basePrice, float $optionPrice, string $prefix): float {
    if ($prefix === '-') return max(0, $basePrice - $optionPrice);
    if ($prefix === '=') return max(0, $optionPrice);
    return max(0, $basePrice + $optionPrice);
}

function merchantVariantOptionsByProduct(mysqli $db, array $productIds, array $productBases): array {
    $ids = array_values(array_unique(array_filter(array_map('intval', $productIds), function ($id) {
        return $id > 0;
    })));
    if (!$ids) return [];
    foreach (['product_option', 'product_option_value', 'option', 'option_description', 'option_value_description'] as $table) {
        if (!tableExists($db, PREFIX . $table)) return [];
    }
    $poColumns = tableColumnMeta($db, PREFIX . "product_option");
    $povColumns = tableColumnMeta($db, PREFIX . "product_option_value");
    $poField = function (string $field, string $fallback) use ($poColumns): string {
        return isset($poColumns[$field]) ? "po.`$field`" : $fallback;
    };
    $povField = function (string $field, string $fallback) use ($povColumns): string {
        return isset($povColumns[$field]) ? "pov.`$field`" : $fallback;
    };
    $idList = implode(',', $ids);
    $res = $db->query(
        "SELECT po.product_id, po.product_option_id, po.option_id,
                " . $poField('required', '0') . " AS option_required,
                o.type AS option_type, od.name AS option_name,
                pov.product_option_value_id, pov.option_value_id,
                " . $povField('quantity', '0') . " AS option_quantity,
                " . $povField('subtract', '0') . " AS option_subtract,
                " . $povField('price', '0') . " AS option_price,
                " . $povField('price_prefix', "'+'") . " AS option_price_prefix,
                " . $povField('sku', "''") . " AS option_sku,
                " . $povField('model', "''") . " AS option_model,
                " . $povField('image', "''") . " AS option_image,
                ovd.name AS value_name
         FROM " . PREFIX . "product_option po
         JOIN " . PREFIX . "option o ON o.option_id=po.option_id
         LEFT JOIN " . PREFIX . "option_description od
           ON od.option_id=po.option_id AND od.language_id=" . LANG_ID . "
         LEFT JOIN " . PREFIX . "product_option_value pov
           ON pov.product_option_id=po.product_option_id AND pov.product_id=po.product_id
         LEFT JOIN " . PREFIX . "option_value_description ovd
           ON ovd.option_value_id=pov.option_value_id AND ovd.language_id=" . LANG_ID . "
         WHERE po.product_id IN ($idList)
         ORDER BY po.product_id, po.product_option_id, pov.product_option_value_id"
    );
    if (!$res) return [];
    $byProduct = [];
    while ($row = $res->fetch_assoc()) {
        $productId = (int)$row['product_id'];
        $productOptionId = (int)$row['product_option_id'];
        if (!isset($byProduct[$productId])) $byProduct[$productId] = [];
        if (!isset($byProduct[$productId][$productOptionId])) {
            $byProduct[$productId][$productOptionId] = [
                'product_option_id' => $productOptionId,
                'option_id' => (int)$row['option_id'],
                'name' => (string)($row['option_name'] ?? ''),
                'type' => (string)($row['option_type'] ?? ''),
                'required' => (int)($row['option_required'] ?? 0) === 1,
                'values' => []
            ];
        }
        $productOptionValueId = (int)($row['product_option_value_id'] ?? 0);
        if ($productOptionValueId <= 0) continue;
        $delta = (float)($row['option_price'] ?? 0);
        $prefix = (string)($row['option_price_prefix'] ?? '+');
        $quantity = (float)($row['option_quantity'] ?? 0);
        $subtract = (int)($row['option_subtract'] ?? 0) === 1;
        $base = $productBases[$productId] ?? ['price' => 0, 'availability' => 'out_of_stock'];
        $basePrice = (float)($base['price'] ?? 0);
        $baseAvailability = (string)($base['availability'] ?? 'out_of_stock');
        $availability = $subtract && $quantity <= 0 ? 'out_of_stock' : $baseAvailability;
        $optionImage = storeImageUrl((string)($row['option_image'] ?? ''));
        $byProduct[$productId][$productOptionId]['values'][] = [
            'product_option_value_id' => $productOptionValueId,
            'option_value_id' => (int)($row['option_value_id'] ?? 0),
            'name' => (string)($row['value_name'] ?? ''),
            'sku' => (string)($row['option_sku'] ?? ''),
            'model' => (string)($row['option_model'] ?? ''),
            'quantity' => $quantity,
            'subtract' => $subtract,
            'price_delta' => $delta,
            'price_prefix' => $prefix,
            'final_price' => merchantOptionPrice($basePrice, $delta, $prefix),
            'availability' => $availability,
            'image_link' => $optionImage
        ];
    }
    foreach ($byProduct as $productId => $options) {
        $byProduct[$productId] = array_values($options);
    }
    return $byProduct;
}

function sqlString(mysqli $db, string $value): string {
    return "'" . $db->real_escape_string($value) . "'";
}

function sqlDefaultForRequiredColumn(mysqli $db, array $column): string {
    $type = strtolower((string)($column['Type'] ?? ''));
    if (preg_match('/^enum\((.+)\)$/', $type, $m) && preg_match("/'((?:[^'\\\\]|\\\\.)*)'/", $m[1], $em)) {
        return sqlString($db, stripcslashes($em[1]));
    }
    if (strpos($type, 'date') !== false || strpos($type, 'time') !== false || strpos($type, 'year') !== false) {
        if (strpos($type, 'datetime') !== false || strpos($type, 'timestamp') !== false) return sqlString($db, '1970-01-01 00:00:00');
        return sqlString($db, '1970-01-01');
    }
    if (
        strpos($type, 'int') !== false ||
        strpos($type, 'decimal') !== false ||
        strpos($type, 'float') !== false ||
        strpos($type, 'double') !== false ||
        strpos($type, 'real') !== false ||
        strpos($type, 'bit') !== false
    ) {
        return '0';
    }
    return sqlString($db, '');
}

function productDraftInsertSets(mysqli $db, string $model, ?float $price): array {
    $table = PREFIX . "product";
    $columns = tableColumnMeta($db, $table);
    $sets = [];
    $add = function (string $field, string $sqlValue) use (&$sets, $columns): void {
        if (isset($columns[$field])) $sets[$field] = $sqlValue;
    };

    $safeModel = sqlString($db, $model);
    $add('model', $safeModel);
    $add('sku', $safeModel);
    $add('upc', sqlString($db, ''));
    $add('ean', sqlString($db, ''));
    $add('jan', sqlString($db, ''));
    $add('isbn', sqlString($db, ''));
    $add('mpn', sqlString($db, ''));
    $add('location', sqlString($db, ''));
    $add('image', sqlString($db, ''));
    $add('manufacturer_id', '0');
    $add('shipping', '1');
    $add('price', $price !== null ? (string)(float)$price : '0');
    $add('points', '0');
    $add('tax_class_id', '0');
    $add('quantity', '0');
    $add('minimum', '1');
    $add('subtract', '1');
    $add('stock_status_id', '5');
    $add('status', '0');
    $add('viewed', '0');
    $add('sort_order', '0');
    $add('weight', '0');
    $add('weight_class_id', '1');
    $add('length', '0');
    $add('width', '0');
    $add('height', '0');
    $add('length_class_id', '1');
    $add('date_available', 'CURDATE()');
    $add('date_added', 'NOW()');
    $add('date_modified', 'NOW()');

    foreach ($columns as $field => $column) {
        if (isset($sets[$field])) continue;
        if (stripos((string)($column['Extra'] ?? ''), 'auto_increment') !== false) continue;
        if (strtoupper((string)($column['Null'] ?? '')) === 'YES') continue;
        if (array_key_exists('Default', $column) && $column['Default'] !== null) continue;
        $sets[$field] = sqlDefaultForRequiredColumn($db, $column);
    }

    $out = [];
    foreach ($sets as $field => $sqlValue) {
        $out[] = "`" . str_replace("`", "``", $field) . "`=" . $sqlValue;
    }
    return $out;
}

function productIdByModelOrSku(mysqli $db, string $model): int {
    $model = trim($model);
    if ($model === '') return 0;
    $safe = $db->real_escape_string($model);
    $where = "model='$safe'";
    if (tableHasColumn($db, PREFIX . "product", "sku")) {
        $where .= " OR sku='$safe'";
    }
    $res = $db->query(
        "SELECT product_id FROM " . PREFIX . "product
         WHERE $where
         ORDER BY product_id DESC
         LIMIT 1"
    );
    $row = $res ? $res->fetch_assoc() : null;
    return (int)($row['product_id'] ?? 0);
}

function productDescriptionInsertSets(
    mysqli $db,
    int $productId,
    int $languageId,
    string $name,
    string $description,
    string $title,
    string $meta,
    string $h1
): array {
    $table = PREFIX . "product_description";
    $columns = tableColumnMeta($db, $table);
    $sets = [];
    $addInt = function (string $field, int $value) use (&$sets, $columns): void {
        if (isset($columns[$field])) $sets[$field] = (string)$value;
    };
    $addText = function (string $field, string $value) use (&$sets, $columns, $db): void {
        if (isset($columns[$field])) $sets[$field] = sqlString($db, stripMysqlUtf8Incompatible($value));
    };

    $addInt('product_id', $productId);
    $addInt('language_id', $languageId);
    $addText('name', $name);
    $addText('description', $description);
    $addText('tag', '');
    $addText('meta_title', $title);
    $addText('meta_description', $meta);
    $addText('meta_keyword', '');
    $addText('meta_h1', $h1 ?: $name);

    foreach ($columns as $field => $column) {
        if (isset($sets[$field])) continue;
        if (stripos((string)($column['Extra'] ?? ''), 'auto_increment') !== false) continue;
        if (strtoupper((string)($column['Null'] ?? '')) === 'YES') continue;
        if (array_key_exists('Default', $column) && $column['Default'] !== null) continue;
        $sets[$field] = sqlDefaultForRequiredColumn($db, $column);
    }

    $out = [];
    foreach ($sets as $field => $sqlValue) {
        $out[] = "`" . str_replace("`", "``", $field) . "`=" . $sqlValue;
    }
    return $out;
}

function productDescriptionUpdateSets(
    mysqli $db,
    string $name,
    string $description,
    string $title,
    string $meta,
    string $h1
): array {
    $columns = tableColumnMeta($db, PREFIX . "product_description");
    $fields = [
        'name' => $name,
        'description' => $description,
        'meta_title' => $title,
        'meta_description' => $meta,
        'meta_keyword' => ''
    ];
    if (isset($columns['tag'])) $fields['tag'] = '';
    if (isset($columns['meta_h1'])) $fields['meta_h1'] = $h1 ?: $name;

    $sets = [];
    foreach ($fields as $field => $value) {
        if (!isset($columns[$field])) continue;
        $sets[] = "`" . str_replace("`", "``", $field) . "`=" . sqlString($db, stripMysqlUtf8Incompatible((string)$value));
    }
    return $sets;
}

function upsertProductDescriptionRows(
    mysqli $db,
    int $productId,
    string $name,
    string $description,
    string $title,
    string $meta,
    string $h1,
    ?int $onlyLanguageId = null
): array {
    $languageIds = $onlyLanguageId ? [$onlyLanguageId] : allLanguageIds($db);
    $errors = [];
    $written = [];
    foreach ($languageIds as $languageId) {
        $languageId = (int)$languageId;
        $existsRes = $db->query(
            "SELECT product_id FROM " . PREFIX . "product_description
             WHERE product_id=$productId AND language_id=$languageId
             LIMIT 1"
        );
        $exists = $existsRes && $existsRes->num_rows > 0;
        if ($exists) {
            $sets = productDescriptionUpdateSets($db, $name, $description, $title, $meta, $h1);
            $db->query(
                "UPDATE " . PREFIX . "product_description
                 SET " . implode(',', $sets) . "
                 WHERE product_id=$productId AND language_id=$languageId"
            );
        } else {
            $sets = productDescriptionInsertSets($db, $productId, $languageId, $name, $description, $title, $meta, $h1);
            $db->query("INSERT INTO " . PREFIX . "product_description SET " . implode(',', $sets));
        }
        if ($db->error) {
            $errors[] = [
                'language_id' => $languageId,
                'operation' => $exists ? 'update' : 'insert',
                'error' => $db->error
            ];
        } else {
            $written[] = ['language_id' => $languageId, 'operation' => $exists ? 'update' : 'insert'];
        }
    }
    return [
        'ok' => !$errors,
        'written' => $written,
        'errors' => $errors,
        'languageRows' => productDescriptionLanguageRows($db, $productId)
    ];
}

function tableExists(mysqli $db, string $table): bool {
    static $cache = [];
    if (!empty($cache[$table])) return true;
    $safeTable = $db->real_escape_string($table);
    $res = $db->query("SHOW TABLES LIKE '$safeTable'");
    $cache[$table] = $res && $res->num_rows > 0;
    return $cache[$table];
}

function routeUrl(mysqli $db, string $query): string {
    $query = $db->real_escape_string($query);
    $res = $db->query("SELECT keyword FROM " . PREFIX . "seo_url WHERE query = '$query' AND language_id = " . LANG_ID . " LIMIT 1");
    $row = $res ? $res->fetch_assoc() : null;
    return $row && !empty($row['keyword']) ? 'https://mercato.com.ua/' . $row['keyword'] : '';
}

function seoKeywordForQuery(mysqli $db, string $query): string {
    if (!tableExists($db, PREFIX . "seo_url")) return '';
    $queryEsc = $db->real_escape_string($query);
    $res = $db->query(
        "SELECT keyword FROM " . PREFIX . "seo_url
         WHERE query='$queryEsc'
         ORDER BY (language_id=" . LANG_ID . ") DESC, seo_url_id DESC
         LIMIT 1"
    );
    $row = $res ? $res->fetch_assoc() : null;
    return trim((string)($row['keyword'] ?? ''));
}

function storeBaseUrl(): string {
    if (defined('HTTPS_SERVER') && HTTPS_SERVER) return rtrim(HTTPS_SERVER, '/');
    if (defined('HTTP_SERVER') && HTTP_SERVER) return preg_replace('/^http:/', 'https:', rtrim(HTTP_SERVER, '/'));
    return 'https://mercato.com.ua';
}

function storeImageUrl(string $image): string {
    $image = trim($image);
    if ($image === '') return '';
    if (preg_match('/^https?:\/\//i', $image)) return $image;
    return storeBaseUrl() . '/image/' . ltrim($image, '/');
}

function storeImageInfo(string $image): array {
    $relative = ltrim(trim($image), '/');
    if ($relative === '') return ['width' => 0, 'height' => 0, 'bytes' => 0, 'exists' => false];
    $base = defined('DIR_IMAGE') ? rtrim(DIR_IMAGE, '/\\') . DIRECTORY_SEPARATOR : __DIR__ . DIRECTORY_SEPARATOR . 'image' . DIRECTORY_SEPARATOR;
    $file = $base . $relative;
    if (!is_readable($file)) return ['width' => 0, 'height' => 0, 'bytes' => 0, 'exists' => false];
    $size = @getimagesize($file);
    return [
        'width' => is_array($size) ? (int)($size[0] ?? 0) : 0,
        'height' => is_array($size) ? (int)($size[1] ?? 0) : 0,
        'bytes' => (int)(@filesize($file) ?: 0),
        'exists' => true
    ];
}

function jsonLdScript(array $data): string {
    $json = json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR
    );
    if (!is_string($json) || $json === '') $json = '{}';
    return '<script type="application/ld+json">' . $json . '</script>';
}

function replaceMarkedBlock(string $content, string $start, string $end, string $block): array {
    $pattern = '/' . preg_quote($start, '/') . '[\s\S]*?' . preg_quote($end, '/') . '/u';
    if (preg_match($pattern, $content)) {
        return [preg_replace($pattern, $block, $content), 'updated'];
    }
    $separator = trim($content) === '' ? '' : "\n\n";
    return [$content . $separator . $block, 'inserted'];
}

function prependMarkedBlock(string $content, string $start, string $end, string $block): array {
    $pattern = '/' . preg_quote($start, '/') . '[\s\S]*?' . preg_quote($end, '/') . '/u';
    if (preg_match($pattern, $content)) {
        return [preg_replace($pattern, $block, $content), 'updated'];
    }
    $separator = trim($content) === '' ? '' : "\n\n";
    return [$block . $separator . $content, 'inserted'];
}

function plainDescriptionText(string $html): string {
    $htmlFlags = defined('ENT_HTML5') ? (ENT_QUOTES | ENT_HTML5) : ENT_QUOTES;
    $text = trim(strip_tags(html_entity_decode($html, $htmlFlags, 'UTF-8')));
    $text = preg_replace('/\s+/u', ' ', $text);
    return trim($text ?: '');
}

function seoTrimText(string $text, int $max): string {
    $text = trim(stripMysqlUtf8Incompatible(preg_replace('/\s+/u', ' ', $text) ?: $text));
    if ($text === '') return '';
    if (function_exists('mb_strlen') && mb_strlen($text, 'UTF-8') > $max) {
        return rtrim(mb_substr($text, 0, max(1, $max - 3), 'UTF-8'), " \t\n\r\0\x0B.,;:-") . '...';
    }
    if (!function_exists('mb_strlen') && strlen($text) > $max) {
        return rtrim(substr($text, 0, max(1, $max - 3)), " \t\n\r\0\x0B.,;:-") . '...';
    }
    return $text;
}

function productIdByUrlOrSlug(mysqli $db, string $url, string $slug, int $directId = 0): int {
    if ($directId > 0) {
        $res = $db->query("SELECT product_id FROM " . PREFIX . "product WHERE product_id = " . (int)$directId . " LIMIT 1");
        if ($res && $res->num_rows > 0) return (int)$directId;
    }
    if ($url) {
        $query = parse_url($url, PHP_URL_QUERY) ?: '';
        parse_str($query, $params);
        if (!empty($params['product_id'])) {
            $id = (int)$params['product_id'];
            $res = $db->query("SELECT product_id FROM " . PREFIX . "product WHERE product_id = $id LIMIT 1");
            if ($res && $res->num_rows > 0) return $id;
        }
    }
    $slug = trim($slug);
    if (!$slug && $url) {
        $path = parse_url($url, PHP_URL_PATH) ?: '';
        $parts = array_values(array_filter(explode('/', $path)));
        $slug = $parts ? urldecode(end($parts)) : '';
    }
    if (!$slug) return 0;
    $slugEsc = $db->real_escape_string($slug);
    $res = $db->query(
        "SELECT query FROM " . PREFIX . "seo_url
         WHERE keyword = '$slugEsc' AND query LIKE 'product_id=%'
         ORDER BY language_id = " . LANG_ID . " DESC
         LIMIT 1"
    );
    $row = $res ? $res->fetch_assoc() : null;
    if (!$row) return 0;
    return (int)str_replace('product_id=', '', $row['query']);
}

function categoryIdByUrlOrSlug(mysqli $db, string $url, string $slug): int {
    $slug = trim($slug);
    if (!$slug && $url) {
        $path = parse_url($url, PHP_URL_PATH) ?: '';
        $parts = array_values(array_filter(explode('/', $path)));
        $slug = $parts ? urldecode(end($parts)) : '';
    }
    if (!$slug) return 0;
    $slugEsc = $db->real_escape_string($slug);
    $res = $db->query(
        "SELECT query FROM " . PREFIX . "seo_url
         WHERE keyword = '$slugEsc' AND query LIKE 'category_id=%'
         ORDER BY language_id = " . LANG_ID . " DESC
         LIMIT 1"
    );
    $row = $res ? $res->fetch_assoc() : null;
    if (!$row) return 0;
    return (int)str_replace('category_id=', '', $row['query']);
}

function informationIdByUrlOrSlug(mysqli $db, string $url, string $slug): int {
    $slug = trim($slug);
    if (!$slug && $url) {
        $path = parse_url($url, PHP_URL_PATH) ?: '';
        $parts = array_values(array_filter(explode('/', $path)));
        $slug = $parts ? urldecode(end($parts)) : '';
    }
    if (!$slug) return 0;
    $slugEsc = $db->real_escape_string($slug);
    $res = $db->query(
        "SELECT query FROM " . PREFIX . "seo_url
         WHERE keyword = '$slugEsc' AND query LIKE 'information_id=%'
         ORDER BY language_id = " . LANG_ID . " DESC
         LIMIT 1"
    );
    $row = $res ? $res->fetch_assoc() : null;
    if (!$row) return 0;
    return (int)str_replace('information_id=', '', $row['query']);
}

function attributeGroupForName(string $name): string {
    $profile = ['Кислотність','Післясмак','Солодкість','Тіло','Фруктовість'];
    $main = ['Смак','Ступінь обсмаження','Країна походження','Врожай','Спосіб обробки','Категорія','Регіон','Ферма','Оцінка SCA','Тип чаю','Температура заварювання','Час настоювання','Кількість настоїв','Кому підійде'];
    $supplier = ['Постачальник','Артикул Coffeeton','Статус постачальника','Ціна постачальника UAH/кг','Ціна постачальника USD/кг'];
    $lot = ['Якість зерна','Вид кави','Вага мішка','Різновид','Рекомендація','Склад набору','Формат','Подарунковий формат'];
    if (in_array($name, $profile, true)) return 'Характеристики';
    if (in_array($name, $main, true)) return 'Головні';
    if (in_array($name, $supplier, true)) return 'Постачальник';
    if (in_array($name, $lot, true)) return 'Лот';
    return 'Загальні';
}

function ensureAttributeGroup(mysqli $db, string $name): int {
    $nameEsc = $db->real_escape_string($name);
    $res = $db->query(
        "SELECT attribute_group_id FROM " . PREFIX . "attribute_group_description
         WHERE language_id = " . LANG_ID . " AND name = '$nameEsc'
         LIMIT 1"
    );
    $row = $res ? $res->fetch_assoc() : null;
    if ($row) return (int)$row['attribute_group_id'];

    $db->query("INSERT INTO " . PREFIX . "attribute_group SET sort_order = 999");
    $id = (int)$db->insert_id;
    $db->query(
        "INSERT INTO " . PREFIX . "attribute_group_description
         SET attribute_group_id=$id, language_id=" . LANG_ID . ", name='$nameEsc'"
    );
    return $id;
}

function findAttributeId(mysqli $db, string $name): int {
    $nameEsc = $db->real_escape_string($name);
    $res = $db->query(
        "SELECT attribute_id FROM " . PREFIX . "attribute_description
         WHERE language_id = " . LANG_ID . " AND name = '$nameEsc'
         LIMIT 1"
    );
    $row = $res ? $res->fetch_assoc() : null;
    return $row ? (int)$row['attribute_id'] : 0;
}

function ensureAttribute(mysqli $db, string $name): int {
    $existing = findAttributeId($db, $name);
    if ($existing) return $existing;

    $nameEsc = $db->real_escape_string($name);
    $groupId = ensureAttributeGroup($db, attributeGroupForName($name));
    $db->query("INSERT INTO " . PREFIX . "attribute SET attribute_group_id=$groupId, sort_order=999");
    $id = (int)$db->insert_id;
    $db->query(
        "INSERT INTO " . PREFIX . "attribute_description
         SET attribute_id=$id, language_id=" . LANG_ID . ", name='$nameEsc'"
    );
    return $id;
}

function plainAttributeText($value): string {
    $text = strip_tags((string)$value);
    $text = preg_replace('/\s+/u', ' ', $text);
    return trim($text ?? '');
}

function canonicalAttributeName(string $name): string {
    $clean = plainAttributeText($name);
    return $clean;
}

function isNumericScaleAttributeText(string $value): bool {
    $plain = plainAttributeText($value);
    $text = function_exists('mb_strtolower') ? mb_strtolower($plain, 'UTF-8') : strtolower($plain);
    if ($text === '') return false;
    if (preg_match('/^[\d\s.,:\/+\-]+$/u', $text)) return true;
    if (preg_match('/^\d+(?:[\.,]\d+)?\s*(?:\/|з|із|из|out\s+of)\s*\d+/iu', $text)) return true;
    if (preg_match('/^(?:низька|середня|висока|medium|low|high|баланс|збалансовано|мʼяка|м\'яка)\s*\d*(?:[\.,]\d+)?$/iu', $text)) return true;
    return false;
}

function isUsefulTasteAttributeValue(string $value): bool {
    $text = plainAttributeText($value);
    if ($text === '') return false;
    if (!preg_match('/[A-Za-zА-Яа-яІіЇїЄєҐґ]/u', $text)) return false;
    if (isNumericScaleAttributeText($text)) return false;
    if (preg_match('/^(смак|кислотність|солодкість|тіло|післясмак|фруктовість)$/iu', $text)) return false;
    return true;
}

function sanitizeProductAttributeValue(string $name, $rawValue): string {
    $value = plainAttributeText(stripMysqlUtf8Incompatible((string)$rawValue));
    return $value;
}

function attributeCatalog(mysqli $db): array {
    $rows = [];
    $res = $db->query(
        "SELECT a.attribute_id, ad.name, COALESCE(agd.name, '') AS group_name, a.sort_order
         FROM " . PREFIX . "attribute a
         JOIN " . PREFIX . "attribute_description ad
           ON ad.attribute_id = a.attribute_id AND ad.language_id = " . LANG_ID . "
         LEFT JOIN " . PREFIX . "attribute_group_description agd
           ON agd.attribute_group_id = a.attribute_group_id AND agd.language_id = " . LANG_ID . "
         ORDER BY group_name ASC, a.sort_order ASC, ad.name ASC"
    );
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $rows[] = $row;
        }
    }
    return $rows;
}

function updateProductAttributes(mysqli $db, int $productId, array $attributes): array {
    $written = [];
    foreach ($attributes as $name => $rawValue) {
        $name = canonicalAttributeName(stripMysqlUtf8Incompatible((string)$name));
        if ($name === '') continue;
        $value = sanitizeProductAttributeValue($name, $rawValue);

        $attributeId = findAttributeId($db, $name);
        if ($value === '' && !$attributeId) continue;
        if (!$attributeId) $attributeId = ensureAttribute($db, $name);

        $db->query(
            "DELETE FROM " . PREFIX . "product_attribute
             WHERE product_id=$productId AND attribute_id=$attributeId AND language_id=" . LANG_ID
        );
        if ($value === '') continue;

        $db->query(
            "INSERT INTO " . PREFIX . "product_attribute
             SET product_id=$productId,
                 attribute_id=$attributeId,
                 language_id=" . LANG_ID . ",
                 text='" . $db->real_escape_string($value) . "'"
        );
        $written[$name] = $value;
    }
    return $written;
}

function supplierArticleKey(string $article): string {
    return strtoupper(preg_replace('/\s+/u', '', trim($article)));
}

function supplierArticleList($raw): array {
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $raw = $decoded;
        } else {
            $raw = preg_split('/[\s,;]+/u', $raw);
        }
    }
    if (!is_array($raw)) return [];
    $out = [];
    foreach ($raw as $item) {
        $article = supplierArticleKey((string)$item);
        if ($article !== '') $out[$article] = $article;
    }
    return array_values($out);
}

function productAttributesMapForIds(mysqli $db, array $productIds): array {
    $ids = [];
    foreach ($productIds as $id) {
        $id = (int)$id;
        if ($id > 0) $ids[$id] = $id;
    }
    if (!$ids) return [];
    $attrs = [];
    $res = $db->query(
        "SELECT pa.product_id, ad.name, pa.text
         FROM " . PREFIX . "product_attribute pa
         JOIN " . PREFIX . "attribute_description ad
           ON ad.attribute_id = pa.attribute_id AND ad.language_id = pa.language_id
         WHERE pa.language_id=" . LANG_ID . " AND pa.product_id IN (" . implode(',', $ids) . ")
         ORDER BY ad.name"
    );
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $pid = (int)$row['product_id'];
            if (!isset($attrs[$pid])) $attrs[$pid] = [];
            $attrs[$pid][$row['name']] = $row['text'];
        }
    }
    return $attrs;
}

function allLanguageIds(mysqli $db): array {
    $ids = [];
    $res = $db->query("SELECT language_id FROM " . PREFIX . "language ORDER BY language_id");
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $id = (int)$row['language_id'];
            if ($id > 0) $ids[] = $id;
        }
    }
    if (!in_array((int)LANG_ID, $ids, true)) $ids[] = (int)LANG_ID;
    return array_values(array_unique($ids));
}

function productDraftModelFromPayload(array $body, array $attributes): string {
    $candidates = [
        $body['model'] ?? '',
        $body['sku'] ?? '',
        $attributes['Артикул Coffeeton'] ?? '',
        $attributes['Артикул'] ?? ''
    ];
    foreach ($candidates as $candidate) {
        $clean = strtoupper(preg_replace('/[^A-Z0-9_-]/i', '', trim((string)$candidate)));
        if ($clean !== '') return substr($clean, 0, 64);
    }
    return 'AI-' . date('Ymd-His');
}

function moneyValue($raw): ?float {
    if (is_numeric($raw)) {
        $price = (float)$raw;
        return $price > 0 ? $price : null;
    }
    $text = trim((string)$raw);
    if ($text === '') return null;
    $text = preg_replace('/[^\d,.\-]/u', '', $text);
    if (strpos($text, ',') !== false && strpos($text, '.') !== false) {
        $text = str_replace(',', '', $text);
    } else {
        $text = str_replace(',', '.', $text);
    }
    if (!is_numeric($text)) return null;
    $price = (float)$text;
    return $price > 0 ? $price : null;
}

function nestedPayloadValue(array $source, array $path) {
    $current = $source;
    foreach ($path as $part) {
        if (!is_array($current) || !array_key_exists($part, $current)) return null;
        $current = $current[$part];
    }
    return $current;
}

function priceFromPayload(array $body): ?float {
    foreach (['price', 'opencart_price'] as $field) {
        if (array_key_exists($field, $body)) {
            $value = moneyValue($body[$field]);
            if ($value !== null) return $value;
        }
    }

    $pricing = isset($body['pricing']) && is_array($body['pricing']) ? $body['pricing'] : [];
    foreach ([
        ['recommendedOpenCartPrice'],
        ['sitePrices', 'g250', 'value'],
        ['sitePrices', 'g250', 'displayValue'],
        ['sitePrices', '250', 'value'],
        ['sitePrices', '250', 'displayValue']
    ] as $path) {
        $value = moneyValue(nestedPayloadValue($pricing, $path));
        if ($value !== null) return $value;
    }

    $optionPrices = isset($body['optionPrices']) && is_array($body['optionPrices']) ? $body['optionPrices'] : [];
    foreach (['g250', '250'] as $key) {
        if (array_key_exists($key, $optionPrices)) {
            $value = moneyValue($optionPrices[$key]);
            if ($value !== null) return $value;
        }
    }
    return null;
}

function optionPriceMapFromPayload(array $body): array {
    $map = [];
    $optionPrices = isset($body['optionPrices']) && is_array($body['optionPrices']) ? $body['optionPrices'] : [];
    $pricing = isset($body['pricing']) && is_array($body['pricing']) ? $body['pricing'] : [];
    $keys = [
        100 => ['g100', '100'],
        250 => ['g250', '250'],
        1000 => ['g1000', '1000', 'kg1000']
    ];
    foreach ($keys as $grams => $aliases) {
        foreach ($aliases as $alias) {
            if (array_key_exists($alias, $optionPrices)) {
                $value = moneyValue($optionPrices[$alias]);
                if ($value !== null) {
                    $map[$grams] = $value;
                    break;
                }
            }
            $value = moneyValue(nestedPayloadValue($pricing, ['sitePrices', $alias, 'value']));
            if ($value === null) $value = moneyValue(nestedPayloadValue($pricing, ['sitePrices', $alias, 'displayValue']));
            if ($value !== null) {
                $map[$grams] = $value;
                break;
            }
        }
    }
    return $map;
}

function requestedManufacturerName(array $body): string {
    $name = trim((string)($body['manufacturerName'] ?? ($body['manufacturer_name'] ?? ($body['manufacturer'] ?? ''))));
    return $name !== '' ? $name : 'Mercato';
}

function ensureManufacturer(mysqli $db, string $name): array {
    $name = trim(stripMysqlUtf8Incompatible($name));
    if ($name === '' || !tableExists($db, PREFIX . "manufacturer")) {
        return ['ok' => false, 'id' => 0, 'name' => $name, 'error' => 'manufacturer table not found or name is empty'];
    }
    $nameEsc = $db->real_escape_string($name);
    $res = $db->query(
        "SELECT manufacturer_id, name
         FROM " . PREFIX . "manufacturer
         WHERE LOWER(name)=LOWER('$nameEsc')
         LIMIT 1"
    );
    $row = $res ? $res->fetch_assoc() : null;
    if ($row) {
        $id = (int)$row['manufacturer_id'];
    } else {
        $columns = tableColumnMeta($db, PREFIX . "manufacturer");
        $sets = [];
        if (isset($columns['name'])) $sets['name'] = sqlString($db, $name);
        if (isset($columns['image'])) $sets['image'] = sqlString($db, '');
        if (isset($columns['sort_order'])) $sets['sort_order'] = '0';
        foreach ($columns as $field => $column) {
            if (isset($sets[$field])) continue;
            if (stripos((string)($column['Extra'] ?? ''), 'auto_increment') !== false) continue;
            if (strtoupper((string)($column['Null'] ?? '')) === 'YES') continue;
            if (array_key_exists('Default', $column) && $column['Default'] !== null) continue;
            $sets[$field] = sqlDefaultForRequiredColumn($db, $column);
        }
        $sqlSets = [];
        foreach ($sets as $field => $sqlValue) {
            $sqlSets[] = "`" . str_replace("`", "``", $field) . "`=" . $sqlValue;
        }
        $db->query("INSERT INTO " . PREFIX . "manufacturer SET " . implode(',', $sqlSets));
        if ($db->error) return ['ok' => false, 'id' => 0, 'name' => $name, 'error' => $db->error];
        $id = (int)$db->insert_id;
    }

    if ($id > 0 && tableExists($db, PREFIX . "manufacturer_to_store")) {
        $db->query("INSERT IGNORE INTO " . PREFIX . "manufacturer_to_store SET manufacturer_id=$id, store_id=0");
    }
    return ['ok' => $id > 0, 'id' => $id, 'name' => $name];
}

function merchantOverrideTable(): string {
    return PREFIX . 'mercato_merchant_override';
}

function merchantTextLength(string $value): int {
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function ensureMerchantOverrideTable(mysqli $db): void {
    $table = merchantOverrideTable();
    $db->query(
        "CREATE TABLE IF NOT EXISTS `$table` (
            product_id INT UNSIGNED NOT NULL,
            feed_title VARCHAR(255) NOT NULL DEFAULT '',
            feed_description MEDIUMTEXT NOT NULL,
            identifier_exists TINYINT(1) NULL DEFAULT NULL,
            approval_id VARCHAR(128) NOT NULL DEFAULT '',
            date_modified DATETIME NOT NULL,
            PRIMARY KEY (product_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    if ($db->error) throw new Exception($db->error);
}

function merchantOverrideSnapshot(mysqli $db, int $productId): array {
    $table = merchantOverrideTable();
    if (!tableExists($db, $table)) {
        return [
            'found' => false,
            'product_id' => $productId,
            'feed_title' => '',
            'feed_description' => '',
            'identifier_exists' => null
        ];
    }
    $res = $db->query(
        "SELECT product_id, feed_title, feed_description, identifier_exists, approval_id, date_modified
         FROM `$table`
         WHERE product_id=$productId
         LIMIT 1"
    );
    $row = $res ? $res->fetch_assoc() : null;
    if (!$row) {
        return [
            'found' => false,
            'product_id' => $productId,
            'feed_title' => '',
            'feed_description' => '',
            'identifier_exists' => null
        ];
    }
    return [
        'found' => true,
        'product_id' => (int)$row['product_id'],
        'feed_title' => (string)($row['feed_title'] ?? ''),
        'feed_description' => (string)($row['feed_description'] ?? ''),
        'identifier_exists' => $row['identifier_exists'] === null ? null : (bool)$row['identifier_exists'],
        'approval_id' => (string)($row['approval_id'] ?? ''),
        'date_modified' => (string)($row['date_modified'] ?? '')
    ];
}

function merchantProductPatchSnapshot(mysqli $db, int $productId): array {
    $productColumns = tableColumnMeta($db, PREFIX . 'product');
    $identifierFields = array_values(array_filter(['gtin', 'ean', 'upc', 'jan', 'isbn'], function ($field) use ($productColumns) {
        return isset($productColumns[$field]);
    }));
    $identifierSelect = '';
    foreach ($identifierFields as $field) {
        $identifierSelect .= ", p.`$field` AS `$field`";
    }
    $res = $db->query(
        "SELECT p.product_id, p.manufacturer_id, p.date_modified, m.name AS manufacturer $identifierSelect
         FROM " . PREFIX . "product p
         LEFT JOIN " . PREFIX . "manufacturer m ON m.manufacturer_id=p.manufacturer_id
         WHERE p.product_id=$productId
         LIMIT 1"
    );
    $row = $res ? $res->fetch_assoc() : null;
    if (!$row) return ['found' => false, 'product_id' => $productId];
    $identifiers = [];
    foreach ($identifierFields as $field) {
        $identifiers[$field] = trim((string)($row[$field] ?? ''));
    }
    return [
        'found' => true,
        'product_id' => (int)$row['product_id'],
        'manufacturer_id' => (int)($row['manufacturer_id'] ?? 0),
        'brand' => trim((string)($row['manufacturer'] ?? '')),
        'identifiers' => $identifiers,
        'override' => merchantOverrideSnapshot($db, $productId),
        'date_modified' => $row['date_modified'] ?? ''
    ];
}

function categoryCandidateNames(array $body, array $attributes, string $name): array {
    $candidates = [];
    foreach (['categoryName', 'category_name', 'defaultCategoryName'] as $field) {
        $value = trim((string)($body[$field] ?? ''));
        if ($value !== '') $candidates[] = $value;
    }
    foreach (['Категорія OpenCart', 'Категорія товару'] as $field) {
        $value = trim((string)($attributes[$field] ?? ''));
        if ($value !== '') $candidates[] = $value;
    }
    $attributeText = '';
    foreach ($attributes as $value) {
        if (is_scalar($value)) $attributeText .= ' ' . (string)$value;
    }
    $categorySource = $name . ' ' . $attributeText;
    if (preg_match('/набір|набор|подар|gift|box|бокс|дегустац/iu', $categorySource)) {
        if (preg_match('/чай|tea|matcha|матча|улун|пуер|сенча|ройбуш|каркаде/iu', $categorySource)) {
            $candidates[] = 'Набори чаю';
            $candidates[] = 'Чай';
        } elseif (preg_match('/кава|coffee|arabica|робуста|espresso|еспресо/iu', $categorySource)) {
            $candidates[] = 'Набори кави';
            $candidates[] = 'Кава в зернах';
        } else {
            $candidates[] = 'Подарункові набори';
            $candidates[] = 'Набори кави';
            $candidates[] = 'Чай';
        }
    } elseif (preg_match('/чай|tea|matcha|матча|улун|пуер|сенча|ройбуш|каркаде/iu', $categorySource)) {
        $candidates[] = 'Чай';
    } elseif (preg_match('/кава|coffee|arabica|робуста|washed|natural|honey/iu', $categorySource)) {
        $candidates[] = 'Кава в зернах';
        $candidates[] = 'Кава';
    }
    if (preg_match('/чай|tea|matcha|матча|улун|пуер|сенча|ройбуш|каркаде/iu', $categorySource)) {
        $candidates[] = 'Чай';
    } elseif (preg_match('/набір|набор|подар|gift|box|бокс|дегустац/iu', $categorySource)) {
        $candidates[] = 'Набори кави';
        $candidates[] = 'Подарункові набори';
        $candidates[] = 'Кава в зернах';
    } else {
        $candidates[] = 'Кава в зернах';
    }
    return array_values(array_unique(array_filter($candidates, function ($value) {
        return trim((string)$value) !== '';
    })));
}

function findCategoryByName(mysqli $db, string $name): array {
    if (!tableExists($db, PREFIX . "category_description")) return ['id' => 0, 'name' => '', 'matched' => ''];
    $name = trim(stripMysqlUtf8Incompatible($name));
    if ($name === '') return ['id' => 0, 'name' => '', 'matched' => ''];
    $nameEsc = $db->real_escape_string($name);
    $joinCategory = tableExists($db, PREFIX . "category");
    $statusField = $joinCategory && tableHasColumn($db, PREFIX . "category", "status") ? ", c.status" : ", 1 AS status";
    $join = $joinCategory ? "LEFT JOIN " . PREFIX . "category c ON c.category_id=cd.category_id" : "";
    foreach (['exact', 'like'] as $mode) {
        $where = $mode === 'exact'
            ? "cd.name='$nameEsc'"
            : "cd.name LIKE '" . escLike($db, $name) . "'";
        $res = $db->query(
            "SELECT cd.category_id, cd.name, cd.language_id $statusField
             FROM " . PREFIX . "category_description cd
             $join
             WHERE $where
             ORDER BY (cd.language_id=" . LANG_ID . ") DESC, status DESC, cd.category_id DESC
             LIMIT 1"
        );
        $row = $res ? $res->fetch_assoc() : null;
        if ($row) {
            return [
                'id' => (int)$row['category_id'],
                'name' => (string)$row['name'],
                'matched' => $mode
            ];
        }
    }
    return ['id' => 0, 'name' => '', 'matched' => ''];
}

function ensureProductCategory(mysqli $db, int $productId, array $body, array $attributes, string $name): array {
    if (!tableExists($db, PREFIX . "product_to_category")) {
        return ['ok' => false, 'id' => 0, 'name' => '', 'error' => 'product_to_category table not found'];
    }
    $categoryId = (int)($body['categoryId'] ?? ($body['category_id'] ?? 0));
    $categoryName = '';
    $matched = 'id';
    if ($categoryId <= 0) {
        foreach (categoryCandidateNames($body, $attributes, $name) as $candidateName) {
            $found = findCategoryByName($db, $candidateName);
            if (!empty($found['id'])) {
                $categoryId = (int)$found['id'];
                $categoryName = $found['name'];
                $matched = $found['matched'];
                break;
            }
        }
    }
    if ($categoryId <= 0) {
        return ['ok' => false, 'id' => 0, 'name' => '', 'error' => 'category not found'];
    }
    if ($categoryName === '' && tableExists($db, PREFIX . "category_description")) {
        $res = $db->query(
            "SELECT name FROM " . PREFIX . "category_description
             WHERE category_id=$categoryId
             ORDER BY (language_id=" . LANG_ID . ") DESC
             LIMIT 1"
        );
        $row = $res ? $res->fetch_assoc() : null;
        $categoryName = (string)($row['name'] ?? '');
    }

    $columns = tableColumnMeta($db, PREFIX . "product_to_category");
    $sets = [];
    if (isset($columns['product_id'])) $sets['product_id'] = (string)$productId;
    if (isset($columns['category_id'])) $sets['category_id'] = (string)$categoryId;
    if (isset($columns['main_category'])) $sets['main_category'] = '1';
    foreach ($columns as $field => $column) {
        if (isset($sets[$field])) continue;
        if (stripos((string)($column['Extra'] ?? ''), 'auto_increment') !== false) continue;
        if (strtoupper((string)($column['Null'] ?? '')) === 'YES') continue;
        if (array_key_exists('Default', $column) && $column['Default'] !== null) continue;
        $sets[$field] = sqlDefaultForRequiredColumn($db, $column);
    }
    $sqlSets = [];
    foreach ($sets as $field => $sqlValue) {
        $sqlSets[] = "`" . str_replace("`", "``", $field) . "`=" . $sqlValue;
    }
    if (isset($columns['main_category'])) {
        $db->query("UPDATE " . PREFIX . "product_to_category SET main_category=0 WHERE product_id=$productId");
    }
    $db->query("DELETE FROM " . PREFIX . "product_to_category WHERE product_id=$productId AND category_id=$categoryId");
    $db->query("INSERT INTO " . PREFIX . "product_to_category SET " . implode(',', $sqlSets));
    $error = $db->error;
    if (tableHasColumn($db, PREFIX . "product", "main_category_id")) {
        $db->query("UPDATE " . PREFIX . "product SET main_category_id=$categoryId WHERE product_id=$productId");
    }
    return [
        'ok' => !$error,
        'id' => $categoryId,
        'name' => $categoryName,
        'matched' => $matched,
        'error' => $error
    ];
}

function transliterateSlugText(string $text): string {
    $map = [
        'А'=>'A','Б'=>'B','В'=>'V','Г'=>'H','Ґ'=>'G','Д'=>'D','Е'=>'E','Є'=>'Ye','Ж'=>'Zh','З'=>'Z','И'=>'Y','І'=>'I','Ї'=>'Yi','Й'=>'Y','К'=>'K','Л'=>'L','М'=>'M','Н'=>'N','О'=>'O','П'=>'P','Р'=>'R','С'=>'S','Т'=>'T','У'=>'U','Ф'=>'F','Х'=>'Kh','Ц'=>'Ts','Ч'=>'Ch','Ш'=>'Sh','Щ'=>'Shch','Ь'=>'','Ю'=>'Yu','Я'=>'Ya',
        'а'=>'a','б'=>'b','в'=>'v','г'=>'h','ґ'=>'g','д'=>'d','е'=>'e','є'=>'ye','ж'=>'zh','з'=>'z','и'=>'y','і'=>'i','ї'=>'yi','й'=>'y','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o','п'=>'p','р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'kh','ц'=>'ts','ч'=>'ch','ш'=>'sh','щ'=>'shch','ь'=>'','ю'=>'yu','я'=>'ya',
        'Ё'=>'Yo','ё'=>'yo','Ы'=>'Y','ы'=>'y','Э'=>'E','э'=>'e','Ъ'=>'','ъ'=>''
    ];
    return strtr($text, $map);
}

function seoKeywordFromPayload(array $body, string $name, string $model, int $productId): string {
    $keyword = trim((string)($body['seoKeyword'] ?? ($body['seo_keyword'] ?? '')));
    if ($keyword === '') $keyword = $name;
    $keyword = html_entity_decode(strip_tags($keyword), ENT_QUOTES, 'UTF-8');
    $keyword = transliterateSlugText($keyword);
    $keyword = function_exists('mb_strtolower') ? mb_strtolower($keyword, 'UTF-8') : strtolower($keyword);
    $keyword = preg_replace('/[^a-z0-9]+/i', '-', $keyword);
    $keyword = trim((string)$keyword, '-');
    if ($keyword === '') $keyword = 'product-' . $productId;
    if (!preg_match('/\d/', $keyword) && $model !== '') $keyword .= '-' . strtolower(preg_replace('/[^a-z0-9]+/i', '-', $model));
    return substr(trim($keyword, '-'), 0, 120);
}

function uniqueSeoKeyword(mysqli $db, string $keyword, string $query): string {
    if (!tableExists($db, PREFIX . "seo_url")) return $keyword;
    $base = substr(trim($keyword, '-'), 0, 100);
    if ($base === '') $base = 'product';
    $candidate = $base;
    $suffix = 2;
    while (true) {
        $kwEsc = $db->real_escape_string($candidate);
        $queryEsc = $db->real_escape_string($query);
        $res = $db->query(
            "SELECT seo_url_id FROM " . PREFIX . "seo_url
             WHERE keyword='$kwEsc' AND query<>'$queryEsc'
             LIMIT 1"
        );
        if (!$res || $res->num_rows === 0) return $candidate;
        $candidate = substr($base, 0, 100 - strlen((string)$suffix) - 1) . '-' . $suffix;
        $suffix++;
    }
}

function seoUrlInsertSets(mysqli $db, int $storeId, int $languageId, string $query, string $keyword): array {
    $columns = tableColumnMeta($db, PREFIX . "seo_url");
    $sets = [];
    if (isset($columns['store_id'])) $sets['store_id'] = (string)$storeId;
    if (isset($columns['language_id'])) $sets['language_id'] = (string)$languageId;
    if (isset($columns['query'])) $sets['query'] = sqlString($db, $query);
    if (isset($columns['keyword'])) $sets['keyword'] = sqlString($db, $keyword);
    foreach ($columns as $field => $column) {
        if (isset($sets[$field])) continue;
        if (stripos((string)($column['Extra'] ?? ''), 'auto_increment') !== false) continue;
        if (strtoupper((string)($column['Null'] ?? '')) === 'YES') continue;
        if (array_key_exists('Default', $column) && $column['Default'] !== null) continue;
        $sets[$field] = sqlDefaultForRequiredColumn($db, $column);
    }
    $out = [];
    foreach ($sets as $field => $sqlValue) {
        $out[] = "`" . str_replace("`", "``", $field) . "`=" . $sqlValue;
    }
    return $out;
}

function ensureProductSeoUrl(mysqli $db, int $productId, array $body, string $name, string $model): array {
    if (!tableExists($db, PREFIX . "seo_url")) {
        return ['ok' => false, 'keyword' => '', 'url' => '', 'error' => 'seo_url table not found'];
    }
    $query = 'product_id=' . $productId;
    $keyword = uniqueSeoKeyword($db, seoKeywordFromPayload($body, $name, $model, $productId), $query);
    $queryEsc = $db->real_escape_string($query);
    $languageIds = array_values(array_unique(array_merge([(int)LANG_ID], allLanguageIds($db))));
    $rows = [];
    $errors = [];
    foreach ($languageIds as $languageId) {
        $languageId = (int)$languageId;
        $rowKeyword = $keyword;
        $res = $db->query(
            "SELECT seo_url_id FROM " . PREFIX . "seo_url
             WHERE query='$queryEsc' AND store_id=0 AND language_id=$languageId
             LIMIT 1"
        );
        $row = $res ? $res->fetch_assoc() : null;
        if ($row) {
            $kwEsc = $db->real_escape_string($rowKeyword);
            $db->query("UPDATE " . PREFIX . "seo_url SET keyword='$kwEsc' WHERE seo_url_id=" . (int)$row['seo_url_id']);
            if ($db->error && $languageId !== (int)LANG_ID) {
                $rowKeyword = uniqueSeoKeyword($db, $keyword . '-' . $languageId, $query);
                $kwEsc = $db->real_escape_string($rowKeyword);
                $db->query("UPDATE " . PREFIX . "seo_url SET keyword='$kwEsc' WHERE seo_url_id=" . (int)$row['seo_url_id']);
            }
        } else {
            $sets = seoUrlInsertSets($db, 0, $languageId, $query, $rowKeyword);
            $db->query("INSERT INTO " . PREFIX . "seo_url SET " . implode(',', $sets));
            if ($db->error && $languageId !== (int)LANG_ID) {
                $rowKeyword = uniqueSeoKeyword($db, $keyword . '-' . $languageId, $query);
                $sets = seoUrlInsertSets($db, 0, $languageId, $query, $rowKeyword);
                $db->query("INSERT INTO " . PREFIX . "seo_url SET " . implode(',', $sets));
            }
        }
        if ($db->error) {
            $errors[] = ['language_id' => $languageId, 'error' => $db->error];
        } else {
            $rows[] = ['language_id' => $languageId, 'keyword' => $rowKeyword];
        }
    }
    return [
        'ok' => !$errors,
        'keyword' => $keyword,
        'url' => storeBaseUrl() . '/' . $keyword,
        'rows' => $rows,
        'errors' => $errors
    ];
}

function gramsFromOptionValueName(string $name): int {
    $text = trim($name);
    if (preg_match('/(^|[^0-9])(1000|250|100)([^0-9]|$)/u', $text, $m)) {
        return (int)$m[2];
    }
    if (preg_match('/(^|[^0-9])(1)\s*(кг|kg)([^а-яa-z0-9]|$)/iu', $text)) {
        return 1000;
    }
    return 0;
}

function findPackageOptionSet(mysqli $db): array {
    if (!tableExists($db, PREFIX . "option_value") || !tableExists($db, PREFIX . "option_value_description")) {
        return ['ok' => false, 'error' => 'option tables not found'];
    }
    $joinOption = tableExists($db, PREFIX . "option_description");
    $join = $joinOption
        ? "LEFT JOIN " . PREFIX . "option_description od ON od.option_id=ov.option_id AND od.language_id=ovd.language_id"
        : "";
    $res = $db->query(
        "SELECT ov.option_id, ov.option_value_id, ovd.name AS value_name, ovd.language_id, COALESCE(od.name, '') AS option_name
         FROM " . PREFIX . "option_value ov
         JOIN " . PREFIX . "option_value_description ovd ON ovd.option_value_id=ov.option_value_id
         $join
         ORDER BY ov.option_id, (ovd.language_id=" . LANG_ID . ") DESC, ov.sort_order, ov.option_value_id"
    );
    $groups = [];
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $grams = gramsFromOptionValueName((string)$row['value_name']);
            if (!in_array($grams, [100, 250, 1000], true)) continue;
            $optionId = (int)$row['option_id'];
            if (!isset($groups[$optionId])) {
                $groups[$optionId] = [
                    'option_id' => $optionId,
                    'option_name' => (string)$row['option_name'],
                    'values' => [],
                    'score' => 0
                ];
            }
            if (!isset($groups[$optionId]['values'][$grams]) || (int)$row['language_id'] === (int)LANG_ID) {
                $groups[$optionId]['values'][$grams] = [
                    'option_value_id' => (int)$row['option_value_id'],
                    'name' => (string)$row['value_name']
                ];
            }
            if (preg_match('/ваг|фас|грам|weight|size|розм|об.єм|объем/iu', (string)$row['option_name'])) {
                $groups[$optionId]['score'] += 5;
            }
            if ((int)$row['language_id'] === (int)LANG_ID) $groups[$optionId]['score'] += 1;
        }
    }
    $best = null;
    foreach ($groups as $group) {
        $missing = array_diff([100, 250, 1000], array_keys($group['values']));
        if ($missing) continue;
        if (!$best || $group['score'] > $best['score']) $best = $group;
    }
    if (!$best) return ['ok' => false, 'error' => 'option with 100/250/1000 values not found'];
    $best['ok'] = true;
    return $best;
}

function productOptionInsertSets(mysqli $db, int $productId, int $optionId): array {
    $columns = tableColumnMeta($db, PREFIX . "product_option");
    $sets = [];
    if (isset($columns['product_id'])) $sets['product_id'] = (string)$productId;
    if (isset($columns['option_id'])) $sets['option_id'] = (string)$optionId;
    if (isset($columns['value'])) $sets['value'] = sqlString($db, '');
    if (isset($columns['required'])) $sets['required'] = '1';
    foreach ($columns as $field => $column) {
        if (isset($sets[$field])) continue;
        if (stripos((string)($column['Extra'] ?? ''), 'auto_increment') !== false) continue;
        if (strtoupper((string)($column['Null'] ?? '')) === 'YES') continue;
        if (array_key_exists('Default', $column) && $column['Default'] !== null) continue;
        $sets[$field] = sqlDefaultForRequiredColumn($db, $column);
    }
    $out = [];
    foreach ($sets as $field => $sqlValue) {
        $out[] = "`" . str_replace("`", "``", $field) . "`=" . $sqlValue;
    }
    return $out;
}

function productOptionValueInsertSets(
    mysqli $db,
    int $productOptionId,
    int $productId,
    int $optionId,
    int $optionValueId,
    float $basePrice,
    float $valuePrice
): array {
    $columns = tableColumnMeta($db, PREFIX . "product_option_value");
    $delta = $valuePrice - $basePrice;
    $sets = [];
    if (isset($columns['product_option_id'])) $sets['product_option_id'] = (string)$productOptionId;
    if (isset($columns['product_id'])) $sets['product_id'] = (string)$productId;
    if (isset($columns['option_id'])) $sets['option_id'] = (string)$optionId;
    if (isset($columns['option_value_id'])) $sets['option_value_id'] = (string)$optionValueId;
    if (isset($columns['quantity'])) $sets['quantity'] = '999';
    if (isset($columns['subtract'])) $sets['subtract'] = '0';
    if (isset($columns['price'])) $sets['price'] = (string)abs(round($delta, 4));
    if (isset($columns['price_prefix'])) $sets['price_prefix'] = sqlString($db, $delta < 0 ? '-' : '+');
    if (isset($columns['points'])) $sets['points'] = '0';
    if (isset($columns['points_prefix'])) $sets['points_prefix'] = sqlString($db, '+');
    if (isset($columns['weight'])) $sets['weight'] = '0';
    if (isset($columns['weight_prefix'])) $sets['weight_prefix'] = sqlString($db, '+');
    foreach ($columns as $field => $column) {
        if (isset($sets[$field])) continue;
        if (stripos((string)($column['Extra'] ?? ''), 'auto_increment') !== false) continue;
        if (strtoupper((string)($column['Null'] ?? '')) === 'YES') continue;
        if (array_key_exists('Default', $column) && $column['Default'] !== null) continue;
        $sets[$field] = sqlDefaultForRequiredColumn($db, $column);
    }
    $out = [];
    foreach ($sets as $field => $sqlValue) {
        $out[] = "`" . str_replace("`", "``", $field) . "`=" . $sqlValue;
    }
    return $out;
}

function ensureProductPackageOptions(mysqli $db, int $productId, array $priceMap, ?float $basePrice): array {
    if (!tableExists($db, PREFIX . "product_option") || !tableExists($db, PREFIX . "product_option_value")) {
        return ['ok' => false, 'created' => 0, 'error' => 'product option tables not found'];
    }
    $required = [100, 250, 1000];
    $missingPrices = array_values(array_filter($required, function ($grams) use ($priceMap) {
        return empty($priceMap[$grams]);
    }));
    if ($missingPrices) {
        return ['ok' => false, 'created' => 0, 'skipped' => true, 'error' => 'missing option prices: ' . implode(', ', $missingPrices)];
    }
    $base = $basePrice !== null ? (float)$basePrice : (float)$priceMap[250];
    if ($base <= 0) $base = (float)$priceMap[250];
    $optionSet = findPackageOptionSet($db);
    if (empty($optionSet['ok'])) {
        return ['ok' => false, 'created' => 0, 'error' => $optionSet['error'] ?? 'package option not found'];
    }
    $optionId = (int)$optionSet['option_id'];
    $db->query("DELETE FROM " . PREFIX . "product_option_value WHERE product_id=$productId AND option_id=$optionId");
    $db->query("DELETE FROM " . PREFIX . "product_option WHERE product_id=$productId AND option_id=$optionId");
    $db->query("INSERT INTO " . PREFIX . "product_option SET " . implode(',', productOptionInsertSets($db, $productId, $optionId)));
    if ($db->error) return ['ok' => false, 'created' => 0, 'error' => $db->error, 'option_id' => $optionId];
    $productOptionId = (int)$db->insert_id;
    $created = [];
    $errors = [];
    foreach ($required as $grams) {
        $optionValueId = (int)$optionSet['values'][$grams]['option_value_id'];
        $sets = productOptionValueInsertSets($db, $productOptionId, $productId, $optionId, $optionValueId, $base, (float)$priceMap[$grams]);
        $db->query("INSERT INTO " . PREFIX . "product_option_value SET " . implode(',', $sets));
        if ($db->error) {
            $errors[] = ['grams' => $grams, 'error' => $db->error];
        } else {
            $created[] = [
                'grams' => $grams,
                'option_value_id' => $optionValueId,
                'price' => (float)$priceMap[$grams],
                'delta' => round((float)$priceMap[$grams] - $base, 4)
            ];
        }
    }
    return [
        'ok' => !$errors,
        'created' => count($created),
        'option_id' => $optionId,
        'option_name' => $optionSet['option_name'] ?? '',
        'base_price' => $base,
        'values' => $created,
        'errors' => $errors
    ];
}

function applyProductCommerce(
    mysqli $db,
    int $productId,
    array $body,
    array $attributes,
    string $name,
    string $model,
    ?float $payloadPrice
): array {
    $priceMap = optionPriceMapFromPayload($body);
    $price = $payloadPrice !== null ? $payloadPrice : (!empty($priceMap[250]) ? (float)$priceMap[250] : null);
    $commerce = [
        'price' => $price,
        'manufacturer' => null,
        'category' => null,
        'seo' => null,
        'options' => null,
        'errors' => []
    ];

    $productSets = ["date_modified=NOW()"];
    if ($price !== null) $productSets[] = "price=" . (float)$price;
    $publishNow = !empty($body['publishNow']) || !empty($body['publish_now']) || in_array(strtolower((string)($body['status'] ?? '')), ['1', 'true', 'enabled', 'publish', 'published'], true);
    if ($publishNow) $productSets[] = "status=1";
    $supplierStatus = strtolower((string)(
        $attributes['Статус постачальника'] ??
        (is_array($body['supplierLot'] ?? null) ? ($body['supplierLot']['status'] ?? '') : '')
    ));
    if (preg_match('/на\s+складі|stock|available|в\s+наяв/u', $supplierStatus)) {
        $productSets[] = "quantity=999";
    }

    $manufacturer = ensureManufacturer($db, requestedManufacturerName($body));
    $commerce['manufacturer'] = $manufacturer;
    if (!empty($manufacturer['id'])) $productSets[] = "manufacturer_id=" . (int)$manufacturer['id'];

    $db->query("UPDATE " . PREFIX . "product SET " . implode(',', $productSets) . " WHERE product_id=$productId");
    if ($db->error) $commerce['errors'][] = ['field' => 'product', 'error' => $db->error];

    $commerce['category'] = ensureProductCategory($db, $productId, $body, $attributes, $name);
    if (empty($commerce['category']['ok'])) $commerce['errors'][] = ['field' => 'category', 'error' => $commerce['category']['error'] ?? 'category not saved'];

    $commerce['seo'] = ensureProductSeoUrl($db, $productId, $body, $name, $model);
    if (empty($commerce['seo']['ok'])) $commerce['errors'][] = ['field' => 'seo', 'error' => $commerce['seo']['error'] ?? ($commerce['seo']['errors'][0]['error'] ?? 'seo not saved')];

    $commerce['options'] = ensureProductPackageOptions($db, $productId, $priceMap, $price);
    if (empty($commerce['options']['ok']) && empty($commerce['options']['skipped'])) {
        $commerce['errors'][] = ['field' => 'options', 'error' => $commerce['options']['error'] ?? 'options not saved'];
    }

    $commerce['ok'] = empty($commerce['errors']) || (
        !empty($commerce['manufacturer']['ok']) &&
        !empty($commerce['category']['ok']) &&
        !empty($commerce['seo']['ok'])
    );
    return $commerce;
}

function productAttributesForCustomer(mysqli $db, int $productId): array {
    if ($productId <= 0) return [];
    $attrs = [];
    $res = $db->query(
        "SELECT ad.name, pa.text
         FROM " . PREFIX . "product_attribute pa
         JOIN " . PREFIX . "attribute_description ad
           ON ad.attribute_id = pa.attribute_id AND ad.language_id = pa.language_id
         WHERE pa.product_id=$productId AND pa.language_id=" . LANG_ID . "
         ORDER BY ad.name"
    );
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $attrs[$row['name']] = $row['text'];
        }
    }
    return $attrs;
}

function orderProductOptions(mysqli $db, int $orderId, int $orderProductId): array {
    if ($orderId <= 0 || $orderProductId <= 0 || !tableExists($db, PREFIX . "order_option")) return [];
    $options = [];
    $res = $db->query(
        "SELECT name, value, type
         FROM " . PREFIX . "order_option
         WHERE order_id=$orderId AND order_product_id=$orderProductId
         ORDER BY order_option_id"
    );
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $options[] = $row;
        }
    }
    return $options;
}

function productDescriptionLanguageRows(mysqli $db, int $productId): array {
    $rows = [];
    $res = $db->query(
        "SELECT pd.language_id, l.name language_name, pd.name, LENGTH(pd.description) description_length, pd.meta_title
         FROM " . PREFIX . "product_description pd
         LEFT JOIN " . PREFIX . "language l ON l.language_id = pd.language_id
         WHERE pd.product_id=$productId
         ORDER BY pd.language_id"
    );
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $rows[] = $row;
        }
    }
    return $rows;
}

function ensureProductDescriptionRow(mysqli $db, int $productId, string $fallbackName): array {
    $res = $db->query(
        "SELECT product_id FROM " . PREFIX . "product_description
         WHERE product_id=$productId AND language_id=" . LANG_ID . "
         LIMIT 1"
    );
    if ($res && $res->num_rows > 0) {
        return ['created' => false, 'source_language_id' => LANG_ID, 'languageRows' => productDescriptionLanguageRows($db, $productId)];
    }

    $sourceRes = $db->query(
        "SELECT * FROM " . PREFIX . "product_description
         WHERE product_id=$productId
         ORDER BY language_id
         LIMIT 1"
    );
    $source = $sourceRes ? $sourceRes->fetch_assoc() : null;
    $name = trim((string)($source['name'] ?? $fallbackName));
    if ($name === '') $name = $fallbackName ?: ('Product ' . $productId);
    $description = (string)($source['description'] ?? '');
    $metaTitle = (string)($source['meta_title'] ?? $name);
    $metaDescription = (string)($source['meta_description'] ?? '');
    $metaKeyword = (string)($source['meta_keyword'] ?? '');

    $write = upsertProductDescriptionRows(
        $db,
        $productId,
        $name,
        $description,
        $metaTitle,
        $metaDescription,
        (string)($source['meta_h1'] ?? $name),
        (int)LANG_ID
    );

    return [
        'created' => true,
        'insertError' => $write['errors'][0]['error'] ?? '',
        'write' => $write,
        'source_language_id' => isset($source['language_id']) ? (int)$source['language_id'] : null,
        'languageRows' => productDescriptionLanguageRows($db, $productId)
    ];
}

function readProductSnapshot(mysqli $db, int $productId): array {
    $fields = "name, description, meta_title, meta_description";
    if (tableHasColumn($db, PREFIX . "product_description", "meta_h1")) {
        $fields .= ", meta_h1";
    }
    $res = $db->query(
        "SELECT $fields FROM " . PREFIX . "product_description
         WHERE product_id=$productId AND language_id=" . LANG_ID . "
         LIMIT 1"
    );
    $row = $res ? $res->fetch_assoc() : null;
    if (!$row) {
        return [
            'found' => false,
            'product_id' => $productId,
            'language_id' => LANG_ID,
            'languageRows' => productDescriptionLanguageRows($db, $productId)
        ];
    }

    $attrs = [];
    $ar = $db->query(
        "SELECT ad.name, pa.text
         FROM " . PREFIX . "product_attribute pa
         JOIN " . PREFIX . "attribute_description ad
           ON ad.attribute_id = pa.attribute_id AND ad.language_id = pa.language_id
         WHERE pa.product_id=$productId AND pa.language_id=" . LANG_ID . "
         ORDER BY ad.name"
    );
    if ($ar) {
        while ($attr = $ar->fetch_assoc()) {
            $attrs[$attr['name']] = $attr['text'];
        }
    }

    $inventoryRes = $db->query(
        "SELECT p.status, p.quantity, p.stock_status_id, p.image, p.date_modified, ss.name AS stock_status
         FROM " . PREFIX . "product p
         LEFT JOIN " . PREFIX . "stock_status ss ON ss.stock_status_id = p.stock_status_id AND ss.language_id = " . LANG_ID . "
         WHERE p.product_id=$productId
         LIMIT 1"
    );
    $inventory = $inventoryRes ? ($inventoryRes->fetch_assoc() ?: []) : [];

    $description = (string)($row['description'] ?? '');
    $seoKeyword = seoKeywordForQuery($db, 'product_id=' . $productId);
    return [
        'found' => true,
        'product_id' => $productId,
        'language_id' => LANG_ID,
        'languageRows' => productDescriptionLanguageRows($db, $productId),
        'status' => isset($inventory['status']) ? (int)$inventory['status'] : null,
        'quantity' => isset($inventory['quantity']) ? (int)$inventory['quantity'] : null,
        'stock_status_id' => isset($inventory['stock_status_id']) ? (int)$inventory['stock_status_id'] : null,
        'stock_status' => $inventory['stock_status'] ?? '',
        'image' => storeImageUrl((string)($inventory['image'] ?? '')),
        'date_modified' => $inventory['date_modified'] ?? '',
        'name' => $row['name'] ?? '',
        'meta_title' => $row['meta_title'] ?? '',
        'meta_description' => $row['meta_description'] ?? '',
        'meta_h1' => $row['meta_h1'] ?? '',
        'description' => $description,
        'descriptionLength' => strlen($description),
        'descriptionSha1' => sha1($description),
        'descriptionPreview' => substr(strip_tags($description), 0, 220),
        'schema_marker' => strpos($description, 'MERCATO_AI_PRODUCT_SCHEMA_START') !== false,
        'h1_marker' => strpos($description, 'MERCATO_AI_PRODUCT_H1_START') !== false,
        'seo_keyword' => $seoKeyword,
        'url' => $seoKeyword ? storeBaseUrl() . '/' . ltrim($seoKeyword, '/') : routeUrl($db, 'product_id=' . $productId),
        'attributes' => $attrs
    ];
}

function readCategorySnapshot(mysqli $db, int $categoryId): array {
    $fields = "name, description, meta_title, meta_description";
    if (tableHasColumn($db, PREFIX . "category_description", "meta_h1")) {
        $fields .= ", meta_h1";
    }
    $res = $db->query(
        "SELECT $fields FROM " . PREFIX . "category_description
         WHERE category_id=$categoryId AND language_id=" . LANG_ID . "
         LIMIT 1"
    );
    $row = $res ? $res->fetch_assoc() : null;
    if (!$row) {
        return [
            'found' => false,
            'type' => 'category',
            'category_id' => $categoryId,
            'id' => $categoryId,
            'language_id' => LANG_ID
        ];
    }
    $description = (string)($row['description'] ?? '');
    $categoryColumns = tableColumnMeta($db, PREFIX . "category");
    $categoryDateField = isset($categoryColumns['date_modified']) ? ", date_modified" : ", '' AS date_modified";
    $statusRes = tableExists($db, PREFIX . "category")
        ? $db->query("SELECT status, parent_id, image $categoryDateField FROM " . PREFIX . "category WHERE category_id=$categoryId LIMIT 1")
        : null;
    $statusRow = $statusRes ? ($statusRes->fetch_assoc() ?: []) : [];
    $seoKeyword = seoKeywordForQuery($db, 'category_id=' . $categoryId);
    return [
        'found' => true,
        'type' => 'category',
        'category_id' => $categoryId,
        'id' => $categoryId,
        'language_id' => LANG_ID,
        'status' => isset($statusRow['status']) ? (int)$statusRow['status'] : null,
        'parent_id' => isset($statusRow['parent_id']) ? (int)$statusRow['parent_id'] : null,
        'image' => storeImageUrl((string)($statusRow['image'] ?? '')),
        'date_modified' => $statusRow['date_modified'] ?? '',
        'name' => $row['name'] ?? '',
        'meta_title' => $row['meta_title'] ?? '',
        'meta_description' => $row['meta_description'] ?? '',
        'meta_h1' => $row['meta_h1'] ?? ($row['name'] ?? ''),
        'description' => $description,
        'descriptionLength' => strlen($description),
        'descriptionSha1' => sha1($description),
        'descriptionPreview' => substr(strip_tags($description), 0, 220),
        'schema_marker' => strpos($description, 'MERCATO_AI_CATEGORY_SCHEMA_START') !== false,
        'seo_keyword' => $seoKeyword,
        'url' => $seoKeyword ? storeBaseUrl() . '/' . ltrim($seoKeyword, '/') : routeUrl($db, 'category_id=' . $categoryId),
        'attributes' => []
    ];
}

function readInformationSnapshot(mysqli $db, int $informationId): array {
    $fields = "title AS name, description, meta_title, meta_description";
    if (tableHasColumn($db, PREFIX . "information_description", "meta_h1")) {
        $fields .= ", meta_h1";
    }
    $res = $db->query(
        "SELECT $fields FROM " . PREFIX . "information_description
         WHERE information_id=$informationId AND language_id=" . LANG_ID . "
         LIMIT 1"
    );
    $row = $res ? $res->fetch_assoc() : null;
    if (!$row) {
        return [
            'found' => false,
            'type' => 'information',
            'information_id' => $informationId,
            'id' => $informationId,
            'language_id' => LANG_ID
        ];
    }
    $description = (string)($row['description'] ?? '');
    $statusRes = tableExists($db, PREFIX . "information")
        ? $db->query("SELECT status, bottom, sort_order FROM " . PREFIX . "information WHERE information_id=$informationId LIMIT 1")
        : null;
    $statusRow = $statusRes ? ($statusRes->fetch_assoc() ?: []) : [];
    $seoKeyword = seoKeywordForQuery($db, 'information_id=' . $informationId);
    return [
        'found' => true,
        'type' => 'information',
        'information_id' => $informationId,
        'id' => $informationId,
        'language_id' => LANG_ID,
        'status' => isset($statusRow['status']) ? (int)$statusRow['status'] : null,
        'bottom' => isset($statusRow['bottom']) ? (int)$statusRow['bottom'] : null,
        'sort_order' => isset($statusRow['sort_order']) ? (int)$statusRow['sort_order'] : null,
        'name' => $row['name'] ?? '',
        'meta_title' => $row['meta_title'] ?? '',
        'meta_description' => $row['meta_description'] ?? '',
        'meta_h1' => $row['meta_h1'] ?? ($row['name'] ?? ''),
        'description' => $description,
        'descriptionLength' => strlen($description),
        'descriptionSha1' => sha1($description),
        'descriptionPreview' => substr(strip_tags($description), 0, 220),
        'schema_marker' => strpos($description, 'MERCATO_AI_INFORMATION_SCHEMA_START') !== false,
        'seo_keyword' => $seoKeyword,
        'url' => $seoKeyword ? storeBaseUrl() . '/' . ltrim($seoKeyword, '/') : routeUrl($db, 'information_id=' . $informationId),
        'attributes' => []
    ];
}

function seoEntitySnapshot(mysqli $db, string $type, int $id): array {
    if ($type === 'product') $snapshot = readProductSnapshot($db, $id);
    elseif ($type === 'category') $snapshot = readCategorySnapshot($db, $id);
    elseif ($type === 'information') $snapshot = readInformationSnapshot($db, $id);
    else $snapshot = ['found' => false];
    $snapshot['type'] = $type;
    $snapshot['id'] = $id;
    $snapshot['source_fingerprint'] = seoEntitySourceFingerprint($snapshot);
    return $snapshot;
}

function seoEntityConfig(string $type): array {
    if ($type === 'product') {
        return [
            'table' => PREFIX . 'product_description',
            'main_table' => PREFIX . 'product',
            'id_field' => 'product_id',
            'name_field' => 'name',
            'query_prefix' => 'product_id='
        ];
    }
    if ($type === 'category') {
        return [
            'table' => PREFIX . 'category_description',
            'main_table' => PREFIX . 'category',
            'id_field' => 'category_id',
            'name_field' => 'name',
            'query_prefix' => 'category_id='
        ];
    }
    if ($type === 'information') {
        return [
            'table' => PREFIX . 'information_description',
            'main_table' => PREFIX . 'information',
            'id_field' => 'information_id',
            'name_field' => 'title',
            'query_prefix' => 'information_id='
        ];
    }
    return [];
}

function seoEntitySourceFingerprint(array $snapshot): string {
    $payload = [
        'type' => $snapshot['type'] ?? (!empty($snapshot['product_id']) ? 'product' : ''),
        'id' => $snapshot['id'] ?? ($snapshot['product_id'] ?? ($snapshot['category_id'] ?? ($snapshot['information_id'] ?? 0))),
        'name' => $snapshot['name'] ?? '',
        'meta_title' => $snapshot['meta_title'] ?? '',
        'meta_description' => $snapshot['meta_description'] ?? '',
        'meta_h1' => $snapshot['meta_h1'] ?? '',
        'descriptionSha1' => $snapshot['descriptionSha1'] ?? '',
        'seo_keyword' => $snapshot['seo_keyword'] ?? '',
        'status' => $snapshot['status'] ?? null,
        'schema_marker' => !empty($snapshot['schema_marker'])
    ];
    return hash('sha256', json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE));
}

function ensureSeoChangeLogTable(mysqli $db): void {
    $table = PREFIX . 'mercato_seo_change_log';
    $db->query(
        "CREATE TABLE IF NOT EXISTS `$table` (
            `change_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            `approval_id` VARCHAR(120) NOT NULL,
            `change_type` VARCHAR(40) NOT NULL,
            `target_type` VARCHAR(40) NOT NULL,
            `target_key` VARCHAR(255) NOT NULL,
            `before_json` LONGTEXT NOT NULL,
            `after_json` LONGTEXT NOT NULL,
            `source_fingerprint` VARCHAR(64) NOT NULL DEFAULT '',
            `created_at` DATETIME NOT NULL,
            `rolled_back_at` DATETIME NULL,
            PRIMARY KEY (`change_id`),
            KEY `idx_approval` (`approval_id`),
            KEY `idx_target` (`target_type`, `target_key`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    if ($db->error) throw new Exception('SEO change log table failed: ' . $db->error);
}

function seoEntityReadbackComparable(string $field, $value): string {
    $text = (string)$value;
    if ($field === 'description') {
        $text = str_replace(["\r\n", "\r"], "\n", $text);
        for ($i = 0; $i < 3; $i++) {
            $decoded = html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
            if ($decoded === $text) break;
            $text = $decoded;
        }
        $text = str_replace(["\r\n", "\r"], "\n", $text);
    }
    return trim($text);
}

function seoEntityReadbackMatches(string $field, $actual, $expected): bool {
    if ($field === 'status') return (bool)$actual === (bool)$expected;
    return seoEntityReadbackComparable($field, $actual) === seoEntityReadbackComparable($field, $expected);
}

function recordSeoChange(
    mysqli $db,
    string $approvalId,
    string $changeType,
    string $targetType,
    string $targetKey,
    array $before,
    array $after,
    string $sourceFingerprint
): int {
    ensureSeoChangeLogTable($db);
    $table = PREFIX . 'mercato_seo_change_log';
    $db->query(
        "INSERT INTO `$table`
            (approval_id, change_type, target_type, target_key, before_json, after_json, source_fingerprint, created_at)
         VALUES (
            '" . $db->real_escape_string($approvalId) . "',
            '" . $db->real_escape_string($changeType) . "',
            '" . $db->real_escape_string($targetType) . "',
            '" . $db->real_escape_string($targetKey) . "',
            '" . $db->real_escape_string(json_encode($before, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE)) . "',
            '" . $db->real_escape_string(json_encode($after, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE)) . "',
            '" . $db->real_escape_string($sourceFingerprint) . "',
            NOW()
         )"
    );
    if ($db->error) throw new Exception('SEO change log insert failed: ' . $db->error);
    return (int)$db->insert_id;
}

function seoAllowedFileMap(): array {
    $root = realpath(__DIR__);
    if (!$root) return [];
    $files = [];
    $patterns = [
        '.htaccess',
        'robots.txt',
        'llms.txt',
        'sitemap.xml',
        'catalog/controller/common/header.php',
        'catalog/controller/common/footer.php',
        'catalog/controller/startup/seo_url.php',
        'catalog/view/theme/*/template/common/header.twig',
        'catalog/view/theme/*/template/common/footer.twig',
        'catalog/view/theme/*/template/common/home.twig',
        'catalog/view/theme/*/template/product/product.twig',
        'catalog/view/theme/*/template/product/category.twig',
        'catalog/view/theme/*/template/information/information.twig',
        'catalog/view/theme/*/stylesheet/*.css',
        'catalog/view/javascript/*.js'
    ];
    foreach ($patterns as $pattern) {
        $matches = strpos($pattern, '*') !== false ? (glob($root . '/' . $pattern) ?: []) : [$root . '/' . $pattern];
        foreach ($matches as $candidate) {
            $relative = ltrim(str_replace($root, '', $candidate), '/');
            if ($relative === '' || preg_match('/(?:config\.php|secrets|\.env|storage\/|admin\/|vendor\/|mercato-bridge)/i', $relative)) continue;
            $files[$relative] = $candidate;
        }
    }
    return $files;
}

function seoFileManifest(): array {
    $out = [];
    foreach (seoAllowedFileMap() as $relative => $absolute) {
        $exists = is_file($absolute);
        $out[] = [
            'path' => $relative,
            'exists' => $exists,
            'writable' => $exists ? is_writable($absolute) : is_writable(dirname($absolute)),
            'size' => $exists ? (int)filesize($absolute) : 0,
            'sha1' => $exists ? sha1_file($absolute) : '',
            'extension' => strtolower(pathinfo($relative, PATHINFO_EXTENSION)),
            'kind' => preg_match('/\.twig$/i', $relative)
                ? 'template'
                : (preg_match('/\.(php|js|css)$/i', $relative) ? 'code' : 'technical')
        ];
    }
    usort($out, function ($left, $right) {
        return strcmp((string)$left['path'], (string)$right['path']);
    });
    return $out;
}

function seoResolveAllowedFile(string $relative): string {
    $relative = ltrim(str_replace('\\', '/', trim($relative)), '/');
    $map = seoAllowedFileMap();
    if (!isset($map[$relative])) throw new Exception('File is outside SEO allowlist');
    return $map[$relative];
}

function seoReadAllowedFile(string $relative): array {
    $absolute = seoResolveAllowedFile($relative);
    $exists = is_file($absolute);
    $content = $exists ? file_get_contents($absolute) : '';
    if ($content === false) throw new Exception('SEO file could not be read');
    if (strlen($content) > 1048576) throw new Exception('SEO file exceeds 1 MB safety limit');
    return [
        'path' => $relative,
        'exists' => $exists,
        'size' => strlen($content),
        'sha1' => sha1($content),
        'content' => $content
    ];
}

function seoWriteAllowedFile(string $relative, string $content, string $expectedSha1 = ''): array {
    if (strlen($content) > 1048576) throw new Exception('SEO file exceeds 1 MB safety limit');
    if (preg_match('/\.(php|twig|js|css)$/i', $relative) && trim($content) === '') {
        throw new Exception('SEO code/template file cannot be emptied');
    }
    $before = seoReadAllowedFile($relative);
    if ($expectedSha1 !== '' && !hash_equals($expectedSha1, (string)$before['sha1'])) {
        throw new Exception('SEO file changed after approval');
    }
    $absolute = seoResolveAllowedFile($relative);
    $directory = dirname($absolute);
    if (!is_dir($directory) || !is_writable($directory)) throw new Exception('SEO file directory is not writable');
    $temp = $absolute . '.mercato-ai-tmp-' . uniqid();
    if (file_put_contents($temp, $content, LOCK_EX) === false) throw new Exception('SEO temporary file write failed');
    if (preg_match('/\.php$/i', $relative) && function_exists('exec') && defined('PHP_BINARY')) {
        $output = [];
        $exitCode = 0;
        @exec(escapeshellarg(PHP_BINARY) . ' -l ' . escapeshellarg($temp) . ' 2>&1', $output, $exitCode);
        if ($exitCode !== 0) {
            @unlink($temp);
            throw new Exception('SEO PHP syntax check failed: ' . implode(' ', array_slice($output, 0, 3)));
        }
    }
    if (!rename($temp, $absolute)) {
        @unlink($temp);
        throw new Exception('SEO atomic file replace failed');
    }
    $after = seoReadAllowedFile($relative);
    if (!hash_equals(sha1($content), (string)$after['sha1'])) throw new Exception('SEO file readback mismatch');
    return ['before' => $before, 'after' => $after];
}

function publishReadback(mysqli $db, int $productId, string $title, string $content, array $writtenAttrs): array {
    $snapshot = readProductSnapshot($db, $productId);
    if (empty($snapshot['found'])) return $snapshot;

    $storedTitle = (string)($snapshot['meta_title'] ?? '');
    $storedDescriptionSha1 = (string)($snapshot['descriptionSha1'] ?? '');
    $expectedSha1 = sha1($content);
    $storedAttrs = isset($snapshot['attributes']) && is_array($snapshot['attributes']) ? $snapshot['attributes'] : [];
    $attrsOk = true;
    foreach ($writtenAttrs as $name => $value) {
        if (!isset($storedAttrs[$name]) || trim((string)$storedAttrs[$name]) !== trim((string)$value)) {
            $attrsOk = false;
            break;
        }
    }

    $snapshot['expectedContentSha1'] = $expectedSha1;
    $snapshot['metaTitleExact'] = ($storedTitle === $title);
    $snapshot['descriptionExact'] = ($storedDescriptionSha1 === $expectedSha1);
    $snapshot['attributesExact'] = $attrsOk;
    $snapshot['writtenAttributesCount'] = count($writtenAttrs);
    $snapshot['storedAttributesCount'] = count($storedAttrs);
    return $snapshot;
}

// ── STATS ─────────────────────────────────────────────────────
if ($action === 'stats') {
    $customers = $db->query("SELECT COUNT(*) c FROM " . PREFIX . "customer")->fetch_assoc()['c'];
    $row = $db->query(
        "SELECT COUNT(*) c, COALESCE(SUM(total),0) rev
         FROM " . PREFIX . "order WHERE order_status_id > 0"
    )->fetch_assoc();
    echo json_encode([
        'totalCustomers' => (int)$customers,
        'totalOrders'    => (int)$row['c'],
        'totalRevenue'   => (float)$row['rev'],
        'avgOrderValue'  => $row['c'] > 0 ? round($row['rev'] / $row['c'], 0) : 0,
    ]);
    exit;
}

// ── CUSTOMERS ─────────────────────────────────────────────────
if ($action === 'customers') {
    $page   = max(1, (int)($_GET['page'] ?? 1));
    $limit  = 50;
    $offset = ($page - 1) * $limit;
    $search = trim($_GET['search'] ?? '');

    if ($search) {
        $like = escLike($db, $search);
        $where = "WHERE (c.firstname LIKE '$like' OR c.lastname LIKE '$like'
                    OR c.email LIKE '$like' OR c.telephone LIKE '$like')";
    } else {
        $where = '';
    }

    $result = $db->query(
        "SELECT c.customer_id, c.firstname, c.lastname, c.email, c.telephone, c.date_added,
                COUNT(o.order_id)     AS order_count,
                COALESCE(SUM(o.total),0) AS total_spent,
                MAX(o.date_added)     AS last_order
         FROM " . PREFIX . "customer c
         LEFT JOIN " . PREFIX . "order o
               ON c.customer_id = o.customer_id AND o.order_status_id > 0
         $where
         GROUP BY c.customer_id
         ORDER BY last_order DESC, c.date_added DESC
         LIMIT $limit OFFSET $offset"
    );

    $customers = [];
    while ($row = $result->fetch_assoc()) {
        $row['order_count'] = (int)$row['order_count'];
        $row['total_spent'] = (float)$row['total_spent'];
        $customers[] = $row;
    }

    $total = (int)$db->query(
        "SELECT COUNT(DISTINCT c.customer_id) n FROM " . PREFIX . "customer c $where"
    )->fetch_assoc()['n'];

    echo json_encode(['customers' => $customers, 'total' => $total, 'page' => $page]);
    exit;
}

// ── ORDERS ────────────────────────────────────────────────────
if ($action === 'orders') {
    $page   = max(1, (int)($_GET['page'] ?? 1));
    $limit  = 50;
    $offset = ($page - 1) * $limit;
    $search = trim($_GET['search'] ?? '');

    $where = "WHERE o.order_status_id > 0";
    if ($search) {
        $like = escLike($db, $search);
        $where .= " AND (o.firstname LIKE '$like' OR o.lastname LIKE '$like'
                    OR o.email LIKE '$like' OR CAST(o.order_id AS CHAR) LIKE '$like')";
    }

    $result = $db->query(
        "SELECT o.order_id, o.customer_id, o.firstname, o.lastname, o.email, o.telephone,
                o.total, o.date_added, os.name AS status,
                GROUP_CONCAT(op.name ORDER BY op.name SEPARATOR ', ') AS products_list
         FROM " . PREFIX . "order o
         LEFT JOIN " . PREFIX . "order_status os
               ON o.order_status_id = os.order_status_id AND os.language_id = " . LANG_ID . "
         LEFT JOIN " . PREFIX . "order_product op ON o.order_id = op.order_id
         $where
         GROUP BY o.order_id
         ORDER BY o.date_added DESC
         LIMIT $limit OFFSET $offset"
    );

    $orders = [];
    while ($row = $result->fetch_assoc()) {
        $row['total'] = (float)$row['total'];
        $orders[] = $row;
    }

    $total = (int)$db->query(
        "SELECT COUNT(DISTINCT o.order_id) n FROM " . PREFIX . "order o $where"
    )->fetch_assoc()['n'];

    echo json_encode(['orders' => $orders, 'total' => $total, 'page' => $page]);
    exit;
}

// ── SINGLE CUSTOMER ───────────────────────────────────────────
if ($action === 'customer') {
    $id = (int)($_GET['id'] ?? 0);
    if (!$id) { echo json_encode(['error' => 'ID required']); exit; }

    $customerFields = [
        "customer_id",
        "firstname",
        "lastname",
        "email",
        "telephone",
        "CAST(date_added AS CHAR) AS date_added"
    ];
    if (tableHasColumn($db, PREFIX . "customer", "newsletter")) $customerFields[] = "newsletter";
    if (tableHasColumn($db, PREFIX . "customer", "status")) $customerFields[] = "status";
    $customer = $db->query(
        "SELECT " . implode(',', $customerFields) . "
         FROM " . PREFIX . "customer WHERE customer_id = $id"
    )->fetch_assoc();

    if (!$customer) { echo json_encode(['error' => 'Not found']); exit; }

    // Orders with products
    $orderFields = [
        "o.order_id",
        "o.total",
        "CAST(o.date_added AS CHAR) AS date_added",
        "os.name AS status"
    ];
    foreach (['payment_method', 'payment_code', 'shipping_method', 'shipping_code', 'currency_code'] as $field) {
        if (tableHasColumn($db, PREFIX . "order", $field)) $orderFields[] = "o.$field";
    }
    $res = $db->query(
        "SELECT " . implode(',', $orderFields) . "
         FROM " . PREFIX . "order o
         LEFT JOIN " . PREFIX . "order_status os
               ON o.order_status_id = os.order_status_id AND os.language_id = " . LANG_ID . "
         WHERE o.customer_id = $id AND o.order_status_id > 0
         ORDER BY o.date_added DESC"
    );

    $orders = [];
    while ($row = $res->fetch_assoc()) {
        $row['total'] = (float)$row['total'];
        $orderId = (int)$row['order_id'];
        $pr = $db->query(
            "SELECT order_product_id, product_id, name, model, quantity, price, total
             FROM " . PREFIX . "order_product
             WHERE order_id = {$row['order_id']}"
        );
        $row['products'] = [];
        while ($p = $pr->fetch_assoc()) {
            $orderProductId = (int)($p['order_product_id'] ?? 0);
            $productId = (int)($p['product_id'] ?? 0);
            $p['price']    = (float)$p['price'];
            $p['quantity'] = (int)$p['quantity'];
            $p['total']    = isset($p['total']) ? (float)$p['total'] : $p['price'] * $p['quantity'];
            $p['options']  = orderProductOptions($db, $orderId, $orderProductId);
            $p['attributes'] = productAttributesForCustomer($db, $productId);
            $row['products'][] = $p;
        }
        $orders[] = $row;
    }

    $customer['orders'] = $orders;
    $customer['order_count'] = count($orders);
    $customer['total_spent'] = array_sum(array_column($orders, 'total'));

    echo json_encode($customer);
    exit;
}

// ── PRODUCT SEARCH ───────────────────────────────────────────
if ($action === 'merchant_feed_audit_list') {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = max(1, min(200, (int)($_GET['limit'] ?? 100)));
    $offset = ($page - 1) * $limit;
    $productColumns = tableColumnMeta($db, PREFIX . "product");
    $hasH1 = tableHasColumn($db, PREFIX . "product_description", "meta_h1");
    $h1Field = $hasH1 ? ", pd.meta_h1" : ", '' AS meta_h1";
    $column = function (string $name, string $alias = '') use ($productColumns): string {
        $safeAlias = $alias !== '' ? $alias : $name;
        return isset($productColumns[$name])
            ? ", p.`$name` AS `$safeAlias`"
            : ", '' AS `$safeAlias`";
    };
    $identifierFields = array_values(array_filter(['gtin', 'ean', 'upc', 'jan', 'isbn'], function ($name) use ($productColumns) {
        return isset($productColumns[$name]);
    }));
    $gtinExpression = $identifierFields
        ? "COALESCE(" . implode(', ', array_map(function ($field) {
            return "NULLIF(p.`$field`, '')";
        }, $identifierFields)) . ", '')"
        : "''";
    $totalRes = $db->query("SELECT COUNT(*) AS total FROM " . PREFIX . "product p");
    $totalRow = $totalRes ? $totalRes->fetch_assoc() : ['total' => 0];
    $specialExpression = tableExists($db, PREFIX . "product_special")
        ? "(SELECT ps.price FROM " . PREFIX . "product_special ps
            WHERE ps.product_id=p.product_id
              AND (ps.customer_group_id=1 OR ps.customer_group_id=0)
              AND (ps.date_start='0000-00-00' OR ps.date_start<=CURDATE())
              AND (ps.date_end='0000-00-00' OR ps.date_end>=CURDATE())
            ORDER BY ps.priority ASC, ps.price ASC LIMIT 1)"
        : "NULL";
    $categoryExpression = tableExists($db, PREFIX . "product_to_category") && tableExists($db, PREFIX . "category_description")
        ? "(SELECT GROUP_CONCAT(DISTINCT cd.name ORDER BY cd.name SEPARATOR ' > ')
            FROM " . PREFIX . "product_to_category p2c
            JOIN " . PREFIX . "category_description cd
              ON cd.category_id=p2c.category_id AND cd.language_id=" . LANG_ID . "
            WHERE p2c.product_id=p.product_id)"
        : "''";
    $optionExpression = tableExists($db, PREFIX . "product_option")
        ? "(SELECT COUNT(*) FROM " . PREFIX . "product_option po WHERE po.product_id=p.product_id)"
        : "0";
    $additionalImageExpression = tableExists($db, PREFIX . "product_image")
        ? "(SELECT COUNT(*) FROM " . PREFIX . "product_image pi WHERE pi.product_id=p.product_id)"
        : "0";
    $overrideTable = merchantOverrideTable();
    $hasMerchantOverrides = tableExists($db, $overrideTable);
    $overrideSelect = $hasMerchantOverrides
        ? ", mo.feed_title, mo.feed_description, mo.identifier_exists AS override_identifier_exists"
        : ", '' AS feed_title, '' AS feed_description, NULL AS override_identifier_exists";
    $overrideJoin = $hasMerchantOverrides
        ? " LEFT JOIN `$overrideTable` mo ON mo.product_id=p.product_id"
        : "";
    $res = $db->query(
        "SELECT p.product_id, p.model, p.sku, p.status, p.quantity, p.stock_status_id, p.price, p.image, p.date_modified,
                pd.name, pd.description, pd.meta_title, pd.meta_description $h1Field,
                ss.name AS stock_status, su.keyword, m.name AS manufacturer,
                $gtinExpression AS gtin,
                $specialExpression AS special_price,
                $categoryExpression AS product_type,
                $optionExpression AS option_count,
                $additionalImageExpression AS additional_image_count
                $overrideSelect"
                . $column('mpn')
                . $column('weight')
                . $column('weight_class_id')
                . "
         FROM " . PREFIX . "product p
         JOIN " . PREFIX . "product_description pd
           ON p.product_id=pd.product_id AND pd.language_id=" . LANG_ID . "
         LEFT JOIN " . PREFIX . "stock_status ss
           ON ss.stock_status_id=p.stock_status_id AND ss.language_id=" . LANG_ID . "
         LEFT JOIN " . PREFIX . "seo_url su
           ON su.query=CONCAT('product_id=', p.product_id) AND su.language_id=" . LANG_ID . "
         LEFT JOIN " . PREFIX . "manufacturer m ON m.manufacturer_id=p.manufacturer_id
         $overrideJoin
         ORDER BY p.product_id DESC
         LIMIT $limit OFFSET $offset"
    );
    $productRows = [];
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $productRows[] = $row;
        }
    }
    $variantBases = [];
    foreach ($productRows as $row) {
        $id = (int)$row['product_id'];
        $special = isset($row['special_price']) && is_numeric($row['special_price']) ? (float)$row['special_price'] : 0;
        $regular = isset($row['price']) ? (float)$row['price'] : 0;
        $currentPrice = $special > 0 ? $special : $regular;
        $variantBases[$id] = [
            'price' => $currentPrice,
            'availability' => ((int)$row['status'] === 1 && (float)$row['quantity'] > 0) ? 'in_stock' : 'out_of_stock'
        ];
    }
    $variantsByProduct = merchantVariantOptionsByProduct($db, array_keys($variantBases), $variantBases);
    $products = [];
    foreach ($productRows as $row) {
            $id = (int)$row['product_id'];
            $url = !empty($row['keyword'])
                ? storeBaseUrl() . '/' . ltrim($row['keyword'], '/')
                : routeUrl($db, 'product_id=' . $id);
            $image = storeImageUrl((string)($row['image'] ?? ''));
            $imageInfo = storeImageInfo((string)($row['image'] ?? ''));
            $special = isset($row['special_price']) && is_numeric($row['special_price']) ? (float)$row['special_price'] : 0;
            $regular = isset($row['price']) ? (float)$row['price'] : 0;
            $currentPrice = $special > 0 ? $special : $regular;
            $availability = ((int)$row['status'] === 1 && (float)$row['quantity'] > 0) ? 'in_stock' : 'out_of_stock';
            $mpn = trim((string)($row['mpn'] ?? '')) ?: trim((string)($row['model'] ?? ''));
            $sku = trim((string)($row['sku'] ?? '')) ?: trim((string)($row['model'] ?? ''));
            $variantOptions = $variantsByProduct[$id] ?? [];
            $feedTitle = trim((string)($row['feed_title'] ?? ''));
            $feedDescription = trim((string)($row['feed_description'] ?? ''));
            $products[] = [
                'product_id' => $id,
                'id' => $sku ?: (string)$id,
                'offer_id' => $sku ?: (string)$id,
                'model' => $row['model'] ?? '',
                'sku' => $sku,
                'gtin' => $row['gtin'] ?? '',
                'mpn' => $mpn,
                'identifier_exists' => $row['override_identifier_exists'] === null
                    ? null
                    : (bool)$row['override_identifier_exists'],
                'status' => (int)$row['status'],
                'quantity' => (float)$row['quantity'],
                'stock_status_id' => (int)$row['stock_status_id'],
                'stock_status' => $row['stock_status'] ?? '',
                'availability' => $availability,
                'price' => $currentPrice,
                'regular_price' => $regular,
                'sale_price' => $special,
                'price_currency' => 'UAH',
                'title' => $feedTitle !== '' ? $feedTitle : ($row['name'] ?? ''),
                'name' => $row['name'] ?? '',
                'description' => $feedDescription !== '' ? $feedDescription : ($row['description'] ?? ''),
                'feed_title' => $feedTitle,
                'feed_description' => $feedDescription,
                'merchant_override_active' => $feedTitle !== '' || $feedDescription !== '' || $row['override_identifier_exists'] !== null,
                'meta_title' => $row['meta_title'] ?? '',
                'meta_description' => $row['meta_description'] ?? '',
                'meta_h1' => $row['meta_h1'] ?? '',
                'link' => $url,
                'url' => $url,
                'image_link' => $image,
                'image_width' => $imageInfo['width'],
                'image_height' => $imageInfo['height'],
                'image_bytes' => $imageInfo['bytes'],
                'image_exists' => $imageInfo['exists'],
                'additional_image_count' => (int)($row['additional_image_count'] ?? 0),
                'brand' => $row['manufacturer'] ?? '',
                'manufacturer' => $row['manufacturer'] ?? '',
                'condition' => 'new',
                'product_type' => $row['product_type'] ?? '',
                'google_product_category' => '',
                'option_count' => (int)($row['option_count'] ?? 0),
                'variant_options' => $variantOptions,
                'variant_value_count' => array_sum(array_map(function ($option) {
                    return count($option['values'] ?? []);
                }, $variantOptions)),
                'item_group_id' => '',
                'weight' => $row['weight'] ?? '',
                'weight_class_id' => $row['weight_class_id'] ?? '',
                'schema_marker' => strpos((string)($row['description'] ?? ''), 'MERCATO_AI_PRODUCT_SCHEMA_START') !== false,
                'date_modified' => $row['date_modified'] ?? ''
            ];
    }
    bridgeJson([
        'ok' => true,
        'bridgeVersion' => BRIDGE_VERSION,
        'page' => $page,
        'limit' => $limit,
        'total' => (int)($totalRow['total'] ?? 0),
        'coverage' => [
            'full' => true,
            'source' => 'merchant_feed_audit_list',
            'fields' => ['id', 'title', 'description', 'link', 'image_link', 'image_width', 'image_height', 'availability', 'price', 'price_currency', 'brand', 'manufacturer', 'gtin', 'mpn', 'sku', 'identifier_exists', 'option_count', 'variant_options', 'variant_value_count', 'item_group_id']
        ],
        'products' => $products
    ]);
}

if ($action === 'product_audit_list') {
    $page = max(1, (int)($_GET['page'] ?? 1));
    $limit = max(1, min(300, (int)($_GET['limit'] ?? 100)));
    $offset = ($page - 1) * $limit;
    $hasH1 = tableHasColumn($db, PREFIX . "product_description", "meta_h1");
    $h1Field = $hasH1 ? ", pd.meta_h1" : ", '' AS meta_h1";
    $totalRes = $db->query("SELECT COUNT(*) AS total FROM " . PREFIX . "product p");
    $totalRow = $totalRes ? $totalRes->fetch_assoc() : ['total' => 0];
    $res = $db->query(
        "SELECT p.product_id, p.model, p.sku, p.status, p.quantity, p.stock_status_id, ss.name AS stock_status, p.date_modified,
                pd.name, pd.meta_title, pd.meta_description $h1Field,
                LENGTH(pd.description) AS description_length,
                su.keyword,
                (SELECT COUNT(*) FROM " . PREFIX . "product_attribute pa WHERE pa.product_id=p.product_id AND pa.language_id=" . LANG_ID . ") AS attributes_count
         FROM " . PREFIX . "product p
         JOIN " . PREFIX . "product_description pd ON p.product_id = pd.product_id AND pd.language_id = " . LANG_ID . "
         LEFT JOIN " . PREFIX . "seo_url su ON su.query = CONCAT('product_id=', p.product_id) AND su.language_id = " . LANG_ID . "
         LEFT JOIN " . PREFIX . "stock_status ss ON ss.stock_status_id = p.stock_status_id AND ss.language_id = " . LANG_ID . "
         ORDER BY p.product_id DESC
         LIMIT $limit OFFSET $offset"
    );
    $products = [];
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $row['url'] = !empty($row['keyword']) ? 'https://mercato.com.ua/' . $row['keyword'] : routeUrl($db, 'product_id=' . (int)$row['product_id']);
            $row['routeUrl'] = $row['url'];
            $products[] = $row;
        }
    }
    echo json_encode([
        'ok' => true,
        'page' => $page,
        'limit' => $limit,
        'total' => (int)($totalRow['total'] ?? 0),
        'products' => $products
    ]);
    exit;
}

if ($action === 'product_search') {
    $q = trim($_GET['q'] ?? '');
    $limit = max(1, min(20, (int)($_GET['limit'] ?? 8)));
    if (!$q) { echo json_encode(['products' => []]); exit; }
    $like = escLike($db, $q);
    $res = $db->query(
        "SELECT p.product_id, p.model, p.sku, p.status, p.quantity, p.stock_status_id, ss.name AS stock_status, pd.name, su.keyword
         FROM " . PREFIX . "product p
         JOIN " . PREFIX . "product_description pd ON p.product_id = pd.product_id AND pd.language_id = " . LANG_ID . "
         LEFT JOIN " . PREFIX . "seo_url su ON su.query = CONCAT('product_id=', p.product_id) AND su.language_id = " . LANG_ID . "
         LEFT JOIN " . PREFIX . "stock_status ss ON ss.stock_status_id = p.stock_status_id AND ss.language_id = " . LANG_ID . "
         WHERE pd.name LIKE '$like' OR p.model LIKE '$like' OR p.sku LIKE '$like' OR su.keyword LIKE '$like'
         ORDER BY p.status DESC, (p.quantity > 0) DESC, p.product_id DESC
         LIMIT $limit"
    );
    $products = [];
    while ($row = $res->fetch_assoc()) {
        $row['url'] = !empty($row['keyword']) ? 'https://mercato.com.ua/' . $row['keyword'] : routeUrl($db, 'product_id=' . (int)$row['product_id']);
        $row['routeUrl'] = $row['url'];
        $products[] = $row;
    }
    echo json_encode(['products' => $products]);
    exit;
}

if ($action === 'product_read') {
    $url = trim($_GET['url'] ?? '');
    $slug = trim($_GET['slug'] ?? '');
    $directProductId = (int)($_GET['product_id'] ?? $_GET['id'] ?? 0);
    $id = productIdByUrlOrSlug($db, $url, $slug, $directProductId);
    if (!$id) bridgeJson(['error' => 'Product not found by URL/slug']);
    bridgeJson([
        'ok' => true,
        'product_id' => $id,
        'id' => $id,
        'url' => $url ?: routeUrl($db, 'product_id=' . $id),
        'snapshot' => seoEntitySnapshot($db, 'product', $id),
        'attributeCatalog' => attributeCatalog($db)
    ]);
}

if ($action === 'merchant_apply_product_patch') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        bridgeJson(['error' => 'POST required']);
    }
    $body = readJsonBody();
    $approvalId = trim((string)($body['approval_id'] ?? $body['approvalId'] ?? ''));
    $confirmPhrase = trim((string)($body['confirmPhrase'] ?? $body['confirm_phrase'] ?? ''));
    $productId = (int)($body['product_id'] ?? $body['id'] ?? 0);
    $changes = isset($body['changes']) && is_array($body['changes']) ? $body['changes'] : [];
    if ($approvalId === '' || !preg_match('/^merchant-approval-[a-z0-9-]+$/i', $approvalId)) {
        bridgeJson(['error' => 'Valid approval_id required', 'code' => 'APPROVAL_REQUIRED']);
    }
    if ($confirmPhrase !== 'APPLY_MERCHANT_CHANGES') {
        bridgeJson(['error' => 'Confirmation phrase required', 'code' => 'CONFIRMATION_REQUIRED']);
    }
    if ($productId <= 0) {
        bridgeJson(['error' => 'product_id required']);
    }
    $supportedFields = ['brand', 'clear_invalid_gtin', 'feed_title', 'feed_description', 'identifier_exists'];
    $unsupported = array_values(array_diff(array_keys($changes), $supportedFields));
    if ($unsupported) {
        bridgeJson(['error' => 'Unsupported Merchant patch fields', 'fields' => $unsupported]);
    }
    if (!array_intersect(array_keys($changes), $supportedFields)) {
        bridgeJson(['error' => 'No supported Merchant changes supplied']);
    }

    $before = merchantProductPatchSnapshot($db, $productId);
    if (empty($before['found'])) bridgeJson(['error' => 'Product not found']);
    if (array_key_exists('brand', $changes) && array_key_exists('expected_before_brand', $body)) {
        $expected = trim((string)$body['expected_before_brand']);
        $actual = trim((string)($before['brand'] ?? ''));
        $expectedFolded = function_exists('mb_strtolower') ? mb_strtolower($expected, 'UTF-8') : strtolower($expected);
        $actualFolded = function_exists('mb_strtolower') ? mb_strtolower($actual, 'UTF-8') : strtolower($actual);
        if ($expectedFolded !== $actualFolded) {
            bridgeJson([
                'error' => 'Product brand changed after approval; create a new scan and preview',
                'code' => 'SOURCE_CHANGED',
                'before' => $before,
                'expected_before_brand' => $expected
            ]);
        }
    }

    $brand = array_key_exists('brand', $changes)
        ? trim(stripMysqlUtf8Incompatible((string)$changes['brand']))
        : '';
    if (array_key_exists('brand', $changes) && $brand === '') bridgeJson(['error' => 'Brand cannot be empty']);
    $feedTitle = array_key_exists('feed_title', $changes)
        ? trim(stripMysqlUtf8Incompatible((string)$changes['feed_title']))
        : null;
    $feedDescription = array_key_exists('feed_description', $changes)
        ? trim(stripMysqlUtf8Incompatible((string)$changes['feed_description']))
        : null;
    if ($feedTitle !== null && ($feedTitle === '' || merchantTextLength($feedTitle) > 150)) {
        bridgeJson(['error' => 'feed_title must contain 1-150 characters']);
    }
    if ($feedDescription !== null && ($feedDescription === '' || merchantTextLength($feedDescription) > 5000)) {
        bridgeJson(['error' => 'feed_description must contain 1-5000 characters']);
    }
    $hasOverrideChanges = $feedTitle !== null
        || $feedDescription !== null
        || array_key_exists('identifier_exists', $changes);
    if ($hasOverrideChanges) {
        try {
            ensureMerchantOverrideTable($db);
        } catch (Throwable $error) {
            bridgeJson(['error' => $error->getMessage(), 'code' => 'MERCHANT_OVERRIDE_TABLE_FAILED']);
        }
    }
    $db->begin_transaction();
    try {
        if (array_key_exists('brand', $changes)) {
            $manufacturer = ensureManufacturer($db, $brand);
            if (empty($manufacturer['ok']) || empty($manufacturer['id'])) {
                throw new Exception($manufacturer['error'] ?? 'Manufacturer could not be created');
            }
            $manufacturerId = (int)$manufacturer['id'];
            $db->query(
                "UPDATE " . PREFIX . "product
                 SET manufacturer_id=$manufacturerId, date_modified=NOW()
                 WHERE product_id=$productId"
            );
            if ($db->error) throw new Exception($db->error);
        }

        $clearedIdentifierFields = [];
        if (!empty($changes['clear_invalid_gtin'])) {
            $expectedInvalidGtin = trim((string)($body['expected_invalid_gtin'] ?? ''));
            if ($expectedInvalidGtin === '') throw new Exception('expected_invalid_gtin required');
            $productColumns = tableColumnMeta($db, PREFIX . 'product');
            foreach (['gtin', 'ean', 'upc', 'jan', 'isbn'] as $field) {
                if (!isset($productColumns[$field])) continue;
                $current = trim((string)($before['identifiers'][$field] ?? ''));
                if ($current !== $expectedInvalidGtin) continue;
                $db->query(
                    "UPDATE " . PREFIX . "product
                     SET `$field`='', date_modified=NOW()
                     WHERE product_id=$productId AND `$field`='" . $db->real_escape_string($expectedInvalidGtin) . "'"
                );
                if ($db->error) throw new Exception($db->error);
                $clearedIdentifierFields[] = $field;
            }
            if (!$clearedIdentifierFields) throw new Exception('Invalid GTIN source changed after approval');
        }

        if ($hasOverrideChanges) {
            $existingOverride = merchantOverrideSnapshot($db, $productId);
            $nextTitle = $feedTitle !== null ? $feedTitle : (string)($existingOverride['feed_title'] ?? '');
            $nextDescription = $feedDescription !== null ? $feedDescription : (string)($existingOverride['feed_description'] ?? '');
            $identifierSql = array_key_exists('identifier_exists', $changes)
                ? (!empty($changes['identifier_exists']) ? '1' : '0')
                : ($existingOverride['identifier_exists'] === null ? 'NULL' : (!empty($existingOverride['identifier_exists']) ? '1' : '0'));
            $overrideTable = merchantOverrideTable();
            $db->query(
                "INSERT INTO `$overrideTable`
                    (product_id, feed_title, feed_description, identifier_exists, approval_id, date_modified)
                 VALUES (
                    $productId,
                    '" . $db->real_escape_string($nextTitle) . "',
                    '" . $db->real_escape_string($nextDescription) . "',
                    $identifierSql,
                    '" . $db->real_escape_string($approvalId) . "',
                    NOW()
                 )
                 ON DUPLICATE KEY UPDATE
                    feed_title=VALUES(feed_title),
                    feed_description=VALUES(feed_description),
                    identifier_exists=VALUES(identifier_exists),
                    approval_id=VALUES(approval_id),
                    date_modified=NOW()"
            );
            if ($db->error) throw new Exception($db->error);
        }

        $after = merchantProductPatchSnapshot($db, $productId);
        $readback = [];
        if (array_key_exists('brand', $changes)) {
            $readback['brandExact'] = !empty($after['found'])
                && (function_exists('mb_strtolower')
                    ? mb_strtolower((string)$after['brand'], 'UTF-8') === mb_strtolower($brand, 'UTF-8')
                    : strtolower((string)$after['brand']) === strtolower($brand));
            if (!$readback['brandExact']) throw new Exception('Brand readback mismatch');
        }
        if (!empty($changes['clear_invalid_gtin'])) {
            $expectedInvalidGtin = trim((string)($body['expected_invalid_gtin'] ?? ''));
            $readback['invalidGtinCleared'] = !in_array($expectedInvalidGtin, array_values($after['identifiers'] ?? []), true);
            $readback['clearedIdentifierFields'] = $clearedIdentifierFields;
            if (!$readback['invalidGtinCleared']) throw new Exception('GTIN readback mismatch');
        }
        if ($feedTitle !== null) {
            $readback['feedTitleExact'] = (string)($after['override']['feed_title'] ?? '') === $feedTitle;
            if (!$readback['feedTitleExact']) throw new Exception('Feed title readback mismatch');
        }
        if ($feedDescription !== null) {
            $readback['feedDescriptionExact'] = (string)($after['override']['feed_description'] ?? '') === $feedDescription;
            if (!$readback['feedDescriptionExact']) throw new Exception('Feed description readback mismatch');
        }
        if (array_key_exists('identifier_exists', $changes)) {
            $expectedIdentifierExists = !empty($changes['identifier_exists']);
            $readback['identifierExistsExact'] = ($after['override']['identifier_exists'] ?? null) === $expectedIdentifierExists;
            if (!$readback['identifierExistsExact']) throw new Exception('Identifier policy readback mismatch');
        }
        $db->commit();
        bridgeJson([
            'ok' => true,
            'bridgeVersion' => BRIDGE_VERSION,
            'approval_id' => $approvalId,
            'product_id' => $productId,
            'applied' => $changes,
            'before' => $before,
            'after' => $after,
            'readback' => $readback,
            'message' => 'Approved Merchant product patch applied'
        ]);
    } catch (Throwable $error) {
        $db->rollback();
        bridgeJson([
            'error' => $error->getMessage(),
            'code' => 'MERCHANT_PATCH_FAILED',
            'product_id' => $productId,
            'before' => $before
        ]);
    }
}

if ($action === 'seo_inventory') {
    $products = [];
    $categories = [];
    $information = [];
    $productH1 = tableHasColumn($db, PREFIX . "product_description", "meta_h1") ? ", pd.meta_h1" : ", '' AS meta_h1";
    $productRes = $db->query(
        "SELECT p.product_id AS id, p.status, p.image, p.date_modified,
                pd.name, pd.description, pd.meta_title, pd.meta_description $productH1,
                su.keyword AS seo_keyword
         FROM " . PREFIX . "product p
         JOIN " . PREFIX . "product_description pd
           ON pd.product_id=p.product_id AND pd.language_id=" . LANG_ID . "
         LEFT JOIN " . PREFIX . "seo_url su
           ON su.query=CONCAT('product_id=', p.product_id) AND su.language_id=" . LANG_ID . "
         ORDER BY p.product_id"
    );
    if ($productRes) {
        while ($row = $productRes->fetch_assoc()) {
            $description = (string)($row['description'] ?? '');
            $keyword = trim((string)($row['seo_keyword'] ?? ''));
            $products[] = [
                'id' => (int)$row['id'],
                'product_id' => (int)$row['id'],
                'type' => 'product',
                'status' => (int)$row['status'],
                'name' => $row['name'] ?? '',
                'meta_title' => $row['meta_title'] ?? '',
                'meta_description' => $row['meta_description'] ?? '',
                'meta_h1' => $row['meta_h1'] ?? '',
                'description' => $description,
                'descriptionLength' => strlen(strip_tags($description)),
                'descriptionSha1' => sha1($description),
                'descriptionPreview' => substr(strip_tags($description), 0, 220),
                'schema_marker' => strpos($description, 'MERCATO_AI_PRODUCT_SCHEMA_START') !== false,
                'seo_keyword' => $keyword,
                'url' => $keyword ? storeBaseUrl() . '/' . ltrim($keyword, '/') : routeUrl($db, 'product_id=' . (int)$row['id']),
                'image' => storeImageUrl((string)($row['image'] ?? '')),
                'date_modified' => $row['date_modified'] ?? ''
            ];
        }
    }

    if (tableExists($db, PREFIX . "category") && tableExists($db, PREFIX . "category_description")) {
        $categoryColumns = tableColumnMeta($db, PREFIX . "category");
        $categoryH1 = tableHasColumn($db, PREFIX . "category_description", "meta_h1") ? ", cd.meta_h1" : ", '' AS meta_h1";
        $categoryDate = isset($categoryColumns['date_modified']) ? ", c.date_modified" : ", '' AS date_modified";
        $categoryRes = $db->query(
            "SELECT c.category_id AS id, c.status, c.parent_id, c.image $categoryDate,
                    cd.name, cd.description, cd.meta_title, cd.meta_description $categoryH1,
                    su.keyword AS seo_keyword
             FROM " . PREFIX . "category c
             JOIN " . PREFIX . "category_description cd
               ON cd.category_id=c.category_id AND cd.language_id=" . LANG_ID . "
             LEFT JOIN " . PREFIX . "seo_url su
               ON su.query=CONCAT('category_id=', c.category_id) AND su.language_id=" . LANG_ID . "
             ORDER BY c.category_id"
        );
        if ($categoryRes) {
            while ($row = $categoryRes->fetch_assoc()) {
                $description = (string)($row['description'] ?? '');
                $keyword = trim((string)($row['seo_keyword'] ?? ''));
                $categories[] = [
                    'id' => (int)$row['id'],
                    'category_id' => (int)$row['id'],
                    'type' => 'category',
                    'status' => (int)$row['status'],
                    'parent_id' => (int)$row['parent_id'],
                    'name' => $row['name'] ?? '',
                    'meta_title' => $row['meta_title'] ?? '',
                    'meta_description' => $row['meta_description'] ?? '',
                    'meta_h1' => $row['meta_h1'] ?? '',
                    'description' => $description,
                    'descriptionLength' => strlen(strip_tags($description)),
                    'descriptionSha1' => sha1($description),
                    'descriptionPreview' => substr(strip_tags($description), 0, 220),
                    'schema_marker' => strpos($description, 'MERCATO_AI_CATEGORY_SCHEMA_START') !== false,
                    'seo_keyword' => $keyword,
                    'url' => $keyword ? storeBaseUrl() . '/' . ltrim($keyword, '/') : routeUrl($db, 'category_id=' . (int)$row['id']),
                    'image' => storeImageUrl((string)($row['image'] ?? '')),
                    'date_modified' => $row['date_modified'] ?? ''
                ];
            }
        }
    }

    if (tableExists($db, PREFIX . "information") && tableExists($db, PREFIX . "information_description")) {
        $informationH1 = tableHasColumn($db, PREFIX . "information_description", "meta_h1") ? ", id.meta_h1" : ", '' AS meta_h1";
        $informationRes = $db->query(
            "SELECT i.information_id AS id, i.status, i.bottom, i.sort_order,
                    id.title AS name, id.description, id.meta_title, id.meta_description $informationH1,
                    su.keyword AS seo_keyword
             FROM " . PREFIX . "information i
             JOIN " . PREFIX . "information_description id
               ON id.information_id=i.information_id AND id.language_id=" . LANG_ID . "
             LEFT JOIN " . PREFIX . "seo_url su
               ON su.query=CONCAT('information_id=', i.information_id) AND su.language_id=" . LANG_ID . "
             ORDER BY i.information_id"
        );
        if ($informationRes) {
            while ($row = $informationRes->fetch_assoc()) {
                $description = (string)($row['description'] ?? '');
                $keyword = trim((string)($row['seo_keyword'] ?? ''));
                $information[] = [
                    'id' => (int)$row['id'],
                    'information_id' => (int)$row['id'],
                    'type' => 'information',
                    'status' => (int)$row['status'],
                    'bottom' => (int)$row['bottom'],
                    'sort_order' => (int)$row['sort_order'],
                    'name' => $row['name'] ?? '',
                    'meta_title' => $row['meta_title'] ?? '',
                    'meta_description' => $row['meta_description'] ?? '',
                    'meta_h1' => $row['meta_h1'] ?? '',
                    'description' => $description,
                    'descriptionLength' => strlen(strip_tags($description)),
                    'descriptionSha1' => sha1($description),
                    'descriptionPreview' => substr(strip_tags($description), 0, 220),
                    'schema_marker' => strpos($description, 'MERCATO_AI_INFORMATION_SCHEMA_START') !== false,
                    'seo_keyword' => $keyword,
                    'url' => $keyword ? storeBaseUrl() . '/' . ltrim($keyword, '/') : routeUrl($db, 'information_id=' . (int)$row['id'])
                ];
            }
        }
    }

    $files = seoFileManifest();
    $fingerprintRows = [];
    foreach (array_merge($products, $categories, $information) as $row) {
        $fingerprintRows[] = [
            'type' => $row['type'],
            'id' => $row['id'],
            'meta_title' => $row['meta_title'],
            'meta_description' => $row['meta_description'],
            'meta_h1' => $row['meta_h1'],
            'descriptionSha1' => $row['descriptionSha1'],
            'seo_keyword' => $row['seo_keyword'],
            'status' => $row['status'],
            'schema_marker' => $row['schema_marker']
        ];
    }
    bridgeJson([
        'ok' => true,
        'bridgeVersion' => BRIDGE_VERSION,
        'generatedAt' => gmdate('c'),
        'fingerprint' => hash('sha256', json_encode([$fingerprintRows, $files], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE)),
        'products' => $products,
        'categories' => $categories,
        'information' => $information,
        'files' => $files,
        'technical' => [
            'documentRoot' => basename(__DIR__),
            'bridgeCanWriteCodeFiles' => true,
            'maxFileBytes' => 1048576,
            'writePolicy' => 'exact allowlist + expected SHA-1 + approval + backup + readback + rollback'
        ],
        'counts' => [
            'products' => count($products),
            'categories' => count($categories),
            'information' => count($information),
            'files' => count($files)
        ]
    ]);
}

if ($action === 'seo_file_read') {
    try {
        bridgeJson([
            'ok' => true,
            'bridgeVersion' => BRIDGE_VERSION,
            'file' => seoReadAllowedFile((string)($_GET['file'] ?? ''))
        ]);
    } catch (Throwable $error) {
        bridgeJson(['error' => $error->getMessage(), 'code' => 'SEO_FILE_READ_FAILED']);
    }
}

if ($action === 'seo_apply_managed_schema') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') bridgeJson(['error' => 'POST required']);
    $body = readJsonBody();
    $approvalId = trim((string)($body['approval_id'] ?? ''));
    $confirmPhrase = trim((string)($body['confirmPhrase'] ?? ''));
    if ($approvalId === '' || $confirmPhrase !== 'APPLY_SEO_CHANGES') {
        bridgeJson(['error' => 'approval_id and APPLY_SEO_CHANGES are required', 'code' => 'SEO_APPROVAL_REQUIRED']);
    }
    $type = trim((string)($body['entity_type'] ?? $body['type'] ?? ''));
    $id = (int)($body['entity_id'] ?? $body['id'] ?? 0);
    if (!in_array($type, ['category', 'information'], true) || $id <= 0) {
        bridgeJson(['error' => 'Managed schema supports category or information entity']);
    }
    $before = seoEntitySnapshot($db, $type, $id);
    if (empty($before['found'])) bridgeJson(['error' => 'SEO entity not found']);
    $expectedFingerprint = trim((string)($body['expected_source_fingerprint'] ?? ''));
    if ($expectedFingerprint !== '' && !hash_equals($expectedFingerprint, (string)$before['source_fingerprint'])) {
        bridgeJson(['error' => 'SEO entity changed after approval', 'code' => 'SOURCE_CHANGED', 'before' => $before]);
    }
    $schemaType = $type === 'category' ? 'CollectionPage' : 'WebPage';
    $plain = trim(preg_replace('/\s+/u', ' ', strip_tags((string)($before['meta_description'] ?: $before['description']))) ?: '');
    $shortDescription = function_exists('mb_substr') ? mb_substr($plain, 0, 500, 'UTF-8') : substr($plain, 0, 500);
    $schema = [
        '@context' => 'https://schema.org',
        '@type' => $schemaType,
        'name' => (string)$before['name'],
        'url' => (string)$before['url'],
        'isPartOf' => [
            '@type' => 'WebSite',
            'name' => 'Mercato',
            'url' => storeBaseUrl() . '/'
        ]
    ];
    if ($shortDescription !== '') $schema['description'] = $shortDescription;
    $markerName = $type === 'category' ? 'CATEGORY' : 'INFORMATION';
    $start = '<!-- MERCATO_AI_' . $markerName . '_SCHEMA_START -->';
    $end = '<!-- MERCATO_AI_' . $markerName . '_SCHEMA_END -->';
    $block = $start . "\n" . jsonLdScript($schema) . "\n" . $end;
    [$description, $mode] = replaceMarkedBlock((string)$before['description'], $start, $end, $block);
    $config = seoEntityConfig($type);
    ensureSeoChangeLogTable($db);
    $db->begin_transaction();
    try {
        $db->query(
            "UPDATE `" . $config['table'] . "`
             SET description='" . $db->real_escape_string(stripMysqlUtf8Incompatible($description)) . "'
             WHERE `" . $config['id_field'] . "`=$id AND language_id=" . LANG_ID
        );
        if ($db->error) throw new Exception($db->error);
        if (tableHasColumn($db, $config['main_table'], 'date_modified')) {
            $db->query(
                "UPDATE `" . $config['main_table'] . "`
                 SET date_modified=NOW()
                 WHERE `" . $config['id_field'] . "`=$id"
            );
        }
        $after = seoEntitySnapshot($db, $type, $id);
        if (empty($after['schema_marker'])) throw new Exception('Managed schema readback mismatch');
        $changeId = recordSeoChange(
            $db,
            $approvalId,
            'entity_patch',
            $type,
            (string)$id,
            $before,
            $after,
            (string)$before['source_fingerprint']
        );
        $db->commit();
        bridgeJson([
            'ok' => true,
            'bridgeVersion' => BRIDGE_VERSION,
            'approval_id' => $approvalId,
            'change_id' => $changeId,
            'entity_type' => $type,
            'entity_id' => $id,
            'schema' => $schema,
            'mode' => $mode,
            'before' => $before,
            'after' => $after,
            'schemaReadback' => true
        ]);
    } catch (Throwable $error) {
        $db->rollback();
        bridgeJson(['error' => $error->getMessage(), 'code' => 'SEO_MANAGED_SCHEMA_FAILED', 'before' => $before]);
    }
}

if ($action === 'seo_apply_entity_patch') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') bridgeJson(['error' => 'POST required']);
    $body = readJsonBody();
    $approvalId = trim((string)($body['approval_id'] ?? ''));
    $confirmPhrase = trim((string)($body['confirmPhrase'] ?? ''));
    if ($approvalId === '' || $confirmPhrase !== 'APPLY_SEO_CHANGES') {
        bridgeJson(['error' => 'approval_id and APPLY_SEO_CHANGES are required', 'code' => 'SEO_APPROVAL_REQUIRED']);
    }
    $type = trim((string)($body['entity_type'] ?? $body['type'] ?? ''));
    $id = (int)($body['entity_id'] ?? $body['id'] ?? 0);
    $changes = isset($body['changes']) && is_array($body['changes']) ? $body['changes'] : [];
    $config = seoEntityConfig($type);
    if (!$config || $id <= 0 || !$changes) bridgeJson(['error' => 'entity_type, entity_id and changes are required']);
    $before = seoEntitySnapshot($db, $type, $id);
    if (empty($before['found'])) bridgeJson(['error' => 'SEO entity not found']);
    $expectedFingerprint = trim((string)($body['expected_source_fingerprint'] ?? ''));
    $actualFingerprint = seoEntitySourceFingerprint($before);
    if ($expectedFingerprint !== '' && !hash_equals($expectedFingerprint, $actualFingerprint)) {
        bridgeJson([
            'error' => 'SEO entity changed after approval',
            'code' => 'SOURCE_CHANGED',
            'expected' => $expectedFingerprint,
            'actual' => $actualFingerprint,
            'before' => $before
        ]);
    }
    $allowedDescriptionFields = ['name', 'meta_title', 'meta_description', 'meta_h1', 'description'];
    $descriptionColumns = tableColumnMeta($db, $config['table']);
    $sets = [];
    foreach ($allowedDescriptionFields as $field) {
        if (!array_key_exists($field, $changes)) continue;
        $column = $field === 'name' ? $config['name_field'] : $field;
        if (!isset($descriptionColumns[$column])) continue;
        $value = stripMysqlUtf8Incompatible((string)$changes[$field]);
        $limits = ['name' => 255, 'meta_title' => 255, 'meta_description' => 500, 'meta_h1' => 255, 'description' => 250000];
        if (strlen($value) > ($limits[$field] ?? 250000)) throw new Exception('SEO field exceeds safety limit: ' . $field);
        $sets[] = "`$column`='" . $db->real_escape_string($value) . "'";
    }
    ensureSeoChangeLogTable($db);
    $db->begin_transaction();
    try {
        if ($sets) {
            $db->query(
                "UPDATE `" . $config['table'] . "`
                 SET " . implode(',', $sets) . "
                 WHERE `" . $config['id_field'] . "`=$id AND language_id=" . LANG_ID
            );
            if ($db->error) throw new Exception($db->error);
        }
        if (array_key_exists('status', $changes) && tableHasColumn($db, $config['main_table'], 'status')) {
            $status = !empty($changes['status']) ? 1 : 0;
            $db->query(
                "UPDATE `" . $config['main_table'] . "`
                 SET status=$status
                 WHERE `" . $config['id_field'] . "`=$id"
            );
            if ($db->error) throw new Exception($db->error);
        }
        if (array_key_exists('seo_keyword', $changes)) {
            if (!tableExists($db, PREFIX . 'seo_url')) throw new Exception('seo_url table not found');
            $requested = trim((string)$changes['seo_keyword']);
            $requested = preg_replace('/[^a-z0-9\-\/]+/i', '-', transliterateSlugText($requested));
            $requested = trim((string)$requested, '-/');
            if ($requested === '') throw new Exception('SEO keyword cannot be empty');
            $query = $config['query_prefix'] . $id;
            $keyword = uniqueSeoKeyword($db, $requested, $query);
            if ($keyword !== $requested) throw new Exception('SEO keyword became non-unique after approval');
            $queryEsc = $db->real_escape_string($query);
            $keywordEsc = $db->real_escape_string($keyword);
            $existing = $db->query(
                "SELECT seo_url_id FROM " . PREFIX . "seo_url
                 WHERE query='$queryEsc' AND language_id=" . LANG_ID . "
                 ORDER BY seo_url_id DESC LIMIT 1"
            );
            $row = $existing ? $existing->fetch_assoc() : null;
            if ($row) {
                $db->query(
                    "UPDATE " . PREFIX . "seo_url
                     SET keyword='$keywordEsc'
                     WHERE seo_url_id=" . (int)$row['seo_url_id']
                );
            } else {
                $insertSets = seoUrlInsertSets($db, 0, (int)LANG_ID, $query, $keyword);
                $db->query("INSERT INTO " . PREFIX . "seo_url SET " . implode(',', $insertSets));
            }
            if ($db->error) throw new Exception($db->error);
        }
        if (tableHasColumn($db, $config['main_table'], 'date_modified')) {
            $db->query(
                "UPDATE `" . $config['main_table'] . "`
                 SET date_modified=NOW()
                 WHERE `" . $config['id_field'] . "`=$id"
            );
        }
        $after = seoEntitySnapshot($db, $type, $id);
        foreach ($changes as $field => $expected) {
            if (!in_array($field, array_merge($allowedDescriptionFields, ['status', 'seo_keyword']), true)) continue;
            $actual = $after[$field] ?? null;
            if (!seoEntityReadbackMatches($field, $actual, $expected)) {
                throw new Exception(
                    'SEO entity readback mismatch for ' . $field .
                    ' (expected_len=' . strlen((string)$expected) .
                    ', actual_len=' . strlen((string)$actual) . ')'
                );
            }
        }
        $changeId = recordSeoChange(
            $db,
            $approvalId,
            'entity_patch',
            $type,
            (string)$id,
            $before,
            $after,
            $actualFingerprint
        );
        $db->commit();
        bridgeJson([
            'ok' => true,
            'bridgeVersion' => BRIDGE_VERSION,
            'approval_id' => $approvalId,
            'change_id' => $changeId,
            'entity_type' => $type,
            'entity_id' => $id,
            'applied' => $changes,
            'before' => $before,
            'after' => $after,
            'readbackExact' => true
        ]);
    } catch (Throwable $error) {
        $db->rollback();
        bridgeJson(['error' => $error->getMessage(), 'code' => 'SEO_ENTITY_PATCH_FAILED', 'before' => $before]);
    }
}

if ($action === 'seo_apply_file_patch') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') bridgeJson(['error' => 'POST required']);
    $body = readJsonBody();
    $approvalId = trim((string)($body['approval_id'] ?? ''));
    $confirmPhrase = trim((string)($body['confirmPhrase'] ?? ''));
    if ($approvalId === '' || $confirmPhrase !== 'APPLY_SEO_CHANGES') {
        bridgeJson(['error' => 'approval_id and APPLY_SEO_CHANGES are required', 'code' => 'SEO_APPROVAL_REQUIRED']);
    }
    try {
        $relative = (string)($body['file'] ?? '');
        $content = (string)($body['content'] ?? '');
        $expectedSha1 = trim((string)($body['expected_sha1'] ?? ''));
        $write = seoWriteAllowedFile($relative, $content, $expectedSha1);
        $changeId = recordSeoChange(
            $db,
            $approvalId,
            'file_patch',
            'site_file',
            $relative,
            $write['before'],
            $write['after'],
            (string)$write['before']['sha1']
        );
        bridgeJson([
            'ok' => true,
            'bridgeVersion' => BRIDGE_VERSION,
            'approval_id' => $approvalId,
            'change_id' => $changeId,
            'file' => $relative,
            'before' => $write['before'],
            'after' => $write['after'],
            'readbackExact' => true
        ]);
    } catch (Throwable $error) {
        bridgeJson(['error' => $error->getMessage(), 'code' => 'SEO_FILE_PATCH_FAILED']);
    }
}

if ($action === 'seo_rollback_change') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') bridgeJson(['error' => 'POST required']);
    $body = readJsonBody();
    $approvalId = trim((string)($body['approval_id'] ?? ''));
    $confirmPhrase = trim((string)($body['confirmPhrase'] ?? ''));
    $changeId = (int)($body['change_id'] ?? 0);
    if ($approvalId === '' || $confirmPhrase !== 'ROLLBACK_SEO_CHANGE' || $changeId <= 0) {
        bridgeJson(['error' => 'approval_id, change_id and ROLLBACK_SEO_CHANGE are required', 'code' => 'SEO_ROLLBACK_APPROVAL_REQUIRED']);
    }
    try {
        ensureSeoChangeLogTable($db);
        $table = PREFIX . 'mercato_seo_change_log';
        $res = $db->query("SELECT * FROM `$table` WHERE change_id=$changeId LIMIT 1");
        $change = $res ? $res->fetch_assoc() : null;
        if (!$change) throw new Exception('SEO change log entry not found');
        if (!empty($change['rolled_back_at'])) throw new Exception('SEO change was already rolled back');
        $before = json_decode((string)$change['before_json'], true);
        if (!is_array($before)) throw new Exception('SEO backup is invalid');
        if ($change['change_type'] === 'file_patch') {
            $current = seoReadAllowedFile((string)$change['target_key']);
            $expectedAfter = json_decode((string)$change['after_json'], true);
            $expectedAfterSha1 = is_array($expectedAfter) ? (string)($expectedAfter['sha1'] ?? '') : '';
            if ($expectedAfterSha1 !== '' && !hash_equals($expectedAfterSha1, (string)$current['sha1'])) {
                throw new Exception('SEO file changed after the original patch; rollback requires a new review');
            }
            if (empty($before['exists'])) {
                $absolute = seoResolveAllowedFile((string)$change['target_key']);
                if (is_file($absolute) && !unlink($absolute)) throw new Exception('SEO rollback could not remove newly created file');
                $readback = seoReadAllowedFile((string)$change['target_key']);
                if (!empty($readback['exists'])) throw new Exception('SEO file deletion readback mismatch');
            } else {
                $restored = seoWriteAllowedFile((string)$change['target_key'], (string)($before['content'] ?? ''), (string)$current['sha1']);
                $readback = $restored['after'];
            }
        } elseif ($change['change_type'] === 'entity_patch') {
            $type = (string)$change['target_type'];
            $id = (int)$change['target_key'];
            $config = seoEntityConfig($type);
            if (!$config) throw new Exception('SEO entity rollback type is unsupported');
            $fields = ['name', 'meta_title', 'meta_description', 'meta_h1', 'description'];
            $columns = tableColumnMeta($db, $config['table']);
            $sets = [];
            foreach ($fields as $field) {
                $column = $field === 'name' ? $config['name_field'] : $field;
                if (!array_key_exists($field, $before) || !isset($columns[$column])) continue;
                $sets[] = "`$column`='" . $db->real_escape_string((string)$before[$field]) . "'";
            }
            $db->begin_transaction();
            if ($sets) {
                $db->query(
                    "UPDATE `" . $config['table'] . "`
                     SET " . implode(',', $sets) . "
                     WHERE `" . $config['id_field'] . "`=$id AND language_id=" . LANG_ID
                );
                if ($db->error) throw new Exception($db->error);
            }
            if (array_key_exists('status', $before) && tableHasColumn($db, $config['main_table'], 'status')) {
                $status = !empty($before['status']) ? 1 : 0;
                $db->query(
                    "UPDATE `" . $config['main_table'] . "`
                     SET status=$status
                     WHERE `" . $config['id_field'] . "`=$id"
                );
                if ($db->error) throw new Exception($db->error);
            }
            if (array_key_exists('seo_keyword', $before)) {
                $query = $config['query_prefix'] . $id;
                $queryEsc = $db->real_escape_string($query);
                $keywordEsc = $db->real_escape_string((string)$before['seo_keyword']);
                $db->query(
                    "UPDATE " . PREFIX . "seo_url
                     SET keyword='$keywordEsc'
                     WHERE query='$queryEsc' AND language_id=" . LANG_ID
                );
                if ($db->error) throw new Exception($db->error);
            }
            $readback = seoEntitySnapshot($db, $type, $id);
            $db->commit();
        } else {
            throw new Exception('SEO rollback type is unsupported');
        }
        $db->query(
            "UPDATE `$table`
             SET rolled_back_at=NOW()
             WHERE change_id=$changeId"
        );
        bridgeJson([
            'ok' => true,
            'bridgeVersion' => BRIDGE_VERSION,
            'approval_id' => $approvalId,
            'change_id' => $changeId,
            'rolledBack' => true,
            'readback' => $readback
        ]);
    } catch (Throwable $error) {
        if (isset($db) && $db->errno) {
            try { $db->rollback(); } catch (Throwable $ignored) {}
        }
        bridgeJson(['error' => $error->getMessage(), 'code' => 'SEO_ROLLBACK_FAILED']);
    }
}

if ($action === 'content_read') {
    $type = trim($_GET['type'] ?? 'product');
    $url = trim($_GET['url'] ?? '');
    $slug = trim($_GET['slug'] ?? '');
    $directId = (int)($_GET['id'] ?? 0);
    if ($type === 'product') {
        $id = productIdByUrlOrSlug($db, $url, $slug, (int)($_GET['product_id'] ?? $directId));
        if (!$id) bridgeJson(['error' => 'Product not found by URL/slug']);
        bridgeJson([
            'ok' => true,
            'type' => 'product',
            'product_id' => $id,
            'id' => $id,
            'url' => $url ?: routeUrl($db, 'product_id=' . $id),
            'snapshot' => seoEntitySnapshot($db, 'product', $id),
            'attributeCatalog' => attributeCatalog($db)
        ]);
    }
    if ($type === 'category') {
        $id = (int)($_GET['category_id'] ?? $directId);
        if (!$id) $id = categoryIdByUrlOrSlug($db, $url, $slug);
        if (!$id) bridgeJson(['error' => 'Category not found by URL/slug']);
        bridgeJson([
            'ok' => true,
            'type' => 'category',
            'category_id' => $id,
            'id' => $id,
            'url' => $url ?: routeUrl($db, 'category_id=' . $id),
            'snapshot' => seoEntitySnapshot($db, 'category', $id),
            'attributeCatalog' => []
        ]);
    }
    if ($type === 'information') {
        $id = (int)($_GET['information_id'] ?? $directId);
        if (!$id) $id = informationIdByUrlOrSlug($db, $url, $slug);
        if (!$id) bridgeJson(['error' => 'Information page not found by URL/slug']);
        bridgeJson([
            'ok' => true,
            'type' => 'information',
            'information_id' => $id,
            'id' => $id,
            'url' => $url ?: routeUrl($db, 'information_id=' . $id),
            'snapshot' => seoEntitySnapshot($db, 'information', $id),
            'attributeCatalog' => []
        ]);
    }
    bridgeJson(['error' => 'Unsupported type']);
}

if ($action === 'attribute_catalog') {
    echo json_encode([
        'ok' => true,
        'attributes' => attributeCatalog($db)
    ]);
    exit;
}

if ($action === 'supplier_match_products') {
    $body = $_SERVER['REQUEST_METHOD'] === 'POST' ? readJsonBody() : [];
    $articles = supplierArticleList($body['articles'] ?? ($_GET['articles'] ?? []));
    $articles = array_slice($articles, 0, 500);
    if (!$articles) {
        echo json_encode(['ok' => true, 'matches' => [], 'count' => 0]);
        exit;
    }

    $articleByKey = [];
    $escaped = [];
    foreach ($articles as $article) {
        $key = supplierArticleKey($article);
        $articleByKey[$key] = $article;
        $escaped[] = "'" . $db->real_escape_string($article) . "'";
    }
    $in = implode(',', $escaped);
    $res = $db->query(
        "SELECT p.product_id, p.model, p.sku, p.status, p.quantity, p.stock_status_id, ss.name AS stock_status,
                pd.name, su.keyword
         FROM " . PREFIX . "product p
         JOIN " . PREFIX . "product_description pd ON p.product_id = pd.product_id AND pd.language_id = " . LANG_ID . "
         LEFT JOIN " . PREFIX . "seo_url su ON su.query = CONCAT('product_id=', p.product_id) AND su.language_id = " . LANG_ID . "
         LEFT JOIN " . PREFIX . "stock_status ss ON ss.stock_status_id = p.stock_status_id AND ss.language_id = " . LANG_ID . "
         WHERE p.model IN ($in) OR p.sku IN ($in)
         ORDER BY p.status DESC, (p.quantity > 0) DESC, p.product_id DESC"
    );

    $matches = [];
    foreach ($articles as $article) $matches[$article] = [];
    $productIds = [];
    $rows = [];
    if ($res) {
        while ($row = $res->fetch_assoc()) {
            $rows[] = $row;
            $productIds[] = (int)$row['product_id'];
        }
    }
    $attrsByProduct = productAttributesMapForIds($db, $productIds);
    foreach ($rows as $row) {
        $matchedArticles = [];
        foreach (['model', 'sku'] as $field) {
            $key = supplierArticleKey((string)($row[$field] ?? ''));
            if (isset($articleByKey[$key])) $matchedArticles[$articleByKey[$key]] = $articleByKey[$key];
        }
        foreach ($matchedArticles as $article) {
            $pid = (int)$row['product_id'];
            $item = $row;
            $item['id'] = $pid;
            $item['product_id'] = $pid;
            $item['url'] = !empty($item['keyword']) ? 'https://mercato.com.ua/' . $item['keyword'] : routeUrl($db, 'product_id=' . $pid);
            $item['routeUrl'] = $item['url'];
            $item['attributes'] = $attrsByProduct[$pid] ?? [];
            $matches[$article][] = $item;
        }
    }

    echo json_encode([
        'ok' => true,
        'count' => count($articles),
        'matches' => $matches
    ]);
    exit;
}

if ($action === 'supplier_apply_lots') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['error' => 'POST required']);
        exit;
    }
    $body = readJsonBody();
    $updates = $body['updates'] ?? [];
    if (is_string($updates)) {
        $decoded = json_decode($updates, true);
        $updates = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($updates)) $updates = [];
    $results = [];
    foreach ($updates as $update) {
        if (!is_array($update)) continue;
        $productId = (int)($update['product_id'] ?? ($update['id'] ?? 0));
        $attributes = isset($update['attributes']) && is_array($update['attributes']) ? $update['attributes'] : [];
        $article = supplierArticleKey((string)($update['article'] ?? ''));
        if ($productId <= 0 || !$attributes) {
            $results[] = ['ok' => false, 'product_id' => $productId, 'article' => $article, 'error' => 'product_id and attributes are required'];
            continue;
        }
        $exists = $db->query("SELECT product_id FROM " . PREFIX . "product WHERE product_id=$productId LIMIT 1");
        if (!$exists || $exists->num_rows < 1) {
            $results[] = ['ok' => false, 'product_id' => $productId, 'article' => $article, 'error' => 'Product not found'];
            continue;
        }
        $writtenAttrs = updateProductAttributes($db, $productId, $attributes);
        $attrError = $db->error;
        $db->query("UPDATE " . PREFIX . "product SET date_modified=NOW() WHERE product_id=$productId");
        $results[] = [
            'ok' => !$attrError,
            'product_id' => $productId,
            'id' => $productId,
            'article' => $article,
            'writtenAttributes' => $writtenAttrs,
            'writtenAttributesCount' => count($writtenAttrs),
            'error' => $attrError,
            'readback' => readProductSnapshot($db, $productId)
        ];
    }
    echo json_encode([
        'ok' => true,
        'results' => $results,
        'updated' => count(array_filter($results, function ($row) { return !empty($row['ok']); })),
        'message' => 'Supplier attributes updated'
    ]);
    exit;
}

if ($action === 'seo_apply_product_schema') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        bridgeJson(['error' => 'POST required']);
    }
    $id = 0;
    $beforeSnapshot = [];
    try {
        $body = readJsonBody();
        $approvalId = trim((string)($body['approval_id'] ?? ''));
        $confirmPhrase = trim((string)($body['confirmPhrase'] ?? $body['confirmation'] ?? ''));
        if ($approvalId === '' || $confirmPhrase !== 'APPLY_SEO_CHANGES') {
            bridgeJson([
                'error' => 'approval_id and APPLY_SEO_CHANGES are required',
                'code' => 'SEO_APPROVAL_REQUIRED'
            ]);
        }
        $url = trim($body['url'] ?? '');
        $slug = trim($body['slug'] ?? '');
        $directProductId = (int)($body['product_id'] ?? $body['id'] ?? 0);
        $id = productIdByUrlOrSlug($db, $url, $slug, $directProductId);
        if (!$id) {
            bridgeJson(['error' => 'Product not found by URL/slug', 'code' => 'PRODUCT_NOT_FOUND']);
        }
        $beforeSnapshot = seoEntitySnapshot($db, 'product', $id);
        if (empty($beforeSnapshot['found'])) {
            bridgeJson(['error' => 'Product SEO entity not found', 'code' => 'PRODUCT_NOT_FOUND']);
        }
        $expectedSourceFingerprint = trim((string)($body['expected_source_fingerprint'] ?? ''));
        if ($expectedSourceFingerprint !== '' && !hash_equals($expectedSourceFingerprint, (string)$beforeSnapshot['source_fingerprint'])) {
            bridgeJson([
                'error' => 'SEO entity changed after approval',
                'code' => 'SOURCE_CHANGED',
                'before' => $beforeSnapshot
            ]);
        }

        $h1Field = tableHasColumn($db, PREFIX . "product_description", "meta_h1") ? ", pd.meta_h1" : ", '' AS meta_h1";
        $res = $db->query(
            "SELECT p.product_id, p.model, p.sku, p.quantity, p.status, p.price, p.image,
                    p.stock_status_id, ss.name AS stock_status,
                    pd.name, pd.description, pd.meta_description $h1Field,
                    m.name AS manufacturer,
                    (SELECT ps.price FROM " . PREFIX . "product_special ps
                     WHERE ps.product_id=p.product_id
                       AND (ps.customer_group_id=1 OR ps.customer_group_id=0)
                       AND (ps.date_start='0000-00-00' OR ps.date_start<=CURDATE())
                       AND (ps.date_end='0000-00-00' OR ps.date_end>=CURDATE())
                     ORDER BY ps.priority ASC, ps.price ASC LIMIT 1) AS special_price
             FROM " . PREFIX . "product p
             JOIN " . PREFIX . "product_description pd ON p.product_id = pd.product_id AND pd.language_id = " . LANG_ID . "
             LEFT JOIN " . PREFIX . "stock_status ss ON ss.stock_status_id = p.stock_status_id AND ss.language_id = " . LANG_ID . "
             LEFT JOIN " . PREFIX . "manufacturer m ON m.manufacturer_id = p.manufacturer_id
             WHERE p.product_id=$id
             LIMIT 1"
        );
        if ($db->error) throw new Exception('Product schema read failed: ' . $db->error);
        $row = $res ? $res->fetch_assoc() : null;
        if (!$row) {
            bridgeJson(['error' => 'Product description not found', 'code' => 'PRODUCT_DESCRIPTION_NOT_FOUND']);
        }

        $productUrl = $url ?: routeUrl($db, 'product_id=' . $id);
        if (!$productUrl) $productUrl = storeBaseUrl() . '/index.php?route=product/product&product_id=' . $id;
        $htmlFlags = defined('ENT_HTML5') ? (ENT_QUOTES | ENT_HTML5) : ENT_QUOTES;
        $descriptionText = trim(strip_tags(html_entity_decode($row['meta_description'] ?: $row['description'] ?: '', $htmlFlags, 'UTF-8')));
        $descriptionText = preg_replace('/\s+/u', ' ', $descriptionText) ?: $descriptionText;
        $shortDescription = seoTrimText($descriptionText ?: ($row['name'] ?: ''), 500);
        $availability = ((int)$row['status'] === 1 && (float)$row['quantity'] > 0)
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock';
        $schemaPrice = isset($row['special_price']) && is_numeric($row['special_price']) && (float)$row['special_price'] > 0
            ? (float)$row['special_price']
            : (float)$row['price'];
        $schema = [
            '@context' => 'https://schema.org',
            '@type' => 'Product',
            'name' => $row['name'] ?: '',
            'description' => $shortDescription,
            'sku' => $row['sku'] ?: ($row['model'] ?: (string)$id),
            'mpn' => $row['model'] ?: (string)$id,
            'url' => $productUrl,
            'brand' => [
                '@type' => 'Brand',
                'name' => $row['manufacturer'] ?: 'Mercato'
            ],
            'offers' => [
                '@type' => 'Offer',
                'url' => $productUrl,
                'priceCurrency' => 'UAH',
                'price' => number_format($schemaPrice, 2, '.', ''),
                'availability' => $availability,
                'itemCondition' => 'https://schema.org/NewCondition'
            ]
        ];
        $imageUrl = storeImageUrl($row['image'] ?? '');
        if ($imageUrl) $schema['image'] = [$imageUrl];

        $start = '<!-- MERCATO_AI_PRODUCT_SCHEMA_START -->';
        $end = '<!-- MERCATO_AI_PRODUCT_SCHEMA_END -->';
        $block = $start . "\n" . jsonLdScript($schema) . "\n" . $end;
        [$newDescription, $mode] = replaceMarkedBlock((string)$row['description'], $start, $end, $block);

        ensureSeoChangeLogTable($db);
        $db->begin_transaction();
        $db->query(
            "UPDATE " . PREFIX . "product_description
             SET description='" . $db->real_escape_string(stripMysqlUtf8Incompatible($newDescription)) . "'
             WHERE product_id=$id AND language_id=" . LANG_ID
        );
        if ($db->error) throw new Exception('Product schema write failed: ' . $db->error);
        $affected = $db->affected_rows;
        $db->query("UPDATE " . PREFIX . "product SET date_modified=NOW() WHERE product_id=$id");
        if ($db->error) throw new Exception('Product date_modified update failed: ' . $db->error);

        $readback = seoEntitySnapshot($db, 'product', $id);
        $schemaReadback = !empty($readback['schema_marker']);
        if (!$schemaReadback) throw new Exception('Product schema readback mismatch');
        $changeId = recordSeoChange(
            $db,
            $approvalId,
            'entity_patch',
            'product',
            (string)$id,
            $beforeSnapshot,
            $readback,
            (string)$beforeSnapshot['source_fingerprint']
        );
        $db->commit();
        bridgeJson([
            'ok' => true,
            'bridgeVersion' => BRIDGE_VERSION,
            'approval_id' => $approvalId,
            'change_id' => $changeId,
            'product_id' => $id,
            'url' => $productUrl,
            'mode' => $mode,
            'affectedRows' => $affected,
            'schema' => $schema,
            'readback' => $readback,
            'schemaReadback' => true,
            'message' => $mode === 'updated' ? 'Product JSON-LD оновлено' : 'Product JSON-LD додано'
        ]);
    } catch (Throwable $error) {
        if (method_exists($db, 'rollback')) {
            @$db->rollback();
        }
        bridgeJson([
            'ok' => false,
            'error' => $error->getMessage(),
            'code' => 'SEO_PRODUCT_SCHEMA_FAILED',
            'bridgeVersion' => BRIDGE_VERSION,
            'product_id' => $id,
            'before' => $beforeSnapshot
        ]);
    }
}

if ($action === 'seo_apply_product_basics') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['error' => 'POST required']);
        exit;
    }
    $body = readJsonBody();
    $approvalId = trim((string)($body['approval_id'] ?? ''));
    $confirmPhrase = trim((string)($body['confirmPhrase'] ?? $body['confirmation'] ?? ''));
    if ($approvalId === '' || $confirmPhrase !== 'APPLY_SEO_CHANGES') {
        bridgeJson([
            'error' => 'approval_id and APPLY_SEO_CHANGES are required',
            'code' => 'SEO_APPROVAL_REQUIRED'
        ]);
    }
    $task = trim($body['task'] ?? '');
    if (!in_array($task, ['h1', 'meta_title', 'meta_description'], true)) {
        echo json_encode(['error' => 'Unsupported SEO basics task']);
        exit;
    }

    $url = trim($body['url'] ?? '');
    $slug = trim($body['slug'] ?? '');
    $directProductId = (int)($body['product_id'] ?? $body['id'] ?? 0);
    $id = productIdByUrlOrSlug($db, $url, $slug, $directProductId);
    if (!$id) { echo json_encode(['error' => 'Product not found by URL/slug']); exit; }
    $beforeSnapshot = seoEntitySnapshot($db, 'product', $id);
    $expectedSourceFingerprint = trim((string)($body['expected_source_fingerprint'] ?? ''));
    if ($expectedSourceFingerprint !== '' && !hash_equals($expectedSourceFingerprint, (string)$beforeSnapshot['source_fingerprint'])) {
        bridgeJson([
            'error' => 'SEO entity changed after approval',
            'code' => 'SOURCE_CHANGED',
            'before' => $beforeSnapshot
        ]);
    }

    $hasH1 = tableHasColumn($db, PREFIX . "product_description", "meta_h1");
    $h1Field = $hasH1 ? ", pd.meta_h1" : ", '' AS meta_h1";
    $res = $db->query(
        "SELECT p.product_id, pd.name, pd.description, pd.meta_title, pd.meta_description $h1Field
         FROM " . PREFIX . "product p
         JOIN " . PREFIX . "product_description pd ON p.product_id = pd.product_id AND pd.language_id = " . LANG_ID . "
         WHERE p.product_id=$id
         LIMIT 1"
    );
    $row = $res ? $res->fetch_assoc() : null;
    if (!$row) { echo json_encode(['error' => 'Product description not found']); exit; }

    $sets = [];
    $written = [];
    $mode = '';
    $productName = seoTrimText($row['name'] ?: ('Товар Mercato #' . $id), 90);

    if ($task === 'h1') {
        $h1 = seoTrimText($body['h1'] ?? ($body['meta_h1'] ?? $productName), 90);
        if ($h1 === '') $h1 = $productName;
        if ($hasH1) {
            $sets[] = "meta_h1='" . $db->real_escape_string($h1) . "'";
            $written['meta_h1'] = $h1;
            $mode = 'meta_h1';
        } else {
            $start = '<!-- MERCATO_AI_PRODUCT_H1_START -->';
            $end = '<!-- MERCATO_AI_PRODUCT_H1_END -->';
            $block = $start . "\n<h1>" . htmlspecialchars($h1, ENT_QUOTES, 'UTF-8') . "</h1>\n" . $end;
            [$newDescription, $blockMode] = prependMarkedBlock((string)$row['description'], $start, $end, $block);
            $sets[] = "description='" . $db->real_escape_string(stripMysqlUtf8Incompatible($newDescription)) . "'";
            $written['description_h1'] = $h1;
            $mode = 'description_h1_' . $blockMode;
        }
    }

    if ($task === 'meta_title') {
        $title = seoTrimText($body['title'] ?? ($body['meta_title'] ?? ($productName . ' | Mercato')), 65);
        if ($title === '') $title = seoTrimText($productName . ' | Mercato', 65);
        $sets[] = "meta_title='" . $db->real_escape_string($title) . "'";
        $written['meta_title'] = $title;
        $mode = 'meta_title';
    }

    if ($task === 'meta_description') {
        $plain = plainDescriptionText((string)($row['description'] ?? ''));
        $fallback = $plain ?: ('Купити ' . $productName . ' в Mercato з доставкою по Україні.');
        $meta = seoTrimText($body['metaDescription'] ?? ($body['meta_description'] ?? $fallback), 155);
        if ($meta === '') $meta = seoTrimText('Купити ' . $productName . ' в Mercato з доставкою по Україні.', 155);
        $sets[] = "meta_description='" . $db->real_escape_string($meta) . "'";
        $written['meta_description'] = $meta;
        $mode = 'meta_description';
    }

    if (!$sets) {
        echo json_encode(['error' => 'Nothing to update']);
        exit;
    }

    $db->query(
        "UPDATE " . PREFIX . "product_description
         SET " . implode(',', $sets) . "
         WHERE product_id=$id AND language_id=" . LANG_ID
    );
    $descriptionError = $db->error;
    $affected = $db->affected_rows;
    $db->query("UPDATE " . PREFIX . "product SET date_modified=NOW() WHERE product_id=$id");

    $readback = seoEntitySnapshot($db, 'product', $id);
    $changeId = 0;
    if (!$descriptionError) {
        $changeId = recordSeoChange(
            $db,
            $approvalId,
            'entity_patch',
            'product',
            (string)$id,
            $beforeSnapshot,
            $readback,
            (string)$beforeSnapshot['source_fingerprint']
        );
    }
    echo json_encode([
        'ok' => !$descriptionError,
        'bridgeVersion' => BRIDGE_VERSION,
        'approval_id' => $approvalId,
        'change_id' => $changeId,
        'product_id' => $id,
        'url' => $url ?: routeUrl($db, 'product_id=' . $id),
        'task' => $task,
        'mode' => $mode,
        'fields' => $written,
        'affectedRows' => $affected,
        'error' => $descriptionError,
        'readback' => $readback,
        'message' => $descriptionError ? 'SEO field update failed' : 'SEO поле оновлено'
    ]);
    exit;
}

if ($action === 'publish_diagnostics') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['error' => 'POST required']);
        exit;
    }
    $body = readJsonBody();
    $type = $body['type'] ?? 'product';
    $url = trim($body['url'] ?? '');
    $slug = trim($body['slug'] ?? '');
    $directProductId = (int)($body['product_id'] ?? $body['id'] ?? 0);
    $id = 0;
    if ($type === 'product') $id = productIdByUrlOrSlug($db, $url, $slug, $directProductId);
    if ($type === 'category') $id = categoryIdByUrlOrSlug($db, $url, $slug);
    if ($type === 'information') $id = informationIdByUrlOrSlug($db, $url, $slug);
    echo json_encode([
        'ok' => true,
        'method' => $_SERVER['REQUEST_METHOD'],
        'content_type' => $_SERVER['CONTENT_TYPE'] ?? '',
        'type' => $type,
        'mode' => $body['mode'] ?? '',
        'resolved_id' => $id,
        'language_id' => LANG_ID,
        'title_length' => strlen((string)($body['title'] ?? $body['meta_title'] ?? '')),
        'content_length' => strlen((string)($body['content'] ?? $body['description'] ?? '')),
        'has_content_b64' => isset($body['content_b64']) || isset($body['description_b64']),
        'attribute_count' => isset($body['attributes']) && is_array($body['attributes']) ? count($body['attributes']) : 0,
        'body_keys' => array_slice(array_keys($body), 0, 30)
    ]);
    exit;
}

// ── PUBLISH GENERATED SEO CONTENT ────────────────────────────
if ($action === 'publish_content') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        echo json_encode(['error' => 'POST required']);
        exit;
    }

    $body = readJsonBody();
    $type = $body['type'] ?? 'product';
    $mode = $body['mode'] ?? 'existing';
    $url = trim($body['url'] ?? '');
    $slug = trim($body['slug'] ?? '');
    $directProductId = (int)($body['product_id'] ?? $body['id'] ?? 0);
    $title = trim(stripMysqlUtf8Incompatible($body['title'] ?? ''));
    $meta = trim(stripMysqlUtf8Incompatible($body['metaDescription'] ?? ($body['meta_description'] ?? '')));
    $h1 = trim(stripMysqlUtf8Incompatible($body['h1'] ?? ($body['meta_h1'] ?? '')));
    $content = trim(stripMysqlUtf8Incompatible($body['content'] ?? ($body['description'] ?? '')));
    $productName = trim(stripMysqlUtf8Incompatible($body['productName'] ?? ($body['name'] ?? ($h1 ?: $title))));
    $attributes = isset($body['attributes']) && is_array($body['attributes']) ? $body['attributes'] : [];
    $payloadPrice = priceFromPayload($body);

    if (!$title || !$content) {
        echo json_encode(['error' => 'title and content are required']);
        exit;
    }

    if ($type === 'product') {
        if ($mode === 'new') {
            $model = productDraftModelFromPayload($body, $attributes);
            $productSets = productDraftInsertSets($db, $model, $payloadPrice);
            $existingProductId = productIdByModelOrSku($db, $model);
            $reusedDraft = false;
            if ($existingProductId > 0) {
                $updateSets = array_values(array_filter($productSets, function ($set) {
                    return strpos($set, '`date_added`=') !== 0;
                }));
                $db->query("UPDATE " . PREFIX . "product SET " . implode(',', $updateSets) . " WHERE product_id=" . (int)$existingProductId);
                $id = (int)$existingProductId;
                $insertError = $db->error;
                $reusedDraft = true;
            } else {
                $db->query("INSERT INTO " . PREFIX . "product SET " . implode(',', $productSets));
                $id = (int)$db->insert_id;
                $insertError = $db->error;
            }
            if ($id <= 0 || $insertError) {
                bridgeJson(['error' => ($reusedDraft ? 'Product update failed: ' : 'Product insert failed: ') . $insertError]);
            }

            if (tableExists($db, PREFIX . "product_to_store")) {
                $db->query("INSERT IGNORE INTO " . PREFIX . "product_to_store SET product_id=$id, store_id=0");
            }

            $nameRaw = $productName ?: $h1 ?: $title;
            $descriptionWrite = upsertProductDescriptionRows($db, $id, $nameRaw, $content, $title, $meta, $h1 ?: $nameRaw);
            if (!$descriptionWrite['ok']) {
                bridgeJson([
                    'error' => 'Product description write failed: ' . ($descriptionWrite['errors'][0]['error'] ?? 'unknown error'),
                    'product_id' => $id,
                    'id' => $id,
                    'model' => $model,
                    'sku' => $model,
                    'descriptionWrite' => $descriptionWrite
                ]);
            }
            $writtenAttrs = updateProductAttributes($db, $id, $attributes);
            $commerce = applyProductCommerce($db, $id, $body, $attributes, $nameRaw, $model, $payloadPrice);
            $readback = publishReadback($db, $id, $title, $content, $writtenAttrs);
            $productUrl = !empty($commerce['seo']['url'])
                ? $commerce['seo']['url']
                : storeBaseUrl() . '/index.php?route=product/product&product_id=' . $id;
            bridgeJson([
                'ok' => true,
                'product_id' => $id,
                'id' => $id,
                'model' => $model,
                'sku' => $model,
                'price' => $commerce['price'] !== null ? $commerce['price'] : 0,
                'url' => $productUrl,
                'attributes' => $writtenAttrs,
                'commerce' => $commerce,
                'languageRows' => $descriptionWrite['languageRows'] ?? productDescriptionLanguageRows($db, $id),
                'descriptionWrite' => $descriptionWrite,
                'readback' => $readback,
                'reusedDraft' => $reusedDraft,
                'message' => $reusedDraft ? 'Чернетку товару знайдено і оновлено' : 'Новий товар створено як чернетку'
            ]);
        }

        $id = productIdByUrlOrSlug($db, $url, $slug, $directProductId);
        if (!$id) { echo json_encode(['error' => 'Product not found by URL/slug']); exit; }
        $descriptionRowRepair = ensureProductDescriptionRow($db, $id, $productName ?: $h1 ?: $title);
        $sets = [
            "description='" . $db->real_escape_string($content) . "'",
            "meta_title='" . $db->real_escape_string($title) . "'",
            "meta_description='" . $db->real_escape_string($meta) . "'"
        ];
        if ($h1 && tableHasColumn($db, PREFIX . "product_description", "meta_h1")) {
            $sets[] = "meta_h1='" . $db->real_escape_string($h1) . "'";
        }
        $db->query("UPDATE " . PREFIX . "product_description SET " . implode(',', $sets) . " WHERE product_id=$id AND language_id=" . LANG_ID);
        $descriptionUpdateError = $db->error;
        $descriptionAffectedRows = $db->affected_rows;
        $updateProductSets = ["date_modified=NOW()"];
        if (!empty($body['updatePrice']) || !empty($body['update_price'])) {
            if ($payloadPrice !== null) $updateProductSets[] = "price=" . (float)$payloadPrice;
        }
        $db->query("UPDATE " . PREFIX . "product SET " . implode(',', $updateProductSets) . " WHERE product_id=$id");
        $writtenAttrs = updateProductAttributes($db, $id, $attributes);
        $shouldApplyCommerce = !empty($body['updateCommerce']) || !empty($body['update_commerce']) || $payloadPrice !== null || !empty(optionPriceMapFromPayload($body));
        $commerce = $shouldApplyCommerce
            ? applyProductCommerce($db, $id, $body, $attributes, $productName ?: $h1 ?: $title, (string)($body['model'] ?? ($body['sku'] ?? '')), $payloadPrice)
            : null;
        $readback = publishReadback($db, $id, $title, $content, $writtenAttrs);
        bridgeJson([
            'product_id' => $id,
            'id' => $id,
            'url' => $commerce && !empty($commerce['seo']['url']) ? $commerce['seo']['url'] : ($url ?: routeUrl($db, 'product_id=' . $id)),
            'attributes' => $writtenAttrs,
            'language_id' => LANG_ID,
            'descriptionAffectedRows' => $descriptionAffectedRows,
            'descriptionUpdateError' => $descriptionUpdateError,
            'descriptionRowRepair' => $descriptionRowRepair,
            'price' => $commerce && $commerce['price'] !== null ? $commerce['price'] : ($payloadPrice !== null ? $payloadPrice : null),
            'priceUpdated' => (count($updateProductSets) > 1),
            'commerce' => $commerce,
            'contentLength' => strlen($content),
            'contentSha1' => sha1($content),
            'readback' => $readback,
            'message' => 'Товар OpenCart оновлено'
        ]);
    }

    if ($type === 'category') {
        $id = categoryIdByUrlOrSlug($db, $url, $slug);
        if (!$id) { echo json_encode(['error' => 'Category not found by URL/slug']); exit; }
        $sets = [
            "description='" . $db->real_escape_string($content) . "'",
            "meta_title='" . $db->real_escape_string($title) . "'",
            "meta_description='" . $db->real_escape_string($meta) . "'"
        ];
        if ($h1 && tableHasColumn($db, PREFIX . "category_description", "meta_h1")) {
            $sets[] = "meta_h1='" . $db->real_escape_string($h1) . "'";
        }
        $db->query("UPDATE " . PREFIX . "category_description SET " . implode(',', $sets) . " WHERE category_id=$id AND language_id=" . LANG_ID);
        echo json_encode(['category_id' => $id, 'id' => $id, 'url' => $url, 'message' => 'Категорію OpenCart оновлено']);
        exit;
    }

    if ($type === 'information') {
        $id = informationIdByUrlOrSlug($db, $url, $slug);
        if (!$id) { echo json_encode(['error' => 'Information page not found by URL/slug']); exit; }
        $sets = [
            "description='" . $db->real_escape_string($content) . "'",
            "meta_title='" . $db->real_escape_string($title) . "'",
            "meta_description='" . $db->real_escape_string($meta) . "'"
        ];
        if ($h1 && tableHasColumn($db, PREFIX . "information_description", "meta_h1")) {
            $sets[] = "meta_h1='" . $db->real_escape_string($h1) . "'";
        }
        $db->query("UPDATE " . PREFIX . "information_description SET " . implode(',', $sets) . " WHERE information_id=$id AND language_id=" . LANG_ID);
        echo json_encode(['information_id' => $id, 'id' => $id, 'url' => $url, 'message' => 'Сторінку OpenCart оновлено']);
        exit;
    }

    echo json_encode(['error' => 'Unsupported type']);
    exit;
}

function growthLeadTable(): string {
    return PREFIX . 'mercato_growth_lead';
}

function ensureGrowthLeadTable(mysqli $db): void {
    $table = growthLeadTable();
    $db->query(
        "CREATE TABLE IF NOT EXISTS `$table` (
            lead_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            contact_key VARCHAR(191) NOT NULL,
            email VARCHAR(255) NOT NULL DEFAULT '',
            phone VARCHAR(64) NOT NULL DEFAULT '',
            status VARCHAR(32) NOT NULL DEFAULT 'lead',
            first_coupon VARCHAR(32) NOT NULL DEFAULT '',
            second_coupon VARCHAR(32) NOT NULL DEFAULT '',
            used_promocode VARCHAR(32) NOT NULL DEFAULT '',
            first_order_id INT UNSIGNED NULL DEFAULT NULL,
            second_order_id INT UNSIGNED NULL DEFAULT NULL,
            landing_page TEXT NULL,
            utms_json LONGTEXT NULL,
            payload_json LONGTEXT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (lead_id),
            UNIQUE KEY uniq_contact_key (contact_key),
            KEY idx_status (status),
            KEY idx_first_coupon (first_coupon),
            KEY idx_second_coupon (second_coupon)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );
    if ($db->error) throw new Exception('Growth lead table failed: ' . $db->error);
}

function growthNormalizeEmail(string $value): string {
    $email = trim(strtolower($value));
    return filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : '';
}

function growthNormalizePhone(string $value): string {
    $digits = preg_replace('/\D+/', '', $value);
    if (!$digits) return '';
    $local = '';
    if (strlen($digits) === 10 && substr($digits, 0, 1) === '0') {
        $local = $digits;
    } elseif (strlen($digits) === 12 && substr($digits, 0, 3) === '380') {
        $local = substr($digits, 2);
    } else {
        return '';
    }
    if (!preg_match('/^0\d{9}$/', $local)) return '';
    $allowed = ['39' => true, '50' => true, '63' => true, '66' => true, '67' => true, '68' => true, '73' => true, '89' => true, '91' => true, '92' => true, '93' => true, '94' => true, '95' => true, '96' => true, '97' => true, '98' => true, '99' => true];
    if (empty($allowed[substr($local, 1, 2)])) return '';
    return '38' . $local;
}

function growthContactKey(string $email, string $phone): string {
    $phone = growthNormalizePhone($phone);
    if ($phone) return 'phone:' . $phone;
    $email = growthNormalizeEmail($email);
    if ($email) return 'email:' . $email;
    return '';
}

function growthPhoneSql(string $column): string {
    return "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE($column, '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), '.', '')";
}

function growthPhoneCandidates(string $phone): array {
    $normalized = growthNormalizePhone($phone);
    if (!$normalized) return [];
    $local = substr($normalized, 2);
    return array_values(array_unique([$normalized, $local]));
}

function growthLeadRow(mysqli $db, string $contactKey): ?array {
    ensureGrowthLeadTable($db);
    $keyEsc = $db->real_escape_string($contactKey);
    $res = $db->query("SELECT * FROM `" . growthLeadTable() . "` WHERE contact_key='$keyEsc' LIMIT 1");
    $row = $res ? $res->fetch_assoc() : null;
    return $row ?: null;
}

function growthFindLead(mysqli $db, string $email, string $phone): ?array {
    $keys = [];
    $phone = growthNormalizePhone($phone);
    if ($phone) $keys[] = 'phone:' . $phone;
    $email = growthNormalizeEmail($email);
    if ($email) $keys[] = 'email:' . $email;
    foreach (array_unique($keys) as $contactKey) {
        $lead = growthLeadRow($db, $contactKey);
        if ($lead) return $lead;
    }
    return null;
}

function growthFindLeadByCoupon(mysqli $db, string $couponCode): ?array {
    ensureGrowthLeadTable($db);
    $code = strtoupper(preg_replace('/[^A-Z0-9_-]/', '', $couponCode));
    if (!$code) return null;
    $codeEsc = $db->real_escape_string($code);
    $res = $db->query("SELECT * FROM `" . growthLeadTable() . "` WHERE first_coupon='$codeEsc' OR second_coupon='$codeEsc' LIMIT 1");
    $row = $res ? $res->fetch_assoc() : null;
    return $row ?: null;
}

function growthUpsertLead(mysqli $db, array $lead): array {
    ensureGrowthLeadTable($db);
    $email = growthNormalizeEmail((string)($lead['email'] ?? ''));
    $phone = growthNormalizePhone((string)($lead['phone'] ?? $lead['telephone'] ?? ''));
    $contactKey = growthContactKey($email, $phone);
    if (!$contactKey) $contactKey = (string)($lead['contact_key'] ?? '');
    if (!$contactKey) throw new Exception('Growth lead contact is empty');

    $existing = growthLeadRow($db, $contactKey) ?: [];
    $status = (string)($lead['status'] ?? ($existing['status'] ?? 'lead'));
    $firstCoupon = strtoupper(preg_replace('/[^A-Z0-9_-]/', '', (string)($lead['first_coupon'] ?? ($existing['first_coupon'] ?? ''))));
    $secondCoupon = strtoupper(preg_replace('/[^A-Z0-9_-]/', '', (string)($lead['second_coupon'] ?? ($existing['second_coupon'] ?? ''))));
    $usedPromocode = strtoupper(preg_replace('/[^A-Z0-9_-]/', '', (string)($lead['used_promocode'] ?? ($existing['used_promocode'] ?? ''))));
    $firstOrderId = isset($lead['first_order_id']) ? (int)$lead['first_order_id'] : (isset($existing['first_order_id']) ? (int)$existing['first_order_id'] : 0);
    $secondOrderId = isset($lead['second_order_id']) ? (int)$lead['second_order_id'] : (isset($existing['second_order_id']) ? (int)$existing['second_order_id'] : 0);
    $landingPage = (string)($lead['landing_page'] ?? ($existing['landing_page'] ?? ''));
    $utmsJson = (string)($lead['utms_json'] ?? ($existing['utms_json'] ?? ''));
    $payloadJson = json_encode($lead, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR);

    $db->query(
        "INSERT INTO `" . growthLeadTable() . "`
         SET contact_key='" . $db->real_escape_string($contactKey) . "',
             email='" . $db->real_escape_string($email) . "',
             phone='" . $db->real_escape_string($phone) . "',
             status='" . $db->real_escape_string($status) . "',
             first_coupon='" . $db->real_escape_string($firstCoupon) . "',
             second_coupon='" . $db->real_escape_string($secondCoupon) . "',
             used_promocode='" . $db->real_escape_string($usedPromocode) . "',
             first_order_id=" . ($firstOrderId > 0 ? $firstOrderId : "NULL") . ",
             second_order_id=" . ($secondOrderId > 0 ? $secondOrderId : "NULL") . ",
             landing_page='" . $db->real_escape_string($landingPage) . "',
             utms_json='" . $db->real_escape_string($utmsJson) . "',
             payload_json='" . $db->real_escape_string($payloadJson ?: '{}') . "',
             created_at=NOW(),
             updated_at=NOW()
         ON DUPLICATE KEY UPDATE
             email=VALUES(email),
             phone=VALUES(phone),
             status=VALUES(status),
             first_coupon=VALUES(first_coupon),
             second_coupon=VALUES(second_coupon),
             used_promocode=VALUES(used_promocode),
             first_order_id=VALUES(first_order_id),
             second_order_id=VALUES(second_order_id),
             landing_page=VALUES(landing_page),
             utms_json=VALUES(utms_json),
             payload_json=VALUES(payload_json),
             updated_at=NOW()"
    );
    if ($db->error) throw new Exception('Growth lead upsert failed: ' . $db->error);
    return growthLeadRow($db, $contactKey) ?: ['contact_key' => $contactKey, 'email' => $email, 'phone' => $phone, 'status' => $status];
}

function growthRandomCouponCode(mysqli $db, string $prefix): string {
    $cleanPrefix = strtoupper(preg_replace('/[^A-Z0-9]/', '', $prefix));
    if (!$cleanPrefix) $cleanPrefix = 'MRC';
    $cleanPrefix = substr($cleanPrefix, 0, 4);
    for ($i = 0; $i < 12; $i++) {
        $suffix = strtoupper(substr(base_convert((string)mt_rand(100000, 2147483647), 10, 36), 0, max(3, 10 - strlen($cleanPrefix))));
        $code = substr($cleanPrefix . str_pad($suffix, max(3, 10 - strlen($cleanPrefix)), '0'), 0, 10);
        $codeEsc = $db->real_escape_string($code);
        $existing = $db->query("SELECT coupon_id FROM " . PREFIX . "coupon WHERE code='$codeEsc' LIMIT 1");
        if (!$existing || $existing->num_rows < 1) return $code;
    }
    return substr($cleanPrefix . strtoupper(substr(md5((string)microtime(true)), 0, max(3, 10 - strlen($cleanPrefix)))), 0, 10);
}

function createOpenCartCoupon(mysqli $db, array $args): array {
    $code = strtoupper(preg_replace('/[^A-Z0-9_-]/', '', trim((string)($args['code'] ?? ''))));
    if (!$code) $code = growthRandomCouponCode($db, (string)($args['prefix'] ?? 'MRC'));
    if (strlen($code) < 3 || strlen($code) > 12) {
        return ['error' => 'Coupon code must be 3-12 characters for OpenCart admin compatibility', 'code' => $code];
    }
    $name = trim((string)($args['name'] ?? ('Mercato AI coupon ' . $code)));
    $discount = (float)($args['discount'] ?? 10);
    $type = strtoupper(trim((string)($args['type'] ?? 'P'))) === 'F' ? 'F' : 'P';
    $days = max(1, min(365, (int)($args['days'] ?? 14)));
    $usesTotal = max(1, (int)($args['uses_total'] ?? 1000));
    $usesCustomer = max(1, (int)($args['uses_customer'] ?? 1));
    $logged = !empty($args['logged']) ? 1 : 0;
    $shipping = !empty($args['shipping']) ? 1 : 0;
    $minimumTotal = max(0, (float)($args['total'] ?? $args['minimum_total'] ?? 0));
    $dateStart = date('Y-m-d');
    $dateEnd = date('Y-m-d', strtotime('+' . $days . ' days'));

    $codeEsc = $db->real_escape_string($code);
    $existing = $db->query("SELECT coupon_id FROM " . PREFIX . "coupon WHERE code='$codeEsc' LIMIT 1");
    if ($existing && $existing->num_rows > 0) {
        return ['error' => 'Coupon code already exists', 'code' => $code];
    }

    $db->query(
        "INSERT INTO " . PREFIX . "coupon
         SET name='" . $db->real_escape_string($name) . "',
             code='$codeEsc',
             type='" . $db->real_escape_string($type) . "',
             discount=" . (float)$discount . ",
             logged=$logged,
             shipping=$shipping,
             total=" . (float)$minimumTotal . ",
             date_start='" . $db->real_escape_string($dateStart) . "',
             date_end='" . $db->real_escape_string($dateEnd) . "',
             uses_total=$usesTotal,
             uses_customer=$usesCustomer,
             status=1,
             date_added=NOW()"
    );
    if ($db->error) return ['error' => $db->error, 'code' => $code];
    $id = (int)$db->insert_id;
    return [
        'ok' => true,
        'coupon_id' => $id,
        'id' => $id,
        'code' => $code,
        'discount' => $discount,
        'type' => $type,
        'total' => $minimumTotal,
        'date_start' => $dateStart,
        'date_end' => $dateEnd,
        'message' => 'Купон OpenCart створено'
    ];
}

function growthOrderCoupons(mysqli $db, int $orderId): array {
    if ($orderId <= 0 || !tableExists($db, PREFIX . "coupon_history")) return [];
    $rows = [];
    $res = $db->query(
        "SELECT c.coupon_id, c.code, c.name, c.discount, c.type, ch.amount, ch.date_added
         FROM " . PREFIX . "coupon_history ch
         JOIN " . PREFIX . "coupon c ON c.coupon_id=ch.coupon_id
         WHERE ch.order_id=$orderId
         ORDER BY ch.date_added ASC, ch.coupon_history_id ASC"
    );
    if ($res) {
        while ($row = $res->fetch_assoc()) $rows[] = $row;
    }
    return $rows;
}

function growthHandleOrderComplete(mysqli $db, int $orderId, array $options = []): array {
    $orderRes = $db->query(
        "SELECT order_id, customer_id, firstname, lastname, email, telephone, total, date_added, order_status_id
         FROM " . PREFIX . "order
         WHERE order_id=$orderId AND order_status_id > 0
         LIMIT 1"
    );
    $order = $orderRes ? $orderRes->fetch_assoc() : null;
    if (!$order) return ['ok' => false, 'order_id' => $orderId, 'reason' => 'order_not_found_or_not_completed'];

    $firstPrefix = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)($options['first_prefix'] ?? 'F10')));
    $secondPrefix = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)($options['second_prefix'] ?? 'F15')));
    $coupons = growthOrderCoupons($db, $orderId);
    $firstCoupon = null;
    $secondUsed = null;
    foreach ($coupons as $coupon) {
        $code = strtoupper((string)($coupon['code'] ?? ''));
        if (!$firstCoupon && $firstPrefix && strpos($code, $firstPrefix) === 0) $firstCoupon = $coupon;
        if (!$secondUsed && $secondPrefix && strpos($code, $secondPrefix) === 0) $secondUsed = $coupon;
    }

    $email = growthNormalizeEmail((string)($order['email'] ?? ''));
    $phone = growthNormalizePhone((string)($order['telephone'] ?? ''));
    $contactKey = growthContactKey($email, $phone);
    $lead = $contactKey ? (growthFindLead($db, $email, $phone) ?: []) : [];
    $events = [];

    if ($secondUsed) {
        $events[] = ['name' => 'second_discount_used', 'at' => date('c'), 'code' => $secondUsed['code'], 'order_id' => $orderId];
        if ($contactKey) {
            $lead = growthUpsertLead($db, [
                'contact_key' => $contactKey,
                'email' => $email,
                'phone' => $phone,
                'status' => 'second_order',
                'second_coupon' => (string)$secondUsed['code'],
                'second_order_id' => $orderId,
                'used_promocode' => (string)$secondUsed['code']
            ]);
        }
        return [
            'ok' => true,
            'order' => $order,
            'lead' => $lead,
            'second_coupon_used' => true,
            'second_coupon' => $secondUsed,
            'events' => $events
        ];
    }

    if (!$firstCoupon) {
        return ['ok' => true, 'order' => $order, 'lead' => $lead, 'reason' => 'no_first_popup_coupon', 'events' => []];
    }

    $leadByCoupon = growthFindLeadByCoupon($db, (string)($firstCoupon['code'] ?? ''));
    if ($leadByCoupon) {
        if (empty($lead)) $lead = $leadByCoupon;
        $leadPhone = growthNormalizePhone((string)($leadByCoupon['phone'] ?? ''));
        if ($leadPhone && $leadPhone !== $phone) {
            $events[] = ['name' => 'first_discount_contact_mismatch', 'at' => date('c'), 'code' => $firstCoupon['code'], 'order_id' => $orderId];
            return [
                'ok' => false,
                'order' => $order,
                'lead' => $leadByCoupon,
                'first_coupon' => $firstCoupon,
                'reason' => 'coupon_contact_mismatch',
                'error' => 'Телефон у замовленні не збігається з телефоном, для якого створено промокод.',
                'events' => $events
            ];
        }
    }

    $events[] = ['name' => 'first_discount_used', 'at' => date('c'), 'code' => $firstCoupon['code'], 'order_id' => $orderId];
    if (!empty($lead['second_coupon'])) {
        return [
            'ok' => true,
            'order' => $order,
            'lead' => $lead,
            'first_coupon' => $firstCoupon,
            'second_coupon_created' => false,
            'reason' => 'second_coupon_already_exists',
            'second_coupon' => ['code' => $lead['second_coupon']],
            'events' => $events
        ];
    }

    $secondDays = max(21, min(25, (int)($options['second_days'] ?? 23)));
    $secondTotal = max(0, (float)($options['second_total'] ?? 800));
    $secondDiscount = max(1, min(99, (float)($options['second_discount'] ?? 15)));
    $second = createOpenCartCoupon($db, [
        'prefix' => $secondPrefix,
        'name' => 'Mercato second order popup order #' . $orderId,
        'discount' => $secondDiscount,
        'type' => 'P',
        'days' => $secondDays,
        'total' => $secondTotal,
        'uses_total' => 1,
        'uses_customer' => 1,
        'logged' => 0
    ]);
    if (!empty($second['error'])) return ['ok' => false, 'order' => $order, 'first_coupon' => $firstCoupon, 'error' => $second['error'], 'events' => $events];

    $events[] = ['name' => 'second_discount_code_created', 'at' => date('c'), 'code' => $second['code'], 'order_id' => $orderId];
    if ($contactKey) {
        $lead = growthUpsertLead($db, [
            'contact_key' => $contactKey,
            'email' => $email,
            'phone' => $phone,
            'status' => 'first_order',
            'first_coupon' => (string)$firstCoupon['code'],
            'second_coupon' => (string)$second['code'],
            'used_promocode' => (string)$firstCoupon['code'],
            'first_order_id' => $orderId
        ]);
    }

    return [
        'ok' => true,
        'order' => $order,
        'lead' => $lead,
        'first_coupon' => $firstCoupon,
        'second_coupon' => $second,
        'second_coupon_created' => true,
        'events' => $events
    ];
}

if ($action === 'growth_contact_status') {
    $email = growthNormalizeEmail((string)($_GET['email'] ?? ''));
    $phone = growthNormalizePhone((string)($_GET['phone'] ?? ''));
    $contactKey = growthContactKey($email, $phone);
    if (!$contactKey) bridgeJson(['ok' => false, 'error' => 'Contact required']);
    $lead = growthFindLead($db, $email, $phone);

    $where = [];
    if ($email) $where[] = "LOWER(c.email)='" . $db->real_escape_string($email) . "'";
    if ($phone) {
        $phoneSql = growthPhoneSql('c.telephone');
        $phoneWhere = [];
        foreach (growthPhoneCandidates($phone) as $candidate) {
            $phoneWhere[] = $phoneSql . "='" . $db->real_escape_string($candidate) . "'";
        }
        if ($phoneWhere) $where[] = '(' . implode(' OR ', $phoneWhere) . ')';
    }
    $customer = null;
    if ($where) {
        $res = $db->query(
            "SELECT c.customer_id, c.email, c.telephone,
                    COUNT(o.order_id) AS order_count,
                    COALESCE(SUM(o.total),0) AS total_spent
             FROM " . PREFIX . "customer c
             LEFT JOIN " . PREFIX . "order o ON o.customer_id=c.customer_id AND o.order_status_id > 0
             WHERE " . implode(' OR ', $where) . "
             GROUP BY c.customer_id
             ORDER BY order_count DESC, c.customer_id DESC
             LIMIT 1"
        );
        $customer = $res ? $res->fetch_assoc() : null;
    }
    $orderCount = $customer ? (int)($customer['order_count'] ?? 0) : 0;
    bridgeJson([
        'ok' => true,
        'contact_key' => $contactKey,
        'existing_lead' => !empty($lead) && (!empty($lead['first_coupon']) || !empty($lead['status'])),
        'existing_customer' => !empty($customer),
        'existing_buyer' => $orderCount > 0,
        'blocked' => (!empty($lead) && (!empty($lead['first_coupon']) || !empty($lead['status']))) || !empty($customer),
        'lead' => $lead,
        'customer' => $customer
    ]);
}

if ($action === 'growth_lead_upsert') {
    $lead = [
        'email' => (string)($_GET['email'] ?? ''),
        'phone' => (string)($_GET['phone'] ?? ''),
        'contact_key' => (string)($_GET['contact_key'] ?? ''),
        'status' => (string)($_GET['status'] ?? 'lead'),
        'first_coupon' => (string)($_GET['first_coupon'] ?? ''),
        'second_coupon' => (string)($_GET['second_coupon'] ?? ''),
        'used_promocode' => (string)($_GET['used_promocode'] ?? ''),
        'first_order_id' => isset($_GET['first_order_id']) ? (int)$_GET['first_order_id'] : 0,
        'second_order_id' => isset($_GET['second_order_id']) ? (int)$_GET['second_order_id'] : 0,
        'landing_page' => (string)($_GET['landing_page'] ?? ''),
        'utms_json' => (string)($_GET['utms_json'] ?? ''),
        'source' => (string)($_GET['source'] ?? 'first_order_popup'),
        'device' => (string)($_GET['device'] ?? ''),
        'gclid' => (string)($_GET['gclid'] ?? '')
    ];
    bridgeJson(['ok' => true, 'lead' => growthUpsertLead($db, $lead)]);
}

if ($action === 'growth_order_complete') {
    $orderId = max(0, (int)($_GET['order_id'] ?? 0));
    if ($orderId <= 0) bridgeJson(['ok' => false, 'error' => 'order_id required']);
    bridgeJson(growthHandleOrderComplete($db, $orderId, $_GET));
}

if ($action === 'growth_second_coupon_sync') {
    $firstPrefix = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)($_GET['first_prefix'] ?? 'F10')));
    $days = max(1, min(90, (int)($_GET['days'] ?? 14)));
    $limit = max(1, min(100, (int)($_GET['limit'] ?? 25)));
    $orderIds = [];
    if (tableExists($db, PREFIX . "coupon_history")) {
        $prefixEsc = $db->real_escape_string($firstPrefix . '%');
        $res = $db->query(
            "SELECT DISTINCT ch.order_id
             FROM " . PREFIX . "coupon_history ch
             JOIN " . PREFIX . "coupon c ON c.coupon_id=ch.coupon_id
             JOIN " . PREFIX . "order o ON o.order_id=ch.order_id AND o.order_status_id > 0
             WHERE c.code LIKE '$prefixEsc'
               AND ch.date_added >= DATE_SUB(NOW(), INTERVAL $days DAY)
             ORDER BY ch.order_id DESC
             LIMIT $limit"
        );
        if ($res) {
            while ($row = $res->fetch_assoc()) $orderIds[] = (int)$row['order_id'];
        }
    }
    $results = [];
    foreach ($orderIds as $orderId) {
        $results[] = growthHandleOrderComplete($db, $orderId, $_GET);
    }
    bridgeJson(['ok' => true, 'count' => count($results), 'results' => $results]);
}

if ($action === 'create_coupon') {
    bridgeJson(createOpenCartCoupon($db, $_GET));
}

if ($action === 'repair_coupon') {
    $code = strtoupper(preg_replace('/[^A-Z0-9_-]/', '', trim($_GET['code'] ?? '')));
    if (!$code) {
        echo json_encode(['error' => 'Coupon code required']);
        exit;
    }

    $usesTotal = max(1, min(100000, (int)($_GET['uses_total'] ?? 999)));
    $usesCustomer = max(1, min(100000, (int)($_GET['uses_customer'] ?? 1)));
    $days = isset($_GET['days']) ? max(1, min(365, (int)$_GET['days'])) : 0;
    $dateEnd = trim($_GET['date_end'] ?? '');
    if ($days > 0) {
        $dateEnd = date('Y-m-d', strtotime('+' . $days . ' days'));
    }
    if ($dateEnd && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateEnd)) {
        echo json_encode(['error' => 'Invalid date_end format, expected YYYY-MM-DD']);
        exit;
    }

    $codeEsc = $db->real_escape_string($code);
    $beforeRes = $db->query("SELECT coupon_id, code, name, date_end, uses_total, uses_customer, status FROM " . PREFIX . "coupon WHERE code='$codeEsc' LIMIT 1");
    if (!$beforeRes || $beforeRes->num_rows < 1) {
        echo json_encode(['error' => 'Coupon not found', 'code' => $code]);
        exit;
    }
    $before = $beforeRes->fetch_assoc();

    $sets = [
        "uses_total=$usesTotal",
        "uses_customer=$usesCustomer",
        "status=1"
    ];
    if ($dateEnd) {
        $sets[] = "date_end='" . $db->real_escape_string($dateEnd) . "'";
    }

    $db->query("UPDATE " . PREFIX . "coupon SET " . implode(',', $sets) . " WHERE coupon_id=" . (int)$before['coupon_id']);

    $afterRes = $db->query("SELECT coupon_id, code, name, date_end, uses_total, uses_customer, status FROM " . PREFIX . "coupon WHERE coupon_id=" . (int)$before['coupon_id'] . " LIMIT 1");
    $after = $afterRes ? $afterRes->fetch_assoc() : null;

    echo json_encode([
        'ok' => true,
        'code' => $code,
        'before' => $before,
        'after' => $after,
        'message' => 'Купон оновлено'
    ]);
    exit;
}

if ($action === 'cleanup_coupons') {
    $prefix = strtoupper(preg_replace('/[^A-Z0-9_-]/', '', trim($_GET['prefix'] ?? 'MRC')));
    if (!$prefix) $prefix = 'MRC';
    $mode = strtolower(trim($_GET['mode'] ?? 'delete'));
    $deleteMode = $mode !== 'disable';
    $prefixEsc = $db->real_escape_string($prefix . '%');
    $res = $db->query(
        "SELECT coupon_id, code, date_end, status
         FROM " . PREFIX . "coupon
         WHERE code LIKE '$prefixEsc'
           AND date_end IS NOT NULL
           AND date_end <> '0000-00-00'
           AND date_end < CURDATE()
         ORDER BY coupon_id ASC
         LIMIT 500"
    );
    $expired = [];
    if ($res) {
        while ($row = $res->fetch_assoc()) $expired[] = $row;
    }
    $deleted = 0;
    $disabled = 0;
    $relatedDeleted = [];
    if ($expired) {
        $idsArr = [];
        foreach ($expired as $row) {
            $idsArr[] = (int)$row['coupon_id'];
        }
        $ids = implode(',', $idsArr);
        if ($ids !== '') {
            if ($deleteMode) {
                foreach (['coupon_product', 'coupon_category', 'coupon_history'] as $suffix) {
                    $table = PREFIX . $suffix;
                    if (tableExists($db, $table)) {
                        $db->query("DELETE FROM " . $table . " WHERE coupon_id IN ($ids)");
                        $relatedDeleted[$suffix] = max(0, (int)$db->affected_rows);
                    }
                }
                $db->query("DELETE FROM " . PREFIX . "coupon WHERE coupon_id IN ($ids)");
                $deleted = max(0, (int)$db->affected_rows);
            } else {
                $db->query("UPDATE " . PREFIX . "coupon SET status=0 WHERE coupon_id IN ($ids)");
                $disabled = max(0, (int)$db->affected_rows);
            }
        }
    }
    echo json_encode([
        'ok' => true,
        'mode' => $deleteMode ? 'delete' : 'disable',
        'deleted' => $deleted,
        'disabled' => $disabled,
        'related_deleted' => $relatedDeleted,
        'coupons' => $expired,
        'message' => $deleteMode ? 'Прострочені AI-купони видалено' : 'Прострочені AI-купони вимкнено'
    ]);
    exit;
}

if ($action === 'coupon_usage') {
    $days = max(1, min(365, (int)($_GET['days'] ?? 30)));
    $prefix = strtoupper(preg_replace('/[^A-Z0-9_-]/', '', trim($_GET['prefix'] ?? 'MRC')));
    $prefixEsc = $db->real_escape_string($prefix . '%');
    $rows = [];
    $historyTable = PREFIX . "coupon_history";
    $sql = "SELECT c.coupon_id, c.code, c.name, c.discount, c.type, c.date_start, c.date_end, c.uses_total, c.uses_customer, c.status,
                   COUNT(ch.coupon_history_id) uses_count,
                   COALESCE(SUM(ch.amount),0) amount_total
            FROM " . PREFIX . "coupon c
            LEFT JOIN $historyTable ch ON ch.coupon_id = c.coupon_id AND ch.date_added >= DATE_SUB(NOW(), INTERVAL $days DAY)
            WHERE c.code LIKE '$prefixEsc'
            GROUP BY c.coupon_id
            ORDER BY c.coupon_id DESC
            LIMIT 100";
    $res = $db->query($sql);
    if ($res) {
        while ($row = $res->fetch_assoc()) $rows[] = $row;
    }
    echo json_encode(['ok' => true, 'days' => $days, 'coupons' => $rows]);
    exit;
}

echo json_encode(['error' => 'Unknown action', 'available' => ['stats','customers','orders','customer','product_search','product_read','product_audit_list','merchant_feed_audit_list','merchant_apply_product_patch','seo_inventory','seo_file_read','seo_apply_entity_patch','seo_apply_file_patch','seo_rollback_change','attribute_catalog','supplier_match_products','supplier_apply_lots','publish_diagnostics','publish_content','create_coupon','repair_coupon','cleanup_coupons','coupon_usage','growth_contact_status','growth_lead_upsert','growth_order_complete','growth_second_coupon_sync']]);
$db->close();
