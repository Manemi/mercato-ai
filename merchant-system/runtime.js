const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cheerio = require('cheerio');

const GOOGLE_RULES_VERSION = '2026-06-19';
const GOOGLE_MERCHANT_AGENTIC_VERSION = '2026-06-16';
const SUPPORTED_AVAILABILITY = new Set(['in_stock', 'out_of_stock', 'preorder', 'backorder']);
const MIN_FREE_SPACE_BYTES = 100 * 1024 * 1024;
const DEFAULT_CATALOG_POLICY = {
  version: 1,
  confirmedBrand: 'Mercato',
  brandScope: 'all_products',
  brandConfirmedByOwner: true,
  brandConfirmedAt: '2026-06-20',
  firstBatchProductIds: ['107', '112', '249', '105', '176'],
  firstBatchLimit: 5,
  variantExportMode: 'canonical_product',
  publishAllowed: false
};

const MERCHANT_AGENTS = [
  {
    id: 'catalog-scanner',
    name: 'Catalog Scanner',
    purpose: 'Читає повний каталог OpenCart і формує стабільний Merchant snapshot без запису.',
    evidenceRequired: ['bridgeVersion', 'productsRead', 'coverage.full', 'sourceFingerprint'],
    canChange: [],
    cannotChange: ['OpenCart дані', 'Merchant Center', 'ціни/залишки/опції'],
    specialistOutput: 'snapshot: id/title/description/link/image/price/availability/brand/options/schema signals'
  },
  {
    id: 'feed-compliance',
    name: 'Feed Compliance',
    purpose: 'Перевіряє обовʼязкові атрибути Google та відділяє помилки від невідомих даних.',
    evidenceRequired: ['Google core fields', 'identifier policy', 'landing-page facts'],
    canChange: ['feed-only title/description override після approval', 'очищення явно невалідного GTIN після approval'],
    cannotChange: ['вигадати GTIN/MPN/SKU', 'вигадати brand', 'підмінити price/availability'],
    specialistOutput: 'status: ready / critical / needs_review / manual_only with issue codes'
  },
  {
    id: 'landing-page',
    name: 'Landing Page',
    purpose: 'Зіставляє товар, URL, ціну, наявність, фото і можливість покупки.',
    evidenceRequired: ['HTTP 200 landing URL', 'visible product data', 'buyability', 'OpenCart price/stock'],
    canChange: [],
    cannotChange: ['публікувати feed item, якщо landing page не підтверджує товар'],
    specialistOutput: 'landing match verdict: title/price/availability/image/buy button'
  },
  {
    id: 'schema',
    name: 'Product Schema',
    purpose: 'Контролює Product/Offer/Review та збіг schema з OpenCart і фідом.',
    evidenceRequired: ['Product JSON-LD', 'Offer price/availability', 'brand', 'real review evidence'],
    canChange: ['Product/Offer schema patch після approval і readback'],
    cannotChange: ['вигадати Review', 'вигадати AggregateRating', 'поставити ціну не з OpenCart'],
    specialistOutput: 'schema match score and safe patch scope'
  },
  {
    id: 'images',
    name: 'Image Quality',
    purpose: 'Перевіряє головне фото, формат, розміри та доступність для Googlebot.',
    evidenceRequired: ['image URL', 'HTTP status', 'dimensions', 'format', 'placeholder/watermark check'],
    canChange: ['тільки manual asset task або approved image replacement'],
    cannotChange: ['вигадати фото', 'позначити невідомі dimensions як помилку'],
    specialistOutput: 'image readiness and manual asset list'
  },
  {
    id: 'variant-policy',
    name: 'Variant Policy',
    purpose: 'Читає фасування та інші опції, але за політикою Mercato не плодить окремі Merchant-товари без підтвердженого UX-рішення.',
    evidenceRequired: ['catalogPolicy.variantExportMode', 'option values', 'price deltas', 'landing-page UX'],
    canChange: ['тільки policy preview після рішення власника'],
    cannotChange: ['створити десятки товарів через грамовку', 'змінити item_group_id без policy'],
    specialistOutput: 'canonical_product by default; split_by_package only after owner decision'
  },
  {
    id: 'merchant-api-diagnostics',
    name: 'Merchant API Diagnostics',
    purpose: 'Читає Google Merchant Center issues, product statuses, data sources і performance diagnostics через офіційний API/MCP у read-only режимі.',
    evidenceRequired: ['account issues', 'product statuses', 'data sources', 'diagnostic issue ids'],
    canChange: [],
    cannotChange: ['Merchant Center publish', 'data source write', 'automatic improvements without review'],
    specialistOutput: 'real Google blockers, not theoretical local warnings'
  },
  {
    id: 'fix-planner',
    name: 'Fix Planner',
    purpose: 'Готує dry-run зміни та відправляє неоднозначні поля на ручне рішення.',
    evidenceRequired: ['sourceFingerprint', 'before/after', 'issue code', 'risk', 'rollback'],
    canChange: ['approved OpenCart brand patch', 'approved feed override patch'],
    cannotChange: ['масовий publish', 'ручні факти без доказів', 'більше 5 товарів у першому live batch'],
    specialistOutput: 'approval-ready diff, manual decision list, batch boundary'
  },
  {
    id: 'verifier',
    name: 'Verifier',
    purpose: 'Після погодженого publish виконує readback і повторний Merchant scan.',
    evidenceRequired: ['writeRun', 'OpenCart readback', 'new Merchant scan', 'Google diagnostics refresh'],
    canChange: ['запропонувати rollback/repair preview'],
    cannotChange: ['закрити задачу без readback', 'масштабувати патерн після failed scan'],
    specialistOutput: 'verified / stale / rollback_required'
  }
];

const MERCHANT_API_AGENTIC_TOOLS = [
  {
    id: 'merchant-api-mcp-access',
    name: 'Merchant API MCP Access Service',
    owner: 'Google',
    status: 'alpha',
    mode: 'read_only_first',
    url: 'https://developers.google.com/merchant/api/guides/agentic-tools/merchant-data-mcp',
    value: 'Дає агентам авторизований доступ до product status, account issues, performance reports, data sources, automatic improvements і aggregate product statuses.',
    guardrail: 'Не підключати write tools у live без allowlist; Google радить тестовий або non-live account і обмежені credentials.'
  },
  {
    id: 'mapi-developer-assistant',
    name: 'mapi-developer-assistant',
    owner: 'Google',
    status: 'official_skill',
    mode: 'developer_assist',
    url: 'https://developers.google.com/merchant/api/guides/agentic-tools/integration-and-code-assist',
    value: 'Офіційний Merchant API skill для документації, migration з Content API, code samples і troubleshooting.',
    guardrail: 'Код Merchant API писати тільки після звірки з офіційним devdocs MCP; не використовувати v1beta.'
  },
  {
    id: 'merchant-api-devdocs-mcp',
    name: 'Merchant API Developer Documentation MCP',
    owner: 'Google',
    status: 'official_docs_mcp',
    mode: 'documentation_rag',
    url: 'https://merchantapi.googleapis.com/devdocs/mcp/',
    value: 'Підтягує актуальні snippets з офіційних Merchant API docs і samples прямо в coding assistant.',
    guardrail: 'Не надсилати секрети, приватні ключі або proprietary payload у prompt до документаційного MCP.'
  }
];

const MERCHANT_FEED_RULE_ENGINE = [
  {
    id: 'required-core-fields',
    name: 'Core feed fields',
    priority: 'critical',
    agent: 'Feed Compliance',
    checks: ['id', 'title', 'description', 'link', 'image_link', 'availability', 'price', 'currency'],
    writeMode: 'after_approval',
    impact: 'Без цих полів товари можуть не пройти Google Shopping/free listings.'
  },
  {
    id: 'merchant-center-diagnostics',
    name: 'Google Merchant diagnostics',
    priority: 'critical',
    agent: 'Merchant API Diagnostics',
    checks: ['account issues', 'product statuses', 'aggregate disapproval reasons', 'data source status'],
    writeMode: 'read_only',
    impact: 'Показує не теоретичні помилки, а що саме Google реально блокує або обмежує.'
  },
  {
    id: 'identifier-policy',
    name: 'Identifier policy',
    priority: 'important',
    agent: 'Feed Compliance',
    checks: ['GTIN checksum', 'MPN/model', 'SKU', 'identifier_exists'],
    writeMode: 'after_approval',
    impact: 'Зменшує ризик відхилень через вигадані або службові ідентифікатори.'
  },
  {
    id: 'variant-policy',
    name: 'Variant policy',
    priority: 'important',
    agent: 'Variant Policy',
    checks: ['canonical product offer', 'storefront package option', 'price/landing agreement', 'no duplicate feed bloat'],
    writeMode: 'canonical_product_default',
    impact: 'Захищає покупця і власника від дублювання одного товару десятком feed items через грамовку.'
  },
  {
    id: 'landing-page-match',
    name: 'Landing-page match',
    priority: 'important',
    agent: 'Landing Page',
    checks: ['visible price', 'visible availability', 'buy button', 'same image', 'variant preselect'],
    writeMode: 'read_only',
    impact: 'Google очікує збіг feed, landing page, schema і checkout.'
  },
  {
    id: 'product-schema-match',
    name: 'Product / Offer schema match',
    priority: 'important',
    agent: 'Product Schema',
    checks: ['Product', 'Offer', 'price', 'availability', 'brand', 'image', 'seller', 'review evidence'],
    writeMode: 'after_approval',
    impact: 'Підсилює rich results і допомагає Google звіряти товарні факти.'
  },
  {
    id: 'image-quality',
    name: 'Image quality',
    priority: 'important',
    agent: 'Image Quality',
    checks: ['crawlable URL', 'real product image', 'dimensions', 'watermark/promo text', 'placeholder'],
    writeMode: 'manual_asset_review',
    impact: 'Фото напряму впливає на eligibility, CTR і довіру покупця.'
  },
  {
    id: 'merchant-overrides',
    name: 'Merchant-only overrides',
    priority: 'important',
    agent: 'Fix Planner',
    checks: ['feed title', 'feed description', 'HTML cleanup', 'promo/nav block removal'],
    writeMode: 'after_approval',
    impact: 'Дозволяє чистити feed без псування людського опису на сторінці товару.'
  }
];

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, filePath);
}

function availableBytesForPath(targetPath) {
  if (typeof fs.statfsSync !== 'function') return Number.POSITIVE_INFINITY;
  const stats = fs.statfsSync(path.dirname(targetPath));
  const blockSize = Number(stats.bsize || stats.frsize || 0);
  const availableBlocks = Number(stats.bavail ?? stats.bfree ?? 0);
  return blockSize > 0 && availableBlocks >= 0
    ? blockSize * availableBlocks
    : Number.POSITIVE_INFINITY;
}

function compactText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanFeedDescription(value = '') {
  let html = String(value || '');
  if (/&lt;\/?[a-z!][\s\S]*&gt;/iu.test(html)) {
    html = html
      .replace(/&lt;/giu, '<')
      .replace(/&gt;/giu, '>')
      .replace(/&quot;/giu, '"')
      .replace(/&#0*39;|&apos;/giu, "'")
      .replace(/&nbsp;/giu, ' ')
      .replace(/&amp;/giu, '&');
  }
  if (!html.includes('<')) return compactText(html);
  try {
    const $ = cheerio.load(`<main id="merchant-root">${html}</main>`);
    $('[data-merchant-feed-exclude], script, style, noscript, nav').remove();
    $('a[href]').each((_, element) => {
      const anchor = $(element);
      if (/схожі|релевантні|розділи|інші товари|дивіться також/iu.test(anchor.closest('section,div,p').text())) {
        anchor.closest('section,div,p').remove();
      }
    });
    $('#merchant-root').find('br').replaceWith('\n');
    $('#merchant-root').find('p,li,h1,h2,h3,h4,section,article,div,table,tr').each((_, element) => {
      $(element).append('\n');
    });
    return String($('#merchant-root').text() || '')
      .split(/\n+/)
      .map(compactText)
      .filter(Boolean)
      .join('. ')
      .replace(/\.\s*([.!?])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return compactText(html.replace(/<[^>]+>/g, ' '));
  }
}

function cleanFeedTitle(value = '') {
  return compactText(value)
    .replace(/\s*(?:купити|ціна)\s*\|\s*Mercato\s*$/iu, '')
    .replace(/\s*\|\s*Mercato\s*$/iu, '')
    .trim();
}

function sanitizeMerchantPolicyClaims(value = '') {
  const healthClaimPattern = /здоров['ʼ]?я|оздоров|ліку|імуніт|детокс|схудн|антиоксидант|тонізуюч|підбадьор|концентрац|лікар|захвор|тиск|холестерин|цукор/iu;
  return compactText(value)
    .replace(/Чай\s+Матча\s+Органічна\s+Mercato:\s*Енергія\s+та\s+здоров['ʼ]?я\s+з\s+Японії\.?/giu, 'Чай Матча Органічна Mercato.')
    .replace(/баланс\s+між\s+тонізуючим\s+ефектом\s+чорного\s+чаю\s+і\s+свіжою\s+цитрусовою\s+ноткою/giu, 'баланс чорного чаю і свіжої цитрусової ноти')
    .replace(/для\s+сміливого\s+початку\s+дня,\s*щоб\s+підбадьорити\s+розум,\s*а\s+також\s+для\s+моментів\s+концентрації\s+або\s+спокійного\s+відпочинку\s+з\s+книгою/giu, 'для ранкової чашки або спокійного відпочинку з книгою')
    .split(/(?<=[.!?])\s+/)
    .map(compactText)
    .filter(Boolean)
    .filter(sentence => !healthClaimPattern.test(sentence))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanFeedDescriptionOverride(value = '') {
  const cleaned = sanitizeMerchantPolicyClaims(cleanFeedDescription(value)
    .replace(/https?:\/\/\S+|www\.\S+/giu, ' ')
    .replace(/\s*(?:корисні|релевантні|схожі)\s+розділи[\s\S]*$/giu, ' ')
    .replace(/\s*(?:інші товари|дивіться також)[\s\S]*$/giu, ' ')
    .replace(/\s*\|\s*купити[\s\S]*$/giu, ' ')
    .replace(/\s+/g, ' ')
    .trim());
  if (cleaned.length <= 5000) return cleaned;
  const clipped = cleaned.slice(0, 5000);
  const sentenceEnd = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf('!'), clipped.lastIndexOf('?'));
  return (sentenceEnd >= 3500 ? clipped.slice(0, sentenceEnd + 1) : clipped).trim();
}

function gtinStatus(value = '') {
  const raw = compactText(value);
  if (!raw) return { raw, present: false, valid: false, clearable: false };
  if (!/^\d+$/.test(raw)) {
    return { raw, present: true, valid: false, clearable: true, reason: 'GTIN містить нецифрове значення.' };
  }
  if (![8, 12, 13, 14].includes(raw.length)) {
    return { raw, present: true, valid: false, clearable: false, reason: 'GTIN має непідтримувану довжину.' };
  }
  const digits = raw.split('').map(Number);
  const checkDigit = digits.pop();
  let sum = 0;
  for (let index = digits.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
    sum += digits[index] * (position % 2 === 0 ? 3 : 1);
  }
  const expected = (10 - (sum % 10)) % 10;
  return {
    raw,
    present: true,
    valid: expected === checkDigit,
    clearable: false,
    reason: expected === checkDigit ? '' : 'GTIN не проходить перевірку контрольної цифри.'
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function numeric(value) {
  const number = Number(String(value ?? '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function booleanish(value, fallback = false) {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  return fallback;
}

function normalizedCatalogPolicy(policy = {}) {
  const variantExportMode = compactText(policy?.variantExportMode || DEFAULT_CATALOG_POLICY.variantExportMode);
  return {
    ...DEFAULT_CATALOG_POLICY,
    ...(policy && typeof policy === 'object' ? policy : {}),
    firstBatchProductIds: Array.isArray(policy?.firstBatchProductIds)
      ? policy.firstBatchProductIds.map(value => compactText(value)).filter(Boolean)
      : [...DEFAULT_CATALOG_POLICY.firstBatchProductIds],
    variantExportMode: ['canonical_product', 'split_by_package'].includes(variantExportMode)
      ? variantExportMode
      : DEFAULT_CATALOG_POLICY.variantExportMode,
    publishAllowed: false
  };
}

function unitLikeOptionValue(value = '') {
  return /(?:^|\s)\d+(?:[.,]\d+)?\s*(?:г|гр|кг|g|kg|мл|ml|л|l)(?:\s|$)/iu.test(compactText(value));
}

function variantDisplayValue(optionName = '', valueName = '') {
  const option = compactText(optionName).toLowerCase();
  const value = compactText(valueName);
  if (/^\d+(?:[.,]\d+)?$/.test(value)) {
    if (/грам|ваг/iu.test(option)) return Number(value) >= 1000 ? `${Number(value) / 1000} кг` : `${value} г`;
    if (/мл|об.?єм|volume/iu.test(option)) return `${value} мл`;
  }
  return value;
}

function classifyVariantOption(option = {}) {
  const name = compactText(option.name || option.option_name).toLowerCase();
  const values = Array.isArray(option.values) ? option.values : [];
  const priceChanging = values.some(value => numeric(value.price_delta) > 0 || String(value.price_prefix || '') === '=');
  const unitValues = values.filter(value => unitLikeOptionValue(value.name)).length;
  const packageName = /ваг|фасув|упаков|об.?єм|розмір|size|weight|volume|package/iu.test(name);
  const customizationName = /помел|grind|обсмаж|roast|подарунк|gift wrap|упакування/iu.test(name);
  let role = 'review';
  if (customizationName && !priceChanging && !packageName) role = 'customization';
  else if (packageName || priceChanging || (values.length > 0 && unitValues >= Math.ceil(values.length / 2))) role = 'sellable_variant';
  return {
    ...option,
    name: compactText(option.name || option.option_name),
    role,
    priceChanging,
    unitValues,
    values
  };
}

function variantGroupId(product = {}) {
  const id = compactText(product.product_id || product.id);
  return id ? `mercato-${id}` : '';
}

function canonicalFeedItem(product = {}) {
  return {
    id: productId(product),
    item_group_id: '',
    item_group_title: '',
    title: cleanFeedTitle(product.title || product.name || product.meta_h1 || '').slice(0, 150),
    description: cleanFeedDescription(product.feed_description || product.description || '').slice(0, 5000),
    link: productUrl(product),
    image_link: imageUrl(product),
    availability: normalizedAvailability(product),
    price: numeric(product.price),
    price_currency: compactText(product.price_currency || 'UAH').toUpperCase(),
    brand: compactText(product.brand || product.manufacturer),
    gtin: compactText(product.gtin),
    mpn: compactText(product.mpn || product.model),
    sku: compactText(product.sku || product.model),
    product_id: compactText(product.product_id || product.id),
    variant_option: null,
    landingSelectionVerified: true,
    publishAllowed: false,
    feedStrategy: 'canonical_product'
  };
}

function buildVariantPolicy(product = {}, coverage = {}, policy = DEFAULT_CATALOG_POLICY) {
  const catalogPolicy = normalizedCatalogPolicy(policy);
  const options = Array.isArray(product.variant_options)
    ? product.variant_options.map(classifyVariantOption)
    : [];
  const optionCount = numeric(product.option_count);
  const variantDataKnown = fieldKnown(product, 'variant_options', coverage);
  const sellableOptions = options.filter(option => option.role === 'sellable_variant' && option.values.length);
  const customizationOptions = options.filter(option => option.role === 'customization');
  const reviewOptions = options.filter(option => option.role === 'review');
  if (catalogPolicy.variantExportMode !== 'split_by_package') {
    return {
      status: 'canonical_product',
      variantExportMode: catalogPolicy.variantExportMode,
      itemGroupId: '',
      options,
      sellableOptions,
      customizationOptions,
      reviewOptions,
      feedItems: [canonicalFeedItem(product)],
      landingSelectionVerified: true,
      message: optionCount
        ? 'Фасування лишається опцією на сторінці товару. У Merchant feed відправляється один канонічний offer, щоб не плодити дублікати.'
        : 'У Merchant feed відправляється один канонічний offer товару.'
    };
  }
  if (!optionCount) {
    return {
      status: 'not_applicable',
      variantExportMode: catalogPolicy.variantExportMode,
      itemGroupId: '',
      options,
      sellableOptions: [],
      customizationOptions: [],
      reviewOptions: [],
      feedItems: [],
      landingSelectionVerified: true,
      message: 'У товару немає опцій, окремі variant items не потрібні.'
    };
  }
  if (!variantDataKnown) {
    return {
      status: 'data_not_scanned',
      variantExportMode: catalogPolicy.variantExportMode,
      itemGroupId: '',
      options,
      sellableOptions: [],
      customizationOptions: [],
      reviewOptions: [],
      feedItems: [],
      landingSelectionVerified: false,
      message: 'Bridge не віддав значення опцій, ціни та залишки варіантів.'
    };
  }
  if (!sellableOptions.length && !reviewOptions.length) {
    return {
      status: 'customization_only',
      variantExportMode: catalogPolicy.variantExportMode,
      itemGroupId: '',
      options,
      sellableOptions,
      customizationOptions,
      reviewOptions,
      feedItems: [],
      landingSelectionVerified: true,
      message: 'Опції є лише налаштуванням замовлення і не створюють окремі Merchant variants.'
    };
  }
  if (sellableOptions.length !== 1 || reviewOptions.length) {
    return {
      status: 'combination_review',
      variantExportMode: catalogPolicy.variantExportMode,
      itemGroupId: variantGroupId(product),
      options,
      sellableOptions,
      customizationOptions,
      reviewOptions,
      feedItems: [],
      landingSelectionVerified: false,
      message: 'OpenCart не підтверджує готові комбінації кількох товарних опцій. Потрібне ручне зіставлення.'
    };
  }

  const option = sellableOptions[0];
  const groupId = variantGroupId(product);
  const baseTitle = cleanFeedTitle(product.title || product.name || product.meta_h1 || '');
  const description = cleanFeedDescription(product.feed_description || product.description || '').slice(0, 5000);
  const baseLink = productUrl(product);
  const baseImage = imageUrl(product);
  const brand = compactText(product.brand || product.manufacturer);
  const feedItems = option.values.map(value => {
    const stableValueId = compactText(value.product_option_value_id || value.option_value_id);
    const valueName = variantDisplayValue(option.name, value.name);
    const productRecordId = compactText(product.product_id);
    const variantId = stableValueId && productRecordId ? `mercato-${productRecordId}-${stableValueId}` : '';
    const price = numeric(value.final_price);
    return {
      id: variantId,
      item_group_id: groupId,
      item_group_title: baseTitle,
      title: cleanFeedTitle(`${baseTitle} — ${valueName}`).slice(0, 150),
      description,
      link: baseLink,
      image_link: compactText(value.image_link) || baseImage,
      availability: compactText(value.availability) || normalizedAvailability(product),
      price,
      price_currency: compactText(product.price_currency || 'UAH').toUpperCase(),
      brand,
      gtin: compactText(value.gtin || product.gtin),
      mpn: compactText(value.mpn || value.model || product.mpn || product.model),
      sku: compactText(value.sku || product.sku),
      size: unitLikeOptionValue(valueName) ? valueName : '',
      variant_option: {
        name: option.name,
        value: valueName
      },
      product_id: compactText(product.product_id),
      product_option_id: compactText(option.product_option_id),
      product_option_value_id: stableValueId,
      landingSelectionVerified: false,
      publishAllowed: false
    };
  });
  const valid = feedItems.length > 1 && feedItems.every(item => item.id && item.price > 0 && item.availability && item.title);
  return {
    status: valid ? 'dry_run_ready' : 'value_review',
    variantExportMode: catalogPolicy.variantExportMode,
    itemGroupId: groupId,
    options,
    sellableOptions,
    customizationOptions,
    feedItems,
    landingSelectionVerified: false,
    message: valid
      ? `Підготовлено ${feedItems.length} варіантів. Перед publish треба перевірити URL, який відкриває потрібне фасування.`
      : 'Не всі варіанти мають стабільний ID, позитивну ціну або наявність.'
  };
}

function normalizedAvailability(product = {}) {
  const raw = compactText(product.availability || '').toLowerCase();
  const schemaMap = {
    'https://schema.org/instock': 'in_stock',
    'https://schema.org/outofstock': 'out_of_stock',
    'https://schema.org/preorder': 'preorder',
    'https://schema.org/backorder': 'backorder'
  };
  if (schemaMap[raw]) return schemaMap[raw];
  if (SUPPORTED_AVAILABILITY.has(raw)) return raw;
  const stock = compactText(product.stock_status || '').toLowerCase();
  if (/передзамов|preorder/.test(stock)) return 'preorder';
  if (/очіку|backorder/.test(stock)) return 'backorder';
  return booleanish(product.status, true) && numeric(product.quantity) > 0 ? 'in_stock' : 'out_of_stock';
}

function productId(product = {}) {
  return compactText(product.offer_id || product.id || product.product_id || product.sku || product.model);
}

function productUrl(product = {}) {
  return compactText(product.link || product.url || product.routeUrl);
}

function imageUrl(product = {}) {
  return compactText(product.image_link || product.image_url || product.image);
}

function addIssue(list, {
  code,
  severity = 'review',
  field = '',
  message,
  impact = '',
  fix = '',
  autoFixable = false,
  evidence = ''
}) {
  list.push({ code, severity, field, message, impact, fix, autoFixable, evidence });
}

function fieldKnown(product, field, coverage) {
  if (Object.prototype.hasOwnProperty.call(product, field)) return true;
  return Boolean(coverage?.fields?.includes?.(field));
}

function validateMerchantProduct(product = {}, coverage = {}, policy = DEFAULT_CATALOG_POLICY) {
  const catalogPolicy = normalizedCatalogPolicy(policy);
  const issues = [];
  const active = booleanish(product.status, true);
  const id = productId(product);
  const title = cleanFeedTitle(product.feed_title || product.title || product.name || product.meta_h1 || '');
  const description = cleanFeedDescription(product.feed_description || product.description || product.description_text || product.descriptionPreview || '');
  const link = productUrl(product);
  const image = imageUrl(product);
  const availability = normalizedAvailability(product);
  const price = numeric(product.price);
  const currency = compactText(product.price_currency || product.currency || 'UAH').toUpperCase();
  const sourceBrand = compactText(product.brand || product.manufacturer);
  const brand = catalogPolicy.brandConfirmedByOwner && catalogPolicy.brandScope === 'all_products'
    ? compactText(catalogPolicy.confirmedBrand)
    : sourceBrand;
  const gtin = compactText(product.gtin);
  const gtinCheck = gtinStatus(gtin);
  const mpn = compactText(product.mpn || product.model);
  const sku = compactText(product.sku || product.model);
  const identifierExistsKnown = fieldKnown(product, 'identifier_exists', coverage);
  const identifierExists = booleanish(product.identifier_exists, true);
  const width = numeric(product.image_width);
  const height = numeric(product.image_height);
  const imageSizeKnown = fieldKnown(product, 'image_width', coverage) || fieldKnown(product, 'image_height', coverage);
  const priceKnown = fieldKnown(product, 'price', coverage);
  const imageKnown = fieldKnown(product, 'image_link', coverage) || fieldKnown(product, 'image_url', coverage) || fieldKnown(product, 'image', coverage);
  const brandKnown = fieldKnown(product, 'brand', coverage) || fieldKnown(product, 'manufacturer', coverage);
  const descriptionKnown = fieldKnown(product, 'description', coverage)
    || fieldKnown(product, 'description_text', coverage)
    || fieldKnown(product, 'feed_description', coverage);

  if (!active) {
    addIssue(issues, {
      code: 'excluded_disabled',
      severity: 'info',
      field: 'status',
      message: 'Товар вимкнений в OpenCart і не повинен потрапляти в активний фід.',
      impact: 'Не створює Merchant помилку, якщо його виключити з джерела даних.',
      fix: 'Тримати товар поза feed export.',
      autoFixable: true
    });
  }

  if (!id) {
    addIssue(issues, {
      code: 'missing_id',
      severity: 'critical',
      field: 'id',
      message: 'Немає стабільного ID товару.',
      impact: 'Google не прийме товар без унікального ID.',
      fix: 'Використати незмінний SKU або product_id.',
      autoFixable: Boolean(product.product_id)
    });
  }
  if (!title) {
    addIssue(issues, {
      code: 'missing_title',
      severity: 'critical',
      field: 'title',
      message: 'Немає назви товару для фіда.',
      impact: 'Товар не може показуватися в Shopping або free listings.',
      fix: 'Додати точну людську назву товару без реклами.',
      autoFixable: Boolean(product.meta_h1 || product.meta_title)
    });
  } else {
    if (title.length > 150) {
      addIssue(issues, {
        code: 'title_too_long',
        severity: 'high',
        field: 'title',
        message: `Назва має ${title.length} символів при максимумі Google 150.`,
        impact: 'Ризик обрізання або некоректного подання товару.',
        fix: 'Скоротити без втрати різновиду, походження і формату.',
        autoFixable: true,
        evidence: title
      });
    }
    if (/безкоштовн|знижк|акці|доставка|купуй|🔥|⭐/iu.test(title)) {
      addIssue(issues, {
        code: 'promotional_title',
        severity: 'high',
        field: 'title',
        message: 'Назва містить рекламний або декоративний текст.',
        impact: 'Google забороняє промотекст у title.',
        fix: 'Залишити тільки ідентифікацію товару.',
        autoFixable: true,
        evidence: title
      });
    }
  }

  if (!descriptionKnown) {
    addIssue(issues, {
      code: 'description_not_scanned',
      severity: 'unknown',
      field: 'description',
      message: 'Старий bridge не віддає повний опис для Merchant-перевірки.',
      impact: 'Неможливо підтвердити якість description.',
      fix: 'Оновити mercato-bridge.php і повторити scan.'
    });
  } else if (!description) {
    addIssue(issues, {
      code: 'missing_description',
      severity: 'critical',
      field: 'description',
      message: 'Немає чистого опису товару.',
      impact: 'Обовʼязковий атрибут Google відсутній.',
      fix: 'Підготувати опис лише про товар, без посилань та реклами.',
      autoFixable: false
    });
  } else {
    if (description.length > 5000) {
      addIssue(issues, {
        code: 'description_too_long',
        severity: 'high',
        field: 'description',
        message: `Опис має ${description.length} символів при максимумі Google 5000.`,
        impact: 'Фід може бути відхилений або обрізаний.',
        fix: 'Створити окремий чистий feed-description.',
        autoFixable: true
      });
    }
    if (/https?:\/\/|www\.|корисні розділи|інші товари|конкурент/iu.test(description)) {
      addIssue(issues, {
        code: 'description_external_content',
        severity: 'high',
        field: 'description',
        message: 'Опис містить посилання або інформацію не лише про сам товар.',
        impact: 'Не відповідає правилам description у Merchant Center.',
        fix: 'Прибрати URL, навігаційні, рекламні та конкурентні блоки.',
        autoFixable: true
      });
    }
  }

  if (!link || !/^https?:\/\//i.test(link)) {
    addIssue(issues, {
      code: 'missing_link',
      severity: 'critical',
      field: 'link',
      message: 'Немає валідного landing page URL.',
      impact: 'Google не може відправити покупця на конкретний товар.',
      fix: 'Створити стабільний HTTPS URL товарної сторінки.',
      autoFixable: Boolean(product.keyword || product.product_id)
    });
  }

  if (!imageKnown) {
    addIssue(issues, {
      code: 'image_not_scanned',
      severity: 'unknown',
      field: 'image_link',
      message: 'Старий bridge не віддає головне фото.',
      impact: 'Неможливо перевірити обовʼязковий image_link.',
      fix: 'Оновити bridge і повторити scan.'
    });
  } else if (!image || !/^https?:\/\//i.test(image)) {
    addIssue(issues, {
      code: 'missing_image',
      severity: 'critical',
      field: 'image_link',
      message: 'Немає валідного головного фото.',
      impact: 'Товар не може показуватися без image_link.',
      fix: 'Додати реальне фото товару без watermark і промотексту.',
      autoFixable: false
    });
  } else if (imageSizeKnown && width && height && (width < 500 || height < 500)) {
    addIssue(issues, {
      code: 'image_too_small',
      severity: 'high',
      field: 'image_link',
      message: `Фото ${width}×${height}px менше майбутнього мінімуму 500×500px.`,
      impact: 'Ризик втрати eligibility після 31 січня 2027 року.',
      fix: 'Замінити оригінальним фото не менше 500×500px.',
      autoFixable: false
    });
  }

  if (!SUPPORTED_AVAILABILITY.has(availability)) {
    addIssue(issues, {
      code: 'invalid_availability',
      severity: 'critical',
      field: 'availability',
      message: 'Наявність не відповідає підтримуваним значенням Google.',
      impact: 'Товар може бути відхилений.',
      fix: 'Передавати in_stock, out_of_stock, preorder або backorder.',
      autoFixable: true
    });
  }

  if (!priceKnown) {
    addIssue(issues, {
      code: 'price_not_scanned',
      severity: 'unknown',
      field: 'price',
      message: 'Старий bridge не віддає ціну.',
      impact: 'Неможливо підтвердити обовʼязковий price.',
      fix: 'Оновити bridge і повторити scan.'
    });
  } else if (price <= 0) {
    addIssue(issues, {
      code: 'invalid_price',
      severity: 'critical',
      field: 'price',
      message: 'Ціна відсутня або дорівнює нулю.',
      impact: 'Звичайний фізичний товар із ціною 0 не допускається.',
      fix: 'Вказати фактичну доступну для всіх покупців ціну.',
      autoFixable: false
    });
  }
  if (currency !== 'UAH') {
    addIssue(issues, {
      code: 'invalid_currency',
      severity: 'critical',
      field: 'price',
      message: `Для українського фіда очікується UAH, отримано ${currency || 'порожньо'}.`,
      impact: 'Ціна та landing page можуть не збігатися.',
      fix: 'Передавати ISO 4217 валюту UAH.',
      autoFixable: true
    });
  }

  if (!brandKnown) {
    addIssue(issues, {
      code: 'brand_not_scanned',
      severity: 'unknown',
      field: 'brand',
      message: 'Старий bridge не віддає бренд/виробника.',
      impact: 'Не можна підтвердити identifier policy.',
      fix: 'Оновити bridge і повторити scan.'
    });
  } else if (!brand) {
    addIssue(issues, {
      code: 'missing_brand',
      severity: 'review',
      field: 'brand',
      message: 'Бренд не заданий.',
      impact: 'Для більшості нових товарів brand потрібен разом з ідентифікаторами.',
      fix: 'Підтвердити власний бренд Mercato або реального виробника.',
      autoFixable: false
    });
  }

  if (gtinCheck.present && !gtinCheck.valid) {
    addIssue(issues, {
      code: 'invalid_gtin',
      severity: 'high',
      field: 'gtin',
      message: `GTIN «${gtin}» не є валідним глобальним ідентифікатором.`,
      impact: 'Google може відхилити товар через некоректний ідентифікатор.',
      fix: gtinCheck.clearable
        ? 'Очистити службове нецифрове значення; не вигадувати новий GTIN.'
        : 'Перевірити код на упаковці або у виробника; автоматично не змінювати.',
      autoFixable: gtinCheck.clearable,
      evidence: gtin
    });
  }

  if (!gtin && !mpn && !sku && (!identifierExistsKnown || identifierExists)) {
    addIssue(issues, {
      code: 'missing_identifiers',
      severity: 'review',
      field: 'gtin/mpn',
      message: 'Немає GTIN, MPN або SKU та не підтверджено identifier_exists=no.',
      impact: 'Google може обмежити показ або відхилити товар залежно від типу.',
      fix: 'Не вигадувати GTIN. Вказати реальний код або вручну підтвердити відсутність глобальних ідентифікаторів.',
      autoFixable: false
    });
  }

  const variantPolicy = buildVariantPolicy({ ...product, brand }, coverage, catalogPolicy);
  if (variantPolicy.status === 'data_not_scanned') {
    addIssue(issues, {
      code: 'variant_data_not_scanned',
      severity: 'unknown',
      field: 'variant_options',
      message: 'Значення опцій, ціни та залишки варіантів ще не проскановані.',
      impact: 'Не можна сформувати окремі feed items для фасувань.',
      fix: 'Оновити bridge до актуального v35 і повторити scan.'
    });
  } else if (variantPolicy.status === 'combination_review') {
    addIssue(issues, {
      code: 'variant_combination_review',
      severity: 'review',
      field: 'item_group_id',
      message: variantPolicy.message,
      impact: 'Неправильні комбінації можуть показати неіснуючу ціну або конфігурацію.',
      fix: 'Підтвердити, які опції є окремими товарами, а які лише налаштуванням замовлення.',
      autoFixable: false
    });
  } else if (variantPolicy.status === 'value_review') {
    addIssue(issues, {
      code: 'variant_value_review',
      severity: 'review',
      field: 'variant_options',
      message: variantPolicy.message,
      impact: 'Неповний варіант не можна передавати у фід.',
      fix: 'Перевірити ID, ціну та залишок кожного фасування.',
      autoFixable: false
    });
  } else if (variantPolicy.status === 'dry_run_ready' && !variantPolicy.landingSelectionVerified) {
    addIssue(issues, {
      code: 'variant_landing_review',
      severity: 'review',
      field: 'link',
      message: variantPolicy.message,
      impact: 'Google очікує, що URL відкриє саме заявлений варіант і покаже його ціну та наявність.',
      fix: 'Додати або підтвердити стабільний URL/параметр попереднього вибору фасування.',
      autoFixable: false
    });
  }

  const severityCounts = issues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, {});
  const penalties = { critical: 20, high: 10, review: 4, unknown: 0, info: 0 };
  const score = Math.max(0, 100 - issues.reduce((sum, issue) => sum + (penalties[issue.severity] || 0), 0));
  const status = !active
    ? 'excluded'
    : severityCounts.critical
      ? 'critical'
      : severityCounts.high || severityCounts.review
        ? 'needs_review'
        : severityCounts.unknown
          ? 'limited_scan'
          : 'ready';

  return {
    id,
    productId: compactText(product.product_id || product.id),
    name: compactText(product.name || product.title || title || id || 'Товар'),
    title,
    description,
    link,
    imageLink: image,
    availability,
    price,
    priceCurrency: currency,
    brand,
    sourceBrand,
    gtin,
    mpn,
    sku,
    variantPolicy,
    active,
    score,
    status,
    issues,
    severityCounts,
    source: product
  };
}

function summarizeProducts(products = [], coverage = {}) {
  const counts = products.reduce((acc, product) => {
    acc[product.status] = (acc[product.status] || 0) + 1;
    return acc;
  }, {});
  const active = products.filter(product => product.active);
  const issueCounts = {};
  products.forEach(product => product.issues.forEach(issue => {
    issueCounts[issue.code] = (issueCounts[issue.code] || 0) + 1;
  }));
  const topIssues = Object.entries(issueCounts)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  return {
    total: products.length,
    active: active.length,
    excluded: counts.excluded || 0,
    ready: counts.ready || 0,
    critical: counts.critical || 0,
    needsReview: counts.needs_review || 0,
    limitedScan: counts.limited_scan || 0,
    scoreAvailable: Boolean(coverage.full),
    averageScore: coverage.full && active.length
      ? Math.round(active.reduce((sum, product) => sum + product.score, 0) / active.length)
      : null,
    fullCoverage: Boolean(coverage.full),
    topIssues
  };
}

function buildFixPlan(report = {}, policy = DEFAULT_CATALOG_POLICY) {
  const products = Array.isArray(report.products) ? report.products : [];
  const items = products
    .map(product => {
      const auto = product.issues.filter(issue => issue.autoFixable);
      const writeProposals = product.active ? buildWriteProposals(product, policy) : [];
      const proposalActions = new Set(writeProposals.map(proposal => proposal.action));
      const proposalCoversIssue = issue => {
        if (['description_too_long', 'description_external_content'].includes(issue.code)) {
          return proposalActions.has('set_feed_description_override');
        }
        if (['title_too_long', 'promotional_title'].includes(issue.code)) {
          return proposalActions.has('set_feed_title_override');
        }
        if (issue.code === 'invalid_gtin') return proposalActions.has('clear_invalid_gtin');
        if (issue.code === 'missing_brand') return proposalActions.has('set_brand');
        return false;
      };
      const manual = product.active ? [
        ...product.issues.filter(issue => !issue.autoFixable && !['unknown', 'info'].includes(issue.severity)),
        ...auto.filter(issue => !proposalCoversIssue(issue) && !['unknown', 'info'].includes(issue.severity)).map(issue => ({
          ...issue,
          fix: `${issue.fix || 'Перевірити вручну.'} Автоматичний diff не створено, бо у snapshot немає достатнього безпечного тексту/даних для запису.`
        }))
      ] : [];
      return {
        productId: product.productId,
        name: product.name,
        link: product.link,
        score: product.score,
        status: product.status,
        proposedBrand: product.brand,
        sourceFingerprint: fingerprint({
          productId: product.productId,
          title: product.title,
          description: product.description,
          sourceBrand: product.sourceBrand,
          gtin: product.gtin,
          price: product.price,
          availability: product.availability
        }),
        variantPolicy: product.variantPolicy ? {
          status: product.variantPolicy.status,
          itemGroupId: product.variantPolicy.itemGroupId || '',
          feedItemCount: Number(product.variantPolicy.feedItemCount ?? product.variantPolicy.feedItems?.length ?? 0),
          landingSelectionVerified: Boolean(product.variantPolicy.landingSelectionVerified),
          message: product.variantPolicy.message || ''
        } : null,
        autoFixes: auto.map(issue => ({ code: issue.code, field: issue.field, fix: issue.fix })),
        manualDecisions: manual.map(issue => ({ code: issue.code, field: issue.field, question: issue.fix })),
        writeProposals,
        publishAllowed: false
      };
    })
    .filter(item => item.writeProposals.length || item.manualDecisions.length || ['critical', 'needs_review'].includes(item.status));
  const writeItems = items.filter(item => item.writeProposals.length);
  const byAction = {};
  writeItems.forEach(item => item.writeProposals.forEach(proposal => {
    byAction[proposal.action] = (byAction[proposal.action] || 0) + 1;
  }));
  return {
    generatedAt: new Date().toISOString(),
    mode: 'dry-run',
    publishAllowed: false,
    rule: 'Постійна черга: кожен batch — максимум 5 товарів після ручного погодження.',
    queue: {
      remainingProducts: writeItems.length,
      remainingChanges: writeItems.reduce((sum, item) => sum + item.writeProposals.length, 0),
      byAction,
      manualOnlyProducts: items.filter(item => !item.writeProposals.length && item.manualDecisions.length).length
    },
    items
  };
}

function normalizedConnectorStatus(value = {}) {
  if (!value || typeof value !== 'object') {
    return { ok: false, checkedAt: '', message: '', error: 'Не перевірено.' };
  }
  return {
    ok: Boolean(value.ok),
    checkedAt: value.checkedAt || '',
    message: compactText(value.message || ''),
    error: compactText(value.error || '')
  };
}

function buildMerchantEvidenceGraph({ report = null, connectorVerification = {}, liveBridge = null } = {}) {
  const merchantConnector = normalizedConnectorStatus(connectorVerification.merchant);
  const products = Array.isArray(report?.products) ? report.products : [];
  const summary = report?.summary || {};
  const coverage = report?.coverage || {};
  return {
    generatedAt: new Date().toISOString(),
    sources: [
      {
        id: 'opencart_bridge',
        name: 'OpenCart bridge',
        status: report ? 'ready' : 'missing_scan',
        readOnly: true,
        evidence: report
          ? `${Number(summary.total || products.length || 0)} товарів, ${Number(summary.active || 0)} активних, coverage=${coverage.full ? 'full' : 'partial'}, variantFull=${coverage.variantFull ? 'true' : 'false'}`
          : 'Потрібен Merchant scan перед будь-яким diff.',
        canWrite: false
      },
      {
        id: 'merchant_center',
        name: 'Google Merchant Center diagnostics',
        status: merchantConnector.ok ? 'connected' : 'not_ready',
        readOnly: true,
        evidence: merchantConnector.ok
          ? merchantConnector.message || 'Merchant API відповідає.'
          : merchantConnector.error || 'Потрібен Google OAuth content scope або service account для Merchant API.',
        canWrite: false
      },
      {
        id: 'merchant_api_mcp',
        name: 'Merchant API MCP Access Service',
        status: 'planned_guarded',
        readOnly: true,
        evidence: 'Офіційний Google MCP alpha; вмикати лише з service account і tool allowlist.',
        canWrite: false
      },
      {
        id: 'seo_center',
        name: 'SEO Center / GSC / GA4 / CrUX',
        status: 'available_in_seo_center',
        readOnly: true,
        evidence: 'Використовувати для пріоритету: покази, кліки, органічні сесії, CWV і сторінки з попитом.',
        canWrite: false
      },
      {
        id: 'approval_executor',
        name: 'Approval-gated executor',
        status: liveBridge?.supportsApprovedWrites ? 'ready' : 'blocked_by_bridge',
        readOnly: false,
        evidence: liveBridge?.version ? `Live bridge ${liveBridge.version}` : 'Live bridge version unknown.',
        canWrite: Boolean(liveBridge?.supportsApprovedWrites)
      }
    ],
    joinKeys: [
      'product_id',
      'offer_id / id',
      'link / canonical URL',
      'item_group_id',
      'SKU / MPN / GTIN only when real'
    ],
    rule: 'Жоден агент не має права вносити зміну, якщо вона не привʼязана мінімум до одного source snapshot і не пройшла preview → approval → readback.'
  };
}

function buildMerchantApiIntelligence({
  report = null,
  fixPlan = null,
  reportState = null,
  connectorVerification = {},
  liveBridge = null,
  policy = DEFAULT_CATALOG_POLICY
} = {}) {
  const merchantConnector = normalizedConnectorStatus(connectorVerification.merchant);
  const googleAdsConnector = normalizedConnectorStatus(connectorVerification.google_ads);
  const now = new Date().toISOString();
  const reportFresh = Boolean(report) && !Boolean(reportState?.stale);
  const activeProducts = Number(report?.summary?.active || 0);
  const variantsReady = Boolean(report?.coverage?.variantFull);
  const catalogPolicy = normalizedCatalogPolicy(policy);
  const deterministicQueue = Number(fixPlan?.queue?.remainingProducts || 0);
  const mcpReady = false;
  const nextSteps = [];
  if (!merchantConnector.ok) {
    nextSteps.push('Підключити або перевірити Google Merchant access: OAuth content scope зараз достатній для diagnostics, service account потрібен для Merchant data MCP.');
  }
  if (!reportFresh) nextSteps.push('Запустити свіжий OpenCart Merchant scan перед порівнянням з Google diagnostics.');
  if (reportFresh && !variantsReady && catalogPolicy.variantExportMode === 'split_by_package') {
    nextSteps.push('Повторити scan з повними variant_options, щоб Google Shopping не отримав неповні фасування.');
  }
  if (catalogPolicy.variantExportMode === 'canonical_product') {
    nextSteps.push('Тримати фасування як storefront option: один OpenCart товар = один Merchant offer, без дублювання грамовок у фіді.');
  }
  nextSteps.push('Після service account додати read-only MCP tool allowlist: list_products, get_product_by_name, report_search, list_account_issues, list_aggregate_product_statuses, list_data_sources, get_automatic_improvements.');
  nextSteps.push('Не вмикати create_data_source/fetch_data_source або інші write-like tools у live без окремого approval.');

  return {
    generatedAt: now,
    rulesVersion: GOOGLE_RULES_VERSION,
    agenticVersion: GOOGLE_MERCHANT_AGENTIC_VERSION,
    mode: 'read_only_first',
    publishAllowed: false,
    brandPolicy: {
      brand: catalogPolicy.confirmedBrand,
      scope: catalogPolicy.brandScope,
      confirmedByOwner: Boolean(catalogPolicy.brandConfirmedByOwner)
    },
    variantExportMode: catalogPolicy.variantExportMode,
    readiness: {
      openCartScan: report ? (variantsReady ? 'variant_full' : 'partial') : 'missing',
      liveBridge: liveBridge?.version || '',
      merchantConnector: merchantConnector.ok ? 'connected' : 'not_ready',
      googleAdsConnector: googleAdsConnector.ok ? 'connected' : 'not_required_for_feed',
      merchantDataMcp: mcpReady ? 'ready' : 'planned_service_account_required',
      deterministicQueue: deterministicQueue || null,
      activeProducts
    },
    tools: MERCHANT_API_AGENTIC_TOOLS,
    feedRuleEngine: MERCHANT_FEED_RULE_ENGINE,
    evidenceGraph: buildMerchantEvidenceGraph({ report, connectorVerification, liveBridge }),
    allowedMcpReadTools: [
      'list_accounts',
      'list_products',
      'get_product_by_name',
      'report_search',
      'list_account_issues',
      'list_aggregate_product_statuses',
      'list_data_sources',
      'get_data_source',
      'list_programs',
      'get_automatic_improvements'
    ],
    blockedMcpToolsUntilApproval: [
      'create_data_source',
      'fetch_data_source',
      'product insert/update/delete',
      'shipping or return policy writes',
      'automatic improvements writes'
    ],
    nextSteps,
    safety: {
      alphaWarning: 'Merchant API MCP Access Service is alpha; use test/non-live first and restrict credentials.',
      quotaWarning: 'Merchant API MCP shares Merchant API quota, тому nightly agents мають throttling і кеш.',
      noInventedFacts: true,
      noMerchantCenterPublish: true,
      ownerApprovalRequired: true
    }
  };
}

function buildTestBatch(report = {}, policy = DEFAULT_CATALOG_POLICY) {
  const catalogPolicy = normalizedCatalogPolicy(policy);
  const products = Array.isArray(report.products) ? report.products : [];
  const byId = new Map(products.map(product => [compactText(product.productId), product]));
  const preferred = catalogPolicy.firstBatchProductIds.map(id => byId.get(id)).filter(Boolean);
  const fallback = products
    .filter(product => product.active && product.variantPolicy?.feedItems?.length)
    .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, 'uk'));
  const selected = [...preferred, ...fallback]
    .filter((product, index, rows) => rows.findIndex(item => item.productId === product.productId) === index)
    .slice(0, Math.max(1, Math.min(5, Number(catalogPolicy.firstBatchLimit || 5))));
  const productsWithItems = selected.map(product => ({
    productId: product.productId,
    name: product.name,
    link: product.link,
    brand: product.brand,
    score: product.score,
    variantStatus: product.variantPolicy?.status || 'unknown',
    variantMessage: product.variantPolicy?.message || '',
    landingSelectionVerified: Boolean(product.variantPolicy?.landingSelectionVerified),
    items: product.variantPolicy?.feedItems || [],
    publishAllowed: false
  }));
  return {
    generatedAt: new Date().toISOString(),
    mode: 'dry-run',
    brandPolicy: {
      brand: catalogPolicy.confirmedBrand,
      scope: catalogPolicy.brandScope,
      confirmedByOwner: Boolean(catalogPolicy.brandConfirmedByOwner),
      confirmedAt: catalogPolicy.brandConfirmedAt,
      variantExportMode: catalogPolicy.variantExportMode
    },
    variantExportMode: catalogPolicy.variantExportMode,
    productLimit: 5,
    selectedProducts: productsWithItems.length,
    feedItems: productsWithItems.reduce((sum, product) => sum + product.items.length, 0),
    landingUrlsVerified: productsWithItems.every(product => product.landingSelectionVerified),
    publishAllowed: false,
    blockers: productsWithItems.flatMap(product => {
      const blockers = [];
      if (!product.items.length) blockers.push(`${product.name}: актуальний scan ще не віддав готові варіанти.`);
      if (product.items.length && !product.landingSelectionVerified) blockers.push(`${product.name}: URL не підтверджує попередній вибір фасування.`);
      return blockers;
    }),
    products: productsWithItems
  };
}

function buildWriteProposals(product = {}, policy = DEFAULT_CATALOG_POLICY) {
  const catalogPolicy = normalizedCatalogPolicy(policy);
  const proposals = [];
  const desiredBrand = compactText(catalogPolicy.confirmedBrand);
  const sourceBrand = compactText(product.sourceBrand);
  if (
    catalogPolicy.brandConfirmedByOwner
    && catalogPolicy.brandScope === 'all_products'
    && desiredBrand
    && sourceBrand.toLocaleLowerCase('uk') !== desiredBrand.toLocaleLowerCase('uk')
  ) {
    proposals.push({
      id: `brand-${compactText(product.productId)}`,
      action: 'set_brand',
      target: 'opencart',
      field: 'brand',
      before: sourceBrand,
      after: desiredBrand,
      reason: sourceBrand
        ? `Виробник у OpenCart відрізняється від підтвердженого бренду ${desiredBrand}.`
        : `Виробник у OpenCart не заданий; власник підтвердив бренд ${desiredBrand}.`
    });
  }

  const issueCodes = new Set((product.issues || []).map(issue => issue.code));
  const gtinCheck = gtinStatus(product.gtin);
  if (issueCodes.has('invalid_gtin') && gtinCheck.clearable) {
    proposals.push({
      id: `clear-gtin-${compactText(product.productId)}`,
      action: 'clear_invalid_gtin',
      target: 'opencart',
      field: 'gtin',
      before: gtinCheck.raw,
      after: '',
      reason: 'Службове нецифрове значення не можна передавати як GTIN. Воно очищається без вигадування нового коду.'
    });
  }

  const cleanTitle = cleanFeedTitle(product.title || product.name || '');
  if (
    cleanTitle
    && cleanTitle !== compactText(product.title)
    && (issueCodes.has('title_too_long') || issueCodes.has('promotional_title'))
  ) {
    proposals.push({
      id: `feed-title-${compactText(product.productId)}`,
      action: 'set_feed_title_override',
      target: 'opencart_feed_override',
      field: 'feed_title',
      before: compactText(product.title),
      after: cleanTitle.slice(0, 150).trim(),
      reason: 'Окремий Merchant title прибирає промотекст або перевищення ліміту, не змінюючи H1 на сайті.'
    });
  }

  const cleanDescription = cleanFeedDescriptionOverride(product.description || '');
  if (
    cleanDescription
    && cleanDescription !== compactText(product.description)
    && (issueCodes.has('description_too_long') || issueCodes.has('description_external_content'))
  ) {
    proposals.push({
      id: `feed-description-${compactText(product.productId)}`,
      action: 'set_feed_description_override',
      target: 'opencart_feed_override',
      field: 'feed_description',
      before: `Поточний опис: ${compactText(product.description).length} символів`,
      after: cleanDescription,
      reason: 'Окремий Merchant description прибирає URL і навігаційні блоки, не переписуючи опис товару в OpenCart.'
    });
  }
  return proposals;
}

function compactVariantPolicy(variantPolicy = {}, keepFull = false) {
  if (!variantPolicy || typeof variantPolicy !== 'object') return null;
  const summary = {
    status: variantPolicy.status || 'unknown',
    variantExportMode: variantPolicy.variantExportMode || '',
    itemGroupId: variantPolicy.itemGroupId || '',
    feedItemCount: Number(variantPolicy.feedItems?.length || variantPolicy.feedItemCount || 0),
    optionCount: Number(variantPolicy.options?.length || variantPolicy.optionCount || 0),
    customizationOptionNames: Array.isArray(variantPolicy.customizationOptions)
      ? variantPolicy.customizationOptions.map(option => compactText(option.name)).filter(Boolean)
      : Array.isArray(variantPolicy.customizationOptionNames)
        ? variantPolicy.customizationOptionNames
        : [],
    landingSelectionVerified: Boolean(variantPolicy.landingSelectionVerified),
    message: variantPolicy.message || ''
  };
  if (!keepFull) return summary;
  return {
    ...summary,
    options: variantPolicy.options || [],
    sellableOptions: variantPolicy.sellableOptions || [],
    customizationOptions: variantPolicy.customizationOptions || [],
    reviewOptions: variantPolicy.reviewOptions || [],
    feedItems: variantPolicy.feedItems || []
  };
}

function compactProductForState(product = {}, keepVariants = false) {
  const {
    source,
    variantPolicy,
    description,
    ...rest
  } = product;
  const issueCodes = new Set((product.issues || []).map(issue => issue.code));
  const keepDescriptionForFix = issueCodes.has('description_too_long') || issueCodes.has('description_external_content');
  return {
    ...rest,
    description: keepVariants || keepDescriptionForFix ? description : '',
    variantPolicy: compactVariantPolicy(variantPolicy, keepVariants)
  };
}

function compactReportForState(report = {}, policy = DEFAULT_CATALOG_POLICY) {
  const keepIds = new Set(normalizedCatalogPolicy(policy).firstBatchProductIds);
  return {
    ...report,
    products: (report.products || []).map(product => compactProductForState(
      product,
      keepIds.has(compactText(product.productId))
    ))
  };
}

function normalizedReportState(state = {}) {
  const reportState = state.reportState && typeof state.reportState === 'object'
    ? state.reportState
    : {};
  const reportGeneratedAt = state.report?.generatedAt || '';
  const latestJob = Array.isArray(state.jobs) ? state.jobs[0] : null;
  const failedAfterReport = latestJob?.status === 'failed'
    && (!reportGeneratedAt || Date.parse(latestJob.completedAt || latestJob.startedAt || 0) > Date.parse(reportGeneratedAt || 0));
  return {
    stale: Boolean(reportState.stale || failedAfterReport),
    lastSuccessfulAt: reportState.lastSuccessfulAt || reportGeneratedAt,
    latestAttemptAt: reportState.latestAttemptAt || latestJob?.startedAt || '',
    reason: reportState.reason || (failedAfterReport ? latestJob.error || 'Останній scan не завершився.' : '')
  };
}

async function runWithSingleRetry(operation, {
  shouldRetry = () => false,
  onAttempt = () => {},
  delayMs = 0
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    onAttempt(attempt);
    try {
      return {
        value: await operation(attempt),
        attempt
      };
    } catch (error) {
      lastError = error;
      if (attempt >= 2 || !shouldRetry(error)) throw error;
      if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

class MerchantFeedRuntime {
  constructor({ projectRoot, statePath, policyPath, overridesPath } = {}) {
    this.projectRoot = path.resolve(projectRoot || process.cwd());
    this.statePath = statePath || path.join(this.projectRoot, 'merchant-feed-state.json');
    this.policyPath = policyPath || path.join(this.projectRoot, 'merchant-system', 'catalog-policy.json');
    this.overridesPath = overridesPath || path.join(this.projectRoot, 'merchant-system', 'feed-overrides.json');
    this.processes = new Map();
    this.recoverInterruptedJobs();
    this.compactStoredState();
  }

  readPolicy() {
    return normalizedCatalogPolicy(readJson(this.policyPath, DEFAULT_CATALOG_POLICY));
  }

  readOverrides() {
    const value = readJson(this.overridesPath, { version: 1, updatedAt: '', products: {} });
    return {
      version: 1,
      updatedAt: value.updatedAt || '',
      products: value.products && typeof value.products === 'object' ? value.products : {}
    };
  }

  writeOverrides(value) {
    writeJson(this.overridesPath, {
      version: 1,
      updatedAt: new Date().toISOString(),
      products: value.products && typeof value.products === 'object' ? value.products : {}
    });
  }

  applyFeedOverridesToProducts(products = []) {
    const overrides = this.readOverrides().products;
    return products.map(product => {
      const id = compactText(product.product_id || product.id);
      const override = overrides[id];
      if (!override) return product;
      return {
        ...product,
        ...(override.feed_title ? { feed_title: override.feed_title } : {}),
        ...(override.feed_description ? { feed_description: override.feed_description } : {})
      };
    });
  }

  readState() {
    const state = readJson(this.statePath, {
      version: 4,
      report: null,
      fixPlan: null,
      testBatch: null,
      writePreview: null,
      approvals: [],
      writeRuns: [],
      reportState: null,
      liveBridge: null,
      jobs: []
    });
    state.writePreview = state.writePreview || null;
    state.approvals = Array.isArray(state.approvals) ? state.approvals : [];
    state.writeRuns = Array.isArray(state.writeRuns) ? state.writeRuns : [];
    state.reportState = normalizedReportState(state);
    return state;
  }

  writeState(state) {
    const policy = this.readPolicy();
    writeJson(this.statePath, {
      version: 4,
      report: state.report ? compactReportForState(state.report, policy) : null,
      fixPlan: state.fixPlan || null,
      testBatch: state.testBatch || null,
      writePreview: state.writePreview || null,
      approvals: (state.approvals || []).slice(0, 30),
      writeRuns: (state.writeRuns || []).slice(0, 30),
      reportState: normalizedReportState(state),
      liveBridge: state.liveBridge || null,
      jobs: (state.jobs || []).slice(0, 20)
    });
  }

  compactStoredState() {
    const state = this.readState();
    const bytes = fs.existsSync(this.statePath) ? fs.statSync(this.statePath).size : 0;
    if (Number(state.version || 0) < 4 || bytes > 1024 * 1024) {
      this.writeState(state);
    }
  }

  recoverInterruptedJobs() {
    const state = this.readState();
    let changed = false;
    state.jobs = (state.jobs || []).map(job => {
      if (job.status !== 'running') return job;
      changed = true;
      return {
        ...job,
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: 'Scan перервано перезапуском сервера. Запустіть повторно.'
      };
    });
    if (changed) {
      state.reportState = {
        ...normalizedReportState(state),
        stale: Boolean(state.report),
        reason: 'Scan перервано перезапуском сервера. Запустіть повторно.'
      };
      this.writeState(state);
    }
  }

  dashboard({ liveBridge = null, connectorVerification = {} } = {}) {
    const state = this.readState();
    const resolvedLiveBridge = liveBridge || state.liveBridge || null;
    const reportState = normalizedReportState(state);
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      rulesVersion: GOOGLE_RULES_VERSION,
      agents: MERCHANT_AGENTS,
      catalogPolicy: this.readPolicy(),
      report: state.report,
      fixPlan: state.fixPlan,
      testBatch: state.testBatch,
      writePreview: state.writePreview,
      approvals: state.approvals || [],
      writeRuns: state.writeRuns || [],
      remediationQueue: this.remediationQueue(state),
      reportState,
      liveBridge: resolvedLiveBridge,
      merchantApiIntelligence: buildMerchantApiIntelligence({
        report: state.report,
        fixPlan: state.fixPlan,
        reportState,
        connectorVerification,
        liveBridge: resolvedLiveBridge,
        policy: this.readPolicy()
      }),
      jobs: state.jobs || [],
      activeJob: (state.jobs || []).find(job => job.status === 'running') || null,
      safety: {
        readOnlyDefault: true,
        autoPublish: false,
        firstBatchLimit: 5,
        approvalWritesEnabled: true,
        merchantCenterPublish: false,
        allowedWriteTargets: ['opencart_brand', 'merchant_feed_override'],
        flow: 'scan → proposed fix → dry-run → approval → 5 products → readback → re-scan'
      }
    };
  }

  remediationQueue(state = this.readState()) {
    const planQueue = state.fixPlan?.queue || {};
    const latestRun = (state.writeRuns || [])[0] || null;
    return {
      remainingProducts: Number(planQueue.remainingProducts || 0),
      remainingChanges: Number(planQueue.remainingChanges || 0),
      byAction: planQueue.byAction || {},
      manualOnlyProducts: Number(planQueue.manualOnlyProducts || 0),
      completedBatches: (state.writeRuns || []).filter(run => run.status === 'completed').length,
      completedProducts: (state.writeRuns || []).reduce((sum, run) => sum + Number(run.completedProducts || 0), 0),
      currentBatchStatus: state.writePreview?.status || '',
      currentBatchProducts: Number(state.writePreview?.productCount || 0),
      latestRunStatus: latestRun?.status || '',
      continuous: true
    };
  }

  buildPreviewFromState(state, { productIds = [], limit = 5, autoGenerated = false } = {}) {
    const cappedLimit = Math.max(1, Math.min(5, Number(limit || 5)));
    const requested = Array.isArray(productIds)
      ? productIds.map(compactText).filter(Boolean).slice(0, cappedLimit)
      : [];
    const planItems = Array.isArray(state.fixPlan?.items) ? state.fixPlan.items : [];
    const byId = new Map(planItems.map(item => [compactText(item.productId), item]));
    const ordered = requested.length
      ? requested.map(id => byId.get(id)).filter(Boolean)
      : planItems
          .filter(item => item.writeProposals?.length)
          .sort((left, right) => {
            const priority = proposal => proposal.action === 'clear_invalid_gtin' ? 0
              : proposal.action === 'set_feed_description_override' ? 1
                : proposal.action === 'set_feed_title_override' ? 2
                  : 3;
            const leftPriority = Math.min(...left.writeProposals.map(priority));
            const rightPriority = Math.min(...right.writeProposals.map(priority));
            return leftPriority - rightPriority || left.score - right.score || left.name.localeCompare(right.name, 'uk');
          });
    const items = ordered
      .filter((item, index, rows) => item && rows.findIndex(row => row?.productId === item.productId) === index)
      .filter(item => item.writeProposals?.length)
      .slice(0, cappedLimit)
      .map(item => ({
        productId: compactText(item.productId),
        name: item.name,
        link: item.link,
        sourceFingerprint: item.sourceFingerprint,
        proposals: item.writeProposals
      }));
    if (!items.length) return null;
    const createdAt = new Date().toISOString();
    const previewCore = {
      reportGeneratedAt: state.report.generatedAt,
      bridgeVersion: state.liveBridge?.version || '',
      items
    };
    return {
      id: `merchant-preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: 'pending_approval',
      autoGenerated: Boolean(autoGenerated),
      productLimit: 5,
      productCount: items.length,
      changeCount: items.reduce((sum, item) => sum + item.proposals.length, 0),
      merchantCenterPublish: false,
      ...previewCore,
      fingerprint: fingerprint(previewCore)
    };
  }

  job(id) {
    return this.readState().jobs.find(job => job.id === id) || null;
  }

  startScan(loader) {
    const state = this.readState();
    const active = state.jobs.find(job => job.status === 'running');
    if (active) {
      const error = new Error('Merchant scan уже виконується.');
      error.status = 409;
      error.job = active;
      throw error;
    }
    const freeBytes = availableBytesForPath(this.statePath);
    if (Number.isFinite(freeBytes) && freeBytes < MIN_FREE_SPACE_BYTES) {
      const error = new Error(`Недостатньо місця для Merchant scan: вільно ${Math.round(freeBytes / 1024 / 1024)} МБ, потрібно щонайменше 100 МБ.`);
      error.status = 507;
      throw error;
    }
    const id = `merchant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date().toISOString();
    const job = {
      id,
      type: 'catalog_scan',
      status: 'running',
      readOnly: true,
      startedAt,
      completedAt: '',
      error: '',
      bridgeVersion: '',
      attempt: 1,
      pagesRead: 0,
      productsRead: 0
    };
    state.jobs.unshift(job);
    state.reportState = {
      ...normalizedReportState(state),
      stale: Boolean(state.report),
      latestAttemptAt: startedAt,
      reason: state.report ? 'Новий scan виконується; показано останній успішний звіт.' : ''
    };
    this.writeState(state);

    const updateProgress = progress => {
      const current = this.readState();
      const index = current.jobs.findIndex(item => item.id === id);
      if (index < 0 || current.jobs[index].status !== 'running') return;
      current.jobs[index] = {
        ...current.jobs[index],
        ...progress,
        attempt: Math.max(Number(current.jobs[index].attempt || 1), Number(progress.attempt || 1)),
        pagesRead: Math.max(Number(current.jobs[index].pagesRead || 0), Number(progress.pagesRead || 0)),
        productsRead: Math.max(Number(current.jobs[index].productsRead || 0), Number(progress.productsRead || 0))
      };
      if (progress.bridgeVersion) {
        current.liveBridge = {
          ...(current.liveBridge || {}),
          version: progress.bridgeVersion,
          checkedAt: new Date().toISOString()
        };
      }
      this.writeState(current);
    };

    const task = Promise.resolve()
      .then(() => loader({ onProgress: updateProgress }))
      .then(({ products = [], coverage = {}, source = 'opencart', bridgeVersion = '' } = {}) => {
        const policy = this.readPolicy();
        const productsWithOverrides = this.applyFeedOverridesToProducts(products);
        const normalized = productsWithOverrides.map(product => validateMerchantProduct(product, coverage, policy))
          .sort((left, right) => left.score - right.score || left.name.localeCompare(right.name, 'uk'));
        const report = {
          generatedAt: new Date().toISOString(),
          source,
          rulesVersion: GOOGLE_RULES_VERSION,
          coverage,
          summary: summarizeProducts(normalized, coverage),
          products: normalized
        };
        const fixPlan = buildFixPlan(report, policy);
        const testBatch = buildTestBatch(report, policy);
        const current = this.readState();
        const index = current.jobs.findIndex(item => item.id === id);
        if (index >= 0) current.jobs[index] = {
          ...current.jobs[index],
          status: 'completed',
          completedAt: new Date().toISOString(),
          productCount: normalized.length,
          bridgeVersion: bridgeVersion || current.jobs[index].bridgeVersion || '',
          pagesRead: current.jobs[index].pagesRead || 0,
          productsRead: normalized.length,
          summary: report.summary
        };
        current.report = report;
        current.fixPlan = fixPlan;
        current.testBatch = testBatch;
        current.approvals = (current.approvals || []).map(approval => (
          approval.status === 'approved' && approval.reportGeneratedAt !== report.generatedAt
            ? { ...approval, status: 'invalidated_by_scan', invalidatedAt: new Date().toISOString() }
            : approval
        ));
        current.reportState = {
          stale: false,
          lastSuccessfulAt: report.generatedAt,
          latestAttemptAt: startedAt,
          reason: ''
        };
        current.liveBridge = {
          ...(current.liveBridge || {}),
          version: bridgeVersion || current.liveBridge?.version || '',
          checkedAt: new Date().toISOString(),
          supportsVariants: Boolean(coverage.variantFull)
        };
        current.writePreview = this.buildPreviewFromState(current, { limit: 5, autoGenerated: true });
        this.writeState(current);
        return report;
      })
      .catch(error => {
        const current = this.readState();
        const index = current.jobs.findIndex(item => item.id === id);
        if (index >= 0) current.jobs[index] = {
          ...current.jobs[index],
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: error.message
        };
        current.reportState = {
          ...normalizedReportState(current),
          stale: Boolean(current.report),
          latestAttemptAt: startedAt,
          reason: error.message
        };
        this.writeState(current);
      })
      .finally(() => this.processes.delete(id));
    this.processes.set(id, task);
    return job;
  }

  createFixPlan() {
    const state = this.readState();
    if (!state.report) throw new Error('Спочатку запустіть Merchant scan.');
    if (normalizedReportState(state).stale) {
      throw new Error('Dry-run заблоковано: показано застарілий звіт. Спочатку завершіть новий Merchant scan.');
    }
    state.fixPlan = buildFixPlan(state.report, this.readPolicy());
    this.writeState(state);
    return state.fixPlan;
  }

  createTestBatch() {
    const state = this.readState();
    const policy = this.readPolicy();
    if (!state.report) throw new Error('Спочатку запустіть Merchant scan.');
    if (normalizedReportState(state).stale) {
      throw new Error('Test batch заблоковано: показано застарілий звіт. Спочатку завершіть новий Merchant scan.');
    }
    if (policy.variantExportMode === 'split_by_package' && !state.report.coverage?.variantFull) {
      throw new Error('Test batch заблоковано: потрібен успішний scan із повними variant_options.');
    }
    state.testBatch = buildTestBatch(state.report, policy);
    this.writeState(state);
    return state.testBatch;
  }

  requireFreshWriteState(state = this.readState()) {
    if (!state.report) throw new Error('Спочатку запустіть Merchant scan.');
    if (normalizedReportState(state).stale) {
      throw new Error('Зміни заблоковано: звіт застарілий. Спочатку завершіть новий Merchant scan.');
    }
    const policy = this.readPolicy();
    if (policy.variantExportMode === 'split_by_package' && !state.report.coverage?.variantFull) {
      throw new Error('Зміни заблоковано: потрібен успішний scan із повними variant_options.');
    }
    return state;
  }

  createWritePreview({ productIds = [], limit = 5 } = {}) {
    const state = this.requireFreshWriteState();
    if (!state.fixPlan?.items?.length) state.fixPlan = buildFixPlan(state.report, this.readPolicy());
    const preview = this.buildPreviewFromState(state, { productIds, limit, autoGenerated: false });
    if (!preview) {
      throw new Error('Для вибраних товарів немає безпечних детермінованих змін. Неоднозначні поля залишено на ручну перевірку.');
    }
    state.writePreview = preview;
    this.writeState(state);
    return preview;
  }

  approveWritePreview({ previewId = '', confirmedBy = 'owner-ui' } = {}) {
    const state = this.requireFreshWriteState();
    const preview = state.writePreview;
    if (!preview || preview.id !== compactText(previewId)) {
      throw new Error('Актуальний preview змін не знайдено.');
    }
    if (preview.status !== 'pending_approval') {
      throw new Error('Цей preview вже погоджено або він більше не активний.');
    }
    if (Date.parse(preview.expiresAt || 0) <= Date.now()) {
      throw new Error('Preview прострочений. Створіть новий після актуального scan.');
    }
    if (preview.reportGeneratedAt !== state.report.generatedAt) {
      throw new Error('Після preview каталог змінився. Створіть новий preview.');
    }
    const expectedFingerprint = fingerprint({
      reportGeneratedAt: preview.reportGeneratedAt,
      bridgeVersion: preview.bridgeVersion,
      items: preview.items
    });
    if (expectedFingerprint !== preview.fingerprint) {
      throw new Error('Preview пошкоджено або змінено. Створіть його повторно.');
    }
    const approvedAt = new Date().toISOString();
    const approval = {
      id: `merchant-approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      previewId: preview.id,
      fingerprint: preview.fingerprint,
      reportGeneratedAt: preview.reportGeneratedAt,
      productCount: preview.productCount,
      changeCount: preview.changeCount,
      status: 'approved',
      approvedAt,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      confirmedBy: compactText(confirmedBy) || 'owner-ui',
      items: preview.items
    };
    state.writePreview = { ...preview, status: 'approved', approvalId: approval.id, approvedAt };
    state.approvals.unshift(approval);
    this.writeState(state);
    return approval;
  }

  async applyApprovedChanges({ approvalId = '', remoteExecutor } = {}) {
    let state = this.requireFreshWriteState();
    const approvalIndex = state.approvals.findIndex(item => item.id === compactText(approvalId));
    if (approvalIndex < 0) throw new Error('Погодження не знайдено.');
    const approval = state.approvals[approvalIndex];
    if (approval.status !== 'approved') throw new Error('Погодження вже використано або недійсне.');
    if (Date.parse(approval.expiresAt || 0) <= Date.now()) throw new Error('Погодження прострочене. Створіть новий preview.');
    if (approval.reportGeneratedAt !== state.report.generatedAt) {
      throw new Error('Після погодження каталог змінився. Потрібен новий scan і preview.');
    }
    if (approval.productCount > 5 || approval.items.length > 5) {
      throw new Error('Один погоджений batch не може містити більше 5 товарів.');
    }
    state.approvals[approvalIndex] = { ...approval, status: 'applying', startedAt: new Date().toISOString() };
    this.writeState(state);

    const results = [];
    for (const item of approval.items) {
      const proposalResults = [];
      const remoteProposals = item.proposals.filter(proposal => String(proposal.target || '').startsWith('opencart'));
      if (remoteProposals.length) {
        try {
          const remoteResults = await remoteExecutor(item, remoteProposals, approval);
          proposalResults.push(...(Array.isArray(remoteResults) ? remoteResults : []));
        } catch (error) {
          proposalResults.push(...remoteProposals.map(proposal => ({
            proposalId: proposal.id,
            action: proposal.action,
            target: proposal.target,
            ok: false,
            error: error.message
          })));
        }
      }

      const localProposals = item.proposals.filter(proposal => proposal.target === 'merchant_feed');
      if (localProposals.length) {
        try {
          const overrides = this.readOverrides();
          const current = overrides.products[item.productId] || {};
          const next = { ...current };
          localProposals.forEach(proposal => {
            if (proposal.action === 'set_feed_title_override') next.feed_title = proposal.after;
            if (proposal.action === 'set_feed_description_override') next.feed_description = proposal.after;
          });
          next.updatedAt = new Date().toISOString();
          next.approvalId = approval.id;
          overrides.products[item.productId] = next;
          this.writeOverrides(overrides);
          const readback = this.readOverrides().products[item.productId] || {};
          proposalResults.push(...localProposals.map(proposal => {
            const field = proposal.action === 'set_feed_title_override' ? 'feed_title' : 'feed_description';
            return {
              proposalId: proposal.id,
              action: proposal.action,
              target: proposal.target,
              ok: compactText(readback[field]) === compactText(proposal.after),
              readback: { field, value: readback[field] || '' }
            };
          }));
        } catch (error) {
          proposalResults.push(...localProposals.map(proposal => ({
            proposalId: proposal.id,
            action: proposal.action,
            target: proposal.target,
            ok: false,
            error: error.message
          })));
        }
      }
      results.push({
        productId: item.productId,
        name: item.name,
        status: proposalResults.length && proposalResults.every(result => result.ok) ? 'completed' : 'failed',
        proposals: proposalResults
      });
    }

    const completedProducts = results.filter(item => item.status === 'completed').length;
    const failedProducts = results.length - completedProducts;
    const status = failedProducts === 0 ? 'completed' : completedProducts ? 'partial_failed' : 'failed';
    const completedAt = new Date().toISOString();
    const run = {
      id: `merchant-write-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      approvalId: approval.id,
      previewId: approval.previewId,
      status,
      startedAt: state.approvals[approvalIndex].startedAt,
      completedAt,
      productCount: results.length,
      completedProducts,
      failedProducts,
      merchantCenterPublished: false,
      results
    };
    state = this.readState();
    const currentApprovalIndex = state.approvals.findIndex(item => item.id === approval.id);
    if (currentApprovalIndex >= 0) {
      state.approvals[currentApprovalIndex] = {
        ...state.approvals[currentApprovalIndex],
        status: status === 'completed' ? 'applied' : status,
        completedAt,
        writeRunId: run.id
      };
    }
    state.writeRuns.unshift(run);
    state.reportState = {
      ...normalizedReportState(state),
      stale: completedProducts > 0,
      reason: completedProducts > 0
        ? 'Погоджені зміни внесено. Виконується контрольний Merchant scan.'
        : 'Погоджені зміни не вдалося внести; попередній scan залишається актуальним.'
    };
    this.writeState(state);
    return run;
  }
}

module.exports = {
  GOOGLE_RULES_VERSION,
  GOOGLE_MERCHANT_AGENTIC_VERSION,
  MIN_FREE_SPACE_BYTES,
  DEFAULT_CATALOG_POLICY,
  MERCHANT_AGENTS,
  MERCHANT_API_AGENTIC_TOOLS,
  MERCHANT_FEED_RULE_ENGINE,
  MerchantFeedRuntime,
  cleanFeedDescription,
  cleanFeedDescriptionOverride,
  cleanFeedTitle,
  fingerprint,
  classifyVariantOption,
  buildVariantPolicy,
  buildWriteProposals,
  validateMerchantProduct,
  summarizeProducts,
  buildFixPlan,
  buildTestBatch,
  buildMerchantApiIntelligence,
  buildMerchantEvidenceGraph,
  compactReportForState,
  normalizedReportState,
  availableBytesForPath,
  runWithSingleRetry
};
