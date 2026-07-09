const cheerio = require('cheerio');

function cleanText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeArticle(value) {
  return cleanText(value).replace(/\s+/g, '').toUpperCase();
}

function supplierValue(value) {
  const text = cleanText(value);
  if (!text || /^[-—]+$/.test(text)) return '';
  return text;
}

function comparableValue(value) {
  let text = supplierValue(value)
    .toLowerCase()
    .replace(/[,;]/g, ',')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/^\d+(?:[.,]\d+)?$/.test(text)) {
    const num = Number(text.replace(',', '.'));
    if (Number.isFinite(num)) text = String(num);
  }
  return text;
}

function rowValue($row, selector) {
  return supplierValue($row.find(selector).first().text());
}

function moneyCandidate(value) {
  const text = supplierValue(value);
  if (!text) return '';
  const match = text.match(/\d{1,6}(?:[.,]\d{2})/);
  return match ? match[0].replace(',', '.') : '';
}

function priceValue($row, currency = 'uah') {
  const hiddenName = currency === 'usd' ? 'art_price_usd' : 'art_price_uah';
  const hidden = supplierValue($row.find(`input[name="${hiddenName}"]`).attr('value') || '');
  const hiddenPrice = moneyCandidate(hidden);
  if (hiddenPrice) return hiddenPrice;
  if (currency === 'usd') return '';

  const $priceCell = $row.find('.price-row-price').first();
  if (!$priceCell.length) return '';
  const visible = supplierValue($priceCell.find('.price-row-value').first().text() || $priceCell.text());
  return moneyCandidate(visible);
}

function detailValue($, $row, label) {
  let found = '';
  $row.find('.price-details-block').each((_, block) => {
    if (found) return;
    const $block = $(block);
    const title = cleanText($block.find('.price-details-title').text()).toLowerCase();
    if (title === label.toLowerCase()) {
      found = supplierValue($block.find('.price-details-value').text());
    }
  });
  return found;
}

function parseCoffeetonPriceHtml(html, options = {}) {
  const $ = cheerio.load(String(html || ''));
  const sourceUrl = options.sourceUrl || 'https://coffeeton.com/price/';
  const lots = [];
  const seen = new Set();

  $('.price-body .price-row').each((index, row) => {
    const $row = $(row);
    const rawArticle = $row.find('input[name="art_id"]').attr('value') || rowValue($row, '.price-row-id .price-row-value');
    const article = normalizeArticle(rawArticle);
    if (!article || seen.has(`${article}:${index}`)) return;
    seen.add(`${article}:${index}`);

    const priceUah = priceValue($row, 'uah');
    const priceUsd = priceValue($row, 'usd');
    const status = rowValue($row, '.price-row-status .price-status') || rowValue($row, '.price-row-status .price-row-value');

    lots.push({
      supplier: 'coffeeton',
      article,
      raw_article: supplierValue(rawArticle),
      country: rowValue($row, '.price-row-country .price-row-value'),
      quality: rowValue($row, '.price-row-grade .price-row-value'),
      processing: rowValue($row, '.price-row-process .price-row-value'),
      brewing: rowValue($row, '.price-row-brewing .price-row-value'),
      harvest_year: rowValue($row, '.price-row-year .price-row-value'),
      status,
      price_uah: priceUah,
      price_usd: priceUsd,
      coffee_type: detailValue($, $row, 'вид кави'),
      category: detailValue($, $row, 'категорія'),
      score: detailValue($, $row, 'score'),
      bag_weight: detailValue($, $row, 'вага 1 мішка'),
      region: detailValue($, $row, 'регіон'),
      variety: detailValue($, $row, 'різновид'),
      cup_profile: detailValue($, $row, 'профіль чашки/аромат'),
      farm: detailValue($, $row, 'ферма / кооператив / станція'),
      in_stock: /на\s+складі/i.test(status),
      expected: /очіку/i.test(status),
      source_url: sourceUrl
    });
  });

  return {
    ok: true,
    supplier: 'coffeeton',
    sourceUrl,
    fetchedAt: new Date().toISOString(),
    count: lots.length,
    lots
  };
}

function coffeetonLotToAttributes(lot = {}) {
  const map = [
    ['Постачальник', 'Coffeeton'],
    ['Артикул Coffeeton', lot.article],
    ['Країна походження', lot.country],
    ['Якість зерна', lot.quality],
    ['Спосіб обробки', lot.processing],
    ['Рекомендація', lot.brewing],
    ['Врожай', lot.harvest_year],
    ['Статус постачальника', lot.status],
    ['Вид кави', lot.coffee_type],
    ['Категорія', lot.category],
    ['Оцінка SCA', lot.score],
    ['Вага мішка', lot.bag_weight],
    ['Регіон', lot.region],
    ['Різновид', lot.variety],
    ['Смак', lot.cup_profile],
    ['Ферма', lot.farm],
    ['Ціна постачальника UAH/кг', lot.price_uah],
    ['Ціна постачальника USD/кг', lot.price_usd]
  ];

  const attrs = {};
  for (const [name, value] of map) {
    const clean = supplierValue(value);
    if (clean) attrs[name] = clean;
  }
  return attrs;
}

function diffAttributes(desired = {}, current = {}) {
  const changes = [];
  for (const [name, to] of Object.entries(desired)) {
    const from = current && Object.prototype.hasOwnProperty.call(current, name) ? current[name] : '';
    if (comparableValue(from) === comparableValue(to)) continue;
    changes.push({
      name,
      from: supplierValue(from),
      to: supplierValue(to),
      type: supplierValue(from) ? 'changed' : 'new'
    });
  }
  return changes;
}

function summarizeSupplierPreview(rows = []) {
  const summary = {
    total: rows.length,
    matched: 0,
    changed: 0,
    unchanged: 0,
    unmatched: 0,
    ambiguous: 0,
    changeCount: 0
  };

  for (const row of rows) {
    if (row.status === 'changed') {
      summary.changed += 1;
      summary.matched += 1;
    } else if (row.status === 'unchanged') {
      summary.unchanged += 1;
      summary.matched += 1;
    } else if (row.status === 'ambiguous') {
      summary.ambiguous += 1;
    } else {
      summary.unmatched += 1;
    }
    summary.changeCount += Array.isArray(row.changes) ? row.changes.length : 0;
  }

  return summary;
}

module.exports = {
  cleanText,
  normalizeArticle,
  parseCoffeetonPriceHtml,
  coffeetonLotToAttributes,
  diffAttributes,
  summarizeSupplierPreview
};
