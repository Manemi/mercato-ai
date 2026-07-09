#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const cheerio = require('cheerio');
const {
  cleanFeedDescriptionOverride,
  cleanFeedTitle,
  fingerprint,
  availableBytesForPath,
  MIN_FREE_SPACE_BYTES
} = require('./runtime');

const DEFAULT_OUT_DIR = path.join(__dirname, 'clean-feed');
const DEFAULT_CURRENT_FEED_URL = 'https://mercato.com.ua/price/google.xml';

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  return process.argv[index + 1] || fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function positiveIntArg(name, fallback) {
  const value = Number(argValue(name, ''));
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function readEnv(filePath = path.join(__dirname, '..', '.env')) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2];
  }
  return env;
}

function fetchText(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      timeout: timeoutMs,
      headers: {
        Accept: 'application/json,application/xml,text/xml,text/plain,*/*',
        'User-Agent': 'MercatoCleanFeedDraft/1.0'
      }
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`HTTP ${response.statusCode} for ${new URL(url).origin}`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }
        resolve(body);
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error(`Timeout after ${timeoutMs}ms`));
    });
    request.on('error', reject);
  });
}

async function loadBridgeJson(filePath) {
  if (filePath) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const env = readEnv();
  if (!env.BRIDGE_URL || !env.BRIDGE_SECRET) {
    throw new Error('BRIDGE_URL або BRIDGE_SECRET не задано. Передайте --bridge /path/to/raw-bridge.json або заповніть .env.');
  }
  const url = new URL(env.BRIDGE_URL);
  url.searchParams.set('action', 'merchant_feed_audit_list');
  url.searchParams.set('secret', env.BRIDGE_SECRET);
  url.searchParams.set('page', '1');
  url.searchParams.set('limit', '200');
  return JSON.parse(await fetchText(url.toString(), 30000));
}

async function loadCurrentFeed(filePath) {
  if (filePath && fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8');
  if (hasArg('--skip-current')) return '';
  const url = argValue('--current-url', DEFAULT_CURRENT_FEED_URL);
  return fetchText(url, 30000);
}

function compactText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value = '') {
  return String(value || '')
    .replace(/&amp;quot;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&amp;apos;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripBadFeedFragments(value = '') {
  const sentenceBlockers = /(?:oai_citation|що треба звірити|розсинхрон|службов|внутрішн|google diagnostics|live\s+є|перевірте журнал|зроби однаковими|акці|знижк|промокод|безкоштовн|куп(ити|уйте|іть)|придба(ти|йте)|замовл|доставк|інтернет-магазин|telegram|напишіть|порада|прямо зараз|варта того|вже сьогодні|відкрийте|дозвольте собі|насолоджуйтесь|гарантован|справжнє задоволення|кращ(ий|а|е|і|их)|найкращ|чудов(ий|а|е|і|о)|ідеальн|розкішн|преміум|топ-вибір|найпопулярн|комерційно успішн|завоював визнання|представляємо|пристраст|незабутн|шедевр|перлин|алмаз|кохання|дівчин|олімп|зачаровує|заради цього|saeco|delonghi)/iu;
  const healthBlockers = /здоров['ʼ]?я|користь|оздоров|ліку|імуніт|детокс|схудн|антиоксидант|тонізуюч|підбадьор|концентрац|лікар|захвор|тиск|холестерин|цукор|мокротин|кашл|температур|горл|безсон|нервов|пухлин|набряк|допомаг|сприяє|боротьб/iu;
  return compactText(decodeHtmlEntities(value)
    .replace(/\[oai_citation:[^\]]+\]/giu, ' ')
    .replace(/\s*\|\s*/g, '. ')
    .replace(/https?:\/\/\S+|www\.\S+/giu, ' ')
    .replace(/Корисні розділи:[\s\S]*$/giu, ' ')
    .replace(/Інші товари:[\s\S]*$/giu, ' '))
    .split(/(?<=[.!?])\s+/)
    .map(compactText)
    .filter(Boolean)
    .filter(sentence => !sentenceBlockers.test(sentence))
    .filter(sentence => !healthBlockers.test(sentence))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedMatchText(value = '') {
  return compactText(value)
    .toLocaleLowerCase('uk-UA')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function productTitleTokens(product) {
  const title = normalizedMatchText(titleWithCanonicalWeight(product));
  const stopWords = new Set([
    'кава', 'кавова', 'кавові', 'зернах', 'зернова', 'чай', 'чаю', 'чорний',
    'зелений', 'червоний', 'білий', 'натуральний', 'бленд', 'суміш', 'mercato',
    'меркато', 'грамів', 'грам', 'подарунковий', 'набір'
  ]);
  const tokens = title
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 4)
    .filter(token => !/^\d+$/.test(token))
    .filter(token => !stopWords.has(token));
  return [...new Set(tokens)].slice(0, 8);
}

function descriptionLooksMatched(product, description = '') {
  const tokens = productTitleTokens(product);
  if (!tokens.length) return true;
  const haystack = normalizedMatchText(description);
  return tokens.some(token => haystack.includes(token));
}

function fallbackDraftDescription(product) {
  const title = titleWithCanonicalWeight(product) || 'Товар Mercato';
  const productType = compactText(product.product_type || 'кава та чай');
  const weight = shippingWeight(product)
    .replace(/\s+kg$/iu, ' кг')
    .replace(/\s+g$/iu, ' г');
  return compactText([
    `${title} — товар Mercato у категорії ${productType}.`,
    weight ? `Фасування: ${weight}.` : '',
    'Бренд: Mercato.'
  ].filter(Boolean).join(' '));
}

function cleanDraftDescription(product) {
  const raw = product.feed_description || product.description || product.meta_description || product.name || '';
  const cleaned = stripBadFeedFragments(cleanFeedDescriptionOverride(raw));
  const fallback = fallbackDraftDescription(product);
  const value = cleaned.length >= 140 && descriptionLooksMatched(product, cleaned) ? cleaned : fallback;
  if (value.length <= 2400) return value;
  const clipped = value.slice(0, 2400);
  const end = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf('!'), clipped.lastIndexOf('?'));
  return (end >= 900 ? clipped.slice(0, end + 1) : clipped).trim();
}

function normalizeUrl(value = '') {
  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return compactText(value).replace(/\/$/, '');
  }
}

function isRedirectStatus(statusCode) {
  return [301, 302, 303, 307, 308].includes(Number(statusCode));
}

function requestUrlStatus(url, {
  method = 'HEAD',
  timeoutMs = 12000,
  redirectLimit = 8,
  redirectCount = 0
} = {}) {
  const normalized = normalizeUrl(url);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return Promise.resolve({
      ok: false,
      url: normalized,
      statusCode: 0,
      error: 'invalid_url'
    });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return Promise.resolve({
      ok: false,
      url: normalized,
      statusCode: 0,
      error: 'unsupported_protocol'
    });
  }

  const client = parsed.protocol === 'http:' ? http : https;
  return new Promise(resolve => {
    const request = client.request(parsed, {
      method,
      timeout: timeoutMs,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)'
      }
    }, response => {
      const statusCode = Number(response.statusCode || 0);
      const location = response.headers.location;
      response.resume();
      response.on('end', () => {
        if (isRedirectStatus(statusCode) && location && redirectCount < redirectLimit) {
          const nextUrl = new URL(location, parsed).toString();
          requestUrlStatus(nextUrl, {
            method,
            timeoutMs,
            redirectLimit,
            redirectCount: redirectCount + 1
          }).then(resolve);
          return;
        }
        if ((statusCode === 405 || statusCode === 403) && method === 'HEAD') {
          requestUrlStatus(normalized, {
            method: 'GET',
            timeoutMs,
            redirectLimit,
            redirectCount: 0
          }).then(resolve);
          return;
        }
        resolve({
          ok: statusCode >= 200 && statusCode < 300,
          url: normalizeUrl(response.responseUrl || normalized),
          statusCode,
          error: ''
        });
      });
    });
    request.on('timeout', () => {
      request.destroy(new Error(`Timeout after ${timeoutMs}ms`));
    });
    request.on('error', error => {
      if (method === 'HEAD') {
        requestUrlStatus(normalized, {
          method: 'GET',
          timeoutMs,
          redirectLimit,
          redirectCount: 0
        }).then(resolve);
        return;
      }
      resolve({
        ok: false,
        url: normalized,
        statusCode: 0,
        error: error.message
      });
    });
    request.end();
  });
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

function pushWarning(item, warning) {
  if (!item.warnings.includes(warning)) item.warnings.push(warning);
}

const HARD_RU_TEXT_PATTERN = /(Купить|купить|черный|чёрный|зеленый|зелёный|молотый|зерновой|органическая|органический|кофе\b|кофейный|магазин|доставка|вкус и аромат|неповторимый вкус|настоящий вкус|русск|российск)/iu;
const LEGACY_TRANSLIT_URL_PATTERN = /(^|[-/])(cherny|chernyi|zeleny|zeleniy|travyanoy|fruktovy|kupit|kofe)([-/]|$)/iu;

async function resolveFinalProductLinks(items, {
  timeoutMs = 12000,
  concurrency = 8
} = {}) {
  const cache = new Map();
  await mapLimit(items, concurrency, async item => {
    const originalLink = normalizeUrl(item.link);
    item.source.originalLink = originalLink;
    if (!originalLink) {
      pushWarning(item, 'missing_source_link');
      return;
    }
    if (!cache.has(originalLink)) {
      cache.set(originalLink, requestUrlStatus(originalLink, { timeoutMs }));
    }
    const result = await cache.get(originalLink);
    item.source.finalLink = result.url || originalLink;
    item.source.linkStatusCode = result.statusCode || 0;
    item.source.linkResolutionError = result.error || '';
    if (result.ok && result.url) {
      const finalLink = normalizeUrl(result.url);
      if (finalLink && finalLink !== originalLink) {
        item.link = finalLink;
        pushWarning(item, 'link_resolved_redirect');
      }
    } else {
      pushWarning(item, 'landing_url_not_200');
    }
  });
  return items;
}

function duplicateValues(items, pick) {
  const seen = new Set();
  const duplicates = new Set();
  items.forEach(item => {
    const value = pick(item);
    if (!value) return;
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return [...duplicates];
}

function validateCleanFeedItems(items) {
  const duplicateIds = duplicateValues(items, item => item.id);
  const duplicateLinks = duplicateValues(items, item => item.link);
  const blockingIssues = [];
  const addIssue = (code, item, extra = {}) => {
    blockingIssues.push({
      code,
      id: item?.id || '',
      title: item?.title || '',
      link: item?.link || '',
      ...extra
    });
  };

  duplicateIds.forEach(id => addIssue('duplicate_id', items.find(item => item.id === id), { id }));
  duplicateLinks.forEach(link => addIssue('duplicate_link', items.find(item => item.link === link), { link }));

  items.forEach(item => {
    if (!item.id) addIssue('missing_id', item);
    if (!item.title) addIssue('missing_title', item);
    if (!item.description) addIssue('missing_description', item);
    if (!item.link || !/^https:\/\/mercato\.com\.ua\//iu.test(item.link)) addIssue('invalid_link_domain', item);
    if (!item.imageLink || !/^https?:\/\//iu.test(item.imageLink)) addIssue('missing_or_invalid_image_link', item);
    if (!['in_stock', 'out_of_stock', 'preorder', 'backorder'].includes(item.availability)) {
      addIssue('invalid_availability', item, { availability: item.availability });
    }
    if (!/^\d+\.\d{2} UAH$/u.test(item.price)) addIssue('invalid_price', item, { price: item.price });
    if (item.brand !== 'Mercato') addIssue('invalid_brand', item, { brand: item.brand });
    if (item.condition !== 'new') addIssue('invalid_condition', item, { condition: item.condition });
    if (!item.googleProductCategory) addIssue('missing_google_product_category', item);
    if (!item.shippingWeight) addIssue('missing_shipping_weight', item);
    if (item.warnings.includes('landing_url_not_200')) {
      addIssue('landing_url_not_200', item, {
        statusCode: item.source.linkStatusCode,
        error: item.source.linkResolutionError
      });
    }
    if (HARD_RU_TEXT_PATTERN.test(`${item.title} ${item.description}`)) {
      addIssue('hard_ru_text_in_feed', item);
    }
  });

  const legacyTranslitUrlSlugs = items
    .filter(item => LEGACY_TRANSLIT_URL_PATTERN.test(item.link))
    .map(item => ({
      id: item.id,
      title: item.title,
      link: item.link,
      hit: (item.link.match(LEGACY_TRANSLIT_URL_PATTERN) || [])[0] || ''
    }));

  return {
    productionReady: blockingIssues.length === 0,
    blockingIssues,
    legacyTranslitUrlSlugs
  };
}

function slugKey(value = '') {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').map(part => part.trim()).filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch {
    const parts = String(value || '').split('/').map(part => part.trim()).filter(Boolean);
    return parts[parts.length - 1] || '';
  }
}

function parseCurrentGoogleFeed(xml = '') {
  if (!xml.trim()) {
    return {
      entries: [],
      byUrl: new Map(),
      bySlug: new Map(),
      summary: {
        entries: 0,
        uniqueLinks: 0,
        shippingWeightPresent: 0,
        descriptionCssSuspects: 0,
        healthClaimSuspects: 0,
        ruLinks: 0
      }
    };
  }
  const $ = cheerio.load(xml, { xmlMode: true });
  const entries = $('entry').toArray().map((element, order) => {
    const get = selector => compactText($(element).find(selector).first().text());
    const description = get('g\\:description');
    const link = get('g\\:link');
    return {
      order,
      id: get('g\\:id'),
      title: decodeHtmlEntities(get('g\\:title')),
      link,
      normalizedLink: normalizeUrl(link),
      slug: slugKey(link),
      price: get('g\\:price'),
      availability: get('g\\:availability'),
      brand: get('g\\:brand'),
      category: get('g\\:google_product_category'),
      shippingWeight: get('g\\:shipping_weight'),
      description,
      descriptionLength: description.length,
      hasCss: /[{}]|@media|\.tab-|display\s*:|font-size|background|<style|&lt;style|CSS-змінні/iu.test(description),
      hasHealthClaim: /здоров|імуніт|ліку|антиоксидант|supplement|БАД/iu.test(description)
    };
  });
  const byUrl = new Map();
  const bySlug = new Map();
  entries.forEach(entry => {
    if (!byUrl.has(entry.normalizedLink)) byUrl.set(entry.normalizedLink, []);
    byUrl.get(entry.normalizedLink).push(entry);
    if (entry.slug) {
      if (!bySlug.has(entry.slug)) bySlug.set(entry.slug, []);
      bySlug.get(entry.slug).push(entry);
    }
  });
  const uniqueLinks = new Set(entries.map(entry => entry.normalizedLink).filter(Boolean));
  return {
    entries,
    byUrl,
    bySlug,
    summary: {
      entries: entries.length,
      uniqueLinks: uniqueLinks.size,
      shippingWeightPresent: entries.filter(entry => entry.shippingWeight).length,
      descriptionCssSuspects: entries.filter(entry => entry.hasCss).length,
      healthClaimSuspects: entries.filter(entry => entry.hasHealthClaim).length,
      ruLinks: entries.filter(entry => /\/ru\//iu.test(entry.link)).length
    }
  };
}

function sourceWeightGrams(product) {
  const value = Number(product.weight);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

function sourceWeightUnit(product) {
  const weightClassId = compactText(product.weight_class_id);
  const label = compactText(product.weight_class || product.weight_class_title || product.weight_unit || product.weight_unit_title).toLowerCase();
  if (weightClassId === '1' || /kg|кг|кілограм/iu.test(label)) return 'kg';
  if (weightClassId === '2' || /(^|\s)(g|гр|г|gram|грам)/iu.test(label)) return 'g';
  return 'g';
}

function shippingWeight(product) {
  const weight = sourceWeightGrams(product);
  if (!weight) return '';
  const rounded = Math.round(weight * 100) / 100;
  const unit = sourceWeightUnit(product);
  return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)} ${unit}`;
}

function sourcePrice(product) {
  const price = Number(product.price);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function formatPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return '';
  return `${price.toFixed(2)} UAH`;
}

function googleAvailability(value = '') {
  const raw = compactText(value).toLowerCase().replace(/\s+/g, '_');
  if (['in_stock', 'out_of_stock', 'preorder', 'backorder'].includes(raw)) return raw;
  if (raw === 'in_stock') return 'in_stock';
  if (raw === 'out_of_stock') return 'out_of_stock';
  return 'out_of_stock';
}

function googleCategory(product) {
  const titleName = `${product.name || ''} ${product.title || ''}`.toLowerCase();
  const productType = String(product.product_type || '').toLowerCase();
  const haystack = `${titleName} ${productType}`;
  if (/кавомаш|saeco|granbaristo|coffee maker|espresso machine|еспресо\s+машин/iu.test(haystack)) return '2422';
  if (/ча[йюя]|tea|matcha|матча|ройбуш|пуер|сенча|саусеп|ехінац/iu.test(titleName)) return '2073';
  if (/кав[аиоуоюі]|coffee|еспрес|арабік|робуст|blend|бленд/iu.test(titleName)) return '1868';
  if (/ча[йюя]|tea|matcha|матча|ройбуш|пуер|сенча|саусеп|ехінац/iu.test(productType)) return '2073';
  if (/кав[аиоуоюі]|coffee|еспрес|арабік|робуст|blend|бленд/iu.test(productType)) return '1868';
  return '412';
}

function titleWithCanonicalWeight(product) {
  const title = cleanFeedTitle(product.feed_title || product.title || product.name || '').slice(0, 150);
  if (googleCategory(product) === '2422') return title;
  const weight = sourceWeightGrams(product);
  if (!weight) return title;
  const unit = sourceWeightUnit(product);
  const compact = Number.isInteger(weight) ? String(weight) : String(weight).replace(/\.0+$/, '');
  if (new RegExp(`(^|\\D)${compact}\\s*(г|гр|g|кг|kg)`, 'iu').test(title)) return title;
  if (unit === 'g' && weight === 1000 && /(^|\D)1\s*(кг|kg)(\D|$)/iu.test(title)) return title;
  const suffix = unit === 'kg' ? `${compact} кг` : (weight === 1000 ? '1 кг' : `${compact} г`);
  return `${title} ${suffix}`.slice(0, 150);
}

function uniqueMpnSet(products) {
  const counts = new Map();
  products.forEach(product => {
    const mpn = compactText(product.mpn || product.model || product.sku);
    if (!mpn) return;
    counts.set(mpn, (counts.get(mpn) || 0) + 1);
  });
  return counts;
}

function cleanItem(product, currentFeed, mpnCounts) {
  const currentEntries = currentFeed.byUrl.get(normalizeUrl(product.link))
    || currentFeed.bySlug.get(slugKey(product.link))
    || [];
  const rawMpn = compactText(product.mpn || product.model || product.sku);
  const uniqueMpn = rawMpn && (mpnCounts.get(rawMpn) || 0) === 1;
  const gtin = compactText(product.gtin);
  const item = {
    id: `mrc-${compactText(product.product_id || product.id)}`,
    productId: compactText(product.product_id || product.id),
    title: titleWithCanonicalWeight(product),
    link: normalizeUrl(product.link),
    price: formatPrice(sourcePrice(product)),
    description: cleanDraftDescription(product),
    brand: 'Mercato',
    condition: 'new',
    imageLink: compactText(product.image_link),
    availability: googleAvailability(product.availability),
    googleProductCategory: googleCategory(product),
    productType: compactText(product.product_type),
    shippingWeight: shippingWeight(product),
    gtin,
    mpn: uniqueMpn ? rawMpn : '',
    identifierExists: gtin || uniqueMpn ? '' : 'no',
    source: {
      productId: product.product_id,
      status: product.status,
      quantity: product.quantity,
      sourceBrand: product.brand || product.manufacturer || '',
      weight: product.weight,
      weightClassId: product.weight_class_id,
      variantValueCount: Number(product.variant_value_count || 0),
      rawMpn,
      uniqueMpn: Boolean(uniqueMpn)
    },
    before: {
      matched: currentEntries.length > 0,
      entryCount: currentEntries.length,
      ids: currentEntries.map(entry => entry.id).slice(0, 8),
      prices: currentEntries.map(entry => entry.price).slice(0, 8),
      title: currentEntries[0]?.title || '',
      brand: currentEntries[0]?.brand || '',
      shippingWeight: currentEntries[0]?.shippingWeight || '',
      descriptionLength: currentEntries[0]?.descriptionLength || 0,
      descriptionHasCss: Boolean(currentEntries[0]?.hasCss),
      descriptionHasHealthClaim: Boolean(currentEntries[0]?.hasHealthClaim)
    },
    warnings: []
  };
  if (!item.shippingWeight) item.warnings.push('missing_source_weight');
  if (!item.price) item.warnings.push('missing_source_price');
  if (!item.imageLink) item.warnings.push('missing_source_image');
  if (!item.before.matched) item.warnings.push('not_found_in_current_google_xml');
  if (/ехінац|echin/iu.test(`${item.title} ${item.description}`)) {
    item.warnings.push('manual_policy_risk_echinacea');
  }
  if (!uniqueMpn && rawMpn) {
    item.warnings.push('source_mpn_not_unique_identifier_exists_no');
  }
  return item;
}

function xmlEscape(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(value = '') {
  return `<![CDATA[${String(value || '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

function buildGoogleXml(items) {
  const updated = new Date().toISOString();
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom" xmlns:g="http://base.google.com/ns/1.0">',
    '<title>Mercato clean canonical candidate</title>',
    '<link>https://mercato.com.ua/</link>',
    `<updated>${xmlEscape(updated)}</updated>`,
    '<!-- Production candidate generated by Mercato AI. Not connected to Merchant Center until owner approval. -->'
  ];
  items.forEach(item => {
    lines.push('<entry>');
    lines.push(`<g:id>${xmlEscape(item.id)}</g:id>`);
    lines.push(`<g:title>${xmlEscape(item.title)}</g:title>`);
    lines.push(`<g:description>${cdata(item.description)}</g:description>`);
    lines.push(`<g:link>${xmlEscape(item.link)}</g:link>`);
    lines.push(`<g:image_link>${xmlEscape(item.imageLink)}</g:image_link>`);
    lines.push(`<g:availability>${xmlEscape(item.availability)}</g:availability>`);
    lines.push(`<g:price>${xmlEscape(item.price)}</g:price>`);
    lines.push(`<g:brand>${xmlEscape(item.brand)}</g:brand>`);
    lines.push(`<g:condition>${xmlEscape(item.condition)}</g:condition>`);
    lines.push(`<g:google_product_category>${xmlEscape(item.googleProductCategory)}</g:google_product_category>`);
    if (item.productType) lines.push(`<g:product_type>${xmlEscape(item.productType)}</g:product_type>`);
    if (item.shippingWeight) lines.push(`<g:shipping_weight>${xmlEscape(item.shippingWeight)}</g:shipping_weight>`);
    if (item.gtin) lines.push(`<g:gtin>${xmlEscape(item.gtin)}</g:gtin>`);
    if (item.mpn) lines.push(`<g:mpn>${xmlEscape(item.mpn)}</g:mpn>`);
    if (item.identifierExists) lines.push(`<g:identifier_exists>${xmlEscape(item.identifierExists)}</g:identifier_exists>`);
    lines.push('</entry>');
  });
  lines.push('</feed>');
  return `${lines.join('\n')}\n`;
}

function previewMarkdown({ generatedAt, items, currentSummary, bridge }) {
  const previewItems = items.filter(item => item.before.matched).slice(0, 3);
  const list = previewItems.length ? previewItems : items.slice(0, 3);
  const lines = [
    '# Clean Google feed production candidate — перші 3 товари',
    '',
    `Згенеровано: ${generatedAt}`,
    '',
    'Режим: production candidate. У Google Merchant Center нічого не відправлено. OpenCart не змінено.',
    '',
    `Поточний google.xml: ${currentSummary.entries} entries, ${currentSummary.uniqueLinks} унікальних URL, ${currentSummary.shippingWeightPresent} з shipping_weight, ${currentSummary.descriptionCssSuspects} CSS-підозр у description.`,
    `Raw bridge: ${bridge.bridgeVersion || 'unknown'}, ${bridge.products?.length || 0} товарів.`,
    '',
    '## Було → Стане',
    ''
  ];
  list.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.title}`);
    lines.push('');
    lines.push('Було:');
    lines.push(`- entries у старому google.xml: ${item.before.entryCount || 0}`);
    lines.push(`- old IDs: ${item.before.ids.length ? item.before.ids.join(', ') : 'не знайдено'}`);
    lines.push(`- title: ${item.before.title || 'не знайдено'}`);
    lines.push(`- prices: ${item.before.prices.length ? item.before.prices.join(', ') : 'не знайдено'}`);
    lines.push(`- brand: ${item.before.brand || 'порожньо'}`);
    lines.push(`- shipping_weight: ${item.before.shippingWeight || 'немає'}`);
    lines.push(`- description length: ${item.before.descriptionLength || 0}; CSS: ${item.before.descriptionHasCss ? 'так' : 'ні'}`);
    lines.push('');
    lines.push('Стане:');
    lines.push(`- id: ${item.id}`);
    lines.push(`- title: ${item.title}`);
    lines.push(`- link: ${item.link}`);
    if (item.source.originalLink && item.source.originalLink !== item.link) {
      lines.push(`- source link: ${item.source.originalLink}`);
    }
    lines.push(`- price: ${item.price}`);
    lines.push(`- availability: ${item.availability}`);
    lines.push(`- brand: ${item.brand}`);
    lines.push(`- google_product_category: ${item.googleProductCategory}`);
    lines.push(`- shipping_weight: ${item.shippingWeight || 'НЕМАЄ — блокер'}`);
    lines.push(`- description length: ${item.description.length}; CSS: ${/[{}]|@media|font-size|CSS-змінні/iu.test(item.description) ? 'так' : 'ні'}`);
    if (item.warnings.length) lines.push(`- warnings: ${item.warnings.join(', ')}`);
    lines.push('');
    lines.push('Новий description preview:');
    lines.push('');
    lines.push(`> ${item.description.slice(0, 700)}${item.description.length > 700 ? '…' : ''}`);
    lines.push('');
  });
  return `${lines.join('\n')}\n`;
}

async function main() {
  const outDir = path.resolve(argValue('--out-dir', DEFAULT_OUT_DIR));
  const available = availableBytesForPath(outDir);
  if (Number.isFinite(available) && available < MIN_FREE_SPACE_BYTES) {
    throw new Error(`Недостатньо місця: ${Math.round(available / 1024 / 1024)} МБ, потрібно мінімум 100 МБ.`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const bridge = await loadBridgeJson(argValue('--bridge', ''));
  const currentFeed = parseCurrentGoogleFeed(await loadCurrentFeed(argValue('--current', '')));
  const products = Array.isArray(bridge.products) ? bridge.products : [];
  const active = products.filter(product => Number(product.status) === 1);
  const mpnCounts = uniqueMpnSet(active);
  const items = active
    .map(product => cleanItem(product, currentFeed, mpnCounts))
    .sort((left, right) => {
      const leftOrder = left.before.matched
        ? Math.min(...currentFeed.entries.filter(entry => entry.ids?.includes?.(left.id)).map(entry => entry.order))
        : Number.POSITIVE_INFINITY;
      const rightOrder = right.before.matched
        ? Math.min(...currentFeed.entries.filter(entry => entry.ids?.includes?.(right.id)).map(entry => entry.order))
        : Number.POSITIVE_INFINITY;
      const leftBefore = currentFeed.byUrl.get(left.link) || currentFeed.bySlug.get(slugKey(left.link)) || [];
      const rightBefore = currentFeed.byUrl.get(right.link) || currentFeed.bySlug.get(slugKey(right.link)) || [];
      const leftIndex = leftBefore[0]?.order ?? leftOrder;
      const rightIndex = rightBefore[0]?.order ?? rightOrder;
      return leftIndex - rightIndex || Number(left.productId) - Number(right.productId);
    });

  const linkResolutionEnabled = !hasArg('--no-resolve-links');
  if (linkResolutionEnabled) {
    await resolveFinalProductLinks(items, {
      timeoutMs: positiveIntArg('--link-timeout-ms', 20000),
      concurrency: positiveIntArg('--link-concurrency', 6)
    });
  }

  const generatedAt = new Date().toISOString();
  const validation = validateCleanFeedItems(items);
  const xml = buildGoogleXml(items);
  const summary = {
    generatedAt,
    mode: 'production_candidate',
    publishAllowed: false,
    source: {
      bridgeVersion: bridge.bridgeVersion || '',
      bridgeProducts: products.length,
      activeProducts: active.length,
      currentGoogleXml: currentFeed.summary
    },
    cleanFeed: {
      items: items.length,
      canonicalProductMode: true,
      allHavePrice: items.every(item => item.price),
      allHaveImage: items.every(item => item.imageLink),
      allHaveShippingWeight: items.every(item => item.shippingWeight),
      cssSuspects: items.filter(item => /[{}]|@media|font-size|CSS-змінні/iu.test(item.description)).length,
      tooLongDescriptions: items.filter(item => item.description.length > 5000).length,
      matchedOldFeedItems: items.filter(item => item.before.matched).length,
      linkMode: linkResolutionEnabled ? 'final_resolved_product_urls' : 'bridge_product_urls',
      resolvedRedirectLinks: items.filter(item => item.warnings.includes('link_resolved_redirect')).length,
      landingUrlErrors: items.filter(item => item.warnings.includes('landing_url_not_200')).length,
      productionReady: validation.productionReady,
      blockingIssueCount: validation.blockingIssues.length
    },
    warnings: {
      blockingIssues: validation.blockingIssues,
      legacyTranslitUrlSlugs: validation.legacyTranslitUrlSlugs,
      notFoundInOldFeed: items.filter(item => item.warnings.includes('not_found_in_current_google_xml')).length,
      resolvedRedirectLinks: items.filter(item => item.warnings.includes('link_resolved_redirect')).map(item => ({
        id: item.id,
        title: item.title,
        originalLink: item.source.originalLink,
        finalLink: item.link
      })),
      landingUrlErrors: items.filter(item => item.warnings.includes('landing_url_not_200')).map(item => ({
        id: item.id,
        title: item.title,
        link: item.link,
        statusCode: item.source.linkStatusCode,
        error: item.source.linkResolutionError
      })),
      echinaceaManualRisk: items.filter(item => item.warnings.includes('manual_policy_risk_echinacea')).map(item => ({
        id: item.id,
        title: item.title,
        link: item.link
      })),
      nonUniqueSourceMpn: items.filter(item => item.warnings.includes('source_mpn_not_unique_identifier_exists_no')).map(item => ({
        id: item.id,
        title: item.title,
        sourceMpn: item.source.rawMpn
      })),
      note: 'ID змінено на stable mrc-product_id, щоб не плодити варіантні entries через грамовку. Це production candidate; старий feed не вимикати до ручного approval і успішного fetch нового джерела.'
    },
    fingerprint: fingerprint(items.map(item => ({
      id: item.id,
      title: item.title,
      link: item.link,
      price: item.price,
      shippingWeight: item.shippingWeight,
      description: item.description
    })))
  };

  fs.writeFileSync(path.join(outDir, 'mercato-clean-google-candidate.xml'), xml);
  fs.writeFileSync(path.join(outDir, 'mercato-clean-google-draft.xml'), xml);
  fs.writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'preview-first-3.md'), previewMarkdown({
    generatedAt,
    items,
    currentSummary: currentFeed.summary,
    bridge
  }));
  console.log(JSON.stringify({
    ok: true,
    outDir,
    files: [
      'mercato-clean-google-draft.xml',
      'mercato-clean-google-candidate.xml',
      'summary.json',
      'preview-first-3.md'
    ],
    summary: summary.cleanFeed,
    warnings: {
      blockingIssues: summary.warnings.blockingIssues.length,
      legacyTranslitUrlSlugs: summary.warnings.legacyTranslitUrlSlugs.length,
      echinaceaManualRisk: summary.warnings.echinaceaManualRisk.length,
      nonUniqueSourceMpn: summary.warnings.nonUniqueSourceMpn.length,
      notFoundInOldFeed: summary.warnings.notFoundInOldFeed
    }
  }, null, 2));
  if (hasArg('--strict') && !validation.productionReady) {
    console.error(`Strict mode failed: ${validation.blockingIssues.length} blocking feed issue(s).`);
    process.exitCode = 2;
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
