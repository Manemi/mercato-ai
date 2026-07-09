import {
  clearApiKey,
  createEmailCoupon,
  decideWorkItem,
  generateEmail,
  generateEmailBatch,
  getContentWorkbench,
  getCustomerDna,
  getDemoReadiness,
  getEmailSegments,
  getEmailTracking,
  getMonitoringStatus,
  getProductsMatrix,
  getSetupGuide,
  getStoreCustomer,
  getStoreCustomers,
  getStoreOrders,
  getToday,
  getWorkItems,
  generateSeoPackage,
  importSeoUrl,
  logCommandEvent,
  publishProductCard,
  publishContent,
  readOpenCartProduct,
  repairContentDraft,
  routeOwnerRequest,
  runCompetitorMonitoring,
  runUxMonitoring,
  sendEmailOne,
  sendEmailSegment,
  sendEmailTest
} from './api.js';
import { filteredContentItems, filteredWorkItems, selectedContentItem, selectedWorkItem, setState, state, subscribe } from './state.js';

const titles = {
  onboarding: 'AI-оператор бізнесу',
  connect: 'Підключити бізнес',
  today: 'План на сьогодні',
  queue: 'Черга можливостей',
  modules: 'Карта можливостей',
  demo: 'Готовність системи',
  content: 'SEO і сторінки',
  productCard: 'Товар або послуга',
  workbench: 'Виконання дії',
  customers: 'Клієнти і повтори',
  ads: 'Реклама',
  store: 'Дані магазину',
  monitoring: 'Реклама, конкуренти, UX',
  settings: 'Безпека і доступи'
};

const subtitles = {
  onboarding: 'Для підприємця без окремої маркетинг-команди: SEO, реклама, клієнти, контент і щоденні дії в одному місці.',
  connect: 'Підключіть сайт, аналітику, рекламу, email і дані замовлень, щоб система бачила бізнес, а не гадала.',
  today: 'Щоденний план власника: що зробити, навіщо, хто отримає користь і як перевірити результат.',
  queue: 'Усі можливості, які система знайшла в сайті, клієнтах, замовленнях, SEO, рекламі й конкурентах.',
  content: 'Сторінки, які можна підсилити для Google і покупця без ручного вивчення SEO.',
  productCard: 'Товарна картка без копіпасту: SEO, опис, характеристики, preview, dry-run і publish.',
  customers: 'Покупці, їхні смаки, повторні покупки і персональні причини повернутися.',
  store: 'Товари, клієнти й замовлення як джерело рішень для маркетингу.',
  monitoring: 'Конкуренти, UX, аналітика, readback і докази, що дія справді виконалась.',
  demo: 'Перевірка, чи система достатньо підключена і безпечна для живих дій.',
  settings: 'Доступи, API, bridge, tracking і правила, які не дають системі змінити сайт без погодження.'
};

function $(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toast(message) {
  const box = $('#toast');
  if (!box) return;
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => box.classList.remove('show'), 3400);
}

function setSync(label, tone = '') {
  const el = $('#syncState');
  if (!el) return;
  el.textContent = label;
  el.dataset.tone = tone;
}

function switchView(view) {
  setState({ view });
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `view-${view}`));
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  $('#viewTitle').textContent = titles[view] || view;
  const subtitle = $('#viewSubtitle');
  if (subtitle) subtitle.textContent = subtitles[view] || '';
}

function priorityLabel(priority = '') {
  if (priority === 'high') return 'Високий';
  if (priority === 'medium') return 'Середній';
  if (priority === 'low') return 'Низький';
  return 'Відкрито';
}

function typeLabel(type = '') {
  return {
    content: 'Контент / SEO',
    customer: 'Клієнти',
    monitoring: 'Реклама / конкуренти / UX',
    business: 'Бізнес-рішення'
  }[type] || 'Бізнес';
}

function statusLabel(status = '') {
  return {
    done: 'зроблено',
    deferred: 'відкладено',
    dismissed: 'прибрано'
  }[status] || status || 'збережено';
}

function formatPercent(value = 0) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function legacyTabToView(tab = '') {
  return {
    email: 'customers',
    customers: 'customers',
    orders: 'store',
    supplier: 'store',
    generate: 'productCard',
    organic: 'content',
    analysis: 'monitoring',
    trends: 'monitoring',
    ads: 'ads',
    command: 'today'
  }[String(tab || '').toLowerCase()] || 'settings';
}

function customerActionSegmentId(item = {}) {
  const primary = (item.actions || []).find(action => action.segmentId) || {};
  const targetTab = item.target?.tab || primary.tab || '';
  if (primary.segmentId) return primary.segmentId;
  if (/risk|відтоку/i.test(`${item.id} ${item.title}`)) return 'at_risk';
  if (/second|new|нов/i.test(`${item.id} ${item.title}`)) return 'new_customers';
  if (/vip/i.test(`${item.id} ${item.title}`)) return 'vip';
  if (/sleep|спляч/i.test(`${item.id} ${item.title}`)) return 'sleeping';
  if (targetTab === 'email') return 'replenishment_due';
  return 'replenishment_due';
}

const moduleGroups = [
  {
    title: 'Сайт, SEO і наповнення',
    note: 'Система допомагає власнику не вивчати SEO вручну: знаходить слабкі сторінки, готує опис, title/meta/H1 і показує preview перед зміною.',
    cards: [
      { title: 'SEO і сторінки', note: 'Що виправити на сайті, щоб вас краще знаходили і легше купували.', view: 'content', cta: 'Відкрити' },
      { title: 'Товар або послуга', note: 'Опис, характеристики, SEO і безпечна перевірка перед записом у OpenCart.', view: 'productCard', cta: 'Оформити' },
      { title: 'Пошуковий попит', note: 'Google Search Console показує, які сторінки вже мають попит і де є шанс отримати більше кліків.', tab: 'organic', cta: 'До SEO' }
    ]
  },
  {
    title: 'Клієнти, email і повторні продажі',
    note: 'Система бачить історію покупок, смаки, паузи між замовленнями і допомагає тримати клієнтів поруч.',
    cards: [
      { title: 'Клієнтська памʼять', note: 'Хто купував, що любить, коли повертається і кому доречно написати зараз.', view: 'customers', cta: 'Відкрити' },
      { title: 'Персональні листи', note: 'Привід кампанії, сегмент, тест собі, відправка одному або групі і памʼять відправок.', queueType: 'customer', cta: 'Підготувати листи' }
    ]
  },
  {
    title: 'Реклама, конкуренти і UX',
    note: 'Система допомагає не палити бюджет, бачити конкурентів і знаходити місця, де сайт заважає купити.',
    cards: [
      { title: 'Контроль реклами', note: 'Google Ads, GA4, витрати, кліки, конверсії і сторінки, на які веде реклама.', view: 'monitoring', cta: 'Відкрити' },
      { title: 'Конкуренти і ціни', note: 'Регулярно дивитись конкурентів, ціни, сторінки і те, де ваш бізнес може виграти.', tab: 'analysis', cta: 'До конкурентів' },
      { title: 'UX і шлях покупця', note: 'Що на сайті незрозуміло, де слабкий офер, де покупцю важко зробити замовлення.', tab: 'trends', cta: 'До UX' },
      { title: 'Готовність системи', note: 'Чи достатньо підключені дані і захист, щоб виконувати живі дії без ризику.', view: 'demo', cta: 'Перевірити' }
    ]
  },
  {
    title: 'Дані бізнесу і безпека',
    note: 'Джерела даних, замовлення, клієнти, товари, постачальники і технічні доступи, на яких тримається робота AI-оператора.',
    cards: [
      { title: 'Дані магазину', note: 'Клієнти, замовлення, товари і постачальники як джерело рішень для маркетингу.', view: 'store', cta: 'Відкрити' },
      { title: 'Підключити бізнес', note: 'OpenCart, Search Console, Analytics, Ads, email і tracking.', view: 'connect', cta: 'Підключити' },
      { title: 'Безпека і доступи', note: 'API, bridge, storage і правила live-дій: нічого небезпечного без погодження.', view: 'settings', cta: 'Перевірити' }
    ]
  }
];

function renderMetrics(metrics = {}) {
  const rows = [
    ['Довіра', metrics.trust],
    ['Рішення', metrics.director],
    ['Органіка', metrics.organic],
    ['Retention', metrics.retention]
  ];
  return rows.map(([label, item = {}]) => `
    <article class="metric ${escapeHtml(item.status || '')}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(item.value || '—')}</strong>
      <small>${escapeHtml(item.note || '')}</small>
    </article>
  `).join('');
}

function valueCardHtml(card = {}) {
  return `
    <article class="value-card ${escapeHtml(card.tone || '')}">
      <span>${escapeHtml(card.title || '')}</span>
      <strong>${escapeHtml(card.value || '—')}</strong>
      <small>${escapeHtml(card.note || '')}</small>
    </article>
  `;
}

function connectionStatusPill(ok, pendingLabel = 'Потрібно підключити') {
  return `<span class="setup-status ${ok ? 'ok' : 'pending'}">${ok ? 'Готово' : pendingLabel}</span>`;
}

function setupProgress(guide = {}) {
  const checks = Array.isArray(guide.checks) ? guide.checks : [];
  const done = checks.filter(check => check.ok).length;
  const missing = checks.filter(check => !check.ok);
  return {
    total: checks.length,
    done,
    missing,
    complete: checks.length > 0 && done === checks.length,
    label: checks.length ? `${done}/${checks.length}` : '0/0'
  };
}

function connectionRecipe(check = {}) {
  const recipes = {
    platform: {
      title: 'OpenCart / ocStore',
      owner: 'Адмін сайту або хостинг',
      steps: [
        'Завантажити `mercato-bridge.php` і приватний `mercato-bridge-secrets.php` у корінь сайту.',
        'У secrets задати bridge token, який знає тільки ваш сервер.',
        'У `.env` Mercato AI задати `BRIDGE_URL` і `BRIDGE_SECRET`.',
        'Натиснути “Перевірити ще раз” і переконатись, що читаються товари, клієнти й замовлення.'
      ],
      env: ['BRIDGE_URL=https://site.ua/mercato-bridge.php', 'BRIDGE_SECRET=...']
    },
    'search-console': {
      title: 'Google Search Console',
      owner: 'Google акаунт власника сайту',
      steps: [
        'У Google Cloud увімкнути Search Console API.',
        'Створити OAuth client або service account з доступом до verified property сайту.',
        'Додати файл OAuth/service account на сервер або задати access token.',
        'Перевірити, що API повертає clicks, impressions, CTR і position.'
      ],
      env: ['GSC_SITE_URL=https://site.ua/', 'GSC_OAUTH_CLIENT_FILE=...', 'GOOGLE_OAUTH_CLIENT_FILE=...']
    },
    analytics: {
      title: 'Google Analytics 4',
      owner: 'GA4 property власника магазину',
      steps: [
        'Взяти GA4 Property ID у Admin → Property details.',
        'У Google Cloud увімкнути Analytics Data API.',
        'Дати OAuth/service account доступ до GA4 property з роллю Viewer або Analyst.',
        'У `.env` задати property id і OAuth/client file або access token.',
        'Після перевірки система зможе бачити sessions, conversions, purchase revenue і поведінку на сайті.'
      ],
      env: ['GA4_PROPERTY_ID=123456789', 'GOOGLE_OAUTH_CLIENT_FILE=...', 'GA4_ACCESS_TOKEN=...']
    },
    'google-ads': {
      title: 'Google Ads',
      owner: 'Google Ads акаунт магазину',
      steps: [
        'Отримати Google Ads Customer ID без дефісів.',
        'У Google Ads API Center взяти Developer Token.',
        'Зробити OAuth consent і отримати refresh token для акаунта з доступом до Ads.',
        'У `.env` задати customer id, developer token і refresh/access token.',
        'Після перевірки система зможе бачити spend, clicks, conversions, CPC і ROAS.'
      ],
      env: ['GOOGLE_ADS_CUSTOMER_ID=1234567890', 'GOOGLE_ADS_DEVELOPER_TOKEN=...', 'GOOGLE_ADS_REFRESH_TOKEN=...']
    },
    email: {
      title: 'SMTP або Mailchimp',
      owner: 'Поштова служба магазину',
      steps: [
        'Створити SMTP-доступ у поштовому сервісі або підключити Mailchimp API.',
        'Задати адресу відправника, пароль/app password, host і port.',
        'Зробити тест собі перед будь-якою live-відправкою клієнту.',
        'Після цього email-flow зможе робити test, send-one, group wave і tracking.'
      ],
      env: ['SMTP_HOST=smtp.example.com', 'SMTP_PORT=465', 'SMTP_USER=...', 'SMTP_PASS=...', 'SMTP_FROM=...']
    },
    tracking: {
      title: 'Public tracking',
      owner: 'Публічний домен або production URL',
      steps: [
        'Зробити Mercato AI доступним із публічного HTTPS URL: Railway/Vercel/ngrok для тесту.',
        'У `.env` задати `PUBLIC_BASE_URL` або `TRACKING_BASE_URL` без localhost.',
        'Перевірити, що tracking-посилання відкривається з телефону або іншої мережі.',
        'Без цього система бачить замовлення в OpenCart, але не бачить opens/clicks до покупки.'
      ],
      env: ['PUBLIC_BASE_URL=https://ai.yourdomain.ua', 'TRACKING_BASE_URL=https://ai.yourdomain.ua']
    },
    safety: {
      title: 'Захист live-дій',
      owner: 'Власник системи',
      steps: [
        'Згенерувати приватний ключ для команд, які змінюють сайт або відправляють листи.',
        'У `.env` задати `COMMAND_API_KEY` або `MERCATO_COMMAND_API_KEY`.',
        'Після цього publish, email, coupon і monitoring-run вимагатимуть ключ.',
        'Ключ не вставляти в bridge, листи або публічний frontend-код.'
      ],
      env: ['COMMAND_API_KEY=довгий_секрет']
    }
  };
  return recipes[check.id] || {
    title: check.title || check.id || 'Джерело',
    owner: 'Власник доступу',
    steps: [check.detail || 'Потрібно додати доступ і натиснути “Перевірити ще раз”.'],
    env: []
  };
}

function renderConnectionRecipes(checks = []) {
  const safeChecks = Array.isArray(checks) ? checks : [];
  const pending = safeChecks.filter(check => !check.ok);
  const list = pending.length ? pending : safeChecks;
  const cardsHtml = list.map(check => {
    const recipe = connectionRecipe(check);
    const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
    const env = Array.isArray(recipe.env) ? recipe.env : [];
    const stepsHtml = steps.map(step => `<li>${escapeHtml(step)}</li>`).join('');
    const envHtml = env.length
      ? `<div class="env-list">${env.map(line => `<code>${escapeHtml(line)}</code>`).join('')}</div>`
      : '';
    return [
      `<article class="${check.ok ? 'ok' : 'pending'}">`,
      '<div class="connection-recipe-head">',
      `<span>${check.ok ? 'працює' : 'потрібно'}</span>`,
      `<strong>${escapeHtml(recipe.title)}</strong>`,
      `<small>${escapeHtml(recipe.owner)}</small>`,
      '</div>',
      `<ol>${stepsHtml}</ol>`,
      envHtml,
      '</article>'
    ].join('');
  }).join('');
  return `
    <section class="connection-recipes">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Як підключити те, що ще не працює</p>
          <h3>Кожне джерело має власника доступу, кроки і <code>.env</code> змінні</h3>
          <p>Спочатку закрийте джерела зі статусом “Потрібно”, потім натисніть “Перевірити ще раз”.</p>
        </div>
      </div>
      <div class="connection-recipe-grid">
        ${cardsHtml}
      </div>
    </section>
  `;
}

function primaryActionLabel(item = {}) {
  if (item.type === 'customer') return 'Підготувати контакт';
  if (item.type === 'content' || item.target?.kind === 'content') return 'Підготувати SEO-зміну';
  return 'Відкрити дію';
}

function primaryActionEffect(item = {}) {
  if (!item) return 'Система ще не обрала головну дію.';
  if (item.expectedImpact) return item.expectedImpact;
  if (item.type === 'customer') return 'Після виконання буде зрозуміло, кому написати, з якою пропозицією і як перевірити результат.';
  if (item.type === 'content') return 'Після виконання сторінка матиме кращий title/meta/H1, preview і контроль перед publish.';
  return 'Після виконання задача має перейти з “здогадки” у зафіксоване рішення з результатом.';
}

function valueMetricById(id = '') {
  return (state.today?.commercialValue?.valueCards || []).find(card => card.id === id) || {};
}

function moneyLabel(value = 0) {
  const num = Number(value || 0);
  return num ? `${Math.round(num).toLocaleString('uk')} грн` : '—';
}

function operatingModel() {
  return state.today?.operatingModel || state.today?.commercialValue?.operatingModel || {};
}

function renderDailyOverview(overview = {}) {
  const topProducts = Array.isArray(overview.topProducts) ? overview.topProducts : [];
  return `
    <section class="owner-command-card daily">
      <p class="eyebrow">Command Center</p>
      <h3>Щоденний огляд магазину</h3>
      <div class="owner-daily-grid">
        <article><span>Сьогодні</span><strong>${moneyLabel(overview.revenueToday)}</strong><small>${Number(overview.ordersToday || 0).toLocaleString('uk')} зам.</small></article>
        <article><span>7 днів</span><strong>${moneyLabel(overview.revenue7d)}</strong><small>${Number(overview.orders7d || 0).toLocaleString('uk')} зам.</small></article>
        <article><span>30 днів</span><strong>${moneyLabel(overview.revenue30d)}</strong><small>${Number(overview.orders30d || 0).toLocaleString('uk')} зам.</small></article>
        <article><span>Середній чек</span><strong>${moneyLabel(overview.avgOrderValue)}</strong><small>база для прогнозу повторів</small></article>
      </div>
      ${topProducts.length ? `
        <div class="owner-top-products">
          <span>Топ товари</span>
          ${topProducts.map(product => `
            <p><strong>${escapeHtml(product.name)}</strong><small>${moneyLabel(product.revenue)}${product.orders ? ` · ${Number(product.orders).toLocaleString('uk')} зам.` : ''}</small></p>
          `).join('')}
        </div>
      ` : '<p class="muted-copy">Після повного sync OpenCart тут буде топ-3 товарів за продажами.</p>'}
    </section>
  `;
}

function renderEconomicsPanel(operating = {}) {
  const economics = operating.economics || {};
  const positioning = operating.positioning || {};
  const pricing = state.today?.pricing || state.today?.dashboardV2?.pricing || {};
  return `
    <section class="owner-command-card economics">
      <p class="eyebrow">Чому це куплять</p>
      <h3>${escapeHtml(positioning.headline || 'AI-команда для малого магазину')}</h3>
      <div class="owner-economics-row">
        <article>
          <span>Команда спеціалістів</span>
          <strong>${escapeHtml(economics.teamCost || pricing.teamCost || '$2 000–4 500/міс')}</strong>
        </article>
        <article>
          <span>Mercato AI</span>
          <strong>${escapeHtml(economics.mercatoPrice || '$25–100/міс')}</strong>
        </article>
      </div>
      <p>${escapeHtml(economics.message || positioning.promise || '')}</p>
      <div class="owner-wow-note">${escapeHtml(positioning.firstWow || 'перший результат за 10 хвилин після підключення магазину')}</div>
    </section>
  `;
}

function renderPricingPlans(pricing = {}) {
  const plans = Array.isArray(pricing.plans) ? pricing.plans : [];
  if (!plans.length) return '';
  return `
    <section class="pricing-panel">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Beta / pilot пропозиція</p>
          <h3>Тарифи як зрозуміла комерційна пропозиція, без self-service billing у MVP</h3>
          <p>${escapeHtml(pricing.trial || '14 днів trial')} · оплата поки ручна, Stripe/LiqPay не в цьому етапі.</p>
        </div>
        <strong>${escapeHtml(pricing.teamCost || '$2 000–4 500/міс')} команда</strong>
      </div>
      <div class="pricing-grid">
        ${plans.map(plan => `
          <article class="pricing-card ${plan.id === 'growth' ? 'featured' : ''}">
            <span>${escapeHtml(plan.name || '')}</span>
            <strong>${escapeHtml(plan.price || '')}</strong>
            <p>${escapeHtml(plan.who || '')}</p>
            <ul>
              <li>${escapeHtml(plan.products || '')}</li>
              <li>${escapeHtml(plan.seo || '')}</li>
              <li>${escapeHtml(plan.email || '')}</li>
              <li>${escapeHtml(plan.support || '')}</li>
            </ul>
          </article>
        `).join('')}
      </div>
      <p class="muted-copy">${escapeHtml(pricing.note || 'Для beta/pilot показуємо ціну і цінність, але не підключаємо billing.')}</p>
    </section>
  `;
}

function dashboardActionAttr(action = {}) {
  if (action.id) return `data-open-item="${escapeHtml(action.id)}"`;
  if (action.target?.url) return `data-open-content-url="${escapeHtml(action.target.url)}"`;
  return 'data-view="today"';
}

function renderCommandMetrics(metrics = []) {
  return `
    <div class="command-metric-grid">
      ${(Array.isArray(metrics) ? metrics : []).slice(0, 4).map(metric => `
        <article class="command-metric ${escapeHtml(metric.tone || 'neutral')}">
          <span>${escapeHtml(metric.label || '')}</span>
          <strong>${escapeHtml(metric.value || '—')}</strong>
          <small>${escapeHtml(metric.delta || metric.unit || '')}</small>
        </article>
      `).join('')}
    </div>
  `;
}

function renderSalesChart(chart = []) {
  const rows = (Array.isArray(chart) ? chart : []).slice(-7);
  const max = Math.max(1, ...rows.map(row => Number(row.revenue || row.value || 0)));
  if (!rows.length) {
    return '<p class="muted-copy">Після синхронізації OpenCart тут буде 7-денний графік продажів.</p>';
  }
  return `
    <div class="sales-chart" aria-label="Продажі за 7 днів">
      ${rows.map(row => {
        const value = Number(row.revenue || row.value || 0);
        const height = Math.max(8, Math.round((value / max) * 100));
        return `
          <article>
            <div><span style="height:${height}%"></span></div>
            <strong>${escapeHtml(row.label || '')}</strong>
            <small>${moneyLabel(value)}</small>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function renderCommandCenterV2() {
  const dashboard = state.today?.dashboardV2 || {};
  const actions = Array.isArray(dashboard.actionQueue) ? dashboard.actionQueue : [];
  const customers = Array.isArray(dashboard.attentionCustomers) ? dashboard.attentionCustomers : [];
  const seo = Array.isArray(dashboard.seoTop) ? dashboard.seoTop : [];
  const products = Array.isArray(dashboard.productsAttention) ? dashboard.productsAttention : [];
  return `
    <section class="command-center-v2">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Command Center</p>
          <h3>${escapeHtml(dashboard.topbar?.subtitle || 'Стан магазину і 3-5 дій на сьогодні')}</h3>
          <p>Один екран для власника: що сталося в магазині, кому приділити увагу, які SEO/товарні дії дадуть користь і що треба погодити.</p>
        </div>
        <button class="button primary" data-view="today">Відкрити план</button>
      </div>
      ${renderCommandMetrics(dashboard.metrics || [])}
      <div class="command-center-layout">
        <section class="command-queue-panel">
          <div class="mini-head">
            <span>3-5 дій</span>
            <strong>Що зробити сьогодні</strong>
          </div>
          <div class="command-action-list">
            ${actions.slice(0, 5).map(action => `
              <article>
                <span>${Number(action.number || 0).toLocaleString('uk')}</span>
                <div>
                  <strong>${escapeHtml(action.title || 'Дія')}</strong>
                  <p>${escapeHtml(action.reason || '')}</p>
                  <small>${escapeHtml(action.expectedResult || '')}</small>
                </div>
                <button class="button secondary" ${dashboardActionAttr(action)}>Відкрити</button>
              </article>
            `).join('') || '<p class="muted-copy">Після синхронізації система покаже 3-5 конкретних дій.</p>'}
          </div>
        </section>
        <section class="command-side-panel">
          <div class="mini-head">
            <span>Покупці</span>
            <strong>Під увагою</strong>
          </div>
          <div class="compact-card-list">
            ${customers.slice(0, 4).map(customer => `
              <article>
                <strong>${escapeHtml(customer.name || 'Клієнт')}</strong>
                <span>${escapeHtml(customer.status || 'watch')}</span>
                <p>${escapeHtml(customer.reason || '')}</p>
              </article>
            `).join('') || '<p class="muted-copy">OpenCart ще не дав клієнтські сигнали.</p>'}
          </div>
        </section>
        <section class="command-side-panel">
          <div class="mini-head">
            <span>SEO</span>
            <strong>Сторінки з попитом</strong>
          </div>
          <div class="compact-card-list">
            ${seo.slice(0, 4).map(item => `
              <article>
                <strong>${escapeHtml(item.name || 'Сторінка')}</strong>
                <span>score ${Number(item.score || 0).toLocaleString('uk')}</span>
                <p>${escapeHtml(item.issue || '')}</p>
              </article>
            `).join('') || '<p class="muted-copy">Підключіть GSC або OpenCart SEO-дані.</p>'}
          </div>
        </section>
        <section class="command-chart-panel">
          <div class="mini-head">
            <span>7 днів</span>
            <strong>Продажі</strong>
          </div>
          ${renderSalesChart(dashboard.salesChart || [])}
        </section>
        <section class="command-side-panel">
          <div class="mini-head">
            <span>Товари</span>
            <strong>Під увагою</strong>
          </div>
          <div class="compact-card-list">
            ${products.slice(0, 4).map(item => `
              <article>
                <strong>${escapeHtml(item.name || 'Товар')}</strong>
                <span>${escapeHtml(item.status || 'attention')}</span>
                <p>${escapeHtml(item.reason || '')}</p>
              </article>
            `).join('') || '<p class="muted-copy">Product Matrix зʼявиться після OpenCart + GSC/замовлень.</p>'}
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderPriorityRule(operating = {}) {
  const rules = Array.isArray(operating.actionPriorityRule) ? operating.actionPriorityRule : [];
  return `
    <section class="owner-command-card priority">
      <p class="eyebrow">Як AI обирає 3-5 дій</p>
      <h3>Пріоритет: ризик відтоку > втрата трафіку > потенційний дохід > час виконання</h3>
      <div class="owner-priority-list">
        ${rules.map(rule => `
          <article>
            <span>${Number(rule.rank || 0).toLocaleString('uk')}</span>
            <div>
              <strong>${escapeHtml(rule.label || '')}</strong>
              <small>${escapeHtml(rule.signal || '')}</small>
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderDataSources(operating = {}) {
  const sources = Array.isArray(operating.dataSources) ? operating.dataSources : [];
  return `
    <section class="owner-data-panel">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Дані замість здогадок</p>
          <h3>Система має бачити сайт, клієнтів, замовлення, рекламу і аналітику</h3>
          <p>Без цих джерел AI може написати текст, але не може бути “командою спеціалістів”, яка доводить результат.</p>
        </div>
        <button class="button secondary" data-view="connect">Підключити джерела</button>
      </div>
      <div class="owner-data-grid">
        ${sources.map(source => `
          <article class="${source.ok ? 'ok' : 'pending'}">
            <span>${source.ok ? 'працює' : 'потрібно'}</span>
            <strong>${escapeHtml(source.title || '')}</strong>
            <p>${escapeHtml(source.value || '')}</p>
            <small>${escapeHtml(source.need || '')}</small>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderTeamRoles(operating = {}) {
  const roles = Array.isArray(operating.roles) ? operating.roles : [];
  if (!roles.length) return '';
  return `
    <div class="owner-team-grid">
      ${roles.map(item => `
        <article>
          <strong>${escapeHtml(item.role || '')}</strong>
          <p>${escapeHtml(item.output || '')}</p>
        </article>
      `).join('')}
    </div>
  `;
}

function renderSetupWizard(guide = {}) {
  const wizard = Array.isArray(guide.wizard) ? guide.wizard : [];
  if (!wizard.length) return '';
  return `
    <section class="onboarding-wizard-panel">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">5 кроків запуску</p>
          <h3>Спочатку підключаємо дані, потім показуємо перші 3 рекомендації</h3>
          <p>У MVP доступи лишаються через поточні <code>.env</code> і bridge recipes. Ключі клієнта не зберігаємо в базі.</p>
        </div>
        <button class="button secondary" id="refreshSetupBtn">Перевірити ще раз</button>
      </div>
      <div class="wizard-step-grid">
        ${wizard.map(step => `
          <article class="${escapeHtml(step.status || '')}">
            <span>${Number(step.step || 0).toLocaleString('uk')}</span>
            <strong>${escapeHtml(step.title || '')}</strong>
            <p>${escapeHtml(step.body || '')}</p>
            <small>${escapeHtml(step.result || '')}</small>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function approvalActionAttr(item = {}) {
  if (!item || !item.id) return 'data-view="today"';
  if (item.type === 'content' || item.target?.kind === 'content') {
    return `data-open-content-url="${escapeHtml(item.target?.url || item.url || '')}"`;
  }
  return `data-open-item="${escapeHtml(item.id || '')}"`;
}

function operatorQueueItemHtml(item = {}, index = 0) {
  return `
    <article class="operator-inbox-item">
      <span>${index + 1}</span>
      <div>
        <strong>${escapeHtml(item.title || 'Дія без назви')}</strong>
        <p>${escapeHtml(item.expectedImpact || item.why || 'Оператор підготував дію для перевірки.')}</p>
      </div>
      <button class="button secondary" ${approvalActionAttr(item)}>Відкрити</button>
    </article>
  `;
}

function operatorProofRows() {
  const summary = state.today?.commercialValue?.summary || {};
  const readiness = state.today?.readiness || {};
  const issues = Array.isArray(readiness.issues) ? readiness.issues : [];
  return [
    {
      label: 'Безпечні публікації',
      value: `${Number(summary.verifiedPublish || 0).toLocaleString('uk')} publish`,
      note: `${Number(summary.trustOk || 0).toLocaleString('uk')}/${Number(summary.trustChecked || 0).toLocaleString('uk')} trust checks OK`
    },
    {
      label: 'Продажі після дій',
      value: moneyLabel(summary.attributedRevenue),
      note: 'зафіксована виручка після email/дій'
    },
    {
      label: 'Що заважає бачити повний результат',
      value: issues.length ? `${issues.length} blockers` : 'чисто',
      note: issues[0] || 'критичних blind spots немає'
    }
  ];
}

function operatorLearningRows() {
  const recentRoutes = Array.isArray(state.today?.ownerRouter?.recentRoutes) ? state.today.ownerRouter.recentRoutes : [];
  if (recentRoutes.length) {
    return recentRoutes.slice(0, 3).map(route => ({
      title: route.title || route.workflow || 'Маршрут',
      note: `${route.statusLabel || route.status || 'зафіксовано'}${route.createdAtLocal ? ` · ${route.createdAtLocal}` : ''}`
    }));
  }
  const queue = Array.isArray(state.today?.queue) ? state.today.queue : [];
  return [
    {
      title: 'Оператор вчиться на ваших рішеннях',
      note: 'Коли ви натискаєте зроблено/відкласти/прибрати, наступні рекомендації стають точнішими.'
    },
    {
      title: queue[0]?.title || 'Перший loop ще треба закрити',
      note: queue[0]?.why || 'Погодьте одну дію, щоб зʼявився доказ виконання і новий запис у памʼяті.'
    }
  ];
}

function launchStepClass({ active = false, done = false, blocked = false } = {}) {
  if (blocked) return 'blocked';
  if (active) return 'active';
  if (done) return 'done';
  return '';
}

function renderOnboarding() {
  const box = $('#onboardingPanel');
  if (!box) return;
  const guide = state.setupGuide || {};
  const progress = setupProgress(guide);
  const summary = state.today?.commercialValue?.summary || {};
  const firstAction = state.today?.primary || null;
  const queue = Array.isArray(state.today?.queue) ? state.today.queue : [];
  const operating = operatingModel();
  const positioning = operating.positioning || {};
  const needsSetup = !progress.complete;
  const approvalTitle = needsSetup
    ? `Дозавершити підключення: ${progress.missing[0]?.title || 'tracking і safety'}`
    : (firstAction?.title || 'Оператор чекає нових даних');
  const approvalCopy = needsSetup
    ? (progress.missing[0]?.detail || guide.nextStep || 'Без цього оператор не зможе довести результат після виконання.')
    : (firstAction?.why || 'Оновіть дані, щоб оператор підготував наступну дію.');
  const approvalEffect = needsSetup
    ? 'Після підключення оператор зможе не тільки радити, а й показувати відкриття, кліки, замовлення і перевірку змін на сайті.'
    : primaryActionEffect(firstAction);
  const painCards = [
    ['SEO без навчання з нуля', 'Система знаходить сторінки з попитом, готує title/meta/H1/опис і показує, що зміниться перед publish.', 'SEO і сторінки', 'content'],
    ['Реклама й аналітика без хаосу', 'Підтягує Google Ads/Analytics, бачить, що дає кліки, заявки або продажі, і підказує, де не палити бюджет.', 'Контроль реклами', 'monitoring'],
    ['Конкуренти і ціни поруч', 'Регулярно дивиться конкурентів, їхні ціни, сторінки, сильні місця і перетворює це на вашу наступну дію.', 'Конкуренти', 'monitoring'],
    ['Товарні картки без копіпасту', 'Допомагає оформити товар або послугу: опис для покупця, характеристики, SEO, preview і безпечний dry-run.', 'Картка товару', 'productCard'],
    ['Email і персональні стосунки', 'Бачить історію покупок, смаки, паузи між замовленнями і готує персональні листи, щоб клієнти повертались.', 'Клієнти', 'customers'],
    ['UX і наповнення магазину', 'Підсвічує слабкі сторінки, порожні блоки, незрозумілі тексти, погані маршрути і те, що заважає купити.', 'Магазин', 'store']
  ];
  const flowSteps = [
    ['1', 'Підключити сайт', 'Зараз перший міст — OpenCart. Далі можна додавати інші CMS, CRM і маркетплейси.'],
    ['2', 'Дати системі дані', 'Замовлення, клієнти, товари, Search Console, Analytics, Ads, email і tracking.'],
    ['3', 'Отримати конкретні дії', 'Не “подивіться звіт”, а “напишіть цим клієнтам”, “виправте цю сторінку”, “перевірте ціну”.'],
    ['4', 'Погодити і виміряти', 'Live email, publish, coupon або зміна на сайті тільки після вашого підтвердження і з перевіркою результату.']
  ];
  box.innerHTML = `
    <section class="owner-hero">
      <div class="owner-hero-copy">
        <p class="eyebrow">Для підприємця, який продає в Україні і не має окремої маркетинг-команди</p>
        <h2>${escapeHtml(positioning.headline || 'AI-команда для малого інтернет-магазину')}</h2>
        <p class="lead-copy">${escapeHtml(positioning.promise || 'Власнику не треба ставати SEO-спеціалістом, email-маркетологом, аналітиком реклами, UX-дизайнером і контент-менеджером одночасно. Система підключається до сайту, бачить товари або послуги, замовлення, клієнтів, рекламу й аналітику, а потім щодня дає конкретні дії: що зробити, навіщо і який результат перевірити.')}</p>
        <p class="owner-target-copy">${escapeHtml(positioning.targetCustomer || 'Власник магазину зі штатом 1–5 людей, який продає товари або послуги в Україні і не має ресурсу найняти окрему команду.')}</p>
        <div class="owner-hero-actions">
          <button class="button primary" data-view="${needsSetup ? 'connect' : 'today'}">${needsSetup ? 'Підключити мій сайт' : 'Показати дії на сьогодні'}</button>
          <button class="button secondary" data-view="customers">Як система бачить клієнтів</button>
          <button class="button secondary" data-view="content">Що з SEO і сторінками</button>
        </div>
      </div>
      <aside class="owner-first-step">
        <span>${needsSetup ? 'Перший крок' : 'Наступна дія'}</span>
        <strong>${escapeHtml(approvalTitle)}</strong>
        <p>${escapeHtml(approvalCopy)}</p>
        <div class="owner-step-note">${escapeHtml(approvalEffect)}</div>
        <button class="button primary" ${needsSetup ? 'data-view="connect"' : approvalActionAttr(firstAction || {})}>${needsSetup ? 'Почати підключення' : primaryActionLabel(firstAction || {})}</button>
      </aside>
    </section>

    ${renderCommandCenterV2()}

    <section class="owner-command-grid">
      ${renderEconomicsPanel(operating)}
      ${renderDailyOverview(operating.dailyOverview || {})}
      ${renderPriorityRule(operating)}
    </section>

    ${renderPricingPlans(state.today?.pricing || state.today?.dashboardV2?.pricing || {})}

    <section class="owner-pain-panel">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Що купує власник</p>
          <h3>Не “ще одну програму”, а маленьку професійну команду всередині бізнесу</h3>
          <p>Кожен напрям нижче має закінчуватись не звітом, а дією, яку можна виконати або погодити.</p>
        </div>
      </div>
      <div class="owner-pain-grid">
        ${painCards.map(([title, text, button, view]) => `
          <article>
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(text)}</p>
            <button class="button secondary" data-view="${escapeHtml(view)}">${escapeHtml(button)}</button>
          </article>
        `).join('')}
      </div>
    </section>

    ${renderDataSources(operating)}

    <section class="owner-system-panel">
      <div>
        <p class="eyebrow">Як це працює</p>
        <h3>Система спочатку розуміє бізнес, потім пропонує дії</h3>
        <p>Перший фокус — OpenCart-магазин, але логіка не привʼязана лише до кави або лише до товарів. Її можна розширювати на інші товари, послуги й платформи.</p>
      </div>
      <div class="owner-flow-grid">
        ${flowSteps.map(([num, title, text]) => `
          <article>
            <span>${escapeHtml(num)}</span>
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(text)}</p>
          </article>
        `).join('')}
      </div>
    </section>

    <section class="owner-today-panel">
      <article class="owner-current-action">
        <p class="eyebrow">${needsSetup ? 'Запуск' : 'Що робити сьогодні'}</p>
        <h3>${escapeHtml(approvalTitle)}</h3>
        <p>${escapeHtml(approvalCopy)}</p>
        <div class="owner-signal-row">
          <span>${Number(queue.length || 0).toLocaleString('uk')} дій у черзі</span>
          <span>${escapeHtml(moneyLabel(summary.totalPipeline))} потенціалу</span>
          <span>${Number(summary.readyToBuy || 0).toLocaleString('uk')} клієнтів до повтору</span>
        </div>
        <button class="button primary" ${needsSetup ? 'data-view="connect"' : approvalActionAttr(firstAction || {})}>${needsSetup ? 'Підключити джерела даних' : primaryActionLabel(firstAction || {})}</button>
      </article>
      <article class="owner-customer-memory">
        <p class="eyebrow">Глибокі стосунки з клієнтом</p>
        <h3>Оператор памʼятає не тільки email, а поведінку</h3>
        <p>Після підключення замовлень система бачить, що людина купувала, які смаки або послуги їй близькі, коли вона зазвичай повертається, кому вже писали і який лист спрацював.</p>
        <button class="button secondary" data-view="customers">Відкрити клієнтів</button>
      </article>
    </section>

    <section class="owner-team-panel">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Ролі, які закриває підписка</p>
          <h3>Не замінює власника. Забирає необхідність знати всі напрямки самому</h3>
        </div>
      </div>
      ${renderTeamRoles(operating)}
    </section>

    <section class="owner-proof-strip">
      <div>
        <strong>${Number(summary.readyActions || queue.length || 0).toLocaleString('uk')}</strong>
        <span>підготовлених дій</span>
      </div>
      <div>
        <strong>${Number(summary.verifiedPublish || 0).toLocaleString('uk')}</strong>
        <span>перевірених виконань</span>
      </div>
      <div>
        <strong>${escapeHtml(moneyLabel(summary.retentionForecast))}</strong>
        <span>прогноз повторних покупок</span>
      </div>
      <div>
        <strong>${Number(summary.trustOk || 0).toLocaleString('uk')}/${Number(summary.trustChecked || 0).toLocaleString('uk')}</strong>
        <span>trust checks</span>
      </div>
    </section>
  `;
}

function renderConnect() {
  const box = $('#connectPanel');
  if (!box) return;
  const guide = state.setupGuide || {};
  const progress = setupProgress(guide);
  const checks = Array.isArray(guide.checks) ? guide.checks : [];
  const steps = Array.isArray(guide.steps) ? guide.steps : [];
  const businessSources = [
    ['Сайт і OpenCart', 'товари, категорії, сторінки, замовлення і клієнти'],
    ['Google Search Console', 'що вже шукають, де є покази, кліки, CTR і позиції'],
    ['Google Analytics 4', 'звідки приходять люди і що роблять перед покупкою'],
    ['Google Ads', 'витрати, кліки, кампанії, конверсії і сторінки входу'],
    ['Email і tracking', 'тест собі, відправка клієнту, відкриття, кліки, замовлення після листа'],
    ['Safety gate', 'жодних live-змін на сайті або розсилок без підтвердження власника']
  ];
  box.innerHTML = `
    <section class="connect-hero">
      <div>
        <p class="eyebrow">Підключити бізнес до AI-оператора</p>
        <h2>Система має бачити сайт, клієнтів, замовлення, рекламу і аналітику, щоб не гадати</h2>
        <p>Зараз перший міст — OpenCart. Після підключення джерел AI-оператор розуміє, що продається, хто купує, що шукають у Google, куди йде рекламний бюджет і які дії можна виконати безпечно.</p>
      </div>
      <div class="connect-summary">
        <span>${escapeHtml(guide.platform || 'OpenCart')} підключення</span>
        <strong>${escapeHtml(progress.label)} готово</strong>
        <small>${escapeHtml(progress.complete ? 'Можна переходити до плану на сьогодні.' : guide.nextStep || 'Закрийте відсутні підключення нижче.')}</small>
      </div>
    </section>

    ${renderSetupWizard(guide)}

    <section class="business-source-grid">
      ${businessSources.map(([title, text]) => `
        <article>
          <strong>${escapeHtml(title)}</strong>
          <p>${escapeHtml(text)}</p>
        </article>
      `).join('')}
    </section>

    <section class="setup-check-grid">
      ${checks.map(check => `
        <article class="setup-check-card ${check.ok ? 'ok' : 'pending'}">
          <div>
            <strong>${escapeHtml(check.title || check.id)}</strong>
            ${connectionStatusPill(check.ok)}
          </div>
          <p>${escapeHtml(check.description || '')}</p>
          ${check.detail ? `<small>${escapeHtml(check.detail)}</small>` : ''}
        </article>
      `).join('') || '<p class="muted-copy">Статус підключення ще не завантажено.</p>'}
    </section>

    ${renderConnectionRecipes(checks)}

    <section class="setup-manual">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Маршрут підключення</p>
          <h3>Що треба пройти, щоб система стала корисною командою, а не генератором здогадок</h3>
          <p>Після цього власник переходить не в технічні налаштування, а в щоденний план: кому написати, яку сторінку підсилити, що перевірити в рекламі, де конкурент сильніший.</p>
        </div>
        <div class="content-actions">
          <button class="button secondary" id="refreshSetupBtn">Перевірити ще раз</button>
          <button class="button primary" data-view="today">Перейти до плану на сьогодні</button>
        </div>
      </div>
      <div class="setup-step-list">
        ${steps.map((step, index) => `
          <article class="setup-step">
            <span>${index + 1}</span>
            <div>
              <strong>${escapeHtml(step.title || '')}</strong>
              <p>${escapeHtml(step.body || '')}</p>
              ${step.result ? `<small>${escapeHtml(step.result)}</small>` : ''}
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderGrowthStory(today) {
  const box = $('#growthStoryPanel');
  if (!box) return;
  const value = today?.commercialValue || {};
  const positioning = value.positioning || {};
  const summary = value.summary || {};
  const offer = value.pilotOffer || {};
  const plan = Array.isArray(value.todayPlan) ? value.todayPlan : [];
  const cards = Array.isArray(value.valueCards) ? value.valueCards : [];
  const blockers = Array.isArray(value.blockers) ? value.blockers : [];
  box.innerHTML = `
    <div class="growth-hero">
      <div class="growth-copy">
        <p class="eyebrow">Що купує підприємець</p>
        <h2>${escapeHtml(positioning.title || 'AI-комерційний директор')}</h2>
        <p>${escapeHtml(positioning.promise || 'Система перетворює дані магазину на конкретні дії для продажів.')}</p>
        <div class="growth-audience">${escapeHtml(positioning.audience || '')}</div>
      </div>
      <aside class="growth-verdict ${escapeHtml(positioning.mode || '')}">
        <span>${escapeHtml(positioning.label || 'Оцінка продукту')}</span>
        <strong>${escapeHtml(summary.totalPipelineLabel || '—')}</strong>
        <small>${escapeHtml(positioning.verdict || '')}</small>
      </aside>
    </div>
    <div class="value-grid">
      ${cards.map(valueCardHtml).join('')}
    </div>
    <div class="pilot-grid">
      <section class="pilot-card">
        <p class="eyebrow">Пілот, який можна продати</p>
        <h3>${escapeHtml(offer.title || '30-денний пілот')}</h3>
        <p>${escapeHtml(offer.riskReversal || '')}</p>
        <div class="pilot-price">${escapeHtml(offer.price || '')}</div>
        <ul class="plain-list compact-list">
          ${(offer.deliverables || []).slice(0, 3).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </section>
      <section class="pilot-card action-plan">
        <p class="eyebrow">План на сьогодні</p>
        ${plan.slice(0, 3).map((item, index) => `
          <article class="plan-step">
            <span>${index + 1}</span>
            <div>
              <strong>${escapeHtml(item.title || '')}</strong>
              <small>${escapeHtml(item.detail || '')}</small>
            </div>
          </article>
        `).join('') || '<p class="muted-copy">Оновіть сигнали, щоб отримати план.</p>'}
      </section>
      <section class="pilot-card blockers">
        <p class="eyebrow">Що заважає продавати дорожче</p>
        ${blockers.length
          ? `<ul class="issue-list compact-issues">${blockers.slice(0, 4).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
          : '<div class="ready-note">Критичних blockers для пілоту немає. Можна готувати демо-сценарій.</div>'}
      </section>
    </div>
  `;
}

function itemHtml(item, { compact = false, active = false } = {}) {
  if (!item) return '';
  const modules = (item.modules || []).slice(0, compact ? 2 : 4);
  const contentOpen = item.type === 'content' || item.target?.kind === 'content';
  return `
    <article class="work-item ${escapeHtml(item.priority || '')} ${active ? 'active' : ''}" data-id="${escapeHtml(item.id)}">
      <div>
        <div class="item-title">${escapeHtml(item.title)}</div>
        <div class="item-note">
          <strong>Чому:</strong> ${escapeHtml(item.why || 'Система знайшла бізнес-сигнал, який потребує рішення.')}
        </div>
        <div class="item-note">
          <strong>Що зміниться:</strong> ${escapeHtml(primaryActionEffect(item))}
        </div>
        <div class="item-meta">
          <span class="pill ${escapeHtml(item.priority || '')}">${priorityLabel(item.priority)}</span>
          <span class="pill">${typeLabel(item.type)}</span>
          ${modules.map(module => `<span class="pill">${escapeHtml(module)}</span>`).join('')}
        </div>
      </div>
      ${compact ? '' : `<div class="item-actions"><button class="button secondary" ${contentOpen ? `data-open-content-url="${escapeHtml(item.target?.url || '')}"` : `data-open-item="${escapeHtml(item.id)}"`}>Відкрити</button></div>`}
    </article>
  `;
}

function renderPrimary(today) {
  const primary = today?.primary;
  const panel = $('#primaryPanel');
  if (!panel) return;
  if (!primary) {
    panel.className = 'decision-panel';
    panel.innerHTML = `
      <p class="eyebrow">Перша дія</p>
      <div class="decision-title">Спочатку потрібні дані</div>
      <p class="decision-copy">Система ще не має стабільного next best action. Перевірте підключення і натисніть “Оновити”.</p>
    `;
    return;
  }
  panel.className = `decision-panel ${primary.priority === 'high' ? 'high' : ''}`;
  const primaryOpenAttr = primary.type === 'content' || primary.target?.kind === 'content'
    ? `data-open-content-url="${escapeHtml(primary.target?.url || '')}"`
    : `data-open-item="${escapeHtml(primary.id)}"`;
  const evidence = Array.isArray(primary.data) ? primary.data.slice(0, 3) : [];
  panel.innerHTML = `
    <p class="eyebrow">Перша дія на сьогодні</p>
    <div class="decision-title">${escapeHtml(primary.title)}</div>
    <p class="decision-copy"><strong>Чому:</strong> ${escapeHtml(primary.why || 'Система обрала цю дію як найкоротший шлях до користі.')}</p>
    <p class="decision-copy"><strong>Що зміниться:</strong> ${escapeHtml(primaryActionEffect(primary))}</p>
    ${evidence.length ? `<ul class="decision-evidence">${evidence.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
    <div class="decision-actions">
      <button class="button primary" ${primaryOpenAttr}>${escapeHtml(primaryActionLabel(primary))}</button>
      <button class="button secondary" data-decision="${escapeHtml(primary.id)}" data-status="done">Зроблено</button>
      <button class="button secondary" data-decision="${escapeHtml(primary.id)}" data-status="deferred">Відкласти</button>
    </div>
  `;
}

function renderActionMap(today = {}) {
  const box = $('#actionMapPanel');
  if (!box) return;
  const primary = today.primary || null;
  const operating = today.operatingModel || today.commercialValue?.operatingModel || {};
  const priorityRule = Array.isArray(operating.actionPriorityRule) ? operating.actionPriorityRule : [];
  const guide = state.setupGuide || {};
  const progress = setupProgress(guide);
  const steps = [
    {
      title: '1. Дані',
      state: progress.complete ? 'done' : 'active',
      copy: progress.complete ? 'Підключення готове для роботи.' : `Готово ${progress.label}. Залишилось: ${progress.missing.map(item => item.title).join(', ') || 'перевірка'}.`
    },
    {
      title: '2. Рішення',
      state: primary ? 'done' : 'blocked',
      copy: primary ? `Обрана дія: ${primary.title}.` : 'Після підключення система вибере одну головну дію.'
    },
    {
      title: '3. Виконання',
      state: primary ? 'active' : 'blocked',
      copy: primary ? primaryActionEffect(primary) : 'Тут буде дія з preview, test/dry-run і статусом.'
    }
  ];
  box.innerHTML = `
    <div>
      <p class="eyebrow">План на сьогодні</p>
      <h2>Оператор перетворює дані бізнесу на 1-3 зрозумілі дії, а не на список звітів.</h2>
      <p>Кожна дія має пояснити: що робимо, чому саме зараз, кого це зачепить і як перевірити результат після виконання.</p>
      ${priorityRule.length ? `
        <div class="today-priority-rule">
          ${priorityRule.map(rule => `<span>${Number(rule.rank || 0)}. ${escapeHtml(rule.label || '')}</span>`).join('')}
        </div>
      ` : ''}
    </div>
    <div class="action-map-steps">
      ${steps.map(step => `
        <article class="${escapeHtml(step.state)}">
          <strong>${escapeHtml(step.title)}</strong>
          <p>${escapeHtml(step.copy)}</p>
        </article>
      `).join('')}
    </div>
  `;
}

function renderReadiness(today) {
  const box = $('#readinessPanel');
  if (!box) return;
  const readiness = today?.readiness || {};
  const issues = readiness.issues || [];
  box.innerHTML = `
    <p class="eyebrow">Контроль перед виконанням</p>
    <div class="readiness-label">${escapeHtml(readiness.sellable ? 'Можна діяти без зайвого ризику' : 'Є слабкі місця в даних або захисті')}</div>
    <p>${escapeHtml(readiness.sellable ? 'Система має достатньо даних для preview, test/dry-run і перевірки після виконання.' : 'Працювати можна, але власник має розуміти, чому результат або вимірювання можуть бути неповними.')}</p>
    <ul class="issue-list">
      ${issues.length ? issues.slice(0, 4).map(issue => `<li>${escapeHtml(issue)}</li>`).join('') : '<li>Критичних blockers для першої дії немає.</li>'}
    </ul>
    <button class="button secondary" data-view="monitoring">Перевірити рекламу, конкурентів і UX</button>
  `;
}

function renderQueueList(container, items, options = {}) {
  const el = typeof container === 'string' ? $(container) : container;
  if (!el) return;
  el.innerHTML = items.length
    ? items.map(item => itemHtml(item, options)).join('')
    : '<section class="empty-workflow"><h2>Немає дій</h2><p>Оновіть сигнали або очистіть фільтри.</p></section>';
}

function renderToday() {
  renderActionMap(state.today || {});
  renderPrimary(state.today);
  renderReadiness(state.today);
  const metricStrip = $('#metricStrip');
  if (metricStrip) metricStrip.innerHTML = renderMetrics(state.today?.metrics || {});
  renderQueueList('#todayQueue', (state.today?.queue || []).slice(0, 5), { compact: true });
}

function renderOwnerRouter() {
  const panel = $('#ownerRouterPanel');
  if (!panel) return;
  const router = state.ownerRouter || {};
  const result = router.result || null;
  const evidence = Array.isArray(result?.evidence) ? result.evidence.filter(Boolean) : [];
  const steps = Array.isArray(result?.steps) ? result.steps.filter(Boolean) : [];
  const recentRoutes = Array.isArray(state.today?.ownerRouter?.recentRoutes) ? state.today.ownerRouter.recentRoutes : [];
  const prompts = ['що просувати цього тижня', 'клієнти мовчать', 'publish не спрацював'];
  const action = result?.action || {};
  const actionLegacyTab = action.legacyTab || action.tab || '';
  panel.innerHTML = `
    <div class="owner-router-head">
      <div>
        <p class="eyebrow">Запит до оператора</p>
        <h2>Опишіть проблему бізнесовою мовою</h2>
      </div>
      <button class="button primary" data-owner-route ${router.loading ? 'disabled' : ''}>${router.loading ? 'Думаю' : 'Дати маршрут'}</button>
    </div>
    <div class="owner-router-form">
      <input id="ownerRouterInput" class="owner-router-input" type="search" value="${escapeHtml(router.query || '')}" placeholder="Наприклад: що просувати цього тижня, клієнти мовчать, publish не спрацював">
      <div class="owner-router-prompts">
        ${prompts.map(prompt => `<button class="router-chip" data-router-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join('')}
      </div>
    </div>
    ${router.error ? `<p class="owner-router-error">${escapeHtml(router.error)}</p>` : ''}
    ${result ? `
      <article class="owner-router-result">
        <div class="owner-router-result-head">
          <span class="pill ${result.confidence === 'high' ? 'high' : 'medium'}">${escapeHtml(result.title || result.intent || 'маршрут')}</span>
          <span class="pill">${escapeHtml(result.confidence || 'medium')}</span>
        </div>
        <h3>${escapeHtml(result.title || 'Наступна дія')}</h3>
        <p>${escapeHtml(result.why || '')}</p>
        ${evidence.length ? `<ul class="owner-router-evidence">${evidence.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}
        ${steps.length ? `
          <ol class="owner-router-steps">
            ${steps.slice(0, 4).map(step => `<li>${escapeHtml(step)}</li>`).join('')}
          </ol>
        ` : ''}
        <div class="owner-router-next">
          <strong>${escapeHtml(result.nextStep || '')}</strong>
          ${result.approvalGate ? `<span>${escapeHtml(result.approvalGate)}</span>` : ''}
          ${result.verification ? `<span>${escapeHtml(result.verification)}</span>` : result.control ? `<span>${escapeHtml(result.control)}</span>` : ''}
        </div>
        <div class="owner-router-actions">
          <button class="button primary" data-owner-action="result">${escapeHtml(action.label || 'Відкрити')}</button>
          ${actionLegacyTab ? `<button class="button secondary" data-view="${escapeHtml(legacyTabToView(actionLegacyTab))}">Відкрити у v2</button>` : ''}
        </div>
      </article>
    ` : ''}
    ${recentRoutes.length ? `
      <section class="owner-router-recent">
        <div>
          <p class="eyebrow">Памʼять Router</p>
          <h3>Останні маршрути</h3>
        </div>
        <div class="owner-router-recent-list">
          ${recentRoutes.slice(0, 4).map(route => `
            <article>
              <strong>${escapeHtml(route.title || route.workflow || 'Маршрут')}</strong>
              <span>${escapeHtml(route.skill || route.workflow || '')}</span>
              <small>${escapeHtml(route.statusLabel || route.status || '')}${route.createdAtLocal ? ` · ${escapeHtml(route.createdAtLocal)}` : ''}</small>
            </article>
          `).join('')}
        </div>
      </section>
    ` : ''}
  `;
}

function renderRouteFocus() {
  const panel = $('#routeFocusPanel');
  if (!panel) return;
  const route = state.ownerRouter?.activeRoute || null;
  if (!route) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  const steps = Array.isArray(route.steps) ? route.steps.filter(Boolean) : [];
  const target = route.route?.targetName || route.route?.targetUrl || route.action?.label || '';
  const status = route.status || '';
  panel.hidden = false;
  panel.innerHTML = `
    <div class="route-focus-main">
      <div>
        <p class="eyebrow">${escapeHtml(route.skill || route.workflow || 'Маршрут дії')}</p>
        <h2>${escapeHtml(route.title || 'Активний маршрут')}</h2>
        <p>${escapeHtml(route.nextStep || route.why || '')}</p>
        ${target ? `<small>${escapeHtml(target)}</small>` : ''}
      </div>
      <div class="route-focus-actions">
        <button class="button primary" data-owner-action="active">Продовжити</button>
        <button class="button secondary" data-owner-route-status="done">Виконано</button>
        <button class="button secondary" data-owner-route-status="deferred">Відкласти</button>
        <button class="button secondary" data-owner-route-status="dismissed">Прибрати</button>
        <button class="button secondary" data-owner-route-close>Закрити</button>
      </div>
    </div>
    ${status ? `<div class="route-focus-status"><span class="pill ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span></div>` : ''}
    ${steps.length ? `
      <ol class="route-focus-steps">
        ${steps.slice(0, 4).map(step => `<li>${escapeHtml(step)}</li>`).join('')}
      </ol>
    ` : ''}
    <div class="route-focus-gates">
      ${route.approvalGate ? `<span>${escapeHtml(route.approvalGate)}</span>` : ''}
      ${route.verification ? `<span>${escapeHtml(route.verification)}</span>` : ''}
    </div>
  `;
}

function renderQueue() {
  renderQueueList('#workQueue', filteredWorkItems());
}

function moduleActionHtml(card) {
  if (card.view) {
    return `<button class="button primary" data-view="${escapeHtml(card.view)}">${escapeHtml(card.cta || 'Відкрити')}</button>`;
  }
  if (card.storeTool) {
    return `<button class="button primary" data-store-tool="${escapeHtml(card.storeTool)}">${escapeHtml(card.cta || 'Відкрити')}</button>`;
  }
  if (card.contentType) {
    return `<button class="button primary" data-content-type-shortcut="${escapeHtml(card.contentType)}">${escapeHtml(card.cta || 'Відкрити')}</button>`;
  }
  if (card.queueType) {
    return `<button class="button primary" data-go="queue" data-filter-type="${escapeHtml(card.queueType)}">${escapeHtml(card.cta || 'Відкрити')}</button>`;
  }
  if (card.monitoringKind) {
    return `<button class="button primary" data-run-monitoring="${escapeHtml(card.monitoringKind)}">${escapeHtml(card.cta || 'Запустити')}</button>`;
  }
  if (card.tab) {
    return `<button class="button secondary" data-view="${escapeHtml(legacyTabToView(card.tab))}">${escapeHtml(card.cta || 'Відкрити у v2')}</button>`;
  }
  if (card.href) {
    return `<a class="button secondary as-link" href="${escapeHtml(card.href)}" target="_blank" rel="noopener">${escapeHtml(card.cta || 'Відкрити')}</a>`;
  }
  return '';
}

function moduleCardHtml(card) {
  return `
    <article class="module-card">
      <div>
        <h3>${escapeHtml(card.title)}</h3>
        <p>${escapeHtml(card.note || '')}</p>
      </div>
      <div class="module-card-actions">${moduleActionHtml(card)}</div>
    </article>
  `;
}

function renderModuleStrip(cards = []) {
  return `
    <div class="module-grid workflow-strip">
      ${cards.map(moduleCardHtml).join('')}
    </div>
  `;
}

function renderModules() {
  const box = $('#modulesPanel');
  if (!box) return;
  box.innerHTML = `
    <section class="module-hero">
      <p class="eyebrow">Карта можливостей</p>
      <h2>Що саме AI-оператор бере на себе замість окремої команди</h2>
      <p>Це не меню функцій. Це карта бізнес-напрямків: сайт і SEO, клієнти й повтори, реклама й конкуренти, дані магазину і безпека виконання.</p>
    </section>
    <div class="module-group-list">
      ${moduleGroups.map(group => `
        <section class="module-group">
          <div class="section-head compact-head">
            <div>
              <h2>${escapeHtml(group.title)}</h2>
              <p>${escapeHtml(group.note)}</p>
            </div>
          </div>
          <div class="module-grid">
            ${group.cards.map(moduleCardHtml).join('')}
          </div>
        </section>
      `).join('')}
    </div>
  `;
}

function renderContentTools() {
  const box = $('#contentTools');
  if (!box) return;
  box.innerHTML = renderModuleStrip([
    {
      title: 'Що виправити на сайті',
      note: 'Сторінки, де система вже бачить шанс отримати більше кліків або зробити покупцю зрозуміліше.',
      view: 'content',
      cta: 'Працювати тут'
    },
    {
      title: 'Оформити товар або послугу',
      note: 'URL або назва, факти для покупця, SEO, характеристики, preview, dry-run і безпечний запис.',
      view: 'productCard',
      cta: 'Оформити'
    },
    {
      title: 'Категорії',
      note: 'Де треба title, meta, H1, опис або привʼязка URL, щоб категорія не була порожньою для Google і покупця.',
      contentType: 'category',
      cta: 'Категорії'
    },
    {
      title: 'Інформаційні сторінки',
      note: 'Посадкові, довідкові й комерційні сторінки, які мають пояснювати покупцю, чому варто замовити.',
      contentType: 'page',
      cta: 'Сторінки'
    }
  ]);
}

function productCardState() {
  return state.productCard || {};
}

function productCardForm() {
  const valueOf = (selector, fallback = '') => {
    const el = $(selector);
    return el ? el.value.trim() : fallback;
  };
  const checkedOf = (selector, fallback = false) => {
    const el = $(selector);
    return el ? Boolean(el.checked) : Boolean(fallback);
  };
  const fallback = productCardState().form || {};
  return {
    mode: valueOf('#productCardMode', fallback.mode || 'existing'),
    targetUrl: valueOf('#productTargetUrl', fallback.targetUrl || ''),
    productName: valueOf('#productNameInput', fallback.productName || ''),
    productType: valueOf('#productTypeInput', fallback.productType || 'coffee'),
    origin: valueOf('#productOriginInput', fallback.origin || ''),
    region: valueOf('#productRegionInput', fallback.region || ''),
    processing: valueOf('#productProcessingInput', fallback.processing || ''),
    flavors: valueOf('#productFlavorsInput', fallback.flavors || ''),
    brewing: valueOf('#productBrewingInput', fallback.brewing || ''),
    keywords: valueOf('#productKeywordsInput', fallback.keywords || ''),
    links: valueOf('#productLinksInput', fallback.links || ''),
    price: valueOf('#productPriceInput', fallback.price || ''),
    categoryName: valueOf('#productCategoryInput', fallback.categoryName || ''),
    manufacturerName: valueOf('#productManufacturerInput', fallback.manufacturerName || 'Mercato'),
    seoKeyword: valueOf('#productSeoKeywordInput', fallback.seoKeyword || ''),
    publishNow: checkedOf('#productPublishNowInput', fallback.publishNow),
    useMarketContext: checkedOf('#productMarketContextInput', fallback.useMarketContext !== false)
  };
}

function patchProductCard(patch = {}) {
  setState({
    productCard: {
      ...productCardState(),
      ...patch,
      form: {
        ...(productCardState().form || {}),
        ...(patch.form || {})
      }
    }
  });
}

function productTypeOptions(selected = 'coffee') {
  const rows = [
    ['coffee', 'Кава'],
    ['tea', 'Чай'],
    ['coffee_set', 'Кавовий набір'],
    ['tea_set', 'Чайний набір'],
    ['gift_set', 'Подарунковий набір']
  ];
  return rows.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
}

function attributesToText(attributes = {}) {
  return Object.entries(attributes || {})
    .filter(([name, value]) => String(name || '').trim() && String(value ?? '').trim())
    .map(([name, value]) => `${name}: ${value}`)
    .join('\n');
}

function parseAttributesText(text = '') {
  const attributes = {};
  String(text || '').split(/\n+/).forEach(line => {
    const clean = line.trim();
    if (!clean) return;
    const index = clean.indexOf(':');
    if (index === -1) return;
    const key = clean.slice(0, index).trim();
    const value = clean.slice(index + 1).trim();
    if (key && value) attributes[key] = value;
  });
  return attributes;
}

function productCardDraft() {
  const generated = productCardState().generated || {};
  const valueOf = (selector, fallback = '') => {
    const el = $(selector);
    return el ? el.value : fallback;
  };
  return {
    title: valueOf('#productTitleInput', generated.title || '').trim(),
    metaDescription: valueOf('#productMetaInput', generated.metaDescription || '').trim(),
    h1: valueOf('#productH1Input', generated.h1 || '').trim(),
    content: valueOf('#productContentInput', generated.content || ''),
    attributes: parseAttributesText(valueOf('#productAttributesInput', attributesToText(generated.attributes || {}))),
    rightCard: generated.rightCard || ''
  };
}

function productCardPayload() {
  const form = productCardForm();
  const draft = productCardDraft();
  return productCardPayloadFromParts(form, draft);
}

function productCardPayloadFromParts(form = {}, draft = {}) {
  const mode = form.mode === 'new' ? 'new' : 'existing';
  return {
    type: 'product',
    mode,
    url: form.targetUrl,
    targetUrl: form.targetUrl,
    productName: form.productName || draft.h1 || draft.title,
    productType: form.productType,
    origin: form.origin,
    region: form.region,
    processing: form.processing,
    flavors: form.flavors,
    brewing: form.brewing,
    title: draft.title,
    metaDescription: draft.metaDescription,
    h1: draft.h1,
    content: draft.content,
    rightCard: draft.rightCard,
    attributes: draft.attributes,
    price: form.price,
    categoryName: form.categoryName,
    manufacturerName: form.manufacturerName,
    seoKeyword: form.seoKeyword,
    updateCommerce: mode === 'new',
    updatePrice: mode === 'new' && Boolean(form.price),
    publishNow: mode === 'new' ? Boolean(form.publishNow) : true,
    allowProductFields: true,
    isHtml: true,
    source: 'app_v2_product_card'
  };
}

function productCardPayloadFromState(form = {}, generated = {}) {
  return productCardPayloadFromParts(form, {
    title: generated.title || '',
    metaDescription: generated.metaDescription || '',
    h1: generated.h1 || '',
    content: generated.content || '',
    attributes: generated.attributes || {},
    rightCard: generated.rightCard || ''
  });
}

function productCardGeneratedWithPayload(payload = {}) {
  return {
    ...(productCardState().generated || {}),
    title: payload.title || '',
    metaDescription: payload.metaDescription || '',
    h1: payload.h1 || '',
    content: payload.content || '',
    attributes: payload.attributes || {},
    rightCard: payload.rightCard || ''
  };
}

function productCardPayloadSignature(payload = {}) {
  return JSON.stringify({
    mode: payload.mode || '',
    url: payload.url || '',
    productName: payload.productName || '',
    title: payload.title || '',
    metaDescription: payload.metaDescription || '',
    h1: payload.h1 || '',
    content: payload.content || '',
    attributes: payload.attributes || {},
    price: payload.price || '',
    categoryName: payload.categoryName || '',
    manufacturerName: payload.manufacturerName || '',
    seoKeyword: payload.seoKeyword || '',
    publishNow: Boolean(payload.publishNow)
  });
}

function productCardReadiness(payload = {}, result = null) {
  const attributesCount = Object.keys(payload.attributes || {}).length;
  const dryRunFresh = Boolean(
    result
    && result.ok !== false
    && result.dryRun
    && result._payloadSignature === productCardPayloadSignature(payload)
  );
  const rows = [
    {
      label: 'Товар',
      ok: Boolean(payload.productName),
      note: payload.productName ? payload.productName : 'вкажіть назву товару'
    },
    {
      label: payload.mode === 'new' ? 'Нова чернетка' : 'URL існуючого товару',
      ok: payload.mode === 'new' ? true : Boolean(payload.url),
      note: payload.mode === 'new'
        ? 'можна створити товар у OpenCart після dry-run'
        : (payload.url ? 'є куди записувати' : 'для існуючого товару потрібен URL')
    },
    {
      label: 'SEO і опис',
      ok: Boolean(payload.title && payload.metaDescription && payload.h1 && payload.content),
      note: payload.title && payload.content ? 'title/meta/H1/HTML готові' : 'натисніть “Згенерувати картку”'
    },
    {
      label: 'Характеристики',
      ok: attributesCount > 0,
      note: attributesCount ? `${attributesCount.toLocaleString('uk')} характеристик для OpenCart` : 'права картка буде порожньою'
    },
    {
      label: 'Dry-run',
      ok: dryRunFresh,
      note: dryRunFresh ? 'перевірено саме цю версію' : 'потрібна перевірка без запису'
    }
  ];
  return {
    rows,
    blockers: rows.filter(row => !row.ok && row.label !== 'Dry-run'),
    dryRunFresh
  };
}

function productCardCurrentHtml(current = null) {
  if (!current) {
    return `
      <section class="product-side-panel">
        <p class="eyebrow">OpenCart зараз</p>
        <h3>Поточну картку ще не прочитано</h3>
        <p>Для існуючого товару вставте URL і натисніть “Прочитати OpenCart”. Так буде видно, що вже є в БД і які характеристики система замінить.</p>
      </section>
    `;
  }
  const snapshot = current.snapshot || {};
  const attrs = snapshot.attributes || {};
  return `
    <section class="product-side-panel">
      <p class="eyebrow">OpenCart зараз</p>
      <h3>${escapeHtml(snapshot.name || snapshot.meta_h1 || snapshot.meta_title || 'Товар прочитано')}</h3>
      <dl class="product-current-list">
        <dt>Title</dt><dd>${escapeHtml(snapshot.meta_title || 'порожньо')}</dd>
        <dt>Meta</dt><dd>${escapeHtml(snapshot.meta_description || 'порожньо')}</dd>
        <dt>H1</dt><dd>${escapeHtml(snapshot.meta_h1 || snapshot.name || 'порожньо')}</dd>
        <dt>Опис</dt><dd>${Number(snapshot.descriptionLength || 0).toLocaleString('uk')} символів</dd>
        <dt>Характеристики</dt><dd>${Object.keys(attrs).length.toLocaleString('uk')}</dd>
      </dl>
      ${current.warning ? `<div class="publish-result warn"><strong>Дані прочитані не повністю</strong><span>${escapeHtml(current.warning)}</span></div>` : ''}
    </section>
  `;
}

function productCardPublishResultHtml(result = null) {
  if (!result) return '<p class="muted-copy">Після генерації натисніть dry-run. Запис у OpenCart буде заблокований, поки dry-run не пройде для поточної версії.</p>';
  const ok = result.ok !== false;
  const verification = result.verification || {};
  const db = verification.dbReadback || {};
  return `
    <div class="publish-result ${ok ? 'ok' : 'fail'}">
      <strong>${result.dryRun ? 'Dry-run готовий' : ok ? 'Publish виконано' : 'Publish зупинено'}</strong>
      <span>${escapeHtml(result.message || result.error || verification.reason || '')}</span>
      ${result.url ? `<a href="${escapeHtml(result.url)}" target="_blank" rel="noopener">${escapeHtml(result.url)}</a>` : ''}
      <ul class="plain-list compact-list">
        <li>Mode: ${escapeHtml(result.mode || '')}</li>
        <li>OpenCart ID: ${escapeHtml(result.product_id || result.id || result.payload?.product_id || 'поки немає')}</li>
        <li>DB readback: ${db.ok ? 'OK' : db.titleOk || db.descriptionOk || db.attributesOk ? 'частково' : 'немає даних'}</li>
        <li>Live verification: ${verification.checked ? (verification.ok ? 'OK' : 'не підтверджено') : 'не запускалась'}</li>
      </ul>
    </div>
  `;
}

function renderProductCard() {
  const box = $('#productCardPanel');
  if (!box) return;
  const card = productCardState();
  const form = card.form || {};
  const generated = card.generated || {};
  const draft = {
    title: generated.title || '',
    metaDescription: generated.metaDescription || '',
    h1: generated.h1 || '',
    content: generated.content || '',
    attributesText: attributesToText(generated.attributes || {})
  };
  const payload = productCardPayloadFromState(form, generated);
  const readiness = productCardReadiness(payload, card.publishResult);
  const canPublish = readiness.dryRunFresh && !readiness.blockers.length;
  const mode = form.mode || 'existing';
  box.innerHTML = `
    <section class="product-card-hero">
      <div>
        <p class="eyebrow">Товар або послуга</p>
        <h2>Оформити сторінку так, ніби у вас є контентник, SEO-спеціаліст і маркетолог</h2>
        <p>Вставте URL існуючого товару або назву нового лоту/послуги. Система збирає факти, готує опис для покупця, SEO-поля і OpenCart-характеристики. Live-запис тільки після dry-run.</p>
      </div>
      <aside>
        <span>Що зміниться</span>
        <strong>Сторінка стане зрозумілішою для покупця і помітнішою для Google</strong>
        <small>Для існуючої сторінки потрібен URL. Для нового товару publish створює OpenCart-чернетку, якщо bridge підтримує product commerce.</small>
      </aside>
    </section>

    <section class="product-card-layout">
      <div class="product-card-column">
        <section class="product-card-panel">
          <div class="section-head compact-head">
            <div>
              <p class="eyebrow">1. Що робимо</p>
              <h3>Що продаємо і кому</h3>
              <p>Тут має бути мова власника: що за товар або послуга, чим відрізняється, кому підходить і чому це варто купити.</p>
            </div>
          </div>
          <div class="product-form-grid">
            <label>Режим
              <select id="productCardMode" data-product-card-mode>
                <option value="existing" ${mode === 'existing' ? 'selected' : ''}>Заповнити існуючий товар</option>
                <option value="new" ${mode === 'new' ? 'selected' : ''}>Створити нову чернетку</option>
              </select>
            </label>
            <label class="wide">URL існуючого товару
              <input id="productTargetUrl" value="${escapeHtml(form.targetUrl || '')}" placeholder="https://mercato.com.ua/...">
            </label>
            <label class="wide">Назва товару або послуги
              <input id="productNameInput" value="${escapeHtml(form.productName || '')}" placeholder="Наприклад: Кава Мексика Марагоджип або консультація з підбору кави">
            </label>
            <label>Тип
              <select id="productTypeInput">${productTypeOptions(form.productType || 'coffee')}</select>
            </label>
            <label>Країна / контекст
              <input id="productOriginInput" value="${escapeHtml(form.origin || '')}" placeholder="Мексика">
            </label>
            <label>Регіон / ферма
              <input id="productRegionInput" value="${escapeHtml(form.region || '')}" placeholder="Chiapas, Finca ...">
            </label>
            <label>Обробка / сорт
              <input id="productProcessingInput" value="${escapeHtml(form.processing || '')}" placeholder="washed, Maragogype">
            </label>
            <label class="wide">Смак / факти для покупця
              <textarea id="productFlavorsInput" rows="3" placeholder="шоколад, мед, сухофрукти; новий врожай; обмежена партія">${escapeHtml(form.flavors || '')}</textarea>
            </label>
            <label class="wide">Заварювання / кому підійде
              <textarea id="productBrewingInput" rows="2" placeholder="фільтр, еспресо, турка; для тих, хто любить мʼяку солодку каву">${escapeHtml(form.brewing || '')}</textarea>
            </label>
            <label>Ключові слова
              <input id="productKeywordsInput" value="${escapeHtml(form.keywords || '')}" placeholder="мексика марагоджип купити">
            </label>
            <label>Посилання для опису
              <input id="productLinksInput" value="${escapeHtml(form.links || '')}" placeholder="Кава в зернах | Доставка | Оплата">
            </label>
            <label class="product-checkbox-row">
              <input id="productMarketContextInput" type="checkbox" ${form.useMarketContext === false ? '' : 'checked'}>
              <span>Додати market/SEO research</span>
            </label>
          </div>
          <div class="product-actions-row">
            <button class="button secondary" data-product-import ${card.importLoading ? 'disabled' : ''}>${card.importLoading ? 'Імпортую' : 'Імпорт з URL'}</button>
            <button class="button secondary" data-product-read ${card.readLoading ? 'disabled' : ''}>${card.readLoading ? 'Читаю' : 'Прочитати OpenCart'}</button>
            <button class="button primary" data-product-generate ${card.loading ? 'disabled' : ''}>${card.loading ? 'Генерую' : 'Згенерувати картку'}</button>
          </div>
          ${card.error ? `<div class="publish-result fail"><strong>Помилка</strong><span>${escapeHtml(card.error)}</span></div>` : ''}
          ${card.warning ? `<div class="publish-result warn"><strong>Увага</strong><span>${escapeHtml(card.warning)}</span></div>` : ''}
        </section>

        <section class="product-card-panel new-product-fields ${mode === 'new' ? 'visible' : ''}">
          <p class="eyebrow">Для нового товару</p>
          <h3>OpenCart-чернетка</h3>
          <p>Для нового товару краще створювати вимкнену чернетку, перевірити її в OpenCart, і тільки потім активувати на сайті.</p>
          <div class="product-form-grid">
            <label>Ціна
              <input id="productPriceInput" value="${escapeHtml(form.price || '')}" placeholder="650">
            </label>
            <label>Категорія
              <input id="productCategoryInput" value="${escapeHtml(form.categoryName || '')}" placeholder="Кава в зернах">
            </label>
            <label>Виробник
              <input id="productManufacturerInput" value="${escapeHtml(form.manufacturerName || 'Mercato')}" placeholder="Mercato">
            </label>
            <label class="wide">SEO keyword / slug
              <input id="productSeoKeywordInput" value="${escapeHtml(form.seoKeyword || '')}" placeholder="kava-meksyka-maragodzhyp">
            </label>
            <label class="product-checkbox-row wide">
              <input id="productPublishNowInput" type="checkbox" ${form.publishNow ? 'checked' : ''}>
              <span>Одразу активувати товар на сайті</span>
            </label>
          </div>
        </section>

        ${productCardCurrentHtml(card.current)}
      </div>

      <div class="product-card-column">
        <section class="product-card-panel">
          <div class="section-head compact-head">
            <div>
              <p class="eyebrow">2. Готовність</p>
              <h3>${canPublish ? 'Можна публікувати' : readiness.blockers.length ? 'Спочатку заповнити картку' : 'Зробіть dry-run'}</h3>
              <p>${canPublish ? 'Поточна версія пройшла dry-run. Якщо preview нижче нормальний, можна публікувати.' : readiness.blockers.length ? `Блокує: ${readiness.blockers.map(row => row.label).join(', ')}.` : 'Перевірка без запису покаже, який payload піде в OpenCart.'}</p>
            </div>
            <div class="content-actions">
              <button class="button secondary" data-product-dry-run ${generated.title ? '' : 'disabled'}>1. Dry-run</button>
              <button class="button primary" data-product-publish ${canPublish ? '' : 'disabled'}>2. Опублікувати</button>
            </div>
          </div>
          <div class="product-readiness-grid">
            ${readiness.rows.map(row => `
              <article class="${row.ok ? 'ok' : 'pending'}">
                <strong>${escapeHtml(row.label)}</strong>
                <span>${escapeHtml(row.note)}</span>
              </article>
            `).join('')}
          </div>
          <div class="product-publish-result" id="productPublishResult">${productCardPublishResultHtml(card.publishResult)}</div>
        </section>

        <section class="product-card-panel product-draft-panel">
          <div class="section-head compact-head">
            <div>
              <p class="eyebrow">3. Чернетка</p>
              <h3>Редагується перед записом</h3>
              <p>Це те, що реально піде в OpenCart. Характеристики нижче відповідають правій картці товару.</p>
            </div>
          </div>
          <div class="editor-grid">
            <label>Title<input id="productTitleInput" data-product-draft-field value="${escapeHtml(draft.title)}" placeholder="SEO title"></label>
            <label>H1<input id="productH1Input" data-product-draft-field value="${escapeHtml(draft.h1)}" placeholder="H1 товару"></label>
            <label class="wide">Meta description<textarea id="productMetaInput" data-product-draft-field>${escapeHtml(draft.metaDescription)}</textarea></label>
          </div>
          <section class="customer-copy-card">
            <div>
              <p class="eyebrow">Preview для покупця</p>
              <h3>${escapeHtml(draft.h1 || form.productName || 'Опис ще не згенеровано')}</h3>
            </div>
            <div class="customer-copy-preview" id="productCustomerPreview">${safePreviewHtml(draft.content || '<p>Після генерації тут буде опис товару.</p>')}</div>
          </section>
          <details class="html-editor-details" open>
            <summary>HTML опис</summary>
            <label class="html-editor-label">Опис товару<textarea id="productContentInput" data-product-draft-field>${escapeHtml(draft.content)}</textarea></label>
          </details>
          <details class="html-editor-details" open>
            <summary>Характеристики OpenCart / права картка</summary>
            <label class="html-editor-label">Формат: Назва: значення<textarea id="productAttributesInput" data-product-draft-field placeholder="Кислотність: 6&#10;Солодкість: 7&#10;Тіло: 6&#10;Смак: шоколад, мед, сухофрукти">${escapeHtml(draft.attributesText)}</textarea></label>
          </details>
        </section>
      </div>
    </section>
  `;
}

function refreshProductCardDraftAssist() {
  const card = productCardState();
  const payload = productCardPayload();
  const readiness = productCardReadiness(payload, card.publishResult);
  const canPublish = readiness.dryRunFresh && !readiness.blockers.length;
  const preview = $('#productCustomerPreview');
  if (preview) preview.innerHTML = safePreviewHtml(payload.content || '<p>Після генерації тут буде опис товару.</p>');
  document.querySelectorAll('[data-product-publish]').forEach(button => {
    button.disabled = !canPublish;
  });
}

async function importProductUrl() {
  const form = productCardForm();
  if (!form.targetUrl) {
    toast('Вставте URL товару для імпорту.');
    return;
  }
  patchProductCard({ importLoading: true, error: '', warning: '', form });
  try {
    setSync('Імпорт URL');
    const imported = await importSeoUrl({ url: form.targetUrl, targetType: 'product' });
    patchProductCard({
      importLoading: false,
      warning: imported.importNote || '',
      form: {
        ...form,
        targetUrl: imported.importedUrl || form.targetUrl,
        productName: imported.productName || form.productName,
        origin: imported.origin || form.origin,
        region: imported.region || form.region,
        processing: imported.processing || form.processing,
        flavors: imported.flavors || form.flavors,
        brewing: imported.brewing || form.brewing,
        keywords: form.keywords || imported.productName || form.productName
      }
    });
    setSync('Синхронізовано');
    toast('URL прочитано. Перевірте факти і генеруйте картку.');
  } catch (error) {
    patchProductCard({ importLoading: false, error: error.message || String(error), form });
    setSync('Помилка', 'error');
    toast(error.message || String(error));
  }
}

async function readProductFromOpenCart() {
  const form = productCardForm();
  if (!form.targetUrl) {
    toast('Для читання OpenCart вставте URL існуючого товару.');
    return;
  }
  patchProductCard({ readLoading: true, error: '', warning: '', form });
  try {
    setSync('Читаю OpenCart');
    const current = await readOpenCartProduct({ url: form.targetUrl });
    const snapshot = current.snapshot || {};
    patchProductCard({
      readLoading: false,
      current,
      form: {
        ...form,
        productName: form.productName || snapshot.name || snapshot.meta_h1 || snapshot.meta_title || '',
        targetUrl: form.targetUrl || current.url || ''
      }
    });
    setSync('Синхронізовано');
    toast('Поточний товар прочитано з OpenCart.');
  } catch (error) {
    patchProductCard({ readLoading: false, error: error.message || String(error), form });
    setSync('Помилка', 'error');
    toast(error.message || String(error));
  }
}

async function generateProductCard() {
  const form = productCardForm();
  if (!form.productName) {
    toast('Вкажіть назву товару.');
    return;
  }
  patchProductCard({ loading: true, error: '', warning: '', form, publishResult: null });
  try {
    setSync('Генерація картки');
    const generated = await generateSeoPackage({
      productName: form.productName,
      productType: form.productType,
      targetType: 'product',
      targetUrl: form.targetUrl,
      origin: form.origin,
      region: form.region,
      processing: form.processing,
      flavors: form.flavors,
      brewing: form.brewing,
      keywords: form.keywords || form.productName,
      links: form.links,
      outputFormat: 'html',
      useMarketContext: form.useMarketContext !== false
    });
    patchProductCard({
      loading: false,
      generated,
      publishResult: null,
      warning: generated.research?.cached ? 'Використано кешований research для цього місяця.' : '',
      form
    });
    setSync('Синхронізовано');
    toast('Картку згенеровано. Перевірте опис і характеристики.');
  } catch (error) {
    patchProductCard({ loading: false, error: error.message || String(error), form });
    setSync('Помилка', 'error');
    toast(error.message || String(error));
  }
}

async function runProductCardPublish({ dryRun = true } = {}) {
  const form = productCardForm();
  const payload = productCardPayload();
  const signature = productCardPayloadSignature(payload);
  const readiness = productCardReadiness(payload, productCardState().publishResult);
  if (readiness.blockers.length) {
    patchProductCard({
      form,
      publishResult: {
        ok: false,
        error: `Не готово: ${readiness.blockers.map(row => row.label).join(', ')}.`,
        _payloadSignature: signature
      }
    });
    toast('Картка ще не готова до dry-run.');
    return;
  }
  if (!dryRun) {
    const previous = productCardState().publishResult || null;
    if (!previous || previous.ok === false || !previous.dryRun || previous._payloadSignature !== signature) {
      patchProductCard({
        form,
        publishResult: {
          ok: false,
          error: 'Спочатку зробіть dry-run для саме цієї версії картки. Після будь-якої зміни dry-run треба повторити.',
          _payloadSignature: signature
        }
      });
      toast('Publish заблоковано: потрібен актуальний dry-run.');
      return;
    }
  }
  patchProductCard({ form, error: '', warning: '' });
  try {
    setSync(dryRun ? 'Product dry-run' : 'Product publish');
    const result = await publishProductCard(payload, { dryRun });
    patchProductCard({
      form,
      generated: productCardGeneratedWithPayload(payload),
      publishResult: { ...result, _payloadSignature: signature }
    });
    setSync('Синхронізовано');
    toast(dryRun ? 'Dry-run товару готовий.' : 'Картку товару відправлено в OpenCart.');
  } catch (error) {
    patchProductCard({
      form,
      publishResult: { ok: false, error: error.message || String(error), _payloadSignature: signature }
    });
    setSync('Помилка', 'error');
    toast(error.message || String(error));
  }
}

function contentRowHtml(item, active = false) {
  const needsMapping = item.status === 'content_gap';
  return `
    <article class="content-row ${active ? 'active' : ''} ${needsMapping ? 'needs-mapping' : ''}" data-content-id="${escapeHtml(item.id)}">
      <div class="content-row-main">
        <span class="pill ${escapeHtml(item.priority || '')}">${escapeHtml(needsMapping ? 'Потрібна привʼязка' : item.typeLabel || item.type || 'Контент')}</span>
        <strong>${escapeHtml(item.name || item.summary || 'Без назви')}</strong>
        <small>${escapeHtml(item.url || item.summary || '')}</small>
      </div>
      <span class="content-row-impact">${escapeHtml(item.expectedImpact || '')}</span>
    </article>
  `;
}

function renderEvidenceSources(sources = []) {
  if (!sources.length) return '<p class="muted-copy">Джерела ще не деталізовані для цієї дії.</p>';
  return `
    <div class="source-list">
      ${sources.map(source => `
        <article class="source-row ${escapeHtml(source.status || '')}">
          <strong>${escapeHtml(source.label || source.id || 'Джерело')}</strong>
          <span>${escapeHtml(source.freshness || '')}</span>
          <small>${escapeHtml(source.details || '')}</small>
        </article>
      `).join('')}
    </div>
  `;
}

function safePreviewHtml(html = '') {
  return String(html || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/javascript:/gi, '');
}

function publishNextStepHtml(result = null, canPublish = false, itemId = '') {
  if (!result) {
    return `
      <div class="next-step-card neutral">
        <strong>Що робити зараз</strong>
        <p>Перевірте title, meta, H1 і текст для покупця нижче. Потім натисніть <b>Dry-run</b>. Це перевірка без запису в OpenCart.</p>
      </div>`;
  }
  if (result.ok === false) {
    return `
      <div class="next-step-card danger">
        <strong>Publish зупинено</strong>
        <p>${escapeHtml(result.error || result.message || 'Система знайшла ризик у чернетці.')}</p>
        <ol>
          <li>Приберіть службові фрази типу “поясніть”, “додайте”, “GSC”, “OpenCart readback”.</li>
          <li>Залиште тільки текст, який може прочитати покупець на сайті.</li>
          <li>Натисніть <b>Виправити чернетку</b>, потім <b>Dry-run</b> ще раз.</li>
        </ol>
        <button class="button secondary" data-content-repair="${escapeHtml(itemId)}">Виправити чернетку автоматично</button>
      </div>`;
  }
  if (result.dryRun && canPublish) {
    return `
      <div class="next-step-card success">
        <strong>Dry-run пройдено</strong>
        <p>Ця версія чернетки перевірена. Якщо текст нижче виглядає нормально для покупця, можна натиснути <b>Опублікувати</b>.</p>
      </div>`;
  }
  return `
    <div class="next-step-card neutral">
      <strong>Потрібен новий dry-run</strong>
      <p>Чернетка змінилась після перевірки або результат застарів. Натисніть <b>Dry-run</b> перед publish.</p>
    </div>`;
}

function publishResultHtml(result = null) {
  if (!result) return '<p class="muted-copy">Спочатку зробіть dry-run. Publish доступний тільки після перевірки payload.</p>';
  const ok = result.ok !== false;
  const verification = result.verification || {};
  const db = verification.dbReadback || {};
  return `
    <div class="publish-result ${ok ? 'ok' : 'fail'}">
      <strong>${result.dryRun ? 'Dry-run готовий' : ok ? 'Publish виконано' : 'Publish потребує уваги'}</strong>
      <span>${escapeHtml(result.message || result.error || '')}</span>
      ${result.url ? `<a href="${escapeHtml(result.url)}" target="_blank" rel="noopener">${escapeHtml(result.url)}</a>` : ''}
      <ul class="plain-list">
        <li>Bridge diagnostics: ${result.bridgeDiagnosticsOk === false ? 'немає' : 'OK / не потрібно для dry-run'}</li>
        <li>Live verification: ${verification.checked ? (verification.ok ? 'OK' : 'не підтверджено') : 'не запускалась'}</li>
        <li>DB readback: ${db.ok ? 'OK' : db.titleOk || db.descriptionOk ? 'частково' : 'немає даних'}</li>
      </ul>
    </div>
  `;
}

function fieldValue(item, key) {
  const draft = item.draft || {};
  if (key === 'title') return draft.title || item.proposed?.title || '';
  if (key === 'metaDescription') return draft.metaDescription || item.proposed?.metaDescription || '';
  if (key === 'h1') return draft.h1 || item.proposed?.h1 || '';
  if (key === 'content') return draft.content || item.preview?.plain || '';
  return draft[key] || '';
}

function contentPayloadSignature(payload = {}) {
  return JSON.stringify({
    type: payload.type || '',
    mode: payload.mode || '',
    url: payload.url || '',
    productName: payload.productName || '',
    title: payload.title || '',
    metaDescription: payload.metaDescription || '',
    h1: payload.h1 || '',
    content: payload.content || '',
    allowProductFields: payload.allowProductFields === false ? false : true
  });
}

function contentDraftPayloadFromItem(item) {
  const draft = item.draft || {};
  return {
    ...draft,
    title: fieldValue(item, 'title'),
    metaDescription: fieldValue(item, 'metaDescription'),
    h1: fieldValue(item, 'h1'),
    content: fieldValue(item, 'content'),
    url: draft.url || item.url || '',
    productName: draft.productName || item.name || ''
  };
}

function plainTextFromHtml(html = '') {
  return String(html || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function contentDraftChecks(payload = {}, publishResult = null) {
  const content = String(payload.content || '');
  const plain = plainTextFromHtml(content);
  const lower = `${payload.title || ''} ${payload.metaDescription || ''} ${payload.h1 || ''} ${plain}`.toLowerCase();
  const internalPatterns = [
    { test: /має\s+працювати\s+як/iu, label: 'службова фраза “має працювати як”' },
    { test: /що\s+підсилюємо\s+після\s+аналізу/iu, label: 'внутрішній блок про аналіз конкурентів' },
    { test: /основа\s+генерації|gsc[-\s]?сигнал|open\s*cart\s+readback|opencart\s+readback|модель\s+потенціалу/iu, label: 'службові джерела генерації' },
    { test: /поясніть\s+смаки|додайте\s+швидк|інструкція\s+оператору|винести\s+у\s+видимий\s+блок|long[-\s]?tail/iu, label: 'інструкція оператору замість тексту покупцю' }
  ];
  const internalHit = internalPatterns.find(pattern => pattern.test.test(lower));
  const dryRunFresh = Boolean(
    publishResult
    && publishResult.ok !== false
    && publishResult.dryRun
    && publishResult._payloadSignature === contentPayloadSignature(payload)
  );
  const rows = [
    {
      key: 'url',
      label: 'URL сторінки',
      ok: Boolean(payload.url),
      level: payload.url ? 'ok' : 'danger',
      note: payload.url ? 'є куди записувати' : 'немає URL для publish'
    },
    {
      key: 'seo',
      label: 'SEO поля',
      ok: Boolean(payload.title && payload.metaDescription && payload.h1),
      level: payload.title && payload.metaDescription && payload.h1 ? 'ok' : 'danger',
      note: payload.title && payload.metaDescription && payload.h1 ? 'title, meta і H1 заповнені' : 'заповніть title, meta і H1'
    },
    {
      key: 'customerText',
      label: 'Текст для покупця',
      ok: Boolean(plain),
      level: !plain ? 'danger' : plain.length < 220 ? 'warn' : 'ok',
      note: !plain ? 'немає опису' : plain.length < 220 ? 'опис дуже короткий, перевірте зміст' : `${plain.length.toLocaleString('uk')} символів без HTML`
    },
    {
      key: 'internal',
      label: 'Без службових інструкцій',
      ok: !internalHit,
      level: internalHit ? 'danger' : 'ok',
      note: internalHit ? internalHit.label : 'текст схожий на клієнтський'
    },
    {
      key: 'dryRun',
      label: 'Dry-run',
      ok: dryRunFresh,
      level: dryRunFresh ? 'ok' : 'warn',
      note: dryRunFresh ? 'перевірено саме цю версію' : 'потрібен перед publish'
    }
  ];
  const blockers = rows.filter(row => row.level === 'danger');
  return { rows, blockers, dryRunFresh, plainLength: plain.length };
}

function contentDraftChecklistHtml(payload = {}, publishResult = null, itemId = '') {
  const checks = contentDraftChecks(payload, publishResult);
  let nextTitle = 'Наступний крок';
  let nextText = 'Натисніть Dry-run. Це перевірка без запису в OpenCart.';
  let nextButton = '';

  if (checks.blockers.length) {
    nextTitle = 'Спочатку виправити чернетку';
    nextText = `Блокує: ${checks.blockers.map(row => row.label.toLowerCase()).join(', ')}. Publish не має сенсу, поки це не виправлено.`;
    nextButton = `<button class="button secondary" data-content-repair="${escapeHtml(itemId)}">Виправити чернетку автоматично</button>`;
  } else if (checks.dryRunFresh) {
    nextTitle = 'Можна публікувати';
    nextText = 'Ця версія пройшла dry-run. Якщо preview для покупця нижче виглядає нормально, натисніть “2. Опублікувати”.';
  } else if (publishResult?.ok === false) {
    nextTitle = 'Publish зупинено';
    nextText = publishResult.error || publishResult.message || 'Система знайшла ризик у чернетці. Виправте текст і повторіть dry-run.';
    nextButton = `<button class="button secondary" data-content-repair="${escapeHtml(itemId)}">Виправити чернетку автоматично</button>`;
  } else if (publishResult) {
    nextTitle = 'Повторити dry-run';
    nextText = 'Чернетка змінилась або попередня перевірка застаріла. Перед publish треба повторити dry-run.';
  }

  return `
    <section class="draft-checklist ${checks.blockers.length ? 'has-blockers' : checks.dryRunFresh ? 'ready' : 'needs-check'}">
      <div class="draft-check-head">
        <div>
          <p class="eyebrow">Готовність до publish</p>
          <h4>${escapeHtml(nextTitle)}</h4>
          <p>${escapeHtml(nextText)}</p>
        </div>
        ${nextButton}
      </div>
      <div class="draft-check-rows">
        ${checks.rows.map(row => `
          <div class="draft-check-row ${escapeHtml(row.level)}">
            <span class="draft-check-mark">${row.level === 'ok' ? 'OK' : row.level === 'warn' ? 'Check' : 'Stop'}</span>
            <strong>${escapeHtml(row.label)}</strong>
            <small>${escapeHtml(row.note)}</small>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function contentWorkflowPanelHtml(item, payload = {}, publishResult = null, canPublish = false) {
  const checks = contentDraftChecks(payload, publishResult);
  const hasBlockers = checks.blockers.length > 0;
  const dryRunFresh = checks.dryRunFresh;
  const steps = [
    {
      label: 'Preview покупця',
      note: checks.plainLength ? 'є текст для перегляду' : 'немає тексту',
      status: checks.plainLength ? 'done' : 'blocked'
    },
    {
      label: 'Прибрати блокери',
      note: hasBlockers ? checks.blockers.map(row => row.label).join(', ') : 'критичних блокерів немає',
      status: hasBlockers ? 'blocked' : 'done'
    },
    {
      label: 'Dry-run',
      note: dryRunFresh ? 'актуальний' : 'перевірка без запису',
      status: dryRunFresh ? 'done' : hasBlockers ? 'locked' : 'active'
    },
    {
      label: 'Publish',
      note: canPublish ? 'можна застосувати' : 'після dry-run',
      status: canPublish ? 'active' : 'locked'
    }
  ];
  const next = hasBlockers
    ? 'Натисніть “Виправити чернетку автоматично” або поправте поля вручну.'
    : canPublish
      ? 'Перевірте preview і натисніть “2. Опублікувати”.'
      : 'Перевірте preview, потім натисніть “1. Dry-run”.';

  return `
    <section class="content-operator-panel" id="contentWorkflowPanel">
      <div class="operator-main">
        <p class="eyebrow">Робочий маршрут</p>
        <h3>${escapeHtml(next)}</h3>
        <p>${escapeHtml(item.why || item.summary || item.expectedImpact || 'Система пропонує зміну, бо бачить органічну можливість або проблему якості сторінки.')}</p>
        <div class="operator-actions">
          <button class="button secondary" data-scroll-content-publish>До preview і полів</button>
          <button class="button secondary" data-content-dry-run="${escapeHtml(item.id)}" ${hasBlockers ? 'disabled' : ''}>1. Dry-run</button>
          <button class="button primary" data-content-publish="${escapeHtml(item.id)}" ${canPublish ? '' : 'disabled'}>2. Опублікувати</button>
        </div>
      </div>
      <div class="operator-change">
        <p class="eyebrow">Що буде записано</p>
        <dl>
          <dt>Title</dt><dd>${escapeHtml(payload.title || 'не заповнено')}</dd>
          <dt>Meta</dt><dd>${escapeHtml(payload.metaDescription || 'не заповнено')}</dd>
          <dt>H1</dt><dd>${escapeHtml(payload.h1 || 'не заповнено')}</dd>
        </dl>
      </div>
      <ol class="operator-steps">
        ${steps.map((step, index) => `
          <li class="${escapeHtml(step.status)}">
            <span>${index + 1}</span>
            <strong>${escapeHtml(step.label)}</strong>
            <small>${escapeHtml(step.note)}</small>
          </li>
        `).join('')}
      </ol>
    </section>
  `;
}

function contentPublishReady(item, result) {
  if (!item || !result || result.ok === false || !result.dryRun) return false;
  return result._payloadSignature === contentPayloadSignature(item.draft || {});
}

function renderContentList() {
  const items = filteredContentItems();
  const selected = selectedContentItem();
  const box = $('#contentList');
  if (!box) return;
  const typeFilter = $('#contentTypeFilter');
  if (typeFilter && typeFilter.value !== state.filters.contentType) typeFilter.value = state.filters.contentType;
  box.innerHTML = items.length
    ? items.map(item => contentRowHtml(item, selected?.id === item.id)).join('')
    : '<section class="empty-workflow"><h2>Немає задач по сторінках</h2><p>Оновіть дані або очистіть фільтр.</p></section>';
}

function renderContentGapDetail(item = {}) {
  const gsc = item.evidence?.gsc || {};
  const hasUrl = Boolean(item.url);
  return `
    <div class="content-titlebar">
      <div>
        <p class="eyebrow">Потрібна привʼязка / ${escapeHtml(priorityLabel(item.priority))}</p>
        <h2>${escapeHtml(item.name)}</h2>
        ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.url)}</a>` : ''}
      </div>
      <div class="content-actions">
        <button class="button primary" data-content-decision="${escapeHtml(item.id)}" data-status="done">Привʼязано</button>
        <button class="button secondary" data-content-decision="${escapeHtml(item.id)}" data-status="deferred">Пізніше</button>
        <button class="button secondary" data-content-decision="${escapeHtml(item.id)}" data-status="dismissed">Не чіпати</button>
      </div>
    </div>
    <section class="content-gap-panel">
      <div>
        <p class="eyebrow">Чому не можна одразу publish</p>
        <h3>${hasUrl ? 'Google уже бачить цю сторінку, але система не знає, що саме на ній змінювати' : 'Система знає задачу, але ще не має URL для безпечного запису'}</h3>
        <p>${escapeHtml(item.why || 'Спочатку підтвердьте тип сторінки і привʼяжіть її до товару, категорії або інформаційної сторінки. Після цього можна генерувати SEO-зміну.')}</p>
      </div>
      ${hasUrl ? `
        <div class="content-gap-metrics">
          <div><strong>${Number(gsc.impressions || 0).toLocaleString('uk')}</strong><span>показів</span></div>
          <div><strong>${Number(gsc.clicks || 0).toLocaleString('uk')}</strong><span>кліків</span></div>
          <div><strong>${Number(gsc.position || 0).toFixed(1)}</strong><span>позиція</span></div>
        </div>
      ` : `
        <div class="missing-target-card">
          <strong>Немає URL</strong>
          <span>Publish, dry-run і preview заблоковані, поки сторінку не привʼязано.</span>
        </div>
      `}
    </section>
    <section class="section-block">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Що зробити</p>
          <h3>Спочатку рішення, потім текст</h3>
          <p>Це не сторінка для “згенерувати і опублікувати”. Тут треба прийняти рішення, що це за URL і хто за нього відповідає.</p>
        </div>
      </div>
      <div class="setup-step-list">
        ${[
          [hasUrl ? 'Відкрити URL' : 'Знайти сторінку', hasUrl ? 'Перевірити, що бачить покупець і чи сторінка взагалі має комерційний сенс.' : 'Знайти товар, категорію або сторінку в OpenCart і підтвердити правильний URL.'],
          ['Визначити тип', 'Товар, категорія, стаття, посадкова чи сторінка, яку краще прибрати з SEO-черги.'],
          ['Привʼязати до задачі', 'Після привʼязки система зможе показати, що було на сторінці, що пропонує змінити, preview, dry-run і publish.']
        ].map(([title, body], index) => `
          <article class="setup-step">
            <span>${index + 1}</span>
            <div>
              <strong>${escapeHtml(title)}</strong>
              <p>${escapeHtml(body)}</p>
            </div>
          </article>
        `).join('')}
      </div>
    </section>
    <div class="content-bottom-grid">
      <section>
        <h3>Чому це потрапило в систему</h3>
        <p class="muted-copy">${escapeHtml(item.expectedImpact || '')}</p>
        ${renderEvidenceSources(item.evidence?.sources || [])}
      </section>
      <section>
        <h3>Контроль</h3>
        <ul class="plain-list">
          ${(item.workflow || []).map(step => `<li>${escapeHtml(step)}</li>`).join('')}
        </ul>
      </section>
    </div>
  `;
}

function renderContentDetail() {
  const item = selectedContentItem();
  const box = $('#contentDetail');
  if (!box) return;
  if (!item) {
    box.innerHTML = '<section class="empty-workflow"><h2>Оберіть сторінку</h2><p>Тут буде поточний стан, запропонована зміна і preview для власника.</p></section>';
    return;
  }
  if (item.status === 'content_gap') {
    box.innerHTML = renderContentGapDetail(item);
    return;
  }
  const current = item.current || {};
  const proposed = item.proposed || {};
  const gsc = item.evidence?.gsc || {};
  const publishResult = state.publishResults[item.id] || null;
  const canPublish = contentPublishReady(item, publishResult);
  const draftPayload = contentDraftPayloadFromItem(item);
  const draftContent = fieldValue(item, 'content');
  const hasCurrentData = Boolean(current.title || current.metaDescription || current.h1 || Number(current.descriptionLength || 0) || Number(current.score || 0));
  box.innerHTML = `
    <div class="content-titlebar">
      <div>
        <p class="eyebrow">${escapeHtml(item.typeLabel || item.type)} / ${escapeHtml(priorityLabel(item.priority))}</p>
        <h2>${escapeHtml(item.name)}</h2>
        ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${escapeHtml(item.url)}</a>` : ''}
      </div>
      <div class="content-actions">
        <button class="button primary" data-content-decision="${escapeHtml(item.id)}" data-status="done">Зроблено</button>
        <button class="button secondary" data-content-decision="${escapeHtml(item.id)}" data-status="deferred">Відкласти</button>
        <button class="button secondary" data-content-decision="${escapeHtml(item.id)}" data-status="dismissed">Прибрати</button>
      </div>
    </div>

    ${contentWorkflowPanelHtml(item, draftPayload, publishResult, canPublish)}

    <section class="content-reason">
      <strong>Чому це робимо</strong>
      <p>${escapeHtml(item.why || item.summary || '')}</p>
      <p>${escapeHtml(item.expectedImpact || '')}</p>
      <div class="content-metrics">
        <span>Покази: ${Number(gsc.impressions || 0).toLocaleString('uk')}</span>
        <span>Кліки: ${Number(gsc.clicks || 0).toLocaleString('uk')}</span>
        <span>CTR: ${formatPercent(gsc.ctr)}</span>
        <span>Позиція: ${Number(gsc.position || 0).toFixed(1)}</span>
      </div>
    </section>

    <div class="compare-grid">
      <section class="compare-card">
        <p class="eyebrow">Зараз</p>
        ${hasCurrentData ? `
          <dl>
            <dt>Title</dt><dd>${escapeHtml(current.title || 'Не прочитано')}</dd>
            <dt>Meta</dt><dd>${escapeHtml(current.metaDescription || 'Не прочитано')}</dd>
            <dt>H1</dt><dd>${escapeHtml(current.h1 || 'Не прочитано')}</dd>
            <dt>Опис</dt><dd>${Number(current.descriptionLength || 0).toLocaleString('uk')} символів</dd>
            <dt>SEO score</dt><dd>${Number(current.score || 0).toLocaleString('uk')}/100</dd>
          </dl>
        ` : `
          <div class="empty-current-state">
            <strong>Поточні SEO-поля ще не прочитані</strong>
            <p>Це не означає, що на сайті порожньо. Перед publish система все одно робить dry-run і readback, а якщо даних не вистачить - зупинить запис.</p>
          </div>
        `}
      </section>
      <section class="compare-card proposed">
        <p class="eyebrow">Після</p>
        <dl>
          <dt>Title</dt><dd>${escapeHtml(proposed.title || 'Чернетка не згенерована')}</dd>
          <dt>Meta</dt><dd>${escapeHtml(proposed.metaDescription || 'Чернетка не згенерована')}</dd>
          <dt>H1</dt><dd>${escapeHtml(proposed.h1 || 'Чернетка не згенерована')}</dd>
        </dl>
        <div class="mini-block-list">
          ${(proposed.htmlBlocks || []).slice(0, 3).map(block => `
            <article>
              <strong>${escapeHtml(block.title)}</strong>
              <span>${escapeHtml(block.text)}</span>
            </article>
          `).join('')}
        </div>
      </section>
    </div>

    <section class="snippet-preview">
      <p class="eyebrow">Preview перед застосуванням</p>
      <h3>${escapeHtml(item.preview?.snippet?.title || proposed.title || item.name)}</h3>
      <a href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener">${escapeHtml(item.url || 'mercato.com.ua')}</a>
      <p>${escapeHtml(item.preview?.snippet?.description || proposed.metaDescription || '')}</p>
      <pre>${escapeHtml(item.preview?.plain || '')}</pre>
    </section>

    <section class="publish-editor" id="contentPublishEditor">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Редагування і застосування</p>
          <h3>Що робити зараз</h3>
          <p>Не публікуємо службові інструкції. Спочатку дивимось текст для покупця, потім dry-run, тільки потім publish.</p>
        </div>
        <div class="content-actions">
          <button class="button secondary" data-content-dry-run="${escapeHtml(item.id)}">1. Dry-run</button>
          <button class="button primary" data-content-publish="${escapeHtml(item.id)}" ${canPublish ? '' : 'disabled'}>2. Опублікувати</button>
        </div>
      </div>
      <div id="contentDraftChecklist">${contentDraftChecklistHtml(draftPayload, publishResult, item.id)}</div>
      <div class="editor-grid">
        <label>Title<input data-content-field="title" value="${escapeHtml(fieldValue(item, 'title'))}"></label>
        <label>H1<input data-content-field="h1" value="${escapeHtml(fieldValue(item, 'h1'))}"></label>
        <label class="wide">Meta description<textarea data-content-field="metaDescription">${escapeHtml(fieldValue(item, 'metaDescription'))}</textarea></label>
      </div>
      <section class="customer-copy-card">
        <div>
          <p class="eyebrow">Текст, який побачить покупець</p>
          <h3>Preview опису</h3>
        </div>
        <div class="customer-copy-preview" id="customerCopyPreview">${safePreviewHtml(draftContent || '<p>Опис ще не підготовлений.</p>')}</div>
      </section>
      <details class="html-editor-details">
        <summary>Редагувати HTML вручну</summary>
        <label class="html-editor-label">HTML опис<textarea data-content-field="content">${escapeHtml(draftContent)}</textarea></label>
      </details>
      <details class="payload-details">
        <summary>Payload перед записом</summary>
        <pre>${escapeHtml(JSON.stringify(item.draft || {}, null, 2))}</pre>
      </details>
      <div id="publishResult">${publishResultHtml(publishResult)}</div>
    </section>

    <div class="content-bottom-grid">
      <section>
        <h3>Джерела рішення</h3>
        <p class="muted-copy">${escapeHtml(item.evidence?.verdict || '')}</p>
        ${renderEvidenceSources(item.evidence?.sources || [])}
      </section>
      <section>
        <h3>Контроль</h3>
        <ul class="plain-list">
          ${(item.workflow || []).map(step => `<li>${escapeHtml(step)}</li>`).join('')}
        </ul>
        <ul class="issue-list monitor-issues">
          ${(item.controls || []).map(step => `<li>${escapeHtml(step)}</li>`).join('')}
        </ul>
      </section>
    </div>
  `;
}

function renderCustomerDna() {
  const box = $('#customersPanel');
  if (!box) return;
  const dna = state.customerDna || {};
  const summary = dna.summary || {};
  const email = dna.email || {};
  const ready = dna.lists?.ready || [];
  const customers = Array.isArray(dna.customers) ? dna.customers : [];
  const communicationLog = Array.isArray(dna.communicationLog) ? dna.communicationLog : [];
  const cadence = dna.cadence || {};
  const statusLabels = {
    new: 'Новий',
    active: 'Активний',
    watch: 'Під увагою',
    risk: 'Ризик',
    churn: 'Сплячий',
    vip: 'VIP'
  };
  box.innerHTML = `
    <section class="content-titlebar">
      <div>
        <p class="eyebrow">Клієнтська памʼять</p>
        <h2>Хто купує, що любить, коли повертається і кому написати зараз</h2>
        <p class="muted-copy">Це місце, де власник бачить не просто email-адреси, а поведінку клієнтів, повторні покупки, смаки, паузи між замовленнями і результат листів.</p>
      </div>
      <button class="button primary" data-go="queue" data-filter-type="customer">Підготувати клієнтські дії</button>
    </section>
    <section class="metric-strip customer-metrics">
      ${[
        ['Клієнти', { value: Number(summary.customers || 0).toLocaleString('uk'), note: 'клієнтів', status: 'ok' }],
        ['Повтор', { value: Number(summary.readyToBuy || 0).toLocaleString('uk'), note: `${Number(summary.forecastRevenue || 0).toLocaleString('uk')} грн прогноз`, status: summary.readyToBuy ? 'warn' : 'ok' }],
        ['Email', { value: `${Number(email.ordered || 0).toLocaleString('uk')} зам.`, note: `${Number(email.revenueAfterCampaign || 0).toLocaleString('uk')} грн після email`, status: email.publicTrackingConfigured ? 'ok' : 'warn' }],
        ['Stop-list', { value: Number(summary.suppressed || 0).toLocaleString('uk'), note: 'у stop-list', status: summary.suppressed ? 'warn' : 'ok' }]
      ].map(([label, item]) => `
        <article class="metric ${escapeHtml(item.status)}">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
          <small>${escapeHtml(item.note)}</small>
        </article>
      `).join('')}
    </section>
    <section class="customer-intelligence-panel">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Customer Intelligence</p>
          <h3>Статус покупця рахується від його власного циклу, а не від календаря “раз на місяць”</h3>
          <p>${escapeHtml(cadence.note || 'Система дивиться на медіанний інтервал між замовленнями і реагує тільки на аномалії.')}</p>
        </div>
        <button class="button secondary" data-store-tool="customers">Відкрити клієнтську базу</button>
      </div>
      <div class="customer-status-grid">
        ${customers.slice(0, 10).map(customer => `
          <article class="${escapeHtml(customer.status || 'watch')}">
            <div>
              <strong>${escapeHtml(customer.name || customer.email || 'Клієнт')}</strong>
              <span>${escapeHtml(statusLabels[customer.status] || customer.status || 'Під увагою')}</span>
            </div>
            <p>${escapeHtml(customer.favoriteProduct || customer.proposedOffer || 'Потрібна історія замовлень для персонального сигналу.')}</p>
            <small>${[
              Number(customer.orders || 0) ? `${Number(customer.orders || 0).toLocaleString('uk')} зам.` : '',
              Number(customer.avgOrderValue || 0) ? `${Number(customer.avgOrderValue || 0).toLocaleString('uk')} грн чек` : '',
              customer.daysSinceLastOrder != null ? `${Number(customer.daysSinceLastOrder).toLocaleString('uk')} днів з останнього` : ''
            ].filter(Boolean).map(escapeHtml).join(' · ')}</small>
          </article>
        `).join('') || `
          <article class="empty-state-card">
            <div><strong>Потрібні клієнти й замовлення з OpenCart</strong><span>Підключення</span></div>
            <p>Після sync система покаже new/active/watch/risk/churn/vip і нормальний цикл покупок кожного клієнта.</p>
            <button class="button primary" data-view="connect">Підключити OpenCart</button>
          </article>
        `}
      </div>
      <div class="cadence-row">
        <article>
          <span>Метод</span>
          <strong>${escapeHtml(cadence.method || 'median_order_interval')}</strong>
          <p>Рахуємо звичну періодичність, щоб не чіпати людину, яка нормально купує раз на 2 місяці.</p>
        </article>
        <article>
          <span>Watch / risk</span>
          <strong>${escapeHtml(cadence.riskThreshold || '1.4x цикл')}</strong>
          <p>Пишемо тільки коли є відхилення від власного ритму клієнта.</p>
        </article>
        <article>
          <span>Churn</span>
          <strong>${escapeHtml(cadence.churnThreshold || '3x цикл або 90 днів')}</strong>
          <p>Сильніші реактивації, купон або персональна причина повернутись.</p>
        </article>
      </div>
    </section>
    ${renderModuleStrip([
      {
        title: 'Персональні листи',
        note: 'Привід кампанії, сегмент, чернетка, тест собі, відправка одному або групі і памʼять результату.',
        queueType: 'customer',
        cta: 'Підготувати листи'
      },
      {
        title: 'Клієнти до повторної покупки',
        note: 'Хто вже близько до наступного замовлення, кому доречно написати, кого не чіпати.',
        queueType: 'customer',
        cta: 'Черга клієнтів'
      },
      {
        title: 'Клієнтська база',
        note: 'Пошук людини, замовлення, середній чек, улюблені товари або послуги, швидкий перехід до персонального листа.',
        storeTool: 'customers',
        cta: 'Клієнти'
      },
      {
        title: 'Замовлення',
        note: 'Останні покупки, склад замовлення, статуси і сигнали для повторної покупки.',
        storeTool: 'orders',
        cta: 'Замовлення'
      }
    ])}
    <div class="content-bottom-grid">
      <section>
        <h3>Сегменти</h3>
        <div class="source-list">
          ${(dna.segments || []).map(segment => `
            <article class="source-row">
              <strong>${escapeHtml(segment.title || segment.id)}</strong>
              <span>${Number(segment.count || 0).toLocaleString('uk')} клієнтів · ${Number(segment.revenue || 0).toLocaleString('uk')} грн</span>
              <small>${(segment.topProducts || []).slice(0, 3).map(p => escapeHtml(p.name || p)).join(', ')}</small>
            </article>
          `).join('') || '<p class="muted-copy">Сегменти ще не завантажені.</p>'}
        </div>
      </section>
      <section>
        <h3>Готові до повторної покупки</h3>
        <div class="source-list">
          ${ready.slice(0, 8).map(customer => `
            <article class="source-row">
              <strong>${escapeHtml(customer.name || customer.email || 'Клієнт')}</strong>
              <span>${Number(customer.avgOrderValue || 0).toLocaleString('uk')} грн середній чек · ${escapeHtml(customer.favoriteProduct || '')}</span>
              <small>${escapeHtml(customer.proposedOffer || '')}</small>
            </article>
          `).join('') || '<p class="muted-copy">Немає клієнтів у вікні повторної покупки.</p>'}
        </div>
      </section>
    </div>
    <section class="section-block">
      <div class="section-head">
        <div>
          <h3>Що сталося після листів</h3>
          <p>Відправки, відкриття, кліки, замовлення після кампанії і stop-list, щоб не писати зайвим людям.</p>
        </div>
      </div>
      <div class="monitor-grid">
        ${(communicationLog.length ? communicationLog : (email.campaigns || [])).slice(0, 6).map(campaign => `
          <article class="monitor-card">
            <strong>${Number(campaign.sent || 0).toLocaleString('uk')} / ${Number(campaign.total || 0).toLocaleString('uk')}</strong>
            <span>${escapeHtml(campaign.title || campaign.subject || 'кампанія')} · ${escapeHtml(campaign.status || 'sent')} · ${Number(campaign.revenue || 0).toLocaleString('uk')} грн</span>
          </article>
        `).join('') || '<p class="muted-copy">Кампаній поки немає.</p>'}
      </div>
    </section>
  `;
}

function renderAds() {
  const box = $('#adsPanel');
  if (!box) return;
  const checks = Array.isArray(state.setupGuide?.checks) ? state.setupGuide.checks : [];
  const byId = Object.fromEntries(checks.map(check => [check.id, check]));
  const analytics = byId.analytics || {};
  const googleAds = byId['google-ads'] || {};
  const searchConsole = byId['search-console'] || {};
  box.innerHTML = `
    <section class="module-hero">
      <p class="eyebrow">Реклама і аналітика</p>
      <h2>Допомогти власнику не палити бюджет і бачити, що реклама реально дає бізнесу</h2>
      <p>Рекламні тексти — лише половина роботи. Щоб система радила правильно, їй потрібні витрати, кліки, конверсії, покупки, сторінки входу і звʼязок із замовленнями.</p>
    </section>
    <section class="section-block measurement-panel">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Що треба бачити системі</p>
          <h3>Підключення для реклами, аналітики і SEO, щоб рішення були не навмання</h3>
        </div>
        <button class="button secondary" data-view="connect">Підключення</button>
      </div>
      <div class="measurement-grid">
        ${[
          ['Google Ads', googleAds, 'Spend, clicks, conversions, ROAS, кампанії і ключові слова.'],
          ['GA4', analytics, 'Sessions, add_to_cart, purchase, revenue, source/medium/campaign.'],
          ['Search Console', searchConsole, 'Органічні кліки, покази, CTR і позиції, щоб не плутати SEO з рекламою.']
        ].map(([title, check, fallback]) => `
          <article class="${check.ok ? 'ok' : 'pending'}">
            <strong>${escapeHtml(title)}</strong>
            ${connectionStatusPill(Boolean(check.ok), 'Не підключено')}
            <p>${escapeHtml(check.detail || fallback)}</p>
          </article>
        `).join('')}
      </div>
    </section>
    <div class="module-grid">
      ${[
        { title: 'Ідеї для реклами', note: 'Headlines, descriptions, Meta hooks, primary text і TikTok voiceover на основі товару, сторінки і аудиторії.', tab: 'ads', cta: 'Відкрити' },
        { title: 'Сторінка перед рекламою', note: 'Перед запуском перевірити сторінку: офер, опис, SEO, довіру і чи зрозуміло, як купити.', view: 'content', cta: 'Перейти до SEO' },
        { title: 'Контроль ефекту', note: 'Після запуску кампанії система має показати, що посилити, що вимкнути і що перевірити.', view: 'queue', cta: 'Черга дій' }
      ].map(moduleCardHtml).join('')}
    </div>
  `;
}

function money(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) && num ? `${Math.round(num).toLocaleString('uk')} грн` : '—';
}

function shortDate(value) {
  return value ? String(value).slice(0, 10) : '—';
}

function topProductsFromOrders(orders = []) {
  const map = new Map();
  (orders || []).forEach(order => {
    (order.products || []).forEach(product => {
      const name = product.name || '';
      if (!name) return;
      const current = map.get(name) || { name, quantity: 0, orders: 0, revenue: 0 };
      current.quantity += Number(product.quantity || 0);
      current.orders += 1;
      current.revenue += Number(product.price || 0) * Number(product.quantity || 0);
      map.set(name, current);
    });
  });
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 8);
}

function storeToolLabel(tool = '') {
  if (tool === 'customers') return 'Клієнти';
  if (tool === 'orders') return 'Замовлення';
  return 'Оберіть блок вище';
}

function renderStorePagination(total = 0, page = 1, perPage = 50, tool = '') {
  const pages = Math.max(1, Math.ceil(Number(total || 0) / perPage));
  if (pages <= 1) return '';
  return `
    <div class="store-pagination">
      <button class="button secondary" data-store-page="${Math.max(1, page - 1)}" data-store-page-tool="${escapeHtml(tool)}" ${page <= 1 ? 'disabled' : ''}>Назад</button>
      <span>Сторінка ${Number(page).toLocaleString('uk')} з ${Number(pages).toLocaleString('uk')}</span>
      <button class="button secondary" data-store-page="${Math.min(pages, page + 1)}" data-store-page-tool="${escapeHtml(tool)}" ${page >= pages ? 'disabled' : ''}>Далі</button>
    </div>
  `;
}

function renderStoreCustomersTable(data = {}) {
  const customers = data.customers || [];
  if (!customers.length) return '<section class="empty-workflow inline-empty"><h2>Клієнтів не знайдено</h2><p>Спробуйте інший пошук або оновіть дані.</p></section>';
  return `
    <div class="store-table-wrap">
      <table class="store-table">
        <thead>
          <tr><th>Клієнт</th><th>Email</th><th>Телефон</th><th>Замовлень</th><th>Сума</th><th>Остання покупка</th></tr>
        </thead>
        <tbody>
          ${customers.map(customer => `
            <tr data-store-customer="${escapeHtml(customer.customer_id)}">
              <td><strong>${escapeHtml(`${customer.firstname || ''} ${customer.lastname || ''}`.trim() || 'Без імені')}</strong></td>
              <td>${escapeHtml(customer.email || '—')}</td>
              <td>${escapeHtml(customer.telephone || '—')}</td>
              <td><span class="pill">${Number(customer.order_count || 0).toLocaleString('uk')}</span></td>
              <td><strong>${money(customer.total_spent)}</strong></td>
              <td>${shortDate(customer.last_order)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${renderStorePagination(data.total, state.store?.page || 1, 50, 'customers')}
  `;
}

function renderStoreOrdersTable(data = {}) {
  const orders = data.orders || [];
  if (!orders.length) return '<section class="empty-workflow inline-empty"><h2>Замовлень не знайдено</h2><p>Спробуйте інший пошук або оновіть дані.</p></section>';
  return `
    <div class="store-table-wrap">
      <table class="store-table">
        <thead>
          <tr><th>Замовлення</th><th>Клієнт</th><th>Товари</th><th>Сума</th><th>Статус</th><th>Дата</th></tr>
        </thead>
        <tbody>
          ${orders.map(order => `
            <tr>
              <td><strong>#${escapeHtml(order.order_id)}</strong></td>
              <td>
                <strong>${escapeHtml(`${order.firstname || ''} ${order.lastname || ''}`.trim() || 'Без імені')}</strong>
                <small>${escapeHtml(order.email || '')}</small>
              </td>
              <td>${escapeHtml(order.products_list || (order.products || []).map(product => product.name).join(', ') || '—')}</td>
              <td><strong>${money(order.total)}</strong></td>
              <td>${order.status ? `<span class="pill">${escapeHtml(order.status)}</span>` : '—'}</td>
              <td>${shortDate(order.date_added)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${renderStorePagination(data.total, state.store?.page || 1, 50, 'orders')}
  `;
}

function renderStoreCustomerDetail(customer = null) {
  if (!customer) return '';
  const orders = Array.isArray(customer.orders) ? customer.orders : [];
  const topProducts = Array.isArray(customer.topProducts) && customer.topProducts.length
    ? customer.topProducts
    : topProductsFromOrders(orders);
  const totalSpent = Number(customer.total_spent || orders.reduce((sum, order) => sum + Number(order.total || 0), 0));
  const orderCount = Number(customer.order_count || orders.length || 0);
  const avgOrder = orderCount ? Math.round(totalSpent / orderCount) : 0;
  return `
    <section class="store-detail-panel">
      <div class="content-titlebar">
        <div>
          <p class="eyebrow">Картка клієнта</p>
          <h2>${escapeHtml(`${customer.firstname || ''} ${customer.lastname || ''}`.trim() || 'Без імені')}</h2>
          <p>${escapeHtml(customer.email || '')}${customer.telephone ? ` · ${escapeHtml(customer.telephone)}` : ''}</p>
        </div>
        <button class="button secondary" data-store-close-customer>Закрити</button>
      </div>
      <section class="metric-strip customer-metrics">
        ${[
          ['Замовлень', { value: Number(orderCount).toLocaleString('uk'), note: `останнє: ${shortDate(customer.last_order || orders[0]?.date_added)}`, status: 'ok' }],
          ['Витрачено', { value: money(totalSpent), note: 'за весь час', status: 'ok' }],
          ['Середній чек', { value: avgOrder ? `${avgOrder.toLocaleString('uk')} грн` : '—', note: 'по історії', status: 'ok' }],
          ['Цикл', { value: customer.preferenceProfile?.cadence?.avgIntervalDays ? `${Number(customer.preferenceProfile.cadence.avgIntervalDays).toLocaleString('uk')} дн.` : '—', note: 'між покупками', status: 'warn' }]
        ].map(([label, item]) => `
          <article class="metric ${escapeHtml(item.status)}">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
            <small>${escapeHtml(item.note)}</small>
          </article>
        `).join('')}
      </section>
      <div class="content-bottom-grid">
        <section>
          <h3>Улюблені товари</h3>
          <div class="store-chip-list">
            ${topProducts.length ? topProducts.map(product => `<span class="pill">${escapeHtml(product.name || product)} ×${Number(product.quantity || product.orders || 1).toLocaleString('uk')}</span>`).join('') : '<p class="muted-copy">Ще немає достатньо даних.</p>'}
          </div>
        </section>
        <section>
          <h3>Наступна дія</h3>
          <p class="muted-copy">${escapeHtml(customer.nextBestAction?.recommendation || 'Побудувати персональний лист від останньої покупки або улюбленого товару.')}</p>
          <button class="button secondary" data-go="queue" data-filter-type="customer">Підготувати лист у v2</button>
        </section>
      </div>
      <section class="store-orders-list">
        <h3>Історія замовлень</h3>
        ${orders.length ? orders.map(order => `
          <article class="store-order-card">
            <div>
              <strong>#${escapeHtml(order.order_id)} · ${shortDate(order.date_added)}</strong>
              <span>${escapeHtml(order.status || '')}</span>
            </div>
            <strong>${money(order.total)}</strong>
            <ul>
              ${(order.products || []).map(product => `<li>${escapeHtml(product.name || '')} · ${Number(product.quantity || 0).toLocaleString('uk')} × ${money(product.price)}</li>`).join('')}
            </ul>
          </article>
        `).join('') : '<p class="muted-copy">Замовлень поки немає.</p>'}
      </section>
    </section>
  `;
}

function renderStoreWorkspace() {
  const store = state.store || {};
  if (!store.tool) {
    return `
    <section class="store-workspace empty">
      <p class="eyebrow">Робоче поле</p>
      <h2>Оберіть “Клієнти” або “Замовлення” вище</h2>
      <p>Це джерело для AI-оператора: з цих даних він розуміє, хто купує, що продається, що залежалось і кому варто написати.</p>
      </section>
    `;
  }
  const data = store.tool === 'orders' ? store.orders : store.customers;
  return `
    <section class="store-workspace">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Магазин / ${escapeHtml(storeToolLabel(store.tool))}</p>
          <h2>${escapeHtml(storeToolLabel(store.tool))}</h2>
          <p>Це не просто таблиця. Це сировина для маркетингу, повторних продажів, товарних карток і рішень по рекламі.</p>
        </div>
        <div class="store-search">
          <input id="storeSearchInput" type="search" value="${escapeHtml(store.search || '')}" placeholder="Пошук">
          <button class="button secondary" data-store-refresh="${escapeHtml(store.tool)}">Оновити</button>
        </div>
      </div>
      ${store.loading ? '<p class="muted-copy">Завантажую дані OpenCart...</p>' : ''}
      ${store.error ? `<div class="publish-result fail"><strong>Помилка</strong><span>${escapeHtml(store.error)}</span></div>` : ''}
      ${!store.loading && !store.error ? (store.tool === 'orders' ? renderStoreOrdersTable(data || {}) : renderStoreCustomersTable(data || {})) : ''}
      ${renderStoreCustomerDetail(store.selectedCustomer)}
    </section>
  `;
}

function renderProductMatrixPanel() {
  const dashboardProducts = state.today?.dashboardV2?.productsAttention || [];
  const apiMatrix = state.productMatrix || {};
  const matrix = apiMatrix.matrix || apiMatrix || {};
  const top = dashboardProducts.length
    ? dashboardProducts
    : (apiMatrix.topOpportunities || matrix.topOpportunities || matrix.items || []).slice(0, 8);
  const bridgeWarning = apiMatrix.bridgeWarning || apiMatrix.error || '';
  return `
    <section class="product-matrix-panel">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Product Matrix</p>
          <h3>Які товари потребують уваги: SEO, попит, продажі, ціна або наповнення</h3>
          <p>Цей модуль поєднує OpenCart, GSC, продажі й надалі GA4/Ads, щоб власник не шукав проблемні товари вручну.</p>
        </div>
        <button class="button secondary" data-view="connect">Підключити джерела</button>
      </div>
      ${bridgeWarning ? `<div class="publish-result warn"><strong>Потрібне підключення</strong><span>${escapeHtml(bridgeWarning)}</span></div>` : ''}
      <div class="matrix-status-grid">
        <article>
          <span>OpenCart</span>
          <strong>${state.setupGuide?.checks?.find(check => check.id === 'platform')?.ok ? 'Працює' : 'Потрібно'}</strong>
          <p>товари, категорії, замовлення</p>
        </article>
        <article>
          <span>GSC</span>
          <strong>${state.setupGuide?.checks?.find(check => check.id === 'search-console')?.ok ? 'Працює' : 'Потрібно'}</strong>
          <p>кліки, покази, CTR, позиції</p>
        </article>
        <article>
          <span>GA4 / Ads</span>
          <strong>${state.setupGuide?.checks?.find(check => check.id === 'analytics')?.ok || state.setupGuide?.checks?.find(check => check.id === 'google-ads')?.ok ? 'Частково' : 'Не підключено'}</strong>
          <p>sessions, spend, purchase revenue</p>
        </article>
      </div>
      <div class="matrix-opportunity-grid">
        ${top.slice(0, 8).map(item => `
          <article>
            <span>${escapeHtml(item.status || item.label || 'attention')}</span>
            <strong>${escapeHtml(item.name || item.productName || 'Товар')}</strong>
            <p>${escapeHtml(item.reason || item.action || item.label || 'потрібна дія')}</p>
            <small>${[
              Number(item.revenue || item.potentialRevenue || 0) ? moneyLabel(item.revenue || item.potentialRevenue || 0) : '',
              Number(item.clicks || item.gsc?.clicks || 0) ? `${Number(item.clicks || item.gsc?.clicks || 0).toLocaleString('uk')} кліків` : '',
              Number(item.impressions || item.gsc?.impressions || 0) ? `${Number(item.impressions || item.gsc?.impressions || 0).toLocaleString('uk')} показів` : ''
            ].filter(Boolean).map(escapeHtml).join(' · ')}</small>
          </article>
        `).join('') || `
          <article class="empty-state-card">
            <span>Потрібно</span>
            <strong>Підключити OpenCart + GSC, GA4 або Ads</strong>
            <p>Без цих джерел система може писати тексти, але не бачить, які товари реально варто рухати першими.</p>
            <button class="button primary" data-view="connect">Підключити джерела</button>
          </article>
        `}
      </div>
    </section>
  `;
}

function renderStore() {
  const box = $('#storePanel');
  if (!box) return;
  box.innerHTML = `
    <section class="module-hero">
      <p class="eyebrow">Дані магазину</p>
      <h2>Замовлення, клієнти, товари і постачальники — база, з якої система будує дії</h2>
      <p>Власнику не треба вручну шукати закономірності в таблицях. AI-оператор використовує ці дані, щоб підказати повторні продажі, слабкі товари, сторінки для SEO і персональні листи.</p>
    </section>
    <div class="module-grid">
      ${[
        { title: 'Постачальники', note: 'Прайси, артикулі, наявність і створення товарів, щоб наповнення магазину не було ручним хаосом.', tab: 'supplier', cta: 'Відкрити' },
        { title: 'Клієнти', note: 'Пошук людини, історія замовлень, частота, улюблені товари і перехід до персонального листа.', storeTool: 'customers', cta: 'Відкрити нижче' },
        { title: 'Замовлення', note: 'Останні покупки, склад, суми, статуси і сигнали для повторної покупки.', storeTool: 'orders', cta: 'Відкрити нижче' },
        { title: 'Клієнтська памʼять', note: 'Сегменти, повтор, revenue після email, stop-list і смаки клієнтів.', view: 'customers', cta: 'Огляд клієнтів' }
      ].map(moduleCardHtml).join('')}
    </div>
    ${renderProductMatrixPanel()}
    <div id="storeWorkspace">${renderStoreWorkspace()}</div>
  `;
}

function patchStore(patch = {}) {
  setState({ store: { ...(state.store || {}), ...patch } });
}

async function loadStoreTool(tool, { page = 1, search = null } = {}) {
  const nextSearch = search === null ? (state.store?.search || '') : search;
  patchStore({ tool, page, search: nextSearch, loading: true, error: '', selectedCustomer: null });
  try {
    if (tool === 'customers') {
      const customers = await getStoreCustomers({ page, search: nextSearch });
      patchStore({ tool, page, search: nextSearch, customers, loading: false, error: '' });
      return;
    }
    if (tool === 'orders') {
      const orders = await getStoreOrders({ page, search: nextSearch });
      patchStore({ tool, page, search: nextSearch, orders, loading: false, error: '' });
      return;
    }
    patchStore({ loading: false, error: 'Невідомий блок магазину.' });
  } catch (error) {
    patchStore({ loading: false, error: error.message || String(error) });
  }
}

async function openStoreTool(tool) {
  switchView('store');
  await loadStoreTool(tool, { page: 1, search: state.store?.search || '' });
}

async function openStoreCustomer(id) {
  if (!id) return;
  patchStore({ loading: true, error: '' });
  try {
    const selectedCustomer = await getStoreCustomer(id);
    patchStore({ selectedCustomer, loading: false, error: '' });
  } catch (error) {
    patchStore({ loading: false, error: error.message || String(error) });
  }
}

function renderWorkbenchList() {
  const items = state.workItems.slice(0, 30);
  const selected = selectedWorkItem();
  const box = $('#workbenchList');
  if (!box) return;
  box.innerHTML = items.map(item => itemHtml(item, { active: selected?.id === item.id })).join('');
}

function emailWorkflowKey(item = {}) {
  return `work-${String(item.id || 'unknown').replace(/[^a-z0-9_-]/gi, '_')}`;
}

function emailDomId(key = '', field = '') {
  return `email-${String(field).replace(/[^a-z0-9_-]/gi, '_')}-${String(key).replace(/[^a-z0-9_-]/gi, '_')}`;
}

function getEmailWorkflow(key = '') {
  return state.emailWorkflow?.[key] || {};
}

function patchEmailWorkflow(key = '', patch = {}) {
  setState({
    emailWorkflow: {
      ...(state.emailWorkflow || {}),
      [key]: {
        ...(state.emailWorkflow?.[key] || {}),
        ...patch
      }
    }
  });
}

function workflowFieldValue(key = '', field = '', fallback = '') {
  const el = $(`#${emailDomId(key, field)}`);
  return el ? el.value : fallback;
}

function emailSegments() {
  return state.emailSegments?.data?.segments || [];
}

function emailTrackingMessages() {
  return state.emailTracking?.data?.messages || [];
}

function sentLikeStatus(status = '') {
  return ['smtp_accepted', 'opened', 'clicked'].includes(String(status || ''));
}

function maskEmail(value = '') {
  const email = String(value || '').trim();
  const [name, domain] = email.split('@');
  if (!name || !domain) return email || '—';
  return `${name.slice(0, 2)}***@${domain}`;
}

function defaultCampaignForItem(item = {}, segment = {}) {
  return {
    type: /risk|відтоку|sleep|спляч/i.test(`${item.id} ${item.title}`) ? 'reactivation' : 'new_arrival',
    topic: '',
    offer: segment.offerHint || (item.data || []).join('; ') || '',
    audience: segment.title || item.title || '',
    goal: segment.goal || item.expectedImpact || '',
    url: 'https://mercato.com.ua/'
  };
}

function campaignTypeLabel(type = '') {
  return {
    new_arrival: 'Новий врожай / новий товар',
    preorder: 'Передзамовлення',
    restock: 'Повернувся в наявність',
    retention: 'Повторна покупка',
    reactivation: 'Повернення клієнтів'
  }[type] || 'Кампанія';
}

function campaignPromptText(campaign = {}) {
  return [
    campaign.type ? `Тип кампанії: ${campaignTypeLabel(campaign.type)}` : '',
    campaign.topic ? `Привід: ${campaign.topic}` : '',
    campaign.offer ? `Пропозиція/факти: ${campaign.offer}` : '',
    campaign.audience ? `Кому: ${campaign.audience}` : '',
    campaign.goal ? `Ціль: ${campaign.goal}` : '',
    campaign.url ? `URL: ${campaign.url}` : ''
  ].filter(Boolean).join('\n');
}

function emailSegmentForItem(item = {}) {
  const segmentId = customerActionSegmentId(item);
  const segment = emailSegments().find(row => row.id === segmentId)
    || emailSegments().find(row => row.id === 'replenishment_due')
    || emailSegments()[0]
    || null;
  if (segment) return segment;
  return {
    id: segmentId,
    title: item.title || 'Клієнтська дія',
    description: item.why || '',
    scenario: /risk|відтоку|sleep|спляч/i.test(`${item.id} ${item.title}`) ? 'reactivation' : 'post_purchase',
    goal: item.expectedImpact || 'підготувати доречний лист для повторної покупки',
    offerHint: (item.data || []).join('; ') || 'персональна рекомендація без агресивної знижки',
    count: 0,
    recipients: [],
    batchPreview: [],
    topProducts: []
  };
}

function customerWorkflowCampaign(item = {}, workflow = {}, segment = null) {
  const key = emailWorkflowKey(item);
  const current = workflow.campaign || {};
  const base = defaultCampaignForItem(item, segment || emailSegmentForItem(item));
  return {
    type: workflowFieldValue(key, 'campaignType', current.type || base.type),
    topic: workflowFieldValue(key, 'campaignTopic', current.topic || base.topic).trim(),
    offer: workflowFieldValue(key, 'campaignOffer', current.offer || base.offer).trim(),
    audience: workflowFieldValue(key, 'campaignAudience', current.audience || base.audience).trim(),
    goal: workflowFieldValue(key, 'campaignGoal', current.goal || base.goal).trim(),
    url: workflowFieldValue(key, 'campaignUrl', current.url || base.url).trim()
  };
}

function customerWorkflowCoupon(item = {}, workflow = {}) {
  const key = emailWorkflowKey(item);
  const draftCoupon = workflow.draft?.couponSettings ? {
    enabled: true,
    ...workflow.draft.couponSettings,
    couponCode: workflow.draft.couponCode,
    dateEnd: workflow.draft.couponDateEnd || workflow.draft.dateEnd
  } : {};
  const current = { ...draftCoupon, ...(workflow.coupon || {}) };
  const enabledEl = $(`#${emailDomId(key, 'couponEnabled')}`);
  const discountEl = $(`#${emailDomId(key, 'couponDiscount')}`);
  const typeEl = $(`#${emailDomId(key, 'couponType')}`);
  const daysEl = $(`#${emailDomId(key, 'couponDays')}`);
  const discount = Math.max(1, Math.min(5000, Number(String(discountEl?.value || current.discount || 10).replace(',', '.')) || 10));
  const days = Math.max(1, Math.min(365, Number(daysEl?.value || current.days || 7) || 7));
  const type = String(typeEl?.value || current.type || 'P').toUpperCase() === 'F' ? 'F' : 'P';
  const settingsChanged = Boolean(
    (discountEl && Number(String(current.discount || 10).replace(',', '.')) !== discount)
    || (typeEl && String(current.type || 'P').toUpperCase() !== type)
    || (daysEl && Number(current.days || 7) !== days)
  );
  return {
    enabled: enabledEl ? enabledEl.checked : current.enabled !== false,
    discount,
    type,
    days,
    code: settingsChanged ? '' : normalizeCouponCode(current.code || current.couponCode || workflow.draft?.couponCode || ''),
    dateEnd: settingsChanged ? '' : (current.dateEnd || current.date_end || workflow.draft?.couponDateEnd || workflow.draft?.dateEnd || '')
  };
}

function couponSettingsFromUi(coupon = {}) {
  if (!coupon.enabled) return null;
  return {
    discount: coupon.discount,
    type: coupon.type,
    days: coupon.days
  };
}

function couponLabel(coupon = {}) {
  if (!coupon?.enabled && !coupon?.discount) return '';
  return coupon.type === 'F' ? `${Number(coupon.discount || 0).toLocaleString('uk')} грн` : `${Number(coupon.discount || 0).toLocaleString('uk')}%`;
}

function normalizeCouponCode(value = '') {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

function formatCouponDateForUi(value = '') {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('uk-UA');
}

function couponPreviewText(coupon = {}) {
  const settings = coupon.enabled ? coupon : { ...coupon, enabled: true };
  const label = couponLabel(settings);
  if (!label) return '';
  const code = normalizeCouponCode(settings.code) || '[ПРОМОКОД]';
  const validTo = settings.dateEnd ? formatCouponDateForUi(settings.dateEnd) : `${Number(settings.days || 7).toLocaleString('uk')} дн.`;
  return `Ваш персональний промокод: ${code}\nЗнижка: ${label}. Діє до: ${validTo}. Код працює для одного замовлення.`;
}

function draftWithCoupon(draft = {}, coupon = {}) {
  const next = { ...draft };
  const settings = couponSettingsFromUi(coupon);
  if (settings) {
    next.couponSettings = settings;
    next.discount = `персональний купон ${couponLabel(coupon)}, діє ${Number(coupon.days || 7).toLocaleString('uk')} дн.`;
    const code = normalizeCouponCode(coupon.code || draft.couponCode);
    if (code) next.couponCode = code;
    else delete next.couponCode;
    if (coupon.dateEnd || draft.couponDateEnd) next.couponDateEnd = coupon.dateEnd || draft.couponDateEnd;
    else delete next.couponDateEnd;
  } else {
    delete next.couponSettings;
    delete next.couponCode;
    delete next.couponDateEnd;
  }
  return next;
}

function stripClientCouponText(body = '') {
  return String(body || '')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(block => block && !/(Ваш персональний промокод:|Промокод:|Код (працює|діє) для одного замовлення)/iu.test(block))
    .join('\n\n')
    .replace(/\[ПРОМОКОД\]/g, '')
    .trim();
}

function bodyWithGeneratedCouponCode(body = '', coupon = {}, code = '', dateEnd = '') {
  const couponCode = normalizeCouponCode(code || coupon.code);
  if (!couponCode) return bodyWithCouponPreview(body, coupon);
  const nextCoupon = { ...coupon, enabled: true, code: couponCode, dateEnd: dateEnd || coupon.dateEnd };
  const marker = couponPreviewText(nextCoupon);
  const replaced = String(body || '').replace(/\[ПРОМОКОД\]/g, couponCode).trim();
  const clean = stripClientCouponText(replaced);
  return `${clean || replaced}\n\n${marker}`.trim();
}

function bodyWithCouponPreview(body = '', coupon = {}) {
  if (!coupon?.enabled) return body;
  const code = normalizeCouponCode(coupon.code);
  if (code) return bodyWithGeneratedCouponCode(body, coupon, code, coupon.dateEnd);
  const marker = couponPreviewText(coupon);
  if (!marker) return body;
  const clean = stripClientCouponText(body);
  return `${clean || body}\n\n${marker}`.trim();
}

function localCampaignDraft(item = {}, segment = {}, campaign = {}) {
  const topic = campaign.topic || segment.offerHint || item.title || 'пропозиція Mercato';
  const isPreorder = campaign.type === 'preorder';
  const subject = isPreorder
    ? `Передзамовлення: ${topic}`.slice(0, 58)
    : `${topic} вже в Mercato`.slice(0, 58);
  const preheader = isPreorder
    ? 'Можна залишити заявку до надходження лоту.'
    : 'Коротко про новий лот і для кого він підійде.';
  const body = [
    `Доброго дня! У Mercato зʼявився новий привід для хорошої чашки: ${topic}.`,
    campaign.offer || 'Це добірка для тих, хто любить свіжі лоти, зрозумілий смак і спокійний вибір без зайвого шуму.',
    isPreorder
      ? 'Ми збираємо передзамовлення, щоб привезти потрібний обсяг і не тримати рідкісний сорт на складі довше, ніж треба.'
      : 'Якщо хочете спробувати щось нове або повернутись до улюбленого профілю, цей лот варто подивитись першим.',
    `Подивитись деталі: ${campaign.url || 'https://mercato.com.ua/'}`
  ].filter(Boolean).join('\n\n');
  return {
    name: 'Email 1',
    subject,
    preheader,
    body,
    cta: isPreorder ? 'Залишити передзамовлення' : 'Подивитися лот',
    ctaUrl: campaign.url || 'https://mercato.com.ua/',
    actionId: item.id || '',
    campaignId: item.id || '',
    segmentId: segment.id || customerActionSegmentId(item),
    segmentTitle: segment.title || item.title || ''
  };
}

function emailSubjectIdeas(draft = {}, campaign = {}, segment = {}) {
  const topic = String(campaign.topic || draft.subject || segment.offerHint || segment.title || 'ваш вибір').trim();
  const cleanTopic = topic.replace(/\s+/g, ' ').slice(0, 42);
  const ideas = [
    draft.subject || `${cleanTopic}: коротко для вас`,
    campaign.type === 'preorder' ? `Передзамовлення: ${cleanTopic}` : `Є свіжа ідея до вашої чашки`,
    `${cleanTopic} + персональна рекомендація`
  ];
  return [...new Set(ideas.map(value => value.trim()).filter(Boolean))]
    .map(value => value.slice(0, 58))
    .slice(0, 3);
}

function renderSubjectIdeas(item = {}, key = '', draft = {}, campaign = {}, segment = {}) {
  const ideas = emailSubjectIdeas(draft, campaign, segment);
  return `
    <div class="subject-idea-row">
      ${ideas.map((idea, index) => `
        <button class="button secondary" type="button" data-email-subject-idea="${escapeHtml(item.id || '')}" data-subject="${escapeHtml(idea)}">
          Варіант ${index + 1}: ${escapeHtml(idea)}
        </button>
      `).join('')}
    </div>
  `;
}

function renderEmailPreview(draft = {}, coupon = {}) {
  const subject = draft.subject || 'Тема листа';
  const preheader = draft.preheader || 'Короткий текст після теми';
  const body = bodyWithCouponPreview(draft.body || 'Текст листа зʼявиться після генерації або швидкої чернетки.', coupon);
  const lines = String(body || '').split(/\n+/).filter(Boolean).slice(0, 3);
  return `
    <section class="email-preview-panel">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Preview</p>
          <h3>Як це виглядатиме в пошті</h3>
        </div>
      </div>
      <div class="email-preview-grid">
        <article class="gmail-preview desktop">
          <span>Gmail desktop</span>
          <strong>${escapeHtml(subject)}</strong>
          <small>${escapeHtml(preheader)}</small>
          ${lines.map(line => `<p>${escapeHtml(line)}</p>`).join('')}
        </article>
        <article class="gmail-preview mobile">
          <span>Gmail mobile</span>
          <strong>${escapeHtml(subject)}</strong>
          <small>${escapeHtml(preheader)}</small>
          <p>${escapeHtml(lines[0] || '')}</p>
        </article>
      </div>
    </section>
  `;
}

function customerWorkflowDraft(item = {}, workflow = {}) {
  const key = emailWorkflowKey(item);
  const draft = workflow.draft || {};
  const coupon = customerWorkflowCoupon(item, workflow);
  return draftWithCoupon({
    ...draft,
    name: draft.name || 'Email 1',
    subject: $(`#${emailDomId(key, 'subject')}`)?.value || draft.subject || '',
    preheader: $(`#${emailDomId(key, 'preheader')}`)?.value || draft.preheader || '',
    body: $(`#${emailDomId(key, 'body')}`)?.value || draft.body || '',
    cta: $(`#${emailDomId(key, 'cta')}`)?.value || draft.cta || 'Перейти на Mercato',
    ctaUrl: $(`#${emailDomId(key, 'ctaUrl')}`)?.value || draft.ctaUrl || 'https://mercato.com.ua/',
    actionId: item.id || draft.actionId || '',
    campaignId: item.id || draft.campaignId || '',
    segmentId: draft.segmentId || customerActionSegmentId(item),
    segmentTitle: draft.segmentTitle || emailSegmentForItem(item).title || item.title || ''
  }, coupon);
}

function segmentRecipientsCount(segment = {}) {
  const list = Array.isArray(segment.recipients) && segment.recipients.length
    ? segment.recipients
    : Array.isArray(segment.batchPreview)
      ? segment.batchPreview
      : [];
  return list.filter(row => row?.email && row?.spam?.canEmail !== false && row?.canSend !== false).length;
}

function emailSendableRecipients(segment = {}) {
  const raw = Array.isArray(segment.recipients) && segment.recipients.length
    ? segment.recipients
    : Array.isArray(segment.batchPreview) && segment.batchPreview.length
      ? segment.batchPreview
      : Array.isArray(segment.sampleCustomers)
        ? segment.sampleCustomers
        : [];
  const seen = new Set();
  return raw
    .filter(row => {
      const email = String(row?.email || '').trim().toLowerCase();
      if (!email || seen.has(email)) return false;
      seen.add(email);
      return row?.spam?.canEmail !== false && row?.canSend !== false;
    })
    .map(row => ({
      ...row,
      email: String(row.email || '').trim(),
      name: row.name || row.fullName || [row.firstname, row.lastname].filter(Boolean).join(' ').trim() || row.email
    }));
}

function selectedEmailRecipient(key = '', segment = {}) {
  const recipients = emailSendableRecipients(segment);
  const selectedEmail = $(`#${emailDomId(key, 'recipientEmail')}`)?.value?.trim().toLowerCase() || '';
  return recipients.find(row => row.email.toLowerCase() === selectedEmail) || recipients[0] || null;
}

function emailRecipientOptions(segment = {}, selected = '') {
  const recipients = emailSendableRecipients(segment);
  const selectedLower = String(selected || '').trim().toLowerCase();
  if (!recipients.length) return '<option value="">Немає доступних email у сегменті</option>';
  return recipients.map(row => {
    const labelParts = [
      row.name || row.email,
      row.favoriteProduct || row.proposedOffer || row.topProducts?.[0]?.name || row.recommendations?.[0]?.name || ''
    ].filter(Boolean);
    return `<option value="${escapeHtml(row.email)}" ${row.email.toLowerCase() === selectedLower ? 'selected' : ''}>${escapeHtml(labelParts.join(' · '))}</option>`;
  }).join('');
}

function emailProductName(value = '') {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.name || value.title || value.product || value.productName || '';
}

function emailRecipientProduct(customer = {}) {
  return emailProductName(customer.recentOrders?.[0]?.products?.[0])
    || emailProductName(customer.topProducts?.[0])
    || emailProductName(customer.recommendations?.[0])
    || customer.favoriteProduct
    || customer.proposedOffer
    || '';
}

function personalizeCustomerDraft(draft = {}, customer = {}) {
  const name = customer.name || customer.fullName || [customer.firstname, customer.lastname].filter(Boolean).join(' ').trim();
  const firstName = String(name || '').trim().split(/\s+/)[0] || '';
  const product = emailRecipientProduct(customer);
  let body = String(draft.body || '')
    .replaceAll('{{first_name}}', firstName || 'друже')
    .replaceAll('{{purchased_product}}', product || 'вашу каву')
    .replaceAll('{{recommended_product}}', customer.recommendations?.[0]?.name || product || 'рекомендований лот');

  if (firstName) {
    body = body.replace(/\b(Привіт|Вітаю|Доброго дня),\s*друже!?/i, `$1, ${firstName}!`);
  }
  if (product) {
    body = body.replace(/\bваша кава\b/i, product);
  }
  if (firstName && !body.toLowerCase().includes(firstName.toLowerCase())) {
    body = `Доброго дня, ${firstName}!\n\n${body}`;
  }

  return {
    ...draft,
    email: customer.email,
    name: name || customer.email || draft.name || 'Персональний лист',
    body,
    canSend: customer.canSend !== false && customer.spam?.canEmail !== false
  };
}

function emailTrackingForWorkflow(item = {}, segment = {}, draft = {}) {
  const actionId = item.id || '';
  const segmentId = segment.id || draft.segmentId || customerActionSegmentId(item);
  const subject = String(draft.subject || '').trim().toLowerCase();
  const messages = emailTrackingMessages().filter(message => {
    if (actionId && message.actionId === actionId) return true;
    if (segmentId && message.segmentId === segmentId) return true;
    return false;
  });
  const sameSubject = subject
    ? messages.filter(message => String(message.subject || '').trim().toLowerCase() === subject)
    : [];
  const sent = messages.filter(message => sentLikeStatus(message.status));
  const failed = messages.filter(message => message.status === 'failed');
  const opened = messages.filter(message => Number(message.openCount || 0) > 0);
  const clicked = messages.filter(message => Number(message.clickCount || 0) > 0);
  const recent = messages
    .slice()
    .sort((a, b) => String(b.lastActivityAt || b.sentAt || b.failedAt || '').localeCompare(String(a.lastActivityAt || a.sentAt || a.failedAt || '')))
    .slice(0, 6);
  return {
    messages,
    sameSubject,
    sent,
    failed,
    opened,
    clicked,
    recent
  };
}

function renderEmailMemoryPanel(item = {}, segment = {}, draft = {}) {
  const tracking = emailTrackingForWorkflow(item, segment, draft);
  const loading = state.emailTracking?.loading;
  const error = state.emailTracking?.error || '';
  const sameSubjectSent = tracking.sameSubject.filter(message => sentLikeStatus(message.status));
  return `
    <section class="workflow-panel email-memory-panel">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Памʼять відправок</p>
          <h3>Кому вже писали і що сталося</h3>
        </div>
        <button class="button secondary" data-email-load-tracking="${escapeHtml(item.id)}" ${loading ? 'disabled' : ''}>${loading ? 'Оновлюю' : 'Оновити tracking'}</button>
      </div>
      <div class="email-memory-metrics">
        <article><strong>${Number(tracking.sent.length).toLocaleString('uk')}</strong><span>надіслано</span></article>
        <article><strong>${Number(tracking.opened.length).toLocaleString('uk')}</strong><span>відкрито</span></article>
        <article><strong>${Number(tracking.clicked.length).toLocaleString('uk')}</strong><span>клікнули</span></article>
        <article><strong>${Number(tracking.failed.length).toLocaleString('uk')}</strong><span>помилки</span></article>
      </div>
      ${draft.subject ? `
        <div class="email-memory-note ${sameSubjectSent.length ? 'warn' : 'ok'}">
          ${sameSubjectSent.length
            ? `Цю тему вже отримували ${Number(sameSubjectSent.length).toLocaleString('uk')} адресатів. Сервер пропустить тих, кому вже надсилав цю саму тему в цьому сегменті.`
            : 'Цю тему в цьому сегменті ще не відправляли.'}
        </div>
      ` : '<div class="email-memory-note">Задайте привід кампанії або згенеруйте чернетку, щоб перевірити дублікати теми.</div>'}
      ${error ? `<div class="publish-result fail"><strong>Tracking помилка</strong><span>${escapeHtml(error)}</span></div>` : ''}
      <div class="email-memory-list">
        ${tracking.recent.length ? tracking.recent.map(message => `
          <article>
            <strong>${escapeHtml(maskEmail(message.to))}</strong>
            <span>${escapeHtml(message.subject || '')}</span>
            <small>${escapeHtml(message.status || '')}${message.lastActivityAt || message.sentAt ? ` · ${escapeHtml(String(message.lastActivityAt || message.sentAt).slice(0, 19))}` : ''}</small>
          </article>
        `).join('') : '<p class="muted-copy">По цьому сегменту ще немає зафіксованих відправок.</p>'}
      </div>
    </section>
  `;
}

function renderDraftResult(workflow = {}) {
  if (workflow.warning) {
    return `<div class="publish-result warn"><strong>Увага</strong><span>${escapeHtml(workflow.warning)}</span></div>`;
  }
  if (workflow.error) {
    return `<div class="publish-result fail"><strong>Помилка</strong><span>${escapeHtml(workflow.error)}</span></div>`;
  }
  if (workflow.result) {
    const result = workflow.result;
    const sent = result.sent?.length ?? (result.ok ? 1 : 0);
    const failed = result.failed?.length ?? 0;
    const couponCodes = [
      result.couponCode,
      ...(Array.isArray(result.sent) ? result.sent.map(row => row.couponCode) : [])
    ].filter(Boolean);
    return `
      <div class="publish-result ok">
        <strong>${escapeHtml(workflow.resultLabel || 'Готово')}</strong>
        <span>${sent ? `Надіслано: ${Number(sent).toLocaleString('uk')}. ` : ''}${failed ? `Помилок: ${Number(failed).toLocaleString('uk')}. ` : ''}${couponCodes.length ? `Купони: ${escapeHtml(couponCodes.slice(0, 5).join(', '))}. ` : ''}${escapeHtml(result.to || result.messageId || result.trackingId || '')}</span>
      </div>
    `;
  }
  return '';
}

function emailDraftReady(draft = {}) {
  return Boolean(String(draft.subject || '').trim() && String(draft.body || '').trim());
}

function renderCustomerActionWorkflow(item = {}) {
  const key = emailWorkflowKey(item);
  const workflow = getEmailWorkflow(key);
  const segment = emailSegmentForItem(item);
  const draft = workflow.draft || {};
  const campaign = customerWorkflowCampaign(item, workflow, segment);
  const recipients = segmentRecipientsCount(segment);
  const samples = Array.isArray(segment.batchPreview) && segment.batchPreview.length
    ? segment.batchPreview
    : Array.isArray(segment.sampleCustomers)
      ? segment.sampleCustomers
      : [];
  const selectedRecipient = selectedEmailRecipient(key, segment);
  const sendLimit = workflow.sendLimit || 20;
  const hasDraft = emailDraftReady(draft);
  const coupon = customerWorkflowCoupon(item, workflow);
  const loadingSegments = state.emailSegments?.loading;
  const loading = workflow.loading;
  const batchDrafts = workflow.batch?.drafts || [];
  return `
    <section class="native-workflow" data-email-workflow-key="${escapeHtml(key)}">
      <div class="native-workflow-hero">
        <div>
        <p class="eyebrow">Клієнтська дія</p>
          <h2>${escapeHtml(item.title || 'Підготувати лист')}</h2>
          <p>${escapeHtml(item.why || 'Оператор знайшов сегмент, якому доречно написати зараз.')}</p>
        </div>
        <aside>
          <span>Потенціал</span>
          <strong>${escapeHtml(item.expectedImpact || `${Number(recipients).toLocaleString('uk')} клієнтів для перевірки`)}</strong>
          <small>Live-відправка тільки після підтвердження фразою.</small>
        </aside>
      </div>

      <div class="workflow-stage-grid">
        <article class="workflow-stage active">
          <span>1</span>
          <strong>Кому</strong>
          <p>${escapeHtml(segment.title || 'Сегмент клієнтів')} · ${Number(recipients || segment.count || 0).toLocaleString('uk')} email</p>
        </article>
        <article class="workflow-stage ${hasDraft ? 'active' : ''}">
          <span>2</span>
          <strong>Що пишемо</strong>
          <p>${hasDraft ? escapeHtml(draft.subject) : escapeHtml(campaign.topic || 'Задайте привід кампанії.')}</p>
        </article>
        <article class="workflow-stage ${emailTrackingForWorkflow(item, segment, draft).sent.length ? 'active' : ''}">
          <span>3</span>
          <strong>Памʼять</strong>
          <p>${Number(emailTrackingForWorkflow(item, segment, draft).sent.length).toLocaleString('uk')} вже надіслано по цій дії.</p>
        </article>
        <article class="workflow-stage">
          <span>4</span>
          <strong>Захист</strong>
          <p>Stop-list, SMTP, unsubscribe, tracking і обмеження хвилі.</p>
        </article>
      </div>

      <section class="campaign-composer-panel">
        <div class="section-head compact-head">
          <div>
            <p class="eyebrow">Привід кампанії</p>
            <h3>Що саме хочете донести клієнтам</h3>
            <p>Наприклад: “новий врожай Мексика Марагоджип” або “передзамовлення фермерської арабіки”.</p>
          </div>
          <div class="template-actions">
            <button class="button secondary" data-email-template="${escapeHtml(item.id)}" data-template-kind="new_harvest">Новий врожай</button>
            <button class="button secondary" data-email-template="${escapeHtml(item.id)}" data-template-kind="preorder">Передзамовлення</button>
            <button class="button secondary" data-email-local-draft="${escapeHtml(item.id)}">Швидка чернетка</button>
          </div>
        </div>
        <div class="campaign-form-grid">
          <label>Тип
            <select id="${emailDomId(key, 'campaignType')}">
              ${[
                ['new_arrival', 'Новий врожай / новий товар'],
                ['preorder', 'Передзамовлення'],
                ['restock', 'Повернувся в наявність'],
                ['retention', 'Повторна покупка'],
                ['reactivation', 'Повернення клієнтів']
              ].map(([value, label]) => `<option value="${escapeHtml(value)}" ${campaign.type === value ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}
            </select>
          </label>
          <label>Привід / тема кампанії
            <input id="${emailDomId(key, 'campaignTopic')}" type="text" value="${escapeHtml(campaign.topic)}" placeholder="Новий врожай Мексика Марагоджип">
          </label>
          <label>URL або сторінка
            <input id="${emailDomId(key, 'campaignUrl')}" type="url" value="${escapeHtml(campaign.url)}" placeholder="https://mercato.com.ua/...">
          </label>
          <label class="wide">Офер / факти для листа
            <textarea id="${emailDomId(key, 'campaignOffer')}" rows="3" placeholder="Смак, кількість, дата поставки, ціна, умова передзамовлення.">${escapeHtml(campaign.offer)}</textarea>
          </label>
          <label>Кому писати
            <input id="${emailDomId(key, 'campaignAudience')}" type="text" value="${escapeHtml(campaign.audience)}" placeholder="VIP, активні покупці, любителі арабіки, весь сегмент">
          </label>
          <label>Ціль
            <input id="${emailDomId(key, 'campaignGoal')}" type="text" value="${escapeHtml(campaign.goal)}" placeholder="повідомити, зібрати передзамовлення, повернути до покупки">
          </label>
        </div>
      </section>

      <div class="native-workflow-grid">
        <div class="workflow-column">
          <section class="workflow-panel">
            <div class="section-head compact-head">
              <div>
                <p class="eyebrow">Сигнал</p>
                <h3>Чому це варто зробити</h3>
              </div>
              <button class="button secondary" data-email-load-segments="${escapeHtml(item.id)}" ${loadingSegments ? 'disabled' : ''}>${loadingSegments ? 'Завантажую' : 'Оновити сегменти'}</button>
            </div>
            <p>${escapeHtml(segment.description || item.expectedImpact || 'Сегмент сформовано з історії покупок OpenCart.')}</p>
            <ul class="issue-list compact-issues">
              ${(item.data || []).slice(0, 5).map(row => `<li>${escapeHtml(row)}</li>`).join('') || `<li>Сегмент: ${escapeHtml(segment.goal || 'повторна покупка')}</li>`}
            </ul>
            ${samples.length ? `
              <div class="sample-list">
                ${samples.slice(0, 4).map(customer => `
                  <article>
                    <strong>${escapeHtml(customer.name || customer.fullName || customer.email || 'Клієнт')}</strong>
                    <span>${escapeHtml(customer.proposedOffer || customer.recommendations?.[0]?.name || customer.topProducts?.[0]?.name || 'персональна рекомендація')}</span>
                  </article>
                `).join('')}
              </div>
            ` : '<p class="muted-copy">Сегменти ще не завантажені. Натисніть “Оновити сегменти”.</p>'}
          </section>
          ${renderEmailMemoryPanel(item, segment, draft)}
        </div>

        <section class="email-draft-panel">
          <div class="section-head compact-head">
            <div>
              <p class="eyebrow">Чернетка</p>
              <h3>Лист, який можна правити перед відправкою</h3>
            </div>
            <button class="button primary" data-email-generate="${escapeHtml(item.id)}" ${loading ? 'disabled' : ''}>${loading ? 'Готую' : 'Згенерувати листи'}</button>
          </div>
          <label>Тема
            <input id="${emailDomId(key, 'subject')}" type="text" value="${escapeHtml(draft.subject || '')}" placeholder="Тема листа">
          </label>
          ${renderSubjectIdeas(item, key, draft, campaign, segment)}
          <label>Preheader
            <input id="${emailDomId(key, 'preheader')}" type="text" value="${escapeHtml(draft.preheader || '')}" placeholder="Короткий текст після теми">
          </label>
          <div class="rich-editor-toolbar" aria-label="Швидке форматування листа">
            <button class="button secondary" type="button" data-email-insert="${escapeHtml(item.id)}" data-insert-text="&#10;&#10;Коротко:&#10;">Заголовок</button>
            <button class="button secondary" type="button" data-email-insert="${escapeHtml(item.id)}" data-insert-text="&#10;- &#10;- &#10;- ">Список</button>
            <button class="button secondary" type="button" data-email-insert="${escapeHtml(item.id)}" data-insert-text="&#10;&#10;Ваш персональний код: [ПРОМОКОД]">Купон</button>
          </div>
          <label>Текст листа
            <textarea id="${emailDomId(key, 'body')}" rows="10" placeholder="Після генерації тут буде текст листа.">${escapeHtml(draft.body || '')}</textarea>
          </label>
          <div class="draft-field-grid">
            <label>CTA
              <input id="${emailDomId(key, 'cta')}" type="text" value="${escapeHtml(draft.cta || 'Перейти на Mercato')}">
            </label>
            <label>URL
              <input id="${emailDomId(key, 'ctaUrl')}" type="url" value="${escapeHtml(draft.ctaUrl || 'https://mercato.com.ua/')}">
            </label>
          </div>
          ${renderEmailPreview(draft, coupon)}
          <section class="email-coupon-panel ${coupon.enabled ? 'active' : ''}">
            <label class="email-coupon-toggle">
              <input id="${emailDomId(key, 'couponEnabled')}" data-email-coupon-field="${escapeHtml(item.id)}" type="checkbox" ${coupon.enabled ? 'checked' : ''}>
              <span>
                <strong>Персональний купон</strong>
                <small>Код має бути видимий до відправки. Натисніть кнопку нижче, і MRC-код одразу зʼявиться в листі.</small>
              </span>
            </label>
            <div class="email-coupon-controls">
              <label>Знижка
                <input id="${emailDomId(key, 'couponDiscount')}" data-email-coupon-field="${escapeHtml(item.id)}" type="number" min="1" max="5000" step="1" value="${Number(coupon.discount || 10)}">
              </label>
              <label>Тип
                <select id="${emailDomId(key, 'couponType')}" data-email-coupon-field="${escapeHtml(item.id)}">
                  <option value="P" ${coupon.type === 'P' ? 'selected' : ''}>%</option>
                  <option value="F" ${coupon.type === 'F' ? 'selected' : ''}>грн</option>
                </select>
              </label>
              <label>Діє, днів
                <input id="${emailDomId(key, 'couponDays')}" data-email-coupon-field="${escapeHtml(item.id)}" type="number" min="1" max="365" step="1" value="${Number(coupon.days || 7)}">
              </label>
            </div>
            <div class="email-coupon-actions">
              <button class="button secondary" data-email-create-coupon="${escapeHtml(item.id)}" ${loading || workflow.couponLoading ? 'disabled' : ''}>
                ${workflow.couponLoading ? 'Створюю код' : coupon.code ? 'Оновити код у листі' : 'Створити код і вставити'}
              </button>
              ${coupon.code ? `
                <strong class="coupon-code-pill">${escapeHtml(coupon.code)}</strong>
                <span>${coupon.dateEnd ? `діє до ${escapeHtml(formatCouponDateForUi(coupon.dateEnd))}` : 'код уже вставлено в чернетку'}</span>
              ` : ''}
            </div>
            <p>${coupon.enabled
              ? coupon.code
                ? `Live-відправка використає саме цей код ${escapeHtml(coupon.code)}. Якщо зміните знижку або строк дії, створіть новий код.`
                : `Буде додано: персональний купон ${escapeHtml(couponLabel(coupon))}, діє ${Number(coupon.days || 7).toLocaleString('uk')} дн. Натисніть “Створити код і вставити”, щоб побачити код до відправки.`
              : 'Купон вимкнений. Кнопка все одно може створити код і автоматично увімкнути купон.'}</p>
          </section>
          <section class="email-send-panel">
            <div class="section-head compact-head">
              <div>
                <p class="eyebrow">Відправка</p>
                <h3>Куди відправити цей лист</h3>
                <p>Оберіть тест собі, одного клієнта або малу групову хвилю. Live-відправка потребує підтвердження.</p>
              </div>
            </div>
            <div class="email-send-grid">
              <article>
                <span>1</span>
                <strong>Собі на перевірку</strong>
                <input id="${emailDomId(key, 'testTo')}" type="email" placeholder="ваш email для тесту">
                <button class="button secondary" data-email-test="${escapeHtml(item.id)}">Тест собі</button>
              </article>
              <article>
                <span>2</span>
                <strong>Персонально клієнту</strong>
                <select id="${emailDomId(key, 'recipientEmail')}">
                  ${emailRecipientOptions(segment, selectedRecipient?.email || '')}
                </select>
                <button class="button primary" data-email-send-one="${escapeHtml(item.id)}" ${selectedRecipient ? '' : 'disabled'}>Надіслати одному</button>
              </article>
              <article>
                <span>3</span>
                <strong>Групі з сегмента</strong>
                <div class="email-limit-row">
                  <label>Ліміт хвилі
                    <input id="${emailDomId(key, 'sendLimit')}" type="number" min="1" max="100" value="${Number(sendLimit || 20)}">
                  </label>
                  <small>${Number(recipients).toLocaleString('uk')} доступних email</small>
                </div>
                <button class="button primary" data-email-send-segment="${escapeHtml(item.id)}" ${recipients ? '' : 'disabled'}>Надіслати групі</button>
              </article>
            </div>
            ${renderDraftResult(workflow)}
          </section>
        </section>
      </div>

      <section class="workflow-panel safety-panel">
        <div>
          <p class="eyebrow">Виконання</p>
          <h3>Захист перед живою відправкою</h3>
          <p>Відправка тепер вище біля листа. Тут лишається контроль: сервер блокує небезпечний текст, stop-list, unsubscribe і SMTP помилки.</p>
        </div>
        <div class="send-controls">
          <button class="button secondary" data-email-generate-batch="${escapeHtml(item.id)}" ${loading ? 'disabled' : ''}>Показати 5 персональних прикладів</button>
          <button class="button secondary" data-email-load-tracking="${escapeHtml(item.id)}">Оновити памʼять</button>
        </div>
        ${batchDrafts.length ? `
          <div class="batch-preview-list">
            ${batchDrafts.slice(0, 5).map(row => `
              <article>
                <strong>${escapeHtml(row.name || row.email || 'Клієнт')}</strong>
                <span>${escapeHtml(row.subject || '')}</span>
                <small>${escapeHtml(row.personalOffer || row.reason || '')}</small>
              </article>
            `).join('')}
          </div>
        ` : ''}
      </section>

      <section class="owner-approval-bar">
        <textarea id="decisionNote" placeholder="Що зробили, що перевірити після відправки або чому відклали."></textarea>
        <button class="button primary" data-decision="${escapeHtml(item.id)}" data-status="done">Позначити виконаним</button>
        <button class="button secondary" data-decision="${escapeHtml(item.id)}" data-status="deferred">Відкласти</button>
        <button class="button secondary" data-decision="${escapeHtml(item.id)}" data-status="dismissed">Прибрати</button>
        <button class="button secondary" data-view="customers">Клієнтська памʼять</button>
      </section>
    </section>
  `;
}

function renderWorkbenchDetail() {
  const item = selectedWorkItem();
  const box = $('#workbenchDetail');
  if (!box) return;
  if (!item) {
    box.innerHTML = '<section class="empty-workflow"><h2>Оберіть дію</h2><p>Зараз нічого не вибрано.</p></section>';
    return;
  }
  if (item.type === 'customer' || item.target?.kind === 'customer') {
    box.innerHTML = renderCustomerActionWorkflow(item);
    return;
  }
  box.innerHTML = `
    <div class="detail-grid">
      <div class="detail-card">
        <p class="eyebrow">${escapeHtml(typeLabel(item.type))} / ${escapeHtml(priorityLabel(item.priority))}</p>
        <h2>${escapeHtml(item.title)}</h2>
        <p>${escapeHtml(item.why || '')}</p>
        ${item.expectedImpact ? `<p><strong>Очікуваний ефект:</strong> ${escapeHtml(item.expectedImpact)}</p>` : ''}
        ${item.target?.url ? `<p><strong>Ціль:</strong> <a href="${escapeHtml(item.target.url)}" target="_blank" rel="noopener">${escapeHtml(item.target.url)}</a></p>` : ''}
        <div class="item-meta">
          ${(item.modules || []).map(module => `<span class="pill">${escapeHtml(module)}</span>`).join('')}
        </div>
        ${item.data?.length ? `<ul>${item.data.map(row => `<li>${escapeHtml(row)}</li>`).join('')}</ul>` : ''}
      </div>
      <div class="detail-card">
        <h3>Рішення</h3>
        <div class="decision-form">
          <textarea id="decisionNote" placeholder="Результат, причина, дата контролю або чому відкладено."></textarea>
          <button class="button primary" data-decision="${escapeHtml(item.id)}" data-status="done">Позначити зробленим</button>
          <button class="button secondary" data-decision="${escapeHtml(item.id)}" data-status="deferred">Відкласти</button>
          <button class="button secondary" data-decision="${escapeHtml(item.id)}" data-status="dismissed">Прибрати</button>
          ${item.target?.url ? `<a class="button secondary as-link" href="${escapeHtml(item.target.url)}" target="_blank" rel="noopener">Відкрити live сторінку</a>` : ''}
          ${item.target?.tab ? `<button class="button secondary" data-view="${escapeHtml(legacyTabToView(item.target.tab))}">Відкрити сценарій</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

function renderDemoReadiness() {
  const box = $('#demoReadinessPanel');
  if (!box) return;
  const demo = state.demoReadiness || {};
  const gates = demo.gates || [];
  const proof = demo.proof || {};
  const value = demo.commercialValue || state.today?.commercialValue || {};
  const positioning = value.positioning || {};
  const offer = value.pilotOffer || {};
  const valueCards = Array.isArray(value.valueCards) ? value.valueCards : [];
  const publish = proof.publish || {};
  const tracking = proof.tracking || {};
  box.innerHTML = `
    <section class="demo-hero ${demo.ready ? 'ready' : 'blocked'}">
      <div>
        <p class="eyebrow">Готовність системи до живих дій</p>
        <h2>${escapeHtml(demo.label || 'Перевіряю готовність')}</h2>
        <p>${escapeHtml(demo.verdict || 'Система перевіряє, чи достатньо даних, захисту і tracking, щоб виконувати дії для реального бізнесу.')}</p>
      </div>
      <div class="demo-score">
        <strong>${Number(demo.score || 0).toLocaleString('uk')}%</strong>
        <span>${demo.ready ? 'можна запускати' : 'ще не все підключено'}</span>
      </div>
    </section>

    <section class="demo-offer">
      <div>
        <p class="eyebrow">Що це означає для власника</p>
        <h3>${escapeHtml(positioning.label || 'AI-оператор готовності')}</h3>
        <p>${escapeHtml(positioning.verdict || 'Якщо частина джерел не підключена, система може готувати дії, але не зможе повністю довести результат.')}</p>
      </div>
      <div class="demo-offer-box">
        <strong>${escapeHtml(offer.title || 'Перший запуск')}</strong>
        <span>${escapeHtml(offer.price || '')}</span>
        <small>${escapeHtml(offer.riskReversal || '')}</small>
      </div>
    </section>

    <section class="value-grid demo-value-grid">
      ${valueCards.map(valueCardHtml).join('')}
    </section>

    <section class="section-block demo-next">
      <div class="section-head compact-head">
        <div>
          <p class="eyebrow">Наступний крок</p>
          <h3>${escapeHtml(demo.nextStep || 'Оновіть сигнали, щоб побачити готовність системи.')}</h3>
        </div>
        <div class="content-actions">
          <button class="button secondary" data-view="today">План на сьогодні</button>
          <button class="button secondary" data-view="monitoring">Контроль</button>
        </div>
      </div>
    </section>

    <section class="demo-gates">
      ${gates.map(gate => `
        <article class="demo-gate ${gate.ok ? 'ok' : 'blocker'}">
          <div class="demo-gate-head">
            <span class="pill ${gate.ok ? 'high' : 'medium'}">${gate.ok ? 'OK' : 'Blocker'}</span>
            <strong>${escapeHtml(gate.label || gate.id)}</strong>
            <small>${escapeHtml(gate.metric || '')}</small>
          </div>
          <p>${escapeHtml(gate.why || '')}</p>
          <div class="demo-gate-next">${escapeHtml(gate.nextStep || '')}</div>
          ${(gate.evidence || []).length ? `
            <ul class="plain-list">
              ${(gate.evidence || []).slice(0, 4).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
          ` : ''}
        </article>
      `).join('') || '<section class="empty-workflow"><h2>Немає перевірок готовності</h2><p>Оновіть дані системи.</p></section>'}
    </section>

    <section class="content-bottom-grid">
      <section>
        <h3>Перевірка змін на сайті</h3>
        <div class="source-list">
          <article class="source-row ${publish.verified ? 'ok' : 'warn'}">
            <strong>${Number(publish.verified || 0).toLocaleString('uk')} перевірених змін</strong>
            <span>${Number(publish.live || 0).toLocaleString('uk')} live · ${Number(publish.failed || 0).toLocaleString('uk')} failed</span>
            <small>${escapeHtml(publish.latest?.url || publish.latest?.message || 'Ще немає останньої перевіреної зміни.')}</small>
          </article>
        </div>
      </section>
      <section>
        <h3>Перевірка результату листів</h3>
        <div class="source-list">
          <article class="source-row ${tracking.publicTrackingConfigured ? 'ok' : 'warn'}">
            <strong>${tracking.publicTrackingConfigured ? 'Tracking налаштований' : 'Є сліпа зона tracking'}</strong>
            <span>${Number(tracking.sent || 0).toLocaleString('uk')} sent · ${Number(tracking.ordered || 0).toLocaleString('uk')} orders</span>
            <small>${Number(tracking.revenueAfterCampaign || 0).toLocaleString('uk')} грн після email</small>
          </article>
        </div>
      </section>
    </section>
  `;
}

function renderMonitoring() {
  const today = state.today || {};
  const metrics = today.metrics || {};
  const monitoring = state.monitoring || {};
  const competitors = monitoring.competitors || {};
  const ux = monitoring.ux || {};
  $('#monitoringPanel').innerHTML = `
    <section class="module-hero">
      <p class="eyebrow">Реклама, конкуренти і UX</p>
      <h2>Система має дивитись назовні: бюджет, ринок, ціни конкурентів і шлях покупця</h2>
      <p>Підприємець не повинен сам щотижня перевіряти конкурентів, рекламні витрати й UX. AI-оператор збирає сигнали і переводить їх у конкретні задачі.</p>
    </section>
    <div class="monitor-grid">
      <article class="monitor-card">
        <strong>${escapeHtml(competitors.status || 'unknown')}</strong>
        <span>конкуренти і ціни · ${escapeHtml(competitors.lastRunLocal || competitors.lastRunAt || 'ще не запускалось')}</span>
      </article>
      <article class="monitor-card">
        <strong>${escapeHtml(ux.status || 'unknown')}</strong>
        <span>UX і шлях покупця · ${escapeHtml(ux.lastRunLocal || ux.lastRunAt || 'ще не запускалось')}</span>
      </article>
      ${Object.entries(metrics).map(([key, item]) => `
        <article class="monitor-card">
          <strong>${escapeHtml(item.value || '—')}</strong>
          <span>${escapeHtml(key)} · ${escapeHtml(item.note || '')}</span>
        </article>
      `).join('')}
    </div>
    ${renderModuleStrip([
      {
        title: 'Щотижневий огляд конкурентів і цін',
        note: 'Автоматично оновити дані: ціни, зміни на сторінках, сильні місця конкурентів і де ваш бізнес може виграти.',
        monitoringKind: 'competitors',
        cta: 'Запустити конкурентів'
      },
      {
        title: 'UX і конверсія сайту',
        note: 'Знайти, що покупцю незрозуміло, де слабкий офер, де сторінка або шлях до замовлення заважає купити.',
        monitoringKind: 'ux',
        cta: 'Запустити UX'
      },
      {
        title: 'Детальний конкурентний аналіз',
        note: 'Ручні URL конкурентів, сторінки, SEO gaps і різниця в оферах.',
        tab: 'analysis',
        cta: 'Деталі'
      },
      {
        title: 'UX checklist',
        note: 'Пункти реалізації і контроль після змін, щоб не просто “покращити дизайн”, а прибрати перешкоди для покупки.',
        tab: 'trends',
        cta: 'Checklist'
      }
    ])}
    <ul class="issue-list monitor-issues">
      ${(today.readiness?.issues || []).map(issue => `<li>${escapeHtml(issue)}</li>`).join('') || '<li>Критичних сліпих зон для поточних дій не знайдено.</li>'}
    </ul>
    <div class="content-bottom-grid monitor-issues">
      <section>
        <h3>Останній огляд конкурентів</h3>
        <p class="muted-copy">${escapeHtml(competitors.summary || competitors.note || 'Щотижневий огляд конкурентів ще треба запускати з цього екрана.')}</p>
      </section>
      <section>
        <h3>Останній UX аналіз</h3>
        <p class="muted-copy">${escapeHtml(ux.summary || ux.note || 'UX аналіз ще треба запускати з цього екрана.')}</p>
      </section>
    </div>
  `;
}

function renderAll() {
  $('#apiSource').textContent = `Джерело API: ${state.today?.source || 'невідомо'}`;
  renderOnboarding();
  renderConnect();
  renderToday();
  renderOwnerRouter();
  renderRouteFocus();
  renderQueue();
  renderModules();
  renderProductCard();
  renderContentTools();
  renderContentList();
  renderContentDetail();
  renderCustomerDna();
  renderAds();
  renderStore();
  renderWorkbenchList();
  renderWorkbenchDetail();
  renderDemoReadiness();
  renderMonitoring();
}

async function loadData({ refresh = false } = {}) {
  setSync(refresh ? 'Оновлення' : 'Завантаження');
  try {
    const optionalProductMatrix = getProductsMatrix({ refresh: false }).catch(error => ({
      ok: false,
      error: error.message || String(error),
      matrix: { topOpportunities: [] },
      topOpportunities: []
    }));
    const [today, setupGuide, work, content, customerDna, demoReadiness, monitoring, productMatrix] = await Promise.all([
      getToday({ refresh }),
      getSetupGuide({ refresh: false }),
      getWorkItems({ refresh: false }),
      getContentWorkbench({ refresh: false }),
      getCustomerDna({ refresh: false }),
      getDemoReadiness({ refresh: false }),
      getMonitoringStatus(),
      optionalProductMatrix
    ]);
    setState({
      today,
      setupGuide,
      workItems: work.items || [],
      contentItems: content.items || [],
      customerDna,
      productMatrix,
      demoReadiness,
      monitoring,
      selectedId: state.selectedId || today.primary?.id || work.items?.[0]?.id || '',
      selectedContentId: state.selectedContentId || content.items?.[0]?.id || ''
    });
    setSync('Синхронізовано');
    toast(refresh ? 'Сигнали оновлено.' : 'v2 завантажено.');
  } catch (error) {
    setSync('Помилка', 'error');
    toast(error.message || String(error));
  }
}

async function runMonitoring(kind) {
  try {
    setSync(kind === 'ux' ? 'UX run' : 'Competitor run');
    const result = kind === 'ux'
      ? await runUxMonitoring({ category: 'e-commerce', niche: 'спеціалті кава та чай' })
      : await runCompetitorMonitoring({ limit: 5 });
    toast(kind === 'ux' ? 'UX monitoring оновлено.' : 'Competitor monitoring оновлено.');
    setState({ monitoring: { ...(state.monitoring || {}), ...(result.summary ? { [kind === 'ux' ? 'ux' : 'competitors']: result.summary } : {}) } });
    await loadData({ refresh: true });
  } catch (error) {
    setSync('Помилка', 'error');
    toast(error.message || String(error));
  }
}

function openContentByUrl(url = '') {
  const clean = String(url || '').trim();
  const match = state.contentItems.find(item => item.url === clean)
    || state.contentItems.find(item => clean && item.url && (item.url.includes(clean) || clean.includes(item.url)));
  if (match) setState({ selectedContentId: match.id });
  switchView('content');
}

async function runOwnerRouter(query = '') {
  const clean = String(query || '').trim();
  setState({
    ownerRouter: {
      ...(state.ownerRouter || {}),
      query: clean,
      loading: true,
      error: ''
    }
  });
  try {
    const result = await routeOwnerRequest(clean);
    setState({
      ownerRouter: {
        ...(state.ownerRouter || {}),
        query: result.query || clean,
        loading: false,
        result,
        error: ''
      }
    });
    toast(result.title || 'Router оновив напрямок.');
  } catch (error) {
    setState({
      ownerRouter: {
        ...(state.ownerRouter || {}),
        loading: false,
        error: error.message || String(error)
      }
    });
    toast(error.message || String(error));
  }
}

function ownerRouterLogPayload(route = {}, status = 'started') {
  const action = route.action || {};
  const routeInfo = route.route || {};
  return {
    actionId: route.actionId || routeInfo.actionId || `director-router-${route.workflow || route.intent || 'workflow'}`,
    title: route.title || routeInfo.targetName || route.workflow || 'Owner Router workflow',
    status,
    source: 'app_v2_owner_router',
    note: [
      route.query ? `Запит: ${route.query}` : '',
      routeInfo.targetName ? `Ціль: ${routeInfo.targetName}` : '',
      routeInfo.targetUrl ? `URL: ${routeInfo.targetUrl}` : ''
    ].filter(Boolean).join('\n'),
    action: {
      ...action,
      workflow: route.workflow || routeInfo.workflow || '',
      skill: route.skill || '',
      route: routeInfo
    },
    hypothesis: route.why || route.nextStep || '',
    expectedImpact: route.control || route.verification || ''
  };
}

async function logOwnerRouterRoute(route = null, status = 'started', { silent = false } = {}) {
  if (!route) return null;
  try {
    const result = await logCommandEvent(ownerRouterLogPayload(route, status));
    const nextRoute = {
      ...route,
      status,
      statusLabel: statusLabel(status),
      loggedAt: result?.event?.createdAt || new Date().toISOString()
    };
    setState({
      ownerRouter: {
        ...(state.ownerRouter || {}),
        activeRoute: nextRoute
      }
    });
    if (!silent) toast(`Маршрут збережено: ${statusLabel(status)}`);
    return result;
  } catch (error) {
    if (!silent) toast(error.message || String(error));
    return null;
  }
}

function runOwnerRouterAction(source = 'result') {
  const active = source === 'active'
    ? (state.ownerRouter?.activeRoute || state.ownerRouter?.result || {})
    : (state.ownerRouter?.result || state.ownerRouter?.activeRoute || {});
  const action = active.action || {};
  if (!Object.keys(action).length) return;
  setState({
    ownerRouter: {
      ...(state.ownerRouter || {}),
      activeRoute: active
    }
  });
  logOwnerRouterRoute(active, 'started', { silent: true });
  if (action.contentType) {
    setState({ filters: { ...state.filters, contentType: action.contentType } });
  }
  if (action.workItemId) {
    setState({ selectedId: action.workItemId });
  }
  if (action.openContentUrl) {
    openContentByUrl(action.openContentUrl);
    return;
  }
  if (action.storeTool) {
    openStoreTool(action.storeTool);
    return;
  }
  if (action.view) {
    switchView(action.view);
  }
  const actionLegacyTab = action.legacyTab || action.tab || '';
  if (actionLegacyTab) {
    if (actionLegacyTab === 'email') {
      const segmentWorkItem = action.segmentId
        ? state.workItems.find(item => (item.actions || []).some(row => row.segmentId === action.segmentId)
          || customerActionSegmentId(item) === action.segmentId)
        : null;
      if (segmentWorkItem) {
        setState({ selectedId: segmentWorkItem.id });
        switchView('workbench');
        loadEmailSegments();
        loadEmailTracking();
        return;
      }
      if (action.workItemId) {
        switchView('workbench');
        loadEmailSegments();
        loadEmailTracking();
        return;
      }
      setState({ filters: { ...state.filters, type: 'customer' } });
      switchView('queue');
      loadEmailSegments();
      loadEmailTracking();
      return;
    }
    switchView(legacyTabToView(actionLegacyTab));
  }
}

async function runOwnerRouterDecision(status) {
  const route = state.ownerRouter?.activeRoute || state.ownerRouter?.result || null;
  if (!route) return;
  await logOwnerRouterRoute(route, status);
  if (['done', 'deferred', 'dismissed'].includes(status)) {
    await loadData({ refresh: true });
  }
}

function selectedContentPayload(item) {
  const draft = item.draft || {};
  const readField = (name) => $(`#contentDetail [data-content-field="${name}"]`)?.value || '';
  return {
    ...draft,
    title: readField('title') || draft.title || item.proposed?.title || '',
    metaDescription: readField('metaDescription') || draft.metaDescription || item.proposed?.metaDescription || '',
    h1: readField('h1') || draft.h1 || item.proposed?.h1 || '',
    content: readField('content') || draft.content || '',
    url: draft.url || item.url || '',
    productName: draft.productName || item.name || '',
    source: 'app_v2_content_workbench'
  };
}

function refreshContentDraftAssist() {
  const item = selectedContentItem();
  if (!item) return;
  const payload = selectedContentPayload(item);
  const publishResult = state.publishResults[item.id] || null;
  const canPublish = Boolean(
    publishResult
    && publishResult.ok !== false
    && publishResult.dryRun
    && publishResult._payloadSignature === contentPayloadSignature(payload)
  );
  const workflow = $('#contentWorkflowPanel');
  if (workflow) workflow.outerHTML = contentWorkflowPanelHtml(item, payload, publishResult, canPublish);
  const checklist = $('#contentDraftChecklist');
  if (checklist) checklist.innerHTML = contentDraftChecklistHtml(payload, publishResult, item.id);
  const preview = $('#customerCopyPreview');
  if (preview) preview.innerHTML = safePreviewHtml(payload.content || '<p>Опис ще не підготовлений.</p>');
  const payloadPreview = $('#contentDetail .payload-details pre');
  if (payloadPreview) payloadPreview.textContent = JSON.stringify(payload, null, 2);
  document.querySelectorAll('#contentDetail [data-content-publish]').forEach(publishButton => {
    publishButton.disabled = !canPublish;
    publishButton.textContent = canPublish ? '2. Опублікувати' : '2. Спочатку dry-run';
  });
}

function contentItemsWithDraft(itemId, payload) {
  return state.contentItems.map(item => item.id === itemId
    ? { ...item, draft: { ...(item.draft || {}), ...payload } }
    : item);
}

async function submitDecision(id, status, noteOverride = '') {
  const item = state.workItems.find(row => row.id === id)
    || state.contentItems.find(row => row.id === id)
    || state.today?.primary;
  const note = noteOverride || $('#decisionNote')?.value || '';
  try {
    await decideWorkItem(id, {
      status,
      note,
      title: item?.title || item?.summary || item?.name || id,
      source: 'app_v2'
    });
    toast(`Рішення збережено: ${statusLabel(status)}`);
    await loadData({ refresh: true });
  } catch (error) {
    toast(error.message || String(error));
  }
}

async function runContentPublish(itemId, { dryRun = true } = {}) {
  const item = state.contentItems.find(row => row.id === itemId);
  if (!item) return;
  const payload = selectedContentPayload(item);
  const signature = contentPayloadSignature(payload);
  if (!dryRun) {
    const previous = state.publishResults[itemId] || null;
    if (!previous || previous.ok === false || !previous.dryRun || previous._payloadSignature !== signature) {
      const failed = {
        ok: false,
        error: 'Спочатку зробіть dry-run для саме цієї версії title/meta/H1/HTML. Після будь-якої зміни dry-run треба повторити.',
        _payloadSignature: signature
      };
      setState({
        contentItems: contentItemsWithDraft(itemId, payload),
        publishResults: { ...state.publishResults, [itemId]: failed }
      });
      toast('Publish заблоковано: потрібен актуальний dry-run.');
      return;
    }
  }
  try {
    setSync(dryRun ? 'Dry-run' : 'Publish');
    const result = await publishContent(payload, { dryRun });
    setState({
      contentItems: contentItemsWithDraft(itemId, payload),
      publishResults: { ...state.publishResults, [itemId]: { ...result, _payloadSignature: signature } }
    });
    setSync('Синхронізовано');
    toast(dryRun ? 'Dry-run готовий.' : 'Publish виконано, перевірка записана.');
    if (!dryRun && result.ok) {
      await submitDecision(item.linkedWorkItemId || item.id, 'done', `Publish через Content Workbench: ${result.url || item.url || ''}`);
    }
  } catch (error) {
    setSync('Помилка', 'error');
    const failed = { ok: false, error: error.message || String(error), _payloadSignature: signature };
    setState({
      contentItems: contentItemsWithDraft(itemId, payload),
      publishResults: { ...state.publishResults, [itemId]: failed }
    });
    toast(error.message || String(error));
  }
}

async function runContentRepair(itemId) {
  const item = state.contentItems.find(row => row.id === itemId);
  if (!item) return;
  const payload = selectedContentPayload(item);
  try {
    setSync('Виправляю');
    const result = await repairContentDraft({
      itemId,
      name: item.name,
      itemType: item.type,
      url: item.url,
      proposed: item.proposed || {},
      draft: payload
    });
    const repaired = result.repaired || {};
    setState({
      contentItems: contentItemsWithDraft(itemId, repaired),
      publishResults: {
        ...state.publishResults,
        [itemId]: {
          ok: true,
          dryRun: false,
          message: result.reasonsBefore?.length
            ? `Чернетку виправлено: ${result.reasonsBefore.join(', ')}. Тепер зробіть dry-run.`
            : 'Чернетку оновлено. Тепер зробіть dry-run.'
        }
      }
    });
    setSync('Синхронізовано');
    toast('Чернетку виправлено. Перевір preview і зроби dry-run.');
  } catch (error) {
    setSync('Помилка', 'error');
    toast(error.message || String(error));
  }
}

async function loadEmailSegments({ force = false } = {}) {
  if (state.emailSegments?.data && !force) return state.emailSegments.data;
  setState({ emailSegments: { ...(state.emailSegments || {}), loading: true, error: '' } });
  try {
    const data = await getEmailSegments();
    setState({ emailSegments: { loading: false, error: '', data } });
    return data;
  } catch (error) {
    setState({ emailSegments: { ...(state.emailSegments || {}), loading: false, error: error.message || String(error) } });
    toast(error.message || String(error));
    return null;
  }
}

async function loadEmailTracking({ force = false } = {}) {
  if (state.emailTracking?.data && !force) return state.emailTracking.data;
  setState({ emailTracking: { ...(state.emailTracking || {}), loading: true, error: '' } });
  try {
    const data = await getEmailTracking();
    setState({ emailTracking: { loading: false, error: '', data } });
    return data;
  } catch (error) {
    setState({ emailTracking: { ...(state.emailTracking || {}), loading: false, error: error.message || String(error) } });
    toast(error.message || String(error));
    return null;
  }
}

function withClientTimeout(promise, ms = 45000, message = 'AI довго не відповідає') {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })
  ]).finally(() => clearTimeout(timer));
}

function customerItemById(itemId = '') {
  return state.workItems.find(row => row.id === itemId) || selectedWorkItem();
}

async function generateCustomerEmail(itemId = '') {
  const item = customerItemById(itemId);
  if (!item) return;
  const key = emailWorkflowKey(item);
  const workflow = getEmailWorkflow(key);
  const segmentBeforeLoad = emailSegmentForItem(item);
  const campaign = customerWorkflowCampaign(item, workflow, segmentBeforeLoad);
  const coupon = customerWorkflowCoupon(item, workflow);
  patchEmailWorkflow(key, { loading: true, error: '', warning: '', result: null, resultLabel: '', campaign, coupon });
  try {
    await loadEmailSegments();
    const segment = emailSegmentForItem(item);
    const campaignAfterLoad = customerWorkflowCampaign(item, { ...workflow, campaign }, segment);
    const result = await withClientTimeout(generateEmail({
      scenario: segment.scenario || 'post_purchase',
      customerContext: [
        `Дія: ${item.title}`,
        item.why ? `Чому: ${item.why}` : '',
        item.expectedImpact ? `Очікуваний ефект: ${item.expectedImpact}` : '',
        item.data?.length ? `Дані: ${item.data.join('; ')}` : '',
        campaignPromptText(campaignAfterLoad)
      ].filter(Boolean).join('\n'),
      productOffer: campaignAfterLoad.offer || campaignAfterLoad.topic || segment.offerHint || (segment.topProducts || []).slice(0, 3).map(row => row.name).join(', ') || 'персональна рекомендація Mercato',
      goal: campaignAfterLoad.goal || segment.goal || item.expectedImpact || 'підштовхнути до доречної повторної покупки',
      discount: coupon.enabled
        ? `дозволений персональний купон ${couponLabel(coupon)}, діє ${Number(coupon.days || 7).toLocaleString('uk')} дн.; не вигадуй код, використовуй [ПРОМОКОД] або нейтральний опис`
        : 'без агресивної знижки; персональний бонус тільки якщо доречно',
      coupon: couponSettingsFromUi(coupon),
      tone: 'теплий, експертний, короткий, без тиску',
      segmentData: {
        ...segment,
        actionId: item.id,
        campaignId: item.id,
        campaignBrief: campaignAfterLoad
      }
    }), 45000, 'AI не встиг згенерувати лист за 45 секунд');
    const email = Array.isArray(result.emails) ? result.emails[0] : null;
    if (!email) throw new Error('AI не повернув готовий лист');
    const baseDraft = draftWithCoupon({
      ...email,
      name: email.name || 'Email 1',
      actionId: item.id,
      campaignId: item.id,
      segmentId: segment.id || customerActionSegmentId(item),
      segmentTitle: segment.title || item.title
    }, coupon);
    const draft = coupon.code
      ? draftWithCoupon({
          ...baseDraft,
          body: bodyWithGeneratedCouponCode(baseDraft.body, coupon, coupon.code, coupon.dateEnd)
        }, coupon)
      : baseDraft;
    patchEmailWorkflow(key, {
      loading: false,
      error: '',
      warning: '',
      draft,
      campaign: campaignAfterLoad,
      coupon,
      strategy: result.strategy || null,
      notes: result.notes || [],
      result: null,
      resultLabel: ''
    });
    toast('Чернетку підготовлено у v2.');
  } catch (error) {
    const segment = emailSegmentForItem(item);
	    const fallbackBaseDraft = draftWithCoupon(localCampaignDraft(item, segment, campaign), coupon);
	    const fallbackDraft = coupon.code
	      ? draftWithCoupon({
	          ...fallbackBaseDraft,
	          body: bodyWithGeneratedCouponCode(fallbackBaseDraft.body, coupon, coupon.code, coupon.dateEnd)
	        }, coupon)
	      : fallbackBaseDraft;
    patchEmailWorkflow(key, {
      loading: false,
      error: '',
      warning: `${error.message || String(error)}. Показую швидку локальну чернетку, її можна відредагувати і протестувати.`,
      draft: fallbackDraft,
      campaign,
      coupon
    });
    toast('AI не відповів вчасно, показав локальну чернетку.');
  }
}

async function generateCustomerEmailBatch(itemId = '') {
  const item = customerItemById(itemId);
  if (!item) return;
  const key = emailWorkflowKey(item);
  const workflow = getEmailWorkflow(key);
  const campaign = customerWorkflowCampaign(item, workflow, emailSegmentForItem(item));
  const coupon = customerWorkflowCoupon(item, workflow);
  patchEmailWorkflow(key, { loading: true, error: '', warning: '', result: null, resultLabel: '', campaign, coupon });
  try {
    await loadEmailSegments();
    const segment = emailSegmentForItem(item);
    const batch = await withClientTimeout(generateEmailBatch({
      segment: {
        ...segment,
        actionId: item.id,
        campaignId: item.id,
        campaignBrief: campaign
      },
      limit: 5,
      tone: 'теплий, експертний, короткий, без тиску',
      discount: coupon.enabled
        ? `персональний купон ${couponLabel(coupon)}, діє ${Number(coupon.days || 7).toLocaleString('uk')} дн.; не вигадувати конкретний код`
        : 'персональний бонус тільки якщо доречно',
      coupon: couponSettingsFromUi(coupon),
      campaignBrief: campaign
    }), 45000, 'AI не встиг підготувати персональні приклади за 45 секунд');
    patchEmailWorkflow(key, { loading: false, error: '', batch });
    toast('Показав персональні приклади.');
  } catch (error) {
    const segment = emailSegmentForItem(item);
    patchEmailWorkflow(key, {
      loading: false,
      error: '',
      warning: `${error.message || String(error)}. Для прикладів використайте швидку чернетку або повторіть генерацію.`,
      draft: workflow.draft || draftWithCoupon(localCampaignDraft(item, segment, campaign), coupon),
      campaign,
      coupon
    });
    toast('AI не відповів вчасно.');
  }
}

async function createCouponForEmailDraft(itemId = '') {
  const item = customerItemById(itemId);
  if (!item) return;
  const key = emailWorkflowKey(item);
  const workflow = getEmailWorkflow(key);
  const segment = emailSegmentForItem(item);
  const draft = customerWorkflowDraft(item, workflow);
  const coupon = { ...customerWorkflowCoupon(item, { ...workflow, draft }), enabled: true };
  patchEmailWorkflow(key, { coupon, couponLoading: true, error: '', warning: '', result: null, resultLabel: '' });
  try {
    const recipient = selectedEmailRecipient(key, segment);
    const result = await createEmailCoupon({
      customerName: recipient?.name || segment.title || item.title || 'Email draft',
      discount: coupon.discount,
      type: coupon.type,
      days: coupon.days,
      uses_total: 1000
    });
    const code = normalizeCouponCode(result.code || result.couponCode);
    if (!code) throw new Error('OpenCart не повернув код купона');
    const couponWithCode = {
      ...coupon,
      enabled: true,
      code,
      dateEnd: result.date_end || result.dateEnd || result.dateEndUtc || ''
    };
    const updatedDraft = draftWithCoupon({
      ...draft,
      body: bodyWithGeneratedCouponCode(draft.body, couponWithCode, code, couponWithCode.dateEnd)
    }, couponWithCode);
    patchEmailWorkflow(key, {
      coupon: couponWithCode,
      couponLoading: false,
      draft: updatedDraft,
      warning: `Купон ${code} створено в OpenCart і вставлено в лист.`,
      result: { ok: true, couponCode: code, coupon: result },
      resultLabel: 'Купон створено'
    });
    toast(`Купон ${code} вставлено в лист.`);
  } catch (error) {
    patchEmailWorkflow(key, { couponLoading: false, error: error.message || String(error) });
    toast(error.message || String(error));
  }
}

async function sendCustomerEmailTest(itemId = '') {
  const item = customerItemById(itemId);
  if (!item) return;
  const key = emailWorkflowKey(item);
  const workflow = getEmailWorkflow(key);
  const draft = customerWorkflowDraft(item, workflow);
  const to = $(`#${emailDomId(key, 'testTo')}`)?.value?.trim() || '';
  if (!emailDraftReady(draft)) {
    toast('Спочатку заповніть тему і текст листа.');
    return;
  }
  if (!to) {
    toast('Вкажіть email для тесту.');
    return;
  }
  patchEmailWorkflow(key, { loading: true, error: '', draft, result: null, resultLabel: '' });
  try {
    const coupon = customerWorkflowCoupon(item, { ...workflow, draft });
    const result = await sendEmailTest({
      to,
      subject: draft.subject,
      preheader: draft.preheader,
      body: bodyWithCouponPreview(draft.body, coupon),
      cta: draft.cta,
      ctaUrl: draft.ctaUrl
    });
    patchEmailWorkflow(key, { loading: false, result, resultLabel: 'Тестовий лист відправлено' });
    await loadEmailTracking({ force: true });
    toast('Тестовий лист відправлено.');
  } catch (error) {
    patchEmailWorkflow(key, { loading: false, error: error.message || String(error) });
    toast(error.message || String(error));
  }
}

async function sendCustomerEmailOne(itemId = '') {
  const item = customerItemById(itemId);
  if (!item) return;
  const key = emailWorkflowKey(item);
  const workflow = getEmailWorkflow(key);
  const segment = emailSegmentForItem(item);
  const customer = selectedEmailRecipient(key, segment);
  const draft = customerWorkflowDraft(item, workflow);
  if (!emailDraftReady(draft)) {
    toast('Спочатку заповніть тему і текст листа.');
    return;
  }
  if (!customer?.email) {
    toast('Оберіть клієнта для персональної відправки.');
    return;
  }
  const confirmPhrase = prompt(`Для відправки клієнту ${customer.name || customer.email} введіть SEND_MERCATO_EMAIL`);
  if (confirmPhrase !== 'SEND_MERCATO_EMAIL') {
    toast('Відправку скасовано.');
    return;
  }
  const personalDraft = personalizeCustomerDraft(draft, customer);
  patchEmailWorkflow(key, { loading: true, error: '', draft, result: null, resultLabel: '', coupon: customerWorkflowCoupon(item, { ...workflow, draft }) });
  try {
    const result = await sendEmailOne({
      draft: draftWithCoupon(personalDraft, customerWorkflowCoupon(item, { ...workflow, draft })),
      confirmPhrase
    });
    patchEmailWorkflow(key, {
      loading: false,
      result,
      resultLabel: `Персональний лист відправлено: ${customer.name || maskEmail(customer.email)}`,
      draft
    });
    await loadEmailTracking({ force: true });
    toast(`Лист відправлено: ${maskEmail(customer.email)}.`);
  } catch (error) {
    patchEmailWorkflow(key, { loading: false, error: error.message || String(error) });
    toast(error.message || String(error));
  }
}

async function sendCustomerEmailSegment(itemId = '') {
  const item = customerItemById(itemId);
  if (!item) return;
  const key = emailWorkflowKey(item);
  const workflow = getEmailWorkflow(key);
  const draft = customerWorkflowDraft(item, workflow);
  if (!emailDraftReady(draft)) {
    toast('Спочатку заповніть тему і текст листа.');
    return;
  }
  const limit = Math.min(Math.max(Number($(`#${emailDomId(key, 'sendLimit')}`)?.value || workflow.sendLimit || 20), 1), 100);
  const confirmPhrase = prompt(`Для групової відправки до ${limit} клієнтів введіть SEND_MERCATO_SEGMENT`);
  if (confirmPhrase !== 'SEND_MERCATO_SEGMENT') {
    toast('Відправку скасовано.');
    return;
  }
  const coupon = customerWorkflowCoupon(item, { ...workflow, draft });
  patchEmailWorkflow(key, { loading: true, error: '', draft, result: null, resultLabel: '', sendLimit: limit, coupon });
  try {
    await loadEmailSegments();
    const segment = {
      ...emailSegmentForItem(item),
      actionId: item.id,
      campaignId: item.id
    };
    const result = await sendEmailSegment({
      segment,
      draft: draftWithCoupon(draft, coupon),
      limit,
      confirmPhrase
    });
    patchEmailWorkflow(key, { loading: false, result, resultLabel: 'Групова хвиля відправлена', sendLimit: limit });
    await loadEmailTracking({ force: true });
    toast(`Відправлено: ${Number(result.sent?.length || 0).toLocaleString('uk')}.`);
  } catch (error) {
    patchEmailWorkflow(key, { loading: false, error: error.message || String(error) });
    toast(error.message || String(error));
  }
}

function applyEmailTemplate(itemId = '', kind = '') {
  const item = customerItemById(itemId);
  if (!item) return;
  const key = emailWorkflowKey(item);
  const workflow = getEmailWorkflow(key);
  const segment = emailSegmentForItem(item);
  const base = customerWorkflowCampaign(item, workflow, segment);
  const campaign = kind === 'preorder'
    ? {
        ...base,
        type: 'preorder',
        topic: base.topic || 'передзамовлення фермерської арабіки',
        offer: base.offer || 'Рідкісний лот, обмежена кількість, збираємо заявки до поставки. Вкажіть очікувану дату, смаковий профіль і умову резерву.',
        goal: base.goal || 'зібрати передзамовлення і зрозуміти попит до закупівлі'
      }
    : {
        ...base,
        type: 'new_arrival',
        topic: base.topic || 'новий врожай Мексика Марагоджип',
        offer: base.offer || 'Новий свіжий лот. Додайте смаковий профіль, кількість, ціну, дату обсмаження і для кого цей сорт.',
        goal: base.goal || 'повідомити про новий лот і привести клієнтів на сторінку товару'
      };
  patchEmailWorkflow(key, { campaign, warning: '', error: '' });
}

function createLocalCustomerDraft(itemId = '') {
  const item = customerItemById(itemId);
  if (!item) return;
  const key = emailWorkflowKey(item);
  const workflow = getEmailWorkflow(key);
  const segment = emailSegmentForItem(item);
  const campaign = customerWorkflowCampaign(item, workflow, segment);
  const coupon = customerWorkflowCoupon(item, workflow);
  const baseDraft = draftWithCoupon(localCampaignDraft(item, segment, campaign), coupon);
  const draft = coupon.code
    ? draftWithCoupon({
        ...baseDraft,
        body: bodyWithGeneratedCouponCode(baseDraft.body, coupon, coupon.code, coupon.dateEnd)
      }, coupon)
    : baseDraft;
  patchEmailWorkflow(key, {
    campaign,
    coupon,
    draft,
    warning: 'Це швидка локальна чернетка без AI. Відредагуйте текст, зробіть тест собі і тільки потім відправляйте.',
    error: ''
  });
}

function syncEmailCouponSettings(itemId = '') {
  const item = customerItemById(itemId);
  if (!item) return;
  const key = emailWorkflowKey(item);
  const workflow = getEmailWorkflow(key);
  const coupon = customerWorkflowCoupon(item, workflow);
  const patch = { coupon, result: null, resultLabel: '' };
  if (workflow.draft) {
    const currentDraft = customerWorkflowDraft(item, workflow);
    const shouldStripCoupon = !coupon.enabled || (!coupon.code && Boolean(workflow.draft?.couponCode));
    patch.draft = draftWithCoupon({
      ...currentDraft,
      body: shouldStripCoupon ? stripClientCouponText(currentDraft.body) : currentDraft.body
    }, coupon);
  }
  patchEmailWorkflow(key, patch);
}

function applyEmailSubjectIdea(itemId = '', subject = '') {
  const item = customerItemById(itemId);
  if (!item || !subject) return;
  const key = emailWorkflowKey(item);
  const workflow = getEmailWorkflow(key);
  const draft = customerWorkflowDraft(item, workflow);
  patchEmailWorkflow(key, {
    draft: {
      ...draft,
      subject
    },
    result: null,
    resultLabel: ''
  });
}

function insertEmailText(itemId = '', text = '') {
  const item = customerItemById(itemId);
  if (!item || !text) return;
  const key = emailWorkflowKey(item);
  const workflow = getEmailWorkflow(key);
  const draft = customerWorkflowDraft(item, workflow);
  const body = `${draft.body || ''}${text}`.trimStart();
  patchEmailWorkflow(key, {
    draft: {
      ...draft,
      body
    },
    result: null,
    resultLabel: ''
  });
}

document.addEventListener('click', event => {
  const routerPrompt = event.target.closest('[data-router-prompt]');
  if (routerPrompt) {
    const query = routerPrompt.dataset.routerPrompt || '';
    const input = $('#ownerRouterInput');
    if (input) input.value = query;
    runOwnerRouter(query);
    return;
  }

  const ownerRoute = event.target.closest('[data-owner-route]');
  if (ownerRoute) {
    runOwnerRouter($('#ownerRouterInput')?.value || '');
    return;
  }

  const ownerAction = event.target.closest('[data-owner-action]');
  if (ownerAction) {
    runOwnerRouterAction(ownerAction.dataset.ownerAction || 'result');
    return;
  }

  const routeClose = event.target.closest('[data-owner-route-close]');
  if (routeClose) {
    setState({
      ownerRouter: {
        ...(state.ownerRouter || {}),
        activeRoute: null
      }
    });
    return;
  }

  const routeStatus = event.target.closest('[data-owner-route-status]');
  if (routeStatus) {
    runOwnerRouterDecision(routeStatus.dataset.ownerRouteStatus || 'started');
    return;
  }

  const nav = event.target.closest('[data-view]');
  if (nav) switchView(nav.dataset.view);

  const go = event.target.closest('[data-go]');
  if (go) {
    if (go.dataset.filterType) {
      setState({ filters: { ...state.filters, type: go.dataset.filterType } });
    }
    switchView(go.dataset.go);
  }

  const open = event.target.closest('[data-open-item]');
  if (open) {
    const nextItem = state.workItems.find(item => item.id === open.dataset.openItem);
    setState({ selectedId: open.dataset.openItem });
    switchView('workbench');
    if (nextItem?.type === 'customer' || nextItem?.target?.kind === 'customer') {
      loadEmailSegments();
      loadEmailTracking();
    }
  }

  const openContent = event.target.closest('[data-open-content-url]');
  if (openContent) openContentByUrl(openContent.dataset.openContentUrl);

  const item = event.target.closest('.workbench-list .work-item');
  if (item?.dataset.id) {
    const nextItem = state.workItems.find(row => row.id === item.dataset.id);
    setState({ selectedId: item.dataset.id });
    if (nextItem?.type === 'customer' || nextItem?.target?.kind === 'customer') {
      loadEmailSegments();
      loadEmailTracking();
    }
  }

  const contentItem = event.target.closest('.content-row');
  if (contentItem?.dataset.contentId) setState({ selectedContentId: contentItem.dataset.contentId });

  const decision = event.target.closest('[data-decision]');
  if (decision) submitDecision(decision.dataset.decision, decision.dataset.status);

  const contentDecision = event.target.closest('[data-content-decision]');
  if (contentDecision) submitDecision(contentDecision.dataset.contentDecision, contentDecision.dataset.status);

  const dryRun = event.target.closest('[data-content-dry-run]');
  if (dryRun) runContentPublish(dryRun.dataset.contentDryRun, { dryRun: true });

  const publish = event.target.closest('[data-content-publish]');
  if (publish) runContentPublish(publish.dataset.contentPublish, { dryRun: false });

  const repair = event.target.closest('[data-content-repair]');
  if (repair) runContentRepair(repair.dataset.contentRepair);

  const scrollPublish = event.target.closest('[data-scroll-content-publish]');
  if (scrollPublish) $('#contentPublishEditor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const contentTypeShortcut = event.target.closest('[data-content-type-shortcut]');
  if (contentTypeShortcut) {
    setState({ filters: { ...state.filters, contentType: contentTypeShortcut.dataset.contentTypeShortcut } });
    switchView('content');
  }

  const productImport = event.target.closest('[data-product-import]');
  if (productImport) {
    importProductUrl();
    return;
  }

  const productRead = event.target.closest('[data-product-read]');
  if (productRead) {
    readProductFromOpenCart();
    return;
  }

  const productGenerate = event.target.closest('[data-product-generate]');
  if (productGenerate) {
    generateProductCard();
    return;
  }

  const productDryRun = event.target.closest('[data-product-dry-run]');
  if (productDryRun) {
    runProductCardPublish({ dryRun: true });
    return;
  }

  const productPublish = event.target.closest('[data-product-publish]');
  if (productPublish) {
    runProductCardPublish({ dryRun: false });
    return;
  }

  const monitoring = event.target.closest('[data-run-monitoring]');
  if (monitoring) runMonitoring(monitoring.dataset.runMonitoring);

  const storeTool = event.target.closest('[data-store-tool]');
  if (storeTool) openStoreTool(storeTool.dataset.storeTool);

  const emailLoadSegments = event.target.closest('[data-email-load-segments]');
  if (emailLoadSegments) loadEmailSegments({ force: true });

  const emailLoadTracking = event.target.closest('[data-email-load-tracking]');
  if (emailLoadTracking) loadEmailTracking({ force: true });

  const emailTemplate = event.target.closest('[data-email-template]');
  if (emailTemplate) applyEmailTemplate(emailTemplate.dataset.emailTemplate, emailTemplate.dataset.templateKind);

  const emailLocalDraft = event.target.closest('[data-email-local-draft]');
  if (emailLocalDraft) createLocalCustomerDraft(emailLocalDraft.dataset.emailLocalDraft);

  const emailSubjectIdea = event.target.closest('[data-email-subject-idea]');
  if (emailSubjectIdea) applyEmailSubjectIdea(emailSubjectIdea.dataset.emailSubjectIdea, emailSubjectIdea.dataset.subject || '');

  const emailInsert = event.target.closest('[data-email-insert]');
  if (emailInsert) insertEmailText(emailInsert.dataset.emailInsert, emailInsert.dataset.insertText || '');

  const emailGenerate = event.target.closest('[data-email-generate]');
  if (emailGenerate) generateCustomerEmail(emailGenerate.dataset.emailGenerate);

  const emailGenerateBatch = event.target.closest('[data-email-generate-batch]');
  if (emailGenerateBatch) generateCustomerEmailBatch(emailGenerateBatch.dataset.emailGenerateBatch);

  const emailCreateCoupon = event.target.closest('[data-email-create-coupon]');
  if (emailCreateCoupon) createCouponForEmailDraft(emailCreateCoupon.dataset.emailCreateCoupon);

  const emailTest = event.target.closest('[data-email-test]');
  if (emailTest) sendCustomerEmailTest(emailTest.dataset.emailTest);

  const emailSendOne = event.target.closest('[data-email-send-one]');
  if (emailSendOne) sendCustomerEmailOne(emailSendOne.dataset.emailSendOne);

  const emailSendSegment = event.target.closest('[data-email-send-segment]');
  if (emailSendSegment) sendCustomerEmailSegment(emailSendSegment.dataset.emailSendSegment);

  const refreshSetup = event.target.closest('#refreshSetupBtn');
  if (refreshSetup) loadData({ refresh: true });

  const storeRefresh = event.target.closest('[data-store-refresh]');
  if (storeRefresh) loadStoreTool(storeRefresh.dataset.storeRefresh, {
    page: 1,
    search: $('#storeSearchInput')?.value?.trim() || ''
  });

  const storePage = event.target.closest('[data-store-page]');
  if (storePage) loadStoreTool(storePage.dataset.storePageTool || state.store?.tool || 'customers', {
    page: Number(storePage.dataset.storePage || 1),
    search: state.store?.search || ''
  });

  const storeCustomer = event.target.closest('[data-store-customer]');
  if (storeCustomer) openStoreCustomer(storeCustomer.dataset.storeCustomer);

  const closeCustomer = event.target.closest('[data-store-close-customer]');
  if (closeCustomer) patchStore({ selectedCustomer: null });

  const contentField = event.target.closest('[data-content-field]');
  if (contentField) refreshContentDraftAssist();
});

document.addEventListener('input', event => {
  if (event.target.closest('[data-content-field]')) {
    refreshContentDraftAssist();
    return;
  }
  if (event.target.closest('[data-product-draft-field]')) {
    refreshProductCardDraftAssist();
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.id === 'ownerRouterInput') {
    event.preventDefault();
    runOwnerRouter(event.target.value);
    return;
  }
  if (event.key !== 'Enter' || event.target.id !== 'storeSearchInput') return;
  event.preventDefault();
  loadStoreTool(state.store?.tool || 'customers', {
    page: 1,
    search: event.target.value.trim()
  });
});

$('#refreshBtn')?.addEventListener('click', () => loadData({ refresh: true }));
$('#clearApiKeyBtn')?.addEventListener('click', () => {
  clearApiKey();
  toast('API key скинуто.');
});
$('#queueSearch')?.addEventListener('input', event => {
  setState({ filters: { ...state.filters, search: event.target.value } });
});
$('#queuePriority')?.addEventListener('change', event => {
  setState({ filters: { ...state.filters, priority: event.target.value } });
});
$('#queueType')?.addEventListener('change', event => {
  setState({ filters: { ...state.filters, type: event.target.value } });
});
$('#contentTypeFilter')?.addEventListener('change', event => {
  setState({ filters: { ...state.filters, contentType: event.target.value } });
});
document.addEventListener('change', event => {
  const emailCoupon = event.target.closest('[data-email-coupon-field]');
  if (emailCoupon) {
    syncEmailCouponSettings(emailCoupon.dataset.emailCouponField || '');
    return;
  }
  if (event.target.closest('[data-product-card-mode]')) {
    patchProductCard({ form: productCardForm(), publishResult: null });
  }
});
$('#runCompetitorsBtn')?.addEventListener('click', () => runMonitoring('competitors'));
$('#runUxBtn')?.addEventListener('click', () => runMonitoring('ux'));

subscribe(renderAll);
loadData();
