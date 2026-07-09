process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-openai-key';
process.env.OPERATIONAL_DB_DISABLED = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');
const { OperationalStore } = require('../operational-store');
const { helpers } = require('../server');

test('coupon codes stay OpenCart-admin compatible', () => {
  for (let i = 0; i < 50; i += 1) {
    const code = helpers.generateCouponCode('MRC');
    assert.match(code, /^[A-Z0-9]{3,12}$/);
    assert.ok(code.length <= 12);
  }
});

test('first order popup guards visitor eligibility inputs', () => {
  assert.equal(helpers.normalizePhone('+38 (067) 123-45-67'), '380671234567');
  assert.equal(helpers.normalizePhone('067 123 45 67'), '380671234567');
  assert.equal(helpers.normalizePhone('0994503223'), '380994503223');
  assert.equal(helpers.normalizePhone('380994503223'), '380994503223');
  assert.equal(helpers.normalizePhone('994503223'), '');
  assert.equal(helpers.normalizePhone('123456789'), '');
  assert.equal(helpers.firstOrderPopupContactKey({ email: 'Client@Example.com' }), 'email:client@example.com');
  assert.equal(helpers.firstOrderPopupContactKey({ phone: '067 123 45 67' }), 'phone:380671234567');
  assert.equal(helpers.firstOrderPopupContactKey({ email: 'Client@Example.com', phone: '0994503223' }), 'phone:380994503223');

  assert.equal(helpers.firstOrderPopupPageExcluded('https://mercato.com.ua/checkout'), true);
  assert.equal(helpers.firstOrderPopupPageExcluded('https://mercato.com.ua/account/login'), true);
  assert.equal(helpers.firstOrderPopupPageExcluded('https://mercato.com.ua/horeca'), true);
  assert.equal(helpers.firstOrderPopupPageExcluded('https://mercato.com.ua/opt'), true);
  assert.equal(helpers.firstOrderPopupPageExcluded('https://mercato.com.ua/kava-v-zernah'), false);

  assert.deepEqual(helpers.firstOrderPopupUtmPayload({
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'brand',
    utm_content: 'banner',
    utm_term: 'kava',
    gclid: 'abc'
  }), {
    utm_source: 'google',
    utm_medium: 'cpc',
    utm_campaign: 'brand',
    utm_content: 'banner',
    utm_term: 'kava',
    gclid: 'abc'
  });
});

test('first order popup storefront script emits required dataLayer events', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'public/mercato-first-order-popup.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public/mercato-first-order-popup.css'), 'utf8');
  [
    'popup_view',
    'popup_close',
    'popup_submit',
    'first_discount_code_created',
    'first_discount_used',
    'second_discount_code_created',
    'second_discount_used',
    'add_to_cart',
    'begin_checkout',
    'purchase'
  ].forEach(eventName => assert.match(script, new RegExp(eventName)));
  assert.match(script, /scroll_40/);
  assert.match(script, /exit_intent/);
  assert.match(script, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(script, /api\/first-order-popup\/config/);
  assert.match(script, /normalizeUaPhone/);
  assert.match(script, /Введіть телефон у форматі/);
  assert.match(script, /name="email"/);
  assert.match(script, /name="phone"/);
  assert.match(css, /#c9622a/);
  assert.match(css, /#2b1d10/);
  assert.match(css, /rgba\(20, 16, 12, \.55\)/);
});

test('email safety blocks internal CRM language before sending', () => {
  const issues = helpers.emailDraftSafetyIssues({
    subject: 'Ваш decaf-профіль',
    body: 'CRM guard: сегмент retention, CTA після aftertaste.'
  });
  assert.ok(issues.length >= 4);
  assert.deepEqual(helpers.emailDraftSafetyIssues({
    body: 'Привіт, маєте свіжу каву в улюбленому смаку.'
  }), []);
});

test('email footer includes unsubscribe link and suppressed customers are blocked', () => {
  const link = helpers.emailUnsubscribeUrl('https://ai.mercato.test', 'track-1');
  assert.equal(link, 'https://ai.mercato.test/email/unsubscribe/track-1');
  const text = helpers.appendComplianceFooter('Доброго дня!', link);
  assert.match(text, /Відписатися від листів Mercato/);
  assert.match(text, /https:\/\/ai\.mercato\.test\/email\/unsubscribe\/track-1/);

  const spam = helpers.getSpamStatus({ email: 'client@example.com' }, new Set(['client@example.com']));
  assert.equal(spam.canEmail, false);
  assert.equal(spam.consentStatus, 'unsubscribed');
});

test('director decisions apply cooldowns and permanent dismissals', () => {
  const now = new Date();
  const entries = [{
    actionId: helpers.directorActionId('replenishment_due', 42),
    status: 'done',
    createdAt: now.toISOString()
  }];
  const active = helpers.activeDirectorDecisionForCustomer('replenishment_due', 42, entries);
  assert.equal(active.status, 'done');
  assert.equal(active.cooldownDays, 30);

  const dismissed = helpers.activeDirectorDecisionForCustomer('replenishment_due', 77, [{
    actionId: helpers.directorActionId('replenishment_due', 77),
    status: 'dismissed',
    createdAt: new Date(now.getTime() - 365 * 86400000).toISOString()
  }]);
  assert.equal(dismissed.permanent, true);
});

test('publish attributes keep taste textual and clamp profile scales', () => {
  const attrs = helpers.sanitizeOpenCartPublishAttributes({
    'Смак': 'зелене яблуко, виноград',
    'Кислотність': '12/10',
    'Солодкість': '-2',
    'Тіло': '7.5',
    'Післясмак': '6',
    'Оцінка SCA': '107'
  }, { productName: 'Кава Колумбія Supremo' });

  assert.equal(attrs['Смак'], 'зелене яблуко, виноград');
  assert.equal(attrs['Кислотність'], '10');
  assert.equal(attrs['Солодкість'], '0');
  assert.equal(attrs['Тіло'], '7.5');
  assert.equal(attrs['Оцінка SCA'], '100');
});

test('coffee product type wins over tea-like flavor notes', () => {
  assert.equal(
    helpers.productCategoryName('Кава Мексика Maragogype', 'coffee'),
    'Кава'
  );

  const generated = helpers.mergeMercatoGeneratedAttributes({
    'Смак': 'яблуко, білий чай',
    'Тип чаю': 'білий чай',
    'Тип кави': 'альтернативний кавовий зерновий продукт, чайний профіль',
    'Температура заварювання': '85°C',
    'Час настоювання': '2-3 хвилини',
    'Кількість настоїв': '1-2',
    'Кислотність': '6'
  }, {
    productName: 'Кава Мексика Maragogype',
    productType: 'coffee',
    origin: 'Мексика',
    region: 'Chiapas',
    processing: 'SHG, EP',
    flavors: 'яблуко, білий чай',
    brewing: 'гейзер, домашня кавомашина, френч-прес, фільтр'
  });

  assert.equal(generated['Категорія'], 'Кава');
  assert.equal(generated['Смак'], 'яблуко, білий чай');
  assert.equal(generated['Тип кави'], 'Кава в зернах');
  assert.equal(generated['Країна походження'], 'Мексика');
  assert.equal(generated['Регіон'], 'Chiapas');
  assert.equal(generated['Спосіб обробки'], 'SHG, EP');
  assert.equal(generated['Тип чаю'], undefined);
  assert.equal(generated['Температура заварювання'], undefined);
  assert.equal(generated['Час настоювання'], undefined);
  assert.equal(generated['Кількість настоїв'], undefined);

  const publishAttrs = helpers.sanitizeOpenCartPublishAttributes(generated, {
    type: 'product',
    productName: 'Кава Мексика Maragogype',
    productType: 'coffee',
    flavors: 'яблуко, білий чай'
  });

  assert.equal(publishAttrs['Категорія'], 'Кава');
  assert.equal(publishAttrs['Смак'], 'яблуко, білий чай');
  assert.equal(publishAttrs['Тип кави'], 'Кава в зернах');
  assert.equal(publishAttrs['Тип чаю'], undefined);
  assert.equal(publishAttrs['Температура заварювання'], undefined);
});

function plainProductText(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripMerchantExcluded(html) {
  return String(html || '').replace(/<div\b[^>]*data-merchant-feed-exclude="true"[\s\S]*?<\/div>/gi, ' ');
}

test('product descriptions are Google Merchant feed safe and varied by product facts', () => {
  const mexico = helpers.buildMercatoProductDescriptionHtml({
    productName: 'Кава Mexico Maragogype в зернах',
    productType: 'coffee',
    origin: 'Mexico',
    region: 'Chiapas',
    farm: 'Finca El Jardín',
    variety: 'Maragogype',
    processing: 'SHG, EP',
    harvestYear: '2025/2026',
    flavors: 'яблуко, білий чай',
    brewing: 'гейзер, домашня кавомашина, френч-прес, фільтр',
    keywords: 'кава mexico марагоджип'
  });
  const ethiopia = helpers.buildMercatoProductDescriptionHtml({
    productName: 'Кава Ethiopia Sidamo GR.2',
    productType: 'coffee',
    origin: 'Ethiopia',
    region: 'Sidamo',
    processing: 'washed',
    harvestYear: '2024',
    flavors: 'бергамот, лимон, квіти',
    brewing: 'фільтр, V60, аеропрес',
    keywords: 'кава ethiopia sidamo'
  });
  const mexicoText = plainProductText(stripMerchantExcluded(mexico));
  const ethiopiaText = plainProductText(stripMerchantExcluded(ethiopia));

  assert.match(mexico, /data-mercato-description="v2"/);
  assert.match(mexico, /data-merchant-feed-exclude="true"/);
  assert.match(mexico, /href="\/kava-v-zernah"/);
  assert.match(mexico, /Схожі розділи/);
  assert.doesNotMatch(mexico, /border-left:\s*4px solid #f59a2e|Смакові ноти:/i);
  assert.match(mexico, /<section style="border:1px solid #e5e7eb;border-radius:16px/);
  assert.match(mexico, /Походження і лот/);
  assert.match(mexicoText, /Деталі лота/i);
  assert.match(mexicoText, /Finca El Jardín, Chiapas|Chiapas.*Finca El Jardín/i);
  assert.match(mexicoText, /Сорт \/ різновид Maragogype/i);
  assert.match(mexicoText, /конкретне походження|характер лота/i);
  assert.doesNotMatch(mexicoText.slice(0, 320), /Смак:/i);
  assert.ok(mexicoText.length > 700);
  assert.ok(mexicoText.length <= 5000);
  assert.doesNotMatch(stripMerchantExcluded(mexico), /href=|https?:\/\/|Схожі розділи|Релевантні розділи/i);
  assert.doesNotMatch(mexicoText, /доставк|відправк|знижк|(^|\s)акці(я|ї|ю|єю|ях|йна|йний|йні|йну)|промокод|розпродаж|конкурент|SEO-коментар/i);
  assert.doesNotMatch(`${mexicoText}\n${ethiopiaText}`, /\b(Mexico|Ethiopia)\b/i);
  assert.match(mexicoText, /Мексика|Chiapas|яблуко|білий чай/i);
  assert.match(mexicoText, /Врожай 2025\/2026|Клас \/ підготовка|не спосіб обробки/i);
  assert.match(ethiopiaText, /Ефіопія|Sidamo|бергамот|лимон/i);
  assert.match(ethiopiaText, /Врожай 2024|Мита обробка|прозорішу кислотність/i);
  assert.doesNotMatch(`${mexicoText}\n${ethiopiaText}`, /варто обирати за характером|Обробка або тип|Ключова особливість|Профіль підходить|товар легше оцінювати|washed допомагає/i);
  assert.notEqual(mexicoText.slice(0, 240), ethiopiaText.slice(0, 240));
});

test('product processing explanations vary by real processing method', () => {
  const washed = plainProductText(stripMerchantExcluded(helpers.buildMercatoProductDescriptionHtml({
    productName: 'Кава Colombia Washed',
    productType: 'coffee',
    origin: 'Colombia',
    processing: 'washed',
    flavors: 'цитрус, карамель'
  })));
  const natural = plainProductText(stripMerchantExcluded(helpers.buildMercatoProductDescriptionHtml({
    productName: 'Кава Brazil Natural',
    productType: 'coffee',
    origin: 'Brazil',
    processing: 'natural',
    flavors: 'шоколад, ягоди'
  })));
  const formatOnly = plainProductText(stripMerchantExcluded(helpers.buildMercatoProductDescriptionHtml({
    productName: 'Кава Бурунді Kayanza в зернах',
    productType: 'coffee',
    origin: 'Бурунді',
    region: 'Kayanza',
    processing: 'в зернах',
    harvestYear: '2026',
    flavors: 'запечене яблуко, карамель, горіхи'
  })));

  assert.match(washed, /Мита обробка|чистішу чашку|прозорішу кислотність/i);
  assert.match(natural, /Натуральна обробка|більше солодкості|щільніше тіло|фруктовість/i);
  assert.match(formatOnly, /Формат\s+в зернах|Формат.*це формат товару/i);
  assert.doesNotMatch(formatOnly, /Обробка\s+в зернах|Обробка \/ підготовка\s+в зернах/i);
  assert.doesNotMatch(formatOnly, /Деталі лота|актуальність партії|опис краще оновити/i);
  assert.doesNotMatch(formatOnly.slice(0, 360), /купити\s*\|\s*Mercato|вказаний як факт партії|контекст партії/i);
  assert.match(formatOnly.slice(0, 420), /щоденного приготування|Формат у зернах|помел під свій метод|не привʼязуватися до одного рецепта/i);
  assert.doesNotMatch(`${washed}\n${natural}`, /washed допомагає зрозуміти, якою буде чашка/i);
  assert.notEqual(washed.match(/Обробка\s+(.+?)\s+Свіжість/s)?.[1], natural.match(/Обробка\s+(.+?)\s+Свіжість/s)?.[1]);
});

test('product country names are localized for Ukrainian search intent', () => {
  assert.equal(helpers.localizeCountryNamesUa('Кава Mexico Maragogype'), 'Кава Мексика Maragogype');
  assert.equal(helpers.localizeCountryNamesUa('Ethiopia Sidamo, Colombia Supremo, Brazil Santos'), 'Ефіопія Sidamo, Колумбія Supremo, Бразилія Santos');
  assert.equal(helpers.productFeedSafeLine('Coffee from Guatemala Huehuetenango and El Salvador'), 'Coffee from Гватемала Huehuetenango and Ель-Сальвадор');
});

test('publish guard blocks internal Organic Growth briefing from live content', () => {
  const bad = helpers.unsafePublishContentReasons({
    title: 'Подарунковий набір',
    metaDescription: 'Поясніть смаки, склад набору, кому підійде.',
    content: '<p>Сторінка має працювати як сторінка вибору.</p><h3>Що підсилюємо після аналізу конкурентів</h3>',
    attributes: {
      'SEO фокус': 'kava',
      'GSC CTR': '1.6%'
    }
  });
  assert.ok(bad.some(reason => reason.includes('має працювати')));
  assert.ok(bad.some(reason => reason.includes('аналіз конкурентів')));
  assert.ok(bad.some(reason => reason.includes('службові характеристики')));

  const cleanupOnly = helpers.unsafePublishContentReasons({
    content: '<p>Нормальний опис для покупця.</p>',
    attributes: {
      'SEO фокус': '',
      'GSC CTR': ''
    }
  });
  assert.deepEqual(cleanupOnly, []);
});

test('bridge form fallback can base64 large HTML fields', () => {
  const body = helpers.bridgeFormBody({
    title: 'SEO title',
    content: '<div>великий HTML опис</div>',
    attributes: { 'Смак': 'яблуко' }
  }, { base64Html: true });

  assert.equal(body.get('title_b64'), Buffer.from('SEO title', 'utf8').toString('base64'));
  assert.equal(body.get('content_b64'), Buffer.from('<div>великий HTML опис</div>', 'utf8').toString('base64'));
  assert.equal(body.get('attributes'), JSON.stringify({ 'Смак': 'яблуко' }));
});

test('publish diagnostics accept modern readback responses', () => {
  assert.equal(helpers.bridgeHasPublishDiagnostics({
    readback: { found: true, metaTitleExact: true, descriptionExact: true }
  }), true);
  assert.equal(helpers.bridgeHasPublishDiagnostics({
    language_id: 2,
    descriptionAffectedRows: 1,
    contentLength: 5000
  }), true);
  assert.equal(helpers.bridgeHasPublishDiagnostics({ ok: true }), false);
});

test('trust audit catches numeric taste notes and missing live scales', () => {
  const audit = helpers.buildProductConsistencyAudit({
    url: 'https://mercato.com.ua/kava-test',
    entry: {
      snapshot: {
        product_id: '1',
        name: 'Кава Test',
        attributes: {
          'Кислотність': '7',
          'Солодкість': '7.2',
          'Тіло': '7.5',
          'Фруктовість': '8',
          'Смак': 'яблуко, виноград'
        }
      }
    },
    livePage: {
      html: '<div class="spec-card"><div class="spec-profile-row"><span class="spec-profile-label">Кислотність</span><span class="spec-profile-value">7</span></div><div class="spec-profile-row"><span class="spec-profile-label">Солодкість</span><span class="spec-profile-value">7.2</span></div><div class="spec-profile-row"><span class="spec-profile-label">Тіло</span><span class="spec-profile-value">7.5</span></div><div class="spec-note">7.6</div></div>'
    }
  });

  assert.equal(audit.status, 'fail');
  assert.ok(audit.issues.some(issue => issue.code === 'live_notes_not_numeric'));
  assert.ok(audit.issues.some(issue => issue.code === 'live_profile_Фруктовість'));
});

test('operational SQLite store imports and reads action/email data', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mercato-store-'));
  const store = new OperationalStore({ rootDir: dir, dbPath: path.join(dir, 'ops.sqlite'), disabled: false });
  assert.equal(store.init(), true);
  store.importFromJson({
    actionLog: { entries: [{ id: 'a1', actionId: 'x', status: 'done', createdAt: '2026-05-23T10:00:00.000Z' }] },
    businessMemory: { events: [{ id: 'm1', actionId: 'x', status: 'started', createdAt: '2026-05-23T09:00:00.000Z' }], experiments: [], learnings: [] },
    emailTracking: { messages: [{ id: 'e1', to: 'test@example.com', status: 'smtp_accepted', createdAt: '2026-05-23T08:00:00.000Z' }] }
  });

  assert.equal(store.readActionLog().entries.length, 1);
  assert.equal(store.readBusinessMemory().events.length, 1);
  assert.equal(store.readEmailTracking().messages.length, 1);
  assert.equal(store.status().tables.email_messages, 1);
});

test('app v2 contracts produce workflow-first today and work items', () => {
  const payload = {
    source: 'customers_orders_fallback',
    trustSummary: { checked: 10, ok: 10, status: 'ok', skipped: 1 },
    directorMetrics: { done: 0, target: 5, readiness: 'Need 5 decisions' },
    emailIntelligence: { sent: 12, ordered: 1, revenueAfterCampaign: 500, publicTrackingConfigured: false },
    productMatrix: { summary: { seoHoles: 2, unmatchedPages: 3 } },
    productSeo: { measurement: { gsc: { summary: { clicks: 42 } } } },
    actions: [{
      id: 'a1',
      priority: 'high',
      title: 'Fix product',
      why: 'GSC opportunity',
      expectedImpact: '10 clicks',
      modules: ['SEO'],
      primaryAction: { label: 'Open', tab: 'generate', url: 'https://example.test/product' }
    }]
  };

  const items = helpers.apiWorkItemsFromPayload(payload, { decisionEntries: [] });
  assert.equal(items.length, 1);
  assert.equal(items[0].type, 'content');
  assert.equal(items[0].target.url, 'https://example.test/product');

  const today = helpers.apiTodayFromPayload(payload, {
    decisionEntries: [{
      id: 'route-1',
      actionId: 'director-router-content_strategy-1234567890',
      title: 'Спочатку визначити, що просувати',
      status: 'started',
      source: 'app_v2_owner_router',
      action: { workflow: 'content_strategy', skill: 'Content Strategy', route: { targetName: 'Кава Test' } },
      createdAt: '2026-05-26T08:00:00.000Z',
      createdAtLocal: '26.05.2026, 08:00'
    }]
  });
  assert.equal(today.primary.id, 'a1');
  assert.equal(today.readiness.sellable, false);
  assert.ok(today.readiness.issues.some(issue => issue.includes('Director decisions')));
  assert.ok(today.readiness.issues.some(issue => issue.includes('Public email tracking')));
  assert.equal(today.ownerRouter.recentRoutes.length, 1);
  assert.equal(today.ownerRouter.recentRoutes[0].workflow, 'content_strategy');
  assert.equal(today.ownerRouter.recentRoutes[0].statusLabel, 'почато');
});

test('app v2 demo readiness combines decisions trust publish and tracking gates', () => {
  const basePayload = {
    source: 'email_segments',
    trustSummary: { checked: 10, ok: 10, failed: 0, status: 'ok' },
    directorMetrics: { done: 5, target: 5, readiness: 'ready' },
    emailIntelligence: {
      sent: 20,
      opened: 8,
      clicked: 3,
      ordered: 2,
      revenueAfterCampaign: 1400,
      publicTrackingConfigured: true
    }
  };
  const decisionEntries = [{
    id: 'route-1',
    actionId: 'director-router-content_strategy-abcdef1234',
    title: 'Контент-стратегія',
    status: 'done',
    source: 'app_v2_owner_router',
    action: { workflow: 'content_strategy', skill: 'Content Strategy', route: { targetName: 'Кава Test' } },
    createdAt: '2026-05-26T08:00:00.000Z'
  }];

  const blocked = helpers.apiDemoReadinessFromPayload(basePayload, {
    decisionEntries,
    publishRuns: []
  });
  assert.equal(blocked.ready, false);
  assert.ok(blocked.blockers.some(gate => gate.id === 'publish-verification'));
  assert.equal(blocked.proof.tracking.publicTrackingConfigured, true);

  const ready = helpers.apiDemoReadinessFromPayload(basePayload, {
    decisionEntries,
    publishRuns: [{
      id: 'publish-1',
      status: 'published',
      dryRun: false,
      url: 'https://mercato.com.ua/kava-test',
      result: { verification: { ok: true, dbReadback: { ok: true } } },
      createdAt: '2026-05-26T09:00:00.000Z'
    }]
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.label, 'Можна показувати клієнту');
  assert.equal(ready.score, 100);
  assert.equal(ready.proof.publish.verified, 1);

  const readyWithOldFailed = helpers.apiDemoReadinessFromPayload(basePayload, {
    decisionEntries,
    publishRuns: [{
      id: 'publish-latest',
      status: 'published',
      dryRun: false,
      url: 'https://mercato.com.ua/kava-test',
      result: { verification: { ok: true, dbReadback: { ok: true } } },
      createdAt: '2026-05-26T10:00:00.000Z'
    }, {
      id: 'publish-old-failed',
      status: 'failed',
      dryRun: false,
      url: 'https://mercato.com.ua/old-test',
      result: { verification: { ok: false } },
      createdAt: '2026-05-20T10:00:00.000Z'
    }]
  });
  assert.equal(readyWithOldFailed.ready, true);
  assert.equal(readyWithOldFailed.proof.publish.failed, 1);
});

test('app v2 commercial value explains why a small business would buy it', () => {
  const payload = {
    source: 'email_segments',
    trustSummary: { checked: 12, ok: 12, failed: 0, status: 'ok' },
    directorMetrics: { done: 2, target: 5, readiness: 'needs more decisions' },
    emailIntelligence: {
      sent: 40,
      ordered: 3,
      revenueAfterCampaign: 2400,
      publicTrackingConfigured: false
    },
    customerIntelligence: {
      readyToBuy: 6,
      forecastRevenue: 7200,
      lists: {
        ready: [{ name: 'Олена П.', favoriteProduct: 'Кава Колумбія' }]
      }
    },
    productMatrix: {
      summary: { seoHoles: 4 },
      topOpportunities: [{
        status: 'snippet_ctr',
        label: 'CTR-дірка',
        name: 'Набори кави',
        url: 'https://mercato.com.ua/kava-nabory',
        action: 'Підсилити сторінку.',
        potentialRevenue: 900,
        gsc: { clicks: 38, impressions: 1165, ctr: 0.033, position: 5.6 }
      }]
    },
    productSeo: {
      measurement: {
        gsc: { summary: { clicks: 213, impressions: 11106 } }
      }
    },
    actions: [{
      id: 'seo-action',
      priority: 'high',
      title: 'Підсилити сторінку наборів кави',
      why: 'Google уже дає покази, але CTR можна підняти.',
      expectedImpact: 'Більше переходів без реклами.',
      modules: ['SEO'],
      primaryAction: { label: 'Відкрити', tab: 'organic', url: 'https://mercato.com.ua/kava-nabory' }
    }]
  };

  const commercial = helpers.apiCommercialValueFromPayload(payload, {
    decisionEntries: [],
    publishRuns: [{
      id: 'publish-1',
      status: 'published',
      dryRun: false,
      url: 'https://mercato.com.ua/kava-nabory',
      result: { verification: { ok: true, dbReadback: { ok: true } } }
    }]
  });

  assert.equal(commercial.positioning.mode, 'managed_pilot');
  assert.match(commercial.positioning.promise, /Щодня показує 1-3 конкретні дії/);
  assert.equal(commercial.summary.totalPipeline, 10500);
  assert.equal(commercial.summary.readyActions, 1);
  assert.equal(commercial.summary.verifiedPublish, 1);
  assert.equal(commercial.operatingModel.economics.mercatoPrice, '$25–100/міс');
  assert.match(commercial.operatingModel.economics.teamCost, /\$2 000–4 500/);
  assert.ok(commercial.operatingModel.roles.some(item => item.role === 'SEO-спеціаліст'));
  assert.ok(commercial.operatingModel.actionPriorityRule[0].label.includes('ризик відтоку'));
  assert.ok(commercial.valueCards.some(card => card.id === 'retention' && card.value === '6 людей'));
  assert.ok(commercial.blockers.some(item => item.includes('директорських рішень')));
  assert.ok(commercial.blockers.some(item => item.includes('tracking')));
});

test('app v2 operating model follows the product TZ for small ecommerce owners', () => {
  const oldBridgeUrl = process.env.BRIDGE_URL;
  const oldBridgeSecret = process.env.BRIDGE_SECRET;
  process.env.BRIDGE_URL = 'https://shop.test/mercato-bridge.php';
  process.env.BRIDGE_SECRET = 'secret';

  const model = helpers.apiOperatingModelFromPayload({
    source: 'email_segments',
    retention: {
      totals: { orders: 42, avgOrderValue: 900 },
      topProducts: [{ name: 'Кава Кенія AA', revenue: 12000, orders: 9 }]
    },
    businessBrain: {
      metrics: {
        revenue1d: 1000,
        revenue7d: 7000,
        revenue30d: 30000,
        orders1d: 1,
        orders7d: 8,
        orders30d: 31,
        avgOrderValue: 950
      }
    },
    customerIntelligence: { readyToBuy: 7, forecastRevenue: 6650 },
    productMatrix: { summary: { seoHoles: 3 } },
    productSeo: { measurement: { gsc: { summary: { clicks: 120, impressions: 4000 } } } },
    emailIntelligence: { sent: 12, publicTrackingConfigured: false }
  });

  assert.match(model.positioning.headline, /AI-команда/);
  assert.match(model.positioning.firstWow, /10 хвилин/);
  assert.equal(model.economics.teamCost, '$2 000–4 500/міс');
  assert.equal(model.economics.mercatoPrice, '$25–100/міс');
  assert.equal(model.dailyOverview.revenue7d, 7000);
  assert.equal(model.dailyOverview.topProducts[0].name, 'Кава Кенія AA');
  assert.deepEqual(model.actionPriorityRule.map(rule => rule.rank), [1, 2, 3, 4]);
  assert.ok(model.dataSources.some(source => source.id === 'opencart' && source.ok));
  assert.ok(model.dataSources.some(source => source.id === 'tracking' && !source.ok));

  if (oldBridgeUrl === undefined) delete process.env.BRIDGE_URL;
  else process.env.BRIDGE_URL = oldBridgeUrl;
  if (oldBridgeSecret === undefined) delete process.env.BRIDGE_SECRET;
  else process.env.BRIDGE_SECRET = oldBridgeSecret;
});

test('app v2 setup guide explains OpenCart onboarding before actions', () => {
  const oldBridgeUrl = process.env.BRIDGE_URL;
  const oldBridgeSecret = process.env.BRIDGE_SECRET;
  const oldSmtpHost = process.env.SMTP_HOST;
  const oldSmtpUser = process.env.SMTP_USER;
  const oldCommandKey = process.env.COMMAND_API_KEY;
  process.env.BRIDGE_URL = 'https://shop.test/mercato-bridge.php';
  process.env.BRIDGE_SECRET = 'secret';
  process.env.SMTP_HOST = 'smtp.test';
  process.env.SMTP_USER = 'mail@test';
  process.env.COMMAND_API_KEY = 'cmd';

  const guide = helpers.apiSetupGuideFromPayload({
    source: 'email_segments',
    bridgeWarning: '',
    productSeo: { measurement: { gsc: { summary: { clicks: 20, impressions: 300 } } } },
    emailIntelligence: { publicTrackingConfigured: false }
  });

  assert.equal(guide.platform, 'OpenCart');
  assert.ok(guide.steps.some(step => /bridge/i.test(step.title)));
  assert.ok(guide.steps.some(step => /Search Console/i.test(step.title)));
  assert.ok(guide.checks.some(check => check.id === 'platform' && check.ok));
  assert.ok(guide.checks.some(check => check.id === 'tracking' && !check.ok));
  assert.equal(guide.wizard.length, 5);
  assert.ok(guide.wizard.some(step => step.id === 'google'));
  assert.match(guide.nextStep, /Налаштуваннях/);
  assert.doesNotMatch(guide.nextStep, /PUBLIC_BASE_URL|TRACKING_BASE_URL|\.env/);

  const restore = (key, value) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore('BRIDGE_URL', oldBridgeUrl);
  restore('BRIDGE_SECRET', oldBridgeSecret);
  restore('SMTP_HOST', oldSmtpHost);
  restore('SMTP_USER', oldSmtpUser);
  restore('COMMAND_API_KEY', oldCommandKey);
});

test('app v2 first screen keeps small business operator positioning', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public/app-v2/js/app.js'), 'utf8');
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public/app-v2/index.html'), 'utf8');

  assert.match(appJs, /підприємц/i);
  assert.match(appJs, /SEO/);
  assert.match(appJs, /реклам/i);
  assert.match(appJs, /клієнт/i);
  assert.match(appJs, /Підключити сайт/);
  assert.match(appJs, /конкретні дії/);
  assert.match(appJs, /Реклама, конкуренти і UX/);
  assert.match(appJs, /Клієнтська памʼять/);
  assert.match(appJs, /Система має бачити сайт, клієнтів, замовлення, рекламу і аналітику/);
  assert.match(indexHtml, /AI-команда для підприємця/);
  assert.match(indexHtml, /План на сьогодні/);
  assert.match(indexHtml, /Безпека і доступи/);
  assert.match(appJs, /\$25–100\/міс/);
  assert.match(appJs, /\$2 000–4 500\/міс/);
  assert.match(appJs, /Command Center/);
  assert.match(appJs, /Product Matrix/);
  assert.match(appJs, /Customer Intelligence/);
  assert.match(appJs, /Gmail desktop/);
  assert.match(appJs, /data-email-subject-idea/);
  assert.match(appJs, /14 днів/);
  assert.match(appJs, /ризик відтоку > втрата трафіку > потенційний дохід > час виконання/);
  assert.match(appJs, /Щоденний огляд магазину/);
  assert.match(appJs, /Як підключити те, що ще не працює/);
  assert.match(appJs, /GA4_PROPERTY_ID/);
  assert.match(appJs, /GOOGLE_ADS_CUSTOMER_ID/);
  assert.match(appJs, /PUBLIC_BASE_URL/);
  assert.match(appJs, /const cardsHtml = list\.map/);
  assert.doesNotMatch(appJs, /\$\{list\.map/);
  assert.doesNotMatch(appJs, /і `\.env` змінні/);
  assert.doesNotMatch(appJs, /поточні `\.env`/);
  assert.match(indexHtml, /operator-v2-mvp-20260607/);
  assert.match(indexHtml, /manifest\.json/);
  assert.match(indexHtml, /mobile-bottom-nav/);
});

test('app v2 dashboard contract exposes command center pricing and actions', () => {
  const payload = {
    source: 'test',
    settings: { company: 'Mercato Test' },
    businessBrain: {
      metrics: {
        revenue1d: 1500,
        revenue7d: 9000,
        orders1d: 2,
        orders7d: 11,
        avgOrderValue: 800
      }
    },
    customerIntelligence: {
      readyToBuy: 2,
      forecastRevenue: 1600,
      lists: {
        ready: [{ name: 'Client One', avgOrderValue: 800, favoriteProduct: 'Кава', proposedOffer: 'Новий лот' }]
      }
    },
    productMatrix: {
      summary: { seoHoles: 3 },
      topOpportunities: [{ name: 'Кава Test', status: 'seo_hole', action: 'Оновити SEO', potentialRevenue: 1000 }]
    },
    productSeo: { measurement: { gsc: { summary: { clicks: 20, impressions: 300 } } } },
    actions: [{
      id: 'action-1',
      priority: 'high',
      title: 'Написати покупцям',
      why: 'Є сигнал повтору',
      expectedImpact: 'Повернення клієнтів',
      modules: ['Email']
    }]
  };
  const today = helpers.apiTodayFromPayload(payload);
  assert.equal(today.dashboardV2.topbar.title, 'Command Center');
  assert.equal(today.pricing.plans.length, 3);
  assert.equal(today.pricing.plans[0].price, '$25/міс');
  assert.ok(today.dashboardV2.metrics.some(metric => metric.id === 'sales_week'));
  assert.equal(today.dashboardV2.actionQueue[0].id, 'action-1');
  assert.equal(today.dashboardV2.attentionCustomers[0].name, 'Client One');
  assert.equal(today.dashboardV2.productsAttention[0].name, 'Кава Test');
});

test('app v2 runtime smoke renders command center without env template crash', async () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public/app-v2/index.html'), 'utf8');
  const dom = new JSDOM(indexHtml, {
    url: 'http://127.0.0.1:3000/app-v2/',
    pretendToBeVisual: true
  });
  const previous = {
    window: global.window,
    document: global.document,
    sessionStorage: global.sessionStorage,
    localStorage: global.localStorage,
    fetch: global.fetch,
    prompt: global.prompt,
    navigator: global.navigator
  };
  global.window = dom.window;
  global.document = dom.window.document;
  global.sessionStorage = dom.window.sessionStorage;
  global.localStorage = dom.window.localStorage;
  Object.defineProperty(global, 'navigator', {
    value: dom.window.navigator,
    configurable: true
  });
  global.prompt = () => '';
  global.fetch = async (input) => {
    const url = String(input);
    const json = (data) => Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(data))
    });
    if (url.includes('/api/today')) return json({
      ok: true,
      source: 'test',
      primary: { id: 'action-1', title: 'Перевірити клієнтів', why: 'Є сигнал', type: 'customer' },
      queue: [{ id: 'action-1', title: 'Перевірити клієнтів', why: 'Є сигнал', type: 'customer' }],
      pricing: helpers.appV2PricingModel(),
      dashboardV2: {
        topbar: { title: 'Command Center', subtitle: 'Стан магазину' },
        metrics: [{ id: 'sales_week', label: 'Продажі тиждень', value: '9 000 грн', delta: 'реальні OpenCart дані', tone: 'ok' }],
        actionQueue: [{ number: 1, id: 'action-1', title: 'Перевірити клієнтів', reason: 'Є сигнал', expectedResult: 'Повернення' }],
        attentionCustomers: [{ name: 'Client One', status: 'watch', reason: 'Медіанний цикл' }],
        seoTop: [{ name: 'Кава Test', score: 60, issue: 'meta' }],
        salesChart: [{ label: 'Пн', revenue: 1000 }, { label: 'Вт', revenue: 1200 }],
        productsAttention: [{ name: 'Кава Test', status: 'seo_hole', reason: 'Опис' }]
      },
      commercialValue: { summary: {}, operatingModel: helpers.apiOperatingModelFromPayload({ source: 'test' }) },
      operatingModel: helpers.apiOperatingModelFromPayload({ source: 'test' }),
      readiness: { issues: [] },
      metrics: {},
      ownerRouter: { recentRoutes: [] }
    });
    if (url.includes('/api/setup-guide')) return json({
      ok: true,
      platform: 'OpenCart',
      checks: [],
      steps: [],
      wizard: [
        { step: 1, id: 'platform', title: 'Платформа', body: 'OpenCart', status: 'done', result: 'ok' },
        { step: 2, id: 'connect', title: 'Підключення', body: 'Bridge', status: 'done', result: 'ok' },
        { step: 3, id: 'google', title: 'Google', body: 'GSC', status: 'active', result: 'todo' },
        { step: 4, id: 'profile', title: 'Профіль', body: 'SMTP', status: 'active', result: 'todo' },
        { step: 5, id: 'first-result', title: 'Перший результат', body: '3 дії', status: 'blocked', result: 'todo' }
      ]
    });
    if (url.includes('/api/work-items')) return json({ ok: true, items: [{ id: 'action-1', title: 'Перевірити клієнтів', type: 'customer', why: 'Є сигнал' }] });
    if (url.includes('/api/content-workbench')) return json({ ok: true, items: [] });
    if (url.includes('/api/customer-dna')) return json({ ok: true, summary: {}, customers: [], segments: [], lists: {}, email: {}, cadence: {}, communicationLog: [] });
    if (url.includes('/api/demo-readiness')) return json({ ok: true, issues: [] });
    if (url.includes('/monitoring/status')) return json({ ok: true, competitors: {}, ux: {} });
    if (url.includes('/api/products/matrix')) return json({ ok: true, matrix: { topOpportunities: [] }, topOpportunities: [] });
    return json({ ok: true });
  };

  try {
    const appUrl = pathToFileURL(path.join(__dirname, '..', 'public/app-v2/js/app.js')).href;
    await import(`${appUrl}?smoke=${Date.now()}`);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.match(dom.window.document.body.textContent, /Command Center/);
    assert.match(dom.window.document.body.textContent, /Синхронізовано/, dom.window.document.querySelector('#toast')?.textContent || '');
    assert.doesNotMatch(dom.window.document.body.textContent, /\.env is not a function/);
  } finally {
    global.window = previous.window;
    global.document = previous.document;
    global.sessionStorage = previous.sessionStorage;
    global.localStorage = previous.localStorage;
    global.fetch = previous.fetch;
    global.prompt = previous.prompt;
    Object.defineProperty(global, 'navigator', {
      value: previous.navigator,
      configurable: true
    });
    dom.window.close();
  }
});

test('app v3 shell is clean PWA-first and does not mount legacy workbench', () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public/app-v3/index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public/app-v3/js/app.js'), 'utf8');
  const appCss = fs.readFileSync(path.join(__dirname, '..', 'public/app-v3/app.css'), 'utf8');
  const swJs = fs.readFileSync(path.join(__dirname, '..', 'public/app-v3/sw.js'), 'utf8');
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  assert.match(indexHtml, /seo-growth-intelligence-v12-20260623/);
  assert.match(indexHtml, /\/app-v3\/app\.css/);
  assert.match(indexHtml, /\/app-v3\/js\/app\.js/);
  assert.match(indexHtml, /bottomNav/);
  assert.match(indexHtml, /manifest\.json/);
  assert.match(swJs, /mercato-ai-seo-growth-intelligence-v12-20260623/);
  assert.match(appJs, /id="importProductUrl"|Імпорт з URL/);
  assert.match(appJs, /apiFetch\('\/import-url'/);
  assert.match(appJs, /productFactsFromImport/);
  assert.match(serverJs, /cleanPath === '\/'|cleanPath === '\/app-v2'/);
  assert.match(swJs, /\/app-v3\/app\.css/);
  assert.match(appCss, /--primary: #1a56db/);
  assert.match(appCss, /\.topbar[\s\S]*background: #f5f7fb/);
  assert.match(serverJs, /'\.\/app'|\/app-v3/);

  const combined = `${indexHtml}\n${appJs}`;
  assert.doesNotMatch(combined, /view-workbench/);
  assert.doesNotMatch(combined, /legacyTabToView/);
  assert.doesNotMatch(combined, /view-modules/);
  assert.doesNotMatch(combined, /routeFocusPanel/);
  assert.doesNotMatch(combined, /moduleGroups/);
  assert.doesNotMatch(indexHtml, /app-v2/);
});

test('app v3 embeds Codex SEO Center with agent queue and approval-gated fixes', async () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public/app-v3/js/app.js'), 'utf8');
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const runtimeJs = fs.readFileSync(path.join(__dirname, '..', 'seo-system/runtime.js'), 'utf8');
  const {
    SeoCenterRuntime,
    SITE_PROFILES,
    SEO_BATCH_LIMITS,
    OFFICIAL_SEO_SOURCES,
    SEO_GROWTH_AGENTS,
    CONVERSION_OBJECTIVES,
    buildIntelligenceReport,
    normalizeAuditResult,
    classifySeoAction
  } = require('../seo-system/runtime');
  const { SEO_CHANGE_CAPABILITIES, buildSeoControlPlan } = require('../seo-system/control-plane');

  assert.match(appJs, /SEO-система|SEO Center/);
  assert.match(appJs, /\/api\/seo-center/);
  assert.match(appJs, /runWeeklySeo/);
  assert.match(appJs, /buildSeoFixPreview/);
  assert.match(appJs, /APPLY_SEO_CHANGES/);
  assert.match(serverJs, /new SeoCenterRuntime/);
  assert.match(serverJs, /app\.post\('\/api\/seo-center\/audits'/);
  assert.match(serverJs, /app\.post\('\/api\/seo-center\/weekly'/);
  assert.match(serverJs, /app\.post\('\/api\/seo-center\/intelligence-refresh'/);
  assert.match(serverJs, /app\.post\('\/api\/seo-center\/fix-preview'/);
  assert.match(serverJs, /app\.post\('\/api\/seo-center\/control-scan'/);
  assert.match(serverJs, /app\.post\('\/api\/seo-center\/agent-draft'/);
  assert.match(serverJs, /app\.post\('\/api\/seo-center\/preview-remove-changes'/);
  assert.match(serverJs, /app\.post\('\/api\/seo-center\/approve'/);
  assert.match(serverJs, /app\.post\('\/api\/seo-center\/apply'/);
  assert.match(serverJs, /app\.post\('\/api\/seo-center\/rollback'/);
  assert.match(serverJs, /SEO_APPROVAL_WORKFLOW_REQUIRED/);
  assert.match(serverJs, /groupSeoExecutionUnits/);
  assert.match(serverJs, /executeSeoUnit/);
  assert.match(serverJs, /chunksProcessed/);
  assert.match(serverJs, /seoAgentDraftOnPage/);
  assert.match(serverJs, /seoSyntheticOnPageDraftCandidates/);
  assert.match(serverJs, /page_audit_on_page_adapter/);
  assert.match(serverJs, /seoOnPageTaskFromIssue/);
  assert.match(serverJs, /seoMetaTitleBase/);
  assert.match(serverJs, /seoFallbackMetaDescription/);
  assert.match(serverJs, /seoMetaDescriptionFromDescription/);
  assert.match(serverJs, /seoFinalizeMetaDescription/);
  assert.match(serverJs, /candidatePoolMax/);
  assert.match(serverJs, /action\.category === 'on_page'/);
  assert.match(serverJs, /On-page Agent підготував точний diff/);
  assert.match(runtimeJs, /run_headless_audit\.py/);
  assert.match(runtimeJs, /run_skill_workflow\.py/);
  assert.match(runtimeJs, /automatic_after_approval/);
  assert.match(runtimeJs, /SEO_NORTH_STAR/);
  assert.match(runtimeJs, /buildRankingGoals/);
  assert.match(runtimeJs, /seoGoalAuditContext/);
  assert.match(runtimeJs, /auditState: 'running'/);
  assert.match(runtimeJs, /ownerNext/);
  assert.match(runtimeJs, /rankingGoals: buildRankingGoals/);
  assert.match(appJs, /Прочитати весь SEO-контур/);
  assert.match(appJs, /North Star SEO/);
  assert.match(appJs, /renderSeoRankingGoals/);
  assert.match(appJs, /data-seo-target/);
  assert.match(appJs, /data-seo-action-id/);
  assert.match(appJs, /Підготувати patch цієї сторінки/);
  assert.match(appJs, /Підготувати title\/meta\/H1 diff/);
  assert.match(appJs, /Оновити правила Google\/AI/);
  assert.match(appJs, /OAI-SearchBot/);
  assert.match(appJs, /Нехай агент прочитає джерело й підготує patch/);
  assert.match(appJs, /ROLLBACK_SEO_CHANGE/);
  assert.match(appJs, /id="seoBatchEntities"/);
  assert.match(appJs, /data-seo-batch-limit/);
  assert.match(appJs, /data-seo-preview-remove-selected/);
  assert.match(appJs, /function seoIsTechnicalTemplateChange/);
  assert.match(appJs, /seoIsTechnicalTemplateChange\(change\)\) return null/);
  assert.match(appJs, /Це не візуальний preview сторінки/);
  assert.match(appJs, /data-seo-preview-technical/);
  assert.match(appJs, /data-seo-select-technical-changes/);
  assert.match(appJs, /data-scroll-target="seoFixPreview"/);
  assert.match(appJs, /function scrollAppToTop/);
  assert.doesNotMatch(appJs, /href="#seoFixPreview"/);
  assert.equal(SEO_BATCH_LIMITS.defaultEntities, 25);
  assert.equal(SEO_BATCH_LIMITS.maxEntities, 50);
  assert.equal(SEO_BATCH_LIMITS.maxChanges, 100);
  assert.equal(SEO_BATCH_LIMITS.executionChunkSize, 5);
  assert.ok(SEO_CHANGE_CAPABILITIES.length >= 12);
  assert.ok(OFFICIAL_SEO_SOURCES.some(source => source.id === 'openai_crawlers' && source.watchTerms.includes('OAI-SearchBot')));
  assert.ok(OFFICIAL_SEO_SOURCES.some(source => source.id === 'google_ai_search'));
  assert.ok(SEO_GROWTH_AGENTS.some(agent => agent.id === 'policy_watcher' && agent.writeAccess === 'read_only'));
  assert.ok(SEO_GROWTH_AGENTS.some(agent => agent.id === 'ai_visibility' && agent.writeAccess === 'after_approval'));
  assert.ok(CONVERSION_OBJECTIVES.some(goal => goal.id === 'qualified_organic_sales'));
  const intelligence = buildIntelligenceReport({ siteId: 'mercato' });
  assert.equal(intelligence.operatingModel.approvalRequired, true);
  assert.equal(intelligence.operatingModel.autoPublish, false);
  assert.equal(intelligence.operatingModel.massContent, false);
  assert.ok(intelligence.tasks.some(task => /OAI-SearchBot/.test(task.issue + task.recommendedAction)));
  assert.ok(intelligence.tasks.some(task => /llms\.txt/.test(task.issue + task.recommendedAction) && /Google/.test(task.issue)));
  assert.equal(SITE_PROFILES.mercato.host, 'mercato.com.ua');
  assert.equal(SITE_PROFILES.prom3d.host, 'prom3d.com.ua');

  const normalized = normalizeAuditResult('mercato', 'full', {
    overall_score: 50,
    priority_issues: [
      { issue: 'Geo: No llms.txt file was detected.' },
      { issue: 'On_Page: The page exposes 0 H1 tag(s) instead of one clear primary heading.' }
    ]
  });
  assert.equal(normalized.score, 50);
  assert.equal(normalized.actionPlan[0].priority, 'later');
  assert.equal(normalized.actionPlan[1].priority, 'important');

  const executable = classifySeoAction({
    siteId: 'mercato',
    mode: 'page',
    target: 'https://mercato.com.ua/kava-v-zernah/test-product',
    issue: 'Meta description length (220) is outside the typical range.'
  });
  assert.equal(executable.agent, 'On-page Agent');
  assert.equal(executable.task, 'meta_description');
  assert.equal(executable.execution, 'automatic_after_approval');

  const aggregate = classifySeoAction({
    siteId: 'mercato',
    mode: 'full',
    target: 'https://mercato.com.ua/',
    issue: '61 page(s) have meta descriptions longer than 160 characters.'
  });
  assert.equal(aggregate.execution, 'manual');
  assert.match(aggregate.reasonManual, /масова зміна заблокована/i);

  const controlPlan = buildSeoControlPlan({
    bridgeVersion: '2026-06-30-seo-entity-readback-v34',
    fingerprint: 'inventory-1',
    products: [{
      id: 101,
      name: 'Кава Test',
      meta_title: '',
      meta_description: 'Опис '.repeat(50),
      meta_h1: '',
      description: '<p>Короткий опис</p>',
      descriptionLength: 14,
      descriptionSha1: 'desc-1',
      seo_keyword: '',
      status: 1,
      schema_marker: false,
      image: ''
    }],
    categories: [{
      id: 7,
      name: 'Кава в зернах',
      meta_title: 'Кава в зернах | Mercato',
      meta_description: 'Категорія кави в зернах.',
      meta_h1: 'Кава в зернах',
      description: '<p>Категорія кави в зернах з вибором походження.</p>',
      descriptionLength: 52,
      descriptionSha1: 'desc-2',
      seo_keyword: 'kava-v-zernah',
      status: 1
    }],
    information: [],
    files: [
      { path: '.htaccess', exists: true, writable: true, size: 900, sha1: 'file-1', kind: 'technical' },
      { path: 'llms.txt', exists: false, writable: true, size: 0, sha1: '', kind: 'technical' }
    ],
    technical: { bridgeCanWriteCodeFiles: true }
  });
  assert.equal(controlPlan.inventorySummary.entities, 2);
  assert.ok(controlPlan.proposals.some(item => item.executor === 'entity_patch' && item.field === 'meta_title'));
  assert.ok(controlPlan.proposals.some(item => item.executor === 'managed_schema'));
  assert.ok(controlPlan.proposals.some(item => item.executor === 'managed_schema' && item.entityType === 'category'));
  assert.ok(controlPlan.tasks.some(item => item.agent === 'Technical SEO Agent'));
  assert.ok(controlPlan.agents.every(agent => agent.readAccess === true));
  assert.ok(controlPlan.capabilities.some(item => item.id === 'cwv'));

  const brokenInternalLinksPlan = buildSeoControlPlan({
    bridgeVersion: '2026-06-30-seo-entity-readback-v34',
    fingerprint: 'inventory-broken-links',
    products: [{
      id: 202,
      name: 'Чай Test',
      meta_title: 'Чай Test | Mercato',
      meta_description: 'Тестовий чай Mercato.',
      meta_h1: 'Чай Test',
      description: '<!-- MERCATO_AI_INTERNAL_LINKS_START --><hr><h4>Корисні розділи Mercato</h4><ul><li><a href="https://mercato.com.ua/kava-v-zernah">Кава в зернах</a></li></ul><!-- MERCATO_AI_INTERNAL_LINKS_END -->',
      descriptionLength: 470,
      descriptionSha1: 'broken-links-only',
      seo_keyword: 'chai-test',
      status: 1,
      schema_marker: false,
      image: 'catalog/test.jpg'
    }],
    categories: [],
    information: [],
    files: [],
    technical: {}
  });
  assert.ok(brokenInternalLinksPlan.tasks.some(item =>
    item.agent === 'Content Quality Agent'
    && item.priority === 'critical'
    && /Опис зламаний/.test(item.issue)
  ));
  assert.ok(!brokenInternalLinksPlan.tasks.some(item => item.agent === 'Internal Linking Agent'));

  const productWithHealthyDescriptionPlan = buildSeoControlPlan({
    bridgeVersion: '2026-06-30-seo-entity-readback-v34',
    fingerprint: 'inventory-product-healthy-description',
    products: [{
      id: 203,
      name: 'Чай з нормальним описом',
      meta_title: 'Чай з нормальним описом | Mercato',
      meta_description: 'Тестовий чай Mercato з нормальним описом.',
      meta_h1: 'Чай з нормальним описом',
      description: `<p>${'Покупець бачить фактичний опис товару, смак, категорію, сценарій використання і чесні характеристики без службового SEO тексту. '.repeat(5)}</p>`,
      descriptionLength: 640,
      descriptionSha1: 'healthy-description',
      seo_keyword: 'chai-healthy-description',
      status: 1,
      schema_marker: false,
      image: 'catalog/test.jpg'
    }],
    categories: [],
    information: [],
    files: [],
    technical: {}
  });
  assert.ok(!productWithHealthyDescriptionPlan.tasks.some(item =>
    item.agent === 'Internal Linking Agent'
    && item.entityType === 'product'
  ));

  const seoTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-runtime-'));
  const seoStatePath = path.join(seoTempDir, 'seo-state.json');
  fs.writeFileSync(seoStatePath, JSON.stringify({
    version: 3,
    jobs: [{
      id: 'audit-1',
      siteId: 'mercato',
      mode: 'page',
      target: 'https://mercato.com.ua/kava-v-zernah/test-product',
      status: 'completed',
      completedAt: '2026-06-22T10:00:00.000Z',
      summary: { actionPlan: [executable] }
    }],
    fixPreviews: [],
    approvals: [],
    writeRuns: [],
    controlPlans: {},
    rollbacks: []
  }));
  const runtime = new SeoCenterRuntime({ projectRoot: seoTempDir, statePath: seoStatePath });
  const savedIntelligence = await runtime.refreshIntelligence({ siteId: 'mercato', fetchDocs: false });
  assert.equal(savedIntelligence.sourceCount, OFFICIAL_SEO_SOURCES.length);
  assert.equal(runtime.dashboard('mercato').intelligence.sourceCount, OFFICIAL_SEO_SOURCES.length);
  assert.equal(runtime.dashboard('mercato').intelligence.operatingModel.approvalRequired, true);
  const selected = runtime.selectFixActions({ siteId: 'mercato' });
  assert.equal(selected.length, 1);
  const preview = runtime.createFixPreview({
    siteId: 'mercato',
    actions: selected,
    changes: [{
      actionId: selected[0].id,
      target: selected[0].target,
      task: selected[0].task,
      before: 'Дуже довгий опис',
      after: 'Короткий опис',
      sourceFingerprint: 'source-1'
    }]
  });
  const approval = runtime.approveFixPreview({ previewId: preview.id, confirmedBy: 'test-owner' });
  const claimed = runtime.claimApproval(approval.id);
  assert.equal(claimed.preview.status, 'applying');
  const run = runtime.completeWriteRun({
    approvalId: approval.id,
    results: [{ actionId: selected[0].id, task: selected[0].task, ok: true }]
  });
  assert.equal(run.status, 'completed');
  assert.throws(() => runtime.claimApproval(approval.id), /вже використано/i);
  const savedPlan = runtime.saveControlPlan({ siteId: 'mercato', plan: controlPlan });
  assert.equal(savedPlan.source.bridgeVersion, '2026-06-30-seo-entity-readback-v34');
  assert.ok(runtime.fixQueue('mercato').summary.executable >= 1);
  assert.equal(runtime.action('mercato', controlPlan.proposals[0].id).id, controlPlan.proposals[0].id);
  const bulkProposals = Array.from({ length: 30 }, (_, index) => ({
    id: `bulk-${index + 1}`,
    agent: 'On-page Agent',
    category: 'on_page',
    priority: 'important',
    issue: `Meta title ${index + 1}`,
    impact: 'CTR',
    recommendedAction: 'Оновити title.',
    execution: 'automatic_after_approval',
    executor: 'entity_patch',
    entityType: 'product',
    entityId: index + 1,
    target: `https://mercato.com.ua/product-${index + 1}`,
    field: 'meta_title',
    task: 'meta_title',
    before: '',
    after: `Product ${index + 1} | Mercato`,
    sourceFingerprint: `source-${index + 1}`,
    status: 'open'
  }));
  runtime.saveControlPlan({
    siteId: 'mercato',
    plan: {
      ...controlPlan,
      generatedAt: new Date().toISOString(),
      proposals: bulkProposals,
      tasks: [],
      summary: {
        executable: bulkProposals.length,
        needsEvidenceOrEditor: 0,
        critical: 0,
        important: bulkProposals.length,
        byExecutor: { entity_patch: bulkProposals.length }
      }
    }
  });
  const defaultBulk = runtime.selectFixActions({ siteId: 'mercato', limit: 100 });
  const maxBulk = runtime.selectFixActions({ siteId: 'mercato', limit: 100, entityLimit: 50 });
  assert.equal(defaultBulk.length, 25);
  assert.equal(maxBulk.length, 30);
  const bulkPreview = runtime.createFixPreview({
    siteId: 'mercato',
    actions: defaultBulk.slice(0, 10),
    changes: defaultBulk.slice(0, 10).map(action => ({
      actionId: action.id,
      target: action.target,
      task: action.task,
      executor: action.executor,
      entityType: action.entityType,
      entityId: action.entityId,
      field: action.field,
      before: action.before,
      after: action.after,
      sourceFingerprint: action.sourceFingerprint
    }))
  });
  assert.equal(bulkPreview.entityCount, 10);
  assert.equal(bulkPreview.executionChunkSize, 5);
  assert.ok(bulkPreview.changes[0].changeKey);
  const filteredPreview = runtime.removeFixPreviewChanges({
    previewId: bulkPreview.id,
    changeKeys: [bulkPreview.changes[0].changeKey],
    removedBy: 'test-owner'
  });
  assert.equal(filteredPreview.removedCount, 1);
  assert.equal(filteredPreview.preview.actionCount, 9);
  assert.equal(filteredPreview.preview.entityCount, 9);
  assert.equal(filteredPreview.preview.status, 'pending_approval');
  assert.equal(filteredPreview.preview.removedChanges.length, 1);
  const rollback = runtime.recordRollback({ siteId: 'mercato', writeRunId: run.id, changeId: '55', result: { rolledBack: true } });
  assert.equal(rollback.status, 'completed');
  fs.rmSync(seoTempDir, { recursive: true, force: true });
});

test('seo on-page agent does not cut meta descriptions mid-word', () => {
  const unsafeLongDescription = 'Тут зібрані практичні матеріали про каву та чай: як обирати зерно, готувати напої вдома та в офісі, зберігати упаковку правильно та швидко переходити до потрібних товарів без зайвих кроків';
  assert.equal(
    helpers.seoMetaDescriptionFromDescription('Корисні статті', unsafeLongDescription),
    ''
  );

  const fallback = helpers.seoBuildOnPageValue('meta_description', {
    type: 'category',
    name: 'Корисні статті',
    meta_description: '&lt;p&gt;&lt;br&gt;&lt;/p&gt;',
    description: unsafeLongDescription
  });
  assert.match(fallback, /^Корисні статті в Mercato:/);
  assert.doesNotMatch(fallback, /зберіг\.$/i);
  assert.ok(fallback.length >= 70 && fallback.length <= 170);
});

test('app v3 startup coalesces command data and defers heavy secondary sync', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public/app-v3/js/app.js'), 'utf8');
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  assert.match(serverJs, /COMMAND_CENTER_CACHE_PATH/);
  assert.match(serverJs, /commandCenterPayloadInFlight/);
  assert.match(serverJs, /bridgePagesInFlight/);
  assert.match(serverJs, /serving last successful cache/);
  assert.match(appJs, /loadDeferredAppData/);
  assert.match(appJs, /const primaryError = errors\.find\(message => message\.startsWith\('today:'\)\)/);
  assert.match(appJs, /Основні дані недоступні/);

  const initialCalls = appJs.match(/const calls = \{([\s\S]*?)\n  \};\n\n  const entries/)?.[1] || '';
  assert.doesNotMatch(initialCalls, /emailSegments:/);
  assert.doesNotMatch(initialCalls, /matrix:/);
});

test('merchant feed agents scan deterministically and gate writes behind approval', async () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public/app-v3/js/app.js'), 'utf8');
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const bridgePhp = fs.readFileSync(path.join(__dirname, '..', 'mercato-bridge.php'), 'utf8');
  const merchantRuntimeJs = fs.readFileSync(path.join(__dirname, '..', 'merchant-system/runtime.js'), 'utf8');
  const mapiSkill = fs.readFileSync(path.join(__dirname, '..', '.agents/skills/mapi-developer-assistant/SKILL.md'), 'utf8');
  const mapiAgent = fs.readFileSync(path.join(__dirname, '..', '.codex/agents/merchant-api-diagnostics.toml'), 'utf8');
  const {
    MERCHANT_AGENTS,
    MERCHANT_API_AGENTIC_TOOLS,
    MERCHANT_FEED_RULE_ENGINE,
    MerchantFeedRuntime,
    cleanFeedDescriptionOverride,
    validateMerchantProduct,
    buildFixPlan,
    buildTestBatch,
    buildMerchantApiIntelligence,
    buildWriteProposals,
    compactReportForState,
    normalizedReportState,
    runWithSingleRetry
  } = require('../merchant-system/runtime');
  const coverage = {
    full: true,
    fields: ['description', 'price', 'image_link', 'image_width', 'image_height', 'brand', 'identifier_exists']
  };
  const decodedFeedDescription = cleanFeedDescriptionOverride('&lt;div&gt;&lt;style&gt;.x{color:red}&lt;/style&gt;&lt;p&gt;Кава з шоколадним профілем.&lt;/p&gt;&lt;/div&gt;');
  const merchantPolicySafeDescription = cleanFeedDescriptionOverride(
    'Чай Матча Органічна Mercato: Енергія та здоровʼя з Японії. Класичний цейлонський чорний чай з балансом між тонізуючим ефектом чорного чаю і свіжою цитрусовою ноткою. Підійде для сміливого початку дня, щоб підбадьорити розум, а також для моментів концентрації або спокійного відпочинку з книгою. Смак бергамота і чорного чаю. Корисні розділи https://mercato.com.ua/test'
  );
  assert.doesNotMatch(merchantPolicySafeDescription, /здоров|тонізую|підбадьор|концентрац|https?:\/\/|Корисні розділи/iu);
  assert.match(merchantPolicySafeDescription, /Смак бергамота і чорного чаю/);
  const ready = validateMerchantProduct({
    product_id: 1,
    sku: 'MRC-1',
    status: 1,
    quantity: 5,
    name: 'Кава Бразилія Santos в зернах',
    description: 'Свіжообсмажена кава з шоколадно-горіховим профілем.',
    url: 'https://mercato.com.ua/kava-brasilia-santos',
    image_link: 'https://mercato.com.ua/image/catalog/test.jpg',
    image_width: 800,
    image_height: 800,
    availability: 'in_stock',
    price: 420,
    price_currency: 'UAH',
    brand: 'Mercato',
    mpn: 'MRC-1',
    identifier_exists: true
  }, coverage);
  const limited = validateMerchantProduct({
    product_id: 2,
    model: 'MRC-2',
    status: 1,
    quantity: 4,
    name: 'Кава Guatemala',
    url: 'https://mercato.com.ua/kava-guatemala'
  }, {
    full: false,
    fields: ['product_id', 'name', 'status', 'quantity', 'model', 'url']
  });
  const plan = buildFixPlan({ products: [ready, limited] });
  const variantProduct = validateMerchantProduct({
    product_id: 107,
    id: '006F',
    offer_id: '006F',
    sku: '006F',
    model: '#4381',
    status: 1,
    quantity: 10,
    name: 'Кава Бленд "Форест"',
    description: 'Кава Mercato з шоколадним профілем.',
    link: 'https://mercato.com.ua/kava-forest',
    image_link: 'https://mercato.com.ua/image/catalog/forest.jpg',
    image_width: 900,
    image_height: 900,
    availability: 'in_stock',
    price: 384,
    price_currency: 'UAH',
    brand: '',
    option_count: 2,
    variant_options: [
      {
        product_option_id: 50,
        name: 'Фасування',
        type: 'select',
        required: true,
        values: [
          { product_option_value_id: 501, name: '100 г', final_price: 184, availability: 'in_stock' },
          { product_option_value_id: 502, name: '250 г', final_price: 384, availability: 'in_stock' },
          { product_option_value_id: 503, name: '1 кг', final_price: 1284, availability: 'in_stock' }
        ]
      },
      {
        product_option_id: 51,
        name: 'Помел',
        type: 'select',
        required: false,
        values: [
          { product_option_value_id: 510, name: 'У зернах', final_price: 384, price_delta: 0 },
          { product_option_value_id: 511, name: 'Для фільтра', final_price: 384, price_delta: 0 }
        ]
      }
    ],
    mpn: '#4381'
  }, {
    full: true,
    fields: ['description', 'price', 'image_link', 'image_width', 'image_height', 'brand', 'identifier_exists', 'variant_options']
  });
  const batch = buildTestBatch({ products: [variantProduct] });
  const invalidIdentifierProduct = validateMerchantProduct({
    product_id: 240,
    sku: '1000-DN',
    model: '1000-DN',
    status: 1,
    quantity: 3,
    name: 'Дегустаційний набір кави',
    description: `<p>${'Опис товару без вигаданих фактів. '.repeat(190)}</p><p>Релевантні розділи: https://mercato.com.ua/kava</p>`,
    link: 'https://mercato.com.ua/kava-degustacionnyy-nabor-8_x_100-gramm',
    image_link: 'https://mercato.com.ua/image/catalog/set.png',
    image_width: 900,
    image_height: 900,
    availability: 'in_stock',
    price: 1474,
    price_currency: 'UAH',
    brand: 'Mercato Group',
    gtin: 'Рекомендуем',
    mpn: '1000-DN',
    identifier_exists: true
  }, {
    full: true,
    variantFull: true,
    fields: ['description', 'price', 'image_link', 'image_width', 'image_height', 'brand', 'identifier_exists', 'variant_options']
  });
  const invalidProposals = buildWriteProposals(invalidIdentifierProduct, {
    confirmedBrand: 'Mercato',
    brandScope: 'all_products',
    brandConfirmedByOwner: true
  });
  const remediationPlan = buildFixPlan({ products: [variantProduct, invalidIdentifierProduct] }, {
    confirmedBrand: 'Mercato',
    brandScope: 'all_products',
    brandConfirmedByOwner: true
  });
  const fiveVariantProducts = ['107', '112', '249', '105', '176'].map((productId, index) => ({
    ...variantProduct,
    productId,
    name: `Тестовий товар ${index + 1}`,
    variantPolicy: {
      ...variantProduct.variantPolicy,
      itemGroupId: `mercato-${productId}`,
      feedItems: variantProduct.variantPolicy.feedItems.map((item, itemIndex) => ({
        ...item,
        id: `mercato-${productId}-${itemIndex + 1}`,
        item_group_id: `mercato-${productId}`
      }))
    }
  }));
  const fiveProductBatch = buildTestBatch({ products: fiveVariantProducts });
  const compact = compactReportForState({ products: [
    { ...variantProduct, source: { description: 'duplicate raw source' } },
    { ...ready, source: { description: 'duplicate raw source' } }
  ] });
  let retryCalls = 0;
  const retryResult = await runWithSingleRetry(async attempt => {
    retryCalls += 1;
    if (attempt === 1) {
      const error = new Error('timeout');
      error.code = 'BRIDGE_TIMEOUT';
      throw error;
    }
    return 'ok';
  }, {
    shouldRetry: error => error.code === 'BRIDGE_TIMEOUT'
  });
  const staleState = normalizedReportState({
    report: { generatedAt: '2026-06-20T01:00:00.000Z' },
    jobs: [{ status: 'failed', startedAt: '2026-06-20T02:00:00.000Z', completedAt: '2026-06-20T02:01:00.000Z', error: 'timeout' }]
  });
  const merchantTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'merchant-runtime-'));
  const merchantStatePath = path.join(merchantTempDir, 'state.json');
  const merchantPolicyPath = path.join(merchantTempDir, 'policy.json');
  fs.writeFileSync(merchantPolicyPath, JSON.stringify({
    confirmedBrand: 'Mercato',
    brandScope: 'all_products',
    brandConfirmedByOwner: true,
    firstBatchProductIds: ['107'],
    firstBatchLimit: 5
  }));
  fs.writeFileSync(merchantStatePath, JSON.stringify({
    version: 3,
    report: {
      generatedAt: '2026-06-20T01:00:00.000Z',
      coverage: { full: true, variantFull: true },
      products: [variantProduct]
    },
    reportState: {
      stale: true,
      lastSuccessfulAt: '2026-06-20T01:00:00.000Z',
      latestAttemptAt: '2026-06-20T02:00:00.000Z',
      reason: 'timeout'
    },
    jobs: []
  }));
  const staleRuntime = new MerchantFeedRuntime({
    projectRoot: merchantTempDir,
    statePath: merchantStatePath,
    policyPath: merchantPolicyPath
  });
  const freshStatePath = path.join(merchantTempDir, 'fresh-state.json');
  const overridesPath = path.join(merchantTempDir, 'feed-overrides.json');
  fs.writeFileSync(freshStatePath, JSON.stringify({
    version: 4,
    report: {
      generatedAt: '2026-06-20T03:00:00.000Z',
      coverage: { full: true, variantFull: true },
      products: [variantProduct]
    },
    reportState: {
      stale: false,
      lastSuccessfulAt: '2026-06-20T03:00:00.000Z',
      latestAttemptAt: '2026-06-20T03:00:00.000Z',
      reason: ''
    },
    liveBridge: {
      version: '2026-06-22-merchant-remediation-queue-v30',
      supportsVariants: true,
      supportsApprovedWrites: true,
      supportsRemediationQueue: true
    },
    approvals: [],
    writeRuns: [],
    jobs: []
  }));
  const writeRuntime = new MerchantFeedRuntime({
    projectRoot: merchantTempDir,
    statePath: freshStatePath,
    policyPath: merchantPolicyPath,
    overridesPath
  });
  const proposals = buildWriteProposals(variantProduct, writeRuntime.readPolicy());
  const preview = writeRuntime.createWritePreview({ limit: 5 });
  const approval = writeRuntime.approveWritePreview({ previewId: preview.id, confirmedBy: 'test-owner' });
  const writeRun = await writeRuntime.applyApprovedChanges({
    approvalId: approval.id,
    remoteExecutor: async (item, remoteProposals) => remoteProposals.map(proposal => ({
      proposalId: proposal.id,
      action: proposal.action,
      target: proposal.target,
      ok: true,
      readback: { brandExact: true },
      after: { product_id: item.productId, brand: proposal.after }
    }))
  });
  const limitedSummary = require('../merchant-system/runtime').summarizeProducts([limited], { full: false });

  assert.equal(MERCHANT_AGENTS.length, 9);
  assert.equal(decodedFeedDescription, 'Кава з шоколадним профілем.');
  assert.equal(ready.status, 'ready');
	  assert.equal(ready.score, 100);
	  assert.equal(variantProduct.brand, 'Mercato');
	  assert.equal(variantProduct.variantPolicy.status, 'canonical_product');
	  assert.equal(variantProduct.variantPolicy.variantExportMode, 'canonical_product');
	  assert.equal(variantProduct.variantPolicy.feedItems.length, 1);
	  assert.equal(variantProduct.variantPolicy.feedItems[0].id, '006F');
	  assert.equal(variantProduct.variantPolicy.feedItems[0].item_group_id, '');
	  assert.equal(variantProduct.variantPolicy.feedItems[0].sku, '006F');
	  assert.equal(variantProduct.variantPolicy.customizationOptions[0].name, 'Помел');
	  assert.equal(batch.selectedProducts, 1);
	  assert.equal(batch.feedItems, 1);
	  assert.equal(batch.publishAllowed, false);
	  assert.equal(batch.landingUrlsVerified, true);
  assert.ok(invalidIdentifierProduct.issues.some(issue => issue.code === 'invalid_gtin'));
  assert.ok(invalidProposals.some(proposal => proposal.action === 'clear_invalid_gtin'));
  assert.ok(invalidProposals.some(proposal => proposal.action === 'set_feed_description_override'));
  assert.ok(invalidProposals.some(proposal => proposal.action === 'set_brand'));
	  assert.equal(remediationPlan.queue.remainingProducts, 2);
	  assert.ok(remediationPlan.queue.remainingChanges >= 4);
	  assert.equal(fiveProductBatch.selectedProducts, 5);
	  assert.equal(fiveProductBatch.feedItems, 5);
	  assert.equal(fiveProductBatch.publishAllowed, false);
  const merchantIntelligence = buildMerchantApiIntelligence({
    report: { generatedAt: '2026-07-04T00:00:00Z', coverage: { full: true, variantFull: true }, summary: { active: 65, total: 74 }, products: [ready, variantProduct, invalidIdentifierProduct] },
    fixPlan: remediationPlan,
    reportState: { stale: false },
    connectorVerification: { merchant: { ok: true, message: 'Merchant API відповідає.' } },
    liveBridge: { version: '2026-07-01-seo-schema-readback-v35', supportsApprovedWrites: true }
  });
  assert.equal(MERCHANT_AGENTS.some(agent => agent.id === 'merchant-api-diagnostics'), true);
  assert.equal(MERCHANT_API_AGENTIC_TOOLS.some(tool => tool.id === 'mapi-developer-assistant'), true);
  assert.equal(MERCHANT_FEED_RULE_ENGINE.some(rule => rule.id === 'merchant-center-diagnostics'), true);
	  assert.equal(merchantIntelligence.readiness.merchantConnector, 'connected');
	  assert.equal(merchantIntelligence.variantExportMode, 'canonical_product');
	  assert.equal(merchantIntelligence.publishAllowed, false);
  assert.ok(merchantIntelligence.allowedMcpReadTools.includes('list_aggregate_product_statuses'));
  assert.ok(merchantIntelligence.blockedMcpToolsUntilApproval.includes('create_data_source'));
	  assert.ok(merchantIntelligence.evidenceGraph.sources.some(source => source.id === 'merchant_center' && source.status === 'connected'));
	  assert.equal(compact.products[0].source, undefined);
	  assert.equal(compact.products[0].variantPolicy.feedItems.length, 1);
  assert.equal(compact.products[1].source, undefined);
  assert.equal(compact.products[1].variantPolicy.feedItems, undefined);
  assert.equal(retryCalls, 2);
  assert.equal(retryResult.attempt, 2);
  assert.equal(retryResult.value, 'ok');
  assert.equal(staleState.stale, true);
  assert.equal(staleState.reason, 'timeout');
  assert.throws(() => staleRuntime.createFixPlan(), /застарілий звіт/);
  assert.throws(() => staleRuntime.createTestBatch(), /застарілий звіт/);
  assert.equal(proposals[0].action, 'set_brand');
  assert.equal(preview.productCount, 1);
  assert.equal(preview.changeCount, 1);
  assert.equal(approval.status, 'approved');
  assert.equal(writeRun.status, 'completed');
  assert.equal(writeRun.completedProducts, 1);
  assert.equal(writeRun.merchantCenterPublished, false);
  assert.equal(writeRuntime.readState().reportState.stale, true);
  assert.equal(limited.status, 'limited_scan');
  assert.ok(limited.issues.some(issue => issue.code === 'price_not_scanned'));
  assert.equal(limitedSummary.scoreAvailable, false);
  assert.equal(limitedSummary.averageScore, null);
  assert.equal(plan.publishAllowed, false);
  assert.match(appJs, /Merchant Feed Agents/);
  assert.match(appJs, /Сканувати весь каталог/);
	  assert.match(appJs, /Google Merchant Intelligence/);
	  assert.match(appJs, /Merchant Center diagnostics/);
	  assert.match(appJs, /merchant-api-diagnostics/);
	  assert.match(appJs, /refreshMerchantGoogleDiagnostics/);
	  assert.match(appJs, /Оновити Google diagnostics/);
	  assert.match(appJs, /Перепідключити Google OAuth/);
	  assert.match(appJs, /reconnectRequired/);
	  assert.match(serverJs, /app\.post\('\/api\/merchant-feed\/scan'/);
	  assert.match(serverJs, /app\.get\('\/api\/merchant-feed\/google-diagnostics'/);
	  assert.match(serverJs, /MERCHANT_GOOGLE_DIAGNOSTICS_PATH/);
	  assert.match(serverJs, /writeMerchantDiagnosticsFailure/);
	  assert.match(serverJs, /googleOAuthNeedsReconnect/);
	  assert.match(serverJs, /accountstatuses\/\$\{merchantId\}/);
	  assert.match(serverJs, /productstatuses\?maxResults=\$\{safeLimit\}/);
	  assert.match(serverJs, /datafeeds\?maxResults=50/);
	  assert.match(serverJs, /app\.post\('\/api\/merchant-feed\/fix-plan'/);
  assert.match(serverJs, /app\.post\('\/api\/merchant-feed\/test-batch'/);
  assert.match(serverJs, /app\.post\('\/api\/merchant-feed\/write-preview'/);
  assert.match(serverJs, /app\.post\('\/api\/merchant-feed\/approve'/);
  assert.match(serverJs, /app\.post\('\/api\/merchant-feed\/apply'/);
  assert.match(serverJs, /APPLY_MERCHANT_CHANGES/);
  assert.match(serverJs, /const limit = 50/);
  assert.match(serverJs, /MERCHANT_BRIDGE_TIMEOUT_MS \|\| 30000/);
  assert.match(serverJs, /runWithSingleRetry/);
  assert.match(serverJs, /seoVisibleDescriptionPlain/);
  assert.match(serverJs, /Internal Linking Agent заблоковано: внутрішні посилання не можна додавати замість фактичного опису/);
  assert.match(serverJs, /Internal Linking Agent заблоковано для товарних описів/);
  assert.match(bridgePhp, /merchant_feed_audit_list/);
  assert.match(bridgePhp, /2026-07-09-first-order-popup-v37-phone-guard/);
  assert.match(bridgePhp, /JSON_INVALID_UTF8_SUBSTITUTE/);
  assert.match(bridgePhp, /merchantVariantOptionsByProduct/);
  assert.match(bridgePhp, /merchant_apply_product_patch/);
  assert.match(bridgePhp, /merchant_feed_overrides/);
  assert.match(bridgePhp, /growth_contact_status/);
  assert.match(bridgePhp, /growth_order_complete/);
  assert.match(bridgePhp, /growthPhoneCandidates/);
  assert.match(bridgePhp, /coupon_contact_mismatch/);
  assert.match(bridgePhp, /seo_approved_fixes/);
  assert.match(bridgePhp, /seo_control_inventory/);
  assert.match(bridgePhp, /seo_apply_entity_patch/);
  assert.match(bridgePhp, /function readProductSnapshot[\s\S]*'description' => \$description/);
  assert.match(bridgePhp, /function seoEntityReadbackMatches/);
  assert.match(bridgePhp, /seo_apply_managed_schema/);
  assert.match(bridgePhp, /seo_apply_file_patch/);
  assert.match(bridgePhp, /seo_rollback_change/);
  assert.match(bridgePhp, /mercato_seo_change_log/);
  assert.match(bridgePhp, /APPLY_SEO_CHANGES/);
  assert.match(bridgePhp, /clear_invalid_gtin/);
  assert.match(bridgePhp, /feed_description/);
  assert.match(bridgePhp, /Brand readback mismatch/);
  assert.match(bridgePhp, /bridgeVersion.*BRIDGE_VERSION/s);
  assert.match(bridgePhp, /\$productColumns = tableColumnMeta\(\$db, PREFIX \. "product"\)/);
  assert.doesNotMatch(bridgePhp, /\$productColumns = tableColumns\(/);
  assert.doesNotMatch(bridgePhp, /merchantProductVariantOptions/);
  assert.match(appJs, /Підготувати 5 канонічних offerів/);
  assert.match(appJs, /buildMerchantTestBatch/);
  assert.match(appJs, /Підготувати batch змін/);
  assert.match(appJs, /Що далі після scan/);
  assert.match(appJs, /Не плодимо грамовки/);
  assert.match(appJs, /approveMerchantChanges/);
  assert.match(appJs, /applyMerchantChanges/);
	  assert.match(appJs, /Застарілий звіт/);
	  assert.match(appJs, /canonical-feed/);
	  assert.match(appJs, /Фасування не множимо у фіді/);
	  assert.match(appJs, /liveBridge\.supportsVariants/);
	  assert.match(merchantRuntimeJs, /variantExportMode: 'canonical_product'/);
	  assert.match(merchantRuntimeJs, /один OpenCart товар = один Merchant offer/);
	  assert.match(merchantRuntimeJs, /Dry-run заблоковано: показано застарілий звіт/);
  assert.match(merchantRuntimeJs, /Test batch заблоковано: потрібен успішний scan із повними variant_options/);
  assert.match(merchantRuntimeJs, /MIN_FREE_SPACE_BYTES = 100 \* 1024 \* 1024/);
  assert.match(merchantRuntimeJs, /Merchant API MCP Access Service/);
  assert.match(merchantRuntimeJs, /buildMerchantApiIntelligence/);
  assert.match(mapiSkill, /https:\/\/merchantapi\.googleapis\.com\/devdocs\/mcp\//);
  assert.match(mapiSkill, /Never use Merchant API `v1beta`/);
  assert.match(mapiAgent, /list_aggregate_product_statuses/);
  assert.match(mapiAgent, /Never invent GTIN/);
  fs.rmSync(merchantTempDir, { recursive: true, force: true });
});

test('app v3 runtime smoke renders command center and setup recipes without env crash', async () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public/app-v3/index.html'), 'utf8');
  const dom = new JSDOM(indexHtml, {
    url: 'http://127.0.0.1:3000/app-v3/',
    pretendToBeVisual: true
  });
  const previous = {
    window: global.window,
    document: global.document,
    fetch: global.fetch,
    navigator: global.navigator
  };
  global.window = dom.window;
  global.document = dom.window.document;
  Object.defineProperty(global, 'navigator', {
    value: dom.window.navigator,
    configurable: true
  });
  global.fetch = async (input) => {
    const url = String(input);
    const json = (data) => Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data))
    });
    if (url.includes('/api/today')) return json({
      ok: true,
      dashboardV2: {
        pricing: helpers.appV2PricingModel(),
        topbar: { title: 'Command Center', subtitle: 'Стан магазину', store: 'Mercato' },
        metrics: [
          { id: 'sales_week', label: 'Продажі тиждень', value: '9 030 грн', unit: 'виручка за 7 днів', delta: 'реальні OpenCart дані', tone: 'ok' },
          { id: 'orders_today', label: 'Замовлення сьогодні', value: '1', unit: 'зам.', delta: '4 за 7 днів', tone: 'ok' },
          { id: 'customers_attention', label: 'Покупці під увагою', value: '3', unit: 'клієнтів', delta: '4 500 грн прогноз', tone: 'warn' },
          { id: 'products_without_seo', label: 'Товари без SEO', value: '2', unit: 'пріоритети', delta: '42 кліки GSC', tone: 'warn' }
        ],
        actionQueue: [
          { number: 1, id: 'action-1', title: 'Повернути клієнта', reason: 'Цикл покупки відхилився від медіани.', expectedResult: 'Персональний лист без автосенду.', priority: 'high', type: 'email', cta: 'Підготувати' }
        ],
        attentionCustomers: [{ id: 'c1', name: 'Client One', status: 'risk', reason: 'Медіанний цикл 52 дні, зараз 88.', avgOrderValue: 900 }],
        seoTop: [{ id: 'seo-1', name: 'Кава Test', score: 44, issue: 'Низький CTR', url: 'https://example.test/kava' }],
        salesChart: [{ label: 'Пн', revenue: 1000 }, { label: 'Вт', revenue: 1200 }, { label: 'Ср', revenue: 900 }],
        productsAttention: [{ name: 'Кава Test', status: 'seo_hole', reason: 'Опис короткий', clicks: 42 }]
      }
    });
    if (url.includes('/api/setup-guide')) return json({
      ok: true,
      platform: 'OpenCart',
      ready: 3,
      total: 7,
      label: 'Підключення часткове',
      checks: [
        { id: 'opencart', title: 'OpenCart / ocStore', ok: true, description: 'замовлення', detail: 'Bridge відповідає.' },
        { id: 'analytics', title: 'Google Analytics 4', ok: false, description: 'сесії', detail: 'Потрібні GA4_PROPERTY_ID і OAuth.' }
      ],
      wizard: [
        { step: 1, id: 'platform', title: 'Платформа', body: 'OpenCart', status: 'done', result: 'ok' },
        { step: 2, id: 'connect', title: 'Підключення магазину', body: 'Bridge', status: 'done', result: 'ok' },
        { step: 3, id: 'google', title: 'Google', body: 'GSC/GA4', status: 'active', result: 'todo' },
        { step: 4, id: 'profile', title: 'Профіль магазину', body: 'SMTP', status: 'active', result: 'todo' },
        { step: 5, id: 'first-result', title: 'Перший результат', body: '3 дії', status: 'blocked', result: 'todo' }
      ],
      steps: [{ title: 'Підключити GA4 і Google Ads', body: 'Додати доступи.', result: 'Система бачить ROAS.' }]
    });
    if (url.includes('/api/customer-dna')) return json({
      ok: true,
      summary: { customers: 1, orders: 3, revenue: 2700, avgOrderValue: 900, readyToBuy: 1, forecastRevenue: 900 },
      segments: [{ id: 'risk', title: 'Ризик тільки після аномалії', status: 'risk', count: 1, revenue: 900, topProducts: ['Кава Test'] }],
      customers: [{ id: 'c1', name: 'Client One', email: 'client@example.test', status: 'risk', orders: 3, totalSpent: 2700, avgOrderValue: 900, favoriteProduct: 'Кава Test', proposedOffer: 'Надіслати персональний лист.' }],
      lists: {},
      email: {},
      cadence: { note: 'Медіанний цикл покупки, не фіксовані 30 днів.' },
      communicationLog: []
    });
    if (url.includes('/api/content-workbench')) return json({
      ok: true,
      items: [{
        id: 'seo-1',
        name: 'Кава Test',
        type: 'product',
        url: 'https://example.test/kava',
        why: 'CTR нижче очікуваного.',
        current: { title: 'Old', metaDescription: 'Old meta', h1: 'Old', seoScore: 44 },
        proposed: { title: 'Кава Test купити | Mercato', metaDescription: 'Свіжа кава Test з доставкою.', h1: 'Кава Test', content: '<p>Опис</p>' }
      }]
    });
    if (url.includes('/api/seo-center')) return json({
      ok: true,
      installation: { installed: true, skills: 27, agents: 24, version: '1.9.6', coreReady: true, visualReady: true },
      google: { tier: 0, configured: true, description: 'PageSpeed API доступний.', services: { psi: { available: true, method: 'API key' }, gsc: { available: false }, ga4: { available: false } } },
      profiles: [
        { id: 'mercato', name: 'Mercato', url: 'https://mercato.com.ua', goal: 'Органічні продажі', focus: ['категорії кави'], priorities: { critical: ['Підключити GSC.'], important: ['Виправити H1.'], later: ['Додати llms.txt.'] } },
        { id: 'prom3d', name: 'Prom3D', url: 'https://prom3d.com.ua', goal: 'Якісні B2B-заявки', focus: ['сторінки послуг'], priorities: { critical: [], important: [], later: [] } }
      ],
      profile: { id: 'mercato', name: 'Mercato', url: 'https://mercato.com.ua', goal: 'Органічні продажі', focus: ['категорії кави'], priorities: { critical: ['Підключити GSC.'], important: ['Виправити H1.'], later: ['Додати llms.txt.'] } },
      auditModes: [{ id: 'full', label: 'Повний аудит' }, { id: 'schema', label: 'Schema.org' }],
      jobs: [],
      activeJob: null,
      latest: null,
      weeklyPlan: [{ id: 'full', label: 'Повний read-only аудит', mode: 'full', target: 'https://mercato.com.ua', due: true, score: 0 }]
    });
	    if (url.includes('/api/merchant-feed/google-diagnostics')) return json({
	      ok: true,
	      generatedAt: '2026-07-05T09:00:00Z',
	      readOnly: true,
	      publishAllowed: false,
	      api: 'Content API for Shopping v2.1',
	      migrationNotice: 'Content API sunset; Merchant API migration planned.',
	      summary: {
	        productsRead: 3,
	        productsWithIssues: 1,
	        productIssueCount: 2,
	        accountIssueCount: 0,
	        datafeedCount: 1,
	        topIssues: [{ code: 'missing_image', count: 1 }],
	        destinations: [{ destination: 'Shopping', count: 3 }]
	      },
	      productStatuses: [
	        { productId: 'online:uk:UA:107', offerId: '107', title: 'Кава Test', hasIssues: true, issues: [{ code: 'missing_image' }], destinationStatuses: [] }
	      ],
	      datafeeds: [{ id: 'feed-1', name: 'Mercato feed' }],
	      errors: {}
	    });
	    if (url.includes('/api/merchant-feed')) return json({
	      ok: true,
	      agents: [
	        { id: 'catalog-scanner', name: 'Catalog Scanner', purpose: 'Читає каталог.' },
	        { id: 'feed-compliance', name: 'Feed Compliance', purpose: 'Перевіряє Google.' }
      ],
      report: {
        generatedAt: '2026-06-19T12:00:00Z',
        coverage: { full: true, variantFull: true, source: 'merchant_feed_audit_list' },
        summary: { active: 10, ready: 4, critical: 2, needsReview: 4, limitedScan: 0, averageScore: 78 },
        products: []
      },
      reportState: { stale: false, lastSuccessfulAt: '2026-06-19T12:00:00Z', latestAttemptAt: '2026-06-19T12:00:00Z', reason: '' },
      liveBridge: { ok: true, version: '2026-06-22-merchant-remediation-queue-v30', supportsVariants: true, supportsApprovedWrites: true, supportsRemediationQueue: true },
      fixPlan: null,
      writePreview: null,
      approvals: [],
      writeRuns: [],
      remediationQueue: { remainingProducts: 8, remainingChanges: 12, completedBatches: 1, completedProducts: 5, manualOnlyProducts: 4, byAction: { set_brand: 8, set_feed_description_override: 4 } },
	      merchantApiIntelligence: {
        readiness: {
          openCartScan: 'variant_full',
          liveBridge: '2026-06-22-merchant-remediation-queue-v30',
          merchantConnector: 'connected',
          merchantDataMcp: 'planned_service_account_required'
        },
        tools: [{ id: 'mapi-developer-assistant', name: 'mapi-developer-assistant', status: 'official_skill', value: 'Офіційний Merchant API skill.', guardrail: 'Тільки через official docs.' }],
        feedRuleEngine: [{ id: 'merchant-center-diagnostics', name: 'Google Merchant diagnostics', writeMode: 'read_only', agent: 'Merchant API Diagnostics', checks: ['account issues'], impact: 'Показує реальні Merchant blockers.' }],
        evidenceGraph: { sources: [{ id: 'merchant_center', name: 'Google Merchant Center diagnostics', status: 'connected', evidence: 'Merchant API відповідає.' }] },
        allowedMcpReadTools: ['list_products', 'list_aggregate_product_statuses'],
        blockedMcpToolsUntilApproval: ['create_data_source'],
	        nextSteps: ['Підключити service account для Merchant data MCP.'],
	        safety: { ownerApprovalRequired: true }
	      },
	      googleDiagnostics: {
	        ok: true,
	        generatedAt: '2026-07-05T09:00:00Z',
	        readOnly: true,
	        publishAllowed: false,
	        api: 'Content API for Shopping v2.1',
	        migrationNotice: 'Content API sunset; Merchant API migration planned.',
	        summary: {
	          productsRead: 3,
	          productsWithIssues: 1,
	          productIssueCount: 2,
	          accountIssueCount: 0,
	          datafeedCount: 1,
	          topIssues: [{ code: 'missing_image', count: 1 }],
	          destinations: [{ destination: 'Shopping', count: 3 }]
	        },
	        productStatuses: [
	          { productId: 'online:uk:UA:107', offerId: '107', title: 'Кава Test', hasIssues: true, issues: [{ code: 'missing_image' }], destinationStatuses: [] }
	        ],
	        datafeeds: [{ id: 'feed-1', name: 'Mercato feed' }],
	        errors: {}
	      },
	      jobs: [],
      activeJob: null,
      safety: { readOnlyDefault: true, autoPublish: false, approvalWritesEnabled: true, merchantCenterPublish: false, firstBatchLimit: 5 }
    });
    if (url.includes('/api/products/matrix')) return json({ ok: true, topOpportunities: [{ name: 'Кава Test', status: 'seo_hole', reason: 'Опис короткий', clicks: 42, revenue: 1200 }], items: [] });
    if (url.includes('/api/work-items')) return json({ ok: true, items: [{ id: 'action-1', title: 'Повернути клієнта', type: 'email', why: 'Є сигнал', expectedImpact: '900 грн' }] });
    return json({ ok: true });
  };

  try {
    const appUrl = pathToFileURL(path.join(__dirname, '..', 'public/app-v3/js/app.js')).href;
    const mod = await import(`${appUrl}?smoke=${Date.now()}`);
    await new Promise(resolve => setTimeout(resolve, 120));
    const textContent = dom.window.document.body.textContent;
    assert.match(textContent, /AI-команда для малого інтернет-магазину/);
    assert.match(textContent, /Синхронізовано/);
    assert.match(textContent, /Черга дій/);
    assert.match(textContent, /Повернути клієнта/);
    assert.doesNotMatch(textContent, /\.env is not a function/);
    mod.state.route = 'seo';
    mod.render();
    const seoText = dom.window.document.body.textContent;
    assert.match(seoText, /SEO-система, а не папка зі звітами/);
    assert.match(seoText, /27 skills · 24 agents/);
    assert.match(seoText, /Mercato/);
    assert.match(seoText, /Prom3D/);
    mod.state.route = 'merchant';
    mod.render();
    const merchantText = dom.window.document.body.textContent;
    assert.match(merchantText, /Агенти готують каталог до Google Shopping/);
    assert.match(merchantText, /Сканувати весь каталог/);
    assert.match(merchantText, /Catalog Scanner/);
    assert.match(merchantText, /Постійна черга виправлення каталогу/);
    assert.match(merchantText, /наступний batch формується автоматично/);
	    assert.match(merchantText, /Google Merchant Intelligence/);
	    assert.match(merchantText, /mapi-developer-assistant/);
	    assert.match(merchantText, /Google Merchant diagnostics/);
	    assert.match(merchantText, /Live Google diagnostics/);
	    assert.match(merchantText, /missing_image/);
	    assert.equal(dom.window.document.querySelector('#refreshMerchantGoogleDiagnostics')?.disabled, false);
	    mod.state.data.merchant.reportState = {
      stale: true,
      lastSuccessfulAt: '2026-06-19T12:00:00Z',
      latestAttemptAt: '2026-06-20T07:45:00Z',
      reason: 'OpenCart bridge timeout'
    };
    mod.render();
    const staleMerchantText = dom.window.document.body.textContent;
    assert.match(staleMerchantText, /Застарілий звіт/);
    assert.match(staleMerchantText, /dry-run і test batch тимчасово заблоковані/);
    assert.equal(dom.window.document.querySelector('#buildMerchantPlan')?.disabled, true);
    assert.equal(dom.window.document.querySelector('#buildMerchantTestBatch')?.disabled, true);
  } finally {
    global.window = previous.window;
    global.document = previous.document;
    global.fetch = previous.fetch;
    Object.defineProperty(global, 'navigator', {
      value: previous.navigator,
      configurable: true
    });
    dom.window.close();
  }
});

test('app v3 email workflow keeps visible coupon creation and manual send gates', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public/app-v3/js/app.js'), 'utf8');
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  assert.match(appJs, /Створити код і вставити/);
  assert.match(appJs, /couponCode/);
  assert.match(appJs, /\/email\/segments/);
  assert.match(appJs, /\/email\/create-coupon/);
  assert.match(appJs, /\/email\/send-test/);
  assert.match(appJs, /\/email\/send-one/);
  assert.match(appJs, /\/email\/send-segment/);
  assert.match(appJs, /data-recipient-toggle/);
  assert.match(appJs, /data-recipient-remove/);
  assert.match(appJs, /selectedSegmentRecipients/);
  assert.match(appJs, /excludedRecipientIds/);
  assert.match(appJs, /SEND_MERCATO_SEGMENT/);
  assert.match(appJs, /payload\.segment\s*=\s*\{/);
  assert.match(appJs, /Gmail mobile preview/);
  assert.match(appJs, /ручне підтвердження/);

  assert.match(serverJs, /filterSegmentRecipientsForRequest/);
  assert.match(serverJs, /recipientIds/);
  assert.match(serverJs, /excludedRecipientIds|excludeRecipientIds/);
});

test('app v3 product draft writes merchant-safe varied descriptions', async () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public/app-v3/index.html'), 'utf8');
  const dom = new JSDOM(indexHtml, {
    url: 'http://127.0.0.1:3000/app-v3/#product',
    pretendToBeVisual: true
  });
  const previous = {
    window: global.window,
    document: global.document,
    fetch: global.fetch,
    navigator: global.navigator
  };
  global.window = dom.window;
  global.document = dom.window.document;
  Object.defineProperty(global, 'navigator', {
    value: dom.window.navigator,
    configurable: true
  });
  global.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: () => Promise.resolve({ ok: true, dashboardV2: {}, segments: [], customers: [], items: [], connectors: [] }),
    text: () => Promise.resolve('{}')
  });

  try {
    const appUrl = pathToFileURL(path.join(__dirname, '..', 'public/app-v3/js/app.js')).href;
    const mod = await import(`${appUrl}?productDraft=${Date.now()}`);
    mod.state.product = {
      ...mod.state.product,
      name: 'Кава Mexico Maragogype в зернах',
      type: 'Кава',
      facts: 'Країна: Mexico\nРегіон: Chiapas\nРік врожаю: 2025/2026\nСмак: яблуко, білий чай\nОбробка: SHG, EP\nРекомендація: фільтр, гейзер, френч-прес'
    };
    const mexico = mod.productDraft();
    assert.match(mexico.description, /Профіль смаку|Кислотність|Солодкість|Тіло|Фруктовість/);
    assert.match(mexico.attributes, /Кислотність:\s*\d|Солодкість:\s*\d|Тіло:\s*\d|Післясмак:\s*\d|Фруктовість:\s*\d/);
    mod.state.product = {
      ...mod.state.product,
      name: 'Кава Бурунді Kayanza в зернах купити | Mercato',
      type: 'Кава',
      facts: 'Країна: Бурунді\nРегіон: Kayanza\nРік врожаю: 2026\nСмак: запечене яблуко, карамель, горіхи\nОбробка: в зернах\nРекомендація: еспресо, турка, чашка, гейзер'
    };
    const cleanNameDraft = mod.productDraft();
    const cleanNameText = plainProductText(stripMerchantExcluded(cleanNameDraft.description));
    assert.equal(cleanNameDraft.h1, 'Кава Бурунді Kayanza в зернах');
    assert.doesNotMatch(cleanNameText.slice(0, 420), /купити\s*\|\s*Mercato|вказаний як факт партії|контекст партії/i);
    assert.match(cleanNameText.slice(0, 420), /Бурунді|Kayanza|щоденного приготування|Формат у зернах|помел під свій метод/i);
    mod.state.product = {
      ...mod.state.product,
      name: 'Кава Ethiopia Sidamo GR.2',
      type: 'Кава',
      facts: 'Країна: Ethiopia\nРегіон: Sidamo\nРік врожаю: 2024\nСмак: бергамот, лимон, квіти\nОбробка: washed\nРекомендація: V60, аеропрес'
    };
    const ethiopia = mod.productDraft();
    mod.state.product = {
      ...mod.state.product,
      name: 'Кава Ель-Сальвадор Cordillera del Balsamo',
      type: 'Кава',
      facts: 'Країна: Ель-Сальвадор\nРегіон: Cordillera del Balsamo\nРік врожаю: 2026\nСмак: цитрусна свіжість, яблучні нотки, сухофрукти\nОбробка: washed\nРекомендація: купити'
    };
    const badBrewing = mod.productDraft();

    assert.match(mexico.description, /data-mercato-description="v2"/);
    assert.match(mexico.description, /Швидко про товар|Походження і лот|Смак у чашці|Питання перед покупкою/);
    assert.match(mexico.description, /data-merchant-feed-exclude="true"|href="\/kava-v-zernah"/);
    assert.doesNotMatch(mexico.description, /border-left:\s*4px solid #f59a2e|Смакові ноти:/i);
    assert.match(mexico.description, /<section style="border:1px solid #e5e7eb;border-radius:16px/);
    assert.match(badBrewing.description, /Як готувати|Як обрати і заварювати|фільтр|гейзер|френч-прес/i);
    assert.match(badBrewing.description, /Профіль смаку|Кислотність|Солодкість|Тіло|Післясмак|Фруктовість/);
    assert.doesNotMatch(`${stripMerchantExcluded(badBrewing.description)}\n${badBrewing.attributes}`, /Рекомендація:\s*купити|Як готувати[\s\S]{0,120}купити/i);
    mod.state.product = {
      ...mod.state.product,
      name: 'Кава Гватемала Huehuetenango',
      type: 'Кава',
      facts: 'Країна: Гватемала\nРегіон: Huehuetenango\nСмак: шоколад, апельсин, горіх\nОбробка: washed\nДля кого: для еспресо і спокійної щоденної кави'
    };
    const forWhomDraft = mod.productDraft();
    assert.match(forWhomDraft.description, /Кому підійде[\s\S]{0,220}для еспресо і спокійної щоденної кави/i);
    assert.doesNotMatch(forWhomDraft.description, /Як готувати[\s\S]{0,160}для еспресо і спокійної щоденної кави/i);
    assert.match(forWhomDraft.attributes, /Для кого: для еспресо і спокійної щоденної кави|Кому підійде: для еспресо і спокійної щоденної кави/i);
    const mexicoText = `${mexico.title}\n${mexico.meta}\n${mexico.h1}\n${stripMerchantExcluded(mexico.description)}\n${mexico.attributes}`;
    const ethiopiaText = `${ethiopia.title}\n${ethiopia.meta}\n${ethiopia.h1}\n${stripMerchantExcluded(ethiopia.description)}\n${ethiopia.attributes}`;
    assert.match(mexicoText, /Мексика|Chiapas|яблуко|білий чай/i);
    assert.match(mexicoText, /Врожай\s*2025\/2026|Клас \/ підготовка|не спосіб обробки/i);
    assert.match(ethiopiaText, /Ефіопія|Sidamo|бергамот|лимон/i);
    assert.match(ethiopiaText, /Врожай\s*2024|Мита обробка|прозорішу кислотність/i);
    assert.doesNotMatch(`${mexicoText}\n${ethiopiaText}`, /варто обирати за характером|Обробка або тип|Ключова особливість|Профіль підходить|товар легше оцінювати|washed допомагає/i);
    assert.doesNotMatch(`${mexicoText}\n${ethiopiaText}`, /\b(Mexico|Ethiopia)\b|позиція для покупців|feed|SEO|доставк|відправк|знижк|(^|\s)акці(я|ї|ю|єю|ях|йна|йний|йні|йну)|промокод|https?:\/\/|конкурент/i);
    assert.notEqual(plainProductText(stripMerchantExcluded(mexico.description)).slice(0, 260), plainProductText(stripMerchantExcluded(ethiopia.description)).slice(0, 260));

    mod.state.route = 'product';
    mod.state.ready = true;
    mod.state.product = {
      ...mod.state.product,
      name: 'Кава Ель-Сальвадор Cordillera del Balsamo',
      type: 'Кава',
      facts: 'Країна: Ель-Сальвадор\nРегіон: Cordillera del Balsamo\nФерма: Finca El Jardín\nСорт: Bourbon\nСмак: цитрус, яблуко\nРік врожаю: 2026\nРекомендація: фільтр'
    };
    mod.render();
    assert.ok(document.querySelector('#productTopTaste'));
    assert.ok(document.querySelector('#productTopBrew'));
    assert.ok(document.querySelector('#productScaleAcidity'));
    document.querySelector('#productTopTaste').value = 'цитрусна свіжість, яблучні нотки, сухофрукти';
    document.querySelector('#productTopFit').value = 'тим, хто любить фруктову кислотність і чистий фільтр';
    document.querySelector('#productTopBrew').value = 'V60, фільтр і френч-прес';
    document.querySelector('#productScaleAcidity').value = '8.2';
    document.querySelector('#productScaleSweetness').value = '6.8';
    document.querySelector('#productScaleBody').value = '5.7';
    document.querySelector('#productScaleAftertaste').value = '7.4';
    document.querySelector('#productScaleFruitiness').value = '8.4';
    document.querySelector('#applyProductTopFacts').click();
    assert.match(document.querySelector('#productDescription').value, /V60, фільтр і френч-прес|Профіль смаку|Походження і лот|Деталі лота|Finca El Jardín|Bourbon|конкретне походження|тим, хто любить фруктову кислотність/i);
    assert.match(document.querySelector('#productAttributes').value, /Ферма: Finca El Jardín|Сорт: Bourbon|Кислотність: 8\.2|Солодкість: 6\.8|Тіло: 5\.7|Післясмак: 7\.4|Фруктовість: 8\.4|Рекомендація: V60, фільтр і френч-прес/);
    const merchantCheck = document.querySelector('#merchantFeedCheck')?.textContent || '';
    assert.match(merchantCheck, /Google Merchant feed check|Що піде у фід/);
    assert.match(merchantCheck, /id|title|description|structured_title \/ structured_description|link|image_link|availability|price|brand|gtin\/mpn\/identifier_exists|condition|product_detail/);
    assert.match(merchantCheck, /product_detail candidates|Походження \/ Ферма \/ станція: Finca El Jardín|Походження \/ Сорт \/ різновид: Bourbon|Смак \/ Кислотність: 8\.2/);
    assert.match(merchantCheck, /5000 символів|data-merchant-feed-exclude|manual/);
  } finally {
    global.window = previous.window;
    global.document = previous.document;
    global.fetch = previous.fetch;
    Object.defineProperty(global, 'navigator', {
      value: previous.navigator,
      configurable: true
    });
    dom.window.close();
  }
});

test('app v3 lets owner paste connector keys without exposing saved secrets', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public/app-v3/js/app.js'), 'utf8');
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  assert.match(appJs, /Вставити ключі прямо в dashboard/);
  assert.match(appJs, /data-connector-form/);
  assert.match(appJs, /Зберегти ключі/);
  assert.match(appJs, /\/api\/connectors\/credentials/);
  assert.match(appJs, /Порожнє поле не змінює збережене значення/);
  assert.match(appJs, /Підключення без коду/);
  assert.match(appJs, /Ключі додаються в Налаштуваннях/);

  assert.match(serverJs, /connection-secrets\.json/);
  assert.match(serverJs, /app\.get\('\/api\/connectors\/credentials'/);
  assert.match(serverJs, /app\.post\('\/api\/connectors\/credentials'/);
  assert.match(serverJs, /app\.get\('\/api\/connectors\/google-ads\/verify'/);
  assert.match(serverJs, /app\.get\('\/api\/connectors\/ga4\/verify'/);
  assert.match(serverJs, /analyticsdata\.googleapis\.com\/v1beta\/properties/);
  assert.match(serverJs, /GOOGLE_ADS_CLIENT_ID/);
  assert.match(serverJs, /GOOGLE_ADS_CLIENT_SECRET/);
  assert.match(serverJs, /Customer ID і developer token без OAuth/);
  assert.match(serverJs, /maskConnectionValue/);
  assert.match(serverJs, /connectionValue\('BRIDGE_URL'\)/);
  assert.doesNotMatch(serverJs, /const BRIDGE_URL\s*=\s*process\.env\.BRIDGE_URL/);
});

test('app v3 shows partial Google connections instead of false connected status', async () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'public/app-v3/index.html'), 'utf8');
  const dom = new JSDOM(indexHtml, {
    url: 'http://127.0.0.1:3000/app-v3/#settings',
    pretendToBeVisual: true
  });
  const previous = {
    window: global.window,
    document: global.document,
    fetch: global.fetch,
    navigator: global.navigator
  };
  global.window = dom.window;
  global.document = dom.window.document;
  Object.defineProperty(global, 'navigator', {
    value: dom.window.navigator,
    configurable: true
  });
  global.fetch = async input => {
    const url = String(input);
    const payload = url.includes('/api/connectors/credentials')
      ? {
          ok: true,
          connectors: [
            {
              id: 'merchant',
              title: 'Google Merchant Center',
              owner: 'Google Merchant Center',
              ok: false,
              statusLabel: 'Частково налаштовано',
              detail: 'Збережений лише account ID не підключає Merchant API.',
              missing: ['OAuth або service account доступ Merchant API'],
              fields: [],
              requiredFilled: 1,
              requiredTotal: 1
            },
            {
              id: 'google_ads',
              title: 'Google Ads',
              owner: 'Google Ads',
              ok: false,
              statusLabel: 'Частково налаштовано',
              detail: 'Customer ID і developer token без OAuth не дають доступу до Google Ads API.',
              missing: ['OAuth: access token або refresh token + Client ID + Client Secret'],
              verifyEndpoint: '/api/connectors/google-ads/verify',
              fields: [],
              requiredFilled: 2,
              requiredTotal: 2
            }
          ]
        }
      : { ok: true, dashboardV2: {}, checks: [], steps: [], wizard: [], agents: [], jobs: [] };
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve(payload),
      text: () => Promise.resolve(JSON.stringify(payload))
    };
  };

  try {
    const appUrl = pathToFileURL(path.join(__dirname, '..', 'public/app-v3/js/app.js')).href;
    const mod = await import(`${appUrl}?connectorStatus=${Date.now()}`);
    await new Promise(resolve => setTimeout(resolve, 120));
    mod.state.route = 'settings';
    mod.render();
    const textContent = dom.window.document.body.textContent;
    assert.match(textContent, /Google Ads/);
    assert.match(textContent, /Частково налаштовано/);
    assert.match(textContent, /developer token без OAuth/);
    assert.match(textContent, /Збережений лише account ID не підключає Merchant API/);
    assert.ok(dom.window.document.querySelector('[data-connector-verify="google_ads"]'));
  } finally {
    global.window = previous.window;
    global.document = previous.document;
    global.fetch = previous.fetch;
    Object.defineProperty(global, 'navigator', {
      value: previous.navigator,
      configurable: true
    });
    dom.window.close();
  }
});

test('app v2 email workflow exposes coupon settings and applies them on live send', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public/app-v2/js/app.js'), 'utf8');
  const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  assert.match(appJs, /Персональний купон/);
  assert.match(appJs, /Створити код і вставити/);
  assert.match(appJs, /current.enabled !== false/);
  assert.match(appJs, /createEmailCoupon/);
  assert.match(appJs, /couponSettings/);
  assert.match(appJs, /couponCode/);
  assert.match(appJs, /data-email-coupon-field/);
  assert.match(appJs, /data-email-create-coupon/);
  assert.match(serverJs, /extractCouponSettingsFromDraft\(draft\)/);
  assert.match(serverJs, /extractCouponCodeFromDraft\(draft\)/);
  assert.match(serverJs, /source: 'draft'/);
  assert.match(serverJs, /Mercato персональна знижка/);
  assert.match(serverJs, /couponCode/);
});

test('app v2 queues suppress completed deferred and dismissed work', () => {
  const payload = {
    source: 'test',
    productMatrix: {
      topOpportunities: [{
        status: 'seo_hole',
        label: 'SEO-дірка',
        name: 'Кава Test',
        productId: '42',
        url: 'https://mercato.com.ua/kava-test',
        action: 'Оновити сторінку.',
        potentialRevenue: 500,
        seo: { title: 'Old', h1: 'Old', descriptionLength: 200, score: 40, issues: ['short'] },
        gsc: { url: 'https://mercato.com.ua/kava-test', clicks: 2, impressions: 300, ctr: 0.006, position: 7 }
      }]
    },
    actions: [{
      id: 'content-action',
      priority: 'high',
      title: 'Fix content action',
      why: 'Repeated queue item',
      modules: ['SEO'],
      primaryAction: { label: 'Open', tab: 'generate', url: 'https://mercato.com.ua/content-action' }
    }]
  };
  const undecidedContent = helpers.apiContentWorkbenchFromPayload(payload, { decisionEntries: [] });
  const matrixId = undecidedContent.items.find(item => item.source === 'product_matrix').id;
  const entries = [{
    actionId: 'content-action',
    status: 'done',
    createdAt: new Date().toISOString()
  }, {
    actionId: matrixId,
    status: 'dismissed',
    createdAt: new Date().toISOString()
  }];

  assert.equal(helpers.apiWorkItemsFromPayload(payload, { decisionEntries: entries }).length, 0);
  const decidedWork = helpers.apiWorkItemsFromPayload(payload, { decisionEntries: entries, includeDecided: true });
  assert.equal(decidedWork.length, 1);
  assert.equal(decidedWork[0].decision.status, 'done');

  const content = helpers.apiContentWorkbenchFromPayload(payload, { decisionEntries: entries });
  assert.equal(content.items.length, 0);
  assert.equal(content.summary.skippedDecided, 1);

  const decidedContent = helpers.apiContentWorkbenchFromPayload(payload, { decisionEntries: entries, includeDecided: true });
  assert.equal(decidedContent.items.length, 2);
  assert.ok(decidedContent.items.some(item => item.id === matrixId && item.decision.status === 'dismissed'));
});

test('app v2 work queue hides disabled product actions', () => {
  const payload = {
    actions: [{
      id: 'disabled-product-seo',
      priority: 'high',
      title: 'Виправити SEO-поля товару: Архівний товар',
      why: 'OpenCart audit: Meta title довгий, Товар вимкнений.',
      modules: ['SEO', 'OpenCart'],
      primaryAction: { label: 'Виправити', tab: 'generate', url: 'https://mercato.com.ua/archive-product' }
    }]
  };

  assert.equal(helpers.apiWorkItemsFromPayload(payload, { decisionEntries: [] }).length, 0);
  const withDisabled = helpers.apiWorkItemsFromPayload(payload, { decisionEntries: [], includeDisabled: true });
  assert.equal(withDisabled.length, 1);
  assert.equal(withDisabled[0].id, 'disabled-product-seo');
});

test('app v2 content drafts are customer-facing before publish', () => {
  const payload = {
    source: 'test',
    productMatrix: {
      topOpportunities: [{
        type: 'snippet_ctr',
        status: 'snippet_ctr',
        label: 'CTR-дірка',
        name: 'Набори кави',
        url: 'https://mercato.com.ua/kava-nabory',
        action: 'Переписати title/meta під комерційний намір і підняти CTR.',
        potentialRevenue: 900,
        gsc: {
          url: 'https://mercato.com.ua/kava-nabory',
          clicks: 38,
          impressions: 1165,
          ctr: 0.033,
          position: 5.6,
          expectedCtr: 0.048,
          lostClicks: 17
        }
      }]
    },
    actions: []
  };

  const workbench = helpers.apiContentWorkbenchFromPayload(payload, { decisionEntries: [] });
  const item = workbench.items.find(row => row.url === 'https://mercato.com.ua/kava-nabory');
  assert.equal(item.type, 'category');
  assert.equal(item.draft.type, 'category');
  assert.equal(helpers.unsafePublishContentReasons(item.draft).length, 0);
  assert.doesNotMatch(`${item.draft.metaDescription}\n${item.draft.content}`, /Поясніть|додайте швидк|GSC|OpenCart readback/i);
});

test('app v2 content drafts strip internal seo action labels', () => {
  const payload = {
    source: 'test',
    productSeo: {
      seoActions: [{
        actionId: 'director-seo-near-top-test',
        priority: 'high',
        title: 'Дотиснути до топу: kava-nabory',
        pageLabel: 'kava-nabory',
        url: 'https://mercato.com.ua/kava-nabory',
        why: 'Сторінка вже близько до топу.',
        expectedImpact: 'Підсилити сторінку, яку Google уже тестує.',
        primaryAction: {
          label: 'Відкрити SEO workflow',
          tab: 'organic',
          url: 'https://mercato.com.ua/kava-nabory'
        }
      }]
    },
    actions: []
  };

  const workbench = helpers.apiContentWorkbenchFromPayload(payload, { decisionEntries: [] });
  const item = workbench.items.find(row => row.url === 'https://mercato.com.ua/kava-nabory');
  const text = `${item.name}\n${item.proposed.title}\n${item.proposed.metaDescription}\n${item.proposed.h1}\n${item.draft.title}\n${item.draft.metaDescription}\n${item.draft.h1}\n${item.draft.content}`;
  assert.equal(item.name, 'Набори кави');
  assert.equal(item.draft.h1, 'Набори кави');
  assert.match(item.draft.title, /Набори кави купити/i);
  assert.doesNotMatch(text, /Дотиснути до топу|kava-nabory|SEO workflow|Command Center|Пояснити|додати/i);
});

test('app v2 content drafts humanize coffee slugs and hide operator instructions', () => {
  const payload = {
    source: 'test',
    productSeo: {
      seoActions: [{
        actionId: 'director-seo-kava-v-zernah',
        priority: 'high',
        title: 'Підняти CTR сторінки: kava-v-zernah',
        pageLabel: 'kava-v-zernah',
        url: 'https://mercato.com.ua/kava-v-zernah',
        why: 'Сторінка має органічні покази.',
        expectedImpact: 'Підняти CTR без реклами.',
        primaryAction: { label: 'Відкрити SEO workflow', tab: 'organic', url: 'https://mercato.com.ua/kava-v-zernah' }
      }, {
        actionId: 'director-seo-svizhoobsmazhena',
        priority: 'high',
        title: 'Підняти CTR сторінки: svizhoobsmazhena-kava',
        pageLabel: 'svizhoobsmazhena-kava',
        url: 'https://mercato.com.ua/svizhoobsmazhena-kava',
        why: 'Сторінка має органічні покази.',
        expectedImpact: 'Підняти CTR без реклами.',
        primaryAction: { label: 'Відкрити SEO workflow', tab: 'organic', url: 'https://mercato.com.ua/svizhoobsmazhena-kava' }
      }]
    },
    actions: []
  };

  const workbench = helpers.apiContentWorkbenchFromPayload(payload, { decisionEntries: [] });
  const grain = workbench.items.find(row => row.url === 'https://mercato.com.ua/kava-v-zernah');
  const fresh = workbench.items.find(row => row.url === 'https://mercato.com.ua/svizhoobsmazhena-kava');
  const combined = [
    grain.name,
    grain.draft.title,
    grain.draft.metaDescription,
    grain.draft.h1,
    grain.draft.content,
    fresh.name,
    fresh.draft.title,
    fresh.draft.metaDescription,
    fresh.draft.h1,
    fresh.draft.content,
    ...(grain.proposed.htmlBlocks || []).map(block => `${block.title} ${block.text}`),
    ...(fresh.proposed.htmlBlocks || []).map(block => `${block.title} ${block.text}`)
  ].join('\n');

  assert.equal(grain.name, 'Кава в зернах');
  assert.equal(fresh.name, 'Свіжообсмажена кава');
  assert.match(grain.draft.title, /Кава в зернах купити \| Mercato/);
  assert.match(fresh.draft.title, /Свіжообсмажена кава купити \| Mercato/);
  assert.doesNotMatch(combined, /kava-v-zernah|svizhoobsmazhena|zernah|kaba|\bv\b|винести\s+у\s+видимий\s+блок|додати\s+рекомендац|long[-\s]?tail|Пояснити/iu);
});

test('app v2 content gaps explain mapping before publish', () => {
  const payload = {
    source: 'test',
    productMatrix: {
      unmatchedPages: [{
        name: 'Mercato.com.ua',
        url: 'https://mercato.com.ua/',
        gsc: { impressions: 902, clicks: 35, position: 20.3 }
      }, {
        name: 'kavyarnya-urban-coffee',
        url: 'https://mercato.com.ua/kavyarnya-urban-coffee',
        gsc: { impressions: 320, clicks: 4, position: 18.1 }
      }]
    },
    actions: []
  };

  const workbench = helpers.apiContentWorkbenchFromPayload(payload, { decisionEntries: [] });
  const home = workbench.items.find(row => row.url === 'https://mercato.com.ua/');
  const urban = workbench.items.find(row => row.url === 'https://mercato.com.ua/kavyarnya-urban-coffee');
  assert.equal(home.name, 'Головна сторінка');
  assert.equal(urban.name, 'Кавʼярня Urban Coffee');
  assert.equal(home.status, 'content_gap');
  assert.match(home.why, /Google уже показує цю сторінку/i);
  assert.match(home.expectedImpact, /902 показів і 35 кліків/i);
  assert.doesNotMatch(home.expectedImpact, /^0 потенційних кліків/i);
  assert.match(home.workflow.join('\n'), /Тільки після привʼязки/i);
});

test('app v2 coffee product drafts avoid weak generic descriptions', () => {
  const payload = {
    source: 'test',
    productMatrix: {
      topOpportunities: [{
        status: 'seo_hole',
        label: 'SEO-дірка',
        name: 'Кава El Salvador Cordillera del Balsamo washed',
        productId: '1042',
        url: 'https://mercato.com.ua/kava-el-salvador-cordillera-del-balsamo-washed',
        action: 'Оновити SEO-поля і опис.',
        potentialRevenue: 700,
        seo: { title: '', h1: '', descriptionLength: 0, score: 40, issues: ['empty_meta'] },
        gsc: { impressions: 300, clicks: 4, ctr: 0.013, position: 9 }
      }]
    },
    actions: []
  };

  const workbench = helpers.apiContentWorkbenchFromPayload(payload, { decisionEntries: [] });
  const item = workbench.items.find(row => row.name === 'Кава El Salvador Cordillera del Balsamo washed');
  const combined = `${item.draft.metaDescription}\n${item.draft.content}`;
  assert.ok(item.draft.metaDescription.length <= 155);
  assert.match(item.draft.metaDescription, /мита арабіка|чистою чашкою/i);
  assert.doesNotMatch(combined, /зрозумілий смак|добрий вибір для тих|Оберіть\s*[-–—]?|Поясніть|додайте швидк/i);
  assert.doesNotMatch(item.draft.metaDescription, /[-–—]\.?$/);
});

test('app v2 local coffee landing page does not get coffee set copy', () => {
  const payload = {
    source: 'test',
    productMatrix: {
      topOpportunities: [{
        type: 'snippet_ctr',
        status: 'snippet_ctr',
        label: 'CTR-дірка',
        name: 'Кава у Дніпрі',
        url: 'https://mercato.com.ua/kava-dnipro',
        action: 'Переписати локальну SEO-сторінку під намір купити каву у Дніпрі.',
        potentialRevenue: 800,
        gsc: {
          url: 'https://mercato.com.ua/kava-dnipro',
          clicks: 12,
          impressions: 700,
          ctr: 0.017,
          position: 8
        }
      }]
    },
    actions: []
  };

  const workbench = helpers.apiContentWorkbenchFromPayload(payload, { decisionEntries: [] });
  const item = workbench.items.find(row => row.url === 'https://mercato.com.ua/kava-dnipro');
  const text = `${item.draft.metaDescription}\n${item.draft.content}`;
  assert.equal(item.type, 'category');
  assert.match(item.draft.metaDescription, /свіжообсмажена кава|еспресо|фільтр/i);
  assert.match(item.draft.content, /каву в Дніпрі|зерно і помел|еспресо/i);
  assert.doesNotMatch(text, /Для подарунка|Для дегустації|добірк|щоденний запас|допомагають швидко підібрати каву під подарунок/i);
});

test('app v2 repair draft converts blocked internal brief into customer copy', () => {
  const repaired = helpers.apiContentRepairDraft({
    name: 'kava-nabory',
    itemType: 'category',
    proposed: {
      h1: 'Набори кави',
      faq: ['Який набір обрати?']
    },
    draft: {
      type: 'category',
      mode: 'existing',
      url: 'https://mercato.com.ua/kava-nabory',
      productName: 'kava-nabory',
      title: 'Набори кави купити | набір кави Mercato',
      metaDescription: 'Поясніть смаки, склад набору, кому підійде і додайте швидкий вибір.',
      h1: 'Набори кави',
      content: '<p>Сторінка має працювати як сторінка вибору. GSC-сигнал і OpenCart readback.</p>',
      attributes: {},
      allowProductFields: false
    }
  });

  assert.equal(repaired.ok, true);
  assert.ok(repaired.reasonsBefore.length >= 1);
  assert.deepEqual(repaired.reasonsAfter, []);
  assert.equal(repaired.repaired.type, 'category');
  assert.equal(repaired.repaired.allowProductFields, false);
  assert.doesNotMatch(`${repaired.repaired.metaDescription}\n${repaired.repaired.content}`, /Поясніть|додайте швидк|GSC|OpenCart readback|має працювати/i);
  assert.match(repaired.repaired.content, /подарунок|дегустац/i);
});

test('app v2 publish contract routes content through safe defaults', () => {
  const dryRun = helpers.apiPublishContractPayload({
    type: 'product',
    url: 'https://mercato.com.ua/kava-test',
    title: 'Кава Test купити | Mercato',
    content: '<p>Клієнтський опис товару.</p>',
    attributes: { 'Кислотність': '9', 'Смак': 'яблуко' },
    allowProductFields: true
  }, { dryRun: true });

  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.source, 'app_v2_publish_dry_run');
  assert.equal(dryRun.allowProductFields, false);
  assert.deepEqual(dryRun.attributes, {});

  const approved = helpers.apiPublishContractPayload({
    title: 'Кава Test купити | Mercato',
    content: '<p>Клієнтський опис товару.</p>'
  }, { dryRun: false });

  assert.equal(approved.dryRun, false);
  assert.equal(approved.source, 'app_v2_publish_approve');
  assert.equal(helpers.apiPublishApprovalError({}), 'Потрібне підтвердження PUBLISH_MERCATO_CONTENT');
  assert.equal(helpers.apiPublishApprovalError({ confirmPhrase: 'PUBLISH_MERCATO_CONTENT' }), '');
});

test('app v2 owner router maps natural language asks to one workflow', () => {
  const payload = {
    source: 'test',
    trustSummary: { checked: 10, ok: 10, status: 'ok' },
    emailIntelligence: {
      sent: 5,
      ordered: 1,
      revenueAfterCampaign: 300,
      publicTrackingConfigured: true
    },
    customerIntelligence: { readyToBuy: 7 },
    productMatrix: {
      summary: { seoHoles: 2, unmatchedPages: 0, products: 15 },
      topOpportunities: [{
        status: 'seo_hole',
        label: 'SEO-дірка',
        name: 'Кава Test',
        productId: '42',
        url: 'https://mercato.com.ua/kava-test',
        action: 'Оновити SEO',
        potentialRevenue: 700,
        seo: { title: '', h1: '', descriptionLength: 0, score: 40 },
        gsc: { impressions: 500, clicks: 5, ctr: 0.01, position: 8 }
      }]
    },
    actions: []
  };

  const content = helpers.apiOwnerRouterFromPayload(payload, {
    decisionEntries: [],
    query: 'що просувати цього тижня'
  });
  assert.equal(content.workflow, 'content_strategy');
  assert.equal(content.action.view, 'content');
  assert.equal(content.action.openContentUrl, 'https://mercato.com.ua/kava-test');
  assert.equal(content.skill, 'Content Strategy');
  assert.ok(content.steps.includes('Звірити GSC, sales, trust і статус товару.'));
  assert.match(content.actionId, /^director-router-content_strategy-[a-f0-9]{10}$/);
  assert.equal(content.route.actionId, content.actionId);
  assert.equal(content.route.destination, 'content');
  assert.equal(content.route.targetUrl, 'https://mercato.com.ua/kava-test');
  assert.match(content.approvalGate, /disabled|trust-failed/i);
  assert.match(content.verification, /action log/i);

  const retention = helpers.apiOwnerRouterFromPayload(payload, {
    decisionEntries: [],
    query: 'клієнти мовчать'
  });
  assert.equal(retention.workflow, 'customer_dna_retention');
  assert.equal(retention.action.view, 'customers');
  assert.equal(retention.skill, 'Customer Pulse / Retention Email Sequence');
  assert.match(retention.approvalGate, /test email/i);

  const incident = helpers.apiOwnerRouterFromPayload(payload, {
    decisionEntries: [],
    query: 'publish не спрацював'
  });
  assert.equal(incident.workflow, 'incident_runbook');
  assert.equal(incident.action.view, 'monitoring');
  assert.equal(incident.skill, 'Incident / Runbook');
  assert.match(incident.verification, /RCA/i);
});

test('app v2 content workbench separates product category and page work', () => {
  const payload = {
    source: 'test',
    productMatrix: {
      topOpportunities: [{
        status: 'seo_hole',
        label: 'SEO-дірка',
        name: 'Кава Бразилія Santos',
        productId: '42',
        url: 'https://mercato.com.ua/kava-brasilia-santos',
        action: 'Оновити SEO-поля і опис.',
        potentialRevenue: 900,
        seo: {
          title: 'Старий title',
          h1: 'Старий H1',
          descriptionLength: 300,
          score: 44,
          issues: ['short_description']
        },
        gsc: {
          url: 'https://mercato.com.ua/kava-brasilia-santos',
          clicks: 3,
          impressions: 500,
          ctr: 0.006,
          position: 8
        },
        sales: { orders: 1, revenue: 450 }
      }, {
        status: 'disabled',
        label: 'Вимкнений товар',
        name: 'Архівний товар',
        productId: '77',
        disabled: true,
        url: 'https://mercato.com.ua/archive-product',
        seo: {
          title: '',
          h1: '',
          issues: [{ field: 'status', message: 'Товар вимкнений' }]
        },
        gsc: { impressions: 1000, clicks: 10, ctr: 0.01, position: 7 }
      }],
      unmatchedPages: [{
        name: 'ua-chai',
        url: 'https://mercato.com.ua/ua-chai',
        gsc: {
          clicks: 4,
          impressions: 700,
          ctr: 0.005,
          position: 6
        }
      }, {
        name: 'Доставка',
        url: 'https://mercato.com.ua/delivery',
        gsc: {
          clicks: 1,
          impressions: 120,
          ctr: 0.008,
          position: 9
        }
      }]
    },
    actions: []
  };

  const workbench = helpers.apiContentWorkbenchFromPayload(payload, { decisionEntries: [] });
  assert.equal(workbench.ok, true);
  assert.equal(workbench.summary.total, 3);
  assert.equal(workbench.summary.products, 1);
  assert.equal(workbench.summary.categories, 1);
  assert.equal(workbench.summary.pages, 1);
  assert.equal(workbench.summary.skippedDisabled, 1);
  assert.equal(workbench.items.some(item => item.name === 'Архівний товар'), false);
  assert.ok(workbench.items[0].current.title);
  assert.ok(workbench.items[0].proposed.title);
  assert.equal(workbench.items[0].draft.type, 'product');
  assert.equal(workbench.items[0].draft.allowProductFields, false);
  assert.equal(helpers.unsafePublishContentReasons(workbench.items[0].draft).length, 0);
  assert.ok(workbench.items[0].preview.plain.includes('покупець'));
  assert.doesNotMatch(workbench.items[0].preview.plain, /Перший екран пояснює|Далі йдуть блоки/i);
});

test('app v2 customer DNA contract exposes email and suppression state', () => {
  const payload = {
    source: 'test',
    stats: { customers: 2, orders: 3, revenue: 1000, avgOrderValue: 333 },
    retention: {
      totals: { customers: 2, orders: 3, revenue: 1000, avgOrderValue: 333 },
      segments: [{
        id: 'at_risk',
        title: 'At risk',
        count: 1,
        revenue: 500,
        avgOrderValue: 500,
        topProducts: [{ name: 'Кава' }],
        preferenceTags: ['coffee']
      }]
    },
    customerIntelligence: {
      readyToBuy: 1,
      forecastRevenue: 500,
      lists: { ready: [{ name: 'Client', email: 'client@test', avgOrderValue: 500, favoriteProduct: 'Кава', proposedOffer: 'Кава' }] }
    },
    emailIntelligence: {
      publicTrackingConfigured: false,
      total: 5,
      sent: 4,
      ordered: 1,
      revenueAfterCampaign: 300,
      campaigns: [{ title: 'Test campaign', sent: 4, total: 5, revenue: 300 }]
    }
  };
  const dna = helpers.apiCustomerDnaFromPayload(payload);
  assert.equal(dna.ok, true);
  assert.equal(dna.summary.customers, 2);
  assert.equal(dna.summary.readyToBuy, 1);
  assert.equal(dna.email.publicTrackingConfigured, false);
  assert.equal(dna.segments[0].id, 'at_risk');
  assert.equal(dna.segments[0].status, 'risk');
  assert.equal(dna.customers[0].email, 'client@test');
  assert.match(dna.cadence.note, /медіан/i);
  assert.equal(dna.communicationLog[0].subject, 'Test campaign');
});

test('email segmentation uses each customer order cadence instead of fixed 60-day churn', () => {
  const realNow = Date.now;
  const fixedNow = new Date('2026-06-03T12:00:00Z').getTime();
  Date.now = () => fixedNow;
  const daysAgo = (days) => new Date(fixedNow - days * 86400000).toISOString().slice(0, 19).replace('T', ' ');
  try {
    const customers = [
      {
        customer_id: 101,
        firstname: 'Олена',
        lastname: 'Рівна',
        email: 'steady@example.com',
        telephone: '+380000000001',
        order_count: 3,
        total_spent: 2400,
        last_order: daysAgo(65),
        products_list: 'Кава Мексика'
      },
      {
        customer_id: 202,
        firstname: 'Максим',
        lastname: 'Пізній',
        email: 'late@example.com',
        telephone: '+380000000002',
        order_count: 3,
        total_spent: 2700,
        last_order: daysAgo(95),
        products_list: 'Кава Колумбія'
      }
    ];
    const orders = [
      { order_id: 1, customer_id: 101, email: 'steady@example.com', total: 800, date_added: daysAgo(65), products_list: 'Кава Мексика' },
      { order_id: 2, customer_id: 101, email: 'steady@example.com', total: 800, date_added: daysAgo(125), products_list: 'Кава Мексика' },
      { order_id: 3, customer_id: 101, email: 'steady@example.com', total: 800, date_added: daysAgo(185), products_list: 'Кава Мексика' },
      { order_id: 4, customer_id: 202, email: 'late@example.com', total: 900, date_added: daysAgo(95), products_list: 'Кава Колумбія' },
      { order_id: 5, customer_id: 202, email: 'late@example.com', total: 900, date_added: daysAgo(155), products_list: 'Кава Колумбія' },
      { order_id: 6, customer_id: 202, email: 'late@example.com', total: 900, date_added: daysAgo(215), products_list: 'Кава Колумбія' }
    ];

    const retention = helpers.buildEmailSegments(customers, orders);
    const steady = retention.customers.find(customer => customer.id === 101);
    const late = retention.customers.find(customer => customer.id === 202);
    const due = retention.segments.find(segment => segment.id === 'replenishment_due');
    const atRisk = retention.segments.find(segment => segment.id === 'at_risk');
    const intelligence = helpers.buildCustomerIntelligence(retention);

    assert.equal(steady.cadence.typicalIntervalDays, 60);
    assert.equal(steady.cadence.status, 'due_soon');
    assert.equal(late.cadence.typicalIntervalDays, 60);
    assert.equal(late.cadence.status, 'overdue');
    assert.equal(due.count, 1);
    assert.equal(due.recipients[0].customerId, 101);
    assert.equal(atRisk.count, 1);
    assert.equal(atRisk.recipients[0].customerId, 202);
    assert.match(atRisk.triggers[0].label, /аномальна пауза/i);
    assert.equal(intelligence.dueSoon, 1);
    assert.equal(intelligence.overdue, 1);
    assert.equal(intelligence.readyToBuy, 2);
  } finally {
    Date.now = realNow;
  }
});
