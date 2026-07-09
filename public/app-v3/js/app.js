const VERSION = 'seo-recovery-design-v42-20260706';

const NAV = [
  { id: 'overview', label: 'Головне', icon: 'C', section: 'Щодня', title: 'AI-оператор магазину', eyebrow: 'Command Center', subtitle: 'Один робочий екран: що відбувається, що зробити сьогодні і який результат очікувати.' },
  { id: 'actions', label: 'План на сьогодні', icon: 'A', section: 'Щодня', title: 'План на сьогодні', eyebrow: '3-5 дій', subtitle: 'Не меню і не звіт. Система показує конкретні дії з очікуваним результатом.' },
  { id: 'connect', label: 'Підключити бізнес', icon: 'D', section: 'Старт', title: 'Підключити бізнес', eyebrow: 'Джерела даних', subtitle: 'OpenCart, Google, email і tracking: що працює, чого бракує і як це підключити.' },
  { id: 'customers', label: 'Клієнти і повтори', icon: 'K', section: 'Робота', title: 'Customer Intelligence', eyebrow: 'Повторні продажі', subtitle: 'Система аналізує цикл покупки, шукає аномалії і допомагає тримати клієнтів поруч.' },
  { id: 'email', label: 'Email і купони', icon: 'E', section: 'Робота', title: 'Email & Retention', eyebrow: 'Погодити і надіслати', subtitle: 'Персональні листи, теми, preview, видимий купон і ручне підтвердження перед відправкою.' },
  { id: 'product', label: 'Товар або послуга', icon: 'P', section: 'Робота', title: 'Товар або послуга', eyebrow: 'Контент-оператор', subtitle: 'Оформлення товару: факти, SEO, опис, характеристики, preview, dry-run і publish.' },
  { id: 'seo', label: 'SEO-система', icon: 'S', section: 'Робота', title: 'SEO Center', eyebrow: 'Mercato + Prom3D', subtitle: 'Codex SEO, регулярні read-only аудити, Google readiness, пріоритети, історія і безпечне виконання.' },
  { id: 'merchant', label: 'Merchant Feed', icon: 'F', section: 'Робота', title: 'Merchant Feed Agents', eyebrow: 'Google Shopping readiness', subtitle: 'Агенти сканують каталог, готують точний diff і вносять лише погоджені зміни з readback.' },
  { id: 'matrix', label: 'Матриця товарів', icon: 'M', section: 'Робота', title: 'Product Matrix', eyebrow: 'Товари під увагою', subtitle: 'Що продається, що має попит, де немає SEO або сторінки, і які товари варто просувати.' },
  { id: 'ads', label: 'Реклама, конкуренти, UX', icon: 'R', section: 'Контроль', title: 'Ads, конкуренти і UX', eyebrow: 'Контроль зростання', subtitle: 'GA4/Ads, конкурентні ціни і UX-сигнали. Якщо джерело не підключене, показуємо конкретний next step.' },
  { id: 'settings', label: 'Налаштування', icon: 'N', section: 'Контроль', title: 'Налаштування', eyebrow: 'Доступи і безпека', subtitle: 'Підключення сайту, Google, email, tracking і тарифи без коду.' }
];

const FALLBACK = {
  dashboard: {
    pricing: {
      teamCost: '$2 000-4 500/міс',
      trial: '14 днів безкоштовно',
      plans: [
        { id: 'starter', name: 'Starter', price: '$25/міс', products: 'до 100 товарів', seo: '50 SEO-генерацій/міс', email: '30 AI email-листів/міс' },
        { id: 'growth', name: 'Growth', price: '$50/міс', products: 'до 1 000 товарів', seo: '500 SEO-генерацій/міс', email: '300 AI email-листів/міс' },
        { id: 'pro', name: 'Pro', price: '$100/міс', products: 'необмежено', seo: 'необмежено', email: 'необмежено' }
      ]
    },
    topbar: { store: 'OpenCart магазин' },
    metrics: [
      { id: 'sales_week', label: 'Продажі тиждень', value: '0 грн', unit: 'реальні OpenCart дані', delta: 'підключіть замовлення', tone: 'warn' },
      { id: 'orders_today', label: 'Замовлення сьогодні', value: '0', unit: 'зам.', delta: 'очікуємо sync', tone: 'neutral' },
      { id: 'customers_attention', label: 'Покупці під увагою', value: '0', unit: 'клієнтів', delta: 'потрібна історія', tone: 'warn' },
      { id: 'products_without_seo', label: 'Товари без SEO', value: '0', unit: 'пріоритетів', delta: 'підключіть GSC', tone: 'warn' }
    ],
    actionQueue: [
      { number: 1, id: 'connect-opencart', title: 'Підключити OpenCart bridge', reason: 'Без замовлень і товарів AI може писати тексти, але не може бути командою спеціалістів.', expectedResult: 'Система побачить клієнтів, товари, замовлення і зможе сформувати перші 3 дії.', priority: 'high', type: 'setup', cta: 'Підключити' },
      { number: 2, id: 'connect-gsc', title: 'Підключити Google Search Console', reason: 'SEO-рекомендації мають спиратися на кліки, покази, CTR і позиції.', expectedResult: 'Система знайде сторінки з попитом і низьким CTR.', priority: 'medium', type: 'seo', cta: 'Підключити' },
      { number: 3, id: 'first-email', title: 'Підготувати першу retention-кампанію', reason: 'Після OpenCart видно, хто має нормальний цикл покупки, а хто реально відхилився.', expectedResult: 'Лист без автосенду: тільки preview і ручне підтвердження.', priority: 'medium', type: 'email', cta: 'Підготувати' }
    ],
    attentionCustomers: [],
    seoTop: [],
    productsAttention: [],
    salesChart: [
      { label: 'Пн', revenue: 0, orders: 0 },
      { label: 'Вт', revenue: 0, orders: 0 },
      { label: 'Ср', revenue: 0, orders: 0 },
      { label: 'Чт', revenue: 0, orders: 0 },
      { label: 'Пт', revenue: 0, orders: 0 },
      { label: 'Сб', revenue: 0, orders: 0 },
      { label: 'Нд', revenue: 0, orders: 0 }
    ]
  },
  setup: {
    platform: 'OpenCart',
    ready: 0,
    total: 7,
    label: 'Почніть з OpenCart bridge',
    checks: [],
    wizard: [],
    steps: []
  },
  customers: {
    summary: { customers: 0, orders: 0, revenue: 0, avgOrderValue: 0, readyToBuy: 0, forecastRevenue: 0 },
    segments: [],
    customers: [],
    communicationLog: [],
    cadence: { note: 'Цикл покупки рахується медіаною між замовленнями, щоб не реагувати на нормальні покупки раз на 2 місяці як на відтік.' },
    email: {}
  },
  emailSegments: { segments: [] },
  content: { items: [] },
  matrix: { topOpportunities: [], items: [], matrix: {} },
  workItems: { items: [] },
  connectors: { connectors: [] },
  popupConfig: {
    ok: true,
    config: {
      enabled: false,
      publicBaseUrl: '',
      cooldownDays: 7,
      first: { prefix: 'F10', discount: 10, minTotal: 600, validDays: 3 },
      second: { prefix: 'F15', discount: 15, minTotal: 800, validDays: 23 },
      triggers: { timeMinSeconds: 10, timeMaxSeconds: 15, scrollPercent: 40, exitIntentDesktop: true },
      text: {
        title: '-10% на перше замовлення',
        subtitle: 'Введіть свій телефон — отримаєте персональний промокод.',
        emailPlaceholder: 'Email (необовʼязково)',
        phonePlaceholder: '+380994503223',
        consent: 'Погоджуюсь отримати персональний промокод та повідомлення від Mercato',
        submit: 'Отримати промокод',
        legal: 'Промокод персональний, одноразовий і не сумується з іншими акціями, накопичувальними знижками, HoReCa, оптом або корпоративними умовами. Телефон у замовленні має збігатися з телефоном, введеним у попапі.',
        contactError: 'Введіть телефон у форматі +380XXXXXXXXX або 0XXXXXXXXX.'
      }
    },
    snippet: '<script src="https://crm.mercato.com.ua/mercato-first-order-popup.js" async></script>'
  },
  seoCenter: {
    installation: { installed: false, skills: 0, agents: 0, version: '', coreReady: false, visualReady: false },
    google: { tier: -1, configured: false, description: 'Google API ще не підключені.' },
    profiles: [],
    profile: null,
    auditModes: [],
    jobs: [],
    activeJob: null,
    latest: null,
    intelligence: null,
    weeklyPlan: [],
    fixQueue: { items: [], summary: {} },
    fixPreview: null,
    approvals: [],
    writeRuns: [],
    safety: { readOnly: true }
  },
  merchant: {
    agents: [],
    report: null,
    fixPlan: null,
    writePreview: null,
    approvals: [],
    writeRuns: [],
    jobs: [],
    activeJob: null,
    safety: { readOnlyDefault: true, autoPublish: false, approvalWritesEnabled: true, merchantCenterPublish: false, firstBatchLimit: 5 }
  }
};

const state = {
  route: initialRoute(),
  ready: false,
  loading: false,
  error: '',
  data: {
    today: null,
    setup: null,
    customers: null,
    emailSegments: null,
    content: null,
    matrix: null,
    workItems: null,
    connectors: null,
    popupConfig: null,
    seoCenter: null,
    merchant: null
  },
  selectedSeoId: '',
  selectedCustomerId: '',
  selectedProductId: '',
  seoFilter: 'all',
  seoSearch: '',
  productMode: 'existing',
  emailPreviewMode: 'mobile',
  menuOpen: false,
  email: {
    segmentId: 'risk',
    campaignType: 'new_harvest',
    offer: 'Новий врожай Мексика Maragogype',
    url: 'https://mercato.com.ua/',
    subject: '',
    preheader: '',
    body: '',
    cta: 'Переглянути пропозицію',
    coupon: {
      enabled: true,
      code: '',
      discount: 10,
      type: 'P',
      days: 2
    },
    sending: false,
    couponLoading: false,
    lastResult: null,
    excludedRecipientIds: []
  },
  product: {
    name: 'Кава Мексика Maragogype в зернах',
    url: '',
    type: 'Кава',
    facts: 'Країна: Мексика\nРегіон: Chiapas\nСмак: яблуко, білий чай\nОбробка: SHG, EP\nДля кого: покупці, які люблять чисту кислотність і фільтр',
    title: '',
    meta: '',
    h1: '',
    description: '',
    attributes: '',
    importLoading: false,
    importNote: '',
    importError: '',
    publishLoading: false,
    lastDryRunOk: false,
    lastResult: null
  },
  seoCenter: {
    siteId: 'mercato',
    mode: 'full',
    target: '',
    batchEntities: 10,
    agentBatchLimit: 10,
    lastAgentBatchError: null,
    running: false,
    pollingJobId: ''
  },
  merchant: {
    filter: 'all',
    search: '',
    running: false,
    pollingJobId: ''
  },
  matrix: {
    running: false,
    lastError: ''
  }
};

let seoPollTimer = null;
let merchantPollTimer = null;
let deferredLoadPromise = null;

const $ = selector => document.querySelector(selector);

function initialRoute() {
  const hash = String(window.location.hash || '').replace('#', '');
  return NAV.some(item => item.id === hash) ? hash : 'overview';
}

function routeMeta(id = state.route) {
  return NAV.find(item => item.id === id) || NAV[0];
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function attr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function money(value) {
  const numeric = Number(value || 0);
  if (!numeric) return '0 грн';
  return `${Math.round(numeric).toLocaleString('uk')} грн`;
}

function number(value) {
  return Number(value || 0).toLocaleString('uk');
}

function roundNumber(value, digits = 2) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function text(value, fallback = '') {
  const clean = String(value ?? '').trim();
  return clean || fallback;
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function primaryDataErrorDetails(message = '') {
  const raw = String(message || '').trim();
  const endpoint = raw.startsWith('today:')
    ? '/api/today'
    : raw.startsWith('setup:')
      ? '/api/setup-guide'
      : raw.split(':')[0] || 'primary API';
  const clean = raw.replace(/^[a-zA-Z0-9_-]+:\s*/, '').trim();
  return {
    endpoint,
    title: `Основні дані недоступні: ${endpoint}`,
    body: clean || 'Локальний сервер або bridge не відповів під час стартового завантаження.'
  };
}

function initials(name) {
  return String(name || 'К')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || 'К';
}

function toneClass(tone) {
  if (tone === 'ok' || tone === true) return 'ok';
  if (tone === 'bad' || tone === false) return 'bad';
  if (tone === 'warn' || tone === 'warning') return 'warn';
  return '';
}

function statusLabel(status) {
  const map = {
    new: 'новий',
    active: 'активний',
    watch: 'спостерігати',
    risk: 'ризик',
    churn: 'спить',
    vip: 'VIP',
    done: 'готово',
    active_step: 'активно',
    blocked: 'блокує',
    pending: 'потрібно'
  };
  return map[status] || status || 'під увагою';
}

async function apiFetch(url, options = {}) {
  let commandApiKey = '';
  try {
    commandApiKey = window.localStorage.getItem('mercatoCommandApiKey') || '';
  } catch {}
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(commandApiKey ? { 'X-API-Key': commandApiKey } : {}),
      ...(options.headers || {})
    }
  });
  const contentType = response.headers?.get?.('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = body?.error || body?.message || String(body || `HTTP ${response.status}`);
    const error = new Error(message);
    if (body && typeof body === 'object') Object.assign(error, body);
    throw error;
  }
  return body;
}

async function getJson(url) {
  return apiFetch(url);
}

async function loadApp({ refresh = false } = {}) {
  state.loading = true;
  state.error = '';
  setSync('Завантаження', '');
  render();

  const suffix = refresh ? '?refresh=1' : '';
  const calls = {
    today: getJson(`/api/today${suffix}`),
    setup: getJson(`/api/setup-guide${suffix}`),
    customers: getJson(`/api/customer-dna${suffix}`),
    content: getJson(`/api/content-workbench${suffix}`),
    workItems: getJson(`/api/work-items${suffix}`),
    connectors: getJson('/api/connectors/credentials'),
    popupConfig: getJson('/api/first-order-popup/admin-config'),
    seoCenter: getJson(`/api/seo-center?siteId=${encodeURIComponent(state.seoCenter.siteId)}`),
    merchant: getJson('/api/merchant-feed')
  };

  const entries = await Promise.all(Object.entries(calls).map(async ([key, promise]) => {
    try {
      return [key, await promise, null];
    } catch (error) {
      return [key, null, error];
    }
  }));

  const errors = [];
  entries.forEach(([key, value, error]) => {
    if (value) state.data[key] = value;
    if (error) errors.push(`${key}: ${error.message}`);
  });

  state.ready = true;
  state.loading = false;
  const primaryError = errors.find(message => message.startsWith('today:')) || '';
  state.error = primaryError;
  ensureSelections();
  seedEmailDraft();
  setSync(primaryError ? primaryDataErrorDetails(primaryError).title : 'Синхронізовано', primaryError ? 'bad' : 'ok');
  render();
  loadDeferredAppData({ refresh });
  if (state.data.seoCenter?.activeJob?.id) scheduleSeoPoll(state.data.seoCenter.activeJob.id);
  if (state.data.merchant?.activeJob?.id) scheduleMerchantPoll(state.data.merchant.activeJob.id);
}

async function loadDeferredAppData({ refresh = false, only = '' } = {}) {
  if (deferredLoadPromise && !refresh) return deferredLoadPromise;
  const suffix = refresh ? '?refresh=1' : '';
  const calls = {
    ...(only !== 'matrix' ? { emailSegments: getJson(`/email/segments${suffix}`) } : {}),
    ...(only !== 'emailSegments' ? { matrix: getJson(`/api/products/matrix${suffix}`) } : {}),
    ...(!only || only === 'adsPerformance' ? { adsPerformance: getJson('/api/connectors/google-ads/performance?limit=12') } : {})
  };
  if (calls.matrix) {
    state.matrix.running = true;
    state.matrix.lastError = '';
    if (state.route === 'matrix') render();
  }
  deferredLoadPromise = Promise.all(Object.entries(calls).map(async ([key, promise]) => {
    try {
      state.data[key] = await promise;
      if (key === 'matrix') state.matrix.lastError = '';
      return [key, true];
    } catch (error) {
      console.warn(`Deferred ${key} sync failed:`, error.message);
      if (key === 'matrix') state.matrix.lastError = error.message || String(error);
      return [key, false];
    }
  })).then(results => {
    ensureSelections();
    if (results.some(([, ok]) => ok) && ['email', 'matrix', 'seo', 'connect', 'ads'].includes(state.route)) render();
    return results;
  }).finally(() => {
    if (calls.matrix) {
      state.matrix.running = false;
      if (state.route === 'matrix') render();
    }
    deferredLoadPromise = null;
  });
  return deferredLoadPromise;
}

function dashboard() {
  return state.data.today?.dashboardV2 || FALLBACK.dashboard;
}

function setupGuide() {
  return state.data.setup || FALLBACK.setup;
}

function customersData() {
  return state.data.customers || FALLBACK.customers;
}

function emailSegmentsData() {
  return state.data.emailSegments || FALLBACK.emailSegments;
}

function contentData() {
  return state.data.content || FALLBACK.content;
}

function matrixData() {
  return state.data.matrix || FALLBACK.matrix;
}

function workItemsData() {
  return state.data.workItems || FALLBACK.workItems;
}

function connectorsData() {
  return state.data.connectors || FALLBACK.connectors;
}

function popupConfigData() {
  return state.data.popupConfig || FALLBACK.popupConfig;
}

function seoCenterData() {
  return state.data.seoCenter || FALLBACK.seoCenter;
}

function merchantData() {
  return state.data.merchant || FALLBACK.merchant;
}

function contentItems() {
  return asArray(contentData().items);
}

function customerRows() {
  const dna = customersData();
  const rows = asArray(dna.customers);
  if (rows.length) return rows;
  const lists = dna.lists || {};
  return Object.entries(lists).flatMap(([status, list]) => asArray(list).map(item => ({ ...item, status: item.status || status })));
}

function productRows() {
  const matrix = matrixData();
  const core = matrix.matrix || matrix;
  const rows = asArray(matrix.topOpportunities)
    .concat(asArray(matrix.items))
    .concat(asArray(core.topOpportunities))
    .concat(asArray(core.rows))
    .filter(Boolean);
  const seen = new Set();
  return rows.filter((row, index) => {
    const id = productId(row, index);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function ensureSelections() {
  if (!state.selectedSeoId && contentItems()[0]) state.selectedSeoId = contentItems()[0].id;
  if (!state.selectedCustomerId && customerRows()[0]) {
    const first = customerRows()[0];
    state.selectedCustomerId = first.id || first.customerId || first.email || first.name;
  }
  if (!state.selectedProductId && productRows()[0]) state.selectedProductId = productId(productRows()[0], 0);
  const emailOptions = segmentOptions(customersData());
  if (emailOptions.length && !emailOptions.some(option => String(option.id) === String(state.email.segmentId))) {
    state.email.segmentId = String(emailOptions[0].id);
    state.email.excludedRecipientIds = [];
  }
}

function selectedSeoItem() {
  return contentItems().find(item => item.id === state.selectedSeoId) || contentItems()[0] || null;
}

function selectedCustomer() {
  const rows = customerRows();
  return rows.find(row => customerId(row) === state.selectedCustomerId) || rows[0] || null;
}

function selectedProduct() {
  const rows = productRows();
  return rows.find((row, index) => productId(row, index) === state.selectedProductId) || rows[0] || null;
}

function customerId(row) {
  return String(row?.id || row?.customerId || row?.email || row?.name || '');
}

function productId(row, index = 0) {
  return String(row?.id || row?.productId || row?.url || row?.name || row?.productName || `product-${index}`);
}

function seedEmailDraft(force = false) {
  if (state.email.subject && !force) return;
  const customer = selectedCustomer();
  const favorite = customer?.favoriteProduct || customer?.product || 'улюблені позиції';
  const offer = text(state.email.offer, 'нова пропозиція');
  state.email.subject = offer.includes('врожай') ? `Новий врожай для вашого смаку` : `Є пропозиція під ваші попередні замовлення`;
  state.email.preheader = `Підібрав варіант без шуму: ${offer}`;
  state.email.body = [
    `${customer?.name ? `${customer.name}, вітаю!` : 'Вітаю!'}`,
    `Бачу, що раніше вам підходили ${favorite}. Зараз є ${offer}, тому підготував коротку рекомендацію без масової розсилки.`,
    'Якщо хочете, можна просто перейти на сайт і подивитися деталі. Якщо потрібна підказка під смак або спосіб приготування, відповідайте на цей лист.',
    state.email.coupon.enabled ? `Для цієї пропозиції можу додати персональний купон: ${state.email.coupon.code || '[ПРОМОКОД]'}.` : '',
    'Максим, Mercato'
  ].filter(Boolean).join('\n\n');
}

function setSync(label, tone = '') {
  const sync = $('#syncState');
  const mini = $('#connectionMini');
  if (sync) {
    sync.textContent = label;
    sync.className = `sync-pill ${toneClass(tone)}`;
  }
  if (mini) {
    mini.innerHTML = `<span>Синхронізація</span><strong>${escapeHtml(label)}</strong>`;
  }
}

function toast(message) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = message;
  node.classList.add('is-visible');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('is-visible'), 3200);
}

function scrollAppToTop({ behavior = 'auto' } = {}) {
  requestAnimationFrame(() => {
    try {
      window.scrollTo({ top: 0, left: 0, behavior });
    } catch {
      window.scrollTo(0, 0);
    }
    const scroller = document.scrollingElement || document.documentElement || document.body;
    if (scroller) scroller.scrollTop = 0;
  });
}

function scrollToAppElement(targetId, { behavior = 'smooth' } = {}) {
  const id = String(targetId || '').replace(/^#/, '').trim();
  if (!id) return;
  requestAnimationFrame(() => {
    const target = document.getElementById(id);
    if (!target) {
      toast('Preview ще не видно на цій вкладці. Оновіть SEO Center або підготуйте preview ще раз.');
      return;
    }
    target.scrollIntoView({ behavior, block: 'start' });
  });
}

function navigate(route) {
  if (!NAV.some(item => item.id === route)) return;
  state.route = route;
  state.menuOpen = false;
  window.history.replaceState(null, '', `#${route}`);
  render();
  scrollAppToTop();
}

function render() {
  renderChrome();
  const root = $('#viewRoot');
  if (!root) return;
  if (state.loading && !state.ready) {
    root.innerHTML = renderLoading();
    return;
  }
  const view = {
    overview: renderOverview,
    actions: renderActions,
    connect: renderConnect,
    customers: renderCustomers,
    email: renderEmail,
    product: renderProduct,
    seo: renderSeo,
    merchant: renderMerchant,
    matrix: renderMatrix,
    ads: renderAds,
    settings: renderSettings
  }[state.route] || renderOverview;
  root.innerHTML = view();
  bindViewEvents();
}

function renderChrome() {
  const meta = routeMeta();
  const title = $('#routeTitle');
  const eyebrow = $('#routeEyebrow');
  const subtitle = $('#routeSubtitle');
  if (title) title.textContent = meta.title;
  if (eyebrow) eyebrow.textContent = meta.eyebrow;
  if (subtitle) subtitle.textContent = meta.subtitle;
  renderNav();
  renderBottomNav();
  renderMenuSheet();
}

function renderNav() {
  const nav = $('#desktopNav');
  if (!nav) return;
  let currentSection = '';
  nav.innerHTML = NAV.map(item => {
    const section = item.section !== currentSection ? `<div class="nav-section">${escapeHtml(item.section)}</div>` : '';
    currentSection = item.section;
    return `${section}<button class="nav-button ${item.id === state.route ? 'is-active' : ''}" type="button" data-route="${item.id}">
      <span><i>${escapeHtml(item.icon)}</i>${escapeHtml(item.label)}</span>
      ${item.id === 'actions' ? `<b class="nav-badge">${number((dashboard().actionQueue || []).length)}</b>` : ''}
    </button>`;
  }).join('');
}

function renderBottomNav() {
  const nav = $('#bottomNav');
  if (!nav) return;
  const items = [
    NAV.find(item => item.id === 'overview'),
    NAV.find(item => item.id === 'actions'),
    NAV.find(item => item.id === 'customers'),
    NAV.find(item => item.id === 'seo'),
    { id: 'menu', label: 'Меню', icon: '+' }
  ].filter(Boolean);
  nav.innerHTML = items.map(item => `<button class="bottom-button ${item.id === state.route || (item.id === 'menu' && state.menuOpen) ? 'is-active' : ''}" type="button" data-bottom-route="${item.id}">
    <i>${escapeHtml(item.icon)}</i><span>${escapeHtml(item.label)}</span>
  </button>`).join('');
}

function renderMenuSheet() {
  const sheet = $('#menuSheet');
  if (!sheet) return;
  sheet.hidden = !state.menuOpen;
  if (sheet.hidden) return;
  sheet.innerHTML = NAV.map(item => `<button class="sheet-button ${item.id === state.route ? 'is-active' : ''}" type="button" data-route="${item.id}">
    <i>${escapeHtml(item.icon)}</i>${escapeHtml(item.label)}
  </button>`).join('');
}

function renderLoading() {
  return `<section class="hero-panel">
    <div>
      <p class="section-kicker">Mercato AI</p>
      <h2>Завантажую стан магазину</h2>
      <p>Збираю OpenCart, клієнтів, SEO, email і матрицю товарів в один робочий екран.</p>
    </div>
    <div class="proof-box">
      <span class="status-pill warn">Підключення</span>
      <strong>Працюю з даними</strong>
      <p>Якщо якесь джерело недоступне, покажу конкретний next step.</p>
    </div>
  </section>`;
}

function renderOverview() {
  const dash = dashboard();
  const actions = asArray(dash.actionQueue).slice(0, 5);
  return `
    ${state.error ? renderError(state.error) : ''}
    <section class="hero-panel">
      <div>
        <p class="section-kicker">Для малого підприємця</p>
        <h2>AI-команда для малого інтернет-магазину</h2>
        <p>Замінює дорогий набір спеціалістів у щоденній роботі: SEO, клієнти, email, товари, реклама, UX і контроль виконання. Власник бачить не “dashboard”, а що зробити сьогодні і чому це має дати результат.</p>
        <div class="hero-actions">
          <button class="button" type="button" data-route="actions">Показати план</button>
          <button class="button secondary" type="button" data-route="connect">Підключити джерела</button>
          <button class="button secondary" type="button" data-route="customers">Як система бачить клієнтів</button>
        </div>
      </div>
      <aside class="proof-box">
        <span class="status-pill ok">Beta / pilot</span>
        <strong>${escapeHtml(dash.pricing?.teamCost || '$2 000-4 500/міс')} команда проти ${escapeHtml(dash.pricing?.plans?.[1]?.price || '$50/міс')}</strong>
        <p>${escapeHtml(dash.pricing?.trial || '14 днів trial')}. Billing поки ручний: продаємо користь, не “ще один кабінет”.</p>
      </aside>
    </section>
    ${renderMetrics(dash.metrics)}
    <section class="content-grid">
      <div class="card">
        <div class="section-head">
          <div>
            <p class="section-kicker">Сьогодні</p>
            <h2>Черга дій</h2>
            <p>Кожна дія має привести до preview, dry-run, live proof або зафіксованого рішення.</p>
          </div>
          <button class="button secondary" type="button" data-route="actions">Відкрити все</button>
        </div>
        <div class="action-list">${actions.length ? actions.map(renderActionCard).join('') : renderEmptyMini('Поки немає дій', 'Підключіть OpenCart і натисніть “Оновити”.')}</div>
      </div>
      <div class="card">
        <div class="section-head">
          <div>
            <p class="section-kicker">Продажі</p>
            <h2>7 днів</h2>
            <p>Графік потрібен не для краси, а щоб бачити, чи дії впливають на виручку.</p>
          </div>
        </div>
        ${renderSalesChart(dash.salesChart)}
      </div>
    </section>
    <section class="wide-grid">
      <div class="card">
        <div class="section-head">
          <div>
            <p class="section-kicker">Покупці</p>
            <h2>Під увагою</h2>
            <p>Не всі, хто не купив 30 днів, у відтоку. Система має враховувати медіанний цикл покупки.</p>
          </div>
          <button class="button secondary" type="button" data-route="customers">Профілі</button>
        </div>
        <div class="customer-list">${asArray(dash.attentionCustomers).slice(0, 5).map(renderAttentionCustomer).join('') || renderEmptyMini('Немає черги клієнтів', 'Потрібні замовлення і клієнти з OpenCart.')}</div>
      </div>
      <div class="card">
        <div class="section-head">
          <div>
            <p class="section-kicker">SEO і товари</p>
            <h2>Найближчі можливості</h2>
          </div>
        </div>
        <div class="product-list">
          ${asArray(dash.seoTop).slice(0, 3).map(item => renderMiniIssue(item, 'seo')).join('') || ''}
          ${asArray(dash.productsAttention).slice(0, 3).map(item => renderMiniIssue(item, 'matrix')).join('') || renderEmptyMini('Потрібен сигнал попиту', 'Підключіть GSC або оновіть Product Matrix.')}
        </div>
      </div>
    </section>
  `;
}

function renderError(message) {
  const details = primaryDataErrorDetails(message);
  return `<section class="empty-state">
    <span class="status-pill bad">Primary API</span>
    <h3>${escapeHtml(details.title)}</h3>
    <p>${escapeHtml(details.body)}</p>
    <div class="button-row">
      <button class="button" type="button" id="retryPrimaryData">Оновити ще раз</button>
      <button class="button secondary" type="button" data-route="connect">Перевірити підключення</button>
    </div>
  </section>`;
}

function renderMetrics(metrics = []) {
  return `<section class="metric-grid">${asArray(metrics).slice(0, 4).map(metric => `<article class="metric">
    <small>${escapeHtml(metric.label)}</small>
    <strong>${escapeHtml(metric.value)}</strong>
    <span>${escapeHtml(metric.unit || metric.delta || '')}</span>
    ${metric.delta ? `<div class="tiny-list"><span class="status-pill ${toneClass(metric.tone)}">${escapeHtml(metric.delta)}</span></div>` : ''}
  </article>`).join('')}</section>`;
}

function renderActionCard(action) {
  return `<article class="action-card">
    <div class="action-number">${escapeHtml(action.number || '')}</div>
    <div>
      <h3>${escapeHtml(action.title || 'Дія')}</h3>
      <p>${escapeHtml(action.reason || action.why || '')}</p>
      <div class="action-meta">
        <span class="tag">${escapeHtml(statusLabel(action.priority || 'medium'))}</span>
        <span class="tag">${escapeHtml(action.expectedResult || action.expectedImpact || 'очікуваний результат буде зафіксовано')}</span>
      </div>
    </div>
    <button class="button secondary" type="button" data-action-open="${attr(action.type || 'actions')}">${escapeHtml(action.cta || 'Відкрити')}</button>
  </article>`;
}

function renderSalesChart(rows = []) {
  const values = asArray(rows).map(row => Number(row.revenue || row.value || 0));
  const max = Math.max(1, ...values);
  return `<div class="mini-chart">${asArray(rows).slice(-7).map(row => {
    const value = Number(row.revenue || row.value || 0);
    const height = Math.max(8, Math.round((value / max) * 132));
    return `<div class="bar" title="${escapeHtml(money(value))}">
      <i style="height:${height}px"></i>
      <span>${escapeHtml(row.label || '')}</span>
    </div>`;
  }).join('')}</div>`;
}

function renderAttentionCustomer(customer) {
  return `<article class="customer-card">
    <div>
      <h3>${escapeHtml(customer.name || 'Клієнт')}</h3>
      <p>${escapeHtml(customer.reason || customer.proposedOffer || 'Є сигнал для персональної дії.')}</p>
      <div class="tiny-list">
        <span class="status-pill warn">${escapeHtml(statusLabel(customer.status))}</span>
        ${customer.avgOrderValue ? `<span class="tag">середній чек ${money(customer.avgOrderValue)}</span>` : ''}
      </div>
    </div>
    <button class="button secondary" type="button" data-route="customers">Профіль</button>
  </article>`;
}

function renderMiniIssue(item, route) {
  return `<article class="product-card">
    <strong>${escapeHtml(item.name || item.title || 'Сигнал')}</strong>
    <p>${escapeHtml(item.issue || item.reason || item.action || 'Потрібна дія')}</p>
    <div class="price-line">
      <span>${item.score !== undefined ? `SEO ${escapeHtml(item.score)}/100` : item.clicks ? `${number(item.clicks)} кліків` : 'дані'}</span>
      <button class="button ghost" type="button" data-route="${route === 'seo' ? 'seo' : 'matrix'}">Відкрити</button>
    </div>
  </article>`;
}

function renderEmptyMini(title, body) {
  return `<div class="empty-state"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></div>`;
}

function renderActions() {
  const actions = asArray(dashboard().actionQueue);
  const workItems = asArray(workItemsData().items);
  const merged = actions.length ? actions : workItems.slice(0, 5).map((item, index) => ({
    ...item,
    number: index + 1,
    reason: item.why,
    expectedResult: item.expectedImpact,
    cta: item.primaryAction?.label || 'Відкрити'
  }));
  return `<section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Операційний день</p>
        <h2>3-5 дій, які варто зробити зараз</h2>
        <p>Це центральна логіка продукту: власник не вивчає SEO, CRM і рекламу окремо, а отримує короткий список дій з поясненням.</p>
      </div>
      <button class="button" type="button" id="refreshActions">Оновити сигнали</button>
    </div>
    <div class="action-list">${merged.map(renderActionCard).join('') || renderEmptyMini('План ще не готовий', 'Потрібні джерела даних. Почніть з OpenCart bridge.')}</div>
  </section>
  <section class="module-grid">
    ${renderModuleCard('Клієнт і повтор', 'Коли цикл покупки відхиляється від медіани, система пропонує персональну дію.', 'customers')}
    ${renderModuleCard('SEO / сторінка', 'Якщо сторінка має покази, але поганий CTR або порожні поля, готуємо preview.', 'seo')}
    ${renderModuleCard('Email / купон', 'Листи й купони йдуть тільки після ручного погодження і safety check.', 'email')}
  </section>`;
}

function renderModuleCard(title, body, route) {
  return `<article class="module-card">
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(body)}</p>
    <div class="split-line"></div>
    <button class="button secondary" type="button" data-route="${route}">Відкрити</button>
  </article>`;
}

function renderConnect() {
  const guide = setupGuide();
  const checks = asArray(guide.checks);
  return `<section class="hero-panel">
    <div>
      <p class="section-kicker">Дані замість здогадок</p>
      <h2>Система має бачити сайт, клієнтів, замовлення, рекламу й аналітику</h2>
      <p>Без джерел Mercato AI може написати текст. З джерелами він стає командою, яка розуміє, кого повернути, яку сторінку підсилити і де зливається бюджет.</p>
      <div class="hero-actions">
        <button class="button" type="button" id="refreshConnections">Перевірити ще раз</button>
        <button class="button secondary" type="button" data-route="overview">Command Center</button>
      </div>
    </div>
    <aside class="proof-box">
      <span class="status-pill ${Number(guide.ready || 0) >= 3 ? 'ok' : 'warn'}">${escapeHtml(guide.label || 'Підключення')}</span>
      <strong>${number(guide.ready || 0)} / ${number(guide.total || checks.length || 0)} джерел</strong>
      <p>${escapeHtml(guide.nextStep || 'Почніть з OpenCart bridge.')}</p>
    </aside>
  </section>
  <section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Onboarding wizard</p>
        <h2>5 кроків до першої користі</h2>
      </div>
    </div>
    <div class="wizard">${asArray(guide.wizard).map(renderWizardStep).join('') || renderFallbackWizard()}</div>
  </section>
  <section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Джерела</p>
        <h2>Що підключено, а що ще ні</h2>
        <p>Кожне джерело має зрозумілий статус і власника доступу. Повні ключі не показуються назад у браузері.</p>
      </div>
    </div>
    <div class="source-grid">${checks.map(renderSourceCard).join('') || renderSourceFallback()}</div>
  </section>
  <section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Доступи</p>
        <h2>Ключі додаються в Налаштуваннях</h2>
        <p>Користувач не лізе в код: відкриває налаштування, вставляє доступи до магазину, Google, пошти або tracking і натискає “Зберегти”.</p>
      </div>
      <button class="button" type="button" data-route="settings">Керувати доступами</button>
    </div>
    <div class="source-grid">${renderConnectionSummaryCards()}</div>
  </section>
  <section class="card recipe-list">
    <div class="section-head">
      <div>
        <p class="section-kicker">Рецепти підключення</p>
        <h2>Як дозавершити те, що ще не працює</h2>
      </div>
    </div>
    ${asArray(guide.steps).map(step => `<article class="module-card">
      <h3>${escapeHtml(step.title)}</h3>
      <p>${escapeHtml(step.body)}</p>
      <div class="split-line"></div>
      <p><strong>Результат:</strong> ${escapeHtml(step.result)}</p>
    </article>`).join('') || renderEmptyMini('Рецепти ще не завантажені', 'Оновіть setup guide.')}
  </section>`;
}

function renderWizardStep(step) {
  return `<article class="wizard-step">
    <span class="num">${escapeHtml(step.step || '')}</span>
    <h3>${escapeHtml(step.title || 'Крок')}</h3>
    <p>${escapeHtml(step.body || '')}</p>
    <span class="status-pill ${step.status === 'done' ? 'ok' : step.status === 'blocked' ? 'bad' : 'warn'}">${escapeHtml(statusLabel(step.status))}</span>
    <p>${escapeHtml(step.result || '')}</p>
  </article>`;
}

function renderFallbackWizard() {
  return ['Платформа', 'OpenCart', 'Google', 'Профіль', 'Перші рекомендації'].map((title, index) => renderWizardStep({
    step: index + 1,
    title,
    body: 'Крок onboarding для першого MVP.',
    status: index === 0 ? 'active' : 'blocked',
    result: 'Потрібні реальні доступи.'
  })).join('');
}

function renderSourceCard(check) {
  return `<article class="source-card ${check.ok ? 'ok' : 'needed'}">
    <span class="status-pill ${check.ok ? 'ok' : 'warn'}">${check.ok ? 'Працює' : 'Потрібно'}</span>
    <h3>${escapeHtml(check.title)}</h3>
    <p>${escapeHtml(check.description)}</p>
    <div class="split-line"></div>
    <p>${escapeHtml(humanConnectionDetail(check.detail))}</p>
  </article>`;
}

function humanConnectionDetail(value = '') {
  const clean = String(value || '');
  if (/BRIDGE_|SMTP_|PUBLIC_|TRACKING_|GA4_|GOOGLE_ADS_|COMMAND_|\.env|connection-secrets/i.test(clean)) {
    return 'Відкрийте Налаштування і додайте потрібні доступи у відповідний блок.';
  }
  return clean;
}

function renderSourceFallback() {
  return ['OpenCart / ocStore', 'Google Search Console', 'Google Analytics 4', 'Google Ads', 'SMTP / Mailchimp', 'Public tracking'].map(title => `<article class="source-card needed">
    <span class="status-pill warn">Потрібно</span>
    <h3>${escapeHtml(title)}</h3>
    <p>Підключення ще не підтверджено.</p>
  </article>`).join('');
}

function renderCredentialForms() {
  const connectors = asArray(connectorsData().connectors);
  if (!connectors.length) {
    return renderEmptyMini('Форми доступів ще не завантажені', 'Оновіть сторінку або натисніть “Перевірити ще раз”.');
  }
  return connectors.map(connector => `<form class="source-card credential-form ${connector.ok ? 'ok' : 'needed'}" data-connector-form="${attr(connector.id)}">
    <span class="status-pill ${connector.ok ? 'ok' : 'warn'}">${escapeHtml(connector.statusLabel || (connector.ok ? 'Готово' : 'Потрібно'))}</span>
    <h3>${escapeHtml(connector.title)}</h3>
    <p>${escapeHtml(connector.owner || '')}</p>
    <p>${escapeHtml(connector.detail || '')}</p>
    ${asArray(connector.missing).length ? `<div class="tiny-list">${connector.missing.map(item => `<span class="tag">${escapeHtml(item)}</span>`).join('')}</div>` : ''}
    ${renderGoogleOAuthHelper(connector)}
    <div class="tiny-list">
      <span class="tag">обовʼязкові: ${number(connector.requiredFilled || 0)}/${number(connector.requiredTotal || 0)}</span>
      ${connector.env || connector.saved ? `<span class="tag">збережено: ${number((connector.env || 0) + (connector.saved || 0))}</span>` : ''}
    </div>
    <div class="split-line"></div>
    ${asArray(connector.fields).map(field => renderCredentialField(connector.id, field)).join('')}
    <button class="button" type="submit">Зберегти ключі</button>
    ${connector.verifyEndpoint ? `<button class="button secondary" type="button" data-connector-verify="${attr(connector.id)}" data-verify-endpoint="${attr(connector.verifyEndpoint)}" ${connector.ok ? '' : 'disabled'}>Перевірити API</button>` : ''}
  </form>`).join('');
}

function renderGoogleOAuthHelper(connector) {
  const scopeByConnector = {
    gsc: 'https://www.googleapis.com/auth/webmasters.readonly',
    ga4: 'https://www.googleapis.com/auth/analytics.readonly',
    merchant: 'https://www.googleapis.com/auth/content',
    google_ads: 'https://www.googleapis.com/auth/adwords'
  };
  const scope = scopeByConnector[connector.id];
  if (!scope) return '';
  const oauth = connectorsData().googleOAuth || {};
  const scopes = asArray(oauth.scopes);
  const hasScope = scopes.includes(scope);
  const clientPath = oauth.clientPath || '/Users/macbook/Downloads/gsc_oauth_client.json';
  const scopeName = {
    gsc: 'Search Console',
    ga4: 'GA4',
    merchant: 'Merchant Center',
    google_ads: 'Google Ads'
  }[connector.id] || 'Google';
  const stateText = oauth.hasClient
    ? oauth.hasToken
      ? hasScope
        ? `${scopeName}: OAuth token має потрібний scope.`
        : `${scopeName}: token є, але цього scope бракує — треба повторити Google login і поставити галочку.`
      : 'OAuth client знайдено, але Google-login ще не виконаний.'
    : `Покладіть OAuth client JSON у ${clientPath}.`;
  return `<div class="oauth-helper">
    <span class="status-pill ${oauth.hasClient && oauth.hasToken && hasScope ? 'ok' : 'warn'}">Google OAuth</span>
    <p>${escapeHtml(stateText)}</p>
    <small>Один login підключає GSC, GA4, Merchant і Ads. Access token вручну краще не вставляти: він швидко протухає.</small>
    <div class="button-row">
      <a class="button secondary" href="/seo/gsc/oauth/start" target="_blank" rel="noreferrer">Підключити Google OAuth</a>
      <a class="button ghost" href="/api/connectors/google-oauth/status" target="_blank" rel="noreferrer">Статус token</a>
    </div>
  </div>`;
}

function renderCredentialField(connectorId, field) {
  const id = `${connectorId}-${field.key}`;
  const label = `${field.label}${field.required ? ' *' : ''}`;
  const placeholder = field.filled
    ? `Збережено: ${field.masked}`
    : field.placeholder || 'Вставте значення';
  const common = `id="${attr(id)}" name="${attr(field.key)}" placeholder="${attr(placeholder)}" autocomplete="off"`;
  return `<label class="field">
    <span>${escapeHtml(label)}</span>
    ${field.multiline
      ? `<textarea ${common}></textarea>`
      : `<input ${common} type="${attr(field.secret ? 'password' : field.type || 'text')}">`}
    <small>${field.filled ? `Є значення: ${escapeHtml(field.masked)} · ${escapeHtml(connectionSourceLabel(field.source))}` : 'Порожнє поле не змінює збережене значення.'}</small>
  </label>`;
}

function renderFirstOrderPopupSettings() {
  const data = popupConfigData();
  const config = data.config || FALLBACK.popupConfig.config;
  const first = config.first || FALLBACK.popupConfig.config.first;
  const second = config.second || FALLBACK.popupConfig.config.second;
  const triggers = config.triggers || FALLBACK.popupConfig.config.triggers;
  const textConfig = config.text || FALLBACK.popupConfig.config.text;
  let hasStoredKey = false;
  try {
    hasStoredKey = Boolean(window.localStorage.getItem('mercatoCommandApiKey'));
  } catch {}
  return `<section class="card" id="first-order-popup-settings">
    <div class="section-head">
      <div>
        <p class="section-kicker">Попап першого замовлення</p>
        <h2>Увімкнути кампанію для нового рекламного трафіку</h2>
        <p>Цей блок керує реальним JS на сайті: показ, тексти, суми, строки дії промокодів і snippet для OpenCart footer.</p>
      </div>
      <span class="status-pill ${config.enabled ? 'ok' : 'warn'}">${config.enabled ? 'Увімкнено' : 'Вимкнено'}</span>
    </div>
    <form class="credential-form" data-popup-config-form>
      <label class="field full">
        <span>Статус кампанії</span>
        <label class="toggle-row"><input type="checkbox" name="enabled" ${config.enabled ? 'checked' : ''}> <span>Показувати попап новим відвідувачам</span></label>
        <small>Submit форми теж блокується, коли кампанія вимкнена.</small>
      </label>
      <div class="form-grid">
        <label class="field">
          <span>Публічна адреса Mercato AI</span>
          <input name="publicBaseUrl" type="url" value="${attr(config.publicBaseUrl || '')}" placeholder="https://crm.mercato.com.ua">
          <small>Саме з цієї адреси магазин завантажує JS/CSS.</small>
        </label>
        <label class="field">
          <span>COMMAND_API_KEY</span>
          <input name="commandApiKey" type="password" placeholder="${hasStoredKey ? 'Ключ уже збережено в цьому браузері' : 'Вставте ключ для збереження налаштувань'}" autocomplete="off">
          <small>Порожнє поле не змінює локально збережений ключ.</small>
        </label>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>Заголовок</span>
          <input name="title" value="${attr(textConfig.title || '')}">
        </label>
        <label class="field">
          <span>Підзаголовок</span>
          <input name="subtitle" value="${attr(textConfig.subtitle || '')}">
        </label>
        <label class="field full">
          <span>Текст checkbox</span>
          <input name="consent" value="${attr(textConfig.consent || '')}">
        </label>
      </div>
      <div class="form-grid three">
        <label class="field">
          <span>Перший промокод, %</span>
          <input name="firstDiscount" type="number" min="1" max="99" value="${attr(first.discount || 10)}">
        </label>
        <label class="field">
          <span>Мін. сума першого, грн</span>
          <input name="firstMinTotal" type="number" min="0" value="${attr(first.minTotal || 600)}">
        </label>
        <label class="field">
          <span>Днів першого</span>
          <input name="firstValidDays" type="number" min="1" max="90" value="${attr(first.validDays || 3)}">
        </label>
        <label class="field">
          <span>Другий промокод, %</span>
          <input name="secondDiscount" type="number" min="1" max="99" value="${attr(second.discount || 15)}">
        </label>
        <label class="field">
          <span>Мін. сума другого, грн</span>
          <input name="secondMinTotal" type="number" min="0" value="${attr(second.minTotal || 800)}">
        </label>
        <label class="field">
          <span>Днів другого</span>
          <input name="secondValidDays" type="number" min="21" max="25" value="${attr(second.validDays || 23)}">
        </label>
      </div>
      <div class="form-grid three">
        <label class="field">
          <span>Показ після, сек</span>
          <input name="timeMinSeconds" type="number" min="0" max="120" value="${attr(triggers.timeMinSeconds || 10)}">
        </label>
        <label class="field">
          <span>До, сек</span>
          <input name="timeMaxSeconds" type="number" min="0" max="180" value="${attr(triggers.timeMaxSeconds || 15)}">
        </label>
        <label class="field">
          <span>Скрол, %</span>
          <input name="scrollPercent" type="number" min="1" max="95" value="${attr(triggers.scrollPercent || 40)}">
        </label>
        <label class="field">
          <span>Cooldown після закриття, днів</span>
          <input name="cooldownDays" type="number" min="1" max="60" value="${attr(config.cooldownDays || 7)}">
        </label>
        <label class="field full">
          <span>Exit intent</span>
          <label class="toggle-row"><input type="checkbox" name="exitIntentDesktop" ${triggers.exitIntentDesktop === false ? '' : 'checked'}> <span>Показувати на desktop, коли курсор іде з сайту</span></label>
        </label>
      </div>
      <label class="field full">
        <span>Snippet для OpenCart footer</span>
        <textarea readonly rows="2" onclick="this.select()">${escapeHtml(data.snippet || FALLBACK.popupConfig.snippet)}</textarea>
        <small>Додається один раз у шаблон сайту. Далі кампанія вмикається та вимикається тут.</small>
      </label>
      <div class="button-row">
        <button class="button" type="submit">Зберегти налаштування попапа</button>
        <a class="button secondary" href="/first-order-popup-preview.html" target="_blank" rel="noreferrer">Preview попапа</a>
      </div>
    </form>
  </section>`;
}

function connectionSourceLabel(source = '') {
  if (source === 'env') return 'з сервера';
  if (source === 'program') return 'з dashboard';
  return 'збережено';
}

function renderConnectionSummaryCards() {
  const connectors = asArray(connectorsData().connectors);
  if (!connectors.length) return renderEmptyMini('Статус доступів ще завантажується', 'Оновіть сторінку або перейдіть у Налаштування.');
  return connectors.slice(0, 7).map(connector => `<article class="source-card ${connector.ok ? 'ok' : 'needed'}">
    <span class="status-pill ${connector.ok ? 'ok' : 'warn'}">${escapeHtml(connector.statusLabel || (connector.ok ? 'Готово' : 'Потрібно'))}</span>
    <h3>${escapeHtml(connector.title)}</h3>
    <p>${escapeHtml(connector.detail || (connector.ok ? 'Доступ додано.' : 'Додайте доступ у Налаштуваннях.'))}</p>
    <div class="tiny-list">
      <span class="tag">обовʼязкові: ${number(connector.requiredFilled || 0)}/${number(connector.requiredTotal || 0)}</span>
    </div>
  </article>`).join('');
}

function renderCustomers() {
  const dna = customersData();
  const rows = customerRows();
  const current = selectedCustomer();
  const segments = asArray(dna.segments);
  return `<section class="metric-grid">
    ${renderMetric('Клієнтів', number(dna.summary?.customers || rows.length), `${number(dna.summary?.orders || 0)} замовлень`)}
    ${renderMetric('Прогноз повтору', money(dna.summary?.forecastRevenue || 0), `${number(dna.summary?.readyToBuy || 0)} близько до покупки`)}
    ${renderMetric('Середній чек', money(dna.summary?.avgOrderValue || 0), 'OpenCart історія')}
    ${renderMetric('Модель циклу', 'Median', 'ризик тільки після аномалії')}
  </section>
  <section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Сегменти</p>
        <h2>Не “всі давно не купували”, а нормальний цикл покупки</h2>
        <p>${escapeHtml(dna.cadence?.note || FALLBACK.customers.cadence.note)}</p>
      </div>
    </div>
    <div class="module-grid">${segments.length ? segments.map(renderSegmentCard).join('') : renderEmptyMini('Сегменти ще не готові', 'Потрібні клієнти і замовлення з OpenCart.')}</div>
  </section>
  <section class="customer-layout">
    <div class="card">
      <div class="section-head">
        <div>
          <p class="section-kicker">Покупці</p>
          <h2>Кого тримати поруч</h2>
        </div>
      </div>
      <div class="customer-list">${rows.length ? rows.map(renderCustomerRow).join('') : renderEmptyMini('Немає покупців', 'Після sync OpenCart тут буде список клієнтів з циклами покупки.')}</div>
    </div>
    <div class="editor-panel">
      ${current ? renderCustomerProfile(current, dna) : renderEmptyMini('Оберіть клієнта', 'Клік по покупцю відкриє профіль, замовлення і комунікації.')}
    </div>
  </section>`;
}

function renderMetric(label, value, unit) {
  return `<article class="metric"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong><span>${escapeHtml(unit)}</span></article>`;
}

function renderSegmentCard(segment) {
  return `<article class="module-card">
    <span class="status-pill ${segment.status === 'risk' || segment.status === 'churn' ? 'warn' : 'ok'}">${escapeHtml(statusLabel(segment.status))}</span>
    <h3>${escapeHtml(segment.title || segment.id || 'Сегмент')}</h3>
    <p>${number(segment.count)} клієнтів · ${money(segment.revenue || 0)}</p>
    <div class="tiny-list">${asArray(segment.topProducts).slice(0, 3).map(product => `<span class="tag">${escapeHtml(product)}</span>`).join('')}</div>
  </article>`;
}

function renderCustomerRow(customer) {
  const id = customerId(customer);
  return `<article class="customer-card ${id === state.selectedCustomerId ? 'is-selected' : ''}">
    <button type="button" data-customer-id="${attr(id)}">
      <div class="avatar">${escapeHtml(initials(customer.name || customer.email))}</div>
      <h3>${escapeHtml(customer.name || customer.email || 'Клієнт')}</h3>
      <p>${escapeHtml(customer.favoriteProduct || customer.proposedOffer || customer.email || '')}</p>
      <div class="tiny-list">
        <span class="status-pill ${customer.status === 'risk' || customer.status === 'churn' ? 'warn' : 'ok'}">${escapeHtml(statusLabel(customer.status))}</span>
        <span class="tag">${number(customer.orders || 0)} зам.</span>
        ${customer.daysSinceLastOrder != null ? `<span class="tag">${number(customer.daysSinceLastOrder)} днів</span>` : ''}
      </div>
    </button>
  </article>`;
}

function renderCustomerProfile(customer, dna) {
  const communication = asArray(dna.communicationLog).slice(0, 6);
  return `<div class="editor-head">
    <div>
      <p class="section-kicker">Профіль покупця</p>
      <h2>${escapeHtml(customer.name || customer.email || 'Клієнт')}</h2>
      <p>${escapeHtml(customer.email || customer.phone || '')}</p>
    </div>
    <span class="status-pill ${customer.status === 'risk' || customer.status === 'churn' ? 'warn' : 'ok'}">${escapeHtml(statusLabel(customer.status))}</span>
  </div>
  <div class="editor-body">
    <div class="profile-stats">
      <div><small>Замовлень</small><strong>${number(customer.orders || 0)}</strong></div>
      <div><small>Витрачено</small><strong>${money(customer.totalSpent || 0)}</strong></div>
      <div><small>Середній чек</small><strong>${money(customer.avgOrderValue || 0)}</strong></div>
    </div>
    <section>
      <p class="section-kicker">Що система знає</p>
      <h3>${escapeHtml(customer.favoriteProduct || 'Уподобання ще уточнюються')}</h3>
      <p>${escapeHtml(customer.proposedOffer || 'Система буде будувати рекомендації на історії замовлень, а не на здогадках.')}</p>
      <div class="tiny-list">${asArray(customer.tasteProfile || customer.preferenceTags).slice(0, 8).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
    </section>
    <section>
      <p class="section-kicker">Комунікації</p>
      <div class="timeline">${communication.length ? communication.map(log => `<div class="timeline-item">
        <span class="timeline-dot"></span>
        <div><strong>${escapeHtml(log.subject || 'Лист')}</strong><p>${escapeHtml(log.date || '')} · ${escapeHtml(statusLabel(log.status))} · ${money(log.revenue || 0)}</p></div>
      </div>`).join('') : renderEmptyMini('Комунікацій ще немає', 'Після першої кампанії тут буде видно sent/open/click/order.')}</div>
    </section>
    <div class="button-row">
      <button class="button" type="button" data-route="email">Підготувати лист</button>
      <button class="button secondary" type="button" data-route="matrix">Подивитись товари</button>
    </div>
  </div>`;
}

function emailSegmentId(segment) {
  return String(segment?.id || segment?.status || segment?.title || '').trim();
}

function emailSegmentRows() {
  const fromEmail = asArray(emailSegmentsData().segments).filter(segment => emailSegmentId(segment));
  if (fromEmail.length) return fromEmail;
  return asArray(customersData().segments).filter(segment => emailSegmentId(segment));
}

function selectedEmailSegment() {
  const id = String(state.email.segmentId || '').trim();
  const rows = emailSegmentRows();
  return rows.find(segment => emailSegmentId(segment) === id) || rows[0] || null;
}

function cleanRecipientEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function recipientId(row) {
  return String(row?.customerId || row?.id || row?.email || row?.emailMasked || row?.name || '').trim();
}

function recipientIdentityCandidates(row) {
  return [
    row?.customerId,
    row?.id,
    row?.email,
    row?.emailMasked,
    row?.name,
    row?.fullName
  ].map(value => String(value || '').trim()).filter(Boolean);
}

function uniqueRecipientRows(rows = []) {
  const seen = new Set();
  return asArray(rows)
    .filter(row => cleanRecipientEmail(row?.email) && row?.spam?.canEmail !== false && row?.canSend !== false)
    .filter(row => {
      const key = cleanRecipientEmail(row.email) || recipientId(row);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(row => ({ ...row, email: cleanRecipientEmail(row.email) }));
}

function recipientTopProduct(row) {
  if (row?.favoriteProduct) return row.favoriteProduct;
  if (row?.lastProduct) return row.lastProduct;
  if (Array.isArray(row?.topProducts) && row.topProducts[0]) return row.topProducts[0].name || row.topProducts[0];
  if (Array.isArray(row?.recommendations) && row.recommendations[0]) return row.recommendations[0].name || row.recommendations[0];
  if (Array.isArray(row?.recentOrders) && row.recentOrders[0]?.products?.[0]) return row.recentOrders[0].products[0];
  return '';
}

function fallbackRecipientsForSegment(segment) {
  const key = emailSegmentId(segment) || String(state.email.segmentId || '');
  const rows = customerRows();
  const matched = rows.filter(row => {
    const values = [
      row.status,
      row.segmentId,
      row.segment,
      row.group,
      row.cadenceStatus,
      row.cadence?.status
    ].map(value => String(value || '').trim());
    if (values.includes(key)) return true;
    if (key === 'at_risk' && values.includes('risk')) return true;
    if (key === 'replenishment_due' && values.some(value => ['due_soon', 'watch', 'ready'].includes(value))) return true;
    return key === 'vip' && (values.includes('vip') || Number(row.totalSpent || 0) >= 3000 || Number(row.orders || row.orderCount || 0) >= 5);
  });
  return matched.length ? matched : rows.filter(row => row.email).slice(0, 20);
}

function recipientRowsForSegment(segment = selectedEmailSegment()) {
  const direct = asArray(segment?.recipients).length
    ? asArray(segment.recipients)
    : asArray(segment?.batchPreview).length
      ? asArray(segment.batchPreview)
      : asArray(segment?.sampleCustomers).length
        ? asArray(segment.sampleCustomers)
        : [];
  return uniqueRecipientRows(direct.length ? direct : fallbackRecipientsForSegment(segment));
}

function excludedRecipientSet() {
  return new Set(asArray(state.email.excludedRecipientIds).map(value => String(value || '').trim()).filter(Boolean));
}

function selectedSegmentRecipients() {
  const excluded = excludedRecipientSet();
  return recipientRowsForSegment().filter(row => !recipientIdentityCandidates(row).some(key => excluded.has(key)));
}

function setRecipientExcluded(id, excluded) {
  const cleanId = String(id || '').trim();
  if (!cleanId) return;
  const set = excludedRecipientSet();
  if (excluded) set.add(cleanId);
  else set.delete(cleanId);
  state.email.excludedRecipientIds = [...set];
}

function setAllRecipientsSelected(selected) {
  state.email.excludedRecipientIds = selected ? [] : recipientRowsForSegment().map(recipientId).filter(Boolean);
}

function emailRecipientPayload(row) {
  return {
    customerId: row.customerId || row.id || '',
    id: row.id || row.customerId || '',
    name: row.name || row.fullName || row.email || '',
    fullName: row.fullName || row.name || '',
    firstName: row.firstName || '',
    lastName: row.lastName || '',
    email: row.email,
    phone: row.phone || row.telephone || '',
    totalSpent: Number(row.totalSpent || 0),
    avgOrderValue: Number(row.avgOrderValue || 0),
    orderCount: Number(row.orderCount || row.orders || 0),
    lastOrder: row.lastOrder || row.last_order || '',
    daysSinceLastOrder: row.daysSinceLastOrder,
    cadence: row.cadence || {},
    topProducts: asArray(row.topProducts),
    recentOrders: asArray(row.recentOrders),
    recommendations: asArray(row.recommendations),
    spam: row.spam || {}
  };
}

function renderRecipientPicker() {
  const recipients = recipientRowsForSegment();
  const selected = selectedSegmentRecipients();
  const excluded = excludedRecipientSet();
  const visibleRows = recipients;
  return `<article class="send-card recipient-picker">
    <div class="recipient-picker-head">
      <div>
        <h3>3. Одержувачі сегмента</h3>
        <p>Обрано ${number(selected.length)} з ${number(recipients.length)}. Зніміть контакт, якщо цьому клієнту зараз не треба писати.</p>
      </div>
      <span class="status-pill ${selected.length ? 'ok' : 'warn'}">${selected.length ? 'готово' : 'нікого не обрано'}</span>
    </div>
    <div class="recipient-actions">
      <button class="button ghost" type="button" id="selectAllRecipients" ${recipients.length ? '' : 'disabled'}>Вибрати всіх</button>
      <button class="button ghost" type="button" id="clearAllRecipients" ${recipients.length ? '' : 'disabled'}>Зняти всіх</button>
    </div>
    <div class="recipient-list">
      ${visibleRows.length ? visibleRows.map(row => {
        const id = recipientId(row);
        const checked = !excluded.has(id);
        const product = recipientTopProduct(row);
        const meta = [
          row.email,
          product ? `товар: ${product}` : '',
          row.totalSpent ? `LTV ${money(row.totalSpent)}` : '',
          row.cadence?.typicalIntervalDays ? `цикл ${number(row.cadence.typicalIntervalDays)} дн.` : ''
        ].filter(Boolean).join(' · ');
        return `<article class="recipient-row ${checked ? '' : 'is-excluded'}">
          <label>
            <input type="checkbox" data-recipient-toggle="${attr(id)}" ${checked ? 'checked' : ''}>
            <span>
              <strong>${escapeHtml(row.name || row.fullName || row.email || 'Клієнт')}</strong>
              <small>${escapeHtml(meta || 'email готовий до відправки')}</small>
            </span>
          </label>
          <button class="recipient-remove" type="button" data-recipient-remove="${attr(id)}">Прибрати</button>
        </article>`;
      }).join('') : renderEmptyMini('У сегменті немає email-одержувачів', 'Оновіть сегменти або перевірте email у клієнтів OpenCart.')}
    </div>
  </article>`;
}

function renderEmail() {
  const e = state.email;
  const dna = customersData();
  const rows = customerRows();
  const subjects = subjectIdeas();
  const selectedRecipients = selectedSegmentRecipients();
  return `<section class="email-layout">
    <div class="editor-panel">
      <div class="editor-head">
        <div>
          <p class="section-kicker">Чернетка</p>
          <h2>Лист, який можна правити перед відправкою</h2>
          <p>Немає автосенду: спочатку тема, текст, купон, preview і тільки потім ручна відправка.</p>
        </div>
        <button class="button" type="button" id="generateEmail">Згенерувати лист</button>
      </div>
      <div class="editor-body">
        <div class="form-grid three">
          <label class="field">
            <span>Сегмент</span>
          <select id="emailSegment">${segmentOptions(dna).map(option => `<option value="${attr(option.id)}" ${String(option.id) === String(e.segmentId) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>
          </label>
          <label class="field">
            <span>Тип кампанії</span>
            <select id="campaignType">
              ${[
                ['new_harvest', 'Новий врожай / новий товар'],
                ['preorder', 'Передзамовлення'],
                ['replenishment', 'Повторна покупка'],
                ['vip', 'VIP-пропозиція']
              ].map(([value, label]) => `<option value="${value}" ${value === e.campaignType ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span>URL або сторінка</span>
            <input id="emailUrl" value="${attr(e.url)}" placeholder="https://mercato.com.ua/">
          </label>
          <label class="field full">
            <span>Привід / тема кампанії</span>
            <input id="emailOffer" value="${attr(e.offer)}" placeholder="Новий врожай Мексика Maragogype або передзамовлення фермерської арабіки">
          </label>
        </div>
        <section>
          <p class="section-kicker">AI subject variants</p>
          <div class="subject-grid">${subjects.map(subject => `<button class="subject-card ${subject === e.subject ? 'is-active' : ''}" type="button" data-subject="${attr(subject)}">${escapeHtml(subject)}</button>`).join('')}</div>
        </section>
        <label class="field full">
          <span>Тема</span>
          <input id="emailSubject" value="${attr(e.subject)}" placeholder="Тема листа">
        </label>
        <label class="field full">
          <span>Preheader</span>
          <input id="emailPreheader" value="${attr(e.preheader)}" placeholder="Короткий текст після теми">
        </label>
        <label class="field full">
          <span>Текст листа</span>
          <div class="rich-toolbar" aria-label="Rich editor toolbar">
            <button type="button" data-insert="**текст**" title="Bold">B</button>
            <button type="button" data-insert="- пункт" title="List">L</button>
            <button type="button" data-insert="[ПРОМОКОД]" title="Coupon">%</button>
          </div>
          <textarea id="emailBody">${escapeHtml(e.body)}</textarea>
        </label>
        <div class="form-grid">
          <label class="field">
            <span>CTA</span>
            <input id="emailCta" value="${attr(e.cta)}">
          </label>
          <label class="field">
            <span>URL</span>
            <input id="emailCtaUrl" value="${attr(e.url)}">
          </label>
        </div>
        ${renderCouponBox(e.coupon)}
      </div>
    </div>
    <aside class="card">
      <div class="section-head">
        <div>
          <p class="section-kicker">Preview і відправка</p>
          <h2>Кому піде лист</h2>
          <p>Видно персонально, групу і памʼять відправок. Live-відправка тільки кнопкою.</p>
        </div>
      </div>
      <div class="preview-tabs">
        <button type="button" data-preview="mobile" class="${state.emailPreviewMode === 'mobile' ? 'is-active' : ''}">Mobile</button>
        <button type="button" data-preview="desktop" class="${state.emailPreviewMode === 'desktop' ? 'is-active' : ''}">Desktop</button>
      </div>
      ${renderEmailPreview()}
      <div class="split-line"></div>
      <div class="send-steps">
        <article class="send-card">
          <h3>1. Собі на перевірку</h3>
          <input id="testEmail" placeholder="ваш email для тесту">
          <button class="button secondary" type="button" id="sendTestEmail">Тест собі</button>
        </article>
        <article class="send-card">
          <h3>2. Персонально клієнту</h3>
          <select id="singleCustomer">${rows.map(row => `<option value="${attr(customerId(row))}">${escapeHtml(row.name || row.email || 'Клієнт')}</option>`).join('')}</select>
          <button class="button" type="button" id="sendOneEmail" ${rows.length ? '' : 'disabled'}>Надіслати одному</button>
        </article>
        ${renderRecipientPicker()}
        <article class="send-card">
          <h3>4. Групі після погодження</h3>
          <p>${escapeHtml(segmentLabel(e.segmentId, dna))}. Сервер отримає тільки ${number(selectedRecipients.length)} обраних контактів і додатково перевірить stop-list, unsubscribe, SMTP і купони.</p>
          <button class="button" type="button" id="sendSegmentEmail" ${selectedRecipients.length ? '' : 'disabled'}>Надіслати ${number(selectedRecipients.length)} контактам</button>
        </article>
      </div>
      ${e.lastResult ? `<div class="split-line"></div><p>${escapeHtml(e.lastResult)}</p>` : ''}
    </aside>
  </section>`;
}

function segmentOptions(dna) {
  const fromSegments = emailSegmentRows().map(segment => {
    const id = emailSegmentId(segment);
    const count = segment.count || asArray(segment.recipients).length || asArray(segment.batchPreview).length || asArray(segment.sampleCustomers).length || 0;
    return {
      id,
      label: `${segment.title || segment.name || id || 'Сегмент'} · ${number(count)}`
    };
  }).filter(option => option.id);
  if (fromSegments.length) return fromSegments;
  const fromDna = asArray(dna.segments).map(segment => ({
    id: segment.id || segment.status || segment.title,
    label: `${segment.title || segment.id || 'Сегмент'} · ${number(segment.count || 0)}`
  })).filter(option => option.id);
  if (fromDna.length) return fromDna;
  return fromSegments.length ? fromSegments : [
    { id: 'risk', label: 'Клієнти з аномалією циклу' },
    { id: 'vip', label: 'VIP / високий LTV' },
    { id: 'new', label: 'Нові клієнти без повтору' }
  ];
}

function segmentLabel(id, dna) {
  return segmentOptions(dna).find(option => option.id === id)?.label || id || 'сегмент';
}

function subjectIdeas() {
  const offer = text(state.email.offer, 'нова пропозиція');
  const type = state.email.campaignType;
  if (type === 'preorder') {
    return [
      `Відкриваю передзамовлення: ${offer}`,
      `Можна забронювати ${offer}`,
      `Перший доступ до нового лоту`
    ];
  }
  if (type === 'replenishment') {
    return [
      'Здається, час поповнити запас',
      'Підібрав варіант під ваші попередні замовлення',
      'Маленька підказка для наступної чашки'
    ];
  }
  return [
    `Новий врожай: ${offer}`,
    `Є свіжий лот під ваш смак`,
    `Показати новинку до того, як вона закінчиться?`
  ];
}

function renderCouponBox(coupon) {
  return `<section class="coupon-box">
    <label class="field">
      <span><input id="couponEnabled" type="checkbox" ${coupon.enabled ? 'checked' : ''}> Додати персональний купон</span>
    </label>
    <p>Код має бути видимий до відправки. Натисніть кнопку, щоб створити код і одразу вставити його в лист замість [ПРОМОКОД].</p>
    <div class="coupon-row">
      <label class="field"><span>Знижка</span><input id="couponDiscount" type="number" min="1" max="99" value="${attr(coupon.discount)}"></label>
      <label class="field"><span>Тип</span><select id="couponType"><option value="P" ${coupon.type === 'P' ? 'selected' : ''}>%</option><option value="F" ${coupon.type === 'F' ? 'selected' : ''}>грн</option></select></label>
      <label class="field"><span>Діє, днів</span><input id="couponDays" type="number" min="1" max="30" value="${attr(coupon.days)}"></label>
      <button class="button warning" type="button" id="createCoupon" ${coupon.enabled ? '' : 'disabled'}>${coupon.code ? 'Оновити код' : 'Створити код і вставити'}</button>
    </div>
    <div class="split-line"></div>
    <p><strong>couponCode:</strong> ${escapeHtml(coupon.code || 'ще не створено')}</p>
  </section>`;
}

function renderEmailPreview() {
  const e = state.email;
  const body = applyCouponToBody(e.body, e.coupon);
  const width = state.emailPreviewMode === 'desktop' ? '100%' : '320px';
  return `<div class="phone-preview">
    <strong>${state.emailPreviewMode === 'desktop' ? 'Gmail desktop preview' : 'Gmail mobile preview'}</strong>
    <div class="mail-card" style="max-width:${width}">
      <small>${escapeHtml(e.preheader)}</small>
      <h3>${escapeHtml(e.subject)}</h3>
      <p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>
      <a class="button" href="${attr(e.url)}">${escapeHtml(e.cta)}</a>
    </div>
  </div>`;
}

function applyCouponToBody(body, coupon) {
  if (!coupon.enabled) return body;
  return String(body || '').replace(/\[ПРОМОКОД\]/g, coupon.code || '[ПРОМОКОД]');
}

function renderProduct() {
  const p = state.product;
  const generated = productDraft();
  const feedReport = merchantFeedChecksForProduct(p, generated, state.productMode);
  const requiresUrl = state.productMode === 'existing';
  const hasExistingUrl = Boolean(text(p.url));
  const canDryRun = Boolean(text(p.title || generated.title) && text(p.description || generated.description));
  const publishBlockers = [
    ...(requiresUrl && !hasExistingUrl ? ['URL існуючого товару'] : []),
    ...feedReport.blockers.map(item => item.label),
    ...(!p.lastDryRunOk ? ['успішний dry-run після останніх змін'] : [])
  ];
  const canPublish = canDryRun && !p.publishLoading && !publishBlockers.length;
  return `<section class="hero-panel">
    <div>
      <p class="section-kicker">Картка товару</p>
      <h2>Не просто згенерувати текст, а безпечно оновити товар</h2>
      <p>Порядок роботи: імпорт URL або факти → preview → dry-run → тільки після цього publish в OpenCart. Merchant Center тут не публікується.</p>
    </div>
    <aside class="proof-box">
      <span class="status-pill ${p.lastDryRunOk ? 'ok' : 'warn'}">${p.lastDryRunOk ? 'Dry-run готовий' : 'Preview first'}</span>
      <strong>${state.productMode === 'existing' ? 'Оновлення існуючого товару' : 'Чернетка нового товару'}</strong>
      <p>${publishBlockers.length ? `Publish заблоковано: ${escapeHtml(publishBlockers.join(', '))}.` : 'Можна відправляти погоджений publish в OpenCart.'}</p>
    </aside>
  </section>
  <section class="content-grid">
    <div class="card">
      <div class="section-head">
        <div>
          <p class="section-kicker">1. Факти</p>
          <h2>Що продаємо</h2>
        </div>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>Режим</span>
          <select id="productMode"><option value="existing" ${state.productMode === 'existing' ? 'selected' : ''}>Оновити існуючий товар</option><option value="new" ${state.productMode === 'new' ? 'selected' : ''}>Новий товар</option></select>
        </label>
        <label class="field">
          <span>Тип</span>
          <input id="productType" value="${attr(p.type)}">
        </label>
        <label class="field full">
          <span>URL існуючого товару</span>
          <div class="input-action-row">
            <input id="productUrl" value="${attr(p.url)}" placeholder="https://mercato.com.ua/...">
            <button class="button secondary" type="button" id="importProductUrl" ${p.importLoading ? 'disabled' : ''}>${p.importLoading ? 'Імпортую' : 'Імпорт з URL'}</button>
          </div>
        </label>
        ${p.importNote ? `<div class="inline-note ok">${escapeHtml(p.importNote)}</div>` : ''}
        ${p.importError ? `<div class="inline-note bad">${escapeHtml(p.importError)}</div>` : ''}
        <label class="field full">
          <span>Назва товару</span>
          <input id="productName" value="${attr(p.name)}">
        </label>
        <label class="field full">
          <span>Факти, які не можна вигадувати</span>
          <textarea id="productFacts">${escapeHtml(p.facts)}</textarea>
        </label>
        ${renderProductTopEditor()}
      </div>
      <div class="button-row">
        <button class="button" type="button" id="generateProductDraft">Згенерувати картку</button>
        <button class="button secondary" type="button" id="applyProductTopFacts">Оновити preview з верхнього блоку</button>
        <button class="button secondary" type="button" data-route="seo">Перейти до SEO</button>
      </div>
    </div>
    <div class="editor-panel">
      <div class="editor-head">
        <div>
          <p class="section-kicker">2. Preview / dry-run</p>
          <h2>Що зміниться</h2>
        </div>
        <div class="button-row">
          <button class="button secondary" type="button" id="productDryRun" ${!canDryRun || p.publishLoading ? 'disabled' : ''}>${p.publishLoading ? 'Перевіряю' : 'Dry-run'}</button>
          <button class="button" type="button" id="productPublish" ${canPublish ? '' : 'disabled'}>Publish в OpenCart</button>
        </div>
      </div>
      <div class="editor-body">
        <label class="field full"><span>Title</span><input id="productTitle" value="${attr(p.title || generated.title)}"></label>
        <label class="field full"><span>Meta description</span><textarea id="productMeta">${escapeHtml(p.meta || generated.meta)}</textarea></label>
        <label class="field full"><span>H1</span><input id="productH1" value="${attr(p.h1 || generated.h1)}"></label>
        <label class="field full"><span>Опис товару для сторінки; блоки data-merchant-feed-exclude не йдуть у feed</span><textarea id="productDescription" class="tall">${escapeHtml(p.description || generated.description)}</textarea></label>
        <label class="field full"><span>Характеристики OpenCart</span><textarea id="productAttributes">${escapeHtml(p.attributes || generated.attributes)}</textarea></label>
        ${renderSerpPreview(p.title || generated.title, p.url || 'https://mercato.com.ua/product', p.meta || generated.meta)}
        ${renderMerchantFeedCheck(p, generated)}
        ${renderProductOperationState(p, feedReport, { requiresUrl, canDryRun, canPublish, publishBlockers })}
      </div>
    </div>
  </section>`;
}

function renderProductOperationState(product, feedReport, stateInfo = {}) {
  const result = product.lastResult || null;
  const publishBlockers = asArray(stateInfo.publishBlockers);
  const resultTone = result?.ok ? 'ok' : result?.status === 'pending' ? 'warn' : result ? 'bad' : 'warn';
  const resultTitle = result
    ? result.dryRun
      ? 'Dry-run результат'
      : 'Publish результат'
    : 'Що треба зробити далі';
  const nextStep = result
    ? result.message || ''
    : stateInfo.requiresUrl && !text(product.url)
      ? 'Вставте URL існуючого товару або перемкніть режим на “Новий товар”.'
      : feedReport.blockers.length
        ? `Виправте Merchant-блокери: ${feedReport.blockers.map(item => item.label).join(', ')}.`
        : 'Натисніть Dry-run. Якщо сервер підтвердить payload, кнопка Publish стане доступною.';
  return `<section class="product-operation-state">
    <div>
      <span class="status-pill ${resultTone}">${product.publishLoading ? 'виконується' : result ? (result.ok ? 'ok' : 'помилка') : 'очікує dry-run'}</span>
      <h3>${escapeHtml(resultTitle)}</h3>
      <p>${escapeHtml(product.publishLoading ? 'Сервер перевіряє payload. Запис у live виконується тільки для Publish, не для Dry-run.' : nextStep)}</p>
    </div>
    <div class="product-operation-facts">
      <span><b>Dry-run</b>${product.lastDryRunOk ? 'пройшов' : 'потрібен'}</span>
      <span><b>OpenCart publish</b>${stateInfo.canPublish ? 'доступний' : 'заблоковано'}</span>
      <span><b>Merchant Center</b>вимкнено</span>
      ${result?.url ? `<span><b>URL</b>${escapeHtml(result.url)}</span>` : ''}
      ${result?.id ? `<span><b>ID</b>${escapeHtml(result.id)}</span>` : ''}
    </div>
    ${publishBlockers.length ? `<div class="inline-note bad">Publish не можна: ${escapeHtml(publishBlockers.join(', '))}.</div>` : ''}
    ${result?.verification ? `<div class="inline-note ${result.verification.ok === false ? 'bad' : 'ok'}">${escapeHtml(result.verification.reason || (result.verification.ok ? 'Readback підтвердив зміну.' : 'Readback не підтвердив зміну.'))}</div>` : ''}
  </section>`;
}

function productTopEditorData() {
  const p = state.product;
  const name = localizeCountryNamesUa(text(p.name, 'Товар'));
  const facts = parseProductFacts(p.facts);
  const kind = productKindForDraft(p.type, name);
  const taste = productFact(facts, ['смак', 'профіль', 'смаковий профіль'], '');
  const country = localizeCountryNamesUa(productFact(facts, ['країна', 'країна походження', 'походження']));
  const region = productFact(facts, ['регіон', 'область', 'region', 'area', 'контекст']);
  const processing = productFact(facts, ['обробка', 'процес', 'тип']);
  const harvestYear = normalizeHarvestYear(productFact(facts, ['рік врожаю', 'врожай', 'урожай', 'harvest', 'crop year']));
  const fit = productFact(facts, ['кому підійде', 'для кого', 'аудиторія'], '');
  const recommendation = cleanBrewingText(productFact(facts, ['рекомендація', 'заварювання', 'приготування', 'як готувати', 'метод приготування'], ''));
  const profile = tasteProfileForDraft(facts, {
    kind,
    name,
    taste: taste || (kind === 'чай' ? 'чистий аромат і мʼякий настій' : 'збалансований профіль'),
    country,
    region,
    processing
  });
  return {
    taste,
    harvestYear,
    fit,
    recommendation,
    profile
  };
}

function renderProductTopEditor() {
  const top = productTopEditorData();
  const scaleFields = [
    ['productScaleAcidity', 'Кислотність', top.profile['Кислотність']],
    ['productScaleSweetness', 'Солодкість', top.profile['Солодкість']],
    ['productScaleBody', 'Тіло', top.profile['Тіло']],
    ['productScaleAftertaste', 'Післясмак', top.profile['Післясмак']],
    ['productScaleFruitiness', 'Фруктовість', top.profile['Фруктовість']]
  ];
  return `<div class="product-top-editor">
    <div class="compact-head">
      <div>
        <p class="section-kicker">Верхній блок товару</p>
        <h3>Смак, врожай, кому підійде і як готувати</h3>
      </div>
    </div>
    <div class="product-top-grid">
      <label class="field"><span>Смак</span><input id="productTopTaste" value="${attr(top.taste)}" placeholder="цитрус, яблуко, сухофрукти"></label>
      <label class="field"><span>Рік врожаю</span><input id="productTopHarvest" value="${attr(top.harvestYear)}" placeholder="2026 або 2025/2026"></label>
      <label class="field full"><span>Кому підійде</span><input id="productTopFit" value="${attr(top.fit)}" placeholder="тим, хто любить фруктову кислотність і чистий фільтр"></label>
      <label class="field full"><span>Як готувати</span><input id="productTopBrew" value="${attr(top.recommendation)}" placeholder="фільтр, V60, гейзер, френч-прес"></label>
    </div>
    <div class="product-scale-grid">
      ${scaleFields.map(([id, label, value]) => `<label class="field"><span>${escapeHtml(label)}</span><input id="${id}" type="number" min="0" max="10" step="0.1" value="${attr(value)}"></label>`).join('')}
    </div>
  </div>`;
}

function parseProductFacts(value = '') {
  return String(value || '').split(/\n+/).reduce((acc, line) => {
    const [rawKey, ...rest] = line.split(':');
    const key = rawKey?.trim();
    const body = rest.join(':').trim();
    if (key && body) acc[key.toLowerCase()] = body;
    return acc;
  }, {});
}

function productFact(facts, keys = [], fallback = '') {
  const lowerKeys = keys.map(key => String(key).toLowerCase());
  for (const key of lowerKeys) {
    if (facts[key]) return facts[key];
  }
  const found = Object.entries(facts).find(([key]) => lowerKeys.some(item => key.includes(item)));
  return found?.[1] || fallback;
}

function productFactsFromImport(imported = {}, fallbackFacts = '') {
  const brewing = cleanBrewingText(imported.brewing || '');
  const rows = [
    ['Країна', localizeCountryNamesUa(imported.origin || '')],
    ['Регіон', imported.region || ''],
    ['Ферма / станція', imported.farm || imported.station || imported.producer || ''],
    ['Сорт / різновид', imported.variety || imported.cultivar || ''],
    ['Рік врожаю', normalizeHarvestYear(imported.harvestYear || '')],
    ['Смак', imported.flavors || ''],
    ['Обробка', imported.processing || ''],
    ['Рекомендація', brewing]
  ]
    .map(([key, value]) => [key, String(value || '').trim()])
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}: ${value}`);
  return rows.length ? rows.join('\n') : (fallbackFacts || '');
}

function productDraftVariant(seed, count) {
  const source = String(seed || '');
  const sum = [...source].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return count ? sum % count : 0;
}

const COUNTRY_NAME_UA_ALIASES = [
  ['dominican republic', 'Домініканська Республіка'],
  ['dominicana', 'Домініканська Республіка'],
  ['el salvador', 'Ель-Сальвадор'],
  ['costa rica', 'Коста-Рика'],
  ['papua new guinea', 'Папуа Нова Гвінея'],
  ['sri lanka', 'Шрі-Ланка'],
  ['cote d ivoire', 'Кот-дʼІвуар'],
  ['cote d\'ivoire', 'Кот-дʼІвуар'],
  ['côte d’ivoire', 'Кот-дʼІвуар'],
  ['ethiopia', 'Ефіопія'],
  ['mexico', 'Мексика'],
  ['colombia', 'Колумбія'],
  ['columbia', 'Колумбія'],
  ['brazil', 'Бразилія'],
  ['brasil', 'Бразилія'],
  ['guatemala', 'Гватемала'],
  ['honduras', 'Гондурас'],
  ['nicaragua', 'Нікарагуа'],
  ['panama', 'Панама'],
  ['peru', 'Перу'],
  ['kenya', 'Кенія'],
  ['rwanda', 'Руанда'],
  ['burundi', 'Бурунді'],
  ['uganda', 'Уганда'],
  ['tanzania', 'Танзанія'],
  ['indonesia', 'Індонезія'],
  ['india', 'Індія'],
  ['vietnam', 'Вʼєтнам'],
  ['china', 'Китай'],
  ['japan', 'Японія'],
  ['taiwan', 'Тайвань'],
  ['bolivia', 'Болівія'],
  ['ecuador', 'Еквадор'],
  ['yemen', 'Ємен'],
  ['jamaica', 'Ямайка'],
  ['cuba', 'Куба'],
  ['malawi', 'Малаві'],
  ['thailand', 'Таїланд'],
  ['nepal', 'Непал']
];

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function localizeCountryNamesUa(value) {
  let output = String(value || '');
  for (const [alias, uaName] of COUNTRY_NAME_UA_ALIASES) {
    const pattern = alias.split(/\s+/).map(escapeRegExp).join('[\\s-]+');
    const rx = new RegExp(`(^|[^\\p{L}])(${pattern})(?=$|[^\\p{L}])`, 'giu');
    output = output.replace(rx, `$1${uaName}`);
  }
  return output;
}

function cleanProductDisplayName(value) {
  return localizeCountryNamesUa(String(value || ''))
    .replace(/\s+/g, ' ')
    .replace(/\s*[|–—-]\s*Mercato\s*$/iu, '')
    .replace(/\s+купити(?:\s+в\s+Україні)?\s*$/iu, '')
    .replace(/\s+купити\s*$/iu, '')
    .replace(/[,\s;:–—-]+$/u, '')
    .trim();
}

function usefulProductText(value) {
  const textValue = String(value || '').replace(/\s+/g, ' ').trim();
  if (!textValue) return false;
  return !/^(не вказано|не указано|уточнити|n\/a|null|undefined|-|—)$/i.test(textValue);
}

function normalizeHarvestYear(value = '') {
  const source = String(value || '').replace(/\s+/g, ' ').trim();
  if (!usefulProductText(source)) return '';
  const match = source.match(/\b(20\d{2})(?:\s*[\/\-–—]\s*(20\d{2}|\d{2}))?\b/);
  if (!match) return source.replace(/^(рік\s+врожаю|врожай|урожай|harvest|crop\s+year)\s*[:\-–—]?\s*/iu, '').trim();
  const start = match[1];
  let end = match[2] || '';
  if (end && end.length === 2) end = `${start.slice(0, 2)}${end}`;
  return end ? `${start}/${end}` : start;
}

function isProductFormatProcessing(value = '') {
  const lower = String(value || '').toLowerCase();
  return /(^|[\s,;:])(в\s+зернах|зернова|зерно|мелен[аийеі]|помел|капсул|др[іи]п|пакетик|фасован|фасування)($|[\s,;:])/iu.test(lower)
    && !/(^|[\s,;:])(washed|natural|honey|anaerobic|carbonic|мит[аоиій]|натурал|медов|анаероб|фермент|суха\s+оброб)($|[\s,;:])/iu.test(lower);
}

function productLotProcessingRow(processing = '') {
  if (!usefulProductText(processing)) return null;
  return [isProductFormatProcessing(processing) ? 'Формат' : 'Обробка', processing];
}

function processingInfoForDraft(kind, processing = '') {
  const raw = String(processing || '').replace(/\s+/g, ' ').trim();
  const lower = raw.toLowerCase();
  if (!usefulProductText(raw)) {
    if (kind === 'чай') return { title: 'Тип / підготовка', line: 'Тип чаю краще описувати через аромат, колір настою, мʼякість і можливу терпкість.' };
    if (kind === 'набір') return { title: 'Формат', line: 'Для набору важливі склад, смаковий напрям і сценарій: дегустація, щоденне використання або подарунок.' };
    return { title: 'Обробка', line: 'Якщо метод обробки не вказаний, не вигадуйте його. Описуйте смак через ноти, тіло, кислотність і рекомендований спосіб приготування.' };
  }
  if (isProductFormatProcessing(raw)) {
    return { title: 'Формат', line: `${raw} — це формат товару, а не метод обробки зерна. Для вибору смаку важливіші походження, обсмаження і рецепт приготування.` };
  }
  if (kind === 'чай') return { title: 'Тип / підготовка', line: `${raw} варто пояснювати через аромат, колір настою, мʼякість і можливу терпкість.` };
  if (kind === 'набір') return { title: 'Формат / склад', line: `${raw} описує склад набору і допомагає зрозуміти, для чого він краще підходить.` };

  const hasWashed = /\bwashed\b|мит[аоиій]|вош[дт]/iu.test(lower);
  const hasNatural = /\bnatural\b|натурал|сух[ао]?\s+оброб/iu.test(lower);
  const hasHoney = /\bhoney\b|хани|хані|медов/iu.test(lower);
  const hasAnaerobic = /anaerobic|анаероб|анаэроб|фермент|carbonic|карбон/iu.test(lower);
  const hasDecaf = /decaf|декаф|декоф|без\s+кофе/iu.test(lower);
  const hasGradeOnly = /\b(shg|ep|hg|strictly\s+high\s+grown|european\s+prep)\b/iu.test(lower)
    && !hasWashed
    && !hasNatural
    && !hasHoney
    && !hasAnaerobic
    && !hasDecaf;
  if (hasGradeOnly) return { title: 'Клас / підготовка', line: `${raw} — це не спосіб обробки, а клас і підготовка зерна: висота вирощування, щільність та сортування. Остаточне враження формують смакові ноти, обсмаження і рецепт.` };
  if (hasWashed) return { title: 'Обробка', line: `Мита обробка (${raw}) зазвичай дає чистішу чашку, прозорішу кислотність і чіткіші ноти. Солодкість та тіло залежать ще від сорту, обсмаження і рецепта.` };
  if (hasNatural) return { title: 'Обробка', line: `Натуральна обробка (${raw}) часто дає більше солодкості, щільніше тіло і виразнішу фруктовість, іноді з винними або ферментними відтінками.` };
  if (hasHoney) return { title: 'Обробка', line: `Медова обробка (${raw}) зазвичай дає баланс між чистотою митої обробки та солодкістю натуральної.` };
  if (hasAnaerobic) return { title: 'Обробка', line: `Анаеробна ферментація (${raw}) може давати інтенсивніший аромат, яскраву фруктовість і складніший післясмак.` };
  if (hasDecaf) return { title: 'Обробка', line: `Декофеїнізація (${raw}) прибирає кофеїн, але смак залежить від методу, походження зерна й обсмаження.` };
  return { title: 'Обробка / підготовка', line: `${raw} — характеристика обробки або підготовки. Якщо це не метод обробки, використовуйте її як додатковий факт, а смак описуйте окремо.` };
}

function productKindForDraft(type, name) {
  const source = `${type} ${name}`.toLowerCase();
  if (/набір|сет|бокс|gift|подар/.test(source)) return 'набір';
  if (/чай|tea|chai|матча|улун|пуер|сенча|ройбуш/.test(source) && !/кава|coffee|арабік|espresso/.test(source)) return 'чай';
  if (/какао|cacao|cocoa/.test(source)) return 'какао';
  return 'кава';
}

function splitTasteNotesForDraft(value) {
  return String(value || '')
    .split(/\s*,\s*|\s*;\s*|\s*\|\s*/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function humanList(items = []) {
  const clean = items.filter(Boolean);
  if (clean.length <= 1) return clean[0] || '';
  if (clean.length === 2) return `${clean[0]} і ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} і ${clean[clean.length - 1]}`;
}

function clampTasteScore(value, fallback = 5) {
  const raw = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/)?.[0];
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(10, Math.round(num * 10) / 10));
}

function cleanBrewingText(value = '') {
  const textValue = String(value || '').replace(/\s+/g, ' ').trim();
  if (!usefulProductText(textValue)) return '';
  if (/^(купити|купуйте|замовити|до кошика|в кошик|каталог|перейти|детальніше|читати|наявність|відгуки|характеристики)$/iu.test(textValue)) return '';
  if (/\b(грн|uah|₴|доставка|відправка|оплата|кошик|замовлення)\b/iu.test(textValue)) return '';
  return textValue;
}

function profileScoreFromFacts(facts, keys, fallback) {
  const value = productFact(facts, keys, '');
  return clampTasteScore(value, fallback);
}

function estimateTasteProfileForDraft({ kind, name, taste, country, region, processing }) {
  const source = `${name || ''} ${taste || ''} ${country || ''} ${region || ''} ${processing || ''}`.toLowerCase();
  const score = kind === 'чай'
    ? { acidity: 3.5, sweetness: 5, body: 4, aftertaste: 5, fruitiness: 3.5 }
    : kind === 'набір'
      ? { acidity: 4.5, sweetness: 6, body: 5.5, aftertaste: 6, fruitiness: 4.5 }
      : { acidity: 5, sweetness: 6, body: 6, aftertaste: 6, fruitiness: 5 };
  const add = (key, delta) => { score[key] += delta; };
  const has = re => re.test(source);

  if (has(/цитрус|лимон|апельс|грейп|лайм|кисл/)) {
    add('acidity', 1.8);
    add('fruitiness', 1.1);
    add('aftertaste', 0.4);
  }
  if (has(/яблук|груш|білий чай|бергамот|квіт|жасмин/)) {
    add('acidity', 0.9);
    add('fruitiness', 0.8);
    add('body', -0.4);
  }
  if (has(/ягод|смород|мали|вишн|полуниц|винн|виноград|сухофрукт|родзин|кураг/)) {
    add('acidity', 0.8);
    add('sweetness', 0.7);
    add('fruitiness', 1.6);
    add('aftertaste', 0.7);
  }
  if (has(/шокол|какао|горіх|карам|мед|фінік|нуга/)) {
    add('sweetness', 1.5);
    add('body', 1.2);
    add('acidity', -0.6);
    add('fruitiness', -0.4);
  }
  if (has(/washed|мита|митий|вош/)) {
    add('acidity', 0.7);
    add('fruitiness', 0.4);
    add('body', -0.2);
  }
  if (has(/natural|натурал|суха оброб|honey|анаероб|фермент/)) {
    add('sweetness', 1);
    add('body', 0.5);
    add('fruitiness', 0.9);
    add('aftertaste', 0.6);
  }
  if (has(/бразил|інді|робуста|espresso|еспресо|темн|dark/)) {
    add('acidity', -1);
    add('body', 1.2);
    add('sweetness', 0.4);
    add('fruitiness', -0.8);
  }

  return {
    'Кислотність': String(clampTasteScore(score.acidity, 5)),
    'Солодкість': String(clampTasteScore(score.sweetness, 6)),
    'Тіло': String(clampTasteScore(score.body, 6)),
    'Післясмак': String(clampTasteScore(score.aftertaste, 6)),
    'Фруктовість': String(clampTasteScore(score.fruitiness, 5))
  };
}

function tasteProfileForDraft(facts, ctx) {
  const estimated = estimateTasteProfileForDraft(ctx);
  return {
    'Кислотність': String(profileScoreFromFacts(facts, ['кислотність', 'acidity'], Number(estimated['Кислотність']))),
    'Солодкість': String(profileScoreFromFacts(facts, ['солодкість', 'sweetness'], Number(estimated['Солодкість']))),
    'Тіло': String(profileScoreFromFacts(facts, ['тіло', 'body'], Number(estimated['Тіло']))),
    'Післясмак': String(profileScoreFromFacts(facts, ['післясмак', 'aftertaste'], Number(estimated['Післясмак']))),
    'Фруктовість': String(profileScoreFromFacts(facts, ['фруктовість', 'фруктовисть', 'fruitiness'], Number(estimated['Фруктовість'])))
  };
}

function tasteSentenceForProduct(kind, notes = [], fallback = '') {
  const list = humanList(notes);
  if (list) return kind === 'чай' ? `Аромат і настій: ${list}.` : `У смаку: ${list}.`;
  return `Смак: ${fallback || (kind === 'чай' ? 'чистий аромат і мʼякий настій' : 'збалансований профіль')}.`;
}

function tasteExperienceLine(kind, notes = [], taste = '') {
  const source = `${notes.join(', ')} ${taste}`.toLowerCase();
  if (kind === 'чай') {
    return 'У настої звертайте увагу на аромат, прозорість, мʼякість і післясмак.';
  }
  if (/цитрус|лимон|апельс|грейп|лайм|ягод|смород|мали|вишн|бергамот|квіт|яблук|груш|білий чай/.test(source)) {
    return 'Очікуйте чистіший аромат, живу фруктову кислотність і легший післясмак без важкої гіркоти.';
  }
  if (/шокол|горіх|карам|какао|мед|сухофрукт|фінік|родзин/.test(source)) {
    return 'Очікуйте мʼякший, солодший смак із комфортним тілом і спокійним післясмаком.';
  }
  return 'Оцінюйте баланс солодкості, кислотності, тіла і післясмаку, а не одну окрему ноту.';
}

function fitLineForProduct(kind, taste) {
  const source = taste.toLowerCase();
  if (kind === 'чай') return 'для спокійного чаювання, коли важливі аромат, мʼякість настою і чистий післясмак';
  if (kind === 'набір') return 'для дегустації, подарунка або швидкого знайомства з кількома профілями';
  if (/цитрус|ягод|фрукт|вишн|смород|лимон|апельс|винн/.test(source)) return 'тим, хто любить яскравішу чашку з фруктовою кислотністю і чистим фіналом';
  if (/шокол|горіх|карам|какао|мед|сухофрукт/.test(source)) return 'тим, хто шукає мʼякший, солодший профіль без різкої кислотності';
  return 'тим, хто хоче стабільну чашку для щоденного приготування';
}

function dailyUseClauseForProduct(kind, taste) {
  const source = String(taste || '').toLowerCase();
  if (kind === 'чай') return 'потрібен чистий аромат і мʼякий настій';
  if (kind === 'набір') return 'потрібні кілька смаків без довгого вибору';
  if (/цитрус|лимон|апельс|грейп|лайм|ягод|смород|мали|вишн|бергамот|квіт|яблук|груш|білий чай/.test(source)) {
    return 'потрібна легша фруктова чашка для фільтра, гейзера або френч-преса';
  }
  if (/шокол|горіх|карам|какао|мед|сухофрукт|фінік|родзин/.test(source)) {
    return 'потрібна мʼякша солодка кава для щоденного рецепта';
  }
  return 'потрібна стабільна зернова кава для звичного рецепта';
}

function brewLineForProduct(kind, recommendation) {
  const clean = cleanBrewingText(recommendation);
  if (clean) return clean;
  if (kind === 'чай') return 'починайте з мʼякшого заварювання 70-85°C і короткого настою, якщо на упаковці не вказано інакше';
  if (kind === 'набір') return 'використовуйте кожну позицію окремо, щоб порівняти смак, аромат і післясмак без змішування профілів';
  if (kind === 'какао') return 'готуйте на молоці або воді залежно від бажаної щільності напою';
  return 'фільтр, V60, гейзер, френч-прес або аеропрес; помел краще підбирати під конкретний метод';
}

function practicalBrewAdvice(kind, brew) {
  const clean = String(brew || '').trim();
  if (kind === 'чай') return `Готуйте мʼяко: ${clean}. Якщо настій виходить терпким, зменште температуру або час.`;
  if (kind === 'набір') return `Використовуйте кожну позицію окремо: ${clean}. Так легше порівняти смак і не змішати різні профілі.`;
  if (kind === 'какао') return `Готуйте за бажаною щільністю: ${clean}. Для мʼякшого смаку беріть більше молока, для інтенсивнішого - менше.`;
  return `Готуйте під свій метод: ${clean}. Якщо смак різкий, зробіть помел трохи грубішим; якщо водянистий - трохи дрібнішим.`;
}

function productInternalLinksHtmlForDraft(kind) {
  const links = kind === 'чай'
    ? [['/ua-chai', 'чай'], ['/ua-chai/cha-sencha', 'зелений чай'], ['/kava-nabory', 'подарункові набори']]
    : kind === 'набір'
      ? [['/kava-nabory', 'набори кави'], ['/kava-v-zernah', 'кава в зернах'], ['/ua-chai', 'чай']]
      : [['/kava-v-zernah', 'кава в зернах'], ['/fermerska-kava', 'фермерська кава'], ['/svizhoobsmazhena-kava', 'свіжообсмажена кава']];
  return `<div data-merchant-feed-exclude="true" style="border-top:1px solid #f1f5f9;margin:22px 0 0;padding-top:14px;color:#6b7280;font-size:14px;">
    <strong style="display:block;color:#1f2937;margin:0 0 6px;">Схожі розділи</strong>
    <p style="margin:0;">${links.map(([href, label]) => `<a href="${href}" style="color:#8a5a35;text-decoration:none;border-bottom:1px solid #e5d2c4;">${label}</a>`).join(' · ')}</p>
  </div>`;
}

function merchantSafeDescription(value) {
  return localizeCountryNamesUa(value)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\b(www\.)\S+/gi, '')
    .replace(/\b(безкоштовн\w*\s+доставк\w*|free shipping|доставк\w*|відправк\w*|знижк\w*|акці\w*|промокод\w*|розпродаж\w*|найнижч\w*\s+цін\w*)\b/giu, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .slice(0, 4800)
    .trim();
}

function merchantSafeMeta(value, max = 160) {
  const clean = merchantSafeDescription(value).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const shortened = clean.slice(0, max + 1).replace(/\s+\S*$/, '').replace(/[,\s;:–—-]+$/u, '').trim();
  return shortened || clean.slice(0, max).replace(/[,\s;:–—-]+$/u, '').trim();
}

function merchantFeedHtml(value = '') {
  const html = String(value || '');
  if (typeof document === 'undefined') {
    return html.replace(/<([a-z][\w:-]*)(?=[^>]*data-merchant-feed-exclude=["']?true["']?)[\s\S]*?<\/\1>/giu, '');
  }
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('[data-merchant-feed-exclude]').forEach(node => node.remove());
  return template.innerHTML;
}

function merchantPlainTextFromHtml(value = '') {
  const html = merchantFeedHtml(value);
  if (typeof document === 'undefined') return stripHtml(html);
  const template = document.createElement('template');
  template.innerHTML = html;
  return String(template.content.textContent || '').replace(/\s+/g, ' ').trim();
}

function productAttributeValue(attributes, keys = []) {
  const normalized = keys.map(key => String(key).toLowerCase());
  for (const [key, value] of Object.entries(attributes || {})) {
    const lower = key.toLowerCase();
    if (normalized.some(item => lower === item || lower.includes(item))) return String(value || '').trim();
  }
  return '';
}

function merchantPromoPattern() {
  return /\b(https?:\/\/|www\.|доставк\w*|відправк\w*|безкоштовн\w*|знижк\w*|акці\w*|розпродаж\w*|промокод\w*|найнижч\w*\s+цін\w*|конкурент\w*|купуйте\s+зараз)\b/iu;
}

function merchantProductDetailRows(product, generated) {
  const attributes = parseAttributes(product.attributes || generated.attributes || '');
  const facts = parseProductFacts(product.facts || '');
  const get = (attributeKeys, factKeys = attributeKeys) => {
    const fromAttributes = productAttributeValue(attributes, attributeKeys);
    if (fromAttributes) return fromAttributes;
    return productFact(facts, factKeys, '');
  };
  const rows = [
    ['Походження', 'Країна', localizeCountryNamesUa(get(['країна', 'походження']))],
    ['Походження', 'Регіон', get(['регіон', 'область', 'region'])],
    ['Походження', 'Ферма / станція', get(['ферма', 'станція', 'farm', 'station', 'producer', 'виробник'])],
    ['Походження', 'Сорт / різновид', get(['сорт', 'різновид', 'variety', 'cultivar'])],
    ['Лот', 'Обробка', get(['обробка', 'процес'])],
    ['Лот', 'Врожай', normalizeHarvestYear(get(['рік врожаю', 'врожай', 'урожай', 'harvest', 'crop year']))],
    ['Смак', 'Смакові ноти', get(['смак', 'профіль', 'смаковий профіль'])],
    ['Смак', 'Кислотність', get(['кислотність', 'acidity'])],
    ['Смак', 'Солодкість', get(['солодкість', 'sweetness'])],
    ['Смак', 'Тіло', get(['тіло', 'body'])],
    ['Смак', 'Післясмак', get(['післясмак', 'aftertaste'])],
    ['Смак', 'Фруктовість', get(['фруктовість', 'фруктовисть', 'fruitiness'])],
    ['Приготування', 'Рекомендація', cleanBrewingText(get(['рекомендація', 'заварювання', 'приготування', 'як готувати', 'метод приготування']))]
  ];
  return rows
    .map(([section, name, value]) => ({ section, name, value: String(value || '').trim() }))
    .filter(row => usefulProductText(row.value));
}

function merchantFeedChecksForProduct(product, generated, mode = state.productMode) {
  const feedTitle = merchantSafeMeta(product.name || generated.h1 || generated.title, 150);
  const descriptionText = merchantSafeDescription(merchantPlainTextFromHtml(product.description || generated.description || ''));
  const attributes = parseAttributes(product.attributes || generated.attributes || '');
  const details = merchantProductDetailRows(product, generated);
  const url = text(product.url);
  const hasPromoInTitle = merchantPromoPattern().test(feedTitle);
  const hasPromoInDescription = merchantPromoPattern().test(descriptionText);
  const sku = productAttributeValue(attributes, ['sku', 'артикул', 'код товару', 'модель', 'model', 'mpn']);
  const gtin = productAttributeValue(attributes, ['gtin', 'ean', 'upc', 'isbn']);
  const brand = productAttributeValue(attributes, ['бренд', 'brand', 'виробник']);
  const productType = productAttributeValue(attributes, ['категорія', 'product_type', 'google_product_category']);
  const existingProductHasIdentity = Boolean(url || sku || gtin);
  const criticalMissingLink = mode === 'existing' && !url;
  const checks = [
    {
      id: 'id',
      label: 'id',
      status: existingProductHasIdentity ? 'ok' : 'warn',
      detail: existingProductHasIdentity ? 'OpenCart product_id / SKU не треба вигадувати вручну.' : 'У фіді має бути стабільний OpenCart product_id або SKU.'
    },
    {
      id: 'title',
      label: 'title',
      status: feedTitle && feedTitle.length <= 150 && !hasPromoInTitle ? 'ok' : 'bad',
      detail: feedTitle ? `${feedTitle.length}/150 символів. Кандидат: ${feedTitle}` : 'Потрібна назва товару без промо, ціни й доставки.'
    },
    {
      id: 'description',
      label: 'description',
      status: descriptionText && descriptionText.length <= 5000 && !hasPromoInDescription ? 'ok' : 'bad',
      detail: descriptionText ? `${descriptionText.length}/5000 символів після очищення HTML і feed-exclude блоків.` : 'Потрібен опис товару, який збігається з landing page.'
    },
    {
      id: 'ai_disclosure',
      label: 'structured_title / structured_description',
      status: 'warn',
      detail: 'Якщо цей title/description іде у фід як AI-generated без ручної редактури, Google очікує structured_* з digital_source_type trained_algorithmic_media.'
    },
    {
      id: 'link',
      label: 'link',
      status: criticalMissingLink ? 'bad' : url ? 'ok' : 'warn',
      detail: url ? 'Landing page товару є.' : 'Для нового товару link має зʼявитись після створення в OpenCart.'
    },
    {
      id: 'image_link',
      label: 'image_link',
      status: 'warn',
      detail: 'Має брати головне фото з OpenCart-фіда; тут перевіряємо, що контент не ламає товар.'
    },
    {
      id: 'availability',
      label: 'availability',
      status: 'warn',
      detail: 'Має йти зі складу OpenCart: in_stock / out_of_stock / preorder.'
    },
    {
      id: 'price',
      label: 'price',
      status: 'warn',
      detail: 'Має йти з OpenCart з валютою UAH і збігатися з landing page.'
    },
    {
      id: 'brand',
      label: 'brand',
      status: brand ? 'ok' : 'warn',
      detail: brand ? `Бренд: ${brand}` : 'Для нового товару Google очікує brand, якщо він існує. Для власного обсмаження можна передавати Mercato.'
    },
    {
      id: 'gtin_mpn',
      label: 'gtin/mpn/identifier_exists',
      status: gtin || sku ? 'ok' : 'warn',
      detail: gtin ? `GTIN: ${gtin}` : sku ? `MPN/SKU: ${sku}` : 'Якщо GTIN немає, фід має передати MPN/SKU або identifier_exists=no.'
    },
    {
      id: 'condition',
      label: 'condition',
      status: 'ok',
      detail: 'Для кави/чаю очікуване значення: new.'
    },
    {
      id: 'product_type',
      label: 'google_product_category / product_type',
      status: productType || product.type ? 'ok' : 'warn',
      detail: productType || product.type ? `Категорійний сигнал: ${productType || product.type}` : 'Фід має передати категорію магазину або Google product category.'
    },
    {
      id: 'product_detail',
      label: 'product_detail',
      status: details.length >= 5 ? 'ok' : 'warn',
      detail: details.length ? `${details.length} структурних деталей з фактів і OpenCart attributes.` : 'Додайте країну, регіон, обробку, врожай, смак або SKU.'
    }
  ];
  return {
    title: feedTitle,
    descriptionText,
    details,
    checks,
    blockers: checks.filter(check => check.status === 'bad')
  };
}

function renderMerchantFeedCheck(product, generated) {
  const report = merchantFeedChecksForProduct(product, generated);
  const okCount = report.checks.filter(check => check.status === 'ok').length;
  const warnCount = report.checks.filter(check => check.status === 'warn').length;
  const badCount = report.checks.filter(check => check.status === 'bad').length;
  const detailPreview = report.details.slice(0, 10);
  return `<section class="merchant-check" id="merchantFeedCheck">
    <div class="section-head">
      <div>
        <p class="section-kicker">Google Merchant feed check</p>
        <h2>Що піде у фід</h2>
        <p>Перевірка за офіційними атрибутами Google: опис чиститься від HTML-блоків data-merchant-feed-exclude, URL, промо, доставки і внутрішніх посилань.</p>
      </div>
      <div class="merchant-score">
        <span class="status-pill ${badCount ? 'bad' : warnCount ? 'warn' : 'ok'}">${badCount ? 'є блокери' : warnCount ? 'є ручні поля' : 'готово'}</span>
        <strong>${okCount}/${report.checks.length}</strong>
      </div>
    </div>
    <div class="merchant-check-grid">
      ${report.checks.map(check => `<article class="merchant-check-item ${check.status}">
        <span class="status-pill ${check.status === 'bad' ? 'bad' : check.status === 'warn' ? 'warn' : 'ok'}">${check.status === 'bad' ? 'fix' : check.status === 'warn' ? 'manual' : 'ok'}</span>
        <strong>${escapeHtml(check.label)}</strong>
        <p>${escapeHtml(check.detail)}</p>
      </article>`).join('')}
    </div>
    <div class="merchant-feed-text">
      <strong>Feed description preview</strong>
      <p>${escapeHtml(report.descriptionText.slice(0, 460) || 'Опис ще не згенеровано.')}${report.descriptionText.length > 460 ? '…' : ''}</p>
    </div>
    <div class="merchant-details">
      <strong>product_detail candidates</strong>
      ${detailPreview.length ? `<div class="merchant-detail-list">${detailPreview.map(row => `<span><b>${escapeHtml(row.section)}</b> / ${escapeHtml(row.name)}: ${escapeHtml(row.value)}</span>`).join('')}</div>` : '<p>Поки немає структурних деталей.</p>'}
    </div>
  </section>`;
}

function productAttributesFromDraft(factsText, profile, harvestYear, brew = '') {
  const seen = new Set();
  const rows = String(factsText || '')
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => {
      const [rawKey, ...rest] = line.split(':');
      const key = String(rawKey || '').trim().toLowerCase();
      const value = rest.join(':').trim();
      if (!key) return false;
      if ((key.includes('рекомендац') || key.includes('завар') || key.includes('пригот')) && !cleanBrewingText(value)) return false;
      seen.add(key);
      return true;
    })
    .map(line => localizeCountryNamesUa(line.includes(':') ? line : `Факт: ${line}`));
  for (const [key, value] of Object.entries(profile || {})) {
    if (!seen.has(key.toLowerCase())) rows.push(`${key}: ${value}`);
  }
  if (![...seen].some(key => /рекомендац|завар|пригот/iu.test(key)) && cleanBrewingText(brew)) {
    rows.push(`Рекомендація: ${cleanBrewingText(brew)}`);
  }
  if (harvestYear && ![...seen].some(key => /рік\s+врожаю|врожай|урожай|harvest|crop\s+year/iu.test(key))) {
    rows.push(`Рік врожаю: ${harvestYear}`);
  }
  return rows.join('\n');
}

function productDescriptionSectionTitle(label) {
  return `<div style="font-size:18px;font-weight:700;color:#1f2937;margin:0 0 10px;padding:0 0 8px;border-bottom:1px solid #eef2f7;">${escapeHtml(label)}</div>`;
}

function productDescriptionSectionBlock(label, body, tone = '') {
  const background = tone === 'warm' ? '#fffdf8' : '#ffffff';
  return `<section style="border:1px solid #e5e7eb;border-radius:16px;background:${background};padding:16px 18px;margin:0 0 18px;box-shadow:0 1px 0 rgba(15,23,42,.03);">
    ${productDescriptionSectionTitle(label)}
    <div style="display:grid;gap:10px;">${body}</div>
  </section>`;
}

function productTasteChipsHtml(notes = [], fallback = '') {
  const clean = notes.length ? notes : splitTasteNotesForDraft(fallback);
  if (!clean.length) return '';
  return `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px;">${clean.map(note => `<span style="display:inline-flex;align-items:center;border:1px solid #eadfd6;background:#fffaf4;border-radius:999px;padding:5px 10px;color:#6b4a33;font-size:14px;font-weight:700;">${escapeHtml(note)}</span> `).join('')}</div>`;
}

function uniqueProductValues(values = []) {
  const seen = new Set();
  return values
    .map(value => String(value || '').replace(/\s+/g, ' ').trim())
    .filter(usefulProductText)
    .filter(value => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function productLotRowsHtml(rows = []) {
  const clean = rows.filter(([, value]) => usefulProductText(value));
  if (!clean.length) return '<p style="margin:0;color:#4b5563;">Додайте країну, регіон, обробку, сорт або врожай у факти товару, щоб картка була повнішою.</p>';
  return `<div style="display:grid;gap:0;border:1px solid #eef2f7;border-radius:12px;overflow:hidden;background:#ffffff;">
    ${clean.map(([label, value], index) => `<div style="display:grid;grid-template-columns:minmax(120px,170px) 1fr;gap:12px;${index < clean.length - 1 ? 'border-bottom:1px solid #eef2f7;' : ''}padding:11px 12px;">
      <strong style="color:#1f2937;">${escapeHtml(label)}</strong>
      <span style="color:#4b5563;">${escapeHtml(value)}</span>
    </div>`).join('')}
  </div>`;
}

function productLotContextHtml({ kind, country, region, farm, variety, processing, harvestYear }) {
  const context = [];
  const countryPart = usefulProductText(country) ? ` з країни ${country}` : '';
  const realProcessing = usefulProductText(processing) && !isProductFormatProcessing(processing);
  const hasSpecificLotDetail = usefulProductText(farm) || usefulProductText(variety) || realProcessing;
  if (!hasSpecificLotDetail) return '';
  if (usefulProductText(region) && usefulProductText(farm)) {
    context.push(`${farm}, ${region}${countryPart ? ` (${country})` : ''} — конкретне походження цього лота. Так покупцю легше відрізнити його від інших позицій у каталозі.`);
  } else if (usefulProductText(farm)) {
    context.push(`${farm}${countryPart} — походження цієї партії. Цей факт варто залишити в картці, якщо наступна поставка буде з іншої станції або ферми.`);
  } else if (usefulProductText(region)) {
    if (usefulProductText(variety) || realProcessing) {
      context.push(`${region}${countryPart} — регіон походження цього лота. Разом з обробкою або сортом він допомагає зрозуміти, чому партія відрізняється від іншої кави з тієї самої країни.`);
    }
  }
  if (usefulProductText(variety)) {
    context.push(`Сорт / різновид ${variety} має сенс показувати поруч з обробкою та врожаєм: окремо він не пояснює весь смак, але уточнює характер лота.`);
  }
  if (realProcessing && usefulProductText(harvestYear)) {
    context.push(`Обробка ${processing} і врожай ${harvestYear} — факти партії, які можуть змінитися в наступній поставці.`);
  } else if (realProcessing) {
    context.push(`Обробка ${processing} впливає на чистоту, солодкість, тіло й фруктовість, тому її варто показувати окремо від смакових нот.`);
  } else if (usefulProductText(harvestYear) && (usefulProductText(farm) || usefulProductText(variety))) {
    context.push(`Врожай ${harvestYear} варто тримати поруч із походженням: наступна партія може мати інший рік і потребувати оновлення опису.`);
  }
  if (!context.length) return '';
  return `<div style="border:1px solid #eef2f7;border-radius:12px;background:#fbfdff;padding:13px 15px;color:#4b5563;">
    <strong style="display:block;color:#1f2937;margin:0 0 6px;">Деталі лота</strong>
    ${context.slice(0, 3).map(line => `<p style="margin:0 0 8px;">${escapeHtml(line)}</p>`).join('').replace(/<p style="margin:0 0 8px;">([^]*?)<\/p>$/u, '<p style="margin:0;">$1</p>')}
  </div>`;
}

function productDraftDescriptionHtml({ name, kind, taste, notes, country, region, farm, variety, processing, originLine, harvestYear, processingInfo, fit, brew, profile, variant }) {
  const flavorText = humanList(notes) || taste;
  const tasteSentence = tasteSentenceForProduct(kind, notes, taste);
  const experienceLine = tasteExperienceLine(kind, notes, taste);
  const lotPhrase = uniqueProductValues([country, farm, region]).join(', ');
  const productKindText = kind === 'кава' ? 'кава в зернах' : kind;
  const lotLine = lotPhrase ? `Походження: ${lotPhrase}. ` : '';
  const brewShort = cleanBrewingText(brew).split(/\s*,\s*|\s*;\s*/).filter(Boolean).slice(0, 4).join(', ');
  const dailyUseLine = kind === 'кава'
    ? `Її зручно брати для щоденного приготування${brewShort ? `: ${brewShort}` : ' вдома'}.`
    : kind === 'чай'
      ? 'Це позиція для спокійного заварювання, де важливі чистий аромат, мʼякість настою і контроль часу.'
      : kind === 'набір'
        ? 'Це готовий формат для дегустації, подарунка або швидкого знайомства з кількома позиціями.'
        : 'Це товар для щоденного використання, де важливо розуміти формат, сценарій і очікуваний результат.';
  const formatHelp = isProductFormatProcessing(processing)
    ? 'Формат у зернах дає змогу змолоти каву під свій метод і не привʼязуватися до одного рецепта.'
    : kind === 'кава'
      ? 'Орієнтуйтесь на свій метод приготування і коригуйте помел, якщо чашка виходить різкою або водянистою.'
      : 'Орієнтуйтесь на свій звичний сценарій і коригуйте кількість продукту, температуру або час.';
  const harvestHelp = harvestYear ? `Врожай ${harvestYear} зазначений у характеристиках нижче.` : '';
  const quickIntroOptions = [
    `${name} — ${productKindText}${country ? ` з ${country}` : ''}${region ? `, регіон ${region}` : ''}. ${dailyUseLine} ${formatHelp}`,
    `${name} підійде ${fit ? fit.replace(/^тим(?=[\s,])/iu, 'тим') : 'для щоденного приготування вдома'}. ${dailyUseLine} ${formatHelp}`,
    `${name}. ${dailyUseLine} ${formatHelp} ${lotLine}${harvestHelp}`
  ];
  const quickIntro = merchantSafeDescription(quickIntroOptions[variant]);
  const originCard = originLine
    ? `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:13px 15px;background:#ffffff;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#8a5a35;font-weight:700;margin-bottom:5px;">Походження</div><div style="color:#374151;">${escapeHtml(originLine)}</div></div>`
    : '';
  const harvestCard = harvestYear
    ? `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:13px 15px;background:#ffffff;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#8a5a35;font-weight:700;margin-bottom:5px;">Врожай</div><div style="color:#374151;">${escapeHtml(harvestYear)}</div></div>`
    : '';
  const roastLine = kind === 'кава'
    ? 'Обсмаження під замовлення на Air Roast System допомагає зберегти чистий аромат і передбачуваний смак у чашці.'
    : kind === 'чай'
      ? 'Акуратне фасування допомагає зберегти аромат, чистоту настою і стабільний смак у щоденному заварюванні.'
      : 'Формат зібраний так, щоб його було легко використати без довгих пояснень і зайвого вибору.';
  const prepareTitle = kind === 'кава' ? 'Як готувати' : kind === 'чай' ? 'Як заварювати' : 'Як використовувати';
  const thirdInfoTitle = kind === 'кава' ? 'Свіжість' : kind === 'чай' ? 'Пакування' : 'Формат';
  const brewAdvice = practicalBrewAdvice(kind, brew);
  const faqSecondQuestion = kind === 'чай' ? 'Чи буде терпкість?' : kind === 'набір' ? 'Чи підійде на подарунок?' : 'Чи буде кислинка або гірчинка?';
  const faqSecondAnswer = kind === 'чай'
    ? 'Терпкість залежить від температури води, кількості чаю і часу настоювання. Починайте мʼякше, а потім підсилюйте рецепт під свій смак.'
    : kind === 'набір'
      ? 'Так, якщо потрібен зрозумілий формат без вибору кожної позиції окремо. Перед замовленням варто перевірити склад набору.'
      : /цитрус|ягод|винн|смород|мали|вишн|грейп|апельс|лимон|фрукт|яблук|бергамот|білий чай/i.test(taste)
        ? 'У профілі може бути жива фруктова кислотність, але без грубої різкості при коректному помелі й рецепті.'
        : /шокол|горіх|карам|какао|мед|сухофрукт|фінік|родзин/i.test(taste)
          ? 'Профіль має бути мʼякшим і солодшим, з менш вираженою кислотністю та комфортним післясмаком.'
          : 'Кислотність і гірчинка залежать від помелу, температури й екстракції. Мʼякший рецепт робить чашку спокійнішою.';
  const profileHtml = Object.entries(profile || {})
    .map(([label, value]) => {
      const score = clampTasteScore(value, 5);
      return `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:11px 13px;background:#ffffff;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;color:#1f2937;font-weight:700;"><span>${escapeHtml(label)}</span><span style="display:inline-flex;align-items:center;justify-content:center;min-width:52px;border-radius:999px;background:#f8fafc;color:#374151;font-size:14px;">${escapeHtml(score)}/10</span></div>
      </div>`;
    })
    .join('');
  const tasteChipsHtml = productTasteChipsHtml(notes, flavorText);
  const lotSection = productDescriptionSectionBlock('Походження і лот', `
    ${productLotRowsHtml([
      ['Країна', country],
      ['Регіон', region],
      ['Ферма / станція', farm],
      ['Сорт / різновид', variety],
      productLotProcessingRow(processing),
      ['Врожай', harvestYear]
    ].filter(Boolean))}
    ${productLotContextHtml({ kind, country, region, farm, variety, processing, harvestYear })}
  `);
  const tasteSection = productDescriptionSectionBlock('Смак у чашці', `
    ${tasteChipsHtml}
    <p style="margin:0;color:#374151;">${escapeHtml(experienceLine)}</p>
  `, 'warm');
  const profileSection = productDescriptionSectionBlock('Профіль смаку', `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">${profileHtml}</div>
  `);
  const infoSection = productDescriptionSectionBlock('Що важливо знати', `
    <div style="display:grid;gap:0;border:1px solid #eef2f7;border-radius:12px;overflow:hidden;background:#ffffff;">
      <div style="display:grid;grid-template-columns:minmax(110px,160px) 1fr;gap:12px;border-bottom:1px solid #eef2f7;padding:11px 12px;"><strong style="color:#1f2937;">${escapeHtml(processingInfo.title)}</strong><span style="color:#4b5563;">${escapeHtml(processingInfo.line)}</span></div>
      <div style="display:grid;grid-template-columns:minmax(110px,160px) 1fr;gap:12px;padding:11px 12px;"><strong style="color:#1f2937;">${escapeHtml(thirdInfoTitle)}</strong><span style="color:#4b5563;">${escapeHtml(roastLine)}</span></div>
    </div>
  `);
  const brewSection = productDescriptionSectionBlock('Як обрати і заварювати', `
    <p style="margin:0;color:#374151;">${escapeHtml(brewAdvice)}</p>
    <p style="margin:0;color:#4b5563;">${escapeHtml('Орієнтуйтесь на смак, обробку і свій звичний сценарій: ранкова чашка, фільтр, гейзер, френч-прес або спокійне приготування вдома.')}</p>
  `);
  const faqSection = productDescriptionSectionBlock('Питання перед покупкою', `
    <div style="display:grid;gap:10px;">
      <div style="border:1px solid #eef2f7;border-radius:12px;padding:13px 15px;background:#ffffff;"><strong>Кому найкраще підійде?</strong><br><span style="color:#4b5563;">${escapeHtml(`Найкраще підійде ${fit}.`)}</span></div>
      <div style="border:1px solid #eef2f7;border-radius:12px;padding:13px 15px;background:#ffffff;"><strong>${escapeHtml(faqSecondQuestion)}</strong><br><span style="color:#4b5563;">${escapeHtml(faqSecondAnswer)}</span></div>
      <div style="border:1px solid #eef2f7;border-radius:12px;padding:13px 15px;background:#ffffff;"><strong>Як зберігати?</strong><br><span style="color:#4b5563;">Тримайте упаковку щільно закритою, подалі від сонця, вологи і сильних запахів. Так аромат і смак довше лишаються чистими.</span></div>
    </div>
  `);

  return `<div data-mercato-description="v2" style="font-family:Inter,Arial,sans-serif;color:#1f2937;line-height:1.6;font-size:16px;">
  <div style="border:1px solid #f3ddc8;background:#fffaf4;border-radius:14px;padding:18px 20px;margin:0 0 22px;">
    <div style="font-size:18px;font-weight:700;margin:0 0 8px;color:#1f2937;">Швидко про товар</div>
    <p style="margin:0;color:#374151;">${escapeHtml(quickIntro)}</p>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:0 0 24px;">
    ${originCard}
    ${harvestCard}
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:13px 15px;background:#ffffff;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#8a5a35;font-weight:700;margin-bottom:5px;">Кому підійде</div><div style="color:#374151;">${escapeHtml(fit)}</div></div>
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:13px 15px;background:#ffffff;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#8a5a35;font-weight:700;margin-bottom:5px;">${escapeHtml(prepareTitle)}</div><div style="color:#374151;">${escapeHtml(brew)}</div></div>
  </div>

  ${lotSection}
  ${tasteSection}
  ${profileSection}
  ${infoSection}
  ${brewSection}
  ${faqSection}
  ${productInternalLinksHtmlForDraft(kind)}
</div>`;
}

function productDraft() {
  const p = state.product;
  const name = cleanProductDisplayName(text(p.name, 'Товар')) || 'Товар';
  const factsText = String(p.facts || '');
  const facts = parseProductFacts(factsText);
  const kind = productKindForDraft(p.type, name);
  const taste = productFact(facts, ['смак', 'профіль', 'смаковий профіль'], kind === 'чай' ? 'чистий аромат, мʼякий настій і приємний післясмак' : 'збалансований профіль, чисте тіло і зрозумілий післясмак');
  const country = localizeCountryNamesUa(productFact(facts, ['країна', 'країна походження', 'походження']));
  const region = productFact(facts, ['регіон', 'область', 'region', 'area', 'контекст']);
  const farm = productFact(facts, ['ферма', 'станція', 'маєток', 'farm', 'station', 'producer', 'виробник']);
  const variety = productFact(facts, ['сорт', 'різновид', 'variety', 'cultivar', 'ботанічний сорт']);
  const processing = productFact(facts, ['обробка', 'процес', 'тип']);
  const harvestYear = normalizeHarvestYear(productFact(facts, ['рік врожаю', 'врожай', 'урожай', 'harvest', 'crop year']));
  const fitFact = productFact(facts, ['кому підійде', 'для кого', 'аудиторія']);
  const recommendation = productFact(facts, ['рекомендація', 'заварювання', 'приготування', 'як готувати', 'метод приготування']);
  const notes = splitTasteNotesForDraft(taste);
  const profile = tasteProfileForDraft(facts, { kind, name, taste, country, region, processing });
  const fit = usefulProductText(fitFact) ? fitFact : fitLineForProduct(kind, taste);
  const brew = brewLineForProduct(kind, recommendation);
  const originLine = uniqueProductValues([country, farm, region]).join(', ');
  const harvestSentence = harvestYear ? `Врожай ${harvestYear}.` : '';
  const processingInfo = processingInfoForDraft(kind, processing);
  const title = `${name} купити | Mercato`;
  const meta = merchantSafeMeta(`${name}: ${taste}. ${originLine ? `Походження: ${originLine}. ` : ''}${harvestYear ? `Врожай ${harvestYear}. ` : ''}${kind === 'кава' ? 'Свіжа обсмажка під замовлення.' : 'Акуратна підготовка товару.'}`);
  const variant = productDraftVariant(`${name}|${taste}|${originLine}|${processing}`, 3);
  const description = productDraftDescriptionHtml({
    name,
    kind,
    taste,
    notes,
    country,
    region,
    farm,
    variety,
    processing,
    originLine,
    harvestYear,
    harvestSentence,
    processingInfo,
    fit,
    brew,
    profile,
    variant
  });
  return {
    title,
    meta,
    h1: name,
    description,
    attributes: productAttributesFromDraft(factsText, profile, harvestYear, brew)
  };
}

function seoDate(value) {
  if (!value) return 'ще не запускався';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('uk-UA');
}

function seoPriorityLabel(priority = '') {
  if (priority === 'critical') return 'Критично';
  if (priority === 'important') return 'Важливо';
  return 'Можна пізніше';
}

function seoPriorityTone(priority = '') {
  if (priority === 'critical') return 'bad';
  if (priority === 'important') return 'warn';
  return 'ok';
}

function seoCurrentProfile() {
  const data = seoCenterData();
  return asArray(data.profiles).find(profile => profile.id === state.seoCenter.siteId)
    || data.profile
    || asArray(data.profiles)[0]
    || { id: 'mercato', name: 'Mercato', url: 'https://mercato.com.ua', focus: [], priorities: {}, weeklyChecks: [] };
}

function seoGoogleServiceReady(google = {}, serviceId = '') {
  return Boolean(google?.services?.[serviceId]?.available);
}

function seoGoogleCoreReady(google = {}) {
  return seoGoogleServiceReady(google, 'gsc') && seoGoogleServiceReady(google, 'ga4');
}

function seoGooglePerformanceReady(google = {}) {
  return seoGoogleServiceReady(google, 'psi') && seoGoogleServiceReady(google, 'crux');
}

function seoGoogleMetricValue(google = {}) {
  if (seoGoogleCoreReady(google) && seoGooglePerformanceReady(google)) return 'Повністю';
  if (seoGoogleCoreReady(google)) return 'GSC + GA4';
  if (google.configured) return 'Частково';
  return 'Не підключено';
}

function seoGoogleMetricDetail(google = {}) {
  if (seoGoogleCoreReady(google) && !seoGooglePerformanceReady(google)) {
    return 'бракує PageSpeed / CrUX API key';
  }
  return google.description || 'GSC / GA4 / CrUX';
}

function seoGoogleHeading(google = {}) {
  if (seoGoogleCoreReady(google) && seoGooglePerformanceReady(google)) return 'Google API підключені';
  if (seoGoogleCoreReady(google)) return 'GSC і GA4 підключені';
  if (google.configured) return 'Google API підключені частково';
  return 'Додайте реальні дані Google';
}

function seoGooglePerformanceService(google = {}) {
  const psi = google.services?.psi || null;
  const crux = google.services?.crux || null;
  if (psi?.available && crux?.available) {
    return { available: true, method: 'api_key', service: 'PageSpeed + CrUX' };
  }
  return psi || crux || {
    available: false,
    error: 'Потрібен GOOGLE_API_KEY для PageSpeed Insights і Chrome UX Report.'
  };
}

function seoPercent(value) {
  const numeric = Number(value || 0);
  return `${Number.isFinite(numeric) ? numeric.toLocaleString('uk', { maximumFractionDigits: 2 }) : '0'}%`;
}

function seoMoney(value, currency = 'грн') {
  const numeric = Number(value || 0);
  return `${numeric.toLocaleString('uk', { maximumFractionDigits: 2 })} ${currency}`;
}

function seoPath(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  try {
    const url = new URL(raw, 'https://mercato.com.ua');
    return url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '');
  } catch {
    return raw.replace(/^https?:\/\/[^/]+/i, '') || raw;
  }
}

function seoGoogleSnapshot(data = {}) {
  const googleData = data.googleDataStatus || {};
  const snapshot = googleData.snapshot || {};
  const cacheMetrics = googleData.cache?.metrics || {};
  const gsc = snapshot.gsc || {};
  const ga4 = snapshot.ga4 || {};
  return {
    available: Boolean(googleData.available || snapshot.gsc || cacheMetrics.gsc_snapshot),
    snapshotAt: snapshot.snapshotAt || googleData.cache?.analyzed_at || '',
    gsc: {
      rowCount: gsc.rowCount ?? cacheMetrics.gsc_snapshot?.rows ?? 0,
      totals: {
        clicks: gsc.totals?.clicks ?? cacheMetrics.gsc_snapshot?.clicks ?? 0,
        impressions: gsc.totals?.impressions ?? cacheMetrics.gsc_snapshot?.impressions ?? 0,
        ctr: gsc.totals?.ctr ?? 0
      },
      dateRange: gsc.dateRange || {
        start: String(cacheMetrics.gsc_snapshot?.date_range || '').split(' to ')[0] || '',
        end: String(cacheMetrics.gsc_snapshot?.date_range || '').split(' to ')[1] || ''
      },
      topPages: asArray(gsc.topPages)
    },
    ga4: {
      totalOrganicSessions: ga4.totalOrganicSessions ?? cacheMetrics.ga4_snapshot?.organic_sessions ?? 0,
      dateRange: ga4.dateRange || {
        start: String(cacheMetrics.ga4_snapshot?.date_range || '').split(' to ')[0] || '',
        end: String(cacheMetrics.ga4_snapshot?.date_range || '').split(' to ')[1] || ''
      },
      topPages: asArray(ga4.topPages)
    },
    missing: asArray(snapshot.stillMissing || googleData.cache?.limitations)
  };
}

function seoCategoryLabel(key = '') {
  return ({
    technical: 'Техніка',
    content: 'Контент',
    on_page: 'On-page',
    schema: 'Schema',
    performance: 'Швидкість',
    geo: 'AI Search / GEO',
    images: 'Зображення',
    indexation: 'Індексація',
    merchant: 'Merchant'
  })[key] || key;
}

function seoScoreMeaning(score = 0) {
  const value = Number(score || 0);
  if (value >= 80) {
    return {
      tone: 'ok',
      title: 'SEO-основа здорова',
      body: 'Можна більше уваги давати росту: CTR, категоріям, Merchant і конверсії.'
    };
  }
  if (value >= 60) {
    return {
      tone: 'warn',
      title: 'Є база, але ріст гальмується',
      body: 'Потрібно закрити найслабші категорії перед масштабуванням реклами й контенту.'
    };
  }
  return {
    tone: 'bad',
    title: '50/100 = сайт індексується, але не готовий до агресивного росту',
    body: 'Найперше виправляємо те, що впливає на покази, кліки, Merchant і покупки: швидкість, schema, content/on-page.'
  };
}

function seoWeakestCategories(latest = null) {
  const scores = latest?.summary?.categoryScores || {};
  return Object.entries(scores)
    .map(([key, value]) => ({ key, label: seoCategoryLabel(key), value: Number(value || 0) }))
    .sort((left, right) => left.value - right.value)
    .slice(0, 4);
}

function seoFixQueueItems(fixQueue = {}) {
  const direct = asArray(fixQueue.items);
  const split = [...asArray(fixQueue.proposals), ...asArray(fixQueue.tasks)];
  return split.length ? split : direct;
}

function seoDraftableActions(fixQueue = {}) {
  return seoFixQueueItems(fixQueue)
    .filter(seoCanDraftAction);
}

function seoCanDraftAction(action = {}) {
  const supportedCategories = ['technical', 'performance', 'indexation', 'schema', 'geo', 'content', 'internal_links', 'on_page'];
  const supportedExecutions = ['manual', 'editor_after_evidence', 'code_patch_after_approval', 'file_editor_after_review'];
  if (!action || !action.id) return false;
  if (['verification_pending', 'verification_review'].includes(action.status)) return false;
  if (action.execution === 'automatic_after_approval' || action.execution === 'capability_only') return false;
  if (!supportedExecutions.includes(action.execution || 'manual')) return false;
  if (!supportedCategories.includes(action.category || '')) return false;
  if (seoIsLowConversionTrustAction(action)) return false;
  if (['content', 'internal_links'].includes(action.category || '') && seoIsUtilitySeoTarget(action.target)) return false;
  const hasEntityReadback = Boolean(action.entityType && action.entityId);
  const hasExplicitFileTarget = Boolean(action.file || /(?:robots\.txt|llms\.txt|\.htaccess|catalog\/|system\/)/i.test(String(action.target || '')));
  if (action.auditJobId && !hasEntityReadback && !hasExplicitFileTarget) return false;
  return true;
}

function seoIsUtilitySeoTarget(target = '') {
  const normalized = seoNormalizedUrl(target);
  return /\/(?:a-telegram|bonusna-prohrama|obgortka|privacy|konfidencial|oplata|dostavka|return|checkout|cart|account|affiliate|voucher|coupon|kupon)(?:$|\/)/i.test(normalized);
}

function seoIsLowConversionTrustAction(action = {}) {
  const issue = String(action.issue || '').toLowerCase();
  const target = seoNormalizedUrl(action.target || '');
  return (
    ['content', 'geo'].includes(action.category || '')
    && /(author|expert|e-e-a-t|attribution|автор|експерт)/i.test(issue)
    && (
      target === 'https://mercato.com.ua/'
      || target === 'https://mercato.com.ua'
      || /footer|header|common\//i.test(String(action.target || ''))
    )
  );
}

function seoNormalizedUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, 'https://mercato.com.ua');
    return `${url.origin}${url.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

function seoDraftActionScore(action = {}, data = {}) {
  const priorityScore = { critical: 1000, important: 600, later: 100 }[action.priority] || 0;
  const target = seoNormalizedUrl(action.target);
  const snapshot = seoGoogleSnapshot(data);
  let score = priorityScore;
  asArray(snapshot.gsc.topPages).forEach((row, index) => {
    if (seoNormalizedUrl(row.page || row.keys?.[0]) !== target) return;
    score += 650 - (index * 20);
    score += Number(row.clicks || 0) * 20;
    score += Number(row.impressions || 0) / 20;
    score += Math.max(0, 30 - Number(row.position || 30)) * 5;
  });
  asArray(snapshot.ga4.topPages).forEach((row, index) => {
    const landing = row.landing_page || row.page || '';
    if (seoNormalizedUrl(landing.startsWith('http') ? landing : `https://mercato.com.ua${landing}`) !== target) return;
    score += 500 - (index * 20);
    score += Number(row.sessions || 0) * 25;
    score += Number(row.pageviews || 0) * 3;
    score += Number(row.engagement_rate || 0);
  });
  if (action.entityType === 'category') score += 420;
  if (action.entityType === 'product') score += 260;
  if (action.entityType === 'information') score += 60;
  if (/\/(?:arabika-kava|blendy-kava|kava-v-zernah|kava-nabory|kava-dnipro|kava-korporativny|kupit-kava|kavyarnya)/i.test(target)) score += 420;
  if (/\/(?:kava-v-zernah|kava-nabory|kava-dnipro|kava-korporativny|kupit-kava|kavyarnya)/i.test(target)) score += 180;
  if (target === 'https://mercato.com.ua/' || target === 'https://mercato.com.ua') score += 220;
  if (action.category === 'internal_links') score += 360;
  if (action.category === 'indexation') score += 280;
  if (action.category === 'performance') score += 220;
  if (action.category === 'content') score += 180;
  if (action.category === 'technical') score += 90;
  if (action.category === 'geo') score += 40;
  if (/llms\.txt|question-based heading|self-contained answer block|gptbot|claudebot/i.test(String(action.issue || ''))) score -= 260;
  if (seoIsUtilitySeoTarget(target)) score -= 1200;
  return score;
}

function seoFirstDraftAction(fixQueue = {}, data = {}) {
  const priorityOrder = { critical: 0, important: 1, later: 2 };
  return seoDraftableActions(fixQueue)
    .sort((left, right) =>
      seoDraftActionScore(right, data) - seoDraftActionScore(left, data)
      ||
      (priorityOrder[left.priority] ?? 9) - (priorityOrder[right.priority] ?? 9)
      || String(left.target || '').localeCompare(String(right.target || ''))
    )[0] || null;
}

const SEO_DRAFT_CATEGORY_MINIMUMS = {
  internal_links: 4,
  content: 3,
  schema: 2,
  indexation: 2,
  technical: 2,
  performance: 2,
  geo: 1,
  on_page: 2,
  other: 2
};
const SEO_DRAFT_CATEGORY_RATIOS = {
  internal_links: 0.5,
  content: 0.28,
  schema: 0.18,
  indexation: 0.18,
  technical: 0.18,
  performance: 0.18,
  geo: 0.1,
  on_page: 0.18,
  other: 0.12
};

function seoDraftCategoryLimit(category = 'other', limit = 10) {
  const normalizedCategory = String(category || 'other');
  const safeLimit = Math.max(1, Math.min(Number(limit || 10), 50));
  const minimum = SEO_DRAFT_CATEGORY_MINIMUMS[normalizedCategory] || SEO_DRAFT_CATEGORY_MINIMUMS.other;
  const ratio = SEO_DRAFT_CATEGORY_RATIOS[normalizedCategory] || SEO_DRAFT_CATEGORY_RATIOS.other;
  return Math.min(safeLimit, Math.max(minimum, Math.ceil(safeLimit * ratio)));
}

function seoDraftBatchActions(fixQueue = {}, data = {}, limit = 10) {
  const priorityOrder = { critical: 0, important: 1, later: 2 };
  const entityKeys = new Set();
  const categoryCounts = new Map();
  const selected = [];
  const candidates = seoDraftableActions(fixQueue)
    .filter(action => action.category !== 'images')
    .sort((left, right) =>
      seoDraftActionScore(right, data) - seoDraftActionScore(left, data)
      ||
      (priorityOrder[left.priority] ?? 9) - (priorityOrder[right.priority] ?? 9)
      || String(left.target || '').localeCompare(String(right.target || ''))
    );
  for (const action of candidates) {
    const key = action.entityType && action.entityId
      ? `${action.entityType}:${action.entityId}`
      : seoNormalizedUrl(action.target || action.id || '');
    if (entityKeys.has(key)) continue;
    const category = String(action.category || 'other');
    const cap = seoDraftCategoryLimit(category, limit);
    if ((categoryCounts.get(category) || 0) >= cap) continue;
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    entityKeys.add(key);
    selected.push(action);
    if (selected.length >= Number(limit || 10)) break;
  }
  return selected;
}

function seoMainNextStep({ latest, google, data, fixQueue, fixPreview, active } = {}) {
  const snapshot = seoGoogleSnapshot(data);
  const weakest = seoWeakestCategories(latest);
  const draftAction = seoFirstDraftAction(fixQueue, data);
  const draftCount = seoDraftableActions(fixQueue).length;
  const selectedBatchLimit = seoAgentBatchLimit();
  const batchDraftCount = seoDraftBatchActions(fixQueue, data, selectedBatchLimit).length;
  if (active) {
    return {
      label: 'Зараз',
      title: 'Дочекатися завершення аудиту',
      body: 'Сервер читає сайт read-only. Після завершення cockpit покаже конкретні наступні дії.',
      action: 'Оновити',
      seoAction: ''
    };
  }
  if (!seoGooglePerformanceReady(google)) {
    return {
      label: 'Блокує дані',
      title: 'Додати GOOGLE_API_KEY для PageSpeed / CrUX',
      body: 'GSC і GA4 вже працюють, але швидкість зараз оцінюється без Google field/lab даних. Це чому performance 35 виглядає як “сліпа зона”.',
      action: 'Відкрити доступи',
      seoAction: 'settings'
    };
  }
  if (fixPreview) {
    return {
      label: 'Очікує рішення',
      title: 'Перевірити preview і підтвердити або відхилити',
      body: 'Preview ще нічого не записав. Після approval агенти внесуть зміни чанками й зроблять readback.',
      action: 'Показати preview',
      seoAction: ''
    };
  }
  if (Number(fixQueue?.summary?.executable || 0) > 0) {
    return {
      label: 'Наступна дія',
      title: 'Підготувати batch тільки з точних SEO-змін',
      body: `${number(fixQueue.summary.executable)} змін можуть пройти через approval. Не генеруємо “SEO-сміття”, беремо тільки typed patches.`,
      action: 'Підготувати batch',
      seoAction: 'build-preview'
    };
  }
  if (draftAction) {
    return {
      label: 'Наступна дія',
      title: 'Дати агентам підготувати batch точних patch',
      body: `${number(draftCount)} задач не можна писати сліпо. Batch зараз візьме до ${number(Math.min(batchDraftCount || selectedBatchLimit, selectedBatchLimit))} комерційних сторінок: агент читає джерело, створює diff, і тільки після цього зʼявиться approval.`,
      action: 'Агенти підготують batch',
      agentDraftBatch: true
    };
  }
  if (Number(fixQueue?.summary?.verificationPending || 0) > 0) {
    return {
      label: 'Перевірка',
      title: 'Є зміни, що чекають повторного scan/readback',
      body: `${number(fixQueue.summary.verificationPending)} задачі вже були внесені або перевіряються. Якщо scan знову бачить проблему, система поверне їх у “open” і дозволить повторний preview.`,
      action: 'Перечитати контур',
      seoAction: 'control-scan'
    };
  }
  if (weakest.length) {
    return {
      label: 'Фокус',
      title: `Почати з ${weakest.map(item => item.label).join(' / ')}`,
      body: `Найслабші сигнали: ${weakest.map(item => `${item.label} ${number(item.value)}`).join(', ')}. Це пояснює score ${number(latest?.summary?.score || 0)}/100.`,
      action: 'Прочитати SEO-контур',
      seoAction: 'control-scan'
    };
  }
  if (!snapshot.available) {
    return {
      label: 'Немає даних',
      title: 'Підключення є, але snapshot ще не сформовано',
      body: 'Запустіть аудит або оновіть дані Google, щоб бачити кліки, покази, sessions і сторінки.',
      action: 'Запустити аудит',
      seoAction: 'audit'
    };
  }
  return {
    label: 'Нормальний порядок',
    title: 'Дивитися не на score, а на гроші: сторінки з показами, кліками і покупкою',
    body: 'GSC показує попит, GA4 — поведінку. Далі агенти готують зміни саме по сторінках, де є шанс отримати продажі.',
    action: 'Оновити',
    seoAction: ''
  };
}

function renderSeoDirectorCockpit({ data, profile, google, latest, fixQueue, fixPreview, active, adsPerformance } = {}) {
  const score = Number(latest?.summary?.score || data.googleDataStatus?.cache?.metrics?.latest_seo_score || 0);
  const meaning = seoScoreMeaning(score);
  const snapshot = seoGoogleSnapshot(data);
  const next = seoMainNextStep({ latest, google, data, fixQueue, fixPreview, active });
  const draftAction = seoFirstDraftAction(fixQueue, data);
  const selectedBatchLimit = seoAgentBatchLimit();
  const batchDraftCount = seoDraftBatchActions(fixQueue, data, selectedBatchLimit).length;
  const canBatchDraft = Boolean(batchDraftCount) && !active && !fixPreview;
  const ads = adsPerformance || {};
  const adsReady = Boolean(ads.ok);
  const adsLoop = conversionLoopSummary(ads);
  const adsLandingCount = adsLandingPages(ads).length;
  const topGsc = snapshot.gsc.topPages?.[0] || null;
  const topGa4 = snapshot.ga4.topPages?.[0] || null;
  return `<section class="card seo-director-cockpit">
    <div class="seo-cockpit-top">
      <div>
        <p class="section-kicker">SEO-директорський пульт · ${escapeHtml(profile.name || '')}</p>
        <h2>Що сталося і що робити далі</h2>
        <p>Тут не звіт заради звіту: score, органіка, реклама і наступна дія в одному місці.</p>
      </div>
      <div class="seo-top-actions">
        ${renderSeoBatchLimitControl()}
        <button class="button" type="button" data-seo-action="audit" ${active ? 'disabled' : ''}>Повний аудит</button>
        <button class="button secondary" type="button" data-seo-action="control-scan" ${active ? 'disabled' : ''}>Прочитати контур</button>
        ${fixPreview ? `<button class="button secondary" type="button" data-scroll-target="seoFixPreview">Перейти до preview</button>` : ''}
        <button class="button secondary" type="button" data-seo-action="build-preview" ${!Number(fixQueue?.summary?.executable || 0) || fixPreview || active ? 'disabled' : ''}>Підготувати точні зміни</button>
        <button class="button secondary" type="button" data-seo-agent-draft-batch="1" data-seo-agent-draft-limit="${attr(selectedBatchLimit)}" ${canBatchDraft ? '' : 'disabled'}>Підготувати ${number(Math.min(batchDraftCount || 0, selectedBatchLimit))} змін</button>
        <button class="button secondary" type="button" id="refreshSeoCenter">Оновити</button>
      </div>
    </div>
    <div class="seo-cockpit-grid">
      <article class="seo-score-card ${meaning.tone}">
        <span class="status-pill ${meaning.tone}">score</span>
        <strong>${score ? `${number(score)}/100` : '—'}</strong>
        <h3>${escapeHtml(meaning.title)}</h3>
        <p>${escapeHtml(meaning.body)}</p>
        ${seoWeakestCategories(latest).length ? `<div class="seo-chip-row">${seoWeakestCategories(latest).map(item => `<span class="tag ${item.value < 50 ? 'warn' : ''}">${escapeHtml(item.label)} ${number(item.value)}</span>`).join('')}</div>` : ''}
      </article>
      <article class="seo-next-card">
        <span class="status-pill warn">${escapeHtml(next.label)}</span>
        <h3>${escapeHtml(next.title)}</h3>
        <p>${escapeHtml(next.body)}</p>
        ${next.agentDraftBatch ? `<button class="button" type="button" data-seo-agent-draft-batch="1" data-seo-agent-draft-limit="${attr(selectedBatchLimit)}">${escapeHtml(next.action)}</button>` : ''}
        ${next.agentDraftActionId ? `<button class="button" type="button" data-seo-agent-draft="${attr(next.agentDraftActionId)}">${escapeHtml(next.action)}</button>` : ''}
        ${next.seoAction ? `<button class="button" type="button" data-seo-action="${attr(next.seoAction)}">${escapeHtml(next.action)}</button>` : ''}
      </article>
      <article class="seo-signal-card">
        <span class="status-pill ${snapshot.available ? 'ok' : 'warn'}">organic data</span>
        <h3>GSC + GA4 ${snapshot.available ? 'працюють' : 'ще без snapshot'}</h3>
        <p>${snapshot.gsc.totals.impressions ? `${number(snapshot.gsc.totals.clicks)} кліків · ${number(snapshot.gsc.totals.impressions)} показів · CTR ${seoPercent(snapshot.gsc.totals.ctr)}` : 'Немає витягнутих показів/кліків.'}</p>
        ${topGsc ? `<small>Найбільше кліків: ${escapeHtml(seoPath(topGsc.page))} · ${number(topGsc.clicks)} кліків</small>` : ''}
        ${topGa4 ? `<small>GA4 top landing: ${escapeHtml(topGa4.landing_page || topGa4.page || '')} · ${number(topGa4.sessions)} sessions</small>` : ''}
      </article>
      <article class="seo-signal-card">
        <span class="status-pill ${adsReady ? 'ok' : 'warn'}">Google Ads</span>
        <h3>${adsReady ? 'Реклама читається: клік → конверсія' : 'Реклама підключена не повністю або без метрик'}</h3>
        <p>${adsReady ? `${number(ads.totals?.clicks || 0)} кліків · ${number(ads.totals?.conversions || 0)} конверсій · CVR ${seoPercent(adsLoop.cvr)} · CPA ${adsLoop.cpa ? seoMoney(adsLoop.cpa) : '—'}` : escapeHtml(ads.error || 'Чекаю відповідь Google Ads API.')}</p>
        ${adsReady ? `<small>${number(adsLandingCount)} landing pages · ${seoMoney(ads.totals?.cost || 0)} · CTR ${seoPercent(ads.totals?.ctr || 0)} · ${escapeHtml(ads.dateRangeLabel || 'Останні 30 днів')}</small>` : ''}
      </article>
    </div>
  </section>`;
}

function renderSeoRankingTarget(target = {}) {
  const riskTone = target.engagementRisk === 'high' ? 'bad' : target.engagementRisk === 'medium' ? 'warn' : 'ok';
  const stageTone = target.stage === 'reach_first_page' ? 'warn' : target.stage === 'convert_top_traffic' ? 'bad' : 'ok';
  const auditTone = target.auditTone || (target.auditState === 'completed' ? 'ok' : target.auditState === 'failed' ? 'bad' : 'warn');
  const queue = target.queueSummary || {};
  const hasPatch = Number(queue.executable || 0) > 0;
  const hasDraft = Number(queue.draftable || 0) > 0;
  const running = target.auditState === 'running';
  const completed = target.auditState === 'completed';
  const failed = target.auditState === 'failed';
  const auditButtonLabel = running ? 'Аудит виконується' : completed ? 'Повторити аудит сторінки' : failed ? 'Перезапустити аудит' : 'Аудит цієї сторінки';
  const auditActions = asArray(target.auditActions).slice(0, 3);
  const nextSteps = asArray(target.ownerSteps).slice(0, 3);
  const draftLabels = {
    on_page: 'Підготувати title/meta/H1 diff',
    content: 'Підготувати description diff',
    internal_links: 'Підготувати internal links diff',
    technical: 'Підготувати technical file diff',
    indexation: 'Підготувати indexation diff',
    schema: 'Підготувати schema diff',
    performance: 'Підготувати performance diff',
    geo: 'Підготувати GEO diff'
  };
  const actionButton = hasPatch
    ? `<button class="button" type="button" data-seo-action="build-preview" data-seo-action-id="${attr(queue.firstExecutableActionId || '')}">Підготувати patch цієї сторінки</button>`
    : hasDraft
      ? `<button class="button secondary" type="button" data-seo-agent-draft="${attr(queue.firstDraftActionId || '')}">${escapeHtml(draftLabels[queue.firstDraftCategory] || 'Агент підготує diff')}</button>`
      : completed
        ? `<button class="button secondary" type="button" data-seo-action="control-scan">Перечитати SEO-контур</button>`
        : '';
  return `<article class="audit-action seo-ranking-target">
    <span class="status-pill ${stageTone}">${escapeHtml(target.label || 'ranking goal')}</span>
    <div>
      <div class="seo-agent-line">
        <strong>${escapeHtml(seoPath(target.url))}</strong>
        <span class="status-pill ${riskTone}">${escapeHtml(target.engagementRisk || 'conversion unknown')}</span>
        <span class="status-pill ${auditTone}">${escapeHtml(target.auditLabel || 'audit status')}</span>
      </div>
      <h3>Позиція ${number(target.position || 0)} → ціль ${number(target.targetPosition || 10)}</h3>
      <p>${number(target.clicks || 0)} кліків · ${number(target.impressions || 0)} показів · CTR ${seoPercent(target.ctr || 0)}${target.ga4Sessions ? ` · GA4 ${number(target.ga4Sessions)} sessions` : ''}</p>
      <p><b>${escapeHtml(target.agent || 'Ranking Agent')}:</b> ${escapeHtml(target.nextAction || '')}</p>
      <div class="seo-goal-next">
        <strong>${running ? 'Що відбувається зараз' : completed ? `Результат audit${target.auditScore ? `: ${number(target.auditScore)}/100` : ''}` : failed ? 'Чому немає наступної дії' : 'Що означає ця ціль'}</strong>
        <p>${escapeHtml(target.ownerNext || target.verification || '')}</p>
        ${target.auditCompletedAt ? `<small>Останній аудит: ${escapeHtml(seoDate(target.auditCompletedAt))}</small>` : ''}
        ${target.auditError ? `<small class="bad-text">${escapeHtml(target.auditError)}</small>` : ''}
      </div>
      ${auditActions.length ? `<div class="seo-goal-actions">
        ${auditActions.map(action => `<div class="seo-mini-row">
          <strong>${escapeHtml(action.issue || action.category || 'SEO дія')}</strong>
          <span>${escapeHtml(action.impact || '')}</span>
          <small>${escapeHtml(action.recommendedAction || '')}</small>
        </div>`).join('')}
      </div>` : ''}
      ${nextSteps.length ? `<ol class="seo-goal-steps">
        ${nextSteps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}
      </ol>` : `<small>${escapeHtml(target.verification || '')}</small>`}
      <div class="button-row">
        <button class="button secondary" type="button" data-seo-action="audit" data-seo-target="${attr(target.url || '')}" data-seo-mode="page" ${running ? 'disabled' : ''}>${escapeHtml(auditButtonLabel)}</button>
        ${actionButton}
      </div>
    </div>
  </article>`;
}

function renderSeoRankingGoals(goals = {}) {
  const targets = asArray(goals.targets);
  const bestNext = goals.bestNext || targets[0] || null;
  return `<section class="card seo-ranking-goals">
    <div class="section-head">
      <div>
        <p class="section-kicker">North Star SEO</p>
        <h2>${escapeHtml(goals.title || 'Перша сторінка Google → конверсії')}</h2>
        <p>${escapeHtml(goals.primaryMetric || 'GSC position ≤ 10')} · ${escapeHtml(goals.conversionMetric || 'GA4 conversions')}</p>
      </div>
      <span class="status-pill ${goals.dataReady ? 'ok' : 'warn'}">${goals.dataReady ? 'цілі з GSC/GA4' : 'потрібні дані'}</span>
    </div>
    <div class="metric-grid compact-metrics">
      ${renderMetric('URL під контролем', number(goals.summary?.trackedUrls || 0), goals.source || 'GSC + GA4')}
      ${renderMetric('На 1 сторінці', number(goals.summary?.firstPage || 0), 'позиція ≤10')}
      ${renderMetric('Близько до 1 сторінки', number(goals.summary?.nearFirstPage || 0), 'позиція 11–20')}
      ${renderMetric('Ризик конверсії', number(goals.summary?.conversionRisk || 0), 'bounce / engagement')}
    </div>
    ${bestNext ? `<div class="seo-next-card compact-next">
      <span class="status-pill ${bestNext.auditState === 'running' ? 'warn' : 'ok'}">${bestNext.auditState === 'running' ? 'аудит цієї цілі триває' : 'головна ціль зараз'}</span>
      <h3>${escapeHtml(seoPath(bestNext.url))}: ${escapeHtml(bestNext.label || '')}</h3>
      <p>${escapeHtml(bestNext.ownerNext || bestNext.nextAction || '')}</p>
      <button class="button" type="button" data-seo-action="audit" data-seo-target="${attr(bestNext.url || '')}" data-seo-mode="page" ${bestNext.auditState === 'running' ? 'disabled' : ''}>${bestNext.auditState === 'completed' ? 'Повторити аудит' : 'Почати з цієї сторінки'}</button>
    </div>` : renderEmptyMini('Немає ranking targets', 'Потрібні GSC рядки з позиціями та GA4 landing pages.')}
    ${targets.length ? `<div class="audit-actions-list seo-ranking-list">
      ${targets.slice(0, 6).map(renderSeoRankingTarget).join('')}
    </div>` : ''}
    <details class="seo-capabilities">
      <summary><strong>Як агенти рухаються до цілі</strong><span>${number(asArray(goals.loop).length)} кроків</span></summary>
      <ol class="seo-goal-loop">
        ${asArray(goals.loop).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ol>
      <div class="tiny-list">
        ${asArray(goals.guardrails).map(item => `<span class="tag warn">${escapeHtml(item)}</span>`).join('')}
      </div>
    </details>
  </section>`;
}

function renderSeoRows(rows = [], renderer) {
  return rows.length
    ? `<div class="seo-mini-list">${rows.map(renderer).join('')}</div>`
    : renderEmptyMini('Немає рядків', 'API підключено, але для цього блоку немає даних.');
}

function renderSeoDataBoard({ data, google, adsPerformance } = {}) {
  const snapshot = seoGoogleSnapshot(data);
  const ads = adsPerformance || {};
  const adsLoop = conversionLoopSummary(ads);
  const landingPages = adsLandingPages(ads);
  const gscRange = [snapshot.gsc.dateRange?.start, snapshot.gsc.dateRange?.end].filter(Boolean).join(' — ');
  const ga4Range = [snapshot.ga4.dateRange?.start, snapshot.ga4.dateRange?.end].filter(Boolean).join(' — ');
  return `<section class="seo-data-board">
    <article class="card seo-data-card">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">Search Console</p>
          <h2>Попит у Google</h2>
          <p>${escapeHtml(gscRange || 'діапазон ще не прочитано')}</p>
        </div>
        <span class="status-pill ${seoGoogleCoreReady(google) ? 'ok' : 'warn'}">${number(snapshot.gsc.rowCount || 0)} rows</span>
      </div>
      <div class="metric-grid compact-metrics">
        ${renderMetric('Кліки', number(snapshot.gsc.totals.clicks || 0), 'органіка')}
        ${renderMetric('Покази', number(snapshot.gsc.totals.impressions || 0), 'де Google уже показує сайт')}
        ${renderMetric('CTR', seoPercent(snapshot.gsc.totals.ctr || 0), 'що треба піднімати title/meta')}
      </div>
      ${renderSeoRows(snapshot.gsc.topPages.slice(0, 5), row => `<div class="seo-mini-row">
        <strong>${escapeHtml(seoPath(row.page))}</strong>
        <span>${number(row.clicks)} кліків · ${number(row.impressions)} показів · CTR ${seoPercent(row.ctr)} · поз. ${number(row.position)}</span>
      </div>`)}
    </article>
    <article class="card seo-data-card">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">GA4 Organic</p>
          <h2>Поведінка після кліку</h2>
          <p>${escapeHtml(ga4Range || 'діапазон ще не прочитано')}</p>
        </div>
        <span class="status-pill ${seoGoogleCoreReady(google) ? 'ok' : 'warn'}">${number(snapshot.ga4.totalOrganicSessions || 0)} sessions</span>
      </div>
      ${renderSeoRows(snapshot.ga4.topPages.slice(0, 5), row => `<div class="seo-mini-row">
        <strong>${escapeHtml(row.landing_page || row.page || '—')}</strong>
        <span>${number(row.sessions)} sessions · bounce ${seoPercent(row.bounce_rate)} · engagement ${seoPercent(row.engagement_rate)}</span>
      </div>`)}
    </article>
    <article class="card seo-data-card">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">Google Ads</p>
          <h2>Навіщо підключали рекламу</h2>
          <p>Щоб бачити не “галочку”, а чи є покази, кліки, витрати й конверсії; потім звʼязувати рекламу зі сторінками та SEO.</p>
        </div>
        <span class="status-pill ${ads.ok ? 'ok' : 'warn'}">${ads.ok ? 'API працює' : 'немає метрик'}</span>
      </div>
      ${ads.ok ? `<div class="metric-grid compact-metrics">
        ${renderMetric('Покази', number(ads.totals?.impressions || 0), ads.dateRangeLabel || 'останні 30 днів')}
        ${renderMetric('Кліки', number(ads.totals?.clicks || 0), `CTR ${seoPercent(ads.totals?.ctr || 0)}`)}
        ${renderMetric('Витрати', seoMoney(ads.totals?.cost || 0), `CPC ${seoMoney(ads.totals?.averageCpc || 0)}`)}
        ${renderMetric('Конверсії', number(ads.totals?.conversions || 0), `CVR ${seoPercent(adsLoop.cvr)}`)}
        ${renderMetric('CPA', adsLoop.cpa ? seoMoney(adsLoop.cpa) : '—', adsLoop.confidence)}
      </div>
      ${landingPages.length ? renderSeoRows(landingPages.slice(0, 5), row => `<div class="seo-mini-row">
        <strong>${escapeHtml(landingUrlPath(row.url))}</strong>
        <span>${number(row.clicks)} кліків · ${number(row.conversions)} conv. · CVR ${seoPercent(row.conversionRate || 0)} · ${seoMoney(row.cost || 0)}</span>
      </div>`) : ''}
      ${renderSeoRows(asArray(ads.campaigns).slice(0, 5), row => `<div class="seo-mini-row">
        <strong>${escapeHtml(row.name || row.id || 'Кампанія')}</strong>
        <span>${number(row.clicks)} кліків · ${number(row.impressions)} показів · ${seoMoney(row.cost || 0)} · ${escapeHtml(row.status || '')}</span>
      </div>`)}` : `<div class="empty-mini"><strong>Google Ads ще не віддав performance</strong><p>${escapeHtml(ads.error || 'Після refresh тут мають бути кампанії, кліки, покази, витрати і конверсії.')}</p></div>`}
    </article>
  </section>`;
}

function seoInventoryCountForScope(scopeId = '', summary = {}) {
  if (scopeId === 'products') return Number(summary.products || 0);
  if (scopeId === 'categories') return Number(summary.categories || 0);
  if (scopeId === 'information') return Number(summary.information || 0);
  if (scopeId === 'technical') return Number(summary.files || 0);
  return 0;
}

function renderSeoScanScope(scope = [], inventorySummary = {}) {
  const fallback = [
    { id: 'products', label: 'Товари', purpose: 'товарні сторінки, schema, snippet, конверсія', allowedWrites: 'entity_patch після approval' },
    { id: 'categories', label: 'Категорії', purpose: 'категорії кави, перелінковка, CollectionPage', allowedWrites: 'entity_patch після approval' },
    { id: 'information', label: 'Інфосторінки', purpose: 'довіра, доставка, B2B, подарунки', allowedWrites: 'після доказів/approval' },
    { id: 'technical', label: 'Техніка', purpose: 'robots, canonical, sitemap, CWV, schema template', allowedWrites: 'file_patch після approval' }
  ];
  return `<div class="seo-scan-scope-grid">
    ${(scope.length ? scope : fallback).map(item => {
      const count = seoInventoryCountForScope(item.id, inventorySummary);
      return `<article>
        <span class="status-pill ${count ? 'ok' : 'warn'}">${count ? number(count) : 'scan'}</span>
        <strong>${escapeHtml(item.label || item.id)}</strong>
        <p>${escapeHtml(item.purpose || '')}</p>
        <small>${escapeHtml(item.allowedWrites || '')}</small>
      </article>`;
    }).join('')}
  </div>`;
}

function renderSeoResultWindow(windowItem = {}) {
  return `<article>
    <strong>${escapeHtml(windowItem.label || '')}</strong>
    <p><b>Перший сигнал:</b> ${escapeHtml(windowItem.firstSignalDays || '7–14 днів')}</p>
    <p><b>Рішення:</b> ${escapeHtml(windowItem.decisionDays || '14–28 днів')}</p>
    <small>${escapeHtml(windowItem.metrics || '')}</small>
  </article>`;
}

function renderSeoMonitoringSummary(writeRuns = []) {
  const monitoringRuns = asArray(writeRuns).filter(run => run.monitoring?.status === 'scheduled');
  if (!monitoringRuns.length) {
    return `<div class="seo-monitoring-card">
      <span class="status-pill warn">ще немає live batch</span>
      <strong>Моніторинг стартує після внесення</strong>
      <p>Після apply система фіксує сторінки, поля, checkpoints 7/14/28 днів і правила: масштабувати, A/B test або rollback.</p>
    </div>`;
  }
  const run = monitoringRuns[0];
  const checkpoints = asArray(run.monitoring.checkpoints);
  const now = Date.now();
  const next = checkpoints.find(item => Date.parse(item.at || '') >= now) || checkpoints[checkpoints.length - 1] || null;
  return `<div class="seo-monitoring-card">
    <span class="status-pill ok">на контролі</span>
    <strong>${number(run.monitoring.targetCount || 0)} URL · ${asArray(run.monitoring.changedFields).map(seoFieldLabel).join(', ') || 'SEO changes'}</strong>
    <p>${escapeHtml(next ? `${next.label}: ${seoDate(next.at)} — ${asArray(next.checks).slice(0, 2).join('; ')}` : 'Потрібна перевірка GSC/GA4.')}</p>
    <small>Якщо CTR/конверсії падають — не повторюємо ту саму задачу, а готуємо rollback або нову гіпотезу.</small>
  </div>`;
}

function renderSeoPostWriteQuality(report = {}) {
  const items = asArray(report.items);
  if (!items.length) return '';
  const critical = Number(report.critical || 0);
  const review = Number(report.review || 0);
  return `<section class="card seo-post-write-quality">
    <div class="section-heading">
      <div>
        <p class="section-kicker">Verifier Agent · після live-запису</p>
        <h2>Що треба перевірити або виправити після SEO apply</h2>
        <p>Це не нові пропозиції. Це контроль якості вже внесених змін: H1 у description, службові/старі блоки, підозрілі посилання й schema/meta, які не можна масштабувати далі.</p>
      </div>
      <span class="status-pill ${critical ? 'bad' : 'warn'}">${critical ? `${number(critical)} критично` : `${number(review)} на перевірку`}</span>
    </div>
    <div class="seo-list">
      ${items.slice(0, 8).map(item => {
        const issueLabels = asArray(item.issues).map(issue => issue.label).filter(Boolean).slice(0, 3);
        const badLinks = asArray(item.badAnchors).map(anchor => anchor.text ? `${anchor.text} → ${anchor.url || 'без href'}` : (anchor.url || 'без href')).slice(0, 3);
        const hasCritical = asArray(item.issues).some(issue => issue.severity === 'critical');
        return `<article class="seo-row">
          <div>
            <span class="status-pill ${hasCritical ? 'bad' : 'warn'}">${hasCritical ? 'критично' : 'review'}</span>
            <strong>${escapeHtml(item.target || `${item.entityType || ''}:${item.entityId || ''}`)}</strong>
            <p>${escapeHtml(issueLabels.join(' · ') || 'Потрібна ручна перевірка')}</p>
            ${badLinks.length ? `<small>Підозрілі посилання: ${escapeHtml(badLinks.join('; '))}</small>` : ''}
          </div>
          <small>${escapeHtml(item.task || '')} · ${number(item.textLength || 0)} символів</small>
        </article>`;
      }).join('')}
    </div>
  </section>`;
}

function renderSeoRecoveryMode(mode = {}) {
  if (!mode.locked && !mode.review) return '';
  const locked = Boolean(mode.locked);
  return `<section class="card connection-warning seo-recovery-mode">
    <span class="status-pill ${locked ? 'bad' : 'warn'}">${locked ? 'recovery locked' : 'review'}</span>
    <div>
      <strong>${locked ? 'Нові SEO-зміни заблоковані до cleanup' : 'Є post-write задачі на перевірку'}</strong>
      <p>${escapeHtml(mode.reason || '')}</p>
      <div class="tiny-list">
        ${asArray(mode.allowedActions).slice(0, 6).map(item => `<span class="tag">можна: ${escapeHtml(item)}</span>`).join('')}
      </div>
      ${asArray(mode.blockedActions).length ? `<div class="tiny-list">
        ${asArray(mode.blockedActions).slice(0, 6).map(item => `<span class="tag bad">заблоковано: ${escapeHtml(item)}</span>`).join('')}
      </div>` : ''}
      <small>${escapeHtml(mode.nextStep || '')}</small>
    </div>
  </section>`;
}

function renderSeoSpecialistAgents(agents = [], recoveryMode = {}) {
  const list = asArray(agents);
  if (!list.length) return '';
  return `<section class="card seo-specialist-agents">
    <div class="section-heading">
      <div>
        <p class="section-kicker">SEO specialist agents · операційні ролі</p>
        <h2>Не “картки”, а відповідальність, evidence і заборони</h2>
        <p>Кожен агент має межі: що читає, що може змінити, що не має права вигадувати, і яка його поточна задача.</p>
      </div>
      <span class="status-pill ${recoveryMode.locked ? 'bad' : 'ok'}">${recoveryMode.locked ? 'repair first' : 'active'}</span>
    </div>
    <div class="operator-grid">
      ${list.map(agent => `<article class="operator-card">
        <span class="status-pill ${agent.status === 'blocked' || agent.status === 'blocked_until_recovery' ? 'bad' : agent.status === 'repair_only' || agent.status === 'read_only' ? 'warn' : 'ok'}">${escapeHtml(agent.status || 'active')}</span>
        <h3>${escapeHtml(agent.name || agent.id)}</h3>
        <p>${escapeHtml(agent.mission || '')}</p>
        <small><b>Зараз:</b> ${escapeHtml(agent.currentWork || '')}</small>
        <details>
          <summary>Evidence / права / заборони</summary>
          <p><b>Evidence:</b> ${escapeHtml(asArray(agent.evidenceRequired).join('; ') || '—')}</p>
          <p><b>Може:</b> ${escapeHtml(asArray(agent.canChange).join('; ') || '—')}</p>
          <p><b>Не може:</b> ${escapeHtml(asArray(agent.cannotChange).join('; ') || '—')}</p>
        </details>
      </article>`).join('')}
    </div>
  </section>`;
}

function renderSeoGrowthCommandCenter({ data, fixQueue, fixPreview, active, rankingGoals, intelligence, latestWriteRun } = {}) {
  const controlPlan = data.controlPlan || {};
  const inventory = controlPlan.inventorySummary || {};
  const recoveryMode = data.seoRecoveryMode || {};
  const recoveryLocked = Boolean(recoveryMode.locked);
  const selectedBatchLimit = seoAgentBatchLimit();
  const draftCount = seoDraftableActions(fixQueue).length;
  const batchDraftCount = seoDraftBatchActions(fixQueue, data, selectedBatchLimit).length;
  const executable = Number(fixQueue.summary?.executable || 0);
  const previewPending = Boolean(fixPreview);
  const best = rankingGoals?.bestNext || null;
  const windows = asArray(intelligence.resultWindows).length
    ? asArray(intelligence.resultWindows)
    : [
        { label: 'Title/meta/H1', firstSignalDays: '7–14 днів', decisionDays: '14–28 днів', metrics: 'GSC CTR, clicks, position + GA4 landing-page behavior' },
        { label: 'Schema / Merchant', firstSignalDays: '3–14 днів', decisionDays: '14–30 днів', metrics: 'rich result eligibility, Merchant diagnostics, product clicks' },
        { label: 'Контент / links', firstSignalDays: '14–30 днів', decisionDays: '30–60 днів', metrics: 'organic sessions, engagement, add_to_cart/purchase' }
      ];
  const casePatterns = asArray(intelligence.casePatterns);
  return `<section class="card seo-growth-command">
    <div class="seo-growth-command-head">
      <div>
        <p class="section-kicker">SEO Growth OS · approval-gated</p>
        <h2>Ціль агентів: топ-10 → топ-3 → конверсії</h2>
        <p>Агенти сканують товари, категорії й важливі сторінки, читають правила Google/AI, готують не “SEO-текст”, а перевіряєму гіпотезу з diff, метрикою й датою контролю.</p>
      </div>
      <div class="seo-growth-command-actions">
        ${previewPending
          ? `<button class="button" type="button" data-scroll-target="seoFixPreview">Перейти до preview</button>
             <button class="button secondary" type="button" disabled>Новий batch після рішення</button>`
          : `<button class="button" type="button" data-seo-action="control-scan" ${active ? 'disabled' : ''}>Сканувати SEO-контур</button>
             <button class="button secondary" type="button" data-seo-agent-draft-batch="1" data-seo-agent-draft-limit="${attr(selectedBatchLimit)}" ${active || recoveryLocked || !draftCount ? 'disabled' : ''}>${recoveryLocked ? 'Спочатку cleanup' : `Підготувати наступні ${number(Math.min(batchDraftCount || 0, selectedBatchLimit))} змін`}</button>
             <button class="button secondary" type="button" data-seo-action="build-preview" ${active || recoveryLocked || !executable ? 'disabled' : ''}>${recoveryLocked ? 'Generic preview заблоковано' : 'Підготувати готові зміни'}</button>`}
      </div>
    </div>
    <div class="seo-growth-status-grid">
      <article>
        <span class="status-pill ok">1</span>
        <strong>Скан</strong>
        <p>${inventory.entities ? `${number(inventory.entities)} сутностей у контурі` : 'Спочатку треба прочитати товари, категорії, сторінки й файли.'}</p>
      </article>
      <article>
        <span class="status-pill warn">2</span>
        <strong>Гіпотеза</strong>
        <p>${best ? `${escapeHtml(best.path || best.url)} · позиція ${number(best.position)} → ціль ${number(best.targetPosition)}` : 'Потрібні GSC/GA4 URL з показами, кліками й поведінкою.'}</p>
      </article>
      <article>
        <span class="status-pill ${fixPreview ? 'warn' : executable || draftCount ? 'ok' : 'warn'}">3</span>
        <strong>Batch</strong>
        <p>${fixPreview ? 'Preview чекає рішення — новий scan/batch не є наступним кроком.' : executable ? `${number(executable)} ready patches.` : draftCount ? `${number(draftCount)} задач потребують agent draft.` : 'Поки немає безпечного diff.'}</p>
      </article>
      <article>
        <span class="status-pill ok">4</span>
        <strong>Моніторинг</strong>
        <p>Після apply: readback, re-audit, GSC/GA4 контроль 7/14/28 днів, рішення scale/A-B/rollback.</p>
      </article>
    </div>
    <details class="seo-human-details" open>
      <summary><strong>Що саме агенти сканують і можуть змінювати</strong><span>без live-запису до approval</span></summary>
      ${renderSeoScanScope(asArray(intelligence.scanScope), inventory)}
    </details>
    <details class="seo-human-details">
      <summary><strong>Коли чекати результат і як не зациклитись</strong><span>не повторюємо одну й ту саму задачу без метрики</span></summary>
      <div class="seo-result-window-grid">
        ${windows.slice(0, 4).map(renderSeoResultWindow).join('')}
      </div>
      <div class="seo-rule-list">
        ${asArray(intelligence.decisionRules).slice(0, 5).map(rule => `<p>• ${escapeHtml(rule)}</p>`).join('')}
      </div>
    </details>
    <details class="seo-human-details">
      <summary><strong>Робочі патерни, які агенти мають повторювати</strong><span>не звіт, а цикл навчання</span></summary>
      <div class="seo-case-pattern-grid">
        ${casePatterns.slice(0, 3).map(item => `<article>
          <strong>${escapeHtml(item.label || item.id)}</strong>
          <p>${escapeHtml(item.pattern || '')}</p>
          <small>${escapeHtml(item.action || '')}</small>
        </article>`).join('') || '<p class="muted-note">Патерни зʼявляться після оновлення Growth Intelligence.</p>'}
      </div>
    </details>
    ${renderSeoMonitoringSummary([latestWriteRun, ...asArray(data.writeRuns)].filter(Boolean))}
  </section>`;
}

function seoLatestWriteSystemIssue(writeRuns = []) {
  const recentFailed = asArray(writeRuns).find(run => run?.status === 'partial_or_failed' && Number(run.failedCount || 0) > 0);
  if (!recentFailed) return null;
  const failedRows = asArray(recentFailed.results).filter(result => !result.ok);
  const issueText = [
    recentFailed.execution?.stopReason || '',
    recentFailed.error || '',
    ...failedRows.slice(0, 6).map(result => result.error || '')
  ].join(' ');
  if (/seo_apply_product_schema|Порожня відповідь від bridge/i.test(issueText)) {
    const targets = failedRows.slice(0, 3).map(result => seoPath(result.target || result.url || '')).filter(Boolean);
    return {
      tone: 'bad',
      title: 'Що не так: впав bridge для Product Schema',
      body: 'Batch дійшов до live-запису Schema.org, але OpenCart bridge повернув порожню відповідь. Система зупинила виконання, щоб не продовжувати невідомий запис.',
      proof: `${number(recentFailed.okCount || 0)} внесено · ${number(recentFailed.failedCount || 0)} не підтверджено${targets.length ? ` · приклади: ${targets.join(', ')}` : ''}`,
      next: 'Не повторюй цей самий schema batch до оновлення bridge. Потрібен bridge v35, потім новий preview/readback.',
      run: recentFailed
    };
  }
  if (/SEO entity changed after approval|SOURCE_CHANGED/i.test(issueText)) {
    return {
      tone: 'warn',
      title: 'Що не так: сторінки змінились після preview',
      body: 'Preview вже застарів: source fingerprint змінився між погодженням і записом. Це запобіжник, щоб не перетерти нові дані OpenCart.',
      proof: `${number(recentFailed.okCount || 0)} внесено · ${number(recentFailed.failedCount || 0)} зупинено`,
      next: 'Потрібно перечитати SEO-контур або підготувати новий preview для цих URL.',
      run: recentFailed
    };
  }
  return null;
}

function renderSeoSystemIssue(issue) {
  if (!issue) return '';
  return `<div class="seo-system-issue ${escapeHtml(issue.tone || 'warn')}">
    <div>
      <span class="status-pill ${escapeHtml(issue.tone || 'warn')}">потрібна дія</span>
      <strong>${escapeHtml(issue.title || 'Є системна помилка')}</strong>
      <p>${escapeHtml(issue.body || '')}</p>
      <small>${escapeHtml(issue.proof || '')}</small>
    </div>
    <div>
      <b>${escapeHtml(issue.next || '')}</b>
      ${issue.run?.id ? `<small>run: ${escapeHtml(issue.run.id)}</small>` : ''}
    </div>
  </div>`;
}

function renderSeoAgentBatchError(error = null) {
  if (!error) return '';
  const skipped = asArray(error.skipped).slice(0, 5);
  const blocked = asArray(error.blockedInternalLinks).slice(0, 5);
  const diagnostics = error.diagnostics || {};
  return `<section class="card seo-now-panel bad" id="seoAgentBatchError">
    <div class="seo-now-main">
      <div>
        <span class="status-pill bad">batch не створено</span>
        <h2>Агенти не знайшли безпечних змін для запису</h2>
        <p>${escapeHtml(error.message || 'Batch не створено. Потрібна причина в diagnostics.')}</p>
      </div>
      <div class="seo-now-proof">
        ${diagnostics.nextStep
          ? `<strong>Наступний крок</strong><p>${escapeHtml(diagnostics.nextStep)}</p>`
          : '<strong>Що робити</strong><p>Не повторювати той самий batch. Треба змінити тип задачі або перечитати конкретну сторінку.</p>'}
      </div>
    </div>
    ${(blocked.length || skipped.length) ? `<div class="seo-blocker-grid">
      ${blocked.length ? `<article>
        <h3>Заблоковані internal links</h3>
        <p>Це добре, а не погано: не додаємо лінки в порожній опис або товарні описи.</p>
        ${blocked.map(item => `<small>${escapeHtml(seoPath(item.target || ''))}: ${escapeHtml(item.reason || '')}</small>`).join('')}
      </article>` : ''}
      ${skipped.length ? `<article>
        <h3>Що не пройшло safety gate</h3>
        ${skipped.map(item => `<small>${escapeHtml(item.category || item.agent || 'agent')}: ${escapeHtml(seoPath(item.target || ''))} — ${escapeHtml(item.reason || '')}</small>`).join('')}
      </article>` : ''}
    </div>` : ''}
  </section>`;
}

function renderSeoNowPanel({ data, fixQueue, fixPreview, active, activeApproval, rankingGoals } = {}) {
  const controlPlan = data.controlPlan || null;
  const stats = seoPreviewStats(fixPreview);
  const groups = seoChangeGroups(stats.changes);
  const systemIssue = seoLatestWriteSystemIssue(data.writeRuns);
  const selectedBatchLimit = seoAgentBatchLimit();
  const batchDraftCount = seoDraftBatchActions(fixQueue, data, selectedBatchLimit).length;
  const executable = Number(fixQueue.summary?.executable || 0);
  const draftable = seoDraftableActions(fixQueue).length;
  const best = rankingGoals?.bestNext || null;
  const canApprove = fixPreview?.status === 'pending_approval';
  const canApply = Boolean(activeApproval?.id) && fixPreview?.status === 'approved';
  const previewGroupSummary = groups.length
    ? groups.slice(0, 4).map(group => `${seoChangeGroupHumanLabel(group)}: ${number(group.changes.length)} змін`).join(' · ')
    : '';

  let tone = 'ok';
  let label = 'наступний крок';
  let title = 'Почати з найкращої сторінки для росту';
  let body = 'Система має вибрати сторінку з GSC/GA4, дати агенту зробити вузький diff і після внесення контролювати CTR, позицію та конверсії.';
  let proof = best
    ? `${seoPath(best.url)}: позиція ${number(best.position)} → ціль ${number(best.targetPosition)} · ${number(best.clicks || 0)} кліків`
    : 'Потрібні GSC/GA4 сигнали або свіжий аудит.';
  let actions = '';
  let guardrail = 'Live-сайт не змінюється без approval.';

  if (active) {
    tone = 'warn';
    label = 'зараз виконується';
    title = 'Дочекатися завершення scan/audit';
    body = 'Не запускай ще один аудит по колу: сервер уже читає сайт. Після завершення тут має зʼявитися конкретний preview або одна наступна дія.';
    proof = active.label || active.type || active.id || 'Активна SEO-задача';
    actions = `<button class="button secondary" type="button" id="refreshSeoCenter">Оновити статус</button>`;
  } else if (fixPreview) {
    tone = fixPreview.status === 'approved' ? 'ok' : 'warn';
    label = fixPreview.status === 'approved' ? 'preview підтверджено' : 'потрібне рішення';
    title = fixPreview.status === 'approved'
      ? 'Тепер або внести й перевірити readback, або відхилити'
      : 'Спочатку вирішити цей SEO-preview';
    body = `Є batch: ${number(stats.changeCount)} змін для ${number(stats.entityCount)} сторінок/файлів. Не запускай новий scan і не готуй новий batch, поки цей не прийнятий або відхилений.`;
    proof = previewGroupSummary || 'Preview чекає перевірки.';
    guardrail = 'Підтвердження не пише на сайт. Запис починається тільки кнопкою “Внести й перевірити readback”.';
    actions = `
      <button class="button" type="button" data-scroll-target="seoFixPreview">Подивитись preview</button>
      <button class="button secondary" type="button" data-seo-action="approve" ${canApprove ? '' : 'disabled'}>Підтвердити</button>
      <button class="button secondary" type="button" data-seo-action="reject-preview" ${canApprove || fixPreview.status === 'approved' ? '' : 'disabled'}>Відхилити</button>
      <button class="button ${canApply ? '' : 'secondary'}" type="button" data-seo-action="apply" ${canApply ? '' : 'disabled'}>Внести й перевірити</button>`;
  } else if (!controlPlan) {
    tone = 'warn';
    label = 'немає карти сайту';
    title = 'Спочатку прочитати SEO-контур';
    body = 'Агенти мають бачити товари, категорії, інфосторінки, SEO URL, schema та дозволені технічні файли. Без цього наступні дії будуть випадковими.';
    proof = 'Контур ще не прочитано.';
    actions = `<button class="button" type="button" data-seo-action="control-scan">Сканувати SEO-контур</button>`;
  } else if (executable > 0) {
    tone = 'ok';
    label = 'можна готувати';
    title = 'Підготувати точний preview із готових patches';
    body = `Є ${number(executable)} typed patches. Наступний крок — зібрати batch до ${number(selectedBatchLimit)} сторінок, перевірити людський preview і тільки потім вирішувати.`;
    proof = `${number(controlPlan?.inventorySummary?.entities || 0)} сутностей прочитано · live-запис вимкнений до approval.`;
    actions = `<button class="button" type="button" data-seo-action="build-preview">Підготувати preview</button>`;
  } else if (batchDraftCount > 0) {
    tone = 'warn';
    label = 'потрібен draft';
    title = `Дати агентам підготувати наступні ${number(Math.min(batchDraftCount, selectedBatchLimit))} змін`;
    body = 'Ці задачі ще не можна писати: агент має прочитати конкретну сторінку/джерело, зробити вузький diff і пояснити очікуваний вплив.';
    proof = `${number(draftable)} задач потребують доказів або редактора.`;
    actions = `<button class="button" type="button" data-seo-agent-draft-batch="1" data-seo-agent-draft-limit="${attr(selectedBatchLimit)}">Підготувати ${number(Math.min(batchDraftCount, selectedBatchLimit))} змін</button>`;
  } else if (best) {
    tone = 'ok';
    label = 'фокус сторінки';
    title = `${seoPath(best.url)}: дотиснути позицію ${number(best.position)} → ${number(best.targetPosition)}`;
    body = 'Це не “робити ще один звіт”. Треба аудит саме цієї URL, потім один вузький patch: title/meta/H1, schema, опис, internal links або UX-сигнал — залежно від фактичної причини.';
    actions = `<button class="button" type="button" data-seo-action="audit" data-seo-target="${attr(best.url || '')}" data-seo-mode="page">Аудит цієї сторінки</button>`;
  } else {
    tone = 'warn';
    label = 'немає очевидної дії';
    title = 'Оновити аудит і дані';
    body = 'Якщо система не може назвати одну сторінку і одну зміну — вона має чесно сказати “даних не вистачає”, а не показувати полотно задач.';
    actions = `<button class="button" type="button" data-seo-action="audit">Повний аудит</button>`;
  }

  return `<section class="card seo-now-panel ${tone}">
    <div class="seo-now-main">
      <div>
        <span class="status-pill ${tone}">${escapeHtml(label)}</span>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(body)}</p>
      </div>
      <div class="seo-now-actions">${actions}</div>
    </div>
    <div class="seo-now-grid">
      <article>
        <strong>Чому саме це</strong>
        <p>${escapeHtml(proof)}</p>
      </article>
      <article>
        <strong>Що це має дати</strong>
        <p>Не “кращий score”, а більше релевантних кліків, кращий CTR/позиція і більше add_to_cart/purchase або заявок.</p>
      </article>
      <article>
        <strong>Запобіжник</strong>
        <p>${escapeHtml(guardrail)}</p>
      </article>
    </div>
    ${renderSeoSystemIssue(systemIssue)}
  </section>`;
}

function renderSeoAccordion({ title, summary = '', kicker = '', content = '', open = false }) {
  return `<details class="seo-accordion card" ${open ? 'open' : ''}>
    <summary>
      <span>
        ${kicker ? `<small>${escapeHtml(kicker)}</small>` : ''}
        <strong>${escapeHtml(title)}</strong>
        ${summary ? `<em>${escapeHtml(summary)}</em>` : ''}
      </span>
      <b>відкрити</b>
    </summary>
    <div class="seo-accordion-body">${content}</div>
  </details>`;
}

function renderSeo() {
  const data = seoCenterData();
  const profile = seoCurrentProfile();
  const installation = data.installation || {};
  const google = data.google || {};
  const latest = data.latest || null;
  const active = data.activeJob || null;
  const target = state.seoCenter.target || profile.url || '';
  const actionPlan = asArray(latest?.summary?.actionPlan);
  const fixQueue = data.fixQueue || { items: [], summary: {} };
  const controlPlan = data.controlPlan || null;
  const fixPreview = data.fixPreview || null;
  const activeApproval = asArray(data.approvals).find(item => item.status === 'approved') || null;
  const latestWriteRun = asArray(data.writeRuns)[0] || null;
  const jobs = asArray(data.jobs).slice(0, 8);
  const weekly = asArray(data.weeklyPlan);
  const intelligence = data.intelligence || {};
  const rankingGoals = data.rankingGoals || {};
  const executableFixes = Number(fixQueue.summary?.executable || 0);
  const adsPerformance = state.data.adsPerformance || null;
  const modeOptions = asArray(data.auditModes).length
    ? asArray(data.auditModes)
    : [
        { id: 'full', label: 'Повний аудит' },
        { id: 'page', label: 'Сторінка' },
        { id: 'technical', label: 'Technical SEO' },
        { id: 'schema', label: 'Schema.org' },
        { id: 'performance', label: 'Швидкість / CWV' },
        { id: 'geo', label: 'AI Search / GEO' }
      ];
  const priorities = profile.priorities || {};
  const coreDashboard = `
    ${renderSeoDirectorCockpit({ data, profile, google, latest, fixQueue, fixPreview, active, adsPerformance })}

    ${renderSeoGrowthCommandCenter({ data, fixQueue, fixPreview, active, rankingGoals, intelligence, latestWriteRun })}

    <section class="site-switcher card seo-compact-switcher">
      <div>
        <p class="section-kicker">Сайт</p>
        <h2>${escapeHtml(profile.name || 'Mercato')}</h2>
        <p>SEO-система, а не папка зі звітами · ${number(installation.skills || 0)} skills · ${number(installation.agents || 0)} agents</p>
        <p>${escapeHtml(profile.goal || '')}</p>
      </div>
      <div class="segment-tabs">
        ${asArray(data.profiles).map(site => `<button class="button ${site.id === profile.id ? '' : 'secondary'}" type="button" data-seo-site="${attr(site.id)}">${escapeHtml(site.name)}</button>`).join('') || `
          <button class="button" type="button">Mercato</button>
          <button class="button secondary" type="button">Prom3D</button>`}
      </div>
    </section>

    ${renderSeoDataBoard({ data, google, adsPerformance })}

    ${renderSeoRankingGoals(rankingGoals)}
  `;

  return `
  ${renderSeoNowPanel({ data, fixQueue, fixPreview, active, activeApproval, rankingGoals })}
  ${renderSeoRecoveryMode(data.seoRecoveryMode)}
  ${renderSeoPostWriteQuality(data.postWriteQuality)}
  ${renderSeoSpecialistAgents(data.specialistAgents, data.seoRecoveryMode)}
  ${renderSeoAgentBatchError(state.seoCenter.lastAgentBatchError)}
  ${fixPreview ? renderSeoFixPreview(fixPreview, activeApproval) : ''}
  ${fixPreview ? renderSeoAccordion({
    title: 'Метрики, ranking goals і Growth OS',
    kicker: 'нижче, не наступна дія',
    summary: 'Сховано, поки preview чекає рішення, щоб не змішувати аудит із approval.',
    open: false,
    content: coreDashboard
  }) : coreDashboard}
  ${latestWriteRun ? renderSeoWriteRun(latestWriteRun) : ''}

  ${renderSeoAccordion({
    title: 'Що роблять агенти і які зміни вони можуть внести',
    kicker: 'approval-gated',
    summary: `${number(fixQueue.summary?.executable || 0)} готових patches · ${number(fixQueue.summary?.manual || 0)} задач для доказів/редактора`,
    open: false,
    content: `
      ${renderSeoActionDock({ data, controlPlan, fixQueue, fixPreview, activeApproval, active, executableFixes })}
      ${renderSeoAgentMissionPanel({ fixQueue, controlPlan, fixPreview, active })}
      ${renderSeoOperatorBoard({ data, profile, google, controlPlan, fixQueue, fixPreview, activeApproval, active })}
      <div class="split-line"></div>
      <div class="audit-actions-list seo-fix-queue-list">
        ${asArray(fixQueue.items).length
          ? asArray(fixQueue.items).slice(0, 18).map(renderSeoQueueAction).join('')
          : renderEmptyMini('Черга порожня', 'Запустіть аудит конкретної сторінки або повний аудит сайту.')}
      </div>`
  })}

  ${renderSeoAccordion({
    title: latest ? `Останній аудит: ${number(latest.summary?.score || 0)}/100` : 'Останній аудит',
    kicker: latest ? seoDate(latest.completedAt) : 'ще немає',
    summary: latest ? `${escapeHtml(latest.modeLabel || 'Аудит')} · ${escapeHtml(latest.target || '')}` : 'Запустіть read-only аудит зверху.',
    open: false,
    content: `
      <div class="priority-columns">
        ${renderSeoPriorityColumn('critical', priorities.critical)}
        ${renderSeoPriorityColumn('important', priorities.important)}
        ${renderSeoPriorityColumn('later', priorities.later)}
      </div>
      <div class="split-line"></div>
      <div class="audit-actions-list">
        ${actionPlan.length ? actionPlan.map(renderSeoAuditAction).join('') : renderEmptyMini('Немає нових сигналів', 'Після аудиту тут будуть конкретні проблеми, вплив і потреба ручної перевірки.')}
      </div>`
  })}

  ${renderSeoAccordion({
    title: 'Запуск аудиту і Google-доступи',
    kicker: seoGoogleHeading(google),
    summary: seoGoogleMetricDetail(google),
    open: false,
    content: `
      <section class="seo-control-grid nested-grid">
        <article class="card">
          <div class="section-head">
            <div>
              <p class="section-kicker">${escapeHtml(profile.name)}</p>
              <h2>${escapeHtml(profile.goal || 'Органічне зростання')}</h2>
              <p>${asArray(profile.focus).map(item => escapeHtml(item)).join(' · ')}</p>
            </div>
            <span class="status-pill ok">read-only</span>
          </div>
          <div class="form-grid">
            <label class="field">
              <span>Тип перевірки</span>
              <select id="seoAuditMode">
                ${modeOptions.map(mode => `<option value="${attr(mode.id)}" ${mode.id === state.seoCenter.mode ? 'selected' : ''}>${escapeHtml(mode.label)}</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span>URL цього сайту</span>
              <input id="seoAuditTarget" value="${attr(target)}" placeholder="${attr(profile.url || '')}">
            </label>
          </div>
          <div class="button-row">
            <button class="button" type="button" id="runSeoAudit" ${active ? 'disabled' : ''}>${active ? 'Аудит уже виконується' : 'Запустити перевірку'}</button>
            <button class="button secondary" type="button" id="runWeeklySeo" ${active ? 'disabled' : ''}>Щотижневий аудит</button>
            <span class="muted-note">Дозволені лише URL профілю ${escapeHtml(profile.name)}. Ніяких записів на сайт.</span>
          </div>
          ${active ? renderSeoActiveJob(active) : ''}
        </article>
        <article class="card">
          <div class="section-head">
            <div>
              <p class="section-kicker">Google readiness</p>
              <h2>${seoGoogleHeading(google)}</h2>
              <p>${escapeHtml(google.description || '')}</p>
            </div>
            <span class="status-pill ${seoGoogleCoreReady(google) ? 'ok' : 'warn'}">${seoGoogleCoreReady(google) ? 'GSC/GA4 ok' : `tier ${number(google.tier ?? -1)}`}</span>
          </div>
          <div class="source-grid compact-source-grid">
            ${renderSeoGoogleService('PageSpeed / CrUX', seoGooglePerformanceService(google))}
            ${renderSeoGoogleService('Search Console', google.services?.gsc)}
            ${renderSeoGoogleService('GA4', google.services?.ga4)}
          </div>
          <div class="button-row">
            <button class="button secondary" type="button" data-route="settings">Відкрити доступи</button>
          </div>
        </article>
      </section>`
  })}

  ${renderSeoAccordion({
    title: 'Growth Intelligence / правила Google і AI Search',
    kicker: 'офіційні правила',
    summary: 'Агенти стежать за правилами, але не пишуть на сайт без approval.',
    open: false,
    content: renderSeoIntelligence(intelligence)
  })}

  ${renderSeoAccordion({
    title: 'Історія і щотижневий цикл',
    kicker: `${number(jobs.length)} запусків`,
    summary: weekly.filter(item => item.due).length ? `${number(weekly.filter(item => item.due).length)} перевірок due` : 'план актуальний',
    open: false,
    content: `
      <section class="seo-control-grid nested-grid">
        <article class="card">
          <div class="section-head">
            <div>
              <p class="section-kicker">Щотижневий цикл</p>
              <h2>Контроль без SEO-сміття</h2>
              <p>Кожна перевірка залишає історію. Контент не створюється автоматично.</p>
            </div>
          </div>
          <div class="weekly-check-list">
            ${weekly.length ? weekly.map(renderSeoWeeklyCheck).join('') : renderEmptyMini('План ще завантажується', 'Оновіть SEO Center.')}
          </div>
        </article>
        <article class="card">
          <div class="section-head">
            <div>
              <p class="section-kicker">Історія</p>
              <h2>Що перевіряли і коли</h2>
            </div>
          </div>
          <div class="seo-history">${jobs.length ? jobs.map(renderSeoHistoryRow).join('') : renderEmptyMini('Історія порожня', 'Перший запуск створить baseline для наступних порівнянь.')}</div>
        </article>
      </section>`
  })}

  ${renderSeoAccordion({
    title: 'Редактор сторінок і безпечний publish',
    kicker: 'legacy workflow',
    summary: 'Збережено для ручного точкового publish після перевірки.',
    open: false,
    content: renderSeoContentWorkbench()
  })}`;

  return `<section class="hero-panel seo-center-hero">
    <div>
      <p class="section-kicker">Codex SEO у Mercato AI</p>
      <h2>SEO-система, а не папка зі звітами</h2>
      <p>Запускайте перевірки Mercato і Prom3D тут. Аудити read-only, результати залишаються в історії, а точні live-зміни проходять fix preview → approval → readback → повторний аудит.</p>
      <div class="hero-actions">
        <button class="button" type="button" id="runWeeklySeo" ${active ? 'disabled' : ''}>Запустити щотижневий аудит</button>
        <button class="button secondary" type="button" id="refreshSeoCenter">Оновити стан</button>
        <button class="button secondary" type="button" data-route="settings">Підключити Google API</button>
      </div>
    </div>
    <aside class="proof-box">
      <span class="status-pill ${installation.installed ? 'ok' : 'bad'}">${installation.installed ? 'Codex SEO встановлено' : 'Codex SEO не готовий'}</span>
      <strong>${number(installation.skills || 0)} skills · ${number(installation.agents || 0)} agents</strong>
      <p>Версія ${escapeHtml(installation.version || 'невідома')} · Playwright ${installation.visualReady ? 'готовий' : 'не готовий'} · Google tier ${number(google.tier ?? -1)}.</p>
    </aside>
  </section>

  <section class="site-switcher card">
    <div>
      <p class="section-kicker">Окремі робочі контури</p>
      <h2>Оберіть сайт</h2>
    </div>
    <div class="segment-tabs">
      ${asArray(data.profiles).map(site => `<button class="button ${site.id === profile.id ? '' : 'secondary'}" type="button" data-seo-site="${attr(site.id)}">${escapeHtml(site.name)}</button>`).join('') || `
        <button class="button" type="button">Mercato</button>
        <button class="button secondary" type="button">Prom3D</button>`}
    </div>
  </section>

  <section class="metric-grid">
    ${renderMetric('Останній score', latest?.summary?.score ? `${number(latest.summary.score)}/100` : '—', latest ? seoDate(latest.completedAt) : 'потрібен перший запуск')}
    ${renderMetric('Codex SEO', installation.coreReady ? 'Готово' : 'Потрібно', `${number(installation.skills || 0)} skills`)}
    ${renderMetric('Google data', seoGoogleMetricValue(google), seoGoogleMetricDetail(google))}
    ${renderMetric('Щотижневий контроль', weekly.filter(item => item.due).length ? `${number(weekly.filter(item => item.due).length)} due` : 'Актуально', `${number(weekly.length)} перевірок`)}
  </section>

  ${renderSeoActionDock({ data, controlPlan, fixQueue, fixPreview, activeApproval, active, executableFixes })}

  ${renderSeoAgentMissionPanel({ fixQueue, controlPlan, fixPreview, active })}

  ${renderSeoOperatorBoard({ data, profile, google, controlPlan, fixQueue, fixPreview, activeApproval, active })}

  ${renderSeoIntelligence(intelligence)}

  <section class="seo-control-grid">
    <article class="card">
      <div class="section-head">
        <div>
          <p class="section-kicker">${escapeHtml(profile.name)}</p>
          <h2>${escapeHtml(profile.goal || 'Органічне зростання')}</h2>
          <p>${asArray(profile.focus).map(item => escapeHtml(item)).join(' · ')}</p>
        </div>
        <span class="status-pill ok">read-only</span>
      </div>
      <div class="form-grid">
        <label class="field">
          <span>Тип перевірки</span>
          <select id="seoAuditMode">
            ${modeOptions.map(mode => `<option value="${attr(mode.id)}" ${mode.id === state.seoCenter.mode ? 'selected' : ''}>${escapeHtml(mode.label)}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>URL цього сайту</span>
          <input id="seoAuditTarget" value="${attr(target)}" placeholder="${attr(profile.url || '')}">
        </label>
      </div>
      <div class="button-row">
        <button class="button" type="button" id="runSeoAudit" ${active ? 'disabled' : ''}>${active ? 'Аудит уже виконується' : 'Запустити перевірку'}</button>
        <span class="muted-note">Дозволені лише URL профілю ${escapeHtml(profile.name)}. Ніяких записів на сайт.</span>
      </div>
      ${active ? renderSeoActiveJob(active) : ''}
    </article>

    <article class="card">
      <div class="section-head">
        <div>
          <p class="section-kicker">Google readiness</p>
          <h2>${seoGoogleHeading(google)}</h2>
          <p>${escapeHtml(google.description || '')}</p>
        </div>
        <span class="status-pill ${seoGoogleCoreReady(google) ? 'ok' : 'warn'}">${seoGoogleCoreReady(google) ? 'core ok' : `tier ${number(google.tier ?? -1)}`}</span>
      </div>
      <div class="source-grid compact-source-grid">
        ${renderSeoGoogleService('PageSpeed / CrUX', seoGooglePerformanceService(google))}
        ${renderSeoGoogleService('Search Console', google.services?.gsc)}
        ${renderSeoGoogleService('GA4', google.services?.ga4)}
      </div>
      <div class="button-row">
        <button class="button secondary" type="button" data-route="settings">Відкрити доступи</button>
      </div>
    </article>
  </section>

  <section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Пріоритети SEO-директора</p>
        <h2>Що робити спочатку</h2>
        <p>Не довіряємо автоматичній severity сліпо: індексація, продажі, заявки й Merchant важливіші за декоративні галочки.</p>
      </div>
    </div>
    <div class="priority-columns">
      ${renderSeoPriorityColumn('critical', priorities.critical)}
      ${renderSeoPriorityColumn('important', priorities.important)}
      ${renderSeoPriorityColumn('later', priorities.later)}
    </div>
  </section>

  <section class="card seo-agent-queue">
    <div class="section-head">
      <div>
        <p class="section-kicker">SEO control plane</p>
        <h2>Агенти читають сайт, створюють patches, вносять їх і вміють відкотити</h2>
        <p>Inventory охоплює товари, категорії, інформаційні сторінки, SEO URL, schema та технічні файли OpenCart. Після approval агенти можуть змінювати контентні поля, URL, status, керовану schema і дозволені theme/controller/robots/htaccess файли з backup, readback та rollback.</p>
      </div>
      <span class="status-pill ${controlPlan ? 'ok' : 'warn'}">${controlPlan ? 'inventory прочитано' : 'потрібен control scan'}</span>
    </div>
    <div class="metric-grid compact-metrics">
      ${renderMetric('Сутностей прочитано', number(controlPlan?.inventorySummary?.entities || 0), `${number(controlPlan?.inventorySummary?.products || 0)} товарів · ${number(controlPlan?.inventorySummary?.categories || 0)} категорій`)}
      ${renderMetric('Після approval', number(fixQueue.summary?.executable || 0), 'точні typed patches')}
      ${renderMetric('Потрібні докази/редактор', number(fixQueue.summary?.manual || 0), 'контент, links, assets, code review')}
      ${renderMetric('Чекають re-audit', number(fixQueue.summary?.verificationPending || 0), 'readback уже пройдено')}
    </div>
    ${controlPlan?.agents?.length ? `<div class="seo-agent-access-grid">
      ${asArray(controlPlan.agents).map(agent => `<article>
        <span class="status-pill ${agent.writeAccess === 'after_approval' ? 'ok' : 'warn'}">${escapeHtml(agent.writeAccess || '')}</span>
        <strong>${escapeHtml(agent.name || agent.id)}</strong>
        <small>${asArray(agent.surfaces).map(escapeHtml).join(' · ')}</small>
      </article>`).join('')}
    </div>` : ''}
    ${controlPlan?.capabilities?.length ? `<details class="seo-capabilities">
      <summary><strong>Які корисні SEO-зміни агенти можуть виконувати</strong><span>${number(controlPlan.capabilities.length)} напрямів</span></summary>
      <div class="seo-capability-grid">
        ${asArray(controlPlan.capabilities).map(capability => `<article>
          <span class="status-pill ok">${escapeHtml(capability.mode || '')}</span>
          <strong>${escapeHtml(capability.label || '')}</strong>
          <p>${escapeHtml(capability.impact || '')}</p>
        </article>`).join('')}
      </div>
    </details>` : ''}
    <div class="button-row">
      <button class="button" type="button" id="runSeoControlScan">Прочитати весь SEO-контур</button>
      <label class="field seo-batch-field">
        <span>Сторінок у погодженні</span>
        <select id="seoBatchEntities">
          ${SEO_AGENT_BATCH_LIMIT_OPTIONS.map(value => `<option value="${value}" ${seoAgentBatchLimit() === value ? 'selected' : ''}>до ${value}</option>`).join('')}
        </select>
      </label>
      <button class="button" type="button" data-seo-action="build-preview" ${!executableFixes || fixPreview ? 'disabled' : ''}>Підготувати точні SEO-зміни</button>
      <span class="muted-note">До ${number(data.safety?.maxEntitiesPerApproval || 50)} сторінок і ${number(data.safety?.maxChangesPerApproval || 100)} полів за approval. Виконання — чанками по ${number(data.safety?.executionChunkSize || 5)} сторінок.</span>
    </div>
    ${fixPreview ? renderSeoFixPreview(fixPreview, activeApproval) : ''}
    ${latestWriteRun ? renderSeoWriteRun(latestWriteRun) : ''}
    <div class="split-line"></div>
    <div class="audit-actions-list seo-fix-queue-list">
      ${asArray(fixQueue.items).length
        ? asArray(fixQueue.items).slice(0, 18).map(renderSeoQueueAction).join('')
        : renderEmptyMini('Черга порожня', 'Запустіть аудит конкретної сторінки або повний аудит сайту.')}
    </div>
  </section>

  <section class="seo-control-grid">
    <article class="card">
      <div class="section-head">
        <div>
          <p class="section-kicker">Останній аудит</p>
          <h2>${latest ? `${escapeHtml(latest.modeLabel)} · ${number(latest.summary?.score || 0)}/100` : 'Ще немає запуску'}</h2>
          <p>${latest ? `${escapeHtml(latest.target)} · ${escapeHtml(seoDate(latest.completedAt))}` : 'Запустіть read-only аудит вище.'}</p>
        </div>
      </div>
      <div class="audit-actions-list">
        ${actionPlan.length ? actionPlan.map(renderSeoAuditAction).join('') : renderEmptyMini('Немає нових сигналів', 'Після аудиту тут будуть конкретні проблеми, вплив і потреба ручної перевірки.')}
      </div>
    </article>
    <article class="card">
      <div class="section-head">
        <div>
          <p class="section-kicker">Щотижневий цикл</p>
          <h2>Контроль без SEO-сміття</h2>
          <p>Кожна перевірка залишає історію. Контент не створюється автоматично.</p>
        </div>
      </div>
      <div class="weekly-check-list">
        ${weekly.length ? weekly.map(renderSeoWeeklyCheck).join('') : renderEmptyMini('План ще завантажується', 'Оновіть SEO Center.')}
      </div>
    </article>
  </section>

  <section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Історія</p>
        <h2>Що перевіряли і коли</h2>
      </div>
    </div>
    <div class="seo-history">${jobs.length ? jobs.map(renderSeoHistoryRow).join('') : renderEmptyMini('Історія порожня', 'Перший запуск створить baseline для наступних порівнянь.')}</div>
  </section>

  <details class="card seo-workbench-details">
    <summary><strong>Редактор сторінок і безпечний publish</strong><span>старий робочий потік збережено</span></summary>
    <div class="split-line"></div>
    ${renderSeoContentWorkbench()}
  </details>`;
}

function seoPreviewStats(preview = {}) {
  preview = preview || {};
  const changes = asArray(preview.changes);
  const targets = new Set(changes.map(change => change.target || `${change.entityType || 'entity'}:${change.entityId || ''}`).filter(Boolean));
  const agents = new Set(changes.map(change => change.agent || change.task || 'SEO Agent').filter(Boolean));
  const fields = new Set(changes.map(change => change.field || change.task || change.category || 'field').filter(Boolean));
  return {
    changes,
    changeCount: Number(preview.actionCount || changes.length || 0),
    entityCount: Number(preview.entityCount || targets.size || preview.actionCount || 0),
    targetCount: targets.size,
    agentCount: agents.size,
    fieldCount: fields.size
  };
}

const SEO_AGENT_BATCH_LIMIT_OPTIONS = [10, 25, 50];

function seoAgentBatchLimit() {
  const candidate = Number(state.seoCenter.agentBatchLimit || 10);
  return SEO_AGENT_BATCH_LIMIT_OPTIONS.includes(candidate) ? candidate : 10;
}

function seoSetAgentBatchLimit(value) {
  const candidate = Number(value || 10);
  state.seoCenter.agentBatchLimit = SEO_AGENT_BATCH_LIMIT_OPTIONS.includes(candidate) ? candidate : 10;
  state.seoCenter.batchEntities = state.seoCenter.agentBatchLimit;
}

function renderSeoBatchLimitControl() {
  const current = seoAgentBatchLimit();
  return `<div class="seo-batch-limit-control" aria-label="Розмір SEO batch">
    <span>Batch:</span>
    ${SEO_AGENT_BATCH_LIMIT_OPTIONS.map(value => `<button class="button tiny ${current === value ? '' : 'secondary'}" type="button" data-seo-batch-limit="${value}">${value}</button>`).join('')}
  </div>`;
}

function seoPreviewChangeKey(change = {}, index = 0) {
  if (change.changeKey) return String(change.changeKey);
  return [
    change.sourceActionId || change.actionId || change.stableActionKey || '',
    change.target || change.file || `${change.entityType || ''}:${change.entityId || ''}`,
    change.field || change.task || change.category || '',
    index
  ].map(value => String(value || '')).join('|');
}

function renderSeoActionStep({ number: stepNumber, title, body, button, tone = 'warn', done = false, current = false }) {
  const buttonAttr = button?.agentDraftActionId
    ? `data-seo-agent-draft="${attr(button.agentDraftActionId)}"`
    : button?.agentDraftBatch
      ? `data-seo-agent-draft-batch="1" data-seo-agent-draft-limit="${attr(button.limit || seoAgentBatchLimit())}"`
    : `data-seo-action="${attr(button?.action || '')}"`;
  return `<article class="seo-action-step ${current ? 'is-current' : ''} ${done ? 'is-done' : ''}">
    <span class="status-pill ${done ? 'ok' : tone}">${done ? 'готово' : `крок ${number(stepNumber)}`}</span>
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(body)}</p>
    ${button ? `<button class="button ${button.secondary ? 'secondary' : ''}" type="button" ${buttonAttr} ${button.disabled ? 'disabled' : ''}>${escapeHtml(button.label)}</button>` : ''}
  </article>`;
}

function renderSeoScopeCard({ label, title, body, tone = 'ok' }) {
  return `<article>
    <span class="status-pill ${tone}">${escapeHtml(label)}</span>
    <strong>${escapeHtml(title)}</strong>
    <p>${escapeHtml(body)}</p>
  </article>`;
}

function seoMissionDefinitions() {
  return [
    {
      id: 'on_page',
      label: 'On-page поля',
      agent: 'On-page Agent',
      tone: 'ok',
      categories: ['on_page'],
      fields: ['meta_title', 'meta_description', 'meta_h1'],
      writeSurface: 'OpenCart entity_patch',
      body: 'SEO title, meta description і H1. Це найшвидший safe batch для CTR і базової релевантності.'
    },
    {
      id: 'schema',
      label: 'Schema.org',
      agent: 'Schema Agent',
      tone: 'ok',
      categories: ['schema'],
      fields: ['schema_type', 'product_schema'],
      writeSurface: 'managed_schema',
      body: 'WebPage, CollectionPage, Product/Offer та Breadcrumb/Organization без вигаданих Review/AggregateRating.'
    },
    {
      id: 'indexation',
      label: 'SEO URL / canonical / indexation',
      agent: 'Indexation Agent',
      tone: 'warn',
      categories: ['indexation'],
      fields: ['seo_keyword', 'canonical', 'status', 'noindex', 'robots'],
      writeSurface: 'entity_patch або technical file patch',
      body: 'SEO URL, canonical, status/noindex, robots/sitemap. Не чіпаємо URL без доказу, щоб не створити биті сторінки.'
    },
    {
      id: 'descriptions',
      label: 'Описи сторінок',
      agent: 'Content Quality Agent',
      tone: 'warn',
      categories: ['content'],
      fields: ['description'],
      writeSurface: 'agent draft → description entity_patch',
      body: 'Описи товарів, категорій та інформаційних сторінок. Спершу агент читає фактичний HTML і тільки тоді готує diff.'
    },
    {
      id: 'internal_links',
      label: 'Внутрішні посилання',
      agent: 'Internal Linking Agent',
      tone: 'warn',
      categories: ['internal_links'],
      fields: ['internal_links', 'description'],
      writeSurface: 'agent draft → description HTML diff',
      body: 'Додає природні посилання на дозволені товари/категорії. Потребує evidence, щоб не лінкувати випадково.'
    },
    {
      id: 'technical_files',
      label: 'Технічні файли після approval',
      agent: 'Technical SEO Agent',
      tone: 'warn',
      categories: ['technical', 'performance', 'geo'],
      fields: ['file_content', 'content'],
      writeSurface: 'file_patch + file hash readback',
      body: 'robots.txt, .htaccess, theme/controller/Twig/CSS/JS patches. Тільки мінімальний diff, syntax check, readback і rollback.'
    }
  ];
}

function seoMissionById(id = '') {
  return seoMissionDefinitions().find(mission => mission.id === id) || null;
}

function seoMissionMatches(action = {}, mission = {}) {
  if (!action || !mission) return false;
  const categories = asArray(mission.categories);
  const fields = asArray(mission.fields);
  const actionField = action.field || action.task || '';
  const actionCategory = action.category || '';
  const categoryMatch = !categories.length || categories.includes(actionCategory);
  const fieldMatch = !fields.length || fields.includes(actionField);
  return categoryMatch || fieldMatch;
}

function seoMissionActionIds(fixQueue = {}, missionId = '') {
  const mission = seoMissionById(missionId);
  if (!mission) return [];
  return asArray(fixQueue.proposals || fixQueue.items)
    .filter(action =>
      action.execution === 'automatic_after_approval'
      && !['verification_pending', 'verification_review'].includes(action.status)
      && seoMissionMatches(action, mission)
    )
    .map(action => action.id)
    .filter(Boolean);
}

function seoMissionStats(fixQueue = {}, mission = {}) {
  const proposals = asArray(fixQueue.proposals || fixQueue.items).filter(action =>
    action.execution === 'automatic_after_approval'
    && !['verification_pending', 'verification_review'].includes(action.status)
    && seoMissionMatches(action, mission)
  );
  const tasks = asArray(fixQueue.tasks || fixQueue.items).filter(action =>
    action.execution !== 'automatic_after_approval'
    && !['verification_pending', 'verification_review'].includes(action.status)
    && !seoIsLowConversionTrustAction(action)
    && seoCanDraftAction(action)
    && seoMissionMatches(action, mission)
  );
  const firstProposal = proposals[0] || null;
  const firstTask = tasks.find(task => task.execution !== 'capability_only') || tasks[0] || null;
  const targets = new Set([...proposals, ...tasks].map(action => action.target).filter(Boolean));
  return {
    proposals,
    tasks,
    firstProposal,
    firstTask,
    targetCount: targets.size,
    autoCount: proposals.length,
    draftCount: tasks.length
  };
}

function renderSeoMissionCard({ mission, fixQueue, fixPreview, active }) {
  const stats = seoMissionStats(fixQueue, mission);
  const selectedBatchLimit = seoAgentBatchLimit();
  const canBuild = stats.autoCount > 0 && !fixPreview && !active;
  const canDraft = Boolean(stats.firstTask?.id) && !active && (!fixPreview || fixPreview.status === 'pending_approval');
  const sample = stats.firstProposal || stats.firstTask;
  const blocked = !stats.autoCount && !stats.draftCount;
  const draftButton = mission.id === 'internal_links'
    ? `<button class="button secondary" type="button" data-seo-agent-draft-batch="1" data-seo-agent-draft-limit="${attr(selectedBatchLimit)}" ${canDraft ? '' : 'disabled'}>Агент готує batch ${number(selectedBatchLimit)}</button>`
    : `<button class="button secondary" type="button" data-seo-agent-draft="${attr(stats.firstTask?.id || '')}" ${canDraft ? '' : 'disabled'}>Агент читає й готує patch</button>`;
  return `<article class="seo-mission-card ${blocked ? 'is-empty' : ''}">
    <div class="seo-mission-head">
      <span class="status-pill ${blocked ? 'bad' : mission.tone || 'warn'}">${blocked ? 'немає задач' : escapeHtml(mission.agent)}</span>
      <strong>${escapeHtml(mission.label)}</strong>
    </div>
    <p>${escapeHtml(mission.body)}</p>
    <div class="seo-mission-facts">
      <span class="tag ok">готові patches: ${number(stats.autoCount)}</span>
      <span class="tag warn">agent draft: ${number(stats.draftCount)}</span>
      <span class="tag">цілей: ${number(stats.targetCount)}</span>
    </div>
    <small><b>Поверхня запису:</b> ${escapeHtml(mission.writeSurface)}</small>
    ${sample ? `<small><b>Приклад:</b> ${escapeHtml(sample.target || sample.issue || '')}</small>` : `<small>Потрібен свіжий аудит або control scan, щоб зʼявилися конкретні задачі.</small>`}
    <div class="button-row">
      <button class="button" type="button" data-seo-action="build-preview" data-seo-mission="${attr(mission.id)}" ${canBuild ? '' : 'disabled'}>Підготувати batch</button>
      ${draftButton}
    </div>
  </article>`;
}

function renderSeoAgentMissionPanel({ fixQueue = {}, controlPlan = null, fixPreview = null, active = null }) {
  const missions = seoMissionDefinitions();
  const totalAuto = missions.reduce((sum, mission) => sum + seoMissionStats(fixQueue, mission).autoCount, 0);
  const totalDraft = missions.reduce((sum, mission) => sum + seoMissionStats(fixQueue, mission).draftCount, 0);
  return `<section class="card seo-agent-missions">
    <div class="section-head">
      <div>
        <p class="section-kicker">Повноваження агентів</p>
        <h2>Що саме агенти можуть міняти зараз</h2>
        <p>Це не список “колись буде”. Тут видно, де вже є typed patches для batch, а де агент спершу має прочитати сутність або файл і підготувати точний diff.</p>
      </div>
      <span class="status-pill ${controlPlan ? 'ok' : 'warn'}">${controlPlan ? `${number(totalAuto)} patches · ${number(totalDraft)} drafts` : 'потрібен control scan'}</span>
    </div>
    <div class="seo-mission-grid">
      ${missions.map(mission => renderSeoMissionCard({ mission, fixQueue, fixPreview, active })).join('')}
    </div>
    <p class="muted-note">Якщо в картці 0 готових patches — це не прихована функція, а відсутність підтвердженого diff у поточному scan. Для описів, internal links і технічних файлів кнопка agent draft створює один перевіряємий patch перед approval.</p>
  </section>`;
}

function renderSeoActionDock({ data, controlPlan, fixQueue, fixPreview, activeApproval, active, executableFixes }) {
  const stats = seoPreviewStats(fixPreview);
  const maxEntities = Number(data.safety?.maxEntitiesPerApproval || 50);
  const maxChanges = Number(data.safety?.maxChangesPerApproval || 100);
  const chunkSize = Number(data.safety?.executionChunkSize || 5);
  const selectedBatchLimit = seoAgentBatchLimit();
  const hasInventory = Boolean(controlPlan);
  const hasExecutable = Number(executableFixes || fixQueue.summary?.executable || 0) > 0;
  const draftAction = seoFirstDraftAction(fixQueue, data);
  const draftCount = seoDraftableActions(fixQueue).length;
  const batchDraftCount = seoDraftBatchActions(fixQueue, data, selectedBatchLimit).length;
  const hasDraftable = Boolean(draftAction);
  const canPrepare = hasInventory && hasExecutable && !fixPreview && !active;
  const canDraft = hasInventory && hasDraftable && !active && (!fixPreview || fixPreview.status === 'pending_approval');
  const canApprove = fixPreview?.status === 'pending_approval';
  const canApply = Boolean(activeApproval?.id) && fixPreview?.status === 'approved';
  const currentStep = active
    ? 'read'
    : !hasInventory
      ? 'read'
      : fixPreview
        ? canApply ? 'apply' : 'approve'
        : hasExecutable
          ? 'prepare'
          : hasDraftable
            ? 'prepare'
            : 'read';
  const previewLabel = fixPreview
    ? `${number(stats.changeCount)} змін · ${number(stats.entityCount)} сторінок/файлів · ${escapeHtml(fixPreview.status || '')}`
    : hasExecutable
      ? `${number(executableFixes)} точних змін можна підготувати`
      : hasDraftable
        ? `${number(draftCount)} задачі потребують agent draft: спершу читання джерела, потім diff і approval`
        : 'Немає готового batch — потрібен аудит або докази';
  const prepareButton = hasExecutable
    ? { action: 'build-preview', label: 'Підготувати точні SEO-зміни', disabled: !canPrepare }
    : hasDraftable
      ? { agentDraftBatch: true, limit: selectedBatchLimit, label: `Агент підготує batch до ${number(Math.min(batchDraftCount || selectedBatchLimit, selectedBatchLimit))}`, disabled: !canDraft }
      : { action: 'build-preview', label: 'Підготувати точні SEO-зміни', disabled: true };

  return `<section class="card seo-action-dock">
    <div class="section-head">
      <div>
        <p class="section-kicker">SEO cockpit</p>
        <h2>Один порядок дій: прочитати → підготувати → підтвердити → внести</h2>
        <p>Так, зміни вносяться пачками після “Підготувати точні зміни”. Але preview — це ще не запис: live-зміна дозволена тільки після approval, backup, readback і повторної перевірки.</p>
      </div>
      <span class="status-pill ${fixPreview ? 'warn' : hasInventory ? 'ok' : 'warn'}">${fixPreview ? 'preview чекає рішення' : hasInventory ? 'inventory готовий' : 'потрібен scan'}</span>
    </div>
    ${renderSeoBatchLimitControl()}
    <div class="seo-action-steps">
      ${renderSeoActionStep({
        number: 1,
        title: 'Прочитати SEO-контур',
        body: hasInventory ? `${number(controlPlan?.inventorySummary?.entities || 0)} сутностей уже прочитано.` : 'Товари, категорії, сторінки, SEO URL, schema і дозволені файли OpenCart.',
        done: hasInventory,
        current: currentStep === 'read',
        button: { action: 'control-scan', label: hasInventory ? 'Перечитати контур' : 'Прочитати весь SEO-контур', secondary: hasInventory, disabled: Boolean(active) }
      })}
      ${renderSeoActionStep({
        number: 2,
        title: 'Підготувати точні зміни',
        body: previewLabel,
        done: Boolean(fixPreview),
        current: currentStep === 'prepare',
        button: prepareButton
      })}
      ${renderSeoActionStep({
        number: 3,
        title: 'Підтвердити batch',
        body: fixPreview ? 'Перевір згрупований diff нижче. Підтвердження ще не пише на сайт.' : 'Спочатку потрібен точний preview.',
        done: fixPreview?.status === 'approved',
        current: currentStep === 'approve',
        button: { action: 'approve', label: 'Підтвердити ці зміни', disabled: !canApprove }
      })}
      ${renderSeoActionStep({
        number: 4,
        title: 'Внести й перевірити readback',
        body: `Ліміт: до ${number(maxEntities)} сторінок / ${number(maxChanges)} полів за approval; виконання чанками по ${number(chunkSize)}.`,
        tone: 'ok',
        current: currentStep === 'apply',
        button: { action: 'apply', label: 'Внести й перевірити', disabled: !canApply, secondary: !canApply }
      })}
    </div>
    <div class="seo-agent-scope">
      <div>
        <h3>Ні, агенти не мають міняти тільки бренд</h3>
        <p>На скріні видно лише поточний preview. Нормальний SEO-контур має працювати з усіма полями, де є факти й безпечний спосіб readback.</p>
      </div>
      <div class="seo-scope-grid">
        ${renderSeoScopeCard({ label: 'content', title: 'On-page і контентні поля', body: 'Title, meta description, H1, описи товарів/категорій/інфосторінок. Внутрішні посилання в товарні описи не пишемо; для товарів потрібні шаблонні UX-блоки.' })}
        ${renderSeoScopeCard({ label: 'schema', title: 'Schema.org', body: 'WebPage, CollectionPage, Product, Offer, Breadcrumb, Organization. Без вигаданих Review/AggregateRating/FAQ.' })}
        ${renderSeoScopeCard({ label: 'indexation', title: 'Індексація і техніка', body: 'SEO URL, canonical, status/noindex, robots/htaccess/theme/controller patches — тільки якщо це дозволена поверхня.' })}
        ${renderSeoScopeCard({ label: 'merchant', title: 'Ecommerce / Merchant', body: 'Feed-поля, варіанти, brand, identifier policy і товарні блокери — у Merchant Feed модулі, не впереміш із SEO preview.' })}
        ${renderSeoScopeCard({ label: 'blocked', title: 'Що не вигадуємо', body: 'Ціну, залишок, GTIN, відгуки, рейтинг і гарантії агент не має створювати з повітря.', tone: 'warn' })}
      </div>
    </div>
  </section>`;
}

function renderSeoIntelligence(intelligence = {}) {
  const sources = asArray(intelligence.sources);
  const agents = asArray(intelligence.agents);
  const objectives = asArray(intelligence.conversionObjectives);
  const tasks = asArray(intelligence.tasks).slice(0, 8);
  const liveDocs = Boolean(intelligence.liveDocs);
  const checkedAt = intelligence.checkedAt ? seoDate(intelligence.checkedAt) : 'ще не перевіряли';
  return `<section class="card seo-intelligence-card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Growth Intelligence</p>
        <h2>Агенти стежать за правилами Google/OpenAI і працюють на конверсії</h2>
        <p>Цей шар читає офіційні джерела, ловить зміни в правилах, перетворює їх у задачі для Merchant/SEO/GEO агентів і не пише на сайт без твого approval.</p>
      </div>
      <span class="status-pill ${liveDocs ? 'ok' : 'warn'}">${liveDocs ? 'live docs' : 'baseline'}</span>
    </div>
    <div class="metric-grid compact-metrics">
      ${renderMetric('Офіційні джерела', number(intelligence.sourceCount || sources.length || 0), `${number(intelligence.changedCount || 0)} змін · ${number(intelligence.failedCount || 0)} недоступні`)}
      ${renderMetric('Конверсійні цілі', number(objectives.length), 'organic sales, cart, Merchant, AI Search')}
      ${renderMetric('Агенти росту', number(agents.length), 'read-only + after approval')}
      ${renderMetric('Перевірено', checkedAt, intelligence.operatingModel?.suggestedSchedule || 'nightly-ready')}
    </div>
    <div class="button-row">
      <button class="button" type="button" id="refreshSeoIntelligence">Оновити правила Google/AI</button>
      <button class="button secondary" type="button" id="runSeoControlScanFromIntelligence">Прочитати весь SEO-контур</button>
      <span class="muted-note">Google AI Search спирається на індексацію і якість. Для ChatGPT Search критичний OAI-SearchBot. llms.txt — допоміжно для не-Google систем, не магічний фактор Google.</span>
    </div>
    <div class="seo-intelligence-grid">
      <article>
        <h3>Офіційні джерела під наглядом</h3>
        <div class="tiny-list">
          ${sources.length ? sources.map(source => `<span class="tag ${source.ok ? 'ok' : 'warn'}">${escapeHtml(source.owner || '')}: ${escapeHtml(source.title || source.id)}${source.changedSinceLastCheck ? ' · changed' : ''}</span>`).join('') : '<span class="tag warn">Натисніть “Оновити правила Google/AI”</span>'}
        </div>
      </article>
      <article>
        <h3>Що оптимізуємо</h3>
        <div class="tiny-list">
          ${objectives.map(item => `<span class="tag ok">${escapeHtml(item.label || item.id)}</span>`).join('') || '<span class="tag warn">Потрібні GA4/GSC цілі</span>'}
        </div>
      </article>
    </div>
    <div class="seo-growth-agent-grid">
      ${agents.map(agent => `<article>
        <span class="status-pill ${agent.writeAccess === 'after_approval' ? 'ok' : 'warn'}">${escapeHtml(agent.writeAccess || '')}</span>
        <strong>${escapeHtml(agent.name || agent.id)}</strong>
        <p>${escapeHtml(agent.responsibility || '')}</p>
      </article>`).join('')}
    </div>
    <div class="audit-actions-list seo-growth-task-list">
      ${tasks.length ? tasks.map(task => `<article class="audit-action">
        <span class="status-pill ${seoPriorityTone(task.priority)}">${seoPriorityLabel(task.priority)}</span>
        <div>
          <div class="seo-agent-line">
            <strong>${escapeHtml(task.agent || 'Growth Agent')}</strong>
            <span class="status-pill ${task.execution === 'after_approval' ? 'ok' : 'warn'}">${escapeHtml(task.execution || 'read_only')}</span>
          </div>
          <h3>${escapeHtml(task.issue || '')}</h3>
          <p><b>Що робити:</b> ${escapeHtml(task.recommendedAction || '')}</p>
          <p><b>Поверхня зміни:</b> ${escapeHtml(task.writeSurface || '')}</p>
          <small>${escapeHtml(task.verification || '')}</small>
        </div>
      </article>`).join('') : renderEmptyMini('Rules baseline ще не створений', 'Оновіть правила Google/AI.')}
    </div>
  </section>`;
}

function renderSeoOperatorBoard({ data, profile, google, controlPlan, fixQueue, fixPreview, activeApproval, active }) {
  const executable = Number(fixQueue.summary?.executable || 0);
  const manual = Number(fixQueue.summary?.manual || fixQueue.summary?.needsEvidenceOrEditor || 0);
  const verificationPending = Number(fixQueue.summary?.verificationPending || 0);
  const next = active
    ? ['Зачекати завершення аудиту', active.target || profile.url || '']
    : !controlPlan
      ? ['Прочитати весь SEO-контур', 'Inventory товарів, категорій, сторінок, schema і технічних файлів.']
      : fixPreview
        ? [activeApproval ? 'Внести погоджені зміни' : 'Підтвердити preview', 'Після цього буде readback і повторна перевірка.']
        : executable
          ? ['Підготувати точні SEO-зміни', `${number(executable)} typed patches доступні після approval.`]
          : verificationPending
            ? ['Запустити re-audit', `${number(verificationPending)} змін чекають контрольної перевірки.`]
            : ['Запустити цільовий аудит', 'Оберіть сторінку або щотижневий набір перевірок.'];
  const canWrite = Boolean(controlPlan && executable);
  const googleCoreReady = seoGoogleCoreReady(google);
  const googlePerformanceReady = seoGooglePerformanceReady(google);
  const googleBlocked = !googleCoreReady;
  const googleDataStatus = googleCoreReady
    ? (googlePerformanceReady ? 'Google data ok' : 'GSC/GA4 ok · CWV key потрібен')
    : 'бракує API';
  const googleDataText = googleCoreReady
    ? (googlePerformanceReady
        ? 'Google API підключені; можна привʼязувати зміни до кліків, позицій, швидкості і конверсій.'
        : 'GSC і GA4 підключені; можна працювати з кліками, позиціями і конверсіями. Для реальних CWV/PageSpeed ще потрібен GOOGLE_API_KEY.')
    : 'GSC/GA4/CrUX не підключені: система бачить техніку і OpenCart, але не бачить реальні кліки, позиції та конверсії.';
  return `<section class="card operator-board">
    <div class="section-head">
      <div>
        <p class="section-kicker">Що робити зараз</p>
        <h2>${escapeHtml(next[0])}</h2>
        <p>${escapeHtml(next[1])}</p>
      </div>
      <span class="status-pill ${canWrite ? 'ok' : 'warn'}">${canWrite ? 'може готувати зміни' : 'спочатку докази'}</span>
    </div>
    <div class="operator-grid">
      <article>
        <span class="status-pill ok">read</span>
        <strong>Що агенти читають</strong>
        <p>OpenCart товари/категорії/сторінки, SEO URL, schema, sitemap/robots/технічні файли, live HTML і результати аудитів.</p>
      </article>
      <article>
        <span class="status-pill ${canWrite ? 'ok' : 'warn'}">write after approval</span>
        <strong>Що можуть змінювати</strong>
        <p>Title/meta/H1/описи, canonical/SEO URL/status, керовану schema, інформаційні/категорійні внутрішні посилання та robots/htaccess/theme patches — тільки через preview, approval, backup і readback.</p>
      </article>
      <article>
        <span class="status-pill warn">не автоматично</span>
        <strong>Що не робимо на автопілоті</strong>
        <p>Масові SEO-статті, вигадані відгуки/rating, вигадані GTIN/MPN, live publish без підтвердження, зміни без rollback.</p>
      </article>
      <article>
        <span class="status-pill ${googleBlocked ? 'warn' : 'ok'}">${googleDataStatus}</span>
        <strong>Що блокує кращі рішення</strong>
        <p>${googleDataText}</p>
      </article>
    </div>
    <div class="tiny-list">
      <span class="tag">executable: ${number(executable)}</span>
      <span class="tag">manual/evidence: ${number(manual)}</span>
      <span class="tag">verification: ${number(verificationPending)}</span>
      <span class="tag">approval limit: до ${number(data.safety?.maxEntitiesPerApproval || 50)} сторінок</span>
    </div>
  </section>`;
}

function renderSeoActiveJob(job) {
  return `<div class="audit-running">
    <span class="audit-spinner" aria-hidden="true"></span>
    <div>
      <strong>${escapeHtml(job.siteName || '')} · ${escapeHtml(job.modeLabel || '')}</strong>
      <p>${escapeHtml(job.target || '')}</p>
      <small>Почато ${escapeHtml(seoDate(job.startedAt))}. Можна перейти в інший модуль — сервер продовжить аудит.</small>
    </div>
  </div>`;
}

function renderSeoGoogleService(label, service = {}) {
  const ready = Boolean(service?.available);
  return `<article class="source-card ${ready ? 'ok' : 'needed'}">
    <span class="status-pill ${ready ? 'ok' : 'warn'}">${ready ? 'Працює' : 'Потрібно'}</span>
    <h3>${escapeHtml(label)}</h3>
    <p>${escapeHtml(ready ? service.method || 'підключено' : service.error || 'Доступ ще не додано.')}</p>
  </article>`;
}

function renderSeoPriorityColumn(priority, items = []) {
  return `<article class="priority-column ${attr(priority)}">
    <span class="status-pill ${seoPriorityTone(priority)}">${seoPriorityLabel(priority)}</span>
    <div class="priority-list">${asArray(items).map(item => `<div><strong>${escapeHtml(item)}</strong></div>`).join('') || '<div>Немає задач.</div>'}</div>
  </article>`;
}

function renderSeoAuditAction(action) {
  return `<article class="audit-action">
    <span class="status-pill ${seoPriorityTone(action.priority)}">${seoPriorityLabel(action.priority)}</span>
    <div>
      <strong>${escapeHtml(action.issue)}</strong>
      <p>${escapeHtml(action.impact || '')}</p>
      ${action.verificationRequired ? '<small>Потрібна ручна перевірка перед будь-якою зміною.</small>' : ''}
    </div>
  </article>`;
}

function seoExecutionLabel(action = {}) {
  if (action.status === 'verification_review') return 'потрібна перевірка';
  if (action.reopenedAfterVerification) return 'повторно після scan';
  if (action.status === 'verification_pending') return 're-audit';
  return action.execution === 'automatic_after_approval' ? 'після approval' : 'ручна технічна задача';
}

function renderSeoQueueAction(action) {
  const automatic = action.execution === 'automatic_after_approval';
  const draftable = seoCanDraftAction(action);
  return `<article class="audit-action seo-queue-action ${automatic ? 'is-executable' : ''}">
    <span class="status-pill ${seoPriorityTone(action.priority)}">${seoPriorityLabel(action.priority)}</span>
    <div>
      <div class="seo-agent-line">
        <strong>${escapeHtml(action.agent || 'SEO Agent')}</strong>
        <span class="status-pill ${automatic ? 'ok' : 'warn'}">${escapeHtml(seoExecutionLabel(action))}</span>
      </div>
      <h3>${escapeHtml(action.issue)}</h3>
      <p><b>Де:</b> ${escapeHtml(action.target || '')}</p>
      <p><b>Що робить:</b> ${escapeHtml(action.recommendedAction || '')}</p>
      <p><b>Вплив:</b> ${escapeHtml(action.impact || '')}</p>
      <small>${escapeHtml(action.verification || action.reasonManual || '')}</small>
      ${draftable ? `<button class="button secondary seo-agent-draft-button" type="button" data-seo-agent-draft="${attr(action.id)}">Нехай агент прочитає джерело й підготує patch</button>` : ''}
    </div>
  </article>`;
}

function seoFieldLabel(field = '') {
  const labels = {
    meta_title: 'SEO title',
    meta_description: 'Meta description',
    meta_h1: 'H1',
    description: 'Опис',
    seo_keyword: 'SEO URL',
    canonical: 'Canonical',
    status: 'Status / indexation',
    schema_type: 'Schema type',
    schema_json_ld: 'JSON-LD schema',
    internal_links: 'Внутрішні посилання',
    image_alt: 'Alt зображень'
  };
  return labels[field] || field.replace(/_/g, ' ') || 'поле';
}

function seoChangeHumanField(change = {}) {
  const field = change.field || change.task || change.category || '';
  const category = change.category || '';
  if (category === 'internal_links') return 'Блок внутрішніх посилань';
  if (category === 'content' && field === 'description') return 'Контентний блок/опис';
  if (category === 'schema') return 'Schema.org';
  if (category === 'indexation') return 'Індексація / URL';
  return seoFieldLabel(field);
}

function seoEntityTypeLabel(type = '') {
  const labels = {
    product: 'товар',
    category: 'категорія',
    information: 'інфосторінка',
    info: 'інфосторінка',
    file: 'технічний файл',
    technical: 'технічний файл'
  };
  return labels[type] || type || 'сторінка';
}

function seoChangeGroupHumanLabel(group = {}) {
  return seoChangeHumanField({
    field: group.field,
    category: group.category,
    task: group.field
  });
}

function seoChangeGroups(changes = []) {
  const groups = new Map();
  asArray(changes).forEach((change, index) => {
    const agent = change.agent || change.task || 'SEO Agent';
    const field = change.field || change.task || change.category || 'field';
    const key = `${agent}::${field}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        agent,
        field,
        category: change.category || '',
        executor: change.executor || '',
        changes: [],
        targets: new Set()
      });
    }
    const group = groups.get(key);
    group.changes.push({ ...change, __previewIndex: index });
    if (change.target) group.targets.add(change.target);
    if (!group.category && change.category) group.category = change.category;
    if (!group.executor && change.executor) group.executor = change.executor;
  });
  return Array.from(groups.values()).sort((a, b) => b.changes.length - a.changes.length || String(a.agent).localeCompare(String(b.agent)));
}

function seoChangeValue(value, emptyLabel = 'порожньо') {
  if (value === false || value === true) return String(value);
  if (value === null || value === undefined || value === '') return emptyLabel;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
  }
  return String(value);
}

function decodeSeoHtml(value) {
  let textValue = seoChangeValue(value, '');
  for (let index = 0; index < 4; index += 1) {
    const next = textValue
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
        const code = Number.parseInt(hex, 16);
        return Number.isFinite(code) ? String.fromCharCode(code) : _;
      })
      .replace(/&#(\d+);/g, (_, numberValue) => {
        const code = Number.parseInt(numberValue, 10);
        return Number.isFinite(code) ? String.fromCharCode(code) : _;
      })
      .replace(/&(lt|gt|quot|apos|nbsp|amp);/gi, match => ({
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&apos;': "'",
        '&nbsp;': ' ',
        '&amp;': '&'
      }[match.toLowerCase()] || match))
      .replace(/&#039;/g, "'");
    if (next === textValue) break;
    textValue = next;
  }
  return textValue;
}

function seoLooksLikeHtml(value) {
  return /<\/?[a-z][\s\S]*>/i.test(String(value || ''));
}

function seoIsHttpTarget(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function seoIsTechnicalTemplateChange(change = {}) {
  const targetText = [
    change.target,
    change.file,
    change.path,
    change.entityType,
    change.executor,
    change.category,
    change.field,
    change.task
  ].map(value => String(value || '')).join(' ');
  const before = decodeSeoHtml(change.before);
  const after = decodeSeoHtml(change.after);
  const sourceText = `${before}\n${after}`;
  const hasFilePatchExecutor = /\bfile_patch\b|\bfile_content\b/i.test(targetText);
  const hasFileTarget = /(?:^|[\/\s])(?:robots\.txt|llms\.txt|sitemap\.xml|\.htaccess)\b/i.test(targetText)
    || /\.(?:twig|tpl|liquid|php|js|css|scss|less|json|xml|txt|conf|nginx|apache)(?:$|\b|[?#])/i.test(targetText);
  const hasTemplateSyntax = /<\?php\b|{%\s|{{\s|{#|%}|}}/i.test(sourceText);
  if (hasFilePatchExecutor || hasFileTarget) return true;
  return !seoIsHttpTarget(change.target || '') && hasTemplateSyntax;
}

function stripSeoManagedTechnicalBlocks(html) {
  return String(html || '')
    .replace(/<!--\s*MERCATO_AI_[A-Z0-9_-]*_SCHEMA_START\s*-->[\s\S]*?<!--\s*MERCATO_AI_[A-Z0-9_-]*_SCHEMA_END\s*-->/gi, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .trim();
}

function extractSeoMarkedBlock(html, blockName) {
  const escapedBlock = String(blockName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`<!--\\s*MERCATO_AI_${escapedBlock}_START\\s*-->([\\s\\S]*?)<!--\\s*MERCATO_AI_${escapedBlock}_END\\s*-->`, 'i');
  return String(html || '').match(expression)?.[1]?.trim() || '';
}

function sanitizeSeoVisualHtml(html) {
  return stripSeoManagedTechnicalBlocks(html)
    .replace(/<\/?(iframe|object|embed|form|input|button|textarea|select|option|link|meta)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"')
    .replace(/\s(href|src)\s*=\s*javascript:[^\s>]*/gi, ' $1="#"')
    .replace(/<a\b([^>]*)>/gi, (_, attributes = '') => {
      let cleanAttributes = attributes;
      if (!/\btarget\s*=/i.test(cleanAttributes)) cleanAttributes += ' target="_blank"';
      if (!/\brel\s*=/i.test(cleanAttributes)) cleanAttributes += ' rel="noopener"';
      return `<a${cleanAttributes}>`;
    });
}

function seoTextFromHtml(html) {
  return stripSeoManagedTechnicalBlocks(decodeSeoHtml(html))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function seoChangedHtmlFragment(change) {
  if (seoIsTechnicalTemplateChange(change)) return null;
  const before = stripSeoManagedTechnicalBlocks(decodeSeoHtml(change.before));
  const after = stripSeoManagedTechnicalBlocks(decodeSeoHtml(change.after));
  if (!after) return null;

  const internalLinksBlock = extractSeoMarkedBlock(after, 'INTERNAL_LINKS');
  if (internalLinksBlock) {
    return {
      title: 'Візуально додається блок внутрішніх посилань',
      reason: 'Це допомагає Google краще зрозуміти структуру сайту, а покупцю — перейти в комерційні розділи.',
      html: sanitizeSeoVisualHtml(internalLinksBlock)
    };
  }

  if (!seoLooksLikeHtml(after)) return null;

  if (before && after.includes(before)) {
    const added = after.replace(before, '').trim();
    if (added && seoLooksLikeHtml(added)) {
      return {
        title: 'Візуально додається фрагмент',
        reason: 'Показую тільки новий блок, щоб не читати всю сторінку.',
        html: sanitizeSeoVisualHtml(added)
      };
    }
  }

  return {
    title: 'Новий вигляд фрагмента сторінки',
    reason: 'Це не запис у live-сайт; це preview нового HTML у людському вигляді.',
    html: sanitizeSeoVisualHtml(after)
  };
}

function renderSeoVisualChange(change) {
  const field = seoChangeHumanField(change);
  const target = change.target || '';
  const targetHref = seoIsHttpTarget(target) ? target : '';
  const after = decodeSeoHtml(change.after);
  const before = decodeSeoHtml(change.before);
  const technicalTemplate = seoIsTechnicalTemplateChange(change);
  if (technicalTemplate) {
    return `<div class="seo-technical-warning">
      <div class="seo-visual-head">
        <div>
          <span class="status-pill warn">технічний diff</span>
          <strong>Це не візуальний preview сторінки</strong>
          <small>${target ? escapeHtml(target) : escapeHtml(field)}</small>
        </div>
        ${targetHref ? `<a class="button secondary tiny" href="${attr(targetHref)}" target="_blank" rel="noopener">Відкрити сторінку</a>` : ''}
      </div>
      <div class="seo-risk-grid">
        <div>
          <b>Що це означає</b>
          <span>Агент пропонує зміну шаблону або технічного файлу. Її не можна оцінювати як “новий вигляд сторінки”.</span>
        </div>
        <div>
          <b>Що робити</b>
          <span>Якщо це не свідомий технічний fix — відміть “прибрати з batch” і натисни “Вилучити вибрані”.</span>
        </div>
        <div>
          <b>Запобіжник</b>
          <span>Перед записом потрібні backup, syntax check і readback. Масові template-зміни не мають йти разом із контентними SEO-змінами.</span>
        </div>
      </div>
    </div>`;
  }
  const htmlFragment = seoChangedHtmlFragment(change);
  if (htmlFragment?.html) {
    return `<div class="seo-visual-preview">
      <div class="seo-visual-head">
        <div>
          <span class="status-pill ok">реальний preview</span>
          <strong>${escapeHtml(htmlFragment.title)}</strong>
          <small>${escapeHtml(field)}${target ? ` · ${escapeHtml(target)}` : ''}</small>
        </div>
        ${targetHref ? `<a class="button secondary tiny" href="${attr(targetHref)}" target="_blank" rel="noopener">Відкрити сторінку</a>` : ''}
      </div>
      <div class="seo-visual-render">${htmlFragment.html}</div>
      <p>${escapeHtml(htmlFragment.reason)}</p>
    </div>`;
  }
  return `<div class="seo-visual-preview seo-plain-preview">
    <div class="seo-visual-head">
      <div>
        <span class="status-pill ok">що стане</span>
        <strong>${escapeHtml(field)}</strong>
        <small>${target ? escapeHtml(target) : 'поле сторінки'}</small>
      </div>
      ${targetHref ? `<a class="button secondary tiny" href="${attr(targetHref)}" target="_blank" rel="noopener">Відкрити сторінку</a>` : ''}
    </div>
    <div class="seo-plain-diff">
      <div>
        <span>Було</span>
        <b>${escapeHtml(seoTextFromHtml(before) || seoChangeValue(change.before))}</b>
      </div>
      <div>
        <span>Стане</span>
        <b>${escapeHtml(seoTextFromHtml(after) || seoChangeValue(change.after, ''))}</b>
      </div>
    </div>
  </div>`;
}

function renderSeoTechnicalDiff(change) {
  const summary = seoIsTechnicalTemplateChange(change)
    ? 'Показати технічний diff / код файлу'
    : 'Показати технічний diff / HTML-код';
  return `<details class="seo-technical-diff">
    <summary>${escapeHtml(summary)}</summary>
    <div class="seo-technical-grid">
      <div>
        <span>Було</span>
        <code>${escapeHtml(seoChangeValue(change.before))}</code>
      </div>
      <div>
        <span>Стане</span>
        <code>${escapeHtml(seoChangeValue(change.after, ''))}</code>
      </div>
    </div>
  </details>`;
}

function renderSeoChangeExample(change, { selectable = false } = {}) {
  const changeKey = seoPreviewChangeKey(change, Number(change.__previewIndex || 0));
  const entityLabel = seoEntityTypeLabel(change.entityType || change.executor || '');
  const technicalTemplate = seoIsTechnicalTemplateChange(change);
  return `<article class="seo-change-example">
    <div class="seo-change-target">
      ${selectable ? `<label class="seo-change-select"><input type="checkbox" data-seo-preview-change="${attr(changeKey)}" ${technicalTemplate ? 'data-seo-preview-technical="1"' : ''}> <span>прибрати з batch</span></label>` : ''}
      <strong>${escapeHtml(change.target || `${change.entityType || 'entity'}:${change.entityId || ''}`)}</strong>
      <small>${escapeHtml([entityLabel, seoChangeHumanField(change), change.executor].filter(Boolean).join(' · '))}</small>
    </div>
    ${renderSeoVisualChange(change)}
    ${renderSeoTechnicalDiff(change)}
    ${change.note || change.verification ? `<p>${escapeHtml(change.note || change.verification || '')}</p>` : ''}
  </article>`;
}

function renderSeoChangeGroup(group, index) {
  const examples = group.selectable ? group.changes : group.changes.slice(0, 5);
  const hidden = Math.max(0, group.changes.length - examples.length);
  const groupLabel = seoChangeGroupHumanLabel(group);
  const technicalGroup = group.changes.some(change => seoIsTechnicalTemplateChange(change));
  const badgeLabel = technicalGroup ? 'технічний файл' : (group.category || group.field);
  const badgeTone = technicalGroup ? 'warn' : (group.category === 'schema' ? 'ok' : 'warn');
  return `<details class="seo-change-group" ${index < 3 ? 'open' : ''}>
    <summary>
      <div>
        <strong>${escapeHtml(group.agent)} · ${escapeHtml(groupLabel)}</strong>
        <small>${number(group.changes.length)} змін · ${number(group.targets.size)} сторінок/файлів${group.executor ? ` · ${escapeHtml(group.executor)}` : ''}</small>
      </div>
      <span class="status-pill ${badgeTone}">${escapeHtml(badgeLabel)}</span>
    </summary>
    <div class="seo-change-examples">
      ${examples.map(change => renderSeoChangeExample(change, { selectable: group.selectable })).join('')}
      ${hidden ? `<p class="muted-note">Ще ${number(hidden)} змін у цій групі будуть виконані в цьому ж batch після approval.</p>` : ''}
    </div>
  </details>`;
}

function renderSeoFixPreview(preview, activeApproval) {
  const canApprove = preview.status === 'pending_approval';
  const canApply = Boolean(activeApproval?.id) && preview.status === 'approved';
  const stats = seoPreviewStats(preview);
  const groups = seoChangeGroups(stats.changes);
  const statusTone = preview.status === 'approved' ? 'ok' : preview.status === 'pending_approval' ? 'warn' : 'bad';
  const groupSummary = groups.slice(0, 4).map(group => `${seoChangeGroupHumanLabel(group)}: ${number(group.changes.length)}`).join(' · ');
  const technicalChanges = stats.changes.filter(change => seoIsTechnicalTemplateChange(change));
  const technicalTargets = Array.from(new Set(technicalChanges.map(change => change.target).filter(Boolean))).slice(0, 3);
  return `<section class="seo-fix-preview" id="seoFixPreview">
    <div class="section-head">
      <div>
        <p class="section-kicker">Точний preview</p>
        <h3>${number(stats.changeCount)} змін для ${number(stats.entityCount)} сторінок/файлів · запис ще не виконано</h3>
        <p>${groupSummary ? `Цей batch робить: ${escapeHtml(groupSummary)}. ` : ''}Це ще не live-запис: спочатку перевіряємо людський preview, потім підтверджуємо, і лише після цього агент пише маленькими чанками та робить readback.</p>
      </div>
      <span class="status-pill ${statusTone}">${escapeHtml(preview.status || '')}</span>
    </div>
    <div class="seo-preview-summary">
      <span class="tag">змін: ${number(stats.changeCount)}</span>
      <span class="tag">сторінок/файлів: ${number(stats.entityCount)}</span>
      <span class="tag">агентів: ${number(stats.agentCount)}</span>
      <span class="tag">груп полів: ${number(groups.length)}</span>
      <span class="tag warn">live-запис ще не виконано</span>
    </div>
    ${technicalChanges.length ? `<div class="seo-preview-risk-banner">
      <div>
        <span class="status-pill warn">увага: технічні файли</span>
        <strong>У batch є ${number(technicalChanges.length)} технічних змін. Це не “SEO-preview сторінки”.</strong>
        <p>${technicalTargets.length ? `Приклади: ${escapeHtml(technicalTargets.join(', '))}. ` : ''}Такі зміни треба або вилучити з batch, або перевіряти окремо як код: backup → syntax check → readback.</p>
      </div>
      <button class="button secondary" type="button" data-seo-select-technical-changes ${canApprove ? '' : 'disabled'}>Вибрати технічні</button>
    </div>` : ''}
    <div class="button-row">
      <button class="button" type="button" data-seo-action="approve" ${canApprove ? '' : 'disabled'}>Підтвердити ці SEO-зміни</button>
      <button class="button secondary" type="button" data-seo-action="reject-preview" ${canApprove || preview.status === 'approved' ? '' : 'disabled'}>Відхилити preview</button>
      <button class="button ${canApply ? '' : 'secondary'}" type="button" data-seo-action="apply" ${canApply ? '' : 'disabled'}>Внести й перевірити readback</button>
      <button class="button secondary" type="button" data-seo-select-all-changes ${canApprove && stats.changeCount ? '' : 'disabled'}>Вибрати всі</button>
      <button class="button secondary" type="button" data-seo-clear-change-selection ${canApprove && stats.changeCount ? '' : 'disabled'}>Зняти вибір</button>
      <button class="button danger" type="button" data-seo-preview-remove-selected ${canApprove && stats.changeCount ? '' : 'disabled'}>Вилучити вибрані</button>
      <span class="muted-note">Approval не пише на сайт. Запис починається тільки кнопкою “Внести й перевірити”.</span>
    </div>
    <div class="seo-change-list">
      ${groups.length ? groups.map((group, index) => renderSeoChangeGroup({ ...group, selectable: canApprove }, index)).join('') : renderEmptyMini('Preview порожній', 'Немає змін для підтвердження.')}
    </div>
  </section>`;
}

function renderSeoWriteRun(run) {
  const rollbackRows = [];
  const seenChangeIds = new Set();
  asArray(run.results).filter(result => result.ok && result.changeId).forEach(result => {
    const key = String(result.changeId);
    if (seenChangeIds.has(key)) return;
    seenChangeIds.add(key);
    rollbackRows.push(result);
  });
  const previewRows = asArray(run.results).filter(result => result.ok && (result.after !== undefined || result.before !== undefined)).slice(0, 10);
  const previewGroups = seoChangeGroups(previewRows);
  const monitoring = run.monitoring || null;
  return `<section class="seo-write-run">
    <span class="status-pill ${run.status === 'completed' ? 'ok' : 'bad'}">${escapeHtml(run.status || '')}</span>
    <strong>Останнє внесення: ${number(run.okCount || 0)} підтверджено, ${number(run.failedCount || 0)} помилок</strong>
    <p>${escapeHtml(seoDate(run.completedAt))}${run.execution?.unitCount ? ` · ${number(run.execution.unitCount)} сторінок/файлів, ${number(run.execution.chunksProcessed || 0)} chunks` : ''}${run.execution?.stopReason ? ` · ${escapeHtml(run.execution.stopReason)}` : ''}${run.error ? ` · ${escapeHtml(run.error)}` : ''}</p>
    ${monitoring ? `<div class="seo-write-monitoring">
      <strong>Контроль ефекту заплановано</strong>
      <p>${escapeHtml(monitoring.goal || 'трафік → конверсії')}</p>
      <div class="tiny-list">
        ${asArray(monitoring.checkpoints).map(point => `<span class="tag ok">${escapeHtml(point.label || '')}: ${escapeHtml(seoDate(point.at))}</span>`).join('')}
      </div>
    </div>` : ''}
    ${previewRows.length ? `<details class="seo-write-visual" open>
      <summary><strong>Подивитися внесені зміни візуально</strong><span>${number(previewRows.length)} останніх змін</span></summary>
      <div class="seo-change-list">
        ${previewGroups.map(renderSeoChangeGroup).join('')}
      </div>
    </details>` : ''}
    ${rollbackRows.map(result => `<button class="button secondary seo-rollback-button" type="button" data-seo-rollback="${attr(result.changeId)}" data-seo-write-run="${attr(run.id)}">Відкотити ${escapeHtml(result.target || result.task || 'зміну')}</button>`).join('')}
  </section>`;
}

function renderSeoWeeklyCheck(check) {
  return `<article class="weekly-check ${check.due ? 'is-due' : ''}">
    <div>
      <strong>${escapeHtml(check.label)}</strong>
      <p>${escapeHtml(check.target)}</p>
    </div>
    <div class="weekly-check-meta">
      ${check.score ? `<b>${number(check.score)}/100</b>` : ''}
      <span class="status-pill ${check.due ? 'warn' : 'ok'}">${check.due ? 'потрібно' : 'актуально'}</span>
    </div>
  </article>`;
}

function renderSeoHistoryRow(job) {
  const tone = job.status === 'completed' ? 'ok' : job.status === 'failed' ? 'bad' : 'warn';
  return `<article class="seo-history-row">
    <span class="status-pill ${tone}">${job.status === 'completed' ? 'готово' : job.status === 'failed' ? 'помилка' : 'в роботі'}</span>
    <div>
      <strong>${escapeHtml(job.modeLabel || job.mode)} · ${escapeHtml(job.target || '')}</strong>
      <p>${escapeHtml(job.error || seoDate(job.completedAt || job.startedAt))}</p>
    </div>
    <b>${job.summary?.score ? `${number(job.summary.score)}/100` : '—'}</b>
  </article>`;
}

function renderSeoContentWorkbench() {
  const items = filteredSeoItems();
  const current = selectedSeoItem();
  return `<section class="seo-layout">
    <aside class="card">
      <div class="section-head">
        <div>
          <p class="section-kicker">Аудит каталогу</p>
          <h2>Сторінки</h2>
        </div>
      </div>
      <label class="field">
        <span>Пошук</span>
        <input id="seoSearch" value="${attr(state.seoSearch)}" placeholder="товар, категорія або URL">
      </label>
      <div class="segment-tabs">
        ${['all', 'product', 'category', 'page'].map(filter => `<button class="button ${state.seoFilter === filter ? '' : 'secondary'}" type="button" data-seo-filter="${filter}">${filter === 'all' ? 'Всі' : filter}</button>`).join('')}
      </div>
      <div class="split-line"></div>
      <div class="seo-list">${items.length ? items.map(renderSeoRow).join('') : renderEmptyMini('Немає SEO задач', 'Потрібні GSC/OpenCart або контент-черга.')}</div>
    </aside>
    <main class="editor-panel">
      ${current ? renderSeoEditor(current) : renderEmptyMini('Оберіть сторінку', 'Після вибору буде current/proposed редактор.')}
    </main>
  </section>`;
}

function filteredSeoItems() {
  const search = state.seoSearch.trim().toLowerCase();
  return contentItems().filter(item => {
    const typeOk = state.seoFilter === 'all' || item.type === state.seoFilter;
    const haystack = `${item.name || ''} ${item.url || item.target?.url || ''} ${item.why || ''}`.toLowerCase();
    return typeOk && (!search || haystack.includes(search));
  });
}

function renderSeoRow(item) {
  const score = Number(item.current?.seoScore || item.score || item.seoScore || 0);
  return `<button class="seo-row ${item.id === state.selectedSeoId ? 'is-selected' : ''}" type="button" data-seo-id="${attr(item.id)}">
    <span class="score-ring">${number(score)}</span>
    <strong>${escapeHtml(item.name || item.title || 'Сторінка')}</strong>
    <small>${escapeHtml(item.url || item.target?.url || item.type || '')}</small>
    <p>${escapeHtml(item.why || item.expectedImpact || item.summary || 'Потрібна SEO-перевірка.')}</p>
  </button>`;
}

function renderSeoEditor(item) {
  const current = item.current || {};
  const proposed = item.proposed || item.draft || {};
  const title = text(proposed.title || item.title, item.name || '');
  const meta = text(proposed.metaDescription || proposed.meta || proposed.description, '');
  const h1 = text(proposed.h1, item.name || '');
  return `<div class="editor-head">
    <div>
      <p class="section-kicker">${escapeHtml(item.type || 'SEO')}</p>
      <h2>${escapeHtml(item.name || item.title || 'Сторінка')}</h2>
      <p>${escapeHtml(item.url || item.target?.url || '')}</p>
    </div>
    <div class="button-row">
      <button class="button secondary" type="button" id="seoDryRun">Dry-run</button>
      <button class="button" type="button" id="seoPublish">Publish після перевірки</button>
    </div>
  </div>
  <div class="editor-body">
    <div class="comparison">
      <div class="compare-box">
        <strong>Зараз</strong>
        <dl>
          <div><dt>Title</dt><dd>${escapeHtml(current.title || 'Немає даних')}</dd></div>
          <div><dt>Meta</dt><dd>${escapeHtml(current.metaDescription || current.meta || 'Немає даних')}</dd></div>
          <div><dt>H1</dt><dd>${escapeHtml(current.h1 || 'Немає даних')}</dd></div>
          <div><dt>SEO score</dt><dd>${escapeHtml(current.seoScore ?? item.score ?? 0)}/100</dd></div>
        </dl>
      </div>
      <div class="compare-box">
        <strong>Після</strong>
        <label class="field">
          <span>Title</span>
          <input id="seoTitle" value="${attr(title)}">
          ${renderCounter(title.length, 30, 60)}
        </label>
        <label class="field">
          <span>Meta</span>
          <textarea id="seoMeta">${escapeHtml(meta)}</textarea>
          ${renderCounter(meta.length, 120, 160)}
        </label>
        <label class="field">
          <span>H1</span>
          <input id="seoH1" value="${attr(h1)}">
        </label>
      </div>
    </div>
    <label class="field full">
      <span>Опис / HTML</span>
      <textarea id="seoContent">${escapeHtml(stripHtml(proposed.content || proposed.html || item.preview?.plain || ''))}</textarea>
    </label>
    ${renderSerpPreview(title, item.url || item.target?.url || 'https://mercato.com.ua/', meta)}
    <section class="empty-state">
      <span class="status-pill warn">Safety</span>
      <h3>Live тільки через preview -> dry-run -> approval</h3>
      <p>Сторінка не має отримувати службові слова на кшталт “SEO score”, “GSC” або внутрішній briefing у live-контенті.</p>
    </section>
  </div>`;
}

function renderCounter(count, min, max) {
  const ok = count >= min && count <= max;
  return `<div class="counter-row"><span>${number(count)} символів</span><strong>${ok ? 'OK' : `${min}-${max}`}</strong></div>`;
}

function renderSerpPreview(title, url, description) {
  return `<section class="serp-preview">
    <p class="section-kicker">SERP preview</p>
    <h3>${escapeHtml(title || 'Title сторінки')}</h3>
    <div class="serp-url">${escapeHtml(url || 'https://example.com')}</div>
    <p>${escapeHtml(description || 'Meta description буде тут.')}</p>
  </section>`;
}

function merchantStatusLabel(status = '') {
  return ({
    critical: 'Критично',
    needs_review: 'Перевірити',
    ready: 'Готово',
    excluded: 'Виключено',
    limited_scan: 'Неповний scan'
  })[status] || status || 'Невідомо';
}

function merchantStatusTone(status = '') {
  if (status === 'critical') return 'bad';
  if (status === 'needs_review' || status === 'limited_scan') return 'warn';
  return 'ok';
}

function merchantFilteredProducts() {
  const report = merchantData().report || {};
  const search = String(state.merchant.search || '').trim().toLowerCase();
  return asArray(report.products).filter(product => {
    if (state.merchant.filter !== 'all' && product.status !== state.merchant.filter) return false;
    if (!search) return true;
    return [product.name, product.productId, product.sku, product.link]
      .some(value => String(value || '').toLowerCase().includes(search));
  });
}

function renderMerchant() {
  const data = merchantData();
  const report = data.report || null;
  const summary = report?.summary || {};
  const coverage = report?.coverage || {};
  const reportState = data.reportState || {};
  const liveBridge = data.liveBridge || {};
  const catalogPolicy = data.catalogPolicy || {};
  const variantExportMode = catalogPolicy.variantExportMode || data.merchantApiIntelligence?.variantExportMode || 'canonical_product';
  const variantRequired = variantExportMode === 'split_by_package';
  const stale = Boolean(reportState.stale);
  const variantReady = Boolean(coverage.variantFull);
  const variantWarning = variantRequired && coverage.variantFull === false
    ? liveBridge.supportsVariants
      ? `Bridge ${liveBridge.version || 'актуальний'} уже підтримує варіанти. Потрібен успішний повторний scan, щоб замінити старий звіт.`
      : coverage.warning || 'Потрібен актуальний bridge v35.'
    : '';
  const active = data.activeJob || null;
  const latestJob = asArray(data.jobs)[0] || null;
  const latestFailed = latestJob?.status === 'failed' ? latestJob : null;
  const products = merchantFilteredProducts().slice(0, 150);
  const plan = data.fixPlan || null;
  const batch = data.testBatch || null;
  const writePreview = data.writePreview || null;
  const remediationQueue = data.remediationQueue || {};
  const approvals = asArray(data.approvals);
  const writeRuns = asArray(data.writeRuns);
  const activeApproval = approvals.find(approval => approval.status === 'approved') || null;
  const latestWriteRun = writeRuns[0] || null;
  const deterministicProducts = Number(remediationQueue.remainingProducts || 0);
  const deterministicChanges = Number(remediationQueue.remainingChanges || 0);
  const hasDeterministicChanges = deterministicProducts > 0 || deterministicChanges > 0;
  const approvalNeedsBridge = Boolean(activeApproval?.items?.some(item =>
    asArray(item.proposals).some(proposal => proposal.target === 'opencart')
  ));
  const batchNeedsRemediationBridge = Boolean(
    asArray(activeApproval?.items || writePreview?.items).some(item =>
      asArray(item.proposals).some(proposal => proposal.action !== 'set_brand')
    )
  );
  const writeBridgeReady = !approvalNeedsBridge || Boolean(liveBridge.supportsApprovedWrites);
  const remediationBridgeReady = !batchNeedsRemediationBridge || Boolean(liveBridge.supportsRemediationQueue);
  const scanLabel = stale
    ? 'Застарілий звіт'
    : coverage.full && (!variantRequired || variantReady)
      ? (variantRequired ? 'Повний scan з варіантами' : 'Канонічний feed mode')
      : coverage.full
        ? 'Основні поля без варіантів'
        : 'Legacy scan';

  return `<section class="hero-panel merchant-hero">
    <div>
      <p class="section-kicker">Merchant Quality Pipeline</p>
      <h2>Агенти готують каталог до Google Shopping</h2>
      <p>Спочатку скануємо OpenCart, потім показуємо точний diff. 5 товарів — це безпечний chunk за один batch, не межа всієї роботи: після readback система готує наступний batch.</p>
      <div class="hero-actions">
        <button class="button" type="button" id="runMerchantScan" ${active ? 'disabled' : ''}>${active ? 'Каталог сканується' : 'Сканувати весь каталог'}</button>
        <button class="button secondary" type="button" id="buildMerchantPlan" ${!report || active || stale ? 'disabled' : ''}>Створити dry-run план</button>
        <button class="button secondary" type="button" id="buildMerchantTestBatch" ${!report || active || stale || (variantRequired && !variantReady) ? 'disabled' : ''}>Підготувати 5 канонічних offerів</button>
        <button class="button secondary" type="button" id="buildMerchantWritePreview" ${!report || !plan || !hasDeterministicChanges || active || stale || (variantRequired && !variantReady) ? 'disabled' : ''}>Підготувати batch змін</button>
        <button class="button secondary" type="button" data-route="settings">Підключити Merchant API</button>
      </div>
    </div>
    <aside class="proof-box">
      <span class="status-pill ${stale ? 'bad' : coverage.full && (!variantRequired || variantReady) ? 'ok' : 'warn'}">${scanLabel}</span>
      <strong>${number(summary.active || 0)} активних товарів · ${summary.scoreAvailable ? `${number(summary.averageScore || 0)}/100` : 'score після актуального bridge v35'}</strong>
      <p>${report ? `Останній успішний scan: ${escapeHtml(seoDate(reportState.lastSuccessfulAt || report.generatedAt))}.` : 'Перший scan ще не запускався.'} Feed policy: ${escapeHtml(variantExportMode)}. ${liveBridge.version ? `Live bridge: ${escapeHtml(liveBridge.version)}.` : ''} Merchant Center publish вимкнений.</p>
    </aside>
  </section>

  ${variantWarning ? `<section class="card connection-warning">
    <span class="status-pill warn">${liveBridge.supportsVariants ? 'Потрібен повторний scan' : 'Потрібне оновлення bridge'}</span>
    <div><strong>Поточний scan бачить не всі Merchant-поля</strong><p>${escapeHtml(variantWarning)}</p></div>
  </section>` : ''}

  ${stale ? `<section class="card connection-warning stale-report-warning">
    <span class="status-pill bad">Застарілий звіт</span>
    <div>
      <strong>Показано останній успішний результат; dry-run і test batch тимчасово заблоковані</strong>
      <p>${escapeHtml(reportState.reason || latestFailed?.error || 'Останній scan не завершився.')}</p>
      ${/tableColumns|undefined function/i.test(latestFailed?.error || '') ? '<small>Виправлено в актуальному bridge v35. Завантажте новий архів і повторіть scan.</small>' : ''}
    </div>
  </section>` : ''}

  ${liveBridge.version && !liveBridge.supportsApprovedWrites ? `<section class="card connection-warning">
    <span class="status-pill warn">Потрібен актуальний bridge v35</span>
    <div>
      <strong>Preview і погодження вже доступні, але запис бренду в OpenCart ще заблокований</strong>
      <p>Завантажте актуальний mercato-bridge-v35-upload.zip. Feed overrides зберігаються локально, а OpenCart brand потребує readback-функції bridge.</p>
    </div>
  </section>` : ''}

  ${liveBridge.supportsApprovedWrites && !liveBridge.supportsRemediationQueue ? `<section class="card connection-warning">
    <span class="status-pill warn">Потрібен актуальний bridge v35</span>
    <div>
      <strong>Старий bridge виправляє тільки бренд — це вже недостатньо</strong>
      <p>Актуальний bridge v35 включає Merchant remediation queue, GTIN cleanup, feed title/description overrides, SEO description readback, Product Schema readback і database readback.</p>
    </div>
  </section>` : ''}

  ${renderMerchantOperatorBoard({ data, report, stale, active, variantReady, variantRequired, liveBridge, remediationQueue, writePreview, activeApproval })}
  ${renderMerchantAfterScanPlan({ data, report, stale, remediationQueue })}
  ${renderMerchantApiIntelligence(data.merchantApiIntelligence || {}, data.googleDiagnostics || {})}

  <section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Підтверджене правило каталогу</p>
        <h2>Бренд усіх товарів: ${escapeHtml(catalogPolicy.confirmedBrand || 'Mercato')}</h2>
        <p>Рішення власника застосовується до feed preview, але не переписує виробника в OpenCart без окремого погодження.</p>
      </div>
      <span class="status-pill ok">${catalogPolicy.brandConfirmedByOwner ? 'підтверджено' : 'очікує рішення'}</span>
    </div>
  </section>

  <section class="metric-grid ${stale ? 'is-stale' : ''}">
    ${renderMetric('Готові', number(summary.ready || 0), 'можна включати після Google diagnostics')}
    ${renderMetric('Критично', number(summary.critical || 0), 'можуть бути відхилені')}
    ${renderMetric('Потрібна перевірка', number(summary.needsReview || 0), 'контент, Google issues або ручні факти')}
    ${renderMetric('Неповний scan', number(summary.limitedScan || 0), coverage.full ? '0 очікується' : 'потрібен актуальний bridge v35')}
  </section>

  ${active ? renderMerchantActiveJob(active) : ''}

  <section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Команда агентів</p>
        <h2>Хто за що відповідає</h2>
        <p>Кожен агент має вузьку роль; Fix Planner не має права вигадувати GTIN, бренд або статус товару.</p>
      </div>
    </div>
    <div class="merchant-agent-grid">
      ${asArray(data.agents).map(renderMerchantAgentContract).join('') || renderEmptyMini('Агенти завантажуються', 'Оновіть сторінку після запуску сервера.')}
    </div>
  </section>

  <section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Каталог</p>
        <h2>Merchant readiness товарів</h2>
        <p>Показуємо доказ, вплив і спосіб виправлення. Невідоме поле не прирівнюється до помилки.</p>
      </div>
      <strong>${number(products.length)} показано</strong>
    </div>
    <div class="merchant-toolbar">
      <label class="field">
        <span>Пошук</span>
        <input id="merchantSearch" value="${attr(state.merchant.search)}" placeholder="товар, SKU або URL">
      </label>
      <div class="segment-tabs">
        ${[
          ['all', 'Всі'],
          ['critical', 'Критично'],
          ['needs_review', 'Перевірити'],
          ['limited_scan', 'Неповний scan'],
          ['ready', 'Готово'],
          ['excluded', 'Виключені']
        ].map(([id, label]) => `<button class="button ${state.merchant.filter === id ? '' : 'secondary'}" type="button" data-merchant-filter="${id}">${label}</button>`).join('')}
      </div>
    </div>
    <div class="merchant-product-list">
      ${products.length ? products.map(renderMerchantProduct).join('') : renderEmptyMini(
        report ? 'Немає товарів у цьому фільтрі' : 'Каталог ще не проскановано',
        report ? 'Змініть пошук або фільтр.' : 'Натисніть “Сканувати весь каталог”.'
      )}
    </div>
  </section>

  <section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Dry-run черга</p>
        <h2>Запропоновані виправлення без publish</h2>
        <p>Перший тестовий batch обмежений пʼятьма товарами й потребує окремого погодження.</p>
      </div>
      <span class="status-pill ${plan ? 'warn' : ''}">${plan ? `${number(plan.items?.length || 0)} задач` : 'не створено'}</span>
    </div>
    ${plan ? `<div class="merchant-plan-list">${asArray(plan.items).slice(0, 30).map(renderMerchantPlanItem).join('')}</div>` : renderEmptyMini('Dry-run план ще не створено', 'Після scan натисніть “Створити dry-run план”.')}
  </section>

  <section class="card merchant-write-card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Approval-gated write</p>
        <h2>Постійна черга виправлення каталогу</h2>
        <p>Після кожного погодженого batch система робить readback, повторний scan і автоматично готує наступні 5 товарів — доки безпечні детерміновані зміни не закінчаться.</p>
      </div>
      <span class="status-pill ${activeApproval ? 'ok' : writePreview ? 'warn' : ''}">${number(remediationQueue.remainingProducts || 0)} товарів у черзі</span>
    </div>
    <div class="metric-grid merchant-queue-metrics">
      ${renderMetric('Автозміни', number(remediationQueue.remainingProducts || 0), `${number(remediationQueue.remainingChanges || 0)} конкретних змін`)}
      ${renderMetric('Завершено batch', number(remediationQueue.completedBatches || 0), `${number(remediationQueue.completedProducts || 0)} успішних записів`)}
      ${renderMetric('Ручні рішення', number(remediationQueue.manualOnlyProducts || 0), 'описи, фото, Google diagnostics або факти без доказів')}
      ${renderMetric('Режим', '5 за раз', 'наступний batch формується автоматично')}
    </div>
    ${Object.keys(remediationQueue.byAction || {}).length ? `<div class="tiny-list merchant-queue-types">
      ${Object.entries(remediationQueue.byAction).map(([action, count]) => `<span class="tag">${escapeHtml(merchantProposalLabel(action))}: ${number(count)}</span>`).join('')}
    </div>` : ''}
    ${writePreview ? `
      <div class="merchant-write-summary">
        <strong>Поточний batch: ${number(writePreview.productCount || 0)} товарів · ${number(writePreview.changeCount || 0)} змін</strong>
        <small>Привʼязано до scan ${escapeHtml(seoDate(writePreview.reportGeneratedAt))}. Merchant Center publish: вимкнений.</small>
      </div>
      <div class="merchant-write-list">${asArray(writePreview.items).map(renderMerchantWriteItem).join('')}</div>
      <div class="hero-actions merchant-write-actions">
        <button class="button" type="button" id="approveMerchantChanges" ${writePreview.status !== 'pending_approval' || stale || active ? 'disabled' : ''}>Підтвердити ці зміни</button>
        <button class="button ${writeBridgeReady && remediationBridgeReady ? '' : 'secondary'}" type="button" id="applyMerchantChanges" ${!activeApproval || stale || active || !writeBridgeReady || !remediationBridgeReady ? 'disabled' : ''}>Внести погоджені зміни</button>
      </div>
      ${activeApproval && !writeBridgeReady ? '<p class="form-note bad">Погодження збережено, але для запису brand у OpenCart потрібно встановити актуальний bridge v35.</p>' : ''}
      ${activeApproval && !remediationBridgeReady ? '<p class="form-note bad">Погодження збережено, але цей batch містить GTIN або feed overrides. Потрібен актуальний bridge v35.</p>' : ''}
    ` : renderEmptyMini(
      remediationQueue.remainingProducts ? 'Наступний batch ще не сформовано' : 'Автоматичні виправлення завершені',
      remediationQueue.remainingProducts ? 'Натисніть “Підготувати batch змін”.' : 'Залишились ручні задачі: описи, фото, Google diagnostics або рішення власника.'
    )}
    ${latestWriteRun ? renderMerchantWriteRun(latestWriteRun) : ''}
  </section>

  <section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Перший контрольний batch</p>
        <h2>5 канонічних offerів для feed preview</h2>
        <p>За політикою Mercato один товар лишається одним Merchant offer. Фасування не множимо у фіді; воно лишається вибором покупця на сторінці.</p>
      </div>
      <span class="status-pill ${batch?.landingUrlsVerified ? 'ok' : 'warn'}">${batch ? `${number(batch.feedItems || 0)} feed items` : 'не створено'}</span>
    </div>
    ${batch ? `
      ${asArray(batch.blockers).length ? `<div class="connection-warning merchant-batch-warning">
        <span class="status-pill warn">Publish off</span>
        <div><strong>Що ще блокує відправлення у Google</strong><p>${batch.blockers.map(escapeHtml).join('<br>')}</p></div>
      </div>` : ''}
      <div class="merchant-plan-list">${asArray(batch.products).map(renderMerchantBatchProduct).join('')}</div>
    ` : renderEmptyMini('Контрольний preview ще не підготовлено', 'Після scan натисніть “Підготувати 5 канонічних offerів”.')}
  </section>`;
}

function renderMerchantOperatorBoard({ data, report, stale, active, variantReady, variantRequired, liveBridge, remediationQueue, writePreview, activeApproval }) {
  const googleIssues = asArray(data.googleDiagnostics?.summary?.topIssues);
  const hasGoogleIssues = googleIssues.length > 0 || Number(data.googleDiagnostics?.summary?.productIssueCount || 0) > 0;
  const manualOnlyProducts = Number(remediationQueue.manualOnlyProducts || 0);
  const next = active
    ? ['Дочекатися завершення scan', `Прочитано ${number(active.productsRead || 0)} товарів.`]
    : !report
      ? ['Сканувати весь каталог', 'Потрібен свіжий snapshot OpenCart перед будь-якими виправленнями.']
      : stale
        ? ['Повторити scan', 'Показаний звіт застарілий; dry-run і batch заблоковані.']
        : variantRequired && !variantReady
          ? ['Оновити scan з варіантами', liveBridge.supportsVariants ? 'Bridge підтримує варіанти, але поточний звіт ще старий.' : 'Потрібен bridge з merchant_feed_audit_list і variant fields.']
          : activeApproval
            ? ['Внести погоджений batch', 'Після apply буде readback і повторний scan. Merchant Center publish лишається вимкненим.']
            : writePreview
              ? ['Підтвердити batch змін', 'Перевірте diff: що було, що стане, і тільки тоді підтверджуйте.']
              : Number(remediationQueue.remainingProducts || 0)
                ? ['Підготувати batch змін', `${number(remediationQueue.remainingProducts || 0)} товарів ще мають детерміновані зміни.`]
                : hasGoogleIssues
                  ? ['Розібрати Google/datafeed blockers', 'Локальний OpenCart scan майже готовий; наступний вплив на продажі — Merchant Center issues, data feeds, landing pages і shipping.']
                  : manualOnlyProducts
                    ? ['Працювати з ручними рішеннями', `${number(manualOnlyProducts)} товарів потребують фактів або короткого Merchant-only опису без автоматичного переписування.`]
	                  : ['Працювати з ручними рішеннями', 'Залишились задачі, де потрібні факти, фото, Google diagnostics або рішення власника.'];
  return `<section class="card operator-board merchant-operator-board">
    <div class="section-head">
      <div>
        <p class="section-kicker">Що робити зараз</p>
        <h2>${escapeHtml(next[0])}</h2>
        <p>${escapeHtml(next[1])}</p>
      </div>
      <span class="status-pill ${stale ? 'bad' : (!variantRequired || variantReady) ? 'ok' : 'warn'}">${stale ? 'stale' : variantRequired ? (variantReady ? 'variant-full' : 'неповний scan') : 'canonical-feed'}</span>
    </div>
    <div class="operator-grid">
      <article>
        <span class="status-pill ok">read-only scan</span>
        <strong>Що агенти бачать</strong>
        <p>74 товари, активність, ціни, фото, brand/manufacturer, GTIN/MPN/SKU, availability, опис, options/fасування і item_group_id.</p>
      </article>
      <article>
        <span class="status-pill ok">approval write</span>
        <strong>Що можуть змінювати</strong>
        <p>Погоджені brand fixes, очищення невалідних identifiers, Merchant title/description overrides і policy-поля. Ніяких вигаданих GTIN, rating або “SEO-сміття”.</p>
      </article>
      <article>
        <span class="status-pill warn">manual</span>
        <strong>Що потребує рішення</strong>
        <p>Якість/заміна фото, Review/AggregateRating, якщо немає реальних відгуків, Google diagnostics, і всі неоднозначні товарні факти.</p>
      </article>
      <article>
        <span class="status-pill bad">publish off</span>
        <strong>Куди не пишемо</strong>
        <p>Merchant Center не публікується з цієї панелі. Feed preview і OpenCart readback — так; live Merchant push — тільки окремим майбутнім approval.</p>
      </article>
    </div>
    <div class="tiny-list">
      <span class="tag">bridge: ${escapeHtml(liveBridge.version || 'невідомо')}</span>
      <span class="tag">залишилось: ${number(remediationQueue.remainingProducts || 0)} товарів</span>
      <span class="tag">batch size: ${number(data.safety?.firstBatchLimit || 5)} за раз</span>
      <span class="tag">Merchant publish: off</span>
    </div>
  </section>`;
}

function renderMerchantAfterScanPlan({ data, report, stale, remediationQueue }) {
  if (!report || stale) return '';
  const diagnostics = data.googleDiagnostics || {};
  const summary = diagnostics.summary || {};
  const topIssues = asArray(summary.topIssues);
  const issueCodes = new Set(topIssues.map(issue => issue.code));
  const datafeeds = asArray(diagnostics.datafeeds);
  const manualOnlyProducts = Number(remediationQueue.manualOnlyProducts || 0);
  const deterministicProducts = Number(remediationQueue.remainingProducts || 0);
  const actions = [];
  const addAction = (tone, title, body, evidence) => actions.push({ tone, title, body, evidence });

  if (Number(summary.datafeedCount || datafeeds.length || 0) > 1) {
    addAction(
      'bad',
      'Визначити головне джерело товарів у Merchant Center',
      'У Google видно кілька data feeds. Якщо вони дублюють товари або старі URL, Google може показувати старі помилки навіть після чистого OpenCart scan.',
      `${number(summary.datafeedCount || datafeeds.length)} data feeds`
    );
  }
  if (issueCodes.has('local_requires_review') || issueCodes.has('local_stores_lack_supported_inventory') || issueCodes.has('ui_local_inventory_not_supported') || issueCodes.has('local_stores_lack_inventory')) {
    addAction(
      'warn',
      'Не запускати local inventory, поки немає реального локального inventory feed',
      'Це не виправляється SEO-текстом. Треба або вимкнути local listings, або підготувати коректний локальний inventory process.',
      'local inventory issues'
    );
  }
  if (issueCodes.has('missing_shipping_weight')) {
    addAction(
      'warn',
      'Вирішити shipping_weight або shipping rules',
      'Для кави/чаю Google часто вимагає прогнозовану доставку. Або додаємо вагу в feed override, або налаштовуємо доставку на рівні Merchant account.',
      'missing_shipping_weight'
    );
  }
  if (issueCodes.has('landing_page_error')) {
    addAction(
      'bad',
      'Перевірити landing page errors у Google, не лише локальні URL',
      'OpenCart scan бачить живі посилання, але Merchant Center може тримати старі /ru, redirect або дублікати з іншого datafeed.',
      'landing_page_error'
    );
  }
  if (issueCodes.has('text_value_truncated') || manualOnlyProducts || Number(report.summary?.needsReview || 0)) {
    addAction(
      'warn',
      'Почистити Merchant-only descriptions без переписування сторінок',
      'Для проблемних товарів потрібен короткий feed_description override: тільки факти про товар, без блоків “інші товари”, URL і навігації.',
      `${number(manualOnlyProducts || report.summary?.needsReview || 0)} товарів`
    );
  }
  if (deterministicProducts) {
    addAction(
      'ok',
      'Підготувати наступний approval batch',
      'Є безпечні детерміновані зміни. Їх можна внести тільки після diff-preview і ручного погодження.',
      `${number(deterministicProducts)} товарів`
    );
  }
  if (!actions.length) {
    addAction(
      'ok',
      'Локальний фід готовий до Google-перевірки',
      'Наступний крок — оновити Google diagnostics і дивитися реальні Merchant Center blockers, а не плодити нові товари по грамовках.',
      'canonical feed'
    );
  }

  return `<section class="card merchant-next-steps">
    <div class="section-head">
      <div>
        <p class="section-kicker">Що далі після scan</p>
        <h2>Не плодимо грамовки — прибираємо реальні blockers</h2>
        <p>Scan показує стан OpenCart. Після нього агенти мають або готувати конкретний diff, або чесно показувати ручні/Google-задачі.</p>
      </div>
      <span class="status-pill ${deterministicProducts ? 'warn' : 'ok'}">${deterministicProducts ? 'є diff' : 'canonical feed'}</span>
    </div>
    <div class="operator-grid merchant-next-grid">
      ${actions.slice(0, 6).map(action => `<article>
        <span class="status-pill ${action.tone}">${escapeHtml(action.evidence)}</span>
        <strong>${escapeHtml(action.title)}</strong>
        <p>${escapeHtml(action.body)}</p>
      </article>`).join('')}
    </div>
  </section>`;
}

function renderMerchantGoogleDiagnostics(diagnostics = {}) {
  const summary = diagnostics.summary || {};
  const topIssues = asArray(summary.topIssues);
  const destinations = asArray(summary.destinations);
  const productStatuses = asArray(diagnostics.productStatuses);
  const datafeeds = asArray(diagnostics.datafeeds);
  const errors = Object.entries(diagnostics.errors || {}).filter(([, message]) => message);
  const ready = Boolean(diagnostics.generatedAt);
  const fatalError = diagnostics.error || '';
  const reconnectRequired = Boolean(diagnostics.reconnectRequired) || /expired|revoked|invalid_grant|oauth/i.test(fatalError);
  const issuePreview = topIssues.length
    ? topIssues.slice(0, 8).map(issue => `<span class="tag warn">${escapeHtml(issue.code || 'issue')}: ${number(issue.count || 0)}</span>`).join('')
    : ready
      ? fatalError
        ? '<span class="tag warn">Google diagnostics не прочитано</span>'
        : '<span class="tag ok">Google issues у кеші не знайдено</span>'
      : '<span class="tag">diagnostics ще не читали</span>';
  return `<div class="merchant-google-diagnostics ${ready ? 'is-ready' : 'is-empty'}">
    <div class="section-head">
      <div>
        <p class="section-kicker">Live Google diagnostics</p>
        <h3>Merchant Center як джерело правди для агентів</h3>
        <p>${ready
          ? fatalError
            ? `Остання спроба: ${escapeHtml(seoDate(diagnostics.generatedAt))}. Google відповів помилкою, дані Merchant Center не прочитано.`
            : `Останнє read-only читання: ${escapeHtml(seoDate(diagnostics.generatedAt))}. Дані не публікуються і не змінюють Merchant Center.`
          : 'Натисніть кнопку, щоб підтягнути account/product/datafeed diagnostics через поточний Google OAuth.'}</p>
      </div>
      <div class="hero-actions merchant-diagnostics-actions">
        <button class="button secondary" type="button" id="refreshMerchantGoogleDiagnostics">Оновити Google diagnostics</button>
        ${reconnectRequired ? '<a class="button" href="/seo/gsc/oauth/start" target="_blank" rel="noreferrer">Перепідключити Google OAuth</a>' : ''}
      </div>
    </div>
    <div class="metric-grid merchant-diagnostics-grid">
      ${renderMetric('Product statuses', ready ? number(summary.productsRead || 0) : '—', `${number(summary.productsWithIssues || 0)} з issues`)}
      ${renderMetric('Product issues', ready ? number(summary.productIssueCount || 0) : '—', 'item-level blockers')}
      ${renderMetric('Account issues', ready ? number(summary.accountIssueCount || 0) : '—', 'account-level blockers')}
      ${renderMetric('Datafeeds', ready ? number(summary.datafeedCount || 0) : '—', diagnostics.api || 'Content API')}
    </div>
    <div class="merchant-diagnostics-row">
      <div>
        <strong>Топ Google blockers</strong>
        <div class="tiny-list">${issuePreview}</div>
      </div>
      <div>
        <strong>Destinations / feeds</strong>
        <div class="tiny-list">
          ${destinations.length
            ? destinations.slice(0, 6).map(item => `<span class="tag">${escapeHtml(item.destination || 'destination')}: ${number(item.count || 0)}</span>`).join('')
            : datafeeds.length
              ? datafeeds.slice(0, 4).map(feed => `<span class="tag">${escapeHtml(feed.name || feed.id || 'feed')}</span>`).join('')
              : '<span class="tag">feed data не прочитано</span>'}
        </div>
      </div>
    </div>
    ${productStatuses.some(item => item.hasIssues) ? `<div class="merchant-diagnostics-list">
      ${productStatuses.filter(item => item.hasIssues).slice(0, 5).map(item => `<article>
        <strong>${escapeHtml(item.title || item.offerId || item.productId || 'Product status')}</strong>
        <small>${escapeHtml(item.offerId || item.productId || '')}</small>
        <div class="tiny-list">${asArray(item.issues).slice(0, 4).map(issue => `<span class="tag warn">${escapeHtml(issue.code || 'issue')}</span>`).join('')}</div>
      </article>`).join('')}
    </div>` : ''}
    ${errors.length ? `<div class="connection-warning merchant-diagnostics-errors">
      <span class="status-pill ${fatalError ? 'bad' : 'warn'}">${fatalError ? 'помилка' : 'partial'}</span>
      <div>
        <strong>${fatalError ? 'Google diagnostics не прочитались' : 'Частина Google diagnostics не прочиталась'}</strong>
        <p>${errors.map(([key, message]) => `${escapeHtml(key)}: ${escapeHtml(message)}`).join('<br>')}</p>
      </div>
    </div>` : ''}
    <p class="form-note">${escapeHtml(diagnostics.migrationNotice || 'Read-only режим: Merchant Center publish вимкнений.')}</p>
  </div>`;
}

function renderMerchantApiIntelligence(intelligence = {}, googleDiagnostics = {}) {
  const readiness = intelligence.readiness || {};
  const safety = intelligence.safety || {};
  const tools = asArray(intelligence.tools);
  const rules = asArray(intelligence.feedRuleEngine);
  const evidenceSources = asArray(intelligence.evidenceGraph?.sources);
  const allowedTools = asArray(intelligence.allowedMcpReadTools);
  const blockedTools = asArray(intelligence.blockedMcpToolsUntilApproval);
  const connectorOk = readiness.merchantConnector === 'connected';
  return `<section class="card merchant-intelligence-card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Google Merchant Intelligence</p>
        <h2>Агенти працюють з Merchant Center diagnostics, а не навмання</h2>
        <p>Цей шар зводить OpenCart scan, Google Merchant diagnostics, SEO Center і approval executor в один evidence graph. Merchant Center publish лишається вимкненим.</p>
      </div>
      <span class="status-pill ${connectorOk ? 'ok' : 'warn'}">${connectorOk ? 'Merchant API connected' : 'MCP planned'}</span>
    </div>
    <div class="metric-grid merchant-intelligence-metrics">
      ${renderMetric('OpenCart scan', escapeHtml(readiness.openCartScan || 'missing'), `bridge ${escapeHtml(readiness.liveBridge || '—')}`)}
      ${renderMetric('Merchant diagnostics', escapeHtml(readiness.merchantConnector || 'not_ready'), 'Google product/account issues')}
      ${renderMetric('Merchant data MCP', escapeHtml(readiness.merchantDataMcp || 'planned'), 'service account + tool allowlist')}
      ${renderMetric('Publish', 'off', safety.ownerApprovalRequired ? 'тільки preview/readback' : 'перевірити safety')}
    </div>
	    <div class="operator-grid merchant-evidence-grid">
      ${evidenceSources.map(source => `<article>
        <span class="status-pill ${source.status === 'connected' || source.status === 'ready' ? 'ok' : source.status === 'blocked_by_bridge' || source.status === 'not_ready' ? 'warn' : ''}">${escapeHtml(source.status || 'source')}</span>
        <strong>${escapeHtml(source.name || source.id)}</strong>
        <p>${escapeHtml(source.evidence || '')}</p>
      </article>`).join('') || renderEmptyMini('Evidence graph ще не готовий', 'Оновіть Merchant dashboard після scan.')}
    </div>
    ${renderMerchantGoogleDiagnostics(googleDiagnostics)}
    <details class="seo-capabilities merchant-rule-engine" open>
      <summary><strong>Feed rule engine і agentic tools</strong><span>${number(rules.length)} правил · ${number(tools.length)} Google tools</span></summary>
      <div class="seo-capability-grid">
        ${rules.map(rule => `<article>
          <span class="status-pill ${rule.writeMode === 'read_only' ? 'ok' : rule.writeMode === 'after_approval' ? 'warn' : ''}">${escapeHtml(rule.writeMode || 'rule')}</span>
          <strong>${escapeHtml(rule.name || rule.id)}</strong>
          <p>${escapeHtml(rule.impact || '')}</p>
          <small>${escapeHtml(rule.agent || '')}: ${asArray(rule.checks).map(escapeHtml).join(', ')}</small>
        </article>`).join('')}
      </div>
      <div class="tiny-list merchant-mcp-tools">
        <span class="tag ok">read-only MCP: ${allowedTools.slice(0, 6).map(escapeHtml).join(', ')}${allowedTools.length > 6 ? '…' : ''}</span>
        <span class="tag warn">blocked: ${blockedTools.slice(0, 4).map(escapeHtml).join(', ')}${blockedTools.length > 4 ? '…' : ''}</span>
      </div>
      <div class="merchant-tool-list">
        ${tools.map(tool => `<article class="source-card ${tool.status === 'alpha' ? 'needed' : 'ok'}">
          <span class="status-pill ${tool.status === 'alpha' ? 'warn' : 'ok'}">${escapeHtml(tool.status || 'tool')}</span>
          <h3>${escapeHtml(tool.name || tool.id)}</h3>
          <p>${escapeHtml(tool.value || '')}</p>
          <small>${escapeHtml(tool.guardrail || '')}</small>
        </article>`).join('')}
      </div>
    </details>
    ${asArray(intelligence.nextSteps).length ? `<div class="connection-warning merchant-intelligence-next">
      <span class="status-pill warn">наступне</span>
      <div>
        <strong>Що треба зробити, щоб агент став сильнішим</strong>
        <p>${asArray(intelligence.nextSteps).map(step => `• ${escapeHtml(step)}`).join('<br>')}</p>
      </div>
    </div>` : ''}
  </section>`;
}

function renderMerchantAgentContract(agent) {
  const contracts = {
    'catalog-scanner': ['read-only', 'Читає каталог і не має права писати.'],
    'feed-compliance': ['read-only', 'Розділяє реальні помилки, warning і невідомі дані.'],
    'landing-page': ['review', 'Перевіряє URL/ціну/наявність; неоднозначне віддає власнику.'],
    schema: ['review', 'Не створює Review/AggregateRating без реальних відгуків.'],
    images: ['review', 'Показує проблемні фото; заміну не вигадує.'],
	    'variant-policy': ['review', 'Не множить грамовки у фіді; фасування лишається storefront option, якщо власник не обрав інше.'],
    'merchant-api-diagnostics': ['read-only', 'Читає Google Merchant issues/status/performance і не має права писати.'],
    'fix-planner': ['preview', 'Готує diff, але не пише без approval.'],
    verifier: ['readback', 'Перечитує OpenCart після змін і запускає повторний scan.']
  };
  const [mode, note] = contracts[agent.id] || ['agent', 'Працює тільки в межах погодженого pipeline.'];
  const tone = mode === 'read-only' || mode === 'readback' ? 'ok' : mode === 'preview' ? 'warn' : '';
  return `<article class="source-card ok">
    <span class="status-pill ${tone}">${escapeHtml(mode)}</span>
    <h3>${escapeHtml(agent.name)}</h3>
    <p>${escapeHtml(agent.purpose)}</p>
    <div class="split-line"></div>
    <p>${escapeHtml(note)}</p>
    ${agent.specialistOutput ? `<small><b>Вихід:</b> ${escapeHtml(agent.specialistOutput)}</small>` : ''}
    <details>
      <summary>Evidence / права / заборони</summary>
      <p><b>Evidence:</b> ${escapeHtml(asArray(agent.evidenceRequired).join('; ') || '—')}</p>
      <p><b>Може:</b> ${escapeHtml(asArray(agent.canChange).join('; ') || '—')}</p>
      <p><b>Не може:</b> ${escapeHtml(asArray(agent.cannotChange).join('; ') || '—')}</p>
    </details>
  </article>`;
}

function renderMerchantActiveJob(job) {
  return `<section class="card audit-running">
    <span class="audit-spinner" aria-hidden="true"></span>
    <div>
      <strong>Catalog Scanner працює</strong>
      <p>Читає OpenCart у режимі read-only: ${number(job.productsRead || 0)} товарів, ${number(job.pagesRead || 0)} сторінок.</p>
      <small>Спроба ${number(job.attempt || 1)} · ${job.bridgeVersion ? `bridge ${escapeHtml(job.bridgeVersion)} · ` : ''}почато ${escapeHtml(seoDate(job.startedAt))}.</small>
    </div>
  </section>`;
}

function renderMerchantProduct(product) {
  const visibleIssues = asArray(product.issues).filter(issue => issue.severity !== 'info');
  return `<details class="merchant-product ${attr(product.status)}">
    <summary>
      <span class="status-pill ${merchantStatusTone(product.status)}">${escapeHtml(merchantStatusLabel(product.status))}</span>
      <div>
        <strong>${escapeHtml(product.name || product.productId || 'Товар')}</strong>
        <p>${escapeHtml(product.productId || '')}${product.link ? ` · ${escapeHtml(product.link)}` : ''}</p>
      </div>
      <b>${number(product.score || 0)}/100</b>
    </summary>
    <div class="merchant-product-body">
      <div class="merchant-facts">
        <span><small>Ціна</small><strong>${product.price ? `${number(product.price)} ${escapeHtml(product.priceCurrency || 'UAH')}` : '—'}</strong></span>
        <span><small>Наявність</small><strong>${escapeHtml(product.availability || '—')}</strong></span>
        <span><small>Бренд</small><strong>${escapeHtml(product.brand || '—')}</strong></span>
        <span><small>SKU / MPN</small><strong>${escapeHtml(product.sku || product.mpn || '—')}</strong></span>
      </div>
      ${product.variantPolicy ? `<div class="tiny-list">
        <span class="tag">feed strategy: ${escapeHtml(product.variantPolicy.variantExportMode || product.variantPolicy.status || 'unknown')}</span>
        <span class="tag">${number(product.variantPolicy.feedItemCount ?? product.variantPolicy.feedItems?.length ?? 0)} feed items</span>
        ${asArray(product.variantPolicy.customizationOptionNames || product.variantPolicy.customizationOptions).map(option => `<span class="tag">налаштування: ${escapeHtml(typeof option === 'string' ? option : option.name)}</span>`).join('')}
      </div>` : ''}
      <div class="merchant-issue-list">
        ${visibleIssues.length ? visibleIssues.map(issue => `<article class="merchant-issue ${attr(issue.severity)}">
          <span class="status-pill ${issue.severity === 'critical' ? 'bad' : issue.severity === 'high' || issue.severity === 'review' || issue.severity === 'unknown' ? 'warn' : 'ok'}">${escapeHtml(issue.severity)}</span>
          <div>
            <strong>${escapeHtml(issue.message)}</strong>
            <p>${escapeHtml(issue.impact || '')}</p>
            <small>${escapeHtml(issue.fix || '')}${issue.autoFixable ? ' · можна підготувати автоматично' : ' · потрібне підтвердження'}</small>
          </div>
        </article>`).join('') : '<p>Детерміновані правила не знайшли блокерів.</p>'}
      </div>
    </div>
  </details>`;
}

function renderMerchantPlanItem(item) {
  return `<article class="merchant-plan-item">
    <div>
      <strong>${escapeHtml(item.name || item.productId)}</strong>
      <p>${number(item.autoFixes?.length || 0)} автоматичних пропозицій · ${number(item.manualDecisions?.length || 0)} ручних рішень</p>
    </div>
    <span class="status-pill warn">publish off</span>
  </article>`;
}

function renderMerchantWriteItem(item) {
  return `<article class="merchant-write-item">
    <div class="merchant-write-item-head">
      <div>
        <strong>${escapeHtml(item.name || item.productId)}</strong>
        <small>product_id ${escapeHtml(item.productId || '')}</small>
      </div>
      <span class="status-pill warn">${number(item.proposals?.length || 0)} змін</span>
    </div>
    <div class="merchant-diff-list">${asArray(item.proposals).map(proposal => `
      <div class="merchant-diff">
        <div>
          <span class="tag">${proposal.target === 'opencart' ? 'OpenCart' : 'Merchant override в OpenCart'}</span>
          <strong>${escapeHtml(merchantProposalLabel(proposal.action))}</strong>
          <p>${escapeHtml(proposal.reason || '')}</p>
        </div>
        <div class="merchant-diff-values">
          <span><small>Було</small>${escapeHtml(proposal.before || 'порожньо')}</span>
          <span><small>Стане</small>${escapeHtml(proposal.after || 'порожньо')}</span>
        </div>
      </div>`).join('')}</div>
  </article>`;
}

function merchantProposalLabel(action = '') {
  const labels = {
    set_brand: 'Виправити бренд',
    clear_invalid_gtin: 'Очистити невалідний GTIN',
    set_feed_title_override: 'Merchant title',
    set_feed_description_override: 'Merchant description',
    set_identifier_exists: 'Identifier policy'
  };
  return labels[action] || action || 'Зміна';
}

function renderMerchantWriteRun(run) {
  return `<div class="merchant-write-run ${attr(run.status)}">
    <div>
      <strong>Останнє внесення: ${escapeHtml(run.status === 'completed' ? 'перевірено' : run.status)}</strong>
      <p>${number(run.completedProducts || 0)} успішно · ${number(run.failedProducts || 0)} з помилкою. Merchant Center publish не виконувався.</p>
    </div>
    <span class="status-pill ${run.status === 'completed' ? 'ok' : 'bad'}">${escapeHtml(seoDate(run.completedAt || run.startedAt))}</span>
  </div>`;
}

function renderMerchantBatchProduct(product) {
  return `<article class="merchant-plan-item merchant-batch-product">
    <div>
      <strong>${escapeHtml(product.name || product.productId)}</strong>
      <p>${escapeHtml(product.variantMessage || '')}</p>
      <div class="tiny-list">
        <span class="tag">brand: ${escapeHtml(product.brand || 'Mercato')}</span>
	        <span class="tag">${number(product.items?.length || 0)} feed offer</span>
	        <span class="tag">${product.landingSelectionVerified ? 'канонічний URL' : 'URL треба перевірити'}</span>
      </div>
      ${asArray(product.items).length ? `<div class="merchant-variant-preview">${product.items.map(renderMerchantVariantItem).join('')}</div>` : ''}
    </div>
    <span class="status-pill warn">dry-run</span>
  </article>`;
}

function renderMerchantVariantItem(item) {
  return `<div>
    <strong>${escapeHtml(item.title || item.id)}</strong>
    <small>${escapeHtml(item.id || '')} · ${number(item.price || 0)} ${escapeHtml(item.price_currency || 'UAH')} · ${escapeHtml(item.availability || '')}</small>
  </div>`;
}

function renderMatrix() {
  const matrixPayload = matrixData();
  const matrixCore = matrixPayload.matrix || matrixPayload;
  const sources = matrixPayload.source || matrixCore.sources || {};
  const summary = matrixCore.summary || {};
  const rows = productRows();
  const warning = state.matrix.lastError || matrixPayload.bridgeWarning || sources.opencartOrders?.warning || '';
  const status = state.matrix.running
    ? 'loading'
    : warning
      ? 'partial'
      : rows.length
        ? 'ready'
        : 'empty';
  return `<section class="hero-panel matrix-hero">
    <div>
      <p class="section-kicker">Product Matrix</p>
      <h2>Матриця має показувати гроші, попит і SEO-дірки — не магію</h2>
      <p>Цей екран поєднує продажі OpenCart, SEO-аудит товарів, GSC-попит і майбутні GA4-конверсії. Якщо джерело не підключене або зависло, система показує це прямо.</p>
      <div class="hero-actions">
        <button class="button" type="button" id="refreshMatrix" ${state.matrix.running ? 'disabled' : ''}>${state.matrix.running ? 'Оновлюю матрицю' : 'Оновити матрицю'}</button>
        <button class="button secondary" type="button" data-route="settings">Підключити джерела</button>
      </div>
    </div>
    <aside class="proof-box">
      <span class="status-pill ${status === 'ready' ? 'ok' : status === 'partial' ? 'warn' : ''}">${matrixStatusLabel(status)}</span>
      <strong>${number(rows.length || summary.rows || 0)} товарів у матриці</strong>
      <p>${warning ? escapeHtml(warning) : 'Матриця готова до сортування пріоритетів.'}</p>
    </aside>
  </section>

  <section class="metric-grid compact-metrics">
    ${renderMetric('OpenCart продажі', number(sources.opencartOrders?.ordersRead ?? sources.opencart?.orders ?? summary.orders ?? 0), sources.opencartOrders?.ok === false ? 'джерело недоступне' : 'прочитані замовлення')}
    ${renderMetric('SEO audit товарів', number(sources.opencart?.products ?? summary.products ?? 0), sources.opencart?.productAuditAt ? seoDate(sources.opencart.productAuditAt) : 'потрібен product audit')}
    ${renderMetric('GSC попит', number(sources.gsc?.rows ?? summary.gscRows ?? 0), sources.gsc?.configured ? `${number(sources.gsc.impressions || 0)} показів` : 'Search Console не підключено')}
    ${renderMetric('GA4 конверсії', sources.ga4?.configured ? 'Підключено' : 'Не підключено', sources.ga4?.note || 'add_to_cart / purchase будуть наступним шаром')}
  </section>

  ${warning ? `<section class="card connection-warning">
    <span class="status-pill warn">Matrix partial</span>
    <div>
      <strong>Матриця показує не повну картину</strong>
      <p>${escapeHtml(warning)}</p>
    </div>
  </section>` : ''}

  <section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Рішення по товарах</p>
        <h2>Що продавати, що доповнити SEO, що не рекламувати</h2>
        <p>Картки нижче мають бути діями: посилити сторінку, перевірити конверсію, прибрати витік бюджету або залишити переможця.</p>
      </div>
      <strong>${number(rows.length)} рядків</strong>
    </div>
    <div class="matrix-grid">${rows.length ? rows.map(renderProductCard).join('') : renderEmptyMini('Матриця ще порожня', state.matrix.running ? 'Читаю джерела…' : 'Потрібні замовлення OpenCart, SEO product audit або Google Search Console.')}</div>
  </section>`;
}

function matrixStatusLabel(status) {
  return {
    loading: 'оновлюється',
    partial: 'частково',
    ready: 'готово',
    empty: 'немає даних'
  }[status] || status || 'невідомо';
}

function renderProductCard(product, index = 0) {
  const id = productId(product, index);
  const name = product.name || product.productName || product.key || 'Товар';
  return `<article class="product-card ${id === state.selectedProductId ? 'is-selected' : ''}">
    <strong>${escapeHtml(name)}</strong>
    <p>${escapeHtml(product.reason || product.label || product.action || product.status || 'Потрібна дія')}</p>
    <div class="tiny-list">
      ${product.revenue || product.potentialRevenue ? `<span class="tag">${money(product.revenue || product.potentialRevenue)}</span>` : ''}
      ${product.clicks || product.gsc?.clicks ? `<span class="tag">${number(product.clicks || product.gsc?.clicks)} кліків</span>` : ''}
      ${product.impressions || product.gsc?.impressions ? `<span class="tag">${number(product.impressions || product.gsc?.impressions)} показів</span>` : ''}
    </div>
    <div class="price-line">
      <span>${escapeHtml(product.status || 'attention')}</span>
      <button class="button ghost" type="button" data-fill-product="${attr(name)}">Картка</button>
    </div>
  </article>`;
}

function adsPerformanceData() {
  return state.data.adsPerformance || { ok: false, error: 'Google Ads performance ще завантажується або не прочитаний.' };
}

function adsTotals(ads = {}) {
  return ads.totals || {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    conversionValue: 0,
    ctr: 0,
    averageCpc: 0
  };
}

function adsVerdict(ads = {}, ga4Check = {}) {
  const totals = adsTotals(ads);
  const impressions = Number(totals.impressions || 0);
  const clicks = Number(totals.clicks || 0);
  const cost = Number(totals.cost || 0);
  const conversions = Number(totals.conversions || 0);
  if (!ads.ok) {
    return {
      tone: 'warn',
      label: 'дані не готові',
      title: 'Не приймати рекламні рішення',
      body: ads.error || 'Спочатку треба прочитати Google Ads API. Без spend/clicks/conversions будь-яка рекомендація буде ворожінням.'
    };
  }
  if (!impressions && !clicks && !cost) {
    return {
      tone: 'warn',
      label: 'трафіку не видно',
      title: 'Ads підключено, але активної реклами за 30 днів не видно',
      body: 'Можна готувати структуру та landing/CRO, але оптимізувати кампанії ще немає з чого.'
    };
  }
  if (cost > 0 && conversions < 1) {
    return {
      tone: 'bad',
      label: 'бюджетний ризик',
      title: 'Є витрати без підтверджених конверсій',
      body: 'Перший крок — перевірити conversion tracking, пошукові терміни, landing-page match і мінус-слова. Масштабування заборонене.'
    };
  }
  if (!ga4Check?.ok) {
    return {
      tone: 'warn',
      label: 'tracking check',
      title: 'Ads читається, але GA4/конверсійний шлях треба перевірити',
      body: 'Кліки без поведінки після кліку не дають відповіді, чи сторінка продає. Спочатку звʼязати рекламу, landing і конверсії.'
    };
  }
  if (conversions < 30) {
    return {
      tone: 'warn',
      label: 'не масштабувати',
      title: 'Даних мало для агресивної оптимізації',
      body: 'Можна чистити waste, перевіряти сторінки і тестувати оголошення, але не робити різких bid/budget змін.'
    };
  }
  return {
    tone: 'ok',
    label: 'controlled optimization',
    title: 'Можна оптимізувати обережно',
    body: 'Є достатньо сигналів для контрольованих змін: preview, причина, ризик, rollback, не більше +20% бюджету за раз.'
  };
}

function adsCampaignRisk(campaign = {}, totals = {}) {
  const clicks = Number(campaign.clicks || 0);
  const impressions = Number(campaign.impressions || 0);
  const cost = Number(campaign.cost || 0);
  const conversions = Number(campaign.conversions || 0);
  const ctr = Number(campaign.ctr || 0);
  const channel = String(campaign.channel || '').toUpperCase();
  if (cost > 0 && conversions < 1) return { tone: 'bad', label: 'spend без конверсій' };
  if (clicks >= 30 && conversions < 1) return { tone: 'bad', label: 'кліки без заявок' };
  if (impressions >= 1000 && ctr < 1) return { tone: 'warn', label: 'низький CTR' };
  if (channel.includes('PERFORMANCE_MAX') && Number(totals.conversions || 0) < 50) return { tone: 'warn', label: 'PMax рано чіпати' };
  if (conversions > 0) return { tone: 'ok', label: 'є конверсії' };
  return { tone: 'warn', label: 'потрібна перевірка' };
}

function adsRiskList(ads = {}) {
  const totals = adsTotals(ads);
  const campaigns = asArray(ads.campaigns);
  const risks = [];
  if (!ads.ok) {
    risks.push({ tone: 'warn', title: 'Немає рекламних метрик', body: 'Спочатку refresh Ads API. До цього не пишемо оголошення і не міняємо бюджет.' });
  }
  if (Number(totals.cost || 0) > 0 && Number(totals.conversions || 0) < 1) {
    risks.push({ tone: 'bad', title: 'Витрати без конверсій', body: 'Перевірити conversion tracking, search terms, landing readiness і мінус-слова перед будь-яким scaling.' });
  }
  if (Number(totals.conversions || 0) > 0 && Number(totals.conversions || 0) < 30) {
    risks.push({ tone: 'warn', title: 'Мало конверсій для висновків', body: 'Не оцінювати Search/Smart Bidding як стабільний результат, доки немає хоча б 30 meaningful conversions.' });
  }
  if (campaigns.some(campaign => String(campaign.channel || '').toUpperCase().includes('PERFORMANCE_MAX')) && Number(totals.conversions || 0) < 50) {
    risks.push({ tone: 'warn', title: 'PMax без достатньої бази', body: 'PMax не чіпати різко: спочатку перевірка цілі, assets, listing/landing і 50 meaningful conversions.' });
  }
  if (!risks.length) {
    risks.push({ tone: 'ok', title: 'Критичних leak-сигналів не видно', body: 'Наступний крок — search terms, landing-page CRO і контрольовані RSA-тести без одночасної зміни бюджету та bidding.' });
  }
  return risks;
}

function adsLandingPages(ads = {}) {
  return asArray(ads.landingPages)
    .map(row => ({
      ...row,
      url: String(row.url || row.finalUrl || row.landingPage || '').trim(),
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
      cost: Number(row.cost || 0),
      conversions: Number(row.conversions || 0),
      conversionValue: Number(row.conversionValue || 0),
      ctr: Number(row.ctr || 0),
      cpa: Number(row.cpa || 0),
      conversionRate: Number(row.conversionRate || 0)
    }))
    .filter(row => row.url || row.clicks || row.cost)
    .sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
}

function landingUrlPath(url) {
  if (!url) return 'landing page';
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.pathname === '/' ? '/' : parsed.pathname.replace(/\/$/, '');
  } catch (error) {
    return String(url).replace(/^https?:\/\/[^/]+/i, '').replace(/\/$/, '') || String(url);
  }
}

function landingPageVerdict(page = {}) {
  const clicks = Number(page.clicks || 0);
  const cost = Number(page.cost || 0);
  const conversions = Number(page.conversions || 0);
  const conversionRate = Number(page.conversionRate || 0);
  if (clicks >= 20 && conversions < 1) {
    return {
      tone: 'bad',
      label: 'кліки без конверсій',
      action: 'Перевірити message match, перший екран, CTA, ціну/офер і довіру.'
    };
  }
  if (cost >= 300 && conversions < 1) {
    return {
      tone: 'bad',
      label: 'витрати без результату',
      action: 'Не масштабувати. Спочатку CRO-readiness і tracking readback.'
    };
  }
  if (clicks >= 30 && conversionRate > 0 && conversionRate < 1) {
    return {
      tone: 'warn',
      label: 'низький CVR',
      action: 'Тестувати офер, CTA і блок довіри без зміни бюджету.'
    };
  }
  if (conversions > 0) {
    return {
      tone: 'ok',
      label: 'є конверсії',
      action: 'Не ламати. Виносити успішні елементи на схожі landing pages.'
    };
  }
  return {
    tone: 'warn',
    label: 'мало даних',
    action: 'Дочитати дані або перевірити сторінку вручну перед висновками.'
  };
}

function conversionLoopSummary(ads = {}) {
  const totals = adsTotals(ads);
  const clicks = Number(totals.clicks || 0);
  const conversions = Number(totals.conversions || 0);
  const cost = Number(totals.cost || 0);
  return {
    cvr: roundNumber(clicks ? (conversions / clicks) * 100 : 0, 2),
    cpa: roundNumber(conversions ? cost / conversions : 0, 2),
    leakage: clicks && conversions < 1 ? 'клік є, конверсії не видно' : clicks ? 'є шлях для CRO' : 'спершу потрібні кліки',
    confidence: conversions >= 30 ? 'достатньо для оптимізації' : conversions > 0 ? 'обережні тести' : 'діагностика перед масштабуванням'
  };
}

function conversionLeakCards(ads = {}) {
  const pages = adsLandingPages(ads);
  const totals = adsTotals(ads);
  const leaks = [];
  const clicks = Number(totals.clicks || 0);
  const conversions = Number(totals.conversions || 0);
  if (!ads.ok) {
    leaks.push({
      tone: 'warn',
      title: 'Ads performance не прочитано',
      body: ads.error || 'Без кліків, витрат і конверсій агент не має права радити бюджетні дії.'
    });
  }
  if (ads.ok && ads.landingPagesError) {
    leaks.push({
      tone: 'warn',
      title: 'Landing-page звіт недоступний',
      body: `${ads.landingPagesError} Кампанії читаються, але треба бачити URL після кліку.`
    });
  }
  if (clicks > 0 && conversions < 1) {
    leaks.push({
      tone: 'bad',
      title: 'Кліки куплені, conversion path не підтверджений',
      body: 'Перший пріоритет — не нові оголошення, а перевірка: чи сторінка одразу відповідає на обіцянку реклами, чи видно ціну/вигоду/CTA, чи працює tracking.'
    });
  }
  const weakPages = pages.filter(page => landingPageVerdict(page).tone !== 'ok').slice(0, 3);
  weakPages.forEach(page => {
    const verdict = landingPageVerdict(page);
    leaks.push({
      tone: verdict.tone,
      title: `${landingUrlPath(page.url)} — ${verdict.label}`,
      body: `${number(page.clicks || 0)} кліків · ${seoMoney(page.cost || 0)} · ${number(page.conversions || 0)} конверсій. ${verdict.action}`
    });
  });
  if (!leaks.length) {
    leaks.push({
      tone: 'ok',
      title: 'Критичного витоку не видно',
      body: 'Наступний крок — не “переписати все”, а перенести елементи сторінок з конверсіями на схожі сторінки без конверсій і запустити контрольований тест.'
    });
  }
  return leaks.slice(0, 5);
}

function conversionAbTests(ads = {}) {
  const pages = adsLandingPages(ads);
  const focusPage = pages.find(page => landingPageVerdict(page).tone === 'bad') || pages[0] || {};
  const path = landingUrlPath(focusPage.url);
  return [
    {
      tone: 'bad',
      title: 'Message match першого екрану',
      page: path,
      hypothesis: 'Якщо H1/перший екран повторює intent оголошення і одразу показує “що купити/замовити”, bounce має впасти, а CVR зрости.',
      variant: 'A: поточний hero. B: hero з конкретним офером, ціною/діапазоном, доставкою і основним CTA.',
      metric: 'CVR, add_to_cart/lead click, scroll до товарів, CPA.',
      guard: 'Не міняти бюджет і bidding одночасно.'
    },
    {
      tone: 'warn',
      title: 'Ціна та офер без здогадок',
      page: path,
      hypothesis: 'Частина кліків не конвертує, бо людина не розуміє ціну, фасування, доставку або чому купити саме тут.',
      variant: 'B: під CTA додати короткий блок “ціна/фасування/доставка/оплата/повернення” без SEO-тексту.',
      metric: 'Add to cart, checkout start, CTA click, CVR.',
      guard: 'Не вигадувати знижки або гарантії, яких немає.'
    },
    {
      tone: 'warn',
      title: 'Довіра біля рішення',
      page: path,
      hypothesis: 'Якщо поруч із CTA є відгуки, умови доставки, спосіб оплати і proof бренду, більше людей переходить до покупки.',
      variant: 'B: trust-strip біля CTA: свіжість, доставка, оплата, повернення, реальні відгуки якщо є.',
      metric: 'CTA click, add_to_cart, purchase/lead.',
      guard: 'Не додавати фейкові Review/AggregateRating.'
    },
    {
      tone: 'ok',
      title: 'Внутрішній шлях після кліку',
      page: path,
      hypothesis: 'Якщо landing не ідеально відповідає intent, контрольовані внутрішні посилання на категорії/товари можуть врятувати частину трафіку.',
      variant: 'B: блок “оберіть за смаком/форматом” з 3–5 релевантними посиланнями, а не полотно випадкового SEO-тексту.',
      metric: 'Next-page click, product view, add_to_cart, CVR.',
      guard: 'Лінкувати тільки на реально релевантні сторінки.'
    }
  ];
}

function renderLandingPageCard(page) {
  const verdict = landingPageVerdict(page);
  return `<article class="landing-page-card">
    <div>
      <strong>${escapeHtml(landingUrlPath(page.url))}</strong>
      <small>${escapeHtml(page.url || '')}</small>
    </div>
    <div class="landing-page-metrics">
      <span>${number(page.clicks || 0)} кліків</span>
      <span>${seoMoney(page.cost || 0)}</span>
      <span>${number(page.conversions || 0)} conv.</span>
      <span>CVR ${seoPercent(page.conversionRate || 0)}</span>
      <span>${page.cpa ? `CPA ${seoMoney(page.cpa)}` : 'CPA —'}</span>
    </div>
    <p>${escapeHtml(verdict.action)}</p>
    <span class="status-pill ${verdict.tone}">${escapeHtml(verdict.label)}</span>
  </article>`;
}

function renderConversionLoop(ads = {}) {
  const pages = adsLandingPages(ads).slice(0, 6);
  const leaks = conversionLeakCards(ads);
  const tests = conversionAbTests(ads);
  const summary = conversionLoopSummary(ads);
  return `<section class="card conversion-loop-card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Click → Landing → Conversion</p>
        <h2>Не просто “є клік”, а чому він не став продажем</h2>
        <p>Агенти мають аналізувати очікування після кліку: чи сторінка відповідає рекламі, чи зрозумілий офер, чи видно ціну, довіру і наступну дію.</p>
      </div>
      <div class="conversion-summary">
        <span class="status-pill ${summary.confidence.includes('достатньо') ? 'ok' : 'warn'}">${escapeHtml(summary.confidence)}</span>
        <strong>CVR ${seoPercent(summary.cvr)} · CPA ${summary.cpa ? seoMoney(summary.cpa) : '—'}</strong>
        <small>${escapeHtml(summary.leakage)}</small>
      </div>
    </div>
    <div class="conversion-loop-grid">
      <article>
        <div class="mini-head">
          <span class="status-pill warn">landing pages</span>
          <strong>Куди реально пішли кліки</strong>
        </div>
        ${pages.length ? `<div class="landing-page-list">${pages.map(renderLandingPageCard).join('')}</div>` : renderEmptyMini('Landing pages не прочитані', ads.landingPagesError || 'Google Ads campaign metrics є, але URL після кліку ще недоступні.')}
      </article>
      <article>
        <div class="mini-head">
          <span class="status-pill bad">leaks</span>
          <strong>Де втрачаємо гроші або покупців</strong>
        </div>
        <div class="conversion-leak-list">
          ${leaks.map(leak => `<section>
            <span class="status-pill ${leak.tone}">${escapeHtml(leak.tone === 'bad' ? 'критично' : leak.tone === 'ok' ? 'ок' : 'увага')}</span>
            <strong>${escapeHtml(leak.title)}</strong>
            <p>${escapeHtml(leak.body)}</p>
          </section>`).join('')}
        </div>
      </article>
    </div>
    <details class="seo-accordion conversion-tests" open>
      <summary>
        <span>A/B тести і дії після approval</span>
        <strong>що саме перевіряти, а не “покращити SEO”</strong>
      </summary>
      <div class="ab-test-grid">
        ${tests.map(test => `<article>
          <span class="status-pill ${test.tone}">${escapeHtml(test.page)}</span>
          <h3>${escapeHtml(test.title)}</h3>
          <p><strong>Гіпотеза:</strong> ${escapeHtml(test.hypothesis)}</p>
          <p><strong>Варіант:</strong> ${escapeHtml(test.variant)}</p>
          <p><strong>Метрика:</strong> ${escapeHtml(test.metric)}</p>
          <small>${escapeHtml(test.guard)}</small>
        </article>`).join('')}
      </div>
    </details>
  </section>`;
}

function renderAdsCampaignRow(campaign, totals) {
  const risk = adsCampaignRisk(campaign, totals);
  return `<div class="ads-campaign-row">
    <div>
      <strong>${escapeHtml(campaign.name || campaign.id || 'Кампанія')}</strong>
      <small>${escapeHtml([campaign.channel, campaign.status].filter(Boolean).join(' · ') || 'Google Ads campaign')}</small>
    </div>
    <span>${number(campaign.impressions || 0)} показів</span>
    <span>${number(campaign.clicks || 0)} кліків</span>
    <span>${seoMoney(campaign.cost || 0)}</span>
    <span>${number(campaign.conversions || 0)} conv.</span>
    <span class="status-pill ${risk.tone}">${escapeHtml(risk.label)}</span>
  </div>`;
}

function renderPpcAgentStack() {
  const agents = [
    ['Diagnosis Agent', 'Ставить вердикт: готово / тільки з обмеженнями / не запускати.', 'Блокує запуск без landing, tracking і conversion path.'],
    ['Search Intent Agent', 'Класифікує buyer / research / waste / competitor.', 'Готує мінус-слова dry-run, не міняє акаунт сам.'],
    ['RSA Copy Agent', 'Пише 15 headlines ≤30 і 4 descriptions ≤90.', 'Спочатку перевіряє URL, intent і page-message match.'],
    ['Landing CRO Agent', 'Перевіряє CTA, proof, форму, мобільний перший екран.', 'Каже прямо, якщо сторінку не можна рекламувати.'],
    ['PMax Risk Agent', 'Моніторить CPA spike, conversion drop, spend без conversions.', 'Без паніки від 3-денних коливань і без різких бюджетів.'],
    ['API Operator Agent', 'Read-only за замовчуванням; write тільки після preview + CONFIRM.', 'Кожна зміна має current value, proposed value, reason, risk, rollback.']
  ];
  return `<section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">PPC agent stack</p>
        <h2>Що саме роблять рекламні агенти</h2>
        <p>Це не “AI напише оголошення”. Це контур: дані → діагноз → preview → підтвердження → дія.</p>
      </div>
      <span class="status-pill warn">write disabled</span>
    </div>
    <div class="ads-agent-grid">
      ${agents.map(([title, body, guard]) => `<article>
        <span class="status-pill ok">agent</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(body)}</p>
        <small>${escapeHtml(guard)}</small>
      </article>`).join('')}
    </div>
  </section>`;
}

function renderProm3dPpcPlaybook() {
  const pagesToAdvertise = [
    'Великоформатний 3D-друк / industrial FDM: сильний B2B intent і зрозумілий use-case.',
    'Виробничі пристосування, tooling, master patterns: менше “друк іграшок”, більше кваліфікованих заявок.',
    'Галузеві сторінки для інженерів/виробництва/ливарки, якщо на сторінці є приклади, розміри, матеріали і форма заявки.'
  ];
  const pagesToAvoid = [
    'Сторінки без чіткого CTA або без прикладів робіт.',
    'Загальні “3D друк” сторінки, які ловлять студентів, хобістів, STL і дешевий друк.',
    'Сторінки без tracking подій: form submit, phone/email click, messenger click, quote request.'
  ];
  const negatives = ['free / STL / model download', 'hobby / toy / miniature', 'jobs / salary / course', 'printer purchase / repair / filament', 'student / school / thesis'];
  const plan = ['Тиждень 1: tracking + landing readiness + запуск обмежених Search Exact/Phrase.', 'Тиждень 2: search terms, мінус-слова, CTR/CPC/CVR.', 'Тиждень 3: RSA message tests + CTA/landing fixes.', 'Тиждень 4: scale тільки winners, pause waste, план наступної кампанії.'];
  return renderSeoAccordion({
    title: 'Prom3D PPC/CRO playbook',
    kicker: 'з прикріпленого ТЗ',
    summary: 'high-ticket B2B leads, не дешевий “друк за грам”',
    open: false,
    content: `<div class="ads-playbook-grid">
      <article>
        <span class="status-pill ok">advertise</span>
        <h3>Куди вести рекламу</h3>
        <ul>${pagesToAdvertise.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </article>
      <article>
        <span class="status-pill bad">avoid</span>
        <h3>Куди не вести бюджет</h3>
        <ul>${pagesToAvoid.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </article>
      <article>
        <span class="status-pill warn">negatives</span>
        <h3>Мінус-наміри</h3>
        <ul>${negatives.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </article>
      <article>
        <span class="status-pill ok">30 days</span>
        <h3>План тесту</h3>
        <ul>${plan.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </article>
    </div>`
  });
}

function renderAdsGuardrails() {
  const rules = [
    'Не масштабувати, якщо search terms брудні.',
    'Не збільшувати бюджет більше ніж на 20% за раз.',
    'Не міняти budget, bidding, landing і структуру одночасно.',
    'Search не оцінювати без 30 meaningful conversions.',
    'PMax не оцінювати без 50 meaningful conversions.',
    'Live-зміна тільки через preview: було → стане → причина → ризик → rollback → CONFIRM.'
  ];
  return `<section class="card ads-guardrails">
    <div class="section-head">
      <div>
        <p class="section-kicker">Budget safety</p>
        <h2>Правила, які захищають гроші</h2>
        <p>Ці правила важливіші за красиві headlines. Якщо вони порушені — агент має блокувати дію.</p>
      </div>
    </div>
    <div class="ads-rule-list">${rules.map(rule => `<span>${escapeHtml(rule)}</span>`).join('')}</div>
  </section>`;
}

function renderAds() {
  const checks = asArray(setupGuide().checks);
  const ga4 = checks.find(check => check.id === 'analytics');
  const adsCheck = checks.find(check => check.id === 'google-ads');
  const ads = adsPerformanceData();
  const totals = adsTotals(ads);
  const verdict = adsVerdict(ads, ga4);
  const risks = adsRiskList(ads);
  const campaigns = asArray(ads.campaigns);
  const cpa = Number(totals.conversions || 0) ? Number(totals.cost || 0) / Number(totals.conversions || 0) : 0;
  const roas = Number(totals.cost || 0) ? Number(totals.conversionValue || 0) / Number(totals.cost || 0) : 0;
  return `<section class="card ads-director-hero">
    <div>
      <p class="section-kicker">PPC + CRO Director</p>
      <h2>${escapeHtml(verdict.title)}</h2>
      <p>${escapeHtml(verdict.body)}</p>
      <div class="button-row">
        <button class="button" type="button" id="refreshAdsPerformance">Оновити Ads-дані</button>
        <button class="button secondary" type="button" data-route="seo">Перевірити landing/SEO</button>
        <button class="button secondary" type="button" data-route="settings">Доступи</button>
      </div>
    </div>
    <aside class="proof-box">
      <span class="status-pill ${verdict.tone}">${escapeHtml(verdict.label)}</span>
      <strong>${ads.ok ? `${number(totals.clicks || 0)} кліків · ${seoMoney(totals.cost || 0)}` : 'read-only'}</strong>
      <p>${ads.ok ? `${number(totals.impressions || 0)} показів · ${number(totals.conversions || 0)} конверсій · ${escapeHtml(ads.dateRangeLabel || '30 днів')}` : escapeHtml(ads.error || 'Немає даних Ads performance.')}</p>
    </aside>
  </section>

  <section class="metric-grid compact-metrics">
    ${renderMetric('Покази', number(totals.impressions || 0), ads.ok ? (ads.dateRangeLabel || 'останні 30 днів') : 'немає даних')}
    ${renderMetric('Кліки', number(totals.clicks || 0), `CTR ${seoPercent(totals.ctr || 0)}`)}
    ${renderMetric('Витрати', seoMoney(totals.cost || 0), `CPC ${seoMoney(totals.averageCpc || 0)}`)}
    ${renderMetric('Конверсії', number(totals.conversions || 0), cpa ? `CPA ${seoMoney(cpa)}` : 'мало для scaling')}
    ${renderMetric('Цінність / ROAS', seoMoney(totals.conversionValue || 0), `ROAS ${roas.toLocaleString('uk', { maximumFractionDigits: 2 })}×`)}
  </section>

  ${renderConversionLoop(ads)}

  <section class="ads-work-grid">
    <article class="card">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">Campaign diagnostics</p>
          <h2>Що відбувається в Ads</h2>
          <p>Read-only зріз. Жодних змін у Google Ads з цього екрана не виконується.</p>
        </div>
        <span class="status-pill ${ads.ok ? 'ok' : 'warn'}">${ads.ok ? 'API працює' : 'немає performance'}</span>
      </div>
      ${campaigns.length ? `<div class="ads-campaign-list">${campaigns.map(campaign => renderAdsCampaignRow(campaign, totals)).join('')}</div>` : renderEmptyMini('Кампанії не прочитано', ads.error || 'Натисніть “Оновити Ads-дані” або перевірте OAuth/Developer token.')}
    </article>
    <article class="card">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">Leak risks</p>
          <h2>Де можна злити бюджет</h2>
          <p>Перший фокус — не “зробити красиво”, а не витрачати гроші на слабкий intent або сторінку.</p>
        </div>
      </div>
      <div class="ads-risk-list">
        ${risks.map(risk => `<article>
          <span class="status-pill ${risk.tone}">${escapeHtml(risk.tone === 'bad' ? 'критично' : risk.tone === 'ok' ? 'ок' : 'увага')}</span>
          <strong>${escapeHtml(risk.title)}</strong>
          <p>${escapeHtml(risk.body)}</p>
        </article>`).join('')}
      </div>
    </article>
  </section>

  <section class="content-grid">
    ${renderIntegrationState('Google Analytics 4', ga4, 'GA4 потрібна, щоб бачити sessions, add_to_cart, purchase/lead, conversion rate і поведінку сторінок після кліку.')}
    ${renderIntegrationState('Google Ads', adsCheck, 'Google Ads потрібен не для галочки: він дає spend, CPC, conversions, кампанії і сигнал, де реклама палить бюджет.')}
  </section>

  ${renderPpcAgentStack()}
  ${renderAdsGuardrails()}
  ${renderProm3dPpcPlaybook()}`;
}

function renderIntegrationState(title, check, body) {
  const ok = Boolean(check?.ok);
  return `<article class="empty-state">
    <span class="status-pill ${ok ? 'ok' : 'warn'}">${ok ? 'Працює' : 'Потрібно підключити'}</span>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(body)}</p>
    <p>${escapeHtml(humanConnectionDetail(check?.detail || 'Відкрийте “Налаштування” і додайте доступ до цього сервісу.'))}</p>
    <button class="button ${ok ? 'secondary' : ''}" type="button" data-route="settings">${ok ? 'Перевірити джерело' : 'Підключити джерело'}</button>
  </article>`;
}

function renderSettings() {
  const pricing = dashboard().pricing || FALLBACK.dashboard.pricing;
  const guide = setupGuide();
  return `<section class="hero-panel">
    <div>
      <p class="section-kicker">Налаштування</p>
      <h2>Підключення без коду</h2>
      <p>Власник або менеджер вставляє доступи до магазину, Google, пошти й tracking прямо в дашборді. Повні секрети назад не показуються.</p>
    </div>
    <aside class="proof-box">
      <span class="status-pill warn">Доступи</span>
      <strong>Магазин, Google, email, tracking</strong>
      <p>Після збереження натисніть “Оновити”, і система перерахує статуси джерел.</p>
    </aside>
  </section>
  <section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Доступи до сервісів</p>
        <h2>Вставити ключі прямо в dashboard</h2>
        <p>Заповнюйте тільки ті поля, які маєте. Порожні поля не перезаписують уже збережені доступи.</p>
      </div>
      <button class="button secondary" type="button" id="refreshConnections">Перевірити ще раз</button>
    </div>
    <div class="source-grid">${renderCredentialForms()}</div>
  </section>
  ${renderFirstOrderPopupSettings()}
  <section class="pricing-grid">${asArray(pricing.plans).map(plan => `<article class="module-card">
    <span class="status-pill ok">${escapeHtml(plan.name)}</span>
    <h2>${escapeHtml(plan.price)}</h2>
    <p>${escapeHtml(plan.products || '')}</p>
    <div class="split-line"></div>
    <p>${escapeHtml(plan.seo || '')}</p>
    <p>${escapeHtml(plan.email || '')}</p>
  </article>`).join('')}</section>
  <section class="card">
    <div class="section-head">
      <div>
        <p class="section-kicker">Safety gates</p>
        <h2>Live-дії тільки після погодження</h2>
        <p>Email send, coupon creation і publish не мають бути прихованим side effect. Кожна дія проходить preview/dry-run/confirm.</p>
      </div>
    </div>
    <div class="source-grid">${asArray(guide.checks).map(renderSourceCard).join('')}</div>
  </section>`;
}

function bindViewEvents() {
  document.querySelectorAll('[data-route]').forEach(button => {
    button.addEventListener('click', () => navigate(button.dataset.route));
  });
  document.querySelectorAll('[data-scroll-target]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      scrollToAppElement(button.dataset.scrollTarget || '');
    });
  });
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', event => {
      const target = String(anchor.getAttribute('href') || '').replace(/^#/, '').trim();
      if (!target) return;
      event.preventDefault();
      if (NAV.some(item => item.id === target)) {
        navigate(target);
      } else {
        scrollToAppElement(target);
      }
    });
  });
  document.querySelectorAll('[data-bottom-route]').forEach(button => {
    button.addEventListener('click', () => {
      if (button.dataset.bottomRoute === 'menu') {
        state.menuOpen = !state.menuOpen;
        render();
      } else {
        navigate(button.dataset.bottomRoute);
      }
    });
  });
  document.querySelectorAll('[data-action-open]').forEach(button => {
    button.addEventListener('click', () => openAction(button.dataset.actionOpen));
  });
  bindSimple('#retryPrimaryData', () => loadApp({ refresh: true }));
  bindSimple('#refreshActions', () => loadApp({ refresh: true }));
  bindSimple('#refreshConnections', () => loadApp({ refresh: true }));
  bindSimple('#refreshMatrix', () => loadDeferredAppData({ refresh: true, only: 'matrix' }));
  bindSimple('#refreshAdsPerformance', refreshAdsPerformance);
  bindSimple('#refreshSeoCenter', () => refreshSeoCenter());
  bindSimple('#runSeoAudit', () => runSeoAudit());
  bindSimple('#runWeeklySeo', () => runSeoAudit({ weekly: true }));
  bindSimple('#refreshSeoIntelligence', refreshSeoIntelligence);
  bindSimple('#runSeoControlScan', runSeoControlScan);
  bindSimple('#runSeoControlScanFromIntelligence', runSeoControlScan);
  bindSimple('#buildSeoFixPreview', buildSeoFixPreview);
  bindSimple('#approveSeoFixes', approveSeoFixes);
  bindSimple('#applySeoFixes', applySeoFixes);
  document.querySelectorAll('[data-seo-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.seoAction;
    if (button.dataset.seoTarget) {
      state.seoCenter.target = button.dataset.seoTarget || '';
      const targetNode = $('#seoAuditTarget');
      if (targetNode) targetNode.value = state.seoCenter.target;
    }
    if (button.dataset.seoMode) {
      state.seoCenter.mode = button.dataset.seoMode || state.seoCenter.mode || 'page';
      const modeNode = $('#seoAuditMode');
      if (modeNode) modeNode.value = state.seoCenter.mode;
    }
    if (action === 'control-scan') runSeoControlScan();
    if (action === 'build-preview') buildSeoFixPreview({
      missionId: button.dataset.seoMission || '',
      actionId: button.dataset.seoActionId || ''
    });
    if (action === 'approve') approveSeoFixes();
    if (action === 'reject-preview') rejectSeoFixPreview();
    if (action === 'apply') applySeoFixes();
    if (action === 'weekly') runSeoAudit({ weekly: true });
    if (action === 'audit') runSeoAudit();
    if (action === 'settings') navigate('settings');
  }));
  document.querySelectorAll('[data-seo-rollback]').forEach(button => button.addEventListener('click', () => rollbackSeoChange(button)));
  document.querySelectorAll('[data-seo-agent-draft]').forEach(button => button.addEventListener('click', () => draftSeoAgentPatch(button)));
  document.querySelectorAll('[data-seo-agent-draft-batch]').forEach(button => button.addEventListener('click', () => draftSeoAgentBatch(button)));
  document.querySelectorAll('[data-seo-select-all-changes]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-seo-preview-change]').forEach(input => { input.checked = true; });
  }));
  document.querySelectorAll('[data-seo-clear-change-selection]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-seo-preview-change]').forEach(input => { input.checked = false; });
  }));
  document.querySelectorAll('[data-seo-select-technical-changes]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-seo-preview-change]').forEach(input => {
      input.checked = input.hasAttribute('data-seo-preview-technical');
    });
  }));
  document.querySelectorAll('[data-seo-preview-remove-selected]').forEach(button => button.addEventListener('click', removeSelectedSeoPreviewChanges));
  bindSimple('#runMerchantScan', runMerchantScan);
  bindSimple('#buildMerchantPlan', buildMerchantPlan);
  bindSimple('#buildMerchantTestBatch', buildMerchantTestBatch);
  bindSimple('#buildMerchantWritePreview', buildMerchantWritePreview);
  bindSimple('#approveMerchantChanges', approveMerchantChanges);
  bindSimple('#applyMerchantChanges', applyMerchantChanges);
  bindSimple('#refreshMerchantGoogleDiagnostics', refreshMerchantGoogleDiagnostics);
  document.querySelectorAll('[data-merchant-filter]').forEach(button => button.addEventListener('click', () => {
    state.merchant.filter = button.dataset.merchantFilter || 'all';
    render();
  }));
  bindInput('#merchantSearch', value => {
    state.merchant.search = value;
    render();
  }, 'change');
  document.querySelectorAll('[data-seo-site]').forEach(button => button.addEventListener('click', () => {
    selectSeoSite(button.dataset.seoSite);
  }));
  bindInput('#seoAuditMode', value => { state.seoCenter.mode = value; }, 'change');
  bindInput('#seoAuditTarget', value => { state.seoCenter.target = value; });
  bindInput('#seoBatchEntities', value => { seoSetAgentBatchLimit(value); }, 'change');
  document.querySelectorAll('[data-seo-batch-limit]').forEach(button => button.addEventListener('click', () => {
    seoSetAgentBatchLimit(button.dataset.seoBatchLimit);
    render();
  }));
  bindSimple('#generateEmail', () => {
    seedEmailDraft(true);
    render();
    toast('Чернетку оновлено.');
  });
  bindSimple('#createCoupon', createCoupon);
  bindSimple('#sendTestEmail', () => sendEmail('test'));
  bindSimple('#sendOneEmail', () => sendEmail('one'));
  bindSimple('#sendSegmentEmail', () => sendEmail('segment'));
  bindSimple('#importProductUrl', importProductUrl);
  bindSimple('#generateProductDraft', () => {
    syncProductFields();
    syncProductTopFields();
    const draft = productDraft();
    Object.assign(state.product, {
      title: draft.title,
      meta: draft.meta,
      h1: draft.h1,
      description: draft.description,
      attributes: draft.attributes,
      lastDryRunOk: false,
      lastResult: { ok: true, dryRun: true, status: 'local_preview', message: 'Preview оновлено локально. Тепер запустіть Dry-run перед publish.', at: new Date().toISOString() }
    });
    render();
    toast('Картку згенеровано з фактів.');
  });
  bindSimple('#applyProductTopFacts', applyProductTopFacts);
  bindSimple('#productDryRun', () => publishProduct(true));
  bindSimple('#productPublish', () => publishProduct(false));
  bindSimple('#seoDryRun', () => publishSeo(true));
  bindSimple('#seoPublish', () => publishSeo(false));
  document.querySelectorAll('[data-subject]').forEach(button => button.addEventListener('click', () => {
    state.email.subject = button.dataset.subject || '';
    render();
  }));
  document.querySelectorAll('[data-preview]').forEach(button => button.addEventListener('click', () => {
    state.emailPreviewMode = button.dataset.preview || 'mobile';
    render();
  }));
  document.querySelectorAll('[data-recipient-toggle]').forEach(input => input.addEventListener('change', () => {
    setRecipientExcluded(input.dataset.recipientToggle, !input.checked);
    render();
  }));
  document.querySelectorAll('[data-recipient-remove]').forEach(button => button.addEventListener('click', () => {
    setRecipientExcluded(button.dataset.recipientRemove, true);
    render();
  }));
  bindSimple('#selectAllRecipients', () => {
    setAllRecipientsSelected(true);
    render();
  });
  bindSimple('#clearAllRecipients', () => {
    setAllRecipientsSelected(false);
    render();
  });
  document.querySelectorAll('[data-customer-id]').forEach(button => button.addEventListener('click', () => {
    state.selectedCustomerId = button.dataset.customerId || '';
    render();
  }));
  document.querySelectorAll('[data-seo-id]').forEach(button => button.addEventListener('click', () => {
    state.selectedSeoId = button.dataset.seoId || '';
    render();
  }));
  document.querySelectorAll('[data-seo-filter]').forEach(button => button.addEventListener('click', () => {
    state.seoFilter = button.dataset.seoFilter || 'all';
    render();
  }));
  document.querySelectorAll('[data-fill-product]').forEach(button => button.addEventListener('click', () => {
    state.product.name = button.dataset.fillProduct || state.product.name;
    navigate('product');
  }));
  document.querySelectorAll('[data-connector-form]').forEach(form => form.addEventListener('submit', saveConnectorForm));
  document.querySelectorAll('[data-connector-verify]').forEach(button => button.addEventListener('click', () => verifyConnector(button)));
  document.querySelectorAll('[data-popup-config-form]').forEach(form => form.addEventListener('submit', saveFirstOrderPopupConfig));
  bindInput('#seoSearch', value => { state.seoSearch = value; render(); }, 'change');
  const productUrlInput = $('#productUrl');
  if (productUrlInput) {
    productUrlInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        importProductUrl();
      }
    });
  }
  bindEmailInputs();
  bindProductInputs();
  document.querySelectorAll('[data-insert]').forEach(button => button.addEventListener('click', () => {
    const body = $('#emailBody');
    if (!body) return;
    const insert = button.dataset.insert || '';
    const start = body.selectionStart || body.value.length;
    const end = body.selectionEnd || body.value.length;
    body.value = `${body.value.slice(0, start)}${insert}${body.value.slice(end)}`;
    state.email.body = body.value;
    render();
  }));
}

function bindSimple(selector, handler) {
  const node = $(selector);
  if (node) node.addEventListener('click', handler);
}

function bindInput(selector, handler, event = 'input') {
  const node = $(selector);
  if (node) node.addEventListener(event, () => handler(node.type === 'checkbox' ? node.checked : node.value));
}

function bindEmailInputs() {
  bindInput('#emailSegment', value => {
    state.email.segmentId = value;
    state.email.excludedRecipientIds = [];
    render();
  }, 'change');
  bindInput('#campaignType', value => { state.email.campaignType = value; seedEmailDraft(true); render(); }, 'change');
  bindInput('#emailOffer', value => { state.email.offer = value; });
  bindInput('#emailUrl', value => { state.email.url = value; });
  bindInput('#emailSubject', value => { state.email.subject = value; });
  bindInput('#emailPreheader', value => { state.email.preheader = value; });
  bindInput('#emailBody', value => { state.email.body = value; });
  bindInput('#emailCta', value => { state.email.cta = value; });
  bindInput('#emailCtaUrl', value => { state.email.url = value; });
  bindInput('#couponEnabled', value => { state.email.coupon.enabled = value; render(); }, 'change');
  bindInput('#couponDiscount', value => { state.email.coupon.discount = Number(value || 0); });
  bindInput('#couponType', value => { state.email.coupon.type = value; }, 'change');
  bindInput('#couponDays', value => { state.email.coupon.days = Number(value || 1); });
}

function bindProductInputs() {
  bindInput('#productMode', value => { state.productMode = value; }, 'change');
  ['productType', 'productUrl', 'productName', 'productFacts', 'productTitle', 'productMeta', 'productH1', 'productDescription', 'productAttributes'].forEach(id => {
    const key = id.replace('product', '');
    const map = { Type: 'type', Url: 'url', Name: 'name', Facts: 'facts', Title: 'title', Meta: 'meta', H1: 'h1', Description: 'description', Attributes: 'attributes' };
    bindInput(`#${id}`, value => {
      state.product[map[key]] = value;
      if (id === 'productDescription' || id === 'productAttributes') state.product.topFactsDirty = false;
      state.product.lastDryRunOk = false;
    });
  });
  bindProductTopInputs();
}

function bindProductTopInputs() {
  [
    'productTopTaste',
    'productTopHarvest',
    'productTopFit',
    'productTopBrew',
    'productScaleAcidity',
    'productScaleSweetness',
    'productScaleBody',
    'productScaleAftertaste',
    'productScaleFruitiness'
  ].forEach(id => {
    const node = $(`#${id}`);
    if (!node) return;
    node.addEventListener('input', () => {
      syncProductTopFields();
      state.product.topFactsDirty = true;
      state.product.lastDryRunOk = false;
    });
  });
}

function openAction(type) {
  const map = {
    content: 'seo',
    seo: 'seo',
    customer: 'customers',
    customers: 'customers',
    email: 'email',
    setup: 'connect',
    product: 'product',
    ads: 'ads'
  };
  navigate(map[type] || 'actions');
}

function syncProductFields() {
  ['productType', 'productUrl', 'productName', 'productFacts', 'productTitle', 'productMeta', 'productH1', 'productDescription', 'productAttributes'].forEach(id => {
    const node = $(`#${id}`);
    if (!node) return;
    const key = id.replace('product', '');
    const map = { Type: 'type', Url: 'url', Name: 'name', Facts: 'facts', Title: 'title', Meta: 'meta', H1: 'h1', Description: 'description', Attributes: 'attributes' };
    state.product[map[key]] = node.value;
  });
}

function updateProductFactLine(factsText, label, value, aliases = []) {
  const wanted = new Set([label, ...aliases].map(item => String(item || '').trim().toLowerCase()).filter(Boolean));
  const lines = String(factsText || '').split(/\n+/).map(line => line.trim()).filter(Boolean);
  let replaced = false;
  const output = [];
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(':');
    const key = String(rawKey || '').trim();
    const normalized = key.toLowerCase();
    if (wanted.has(normalized)) {
      if (!replaced && String(value || '').trim()) output.push(`${label}: ${String(value || '').trim()}`);
      replaced = true;
      continue;
    }
    output.push(rest.length ? line : `Факт: ${line}`);
  }
  if (!replaced && String(value || '').trim()) output.push(`${label}: ${String(value || '').trim()}`);
  return output.join('\n');
}

function syncProductTopFields() {
  const before = state.product.facts || '';
  const fields = [
    ['productTopTaste', 'Смак', ['профіль', 'смаковий профіль'], value => String(value || '').trim()],
    ['productTopHarvest', 'Рік врожаю', ['врожай', 'урожай', 'harvest', 'crop year'], normalizeHarvestYear],
    ['productTopFit', 'Кому підійде', ['для кого', 'аудиторія'], value => String(value || '').trim()],
    ['productTopBrew', 'Рекомендація', ['заварювання', 'приготування', 'як готувати', 'метод приготування'], cleanBrewingText],
    ['productScaleAcidity', 'Кислотність', ['acidity'], value => String(clampTasteScore(value, 5))],
    ['productScaleSweetness', 'Солодкість', ['sweetness'], value => String(clampTasteScore(value, 6))],
    ['productScaleBody', 'Тіло', ['body'], value => String(clampTasteScore(value, 6))],
    ['productScaleAftertaste', 'Післясмак', ['aftertaste'], value => String(clampTasteScore(value, 6))],
    ['productScaleFruitiness', 'Фруктовість', ['фруктовисть', 'fruitiness'], value => String(clampTasteScore(value, 5))]
  ];
  let facts = before;
  for (const [id, label, aliases, normalize] of fields) {
    const node = $(`#${id}`);
    if (!node) continue;
    facts = updateProductFactLine(facts, label, normalize(node.value), aliases);
  }
  state.product.facts = facts;
  const factsNode = $('#productFacts');
  if (factsNode) factsNode.value = facts;
  return facts !== before;
}

function applyProductTopFacts() {
  syncProductFields();
  syncProductTopFields();
  const draft = productDraft();
  Object.assign(state.product, {
    title: state.product.title || draft.title,
    meta: draft.meta,
    h1: state.product.h1 || draft.h1,
    description: draft.description,
    attributes: draft.attributes,
    topFactsDirty: false,
    lastDryRunOk: false,
    lastResult: { ok: true, dryRun: true, status: 'local_preview', message: 'Preview оновлено з верхнього блоку. Запустіть Dry-run перед publish.', at: new Date().toISOString() }
  });
  render();
  toast('Preview і характеристики оновлено з верхнього блоку.');
}

async function importProductUrl() {
  syncProductFields();
  const p = state.product;
  const url = text(p.url);
  if (!url) {
    toast('Вставте URL товару для імпорту.');
    return;
  }
  p.importLoading = true;
  p.importNote = '';
  p.importError = '';
  setSync('Імпорт URL');
  render();
  try {
    const imported = await apiFetch('/import-url', {
      method: 'POST',
      body: JSON.stringify({ url, targetType: 'product' })
    });
    Object.assign(p, {
      url: imported.importedUrl || url,
      name: localizeCountryNamesUa(imported.productName || imported.existingH1 || p.name),
      facts: productFactsFromImport(imported, p.facts),
      importLoading: false,
      importNote: imported.importNote || 'Товар імпортовано з URL. Факти заповнені, чернетка оновлена.',
      importError: ''
    });
    const draft = productDraft();
    Object.assign(p, {
      title: draft.title,
      meta: draft.meta,
      h1: draft.h1,
      description: draft.description,
      attributes: draft.attributes,
      lastDryRunOk: false,
      lastResult: { ok: true, dryRun: true, status: 'imported_preview', message: 'URL імпортовано і preview згенеровано. Перед publish запустіть Dry-run.', at: new Date().toISOString() }
    });
    setSync('Синхронізовано', 'ok');
    render();
    toast('URL прочитано. Картку згенеровано з імпортованих фактів.');
  } catch (error) {
    p.importLoading = false;
    p.importError = error.message || String(error);
    setSync('Помилка', 'bad');
    render();
    toast(`Імпорт не виконано: ${p.importError}`);
  }
}

async function createCoupon() {
  const e = state.email;
  e.couponLoading = true;
  syncEmailFromDom();
  render();
  try {
    const result = await apiFetch('/email/create-coupon', {
      method: 'POST',
      body: JSON.stringify({
        prefix: 'MRC',
        discount: e.coupon.discount,
        type: e.coupon.type,
        days: e.coupon.days,
        campaignType: e.campaignType,
        segmentId: e.segmentId
      })
    });
    const code = result.code || result.couponCode || result.coupon?.code || '';
    e.coupon.code = code;
    if (code && !e.body.includes(code)) {
      e.body = applyCouponToBody(e.body || '[ПРОМОКОД]', e.coupon);
    }
    e.lastResult = code ? `Купон створено і вставлено: ${code}` : 'Купон створено, але сервер не повернув код.';
    toast(e.lastResult);
  } catch (error) {
    const code = `MRC${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    e.coupon.code = code;
    e.body = applyCouponToBody(e.body || '[ПРОМОКОД]', e.coupon);
    e.lastResult = `Сервер купона недоступний, показую тестовий код у preview: ${code}`;
    toast(e.lastResult);
  } finally {
    e.couponLoading = false;
    render();
  }
}

async function saveConnectorForm(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const connectorId = form?.dataset?.connectorForm || '';
  const values = {};
  Array.from(form.elements || []).forEach(element => {
    if (!element.name || element.tagName === 'BUTTON') return;
    const value = String(element.value || '').trim();
    if (value) values[element.name] = value;
  });
  if (!Object.keys(values).length) {
    toast('Заповніть хоча б одне поле. Порожні поля не стирають старі ключі.');
    return;
  }
  try {
    const result = await apiFetch('/api/connectors/credentials', {
      method: 'POST',
      body: JSON.stringify({ connectorId, values })
    });
    state.data.connectors = { ok: true, connectors: result.connectors || [] };
    const setup = await getJson('/api/setup-guide').catch(() => null);
    if (setup) state.data.setup = setup;
    toast(result.message || 'Ключі збережено.');
    render();
  } catch (error) {
    toast(`Не збережено: ${error.message}`);
  }
}

async function saveFirstOrderPopupConfig(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const value = name => String(form.elements[name]?.value || '').trim();
  const numeric = (name, fallback) => {
    const parsed = Number(value(name));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const commandApiKey = value('commandApiKey');
  if (commandApiKey) {
    try {
      window.localStorage.setItem('mercatoCommandApiKey', commandApiKey);
    } catch {}
  }
  const firstDiscount = numeric('firstDiscount', 10);
  const firstMinTotal = numeric('firstMinTotal', 600);
  const firstValidDays = numeric('firstValidDays', 3);
  const currentText = popupConfigData().config?.text || FALLBACK.popupConfig.config.text;
  const payload = {
    enabled: Boolean(form.elements.enabled?.checked),
    publicBaseUrl: value('publicBaseUrl'),
    cooldownDays: numeric('cooldownDays', 7),
    first: {
      prefix: 'F10',
      discount: firstDiscount,
      minTotal: firstMinTotal,
      validDays: firstValidDays
    },
    second: {
      prefix: 'F15',
      discount: numeric('secondDiscount', 15),
      minTotal: numeric('secondMinTotal', 800),
      validDays: numeric('secondValidDays', 23)
    },
    triggers: {
      timeMinSeconds: numeric('timeMinSeconds', 10),
      timeMaxSeconds: numeric('timeMaxSeconds', 15),
      scrollPercent: numeric('scrollPercent', 40),
      exitIntentDesktop: Boolean(form.elements.exitIntentDesktop?.checked)
    },
    text: {
      ...currentText,
      title: value('title') || currentText.title,
      subtitle: value('subtitle') || currentText.subtitle,
      consent: value('consent') || currentText.consent,
      successNote: `Знижка -${firstDiscount}% від ${firstMinTotal} грн, дійсний ${firstValidDays} дні`
    }
  };
  try {
    const result = await apiFetch('/api/first-order-popup/admin-config', {
      method: 'POST',
      body: JSON.stringify({ config: payload })
    });
    state.data.popupConfig = { ok: true, config: result.config, snippet: result.snippet || popupConfigData().snippet };
    toast(result.config?.enabled ? 'Попап увімкнено і налаштування збережено.' : 'Попап вимкнено, налаштування збережено.');
    render();
  } catch (error) {
    const hint = /API_KEY|X-API-Key|401|403/i.test(String(error.code || error.message || ''))
      ? ' Перевірте COMMAND_API_KEY у полі форми.'
      : '';
    toast(`Попап не збережено: ${error.message}.${hint}`);
  }
}

async function verifyConnector(button) {
  const endpoint = String(button?.dataset?.verifyEndpoint || '').trim();
  const connectorId = String(button?.dataset?.connectorVerify || '').trim();
  if (!endpoint) return;
  button.disabled = true;
  try {
    const result = await getJson(endpoint);
    toast(result.message || `${connectorId || 'API'} відповідає.`);
    const connectors = await getJson('/api/connectors/credentials').catch(() => null);
    if (connectors) state.data.connectors = connectors;
    render();
  } catch (error) {
    toast(`Перевірка не пройдена: ${error.message}`);
    button.disabled = false;
  }
}

async function refreshAdsPerformance() {
  setSync('Google Ads читається', 'warn');
  try {
    const result = await getJson('/api/connectors/google-ads/performance?limit=20');
    state.data.adsPerformance = result;
    setSync(result.ok ? 'Google Ads оновлено' : 'Ads без метрик', result.ok ? 'ok' : 'warn');
    toast(result.message || 'Google Ads performance оновлено.');
    render();
  } catch (error) {
    state.data.adsPerformance = { ok: false, error: error.message || String(error) };
    setSync('Google Ads не прочитано', 'bad');
    toast(`Ads performance не оновлено: ${error.message}`);
    render();
  }
}

async function refreshSeoCenter({ silent = false } = {}) {
  try {
    const data = await getJson(`/api/seo-center?siteId=${encodeURIComponent(state.seoCenter.siteId)}`);
    state.data.seoCenter = data;
    getJson('/api/connectors/google-ads/performance?limit=12')
      .then(result => {
        state.data.adsPerformance = result;
        if (state.route === 'seo' || state.route === 'connect' || state.route === 'ads') render();
      })
      .catch(error => {
        state.data.adsPerformance = { ok: false, error: error.message || String(error) };
        if (state.route === 'seo' || state.route === 'connect' || state.route === 'ads') render();
      });
    if (!state.seoCenter.target) state.seoCenter.target = data.profile?.url || '';
    render();
    if (!silent) {
      const google = data.google || {};
      const label = seoGoogleCoreReady(google)
        ? (seoGooglePerformanceReady(google) ? 'SEO Google data готовий' : 'GSC/GA4 готові · CWV key потрібен')
        : 'SEO Center оновлено частково';
      setSync(label, seoGoogleCoreReady(google) ? 'ok' : 'warn');
      toast('SEO Center оновлено.');
    }
    if (data.activeJob?.id) scheduleSeoPoll(data.activeJob.id);
    return data;
  } catch (error) {
    if (!silent) toast(`SEO Center не оновлено: ${error.message}`);
    return null;
  }
}

function selectSeoSite(siteId) {
  state.seoCenter.siteId = siteId || 'mercato';
  state.seoCenter.target = '';
  state.data.seoCenter = null;
  render();
  refreshSeoCenter({ silent: true });
}

async function runSeoAudit({ weekly = false } = {}) {
  const profile = seoCurrentProfile();
  const targetNode = $('#seoAuditTarget');
  const modeNode = $('#seoAuditMode');
  const target = weekly ? profile.url : String(targetNode?.value || state.seoCenter.target || profile.url || '').trim();
  const mode = weekly ? 'weekly' : String(modeNode?.value || state.seoCenter.mode || 'full');
  state.seoCenter.target = target;
  state.seoCenter.mode = mode === 'weekly' ? 'full' : mode;
  state.seoCenter.running = true;
  setSync('SEO-аудит запущено', 'warn');
  render();
  try {
    const result = await apiFetch(weekly ? '/api/seo-center/weekly' : '/api/seo-center/audits', {
      method: 'POST',
      body: JSON.stringify(weekly
        ? { siteId: profile.id }
        : { siteId: profile.id, mode, target })
    });
    state.seoCenter.pollingJobId = result.job?.id || '';
    toast(result.message || 'Read-only SEO-аудит запущено.');
    await refreshSeoCenter({ silent: true });
    if (state.seoCenter.pollingJobId) scheduleSeoPoll(state.seoCenter.pollingJobId);
  } catch (error) {
    state.seoCenter.running = false;
    setSync('SEO-аудит не запущено', 'bad');
    toast(`Не запущено: ${error.message}`);
    if (error.job?.id) scheduleSeoPoll(error.job.id);
    render();
  }
}

async function refreshSeoIntelligence() {
  setSync('Оновлюю правила Google/AI', 'warn');
  try {
    const result = await apiFetch('/api/seo-center/intelligence-refresh', {
      method: 'POST',
      body: JSON.stringify({ siteId: state.seoCenter.siteId, fetchDocs: true })
    });
    state.data.seoCenter = {
      ...seoCenterData(),
      intelligence: result.report
    };
    toast(result.message || 'Правила Google/AI оновлено.');
    setSync('Growth intelligence готовий', 'ok');
    render();
  } catch (error) {
    setSync('Growth intelligence не оновлено', 'bad');
    toast(`Правила не оновлено: ${error.message}`);
  }
}

async function runSeoControlScan() {
  setSync('SEO inventory читається', 'warn');
  try {
    const result = await apiFetch('/api/seo-center/control-scan', {
      method: 'POST',
      body: JSON.stringify({ siteId: state.seoCenter.siteId })
    });
    state.data.seoCenter = {
      ...seoCenterData(),
      controlPlan: result.plan,
      fixPreview: null,
      approvals: asArray(seoCenterData().approvals).filter(item => item.status === 'approved' ? false : true)
    };
    toast(result.message || 'Повний SEO inventory прочитано.');
    await refreshSeoCenter({ silent: true });
    setSync('SEO inventory готовий', 'ok');
  } catch (error) {
    setSync('SEO inventory не прочитано', 'bad');
    toast(`Control scan не виконано: ${error.message}`);
  }
}

async function buildSeoFixPreview(options = {}) {
  try {
    const missionId = String(options.missionId || '').trim();
    const actionId = String(options.actionId || '').trim();
    const actionIds = [
      ...(missionId ? seoMissionActionIds(seoCenterData().fixQueue || {}, missionId) : []),
      ...(actionId ? [actionId] : []),
      ...(Array.isArray(options.actionIds) ? options.actionIds : [])
    ].filter(Boolean);
    const limit = Number(options.limit || seoAgentBatchLimit());
    if (missionId && !actionIds.length) {
      const mission = seoMissionById(missionId);
      toast(`${mission?.label || 'Ця місія'}: зараз немає готових typed patches. Використайте agent draft або запустіть свіжий аудит.`);
      return;
    }
    const result = await apiFetch('/api/seo-center/fix-preview', {
      method: 'POST',
      body: JSON.stringify({
        siteId: state.seoCenter.siteId,
        actionIds,
        entityLimit: actionIds.length ? Math.min(actionIds.length, limit) : limit,
        limit
      })
    });
    state.data.seoCenter = {
      ...seoCenterData(),
      fixPreview: result.preview
    };
    toast(result.message || 'SEO preview підготовлено.');
    render();
    scrollToAppElement('seoFixPreview');
  } catch (error) {
    toast(`SEO preview не створено: ${error.message}`);
  }
}

async function draftSeoAgentPatch(button) {
  const actionId = String(button?.dataset?.seoAgentDraft || '').trim();
  if (!actionId) return;
  button.disabled = true;
  setSync('SEO агент читає джерело', 'warn');
  try {
    const result = await apiFetch('/api/seo-center/agent-draft', {
      method: 'POST',
      body: JSON.stringify({
        siteId: state.seoCenter.siteId,
        actionId
      })
    });
    state.data.seoCenter = {
      ...seoCenterData(),
      fixPreview: result.preview
    };
    toast(result.message || 'Агент підготував patch.');
    setSync('SEO patch готовий до перевірки', 'ok');
    render();
    scrollToAppElement('seoFixPreview');
  } catch (error) {
    setSync('SEO agent draft не готовий', 'bad');
    toast(`Агент не підготував patch: ${error.message}`);
    button.disabled = false;
  }
}

async function draftSeoAgentBatch(button) {
  const limit = Number(button?.dataset?.seoAgentDraftLimit || seoAgentBatchLimit());
  seoSetAgentBatchLimit(limit);
  const currentPreview = seoCenterData().fixPreview;
  if (currentPreview?.status === 'pending_approval') {
    const accepted = window.confirm(
      `Зараз є preview на ${number(currentPreview.actionCount || currentPreview.changes?.length || 1)} змін.\n\nЗамінити його на більший agent batch до ${number(limit)} змін? Live-сайт не зміниться.`
    );
    if (!accepted) return;
  }
  button.disabled = true;
  setSync('SEO агенти готують batch', 'warn');
  try {
    const result = await apiFetch('/api/seo-center/agent-draft-batch', {
      method: 'POST',
      body: JSON.stringify({
        siteId: state.seoCenter.siteId,
        limit,
        replaceActive: true
      })
    });
    state.data.seoCenter = {
      ...seoCenterData(),
      fixPreview: result.preview
    };
    state.seoCenter.lastAgentBatchError = null;
    const skipped = asArray(result.skipped).length;
    toast(result.message || `Агенти підготували batch.${skipped ? ` Пропущено: ${skipped}.` : ''}`);
    setSync('SEO batch готовий до перевірки', 'ok');
    render();
    scrollToAppElement('seoFixPreview');
  } catch (error) {
    setSync('SEO agent batch не готовий', 'bad');
    state.seoCenter.lastAgentBatchError = {
      message: error.message,
      skipped: asArray(error.skipped),
      blockedInternalLinks: asArray(error.blockedInternalLinks),
      diagnostics: error.diagnostics || {},
      at: new Date().toISOString()
    };
    toast(`Agent batch не створено: ${error.message}`);
    render();
    scrollToAppElement('seoAgentBatchError');
    button.disabled = false;
  }
}

async function approveSeoFixes() {
  const preview = seoCenterData().fixPreview;
  if (!preview?.id) return;
  const accepted = window.confirm(
    `Погодити ${preview.actionCount || 0} SEO-змін для ${preview.entityCount || preview.actionCount || 0} сторінок/файлів?\n\nЗапис ще не відбудеться. Після погодження буде окрема кнопка внесення й readback.`
  );
  if (!accepted) return;
  try {
    const result = await apiFetch('/api/seo-center/approve', {
      method: 'POST',
      body: JSON.stringify({
        previewId: preview.id,
        confirmPhrase: 'APPLY_SEO_CHANGES',
        confirmedBy: 'owner-ui'
      })
    });
    state.data.seoCenter = {
      ...seoCenterData(),
      fixPreview: { ...preview, status: 'approved', approvalId: result.approval?.id },
      approvals: [result.approval, ...asArray(seoCenterData().approvals).filter(item => item.id !== result.approval?.id)]
    };
    toast(result.message || 'SEO-зміни погоджено.');
    render();
  } catch (error) {
    toast(`SEO-зміни не погоджено: ${error.message}`);
  }
}

async function rejectSeoFixPreview() {
  const preview = seoCenterData().fixPreview;
  if (!preview?.id) return;
  const accepted = window.confirm(
    'Відхилити цей SEO preview?\n\nLive-запис не виконувався. Система прибере його з активного потоку, і можна буде підготувати іншу, бізнес-кориснішу зміну.'
  );
  if (!accepted) return;
  try {
    const result = await apiFetch('/api/seo-center/reject-preview', {
      method: 'POST',
      body: JSON.stringify({
        previewId: preview.id,
        rejectedBy: 'owner-ui',
        reason: 'Не відповідає бізнес-пріоритету: трафік, конверсії, продажі.'
      })
    });
    state.data.seoCenter = {
      ...seoCenterData(),
      fixPreview: null,
      approvals: asArray(seoCenterData().approvals).filter(item => item.previewId !== preview.id)
    };
    toast(result.message || 'SEO preview відхилено.');
    await refreshSeoCenter({ silent: true });
  } catch (error) {
    toast(`SEO preview не відхилено: ${error.message}`);
  }
}

async function removeSelectedSeoPreviewChanges() {
  const preview = seoCenterData().fixPreview;
  if (!preview?.id || preview.status !== 'pending_approval') return;
  const checked = Array.from(document.querySelectorAll('[data-seo-preview-change]:checked'));
  const changeKeys = checked.map(input => input.dataset.seoPreviewChange).filter(Boolean);
  if (!changeKeys.length) {
    toast('Вибери одну або кілька SEO-змін, які треба прибрати з batch.');
    return;
  }
  const accepted = window.confirm(
    `Вилучити ${number(changeKeys.length)} вибраних SEO-змін із preview?\n\nLive-сайт не зміниться. Після цього можна погодити тільки ті зміни, які залишаться.`
  );
  if (!accepted) return;
  try {
    const result = await apiFetch('/api/seo-center/preview-remove-changes', {
      method: 'POST',
      body: JSON.stringify({
        previewId: preview.id,
        changeKeys,
        removedBy: 'owner-ui'
      })
    });
    state.data.seoCenter = {
      ...seoCenterData(),
      fixPreview: result.preview?.status === 'rejected' ? null : result.preview
    };
    toast(result.message || `Вилучено ${number(result.removedCount || changeKeys.length)} SEO-змін.`);
    render();
  } catch (error) {
    toast(`Не вдалося вилучити SEO-зміни: ${error.message}`);
  }
}

async function applySeoFixes() {
  const approval = asArray(seoCenterData().approvals).find(item => item.status === 'approved');
  if (!approval?.id) return;
  const accepted = window.confirm(
    `Внести погоджені SEO-зміни в OpenCart?\n\nСистема згрупує поля кожної сторінки в один patch, виконає по ${seoCenterData().safety?.executionChunkSize || 5} сторінок паралельно, зробить backup/readback і зупиниться при повторній системній помилці.`
  );
  if (!accepted) return;
  try {
    const result = await apiFetch('/api/seo-center/apply', {
      method: 'POST',
      body: JSON.stringify({
        approvalId: approval.id,
        confirmPhrase: 'APPLY_SEO_CHANGES'
      })
    });
    toast(result.message || 'SEO-зміни внесено й перевірено.');
    await refreshSeoCenter({ silent: true });
    if (result.reAuditJob?.id) scheduleSeoPoll(result.reAuditJob.id);
  } catch (error) {
    toast(`SEO-зміни не внесено: ${error.message}`);
    await refreshSeoCenter({ silent: true });
  }
}

async function rollbackSeoChange(button) {
  const changeId = String(button?.dataset?.seoRollback || '').trim();
  const writeRunId = String(button?.dataset?.seoWriteRun || '').trim();
  if (!changeId) return;
  const accepted = window.confirm(
    `Відкотити SEO change ${changeId}?\n\nСистема відновить точний backup, перевірить readback і залишить запис у журналі.`
  );
  if (!accepted) return;
  try {
    const result = await apiFetch('/api/seo-center/rollback', {
      method: 'POST',
      body: JSON.stringify({
        siteId: state.seoCenter.siteId,
        writeRunId,
        changeId,
        confirmPhrase: 'ROLLBACK_SEO_CHANGE'
      })
    });
    toast(result.message || 'SEO-зміну відкотили.');
    await refreshSeoCenter({ silent: true });
  } catch (error) {
    toast(`Rollback не виконано: ${error.message}`);
  }
}

function scheduleSeoPoll(jobId) {
  if (!jobId) return;
  state.seoCenter.pollingJobId = jobId;
  clearTimeout(seoPollTimer);
  seoPollTimer = setTimeout(() => pollSeoJob(jobId), 2500);
}

async function pollSeoJob(jobId) {
  try {
    const result = await getJson(`/api/seo-center/jobs/${encodeURIComponent(jobId)}`);
    const job = result.job;
    if (!job) return;
    const data = seoCenterData();
    state.data.seoCenter = {
      ...data,
      activeJob: job.status === 'running' ? job : null,
      jobs: [job, ...asArray(data.jobs).filter(item => item.id !== job.id)].slice(0, 12),
      latest: job.status === 'completed' ? job : data.latest
    };
    state.seoCenter.running = job.status === 'running';
    render();
    if (job.status === 'running') {
      setSync('SEO-аудит виконується', 'warn');
      scheduleSeoPoll(jobId);
    } else {
      state.seoCenter.pollingJobId = '';
      setSync(job.status === 'completed' ? 'SEO-аудит готовий' : 'SEO-аудит з помилкою', job.status === 'completed' ? 'ok' : 'bad');
      toast(job.status === 'completed'
        ? `SEO-аудит готовий: ${job.summary?.score || 0}/100.`
        : `SEO-аудит завершився з помилкою: ${job.error || 'невідома помилка'}`);
      await refreshSeoCenter({ silent: true });
    }
  } catch (error) {
    setSync('Не вдалося перевірити аудит', 'warn');
    scheduleSeoPoll(jobId);
  }
}

async function refreshMerchantFeed({ silent = false } = {}) {
  try {
    const data = await getJson('/api/merchant-feed');
    state.data.merchant = data;
    state.merchant.running = Boolean(data.activeJob);
    if (!silent) toast('Merchant Feed оновлено.');
    render();
    if (data.activeJob?.id) scheduleMerchantPoll(data.activeJob.id);
    return data;
  } catch (error) {
    if (!silent) toast(`Merchant Feed не оновлено: ${error.message}`);
    return null;
  }
}

async function runMerchantScan() {
  state.merchant.running = true;
  setSync('Merchant scan запущено', 'warn');
  render();
  try {
    const result = await apiFetch('/api/merchant-feed/scan', {
      method: 'POST',
      body: JSON.stringify({ mode: 'read-only' })
    });
    state.merchant.pollingJobId = result.job?.id || '';
    toast(result.message || 'Merchant scan запущено.');
    await refreshMerchantFeed({ silent: true });
    if (state.merchant.pollingJobId) scheduleMerchantPoll(state.merchant.pollingJobId);
  } catch (error) {
    state.merchant.running = false;
    setSync('Merchant scan не запущено', 'bad');
    toast(`Merchant scan не запущено: ${error.message}`);
    if (error.job?.id) scheduleMerchantPoll(error.job.id);
    render();
  }
}

async function buildMerchantPlan() {
  try {
    const result = await apiFetch('/api/merchant-feed/fix-plan', {
      method: 'POST',
      body: JSON.stringify({ mode: 'dry-run' })
    });
    state.data.merchant = {
      ...merchantData(),
      fixPlan: result.plan
    };
    toast(result.message || 'Dry-run план створено.');
    render();
  } catch (error) {
    toast(`План не створено: ${error.message}`);
  }
}

async function buildMerchantTestBatch() {
  try {
    const result = await apiFetch('/api/merchant-feed/test-batch', {
      method: 'POST',
      body: JSON.stringify({ mode: 'dry-run', limit: 5 })
    });
    state.data.merchant = {
      ...merchantData(),
      testBatch: result.batch
    };
    toast(result.message || 'Перший dry-run batch підготовлено.');
    render();
  } catch (error) {
    toast(`Batch не створено: ${error.message}`);
  }
}

async function buildMerchantWritePreview() {
  try {
    const result = await apiFetch('/api/merchant-feed/write-preview', {
      method: 'POST',
      body: JSON.stringify({ limit: 5 })
    });
    state.data.merchant = {
      ...merchantData(),
      writePreview: result.preview
    };
    toast(result.message || 'Preview змін підготовлено.');
    render();
  } catch (error) {
    const message = String(error.message || '');
    if (/немає безпечних детермінованих змін|Неоднозначні поля/iu.test(message)) {
      toast('Автозмін немає. Наступний крок — Google datafeed audit і ручні Merchant descriptions.');
    } else {
      toast(`Preview не створено: ${message}`);
    }
  }
}

async function refreshMerchantGoogleDiagnostics() {
  setSync('Читаю Google Merchant diagnostics', 'warn');
  try {
    const result = await getJson('/api/merchant-feed/google-diagnostics?limit=80');
    state.data.merchant = {
      ...merchantData(),
      googleDiagnostics: result
    };
    if (result.ok === false) {
      setSync('Google Merchant diagnostics не прочитано', 'bad');
      toast(`Google diagnostics не прочитано: ${result.error || 'потрібно перепідключити Google OAuth'}`);
    } else {
      setSync('Google Merchant diagnostics оновлено', 'ok');
      toast(`Google diagnostics оновлено: ${number(result.summary?.productsRead || 0)} product statuses.`);
    }
    render();
  } catch (error) {
    state.data.merchant = {
      ...merchantData(),
      googleDiagnostics: {
        ok: false,
        generatedAt: new Date().toISOString(),
        readOnly: true,
        publishAllowed: false,
        error: error.message,
        reconnectRequired: /expired|revoked|invalid_grant|oauth/i.test(error.message),
        summary: {},
        errors: { oauth: error.message }
      }
    };
    setSync('Google Merchant diagnostics не прочитано', 'bad');
    toast(`Google diagnostics не прочитано: ${error.message}`);
    render();
  }
}

async function approveMerchantChanges() {
  const preview = merchantData().writePreview;
  if (!preview?.id) return;
  const accepted = window.confirm(
    `Погодити ${preview.changeCount || 0} змін для ${preview.productCount || 0} товарів?\n\nЗапис ще не відбудеться. Після погодження буде окрема кнопка внесення.`
  );
  if (!accepted) return;
  try {
    const result = await apiFetch('/api/merchant-feed/approve', {
      method: 'POST',
      body: JSON.stringify({
        previewId: preview.id,
        confirmPhrase: 'APPLY_MERCHANT_CHANGES',
        confirmedBy: 'owner-ui'
      })
    });
    state.data.merchant = {
      ...merchantData(),
      writePreview: { ...preview, status: 'approved', approvalId: result.approval?.id },
      approvals: [result.approval, ...asArray(merchantData().approvals).filter(item => item.id !== result.approval?.id)]
    };
    toast(result.message || 'Зміни погоджено.');
    render();
  } catch (error) {
    toast(`Не погоджено: ${error.message}`);
  }
}

async function applyMerchantChanges() {
  const approval = asArray(merchantData().approvals).find(item => item.status === 'approved');
  if (!approval?.id) return;
  const accepted = window.confirm(
    `Внести погоджені зміни для ${approval.productCount || 0} товарів?\n\nБренд буде записано в OpenCart, feed overrides — локально. Merchant Center publish не виконується.`
  );
  if (!accepted) return;
  try {
    const result = await apiFetch('/api/merchant-feed/apply', {
      method: 'POST',
      body: JSON.stringify({
        approvalId: approval.id,
        confirmPhrase: 'APPLY_MERCHANT_CHANGES'
      })
    });
    toast(result.message || 'Погоджені зміни оброблено. Після scan зʼявиться наступний batch.');
    await refreshMerchantFeed({ silent: true });
    if (result.scanJob?.id) scheduleMerchantPoll(result.scanJob.id);
  } catch (error) {
    toast(`Зміни не внесено: ${error.message}`);
  }
}

function scheduleMerchantPoll(jobId) {
  if (!jobId) return;
  state.merchant.pollingJobId = jobId;
  clearTimeout(merchantPollTimer);
  merchantPollTimer = setTimeout(() => pollMerchantJob(jobId), 2000);
}

async function pollMerchantJob(jobId) {
  try {
    const result = await getJson(`/api/merchant-feed/jobs/${encodeURIComponent(jobId)}`);
    const job = result.job;
    if (!job) return;
    state.data.merchant = {
      ...merchantData(),
      activeJob: job.status === 'running' ? job : null,
      jobs: [job, ...asArray(merchantData().jobs).filter(item => item.id !== job.id)].slice(0, 20)
    };
    state.merchant.running = job.status === 'running';
    render();
    if (job.status === 'running') {
      setSync('Merchant scan виконується', 'warn');
      scheduleMerchantPoll(jobId);
      return;
    }
    state.merchant.pollingJobId = '';
    setSync(job.status === 'completed' ? 'Merchant scan готовий' : 'Merchant scan з помилкою', job.status === 'completed' ? 'ok' : 'bad');
    toast(job.status === 'completed'
      ? `Merchant scan готовий: ${number(job.productCount || 0)} товарів.`
      : `Merchant scan завершився з помилкою: ${job.error || 'невідома помилка'}`);
    await refreshMerchantFeed({ silent: true });
  } catch {
    setSync('Перевіряю Merchant scan', 'warn');
    scheduleMerchantPoll(jobId);
  }
}

function syncEmailFromDom() {
  const fields = {
    emailSegment: ['segmentId'],
    campaignType: ['campaignType'],
    emailOffer: ['offer'],
    emailUrl: ['url'],
    emailSubject: ['subject'],
    emailPreheader: ['preheader'],
    emailBody: ['body'],
    emailCta: ['cta'],
    emailCtaUrl: ['url'],
    couponDiscount: ['coupon', 'discount'],
    couponType: ['coupon', 'type'],
    couponDays: ['coupon', 'days']
  };
  Object.entries(fields).forEach(([id, path]) => {
    const node = $(`#${id}`);
    if (!node) return;
    if (path.length === 1) state.email[path[0]] = node.value;
    else state.email[path[0]][path[1]] = node.type === 'number' ? Number(node.value || 0) : node.value;
  });
  const enabled = $('#couponEnabled');
  if (enabled) state.email.coupon.enabled = enabled.checked;
}

async function sendEmail(mode) {
  syncEmailFromDom();
  const e = state.email;
  const body = applyCouponToBody(e.body, e.coupon);
  const draft = {
    name: e.offer || e.campaignType || 'segment email',
    subject: e.subject,
    preheader: e.preheader,
    body,
    cta: e.cta,
    ctaLabel: e.cta,
    ctaUrl: e.url,
    productUrl: e.url,
    segmentId: e.segmentId,
    campaignType: e.campaignType,
    couponCode: e.coupon.enabled ? e.coupon.code : '',
    couponSettings: e.coupon.enabled ? {
      discount: e.coupon.discount,
      type: e.coupon.type,
      days: e.coupon.days
    } : null
  };
  const payload = {
    subject: e.subject,
    preheader: e.preheader,
    body,
    cta: e.cta,
    url: e.url,
    couponCode: e.coupon.enabled ? e.coupon.code : '',
    segmentId: e.segmentId,
    campaignType: e.campaignType,
    draft
  };
  const endpoint = mode === 'test' ? '/email/send-test' : mode === 'one' ? '/email/send-one' : '/email/send-segment';
  if (mode === 'test') payload.to = $('#testEmail')?.value || '';
  if (mode === 'one') payload.customerId = $('#singleCustomer')?.value || '';
  if (mode === 'segment') {
    const segment = selectedEmailSegment();
    const recipients = selectedSegmentRecipients();
    if (!recipients.length) {
      e.lastResult = 'Оберіть хоча б одного одержувача в сегменті.';
      toast(e.lastResult);
      render();
      return;
    }
    payload.confirmPhrase = 'SEND_MERCATO_SEGMENT';
    payload.segment = {
      ...(segment || {}),
      id: emailSegmentId(segment) || e.segmentId,
      title: segment?.title || segment?.name || segmentLabel(e.segmentId, customersData()),
      recipients: recipients.map(emailRecipientPayload),
      selectedCount: recipients.length
    };
    payload.recipientIds = recipients.map(recipientId).filter(Boolean);
    payload.excludedRecipientIds = asArray(e.excludedRecipientIds);
    payload.limit = recipients.length;
  }
  try {
    const result = await apiFetch(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    e.lastResult = result.message || result.messageId || result.trackingId || 'Відправку прийнято сервером.';
    toast(e.lastResult);
  } catch (error) {
    e.lastResult = `Відправку не виконано: ${error.message}`;
    toast(e.lastResult);
  } finally {
    render();
  }
}

async function publishProduct(dryRun) {
  syncProductFields();
  syncProductTopFields();
  const p = state.product;
  if (p.topFactsDirty) {
    const draft = productDraft();
    p.description = draft.description;
    p.attributes = draft.attributes;
    p.meta = p.meta || draft.meta;
    p.h1 = p.h1 || draft.h1;
    p.title = p.title || draft.title;
    p.topFactsDirty = false;
  }
  const generated = productDraft();
  const feedReport = merchantFeedChecksForProduct(p, generated, state.productMode);
  if (state.productMode === 'existing' && !text(p.url)) {
    p.lastResult = { ok: false, dryRun, status: 'blocked', message: 'Для оновлення існуючого товару потрібен URL товару.', at: new Date().toISOString() };
    p.lastDryRunOk = false;
    render();
    toast('Вставте URL існуючого товару.');
    return;
  }
  if (!dryRun && !p.lastDryRunOk) {
    p.lastResult = { ok: false, dryRun, status: 'blocked', message: 'Спочатку запустіть успішний Dry-run після останніх змін.', at: new Date().toISOString() };
    render();
    toast('Publish зупинено: потрібен dry-run.');
    return;
  }
  const payload = {
    dryRun,
    type: 'product',
    mode: state.productMode,
    url: p.url,
    productName: p.name,
    title: p.title || generated.title,
    metaDescription: p.meta || generated.meta,
    h1: p.h1 || generated.h1,
    content: p.description || generated.description,
    attributes: parseAttributes(p.attributes || generated.attributes)
  };
  if (!dryRun && feedReport.blockers.length) {
    p.lastResult = {
      ok: false,
      dryRun,
      status: 'blocked',
      message: `Publish зупинено: виправте ${feedReport.blockers.map(item => item.label).join(', ')} для Google Merchant.`,
      at: new Date().toISOString()
    };
    render();
    toast(`Publish зупинено: виправте ${feedReport.blockers.map(item => item.label).join(', ')} для Google Merchant.`);
    return;
  }
  p.publishLoading = true;
  p.lastResult = { ok: false, dryRun, status: 'pending', message: dryRun ? 'Dry-run виконується…' : 'Publish виконується…', at: new Date().toISOString() };
  render();
  try {
    const result = await apiFetch('/opencart/publish-content', { method: 'POST', body: JSON.stringify(payload) });
    p.lastDryRunOk = dryRun ? true : false;
    p.lastResult = {
      ok: true,
      dryRun,
      status: dryRun ? 'dry_run_ok' : 'published',
      message: result.message || (dryRun ? 'Dry-run товару готовий.' : 'Publish товару відправлено.'),
      at: new Date().toISOString(),
      id: result.id || result.product_id || '',
      url: result.url || payload.url || '',
      verification: result.verification || null
    };
    toast(p.lastResult.message);
  } catch (error) {
    if (dryRun) p.lastDryRunOk = false;
    p.lastResult = {
      ok: false,
      dryRun,
      status: 'failed',
      message: error.message || String(error),
      at: new Date().toISOString()
    };
    toast(`${dryRun ? 'Dry-run' : 'Publish'} не виконано: ${error.message}`);
  } finally {
    p.publishLoading = false;
    render();
  }
}

async function publishSeo(dryRun) {
  const item = selectedSeoItem();
  if (!item) return;
  const payload = {
    dryRun,
    type: item.type || 'page',
    mode: 'existing',
    url: item.url || item.target?.url || '',
    productName: item.name || item.title || '',
    title: $('#seoTitle')?.value || '',
    metaDescription: $('#seoMeta')?.value || '',
    h1: $('#seoH1')?.value || '',
    content: $('#seoContent')?.value || '',
    attributes: {}
  };
  try {
    await apiFetch('/opencart/publish-content', { method: 'POST', body: JSON.stringify(payload) });
    toast(dryRun ? 'SEO dry-run готовий.' : 'SEO publish відправлено.');
  } catch (error) {
    toast(`${dryRun ? 'Dry-run' : 'Publish'} не виконано: ${error.message}`);
  }
}

function parseAttributes(value) {
  return String(value || '').split(/\n+/).reduce((acc, line) => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) acc[key.trim()] = rest.join(':').trim();
    return acc;
  }, {});
}

function boot() {
  $('#refreshButton')?.addEventListener('click', () => loadApp({ refresh: true }));
  window.addEventListener('hashchange', () => {
    const next = initialRoute();
    if (next !== state.route) {
      state.route = next;
      render();
    }
  });
  render();
  loadApp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

export { VERSION, state, render, loadApp, productDraft, subjectIdeas };
