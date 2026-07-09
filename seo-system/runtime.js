const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const nodeFetch = require('node-fetch');

const SITE_PROFILES = {
  mercato: {
    id: 'mercato',
    name: 'Mercato',
    url: 'https://mercato.com.ua',
    host: 'mercato.com.ua',
    businessType: 'ecommerce',
    goal: 'Органічні продажі, видимість категорій і товарів, Merchant Center та конверсія.',
    focus: [
      'категорії кави',
      'товарні сторінки',
      'Product / Offer / Review schema',
      'Google Merchant readiness',
      'мобільна швидкість',
      'індексація та внутрішні посилання'
    ],
    priorities: {
      critical: [
        'Додати GOOGLE_API_KEY для PageSpeed/CrUX і перевірити Core Web Vitals реальними Google-даними.',
        'Підготувати staging-оновлення застарілого PHP без експериментів на live.',
        'Перевірити LCP/INP/CLS головної, категорій і товарів, які вже мають покази/кліки в GSC.'
      ],
      important: [
        'Виправити H1 і базову schema головної.',
        'Працювати з title/meta за GSC impressions, CTR і revenue, а не масово.',
        'Перевіряти price, availability, identifiers, shipping і returns у Product/Offer та feed.'
      ],
      later: [
        'Додати llms.txt після технічної основи.',
        'Підключити DataForSEO/Ahrefs лише коли безкоштовних Google-даних недостатньо.',
        'Розвивати GEO та AI citation blocks без масового AI-контенту.'
      ]
    },
    weeklyChecks: [
      { id: 'full', label: 'Повний read-only аудит', mode: 'full', target: 'https://mercato.com.ua' },
      { id: 'category', label: 'Категорія кави', mode: 'page', target: 'https://mercato.com.ua/kava-v-zernah' },
      { id: 'product', label: 'Контрольний товар', mode: 'page', target: 'https://mercato.com.ua/kava-v-zernah/kava-gvatemala-huehuetenango' },
      { id: 'schema', label: 'Product schema', mode: 'schema', target: 'https://mercato.com.ua/kava-v-zernah/kava-gvatemala-huehuetenango' },
      { id: 'performance', label: 'Мобільна швидкість', mode: 'performance', target: 'https://mercato.com.ua/kava-v-zernah' }
    ]
  },
  prom3d: {
    id: 'prom3d',
    name: 'Prom3D',
    url: 'https://prom3d.com.ua',
    host: 'prom3d.com.ua',
    businessType: 'local_b2b',
    goal: 'Якісні B2B-заявки на промисловий великогабаритний 3D-друк.',
    focus: [
      'сторінки послуг',
      'технічні кейси',
      'локальний попит',
      'Service / LocalBusiness schema',
      'заявки, файли, телефон і Telegram',
      'швидкість та довіра'
    ],
    priorities: {
      critical: [
        'Підключити GSC, GA4 і conversion events для заявок, файлів, телефону та Telegram.',
        'Підготувати безпечне оновлення PHP через staging.',
        'Виправити CLS і зарезервувати місце для зображень.'
      ],
      important: [
        'Побудувати структуру послуга → галузь → кейс → розрахунок.',
        'Додати Organization, WebSite, WebPage і Service schema.',
        'Вимірювати qualified leads, а не лише трафік.'
      ],
      later: [
        'Додати llms.txt та GEO-процес.',
        'Розвивати YouTube-кейси й зовнішні згадки.',
        'Підключити платні SERP/backlink API лише за потреби.'
      ]
    },
    weeklyChecks: [
      { id: 'full', label: 'Повний read-only аудит', mode: 'full', target: 'https://prom3d.com.ua' },
      { id: 'technical', label: 'Технічна готовність', mode: 'technical', target: 'https://prom3d.com.ua' },
      { id: 'performance', label: 'Швидкість і CLS', mode: 'performance', target: 'https://prom3d.com.ua' },
      { id: 'schema', label: 'Business / Service schema', mode: 'schema', target: 'https://prom3d.com.ua' },
      { id: 'geo', label: 'AI Search / GEO', mode: 'geo', target: 'https://prom3d.com.ua' }
    ]
  }
};

const AUDIT_MODES = {
  full: { id: 'full', label: 'Повний аудит', runner: 'audit', skill: '' },
  weekly: { id: 'weekly', label: 'Щотижневий аудит', runner: 'audit', skill: '' },
  page: { id: 'page', label: 'Сторінка', runner: 'skill', skill: 'seo-page' },
  ecommerce: { id: 'ecommerce', label: 'E-commerce / товар', runner: 'skill', skill: 'seo-page' },
  technical: { id: 'technical', label: 'Technical SEO', runner: 'skill', skill: 'seo-technical' },
  schema: { id: 'schema', label: 'Schema.org', runner: 'skill', skill: 'seo-schema' },
  performance: { id: 'performance', label: 'Швидкість / CWV', runner: 'skill', skill: 'seo-performance' },
  content: { id: 'content', label: 'Контент / E-E-A-T', runner: 'skill', skill: 'seo-content' },
  geo: { id: 'geo', label: 'AI Search / GEO', runner: 'skill', skill: 'seo-geo' },
  sitemap: { id: 'sitemap', label: 'Sitemap / індексація', runner: 'skill', skill: 'seo-sitemap' },
  images: { id: 'images', label: 'Зображення', runner: 'skill', skill: 'seo-images' }
};

const SEO_BATCH_LIMITS = {
  defaultEntities: 25,
  maxEntities: 50,
  maxChanges: 100,
  executionChunkSize: 5
};

const OFFICIAL_SEO_SOURCES = [
  {
    id: 'google_search_essentials',
    owner: 'Google Search Central',
    title: 'Google Search Essentials',
    url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content',
    cadence: 'weekly',
    conversionRelevance: 'Базовий guardrail: сторінка має бути корисною покупцю, доступною для Google і не бути масовим SEO-сміттям.',
    watchTerms: ['helpful', 'reliable', 'people-first', 'crawlable', 'index', 'spam', 'site reputation']
  },
  {
    id: 'google_seo_starter',
    owner: 'Google Search Central',
    title: 'SEO Starter Guide',
    url: 'https://developers.google.com/search/docs/fundamentals/seo-starter-guide',
    cadence: 'monthly',
    conversionRelevance: 'Пояснює, як Google бачить titles, snippets, headings, internal links, images і site structure — це основа для on-page агентів.',
    watchTerms: ['title links', 'snippets', 'heading', 'links', 'images', 'site structure', 'descriptive']
  },
  {
    id: 'google_ecommerce_url_structure',
    owner: 'Google Search Central',
    title: 'Designing a URL structure for ecommerce sites',
    url: 'https://developers.google.com/search/docs/specialty/ecommerce/designing-a-url-structure-for-ecommerce-sites',
    cadence: 'monthly',
    conversionRelevance: 'Для Mercato це категорії кави, товарні URL, варіанти/фасування, canonical і уникнення індексного шуму.',
    watchTerms: ['ecommerce', 'URL structure', 'variants', 'canonical', 'faceted navigation', 'product']
  },
  {
    id: 'google_ai_search',
    owner: 'Google Search Central',
    title: 'Generative AI features in Google Search',
    url: 'https://developers.google.com/search/docs/fundamentals/ai-optimization-guide',
    cadence: 'weekly',
    conversionRelevance: 'Google AI Overviews / AI Mode можуть приводити покупців, але тільки якщо сторінки індексуються, корисні й технічно доступні.',
    watchTerms: ['generative AI', 'AI Overviews', 'AI Mode', 'Merchant Center', 'crawlable', 'indexed', 'LLMS.txt']
  },
  {
    id: 'google_helpful_content',
    owner: 'Google Search Central',
    title: 'Helpful, reliable, people-first content',
    url: 'https://developers.google.com/search/docs/fundamentals/creating-helpful-content',
    cadence: 'weekly',
    conversionRelevance: 'Захищає від SEO-сміття: тексти мають допомагати покупцю вибрати каву, а не просто збільшувати кількість сторінок.',
    watchTerms: ['people-first', 'E-E-A-T', 'trust', 'mass-produced', 'automation', 'content quality']
  },
  {
    id: 'google_ai_content',
    owner: 'Google Search Central',
    title: 'Using generative AI content on your website',
    url: 'https://developers.google.com/search/docs/fundamentals/using-gen-ai-content',
    cadence: 'weekly',
    conversionRelevance: 'Дозволяє AI-assisted content, але блокує масштабну генерацію без доданої цінності та вимагає точності metadata/schema/alt.',
    watchTerms: ['AI-generated', 'scaled content abuse', 'accuracy', 'quality', 'structured data', 'alt text']
  },
  {
    id: 'google_merchant_spec',
    owner: 'Google Merchant Center',
    title: 'Product data specification',
    url: 'https://support.google.com/merchants/answer/7052112',
    cadence: 'weekly',
    conversionRelevance: 'Прямо впливає на Shopping/free listings: title, description, link, image_link, price, availability, brand, gtin/mpn, item_group_id.',
    watchTerms: ['brand', 'gtin', 'mpn', 'item_group_id', 'availability', 'price', 'image_link', 'description']
  },
  {
    id: 'google_product_schema',
    owner: 'Google Search Central',
    title: 'Product structured data',
    url: 'https://developers.google.com/search/docs/appearance/structured-data/product',
    cadence: 'weekly',
    conversionRelevance: 'Product/Offer schema має збігатися з видимою ціною, наявністю та фідом; Review/AggregateRating не можна вигадувати.',
    watchTerms: ['Product', 'Offer', 'Review', 'AggregateRating', 'price', 'availability', 'rich result']
  },
  {
    id: 'google_site_testing',
    owner: 'Google Search Central',
    title: 'Website testing and Google Search',
    url: 'https://developers.google.com/search/docs/crawling-indexing/website-testing',
    cadence: 'monthly',
    conversionRelevance: 'Дозволяє SEO/CRO експерименти без хаосу: мінімальні зміни, контроль часу, не cloaking, потім рішення за даними.',
    watchTerms: ['A/B testing', 'cloaking', '302', 'rel=canonical', 'experiment', 'test']
  },
  {
    id: 'google_merchant_listing_schema',
    owner: 'Google Search Central',
    title: 'Merchant listing structured data',
    url: 'https://developers.google.com/search/docs/appearance/structured-data/merchant-listing',
    cadence: 'weekly',
    conversionRelevance: 'Підсилює товарні результати, якщо schema, feed і сторінка не конфліктують.',
    watchTerms: ['merchant listing', 'shipping', 'return policy', 'price', 'availability', 'offers']
  },
  {
    id: 'openai_crawlers',
    owner: 'OpenAI',
    title: 'Overview of OpenAI Crawlers',
    url: 'https://developers.openai.com/api/docs/bots',
    cadence: 'weekly',
    conversionRelevance: 'Для появи в ChatGPT Search важливий OAI-SearchBot; GPTBot окремо стосується training crawl.',
    watchTerms: ['OAI-SearchBot', 'GPTBot', 'ChatGPT-User', 'robots.txt', 'search results']
  }
];

const SEO_GROWTH_AGENTS = [
  {
    id: 'policy_watcher',
    name: 'Policy Watcher Agent',
    readAccess: true,
    writeAccess: 'read_only',
    responsibility: 'Стежить за офіційними Google/OpenAI джерелами, хешує зміни, не пише на сайт.'
  },
  {
    id: 'conversion_director',
    name: 'Conversion SEO Director',
    readAccess: true,
    writeAccess: 'after_approval',
    responsibility: 'Зіставляє SEO-зміни з продажами, CTR, add_to_cart, checkout і purchase, а не з красивими звітами.'
  },
  {
    id: 'merchant_compliance',
    name: 'Merchant Compliance Agent',
    readAccess: true,
    writeAccess: 'after_approval',
    responsibility: 'Тримає feed, Product/Offer schema, ціну, наявність, бренд і варіанти в одному фактичному стані.'
  },
  {
    id: 'ai_visibility',
    name: 'AI Visibility / GEO Agent',
    readAccess: true,
    writeAccess: 'after_approval',
    responsibility: 'Перевіряє AI crawler доступ, robots.txt, citation-ready блоки, Organization/WebSite/Product schema і llms.txt для не-Google систем.'
  },
  {
    id: 'technical_guardian',
    name: 'Technical Guardian Agent',
    readAccess: true,
    writeAccess: 'after_approval',
    responsibility: 'Працює з canonical, sitemap, robots, template/CWV fixes тільки через diff, backup, readback і rollback.'
  },
  {
    id: 'verifier',
    name: 'Verifier / Rollback Agent',
    readAccess: true,
    writeAccess: 'after_approval',
    responsibility: 'Після внесення читає OpenCart/файли назад, запускає повторний аудит і готує rollback, якщо ефект поганий.'
  }
];

const CONVERSION_OBJECTIVES = [
  { id: 'qualified_organic_sales', label: 'Органічні продажі', metric: 'GA4 purchase revenue + OpenCart orders from organic/search sessions' },
  { id: 'product_discovery', label: 'Знаходження товарів', metric: 'GSC clicks/impressions/CTR by category and product URL' },
  { id: 'cart_progress', label: 'Перехід до кошика', metric: 'GA4 view_item → add_to_cart → begin_checkout → purchase' },
  { id: 'merchant_free_listings', label: 'Google Shopping / free listings', metric: 'Merchant diagnostics + item approvals + product clicks' },
  { id: 'ai_search_visibility', label: 'ChatGPT / AI Search visibility', metric: 'OAI-SearchBot access + AI referral sessions + manual/paid AI mention checks' }
];

const SEO_SCAN_SCOPE = [
  {
    id: 'products',
    label: 'Товари',
    purpose: 'title/meta/H1, Product/Offer schema, опис, фото, ціна/наявність через Merchant контур, релевантність до запиту',
    allowedWrites: 'entity_patch після approval; без вигаданих GTIN, Review або rating'
  },
  {
    id: 'categories',
    label: 'Категорії товарів',
    purpose: 'індексація категорій кави, CollectionPage/Breadcrumb, корисний intro, внутрішня перелінковка до комерційних товарів',
    allowedWrites: 'entity_patch після approval; без масового тексту без попиту'
  },
  {
    id: 'information',
    label: 'Значимі сторінки',
    purpose: 'доставка, оплата, контакти, B2B/подарунки, інформаційні landing pages, які впливають на довіру та конверсію',
    allowedWrites: 'entity_patch або editor task після доказів'
  },
  {
    id: 'technical',
    label: 'Технічні файли/шаблон',
    purpose: 'robots, sitemap/canonical, schema template, CWV/UX блокери, OpenAI crawler access',
    allowedWrites: 'file_patch після approval, hash readback і rollback'
  }
];

const SEO_RESULT_WINDOWS = [
  {
    id: 'snippet',
    label: 'Title/meta/H1',
    firstSignalDays: '7–14 днів',
    decisionDays: '14–28 днів',
    metrics: 'GSC impressions, CTR, clicks, average position; GA4 engagement/conversion for the same URL'
  },
  {
    id: 'schema',
    label: 'Schema / Merchant readiness',
    firstSignalDays: '3–14 днів',
    decisionDays: '14–30 днів',
    metrics: 'rich result eligibility, Merchant diagnostics, product clicks, price/availability mismatch'
  },
  {
    id: 'content_links',
    label: 'Контент / внутрішні посилання',
    firstSignalDays: '14–30 днів',
    decisionDays: '30–60 днів',
    metrics: 'ranking movement, organic sessions, scroll/engagement, add_to_cart/purchase'
  },
  {
    id: 'performance_cro',
    label: 'Швидкість / CRO',
    firstSignalDays: 'одразу для UX, 7–28 днів для SEO',
    decisionDays: '14–45 днів',
    metrics: 'Core Web Vitals, bounce/engagement, add_to_cart, begin_checkout, purchase, CPA/ROAS'
  }
];

const SEO_AGENT_DECISION_RULES = [
  'Якщо CTR/кліки/конверсії ростуть без регресії позицій — масштабувати патерн на схожі сторінки.',
  'Якщо позиція росте, але конверсії не ростуть — запустити CRO/A-B гіпотезу: offer clarity, ціна, доставка, CTA, фото, довіра.',
  'Якщо CTR падає після snippet-зміни — підготувати rollback title/meta або новий варіант.',
  'Якщо Google/GA4 даних недостатньо — не робити висновок; збільшити вікно або дивитися Merchant/Ads/OpenCart proxy.',
  'Якщо повторний scan знову бачить ту саму проблему — не зациклюватися, а змінити adapter/джерело даних або відправити в ручну редакторську задачу.'
];

const SEO_WORKING_CASE_PATTERNS = [
  {
    id: 'striking_distance',
    label: 'Позиції 4–20 з показами',
    pattern: 'Працювати не з “усім сайтом”, а з URL, де Google уже показує сторінку і є шанс підняти CTR/позицію.',
    action: 'batch snippet/schema/internal-link fixes для групи комерційних URL, потім контроль 7–28 днів'
  },
  {
    id: 'conversion_gap',
    label: 'Є кліки, але немає продажу',
    pattern: 'SEO-сторінка може ранжуватися, але не відповідати очікуванню покупця після кліку.',
    action: 'CRO agent перевіряє above-the-fold, ціну, доставку, CTA, фото, trust blocks і пропонує A/B test'
  },
  {
    id: 'self_improving_loop',
    label: 'Агент навчається з роботи',
    pattern: 'Після кожного успішного batch система зберігає гіпотезу, зміни, метрики й рішення — масштабувати, відкотити або змінити підхід.',
    action: 'write → readback → re-audit → GSC/GA4 check → reusable rule для схожих сторінок'
  }
];

const SEO_NORTH_STAR = {
  id: 'first_page_to_conversions',
  title: 'Перша сторінка Google → конверсії',
  primaryMetric: 'GSC average position ≤ 10 для цільових URL',
  conversionMetric: 'GA4 engaged sessions / add_to_cart / purchase для тих самих landing pages',
  verificationWindowDays: 14,
  loop: [
    'Знайти сторінки з позицією 11–20 або 4–10 і реальними показами.',
    'Вибрати одну групу сторінок, де зміна може дати трафік або продаж.',
    'Підготувати вузьку зміну: snippet, content, schema, internal links, CWV або CRO.',
    'Внести тільки після approval, backup і readback.',
    'Через 7–14 днів перевірити GSC/GA4 і або масштабувати, або відкотити.'
  ]
};

function seoGoalPath(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, 'https://mercato.com.ua');
    return decodeURIComponent(parsed.pathname || '/').replace(/\/+$/, '') || '/';
  } catch {
    return raw.replace(/^https?:\/\/[^/]+/i, '').replace(/\/+$/, '') || '/';
  }
}

function seoGoalUrl(value = '', fallbackHost = 'https://mercato.com.ua') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, fallbackHost);
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/+$/, '') || `${parsed.origin}/`;
  } catch {
    return raw;
  }
}

function seoGoalPercent(value = 0) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return numeric <= 1 ? numeric * 100 : numeric;
}

function seoGoalEngagementRisk(ga4Page = null) {
  if (!ga4Page) return 'unknown';
  const bounce = Number(ga4Page.bounce_rate ?? ga4Page.bounceRate ?? 0);
  const engagement = Number(ga4Page.engagement_rate ?? ga4Page.engagementRate ?? 0);
  if (bounce >= 70 || (engagement > 0 && engagement < 35)) return 'high';
  if (bounce >= 45 || (engagement > 0 && engagement < 55)) return 'medium';
  return 'low';
}

function seoGoalActionFor(row = {}, ga4Page = null) {
  const position = Number(row.position || 0);
  const ctr = seoGoalPercent(row.ctr);
  const engagementRisk = seoGoalEngagementRisk(ga4Page);
  if (position > 10) {
    return {
      stage: 'reach_first_page',
      label: 'Дотиснути до 1 сторінки',
      agent: 'Ranking Goal Director',
      nextAction: 'Запустити page audit для цього URL, перевірити intent, title/meta/H1/schema, релевантність опису, внутрішні посилання з категорій і CWV. Після цього підготувати один вузький patch.',
      verification: 'Через 7–14 днів: GSC position має рухатись до ≤10, impressions не мають падати, GA4 engagement не має погіршитись.'
    };
  }
  if (position > 3) {
    return {
      stage: 'top3_push',
      label: 'З 1 сторінки в топ-3',
      agent: ctr < 2 ? 'CTR Snippet Agent' : 'Content / Authority Agent',
      nextAction: ctr < 2
        ? 'Підготувати A/B-style варіант title/meta під реальний запит і обіцянку сторінки; не міняти тіло сторінки без потреби.'
        : 'Посилити сторінку доказами вибору, schema, FAQ-подібними відповідями без FAQ schema, релевантними внутрішніми посиланнями і унікальною користю.',
      verification: 'Через 7–14 днів: CTR, кліки і середня позиція; якщо CTR падає — rollback title/meta.'
    };
  }
  if (engagementRisk === 'high') {
    return {
      stage: 'convert_top_traffic',
      label: 'Трафік є, конверсія слабка',
      agent: 'Conversion UX Agent',
      nextAction: 'Перевірити above-the-fold, ціну, наявність, варіанти, CTA, доставку/оплату і відповідність рекламному/пошуковому наміру; підготувати CRO або Merchant/landing fix.',
      verification: 'GA4 engagement, add_to_cart/purchase або хоча б зниження bounce на цій landing page.'
    };
  }
  return {
    stage: 'protect_and_expand',
    label: 'Утримати й масштабувати',
    agent: 'Verifier / Expansion Agent',
    nextAction: 'Не переписувати працюючу сторінку без причини; знайти суміжні запити/товари і масштабувати патерн на сторінки з позиціями 11–20.',
    verification: 'Контроль GSC/GA4 без регресії; нові сторінки мають рухатись до першої сторінки.'
  };
}

function seoGoalSameUrl(left = '', right = '', fallbackHost = 'https://mercato.com.ua') {
  return Boolean(left && right && seoGoalUrl(left, fallbackHost) === seoGoalUrl(right, fallbackHost));
}

function summarizeSeoGoalAction(action = {}) {
  const issue = cleanIssueText(action.issue || action.recommendedAction || '');
  return {
    id: action.id || '',
    priority: action.priority || issuePriority(issue),
    category: action.category || 'seo',
    agent: action.agent || categoryAgent(action.category || ''),
    issue,
    impact: action.impact || issueImpact(issue),
    recommendedAction: action.recommendedAction || recommendedSeoAction(action.category || '', issue, action.target || '', 'page'),
    verification: action.verification || verificationForCategory(action.category || '', action.target || ''),
    execution: action.execution || 'manual',
    status: action.status || 'open',
    reasonManual: action.reasonManual || ''
  };
}

function seoGoalAuditContext(row = {}, { profile = {}, jobs = [], activeJob = null, fixQueue = {} } = {}) {
  const url = seoGoalUrl(row.url || '', profile.url);
  const matchesTarget = job => job && seoGoalSameUrl(job.target || '', url, profile.url);
  const active = activeJob?.siteId === profile.id && activeJob.status === 'running' && matchesTarget(activeJob)
    ? activeJob
    : null;
  const latestTargetJob = (jobs || []).find(job =>
    matchesTarget(job) && ['completed', 'failed'].includes(job.status)
  ) || null;
  const latestActions = (latestTargetJob?.summary?.actionPlan || [])
    .map(summarizeSeoGoalAction)
    .slice(0, 3);
  const queueItems = new Map();
  [
    ...(Array.isArray(fixQueue.proposals) ? fixQueue.proposals : []),
    ...(Array.isArray(fixQueue.tasks) ? fixQueue.tasks : []),
    ...(Array.isArray(fixQueue.items) ? fixQueue.items : [])
  ].forEach(item => {
    if (!item?.id || queueItems.has(item.id)) return;
    if (!seoGoalSameUrl(item.target || item.url || '', url, profile.url)) return;
    if (item.status && item.status !== 'open') return;
    queueItems.set(item.id, item);
  });
  const queued = [...queueItems.values()];
  const executable = queued.filter(item => item.execution === 'automatic_after_approval');
  const draftPriority = { on_page: 0, content: 1, internal_links: 2, schema: 3, technical: 4, indexation: 5, performance: 6, geo: 7, images: 8 };
  const draftable = queued
    .filter(item => item.execution !== 'automatic_after_approval')
    .sort((left, right) =>
      (draftPriority[left.category] ?? 9) - (draftPriority[right.category] ?? 9)
      || String(left.priority || '').localeCompare(String(right.priority || ''))
      || String(left.issue || '').localeCompare(String(right.issue || ''))
    );
  const queueSummary = {
    total: queued.length,
    executable: executable.length,
    draftable: draftable.length,
    firstExecutableActionId: executable[0]?.id || '',
    firstDraftActionId: draftable[0]?.id || '',
    firstDraftCategory: draftable[0]?.category || '',
    firstDraftExecution: draftable[0]?.execution || '',
    firstDraftIssue: draftable[0]?.issue || ''
  };
  if (active) {
    return {
      auditState: 'running',
      auditTone: 'warn',
      auditLabel: 'аудит виконується',
      auditJobId: active.id,
      auditStartedAt: active.startedAt || '',
      auditCompletedAt: '',
      auditScore: null,
      auditError: '',
      auditActions: [],
      queueSummary,
      ownerNext: 'Зараз не треба натискати ще раз. Дочекайся завершення: картка покаже score, 3 проблеми і кнопку для наступного безпечного кроку.',
      ownerSteps: [
        'Дочекатися завершення read-only аудиту цієї URL.',
        'Подивитися score і топ-причини, що заважають руху до топ-3.',
        'Підготувати точний patch або відкласти контроль на 7–14 днів.'
      ]
    };
  }
  if (latestTargetJob?.status === 'completed') {
    const hasPatch = queueSummary.executable > 0 || queueSummary.draftable > 0;
    return {
      auditState: 'completed',
      auditTone: hasPatch ? 'ok' : 'warn',
      auditLabel: hasPatch ? 'є наступна дія' : 'аудит завершено',
      auditJobId: latestTargetJob.id,
      auditStartedAt: latestTargetJob.startedAt || '',
      auditCompletedAt: latestTargetJob.completedAt || '',
      auditScore: Number(latestTargetJob.summary?.score || 0),
      auditError: '',
      auditActions: latestActions,
      queueSummary,
      ownerNext: hasPatch
        ? 'Тепер не запускай аудит по колу: підготуй patch цієї сторінки або agent draft, потім перевір preview до approval.'
        : 'Аудит завершився, але автоматичної правки ще немає. Потрібен control scan або ручна редакторська задача з доказами.',
      ownerSteps: [
        'Взяти перші 1–3 проблеми нижче, не переписувати все одразу.',
        queueSummary.executable > 0
          ? 'Підготувати patch саме цієї сторінки й перевірити preview.'
          : queueSummary.draftable > 0
            ? 'Дати агенту прочитати сторінку/джерело і створити точний diff.'
            : 'Перечитати SEO-контур, щоб зʼявились typed patches.',
        'Після approval перевірити CTR, позицію і конверсії через 7–14 днів.'
      ]
    };
  }
  if (latestTargetJob?.status === 'failed') {
    return {
      auditState: 'failed',
      auditTone: 'bad',
      auditLabel: 'аудит не завершився',
      auditJobId: latestTargetJob.id,
      auditStartedAt: latestTargetJob.startedAt || '',
      auditCompletedAt: latestTargetJob.completedAt || '',
      auditScore: null,
      auditError: cleanIssueText(latestTargetJob.error || latestTargetJob.stderrTail || 'Аудит цієї сторінки не завершився.'),
      auditActions: [],
      queueSummary,
      ownerNext: 'Спершу треба перезапустити аудит або подивитись помилку. Без результату не можна готувати SEO-зміни.',
      ownerSteps: [
        'Перезапустити аудит цієї сторінки.',
        'Якщо знову впаде — дивитися error у job history.',
        'Не вносити зміни без read-only результату.'
      ]
    };
  }
  return {
    auditState: 'not_started',
    auditTone: 'warn',
    auditLabel: 'аудит не запускався',
    auditJobId: '',
    auditStartedAt: '',
    auditCompletedAt: '',
    auditScore: null,
    auditError: '',
    auditActions: [],
    queueSummary,
    ownerNext: 'Перший крок — audit саме цієї URL. Після нього система має показати не “позиція 8,8”, а конкретну причину і patch/драфт.',
    ownerSteps: [
      'Запустити аудит цієї сторінки.',
      'Отримати score і топ-проблеми по URL.',
      'Підготувати одну вузьку зміну, яка впливає на CTR, позицію або конверсію.'
    ]
  };
}

function buildRankingGoals({ profile = {}, googleDataStatus = {}, latest = null, controlPlan = null, jobs = [], activeJob = null, fixQueue = {} } = {}) {
  const snapshot = googleDataStatus?.snapshot || {};
  const gsc = snapshot.gsc || googleDataStatus?.cache?.gsc || {};
  const ga4 = snapshot.ga4 || googleDataStatus?.cache?.ga4 || {};
  const gscRows = [
    ...(Array.isArray(gsc.topPages) ? gsc.topPages : []),
    ...(Array.isArray(gsc.strikingDistance) ? gsc.strikingDistance : [])
  ].filter(row => row && (row.page || row.url || row.keys));
  const deduped = new Map();
  gscRows.forEach(row => {
    const url = seoGoalUrl(row.page || row.url || (Array.isArray(row.keys) ? row.keys[0] : ''), profile.url);
    if (!url) return;
    const current = deduped.get(url);
    const normalized = {
      url,
      path: seoGoalPath(url),
      clicks: Math.round(Number(row.clicks || 0)),
      impressions: Math.round(Number(row.impressions || 0)),
      ctr: Number(seoGoalPercent(row.ctr).toFixed(2)),
      position: Number(Number(row.position || 0).toFixed(1))
    };
    if (!current || normalized.impressions > current.impressions || normalized.clicks > current.clicks) {
      deduped.set(url, normalized);
    }
  });
  const ga4ByPath = new Map((Array.isArray(ga4.topPages) ? ga4.topPages : []).map(page => [
    seoGoalPath(page.landing_page || page.page || page.url || ''),
    page
  ]));
  const candidateRows = [...deduped.values()]
    .filter(row => row.impressions >= 20 && row.position > 0)
    .map(row => {
      const ga4Page = ga4ByPath.get(row.path) || null;
      const action = seoGoalActionFor(row, ga4Page);
      const score = (row.impressions * 0.55) + (row.clicks * 18) + Math.max(0, 21 - row.position) * 22;
      const base = {
        ...row,
        targetPosition: row.position > 10 ? 10 : row.position > 3 ? 3 : 1,
        ga4Sessions: Math.round(Number(ga4Page?.sessions || 0)),
        ga4BounceRate: ga4Page ? Number(Number(ga4Page.bounce_rate ?? 0).toFixed(1)) : null,
        ga4EngagementRate: ga4Page ? Number(Number(ga4Page.engagement_rate ?? 0).toFixed(1)) : null,
        engagementRisk: seoGoalEngagementRisk(ga4Page),
        opportunityScore: Number(score.toFixed(1)),
        ...action
      };
      return {
        ...base,
        ...seoGoalAuditContext(base, { profile, jobs, activeJob, fixQueue })
      };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore || a.position - b.position);
  const firstPage = candidateRows.filter(row => row.position <= 10).length;
  const nearFirstPage = candidateRows.filter(row => row.position > 10 && row.position <= 20).length;
  const topThree = candidateRows.filter(row => row.position <= 3).length;
  const conversionRisk = candidateRows.filter(row => row.engagementRisk === 'high').length;
  const bestNext = candidateRows.find(row => row.position > 10 && row.position <= 20)
    || candidateRows.find(row => row.position > 3 && row.position <= 10)
    || candidateRows[0]
    || null;
  const activeTarget = candidateRows.find(row => row.auditState === 'running') || null;
  return {
    ...SEO_NORTH_STAR,
    siteId: profile.id || 'mercato',
    siteName: profile.name || 'Mercato',
    currentScore: Number(latest?.summary?.score || googleDataStatus?.cache?.metrics?.latest_seo_score || 0),
    dataReady: Boolean(candidateRows.length),
    source: candidateRows.length ? 'GSC + GA4 landing pages' : 'Потрібні GSC rows з позиціями та GA4 landing pages',
    summary: {
      trackedUrls: candidateRows.length,
      firstPage,
      nearFirstPage,
      topThree,
      conversionRisk,
      inventoryEntities: Number(controlPlan?.inventorySummary?.entities || 0)
    },
    bestNext: activeTarget || bestNext,
    activeTarget,
    targets: candidateRows.slice(0, 8),
    guardrails: [
      'Агенти не “фіксять усе”: кожна дія має вести до позиції, CTR або конверсії.',
      'Не переписувати працюючу сторінку без гіпотези та метрики.',
      'Товарні описи не використовувати як контейнер для декоративної перелінковки.',
      'Після approval: backup → readback → повторний аудит → GSC/GA4 контроль через 7–14 днів.'
    ]
  };
}

const STATIC_OFFICIAL_RULES = [
  {
    id: 'google_ai_core_seo',
    sourceId: 'google_ai_search',
    priority: 'critical',
    rule: 'Для Google AI features спочатку потрібні індексовані, crawlable сторінки зі snippet eligibility; “GEO” не замінює базове SEO.',
    siteAction: 'Контролювати robots/canonical/sitemap/status, не блокувати CSS/JS, перевіряти GSC URL Inspection для ключових категорій і товарів.',
    writeSurface: 'robots.txt, sitemap/canonical/template patches after approval'
  },
  {
    id: 'google_ai_no_magic_llms',
    sourceId: 'google_ai_search',
    priority: 'important',
    rule: 'Google Search не використовує llms.txt як спеціальний сигнал для AI Overviews/AI Mode.',
    siteAction: 'llms.txt можна підтримувати для інших AI-систем, але не ставити вище Merchant, індексації, якості сторінки та швидкості.',
    writeSurface: 'llms.txt file patch after approval'
  },
  {
    id: 'openai_searchbot_access',
    sourceId: 'openai_crawlers',
    priority: 'critical',
    rule: 'Для ChatGPT Search треба дозволити OAI-SearchBot; GPTBot і ChatGPT-User мають інші ролі.',
    siteAction: 'Прочитати robots.txt, переконатися що OAI-SearchBot не заблокований, після approve внести вузький robots patch.',
    writeSurface: 'robots.txt file patch after approval'
  },
  {
    id: 'merchant_data_consistency',
    sourceId: 'google_merchant_spec',
    priority: 'critical',
    rule: 'Feed, landing page, Product/Offer schema, ціна, availability, brand і variants не мають конфліктувати.',
    siteAction: 'Сканувати каталог, варіанти та feed-поля; виправляти тільки фактичні поля з readback, без вигаданих GTIN/reviews.',
    writeSurface: 'OpenCart product/feed override patches after approval'
  },
  {
    id: 'people_first_conversion_content',
    sourceId: 'google_helpful_content',
    priority: 'important',
    rule: 'Масова генерація сторінок або описів без унікальної користі — ризик; контент має допомагати покупцю ухвалити рішення.',
    siteAction: 'Писати/оновлювати описи тільки з фактів товару, попиту GSC, реальних питань покупців і контролю конверсій.',
    writeSurface: 'description/meta/internal-link patches after approval'
  },
  {
    id: 'schema_truthfulness',
    sourceId: 'google_product_schema',
    priority: 'critical',
    rule: 'Product/Offer schema має бути правдивою; Review/AggregateRating додаються тільки за наявності реальних відгуків.',
    siteAction: 'Генерувати schema з OpenCart source of truth і не вигадувати рейтинг, відгуки, доставку або гарантії.',
    writeSurface: 'managed schema block after approval'
  }
];

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tempPath, filePath);
}

function walkSkillCount(skillsRoot) {
  try {
    return fs.readdirSync(skillsRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^seo(?:-|$)/.test(entry.name))
      .filter(entry => fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
      .length;
  } catch {
    return 0;
  }
}

function agentCount(agentsRoot) {
  try {
    return fs.readdirSync(agentsRoot).filter(name => /^seo-.*\.toml$/.test(name)).length;
  } catch {
    return 0;
  }
}

function extractVersion(skillPath) {
  try {
    const text = fs.readFileSync(skillPath, 'utf8');
    return text.match(/version:\s*["']?([^"'\n]+)/)?.[1]?.trim() || '';
  } catch {
    return '';
  }
}

function parseLastJsonObject(text = '') {
  let inString = false;
  let escaped = false;
  let depth = 0;
  let start = -1;
  let last = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const candidate = text.slice(start, index + 1);
        try {
          last = JSON.parse(candidate);
        } catch {}
        start = -1;
      }
    }
  }
  return last;
}

function cleanIssueText(value = '') {
  return String(value || '')
    .replace(/^[A-Za-z_ ]+:\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value = '') {
  return String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function contentHash(value = '') {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function lastUpdatedFromText(text = '') {
  const match = String(text || '').match(/Last updated\s+([0-9]{4}-[0-9]{2}-[0-9]{2})(?:\s+UTC)?/i);
  return match ? match[1] : '';
}

function titleFromHtml(html = '', fallback = '') {
  return String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || fallback;
}

function sourceKeywordHits(text = '', watchTerms = []) {
  const lower = String(text || '').toLowerCase();
  return watchTerms.filter(term => lower.includes(String(term || '').toLowerCase()));
}

function fallbackOfficialSource(source) {
  const plain = [
    source.title,
    source.owner,
    source.conversionRelevance,
    ...(source.watchTerms || [])
  ].join(' ');
  return {
    ...source,
    ok: false,
    status: 'fallback',
    statusText: 'Live fetch не виконувався або недоступний; використано збережений список правил.',
    checkedAt: new Date().toISOString(),
    lastUpdated: '',
    contentHash: contentHash(plain),
    keywordHits: source.watchTerms || [],
    changedSinceLastCheck: false
  };
}

function buildGrowthTasks({ siteId = 'mercato', sourceSnapshots = [], previousReport = null } = {}) {
  const changedSources = new Set(
    sourceSnapshots
      .filter(source => source.changedSinceLastCheck)
      .map(source => source.id)
  );
  const sourceStatuses = new Map(sourceSnapshots.map(source => [source.id, source]));
  const tasks = STATIC_OFFICIAL_RULES.map(rule => ({
    id: `growth-rule-${stableSeoId(siteId, rule.id, rule.rule)}`,
    agent: rule.sourceId === 'openai_crawlers' ? 'AI Visibility / GEO Agent'
      : rule.sourceId === 'google_merchant_spec' ? 'Merchant Compliance Agent'
        : rule.sourceId === 'google_product_schema' ? 'Schema Agent'
          : 'Conversion SEO Director',
    priority: rule.priority,
    sourceId: rule.sourceId,
    sourceTitle: sourceStatuses.get(rule.sourceId)?.title || rule.sourceId,
    changedSource: changedSources.has(rule.sourceId),
    issue: rule.rule,
    recommendedAction: rule.siteAction,
    writeSurface: rule.writeSurface,
    execution: rule.writeSurface.includes('after approval') ? 'after_approval' : 'read_only',
    impact: rule.priority === 'critical'
      ? 'Без цього можна втрачати індексацію, Merchant eligibility, ChatGPT Search visibility або продажі.'
      : 'Підсилює якість сторінок, довіру й конверсію без масового SEO-контенту.',
    verification: 'Після зміни: readback, цільовий SEO/GEO/Merchant audit, GSC/GA4 контроль і rollback при регресії.'
  }));
  if (!previousReport) {
    tasks.unshift({
      id: `growth-rule-${stableSeoId(siteId, 'baseline')}`,
      agent: 'Policy Watcher Agent',
      priority: 'important',
      sourceId: 'baseline',
      sourceTitle: 'Перший baseline правил',
      changedSource: false,
      issue: 'Потрібно створити перший baseline офіційних SEO/GEO/Merchant правил.',
      recommendedAction: 'Натиснути “Оновити правила Google/AI”, після чого агенти порівнюватимуть зміни в документації з попереднім станом.',
      writeSurface: 'read-only',
      execution: 'read_only',
      impact: 'Дає живу систему моніторингу, а не одноразовий аудит.',
      verification: 'Перевірити checkedAt, source status і hash кожного офіційного джерела.'
    });
  }
  return tasks.sort((left, right) => {
    const priorityOrder = { critical: 0, important: 1, later: 2 };
    return (priorityOrder[left.priority] ?? 9) - (priorityOrder[right.priority] ?? 9)
      || Number(right.changedSource) - Number(left.changedSource)
      || left.agent.localeCompare(right.agent);
  });
}

function buildIntelligenceReport({ siteId = 'mercato', sourceSnapshots = [], previousReport = null, liveDocs = false } = {}) {
  const checkedAt = new Date().toISOString();
  const sources = sourceSnapshots.length
    ? sourceSnapshots
    : OFFICIAL_SEO_SOURCES.map(fallbackOfficialSource);
  const changed = sources.filter(source => source.changedSinceLastCheck);
  const failed = sources.filter(source => !source.ok);
  const tasks = buildGrowthTasks({ siteId, sourceSnapshots: sources, previousReport });
  return {
    ok: true,
    siteId,
    checkedAt,
    liveDocs: Boolean(liveDocs && sources.some(source => source.ok)),
    sourceCount: sources.length,
    changedCount: changed.length,
    failedCount: failed.length,
    sources,
    agents: SEO_GROWTH_AGENTS,
    conversionObjectives: CONVERSION_OBJECTIVES,
    scanScope: SEO_SCAN_SCOPE,
    resultWindows: SEO_RESULT_WINDOWS,
    decisionRules: SEO_AGENT_DECISION_RULES,
    casePatterns: SEO_WORKING_CASE_PATTERNS,
    rules: STATIC_OFFICIAL_RULES,
    tasks,
    operatingModel: {
      loop: 'official docs → site inventory/GSC/GA4/Merchant evidence → exact patch preview → owner approval → write → readback → re-audit → conversion check',
      approvalRequired: true,
      autoPublish: false,
      massContent: false,
      nightlyReady: true,
      batchLimits: {
        defaultEntities: SEO_BATCH_LIMITS.defaultEntities,
        maxEntities: SEO_BATCH_LIMITS.maxEntities,
        maxChanges: SEO_BATCH_LIMITS.maxChanges,
        executionChunkSize: SEO_BATCH_LIMITS.executionChunkSize
      },
      suggestedSchedule: 'nightly documentation check + weekly full SEO/GEO/Merchant audit + daily conversion anomaly check after GA4/GSC are connected'
    },
    summary: {
      critical: tasks.filter(task => task.priority === 'critical').length,
      important: tasks.filter(task => task.priority === 'important').length,
      sourceChanges: changed.map(source => source.title),
      blockedByMissingApis: ['PageSpeed/CrUX API key'].filter(Boolean),
      connectedCoreApis: ['Google Search Console', 'GA4 Data API', 'Merchant Center diagnostics', 'Google Ads diagnostics']
    }
  };
}

function issuePriority(issue = '') {
  const text = cleanIssueText(issue).toLowerCase();
  if (/noindex|robots.*block|non-200|404|500|missing title|немає title|ssl|https.*critical/.test(text)) return 'critical';
  if (/lcp|inp|cls|core web|schema|title|meta description|h1|mobile|touch target|security header|canonical|indexability|індекс/.test(text)) return 'important';
  return 'later';
}

function issueImpact(issue = '') {
  const text = cleanIssueText(issue).toLowerCase();
  if (/lcp|inp|cls|mobile|touch/.test(text)) return 'Швидкість, мобільна конверсія і якість landing page.';
  if (/schema|product|offer|review|merchant/.test(text)) return 'Rich results, Merchant Center і відповідність товарних даних.';
  if (/title|meta|h1/.test(text)) return 'CTR, релевантність сторінки та зрозумілий SERP snippet.';
  if (/noindex|robots|canonical|index/.test(text)) return 'Індексація та видимість у пошуку.';
  if (/image|alt|lazy/.test(text)) return 'Швидкість, доступність і image search.';
  if (/llms|ai crawler|author|citation|geo/.test(text)) return 'AI Search / GEO; нижче за індексацію, Merchant і швидкість.';
  return 'Органічна видимість або якість сторінки; потрібна ручна перевірка.';
}

function extractIssues(payload = {}) {
  const candidates = [
    ...(payload.priority_issues || []).map(item => item?.issue || item),
    ...(payload.top_actions || []),
    ...(payload.result?.top_actions || []),
    ...(payload.result?.issues || [])
  ];
  return [...new Set(candidates.map(cleanIssueText).filter(Boolean))];
}

function stableSeoId(...parts) {
  return crypto.createHash('sha256').update(parts.map(value => String(value || '')).join('|')).digest('hex').slice(0, 18);
}

function normalizeSeoControlTarget(value = '') {
  try {
    const url = new URL(String(value || ''), 'https://mercato.com.ua');
    return `${url.origin}${url.pathname.replace(/\/+$/, '') || '/'}${url.search || ''}`;
  } catch {
    return String(value || '').replace(/\/+$/, '');
  }
}

function seoControlSubject(item = {}) {
  const entityType = String(item.entityType || item.entity_type || '');
  const entityId = String(item.entityId || item.entity_id || '');
  if (entityType && entityId) return `entity:${entityType}:${entityId}`;
  if (item.file) return `file:${item.file}`;
  if (item.executor === 'file_patch' && item.target) return `file:${item.target}`;
  return `target:${normalizeSeoControlTarget(item.target || item.url || item.id || '')}`;
}

function seoControlTask(item = {}) {
  const explicit = String(item.task || item.field || '').trim();
  if (explicit) return explicit;
  const category = String(item.category || '').trim();
  if (category === 'internal_links' || category === 'content') return 'description';
  if (category === 'schema') return 'schema_type';
  if (category === 'indexation' && item.file) return 'file_content';
  if (category === 'technical' || category === 'performance' || category === 'geo') return item.file ? 'file_content' : category;
  return category || 'action';
}

function decodeSeoReadbackHtml(value = '') {
  return String(value || '')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
}

function stripSeoReadbackText(value = '') {
  return decodeSeoReadbackHtml(value)
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSeoReadbackAnchors(value = '') {
  const anchors = [];
  const html = decodeSeoReadbackHtml(value);
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const attrs = match[1] || '';
    const href = (attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    anchors.push({
      url: href ? normalizeSeoControlTarget(href) : '',
      text: stripSeoReadbackText(match[2] || '')
    });
  }
  return anchors;
}

function buildSeoPostWriteQualityReport({ writeRuns = [], controlPlan = null } = {}) {
  const allowedUrls = new Set((controlPlan?.entityIndex || [])
    .map(item => normalizeSeoControlTarget(item.url || ''))
    .filter(Boolean));
  const items = [];
  const seen = new Set();
  for (const run of writeRuns || []) {
    for (const result of run.results || []) {
      if (!result?.ok || !result.readback) continue;
      const key = result.entityType && result.entityId
        ? `${result.entityType || ''}:${result.entityId || ''}`
        : normalizeSeoControlTarget(result.target || `${result.task || ''}:${result.sourceActionId || result.actionId || ''}`);
      if (seen.has(key)) continue;
      seen.add(key);
      const snapshot = result.readback || {};
      const description = String(snapshot.description || result.after || '');
      const decoded = decodeSeoReadbackHtml(description);
      const visibleText = stripSeoReadbackText(description);
      const anchors = extractSeoReadbackAnchors(description);
      const badAnchors = anchors.filter(anchor => !anchor.url || !allowedUrls.has(anchor.url));
      const schemaText = stripSeoReadbackText((decoded.match(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i) || [])[1] || '');
      const issues = [];
      if (/<(?:html|head|body|meta|title|style)\b/i.test(decoded)) {
        issues.push({ code: 'full_html_document', severity: 'critical', label: 'Повний HTML/CSS у description', reason: 'OpenCart description не має містити meta/title/style або CSS-сторінку.' });
      }
      if ((decoded.match(/<h1\b/gi) || []).length) {
        issues.push({ code: 'description_h1', severity: 'critical', label: 'H1 всередині description', reason: 'Може створити дубль головного заголовка на сторінці.' });
      }
      if (badAnchors.length) {
        issues.push({ code: 'bad_internal_links', severity: 'critical', label: 'Підозрілі внутрішні посилання', reason: 'Є <a> без href або URL поза SEO inventory.' });
      }
      if (/(?:SEO|GSC|GA4|agent|brief|readback|основа генерації)/i.test(visibleText)) {
        issues.push({ code: 'internal_agent_text', severity: 'critical', label: 'Внутрішній службовий текст', reason: 'Службові слова не мають потрапляти у live-контент.' });
      }
      if (/MERCATO_AI_INTERNAL_LINKS/i.test(description)) {
        issues.push({ code: 'old_internal_links_marker', severity: 'review', label: 'Старий managed internal-links block', reason: 'Потрібно перевірити, чи блок не дублює новий опис і не замінює корисний текст.' });
      }
      if (/(?:меленой|свеж|обжар|кофе|интернет-магазин|☕|✔|►)/i.test(schemaText)) {
        issues.push({ code: 'stale_schema_meta', severity: 'review', label: 'Schema/meta виглядає застаріло', reason: 'Структурований опис може не відповідати оновленому видимому тексту.' });
      }
      if (/(?:меленой|свеж|обжар|кофе|покупайте|интернет-магазин)/i.test(visibleText)) {
        issues.push({ code: 'mixed_language_tone', severity: 'review', label: 'Мовна/тональна суміш', reason: 'Є російські або старі SEO-формулювання в українському контенті.' });
      }
      if (!issues.length) continue;
      items.push({
        runId: run.id,
        completedAt: run.completedAt || '',
        target: result.target || '',
        entityType: result.entityType || '',
        entityId: result.entityId || '',
        task: result.task || '',
        textLength: visibleText.length,
        issues,
        badAnchors: badAnchors.slice(0, 8),
        title: snapshot.meta_title || '',
        h1: snapshot.meta_h1 || '',
        metaDescription: snapshot.meta_description || ''
      });
    }
    if (items.length >= 30) break;
  }
  const critical = items.filter(item => item.issues.some(issue => issue.severity === 'critical')).length;
  const review = items.filter(item => item.issues.some(issue => issue.severity !== 'critical')).length;
  return {
    status: critical ? 'critical' : review ? 'review' : 'ok',
    generatedAt: new Date().toISOString(),
    checkedRuns: (writeRuns || []).slice(0, 8).length,
    checked: seen.size,
    critical,
    review,
    items: items.slice(0, 20)
  };
}

function isSeoRepairPreviewPayload(actions = [], changes = []) {
  const items = [...(actions || []), ...(changes || [])];
  if (!items.length) return false;
  return items.every(item => {
    const haystack = [
      item.category,
      item.agent,
      item.task,
      item.issue,
      item.note,
      item.verification
    ].map(value => String(value || '').toLowerCase()).join(' ');
    return /\b(?:repair|recovery|rollback|verifier|content_repair|post_write_repair)\b/.test(haystack)
      || ['content_repair', 'post_write_repair', 'verifier_repair', 'rollback'].includes(String(item.category || '').toLowerCase());
  });
}

function buildSeoRecoveryMode({ postWriteQuality = {}, fixPreview = null } = {}) {
  const critical = Number(postWriteQuality.critical || 0);
  const review = Number(postWriteQuality.review || 0);
  const locked = critical > 0;
  const activePreviewIsRepair = Boolean(fixPreview && isSeoRepairPreviewPayload(fixPreview.actions || [], fixPreview.changes || []));
  return {
    status: locked ? 'recovery_locked' : review ? 'review' : 'ok',
    locked,
    critical,
    review,
    checked: Number(postWriteQuality.checked || 0),
    checkedRuns: Number(postWriteQuality.checkedRuns || 0),
    reason: locked
      ? 'Post-write verifier знайшов critical проблеми у live/readback. Нові SEO-зміни заблоковані до repair або rollback.'
      : review
        ? 'Є post-write review задачі, але critical блокерів немає.'
        : 'Post-write verifier не бачить critical блокерів.',
    activePreviewId: fixPreview?.id || '',
    activePreviewStatus: fixPreview?.status || '',
    activePreviewIsRepair,
    allowedActions: locked
      ? ['review_repair_preview', 'approve_repair_after_manual_review', 'apply_approved_repair', 'rollback_bad_change', 'readback_rescan']
      : ['read_only_scan', 'agent_draft', 'batch_preview', 'approval_gated_apply', 'readback_verification', 'rollback'],
    blockedActions: locked
      ? ['agent_draft', 'agent_draft_batch', 'generic_fix_preview', 'internal_linking', 'content_expansion', 'scale_patterns']
      : [],
    nextStep: locked
      ? activePreviewIsRepair
        ? 'Перевірити repair-preview і застосувати тільки після ручного approval; потім readback і повторний verifier.'
        : 'Створити вузький repair-preview для critical сторінок або виконати rollback проблемного write-run.'
      : 'Можна переходити до evidence-led SEO задач: on-page/schema/Merchant/internal links з readback.'
  };
}

function buildSeoSpecialistAgents({ recoveryMode = {}, postWriteQuality = {}, fixQueue = {}, controlPlan = null, fixPreview = null } = {}) {
  const queueItems = [
    ...(fixQueue.proposals || []),
    ...(fixQueue.tasks || []),
    ...(fixQueue.items || [])
  ];
  const countByCategory = category => queueItems.filter(item => item.category === category).length;
  const locked = Boolean(recoveryMode.locked);
  const criticalItems = (postWriteQuality.items || []).filter(item => (item.issues || []).some(issue => issue.severity === 'critical'));
  return [
    {
      id: 'seo_director',
      name: 'SEO Director',
      status: locked ? 'blocked_until_recovery' : 'active',
      mission: 'Вибирає задачі за впливом на органічні продажі, CTR, конверсію і Merchant видимість.',
      evidenceRequired: ['GSC/GA4 або локальний scan', 'тип сторінки', 'поточний стан', 'очікуваний бізнес-вплив'],
      canChange: locked ? [] : ['пріоритети задач', 'batch scope', 'контрольні вікна 7/14/28 днів'],
      cannotChange: ['live контент без approval', 'вигадані факти', 'масові SEO-статті'],
      currentWork: locked
        ? `Стопорить масштабування: ${criticalItems.length} critical readback задач.`
        : `${queueItems.length} задач у SEO control plane; спочатку on-page/schema/технічні задачі з evidence.`
    },
    {
      id: 'technical_seo',
      name: 'Technical SEO Specialist',
      status: locked ? 'read_only' : 'active',
      mission: 'Працює з crawl/index/canonical/schema placement/CWV через мінімальний file diff.',
      evidenceRequired: ['файл з allowlist', 'before hash', 'точний search fragment', 'syntax check', 'rollback path'],
      canChange: locked ? ['тільки rollback/repair, якщо це причина critical'] : ['robots/sitemap/canonical/template/schema/CSS/JS patch після approval'],
      cannotChange: ['config/secrets/admin/database', 'повний rewrite файла без потреби'],
      currentWork: `${countByCategory('technical') + countByCategory('indexation') + countByCategory('performance')} технічних задач очікують evidence/file patch.`
    },
    {
      id: 'content_quality',
      name: 'Content Quality Specialist',
      status: locked ? 'repair_only' : 'active_after_evidence',
      mission: 'Пише людський покупець-facing текст тільки там, де є факти і пошуковий/конверсійний сенс.',
      evidenceRequired: ['OpenCart readback', 'факти товару/категорії', 'видимий текст', 'allowed internal targets'],
      canChange: locked ? ['очищення зламаного description'] : ['description/meta/H1 для конкретної сутності після diff'],
      cannotChange: ['H1 в description', 'meta/title/style у description', 'вода для word count', 'службові SEO/GSC/agent фрази'],
      currentWork: locked
        ? `${criticalItems.filter(item => (item.issues || []).some(issue => ['full_html_document', 'description_h1', 'bad_internal_links'].includes(issue.code))).length} content repair задач.`
        : `${countByCategory('content')} content задач, але без bulk rewrite.`
    },
    {
      id: 'internal_linking',
      name: 'Internal Linking Specialist',
      status: locked ? 'blocked' : 'active_after_content_quality',
      mission: 'Додає тільки релевантні внутрішні посилання на URL з inventory/GSC, не замінюючи опис.',
      evidenceRequired: ['allowedTargets', 'HTTP 200 цільових URL', 'видимий опис >= 350 символів', 'природний anchor'],
      canChange: locked ? [] : ['2-3 релевантні internal links у конкретному description після approval'],
      cannotChange: ['<a> без href', 'посилання поза inventory', 'лінки замість нормального опису'],
      currentWork: locked ? 'Заблокований до cleanup critical readback.' : `${countByCategory('internal_links')} internal-link задач.`
    },
    {
      id: 'merchant_feed_doctor',
      name: 'Merchant Feed Doctor',
      status: 'separate_module',
      mission: 'Готує каталог до Google Shopping: ID/title/description/image/price/availability/brand/identifier/schema.',
      evidenceRequired: ['актуальний Merchant scan', 'bridgeVersion', 'coverage.full', 'variant policy', 'Google diagnostics'],
      canChange: ['тільки Merchant preview/overrides/OpenCart brand після окремого approval'],
      cannotChange: ['вигадані GTIN/MPN/SKU', 'вигадані reviews/rating', 'Merchant Center publish без окремого approval'],
      currentWork: 'Працює окремо від SEO preview; canonical product mode лишається базовою політикою.'
    },
    {
      id: 'verifier',
      name: 'Verifier / Rollback Specialist',
      status: locked ? 'owner_of_current_flow' : 'active',
      mission: 'Після кожного write читає live/readback і блокує масштабування, якщо є critical.',
      evidenceRequired: ['writeRun', 'readback snapshot', 'повторний scan/audit', 'список issue codes'],
      canChange: ['створити repair-preview', 'запропонувати rollback', 'зняти блок тільки після чистого readback'],
      cannotChange: ['ігнорувати critical', 'масштабувати патерн без результату'],
      currentWork: locked
        ? `${criticalItems.length} critical items; active repair preview: ${fixPreview?.id || 'немає'}.`
        : 'Контроль після наступного approval-gated write.'
    }
  ];
}

function seoStableKeyVariants(item = {}) {
  const keys = new Set();
  const rawIds = [
    item.stableActionKey,
    item.sourceActionId,
    item.source_action_id,
    item.originalActionId,
    item.original_action_id,
    item.actionId,
    item.id
  ].map(value => String(value || '').trim()).filter(Boolean);
  rawIds.forEach(id => {
    keys.add(`id:${id}`);
    if (id.startsWith('seo-control-') || id.startsWith('seo-action-')) keys.add(`source:${id}`);
  });
  const siteId = String(item.siteId || item.site_id || '').trim();
  const subject = seoControlSubject(item);
  const task = seoControlTask(item);
  const category = String(item.category || '').trim();
  if (subject && task) keys.add(`subject:${siteId}:${subject}:${task}`);
  if (subject && task && category) keys.add(`category:${siteId}:${category}:${subject}:${task}`);
  return [...keys].filter(Boolean);
}

function primarySeoStableKey(item = {}) {
  return seoStableKeyVariants(item).find(key => key.startsWith('category:'))
    || seoStableKeyVariants(item).find(key => key.startsWith('subject:'))
    || seoStableKeyVariants(item)[0]
    || '';
}

function completedSeoActionMeta(state = {}, siteId = '') {
  const completed = new Map();
  (state.writeRuns || [])
    .filter(run => run.siteId === siteId)
    .forEach(run => {
      const runTimestamp = Date.parse(run.completedAt || run.startedAt || run.createdAt || 0) || 0;
      (run.results || [])
        .filter(result => result.ok)
        .forEach(result => {
          const resultWithSite = { ...result, siteId };
          seoStableKeyVariants(resultWithSite).forEach(key => {
            const previous = completed.get(key);
            if (!previous || runTimestamp >= previous.runTimestamp) {
              completed.set(key, {
                key,
                runId: run.id,
                runStatus: run.status,
                completedAt: run.completedAt || run.startedAt || '',
                runTimestamp
              });
            }
          });
        });
    });
  return completed;
}

function completedMetaForSeoItem(completedMeta = new Map(), item = {}, siteId = '') {
  const variants = seoStableKeyVariants({ ...item, siteId });
  return variants
    .map(key => completedMeta.get(key))
    .filter(Boolean)
    .sort((left, right) => right.runTimestamp - left.runTimestamp)[0] || null;
}

function targetScope(siteId, target = '') {
  let parsed;
  try {
    parsed = new URL(target || SITE_PROFILES[siteId]?.url || '');
  } catch {
    return 'site';
  }
  const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/') return 'site';
  const profile = SITE_PROFILES[siteId];
  const knownCategory = profile?.weeklyChecks?.some(check =>
    check.id === 'category' && check.target.replace(/\/+$/, '') === parsed.toString().replace(/\/+$/, '')
  );
  if (knownCategory) return 'category';
  if (siteId === 'mercato' && (parsed.searchParams.get('product_id') || pathname.split('/').filter(Boolean).length >= 2)) {
    return 'product';
  }
  return 'page';
}

function issueCategory(issue = '') {
  const text = cleanIssueText(issue).toLowerCase();
  if (/lcp|inp|cls|core web|mobile|touch target|ttfb|fcp/.test(text)) return 'performance';
  if (/noindex|robots|canonical|sitemap|indexnow|indexability|індекс/.test(text)) return 'indexation';
  if (/schema|json-ld|structured data|product|offer|review|aggregate.?rating/.test(text)) return 'schema';
  if (/title|meta description|h1/.test(text)) return 'on_page';
  if (/image|alt text|lazy|webp|avif/.test(text)) return 'images';
  if (/llms|ai crawler|gptbot|claudebot|citation|question-based|answer block/.test(text)) return 'geo';
  if (/author|expert|e-e-a-t|readability|sentence|thin content/.test(text)) return 'content';
  if (/internal link|orphan|перелінк/.test(text)) return 'internal_links';
  return 'technical';
}

function categoryAgent(category = '') {
  return {
    performance: 'Performance Agent',
    indexation: 'Indexation Agent',
    schema: 'Schema Agent',
    on_page: 'On-page Agent',
    images: 'Image Agent',
    geo: 'GEO Agent',
    content: 'Content Quality Agent',
    internal_links: 'Internal Linking Agent',
    technical: 'Technical SEO Agent'
  }[category] || 'SEO Director';
}

function recommendedSeoAction(category, issue, target, scope) {
  const location = scope === 'site' ? 'на рівні всього сайту' : `на сторінці ${target}`;
  if (category === 'performance') return `Зняти mobile waterfall і CrUX/PSI для ${target}, знайти конкретний LCP/INP/CLS-вузол і виправити шаблон або скрипт, що його створює.`;
  if (category === 'indexation') return `Порівняти sitemap URL, final URL, canonical, robots і HTTP status ${location}; змінювати лише після підтвердження джерела розбіжності.`;
  if (category === 'schema') return `Зіставити видимі дані сторінки з JSON-LD ${location}; не додавати Review/AggregateRating без реальних відгуків.`;
  if (category === 'on_page') return `Підготувати точний diff для title, meta description або H1 ${location}, зберігши назву товару й пошуковий намір.`;
  if (category === 'images') return `Знайти конкретні зображення ${location}, перевірити alt, розміри, формат, lazy-load і зарезервований простір.`;
  if (category === 'geo') return `Перевірити доступ AI crawler, самодостатні блоки відповідей і джерела довіри ${location}; не генерувати масовий текст.`;
  if (category === 'content') return `Перевірити текст ${location} вручну: факти, користь покупцю, авторство й дублювання; переписувати лише підтверджені слабкі фрагменти.`;
  if (category === 'internal_links') return `Побудувати релевантні входи й виходи для ${target} з категорій, суміжних товарів і корисних сторінок.`;
  return `Локалізувати технічну причину сигналу «${cleanIssueText(issue)}» ${location} і підготувати вузьку зміну з rollback.`;
}

function verificationForCategory(category, target) {
  if (category === 'performance') return `Повторний mobile PSI/CrUX і перевірка реальної взаємодії на ${target}.`;
  if (category === 'indexation') return `Повторний crawl, URL Inspection у GSC і перевірка canonical/sitemap після зміни.`;
  if (category === 'schema') return `Readback HTML, Schema validator та перевірка відповідності ціні, наявності й видимому контенту.`;
  if (category === 'on_page') return `Readback OpenCart, повторний page audit і контроль відсутності службового SEO-тексту.`;
  if (category === 'images') return `Повторний image audit і mobile layout check без CLS.`;
  if (category === 'geo') return `Повторний GEO audit та ручна перевірка, що зміна не послабила Google crawl/indexation.`;
  return `Повторний цільовий SEO-аудит ${target} і ручна перевірка результату.`;
}

function classifySeoAction({ siteId, mode, target, issue, priority, impact, verificationRequired = false } = {}) {
  const cleanIssue = cleanIssueText(issue);
  const category = issueCategory(cleanIssue);
  const scope = targetScope(siteId, target);
  const aggregate = /\b\d+\s+page\(s\)/i.test(cleanIssue);
  let task = '';
  if (!aggregate && category === 'on_page' && /meta description length/i.test(cleanIssue)) task = 'meta_description';
  else if (!aggregate && category === 'on_page' && /title tag length/i.test(cleanIssue)) task = 'meta_title';
  else if (!aggregate && category === 'on_page' && /(?:0 h1|exposes 0 h1|missing h1|немає h1)/i.test(cleanIssue)) task = 'h1';
  else if (
    !aggregate
    && category === 'schema'
    && /(?:product|offer).*(?:missing|відсут)|(?:missing|відсут).*(?:product|offer)/i.test(cleanIssue)
  ) task = 'product_schema';
  const executable = siteId === 'mercato' && scope === 'product' && Boolean(task);
  return {
    id: `seo-action-${stableSeoId(siteId, mode, target, cleanIssue)}`,
    siteId,
    mode,
    target,
    scope,
    priority: priority || issuePriority(cleanIssue),
    category,
    agent: categoryAgent(category),
    issue: cleanIssue,
    impact: impact || issueImpact(cleanIssue),
    recommendedAction: recommendedSeoAction(category, cleanIssue, target, scope),
    verification: verificationForCategory(category, target),
    verificationRequired: Boolean(verificationRequired || aggregate || !executable),
    execution: executable ? 'automatic_after_approval' : 'manual',
    task: executable ? task : '',
    reasonManual: executable
      ? ''
      : aggregate
        ? 'Аудит показує групову проблему без списку точних URL; масова зміна заблокована.'
        : siteId !== 'mercato'
          ? 'Для цього сайту ще не підключений write bridge.'
          : scope !== 'product'
            ? 'Автоматичний запис дозволений лише для підтвердженої товарної сторінки.'
            : 'Для цього типу проблеми потрібна технічна або редакторська робота, а не сліпий автозапис.'
  };
}

function seoDatePlusIso(baseDate = new Date(), days = 0) {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString();
}

function buildSeoWriteMonitoringPlan({ run = {}, approval = {}, results = [] } = {}) {
  const okResults = (results || []).filter(result => result.ok);
  const changedFields = [...new Set(okResults.map(result => result.task || result.field || result.category).filter(Boolean))];
  const targets = [...new Set(okResults.map(result => result.target).filter(Boolean))].slice(0, 50);
  const base = run.completedAt || new Date().toISOString();
  return {
    status: okResults.length ? 'scheduled' : 'not_scheduled',
    goal: 'перша сторінка Google → більше якісних переходів → add_to_cart / purchase',
    siteId: approval.siteId || run.siteId || 'mercato',
    targetCount: targets.length,
    targets,
    changedFields,
    baseline: 'Перед зміною зафіксовано source fingerprint; після зміни обовʼязкові readback і повторний аудит. Бізнес-ефект читаємо в GSC/GA4/Ads/OpenCart.',
    checkpoints: [
      {
        days: 7,
        at: seoDatePlusIso(base, 7),
        label: 'перший сигнал',
        checks: ['чи Google переіндексував URL', 'CTR/кліки без різкого падіння', 'чи немає readback/scan регресії']
      },
      {
        days: 14,
        at: seoDatePlusIso(base, 14),
        label: 'SEO/CRO рішення',
        checks: ['GSC position/CTR/clicks', 'GA4 sessions/engagement/add_to_cart/purchase', 'чи масштабувати, відкотити або запустити A/B тест']
      },
      {
        days: 28,
        at: seoDatePlusIso(base, 28),
        label: 'масштабування або rollback',
        checks: ['тренд позиції', 'органічні конверсії', 'Merchant/Ads landing-page quality', 'фінальне рішення по патерну']
      }
    ],
    decisionRules: SEO_AGENT_DECISION_RULES
  };
}

function normalizeAuditResult(siteId, mode, payload = {}, target = '') {
  const score = Number(
    payload.overall_score
    ?? payload.summary_score
    ?? payload.result?.summary_score
    ?? payload.result?.score
    ?? payload.score
    ?? 0
  );
  const categoryScores = payload.category_scores || payload.result?.category_scores || {};
  const issues = extractIssues(payload);
  const actionPlan = issues.slice(0, 12).map(issue => classifySeoAction({
    siteId,
    mode,
    target,
    issue,
    verificationRequired: /canonical mismatch|llms\.txt|author\/date|server-rendered content confirmation/i.test(issue)
  }));
  return {
    score,
    categoryScores,
    actionPlan,
    artifacts: payload.artifacts || {},
    outputDir: payload.output_dir || '',
    rawMode: mode
  };
}

class SeoCenterRuntime {
  constructor({ projectRoot, statePath } = {}) {
    this.projectRoot = path.resolve(projectRoot || process.cwd());
    this.statePath = statePath || path.join(this.projectRoot, 'seo-center-state.json');
    this.codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    this.skillsRoot = path.join(this.codexHome, 'skills');
    this.agentsRoot = path.join(this.codexHome, 'agents');
    this.seoRoot = path.join(this.skillsRoot, 'seo');
    this.python = process.env.CODEX_SEO_PYTHON || path.join(this.seoRoot, '.venv', 'bin', 'python');
    this.scriptsRoot = path.join(this.seoRoot, 'scripts');
    this.processes = new Map();
    this.initializeState();
  }

  readState() {
    const state = readJson(this.statePath, { version: 3, jobs: [], fixPreviews: [], approvals: [], writeRuns: [], controlPlans: {}, rollbacks: [], intelligenceReports: {} });
    return {
      version: 3,
      jobs: Array.isArray(state.jobs) ? state.jobs : [],
      fixPreviews: Array.isArray(state.fixPreviews) ? state.fixPreviews : [],
      approvals: Array.isArray(state.approvals) ? state.approvals : [],
      writeRuns: Array.isArray(state.writeRuns) ? state.writeRuns : [],
      controlPlans: state.controlPlans && typeof state.controlPlans === 'object' ? state.controlPlans : {},
      rollbacks: Array.isArray(state.rollbacks) ? state.rollbacks : [],
      intelligenceReports: state.intelligenceReports && typeof state.intelligenceReports === 'object' ? state.intelligenceReports : {}
    };
  }

  writeState(state) {
    writeJson(this.statePath, {
      version: 3,
      jobs: (state.jobs || []).slice(0, 40),
      fixPreviews: (state.fixPreviews || []).slice(0, 20),
      approvals: (state.approvals || []).slice(0, 20),
      writeRuns: (state.writeRuns || []).slice(0, 20),
      controlPlans: state.controlPlans || {},
      rollbacks: (state.rollbacks || []).slice(0, 20),
      intelligenceReports: state.intelligenceReports || {}
    });
  }

  initializeState() {
    const state = this.readState();
    let changed = false;
    const now = new Date().toISOString();

    state.jobs = state.jobs.map(job => {
      if (job.status !== 'running') return job;
      changed = true;
      return {
        ...job,
        status: 'failed',
        completedAt: now,
        error: 'Аудит перервано перезапуском сервера. Запустіть його повторно.'
      };
    });

    const knownSources = new Set(state.jobs.map(job => job.sourceSummary).filter(Boolean));
    this.discoverExistingAudits().forEach(job => {
      if (knownSources.has(job.sourceSummary)) return;
      state.jobs.push(job);
      knownSources.add(job.sourceSummary);
      changed = true;
    });

    state.jobs.sort((left, right) => {
      const leftTime = Date.parse(left.completedAt || left.startedAt || 0) || 0;
      const rightTime = Date.parse(right.completedAt || right.startedAt || 0) || 0;
      return rightTime - leftTime;
    });
    if (changed) this.writeState(state);
  }

  discoverExistingAudits() {
    const auditRoot = path.join(this.projectRoot, 'seo-system', 'audits');
    if (!fs.existsSync(auditRoot)) return [];
    const summaries = [];
    const walk = (directory, depth = 0) => {
      if (depth > 7 || summaries.length >= 50) return;
      let entries = [];
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
      } catch {
        return;
      }
      entries.forEach(entry => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(entryPath, depth + 1);
        else if (entry.name === 'SUMMARY.json') summaries.push(entryPath);
      });
    };
    walk(auditRoot);

    return summaries.flatMap(summaryPath => {
      const payload = readJson(summaryPath, null);
      if (!payload) return [];
      const rawTarget = payload.url
        || payload.target
        || payload.result?.url
        || (payload.domain ? `https://${payload.domain}` : '');
      let parsed;
      try {
        parsed = new URL(rawTarget);
      } catch {
        return [];
      }
      const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
      const profile = Object.values(SITE_PROFILES).find(item => item.host === host);
      if (!profile) return [];
      const mode = payload.overall_score != null ? 'full' : 'page';
      const completedAt = payload.analyzed_at
        || payload.result?.analyzed_at
        || fs.statSync(summaryPath).mtime.toISOString();
      const relativeSource = path.relative(this.projectRoot, summaryPath);
      return [{
        id: `import-${Buffer.from(relativeSource).toString('base64url').slice(-28)}`,
        siteId: profile.id,
        siteName: profile.name,
        mode,
        modeLabel: AUDIT_MODES[mode].label,
        target: parsed.toString(),
        status: 'completed',
        readOnly: true,
        startedAt: completedAt,
        completedAt,
        outputRoot: path.dirname(summaryPath),
        sourceSummary: relativeSource,
        imported: true,
        summary: normalizeAuditResult(profile.id, mode, payload, parsed.toString()),
        error: ''
      }];
    });
  }

  profiles() {
    return Object.values(SITE_PROFILES);
  }

  profile(siteId = 'mercato') {
    return SITE_PROFILES[siteId] || SITE_PROFILES.mercato;
  }

  installationStatus() {
    const skillPath = path.join(this.seoRoot, 'SKILL.md');
    const pythonCheck = fs.existsSync(this.python)
      ? spawnSync(this.python, ['--version'], { encoding: 'utf8', timeout: 5000 })
      : null;
    const chromiumCache = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
    return {
      installed: fs.existsSync(skillPath) && fs.existsSync(this.python),
      version: extractVersion(skillPath),
      skills: walkSkillCount(this.skillsRoot),
      agents: agentCount(this.agentsRoot),
      python: String(pythonCheck?.stdout || pythonCheck?.stderr || '').trim(),
      playwright: fs.existsSync(chromiumCache),
      coreReady: fs.existsSync(path.join(this.scriptsRoot, 'run_headless_audit.py')),
      visualReady: fs.existsSync(chromiumCache),
      pdfReady: false,
      notes: [
        'Аудити працюють read-only.',
        'PDF не є обовʼязковим для SEO Center.',
        'SEO-зміни виконуються лише через fix preview, явне approval, database readback і повторний аудит.'
      ]
    };
  }

  googleStatus() {
    const script = path.join(this.scriptsRoot, 'google_auth.py');
    if (!fs.existsSync(this.python) || !fs.existsSync(script)) {
      return { tier: -1, configured: false, description: 'Codex SEO Google runtime не знайдено.' };
    }
    const env = {
      ...process.env,
      GSC_PROPERTY: process.env.GSC_PROPERTY || process.env.GSC_SITE_URL || '',
      GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || ''
    };
    const result = spawnSync(this.python, [script, '--check', '--json'], {
      encoding: 'utf8',
      timeout: 12000,
      env
    });
    const parsed = parseLastJsonObject(`${result.stdout || ''}\n${result.stderr || ''}`) || {};
    const tier = Number(parsed.tier?.tier ?? -1);
    const services = parsed.services || {};
    const tokenScope = (() => {
      const tokenPath = path.join(os.homedir(), '.config', 'codex-seo', 'oauth-token.json');
      try {
        const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        return String(token.scope || '');
      } catch {
        return '';
      }
    })();
    const normalizedServices = { ...services };
    if (normalizedServices.indexing?.available && !tokenScope.includes('https://www.googleapis.com/auth/indexing')) {
      normalizedServices.indexing = {
        ...normalizedServices.indexing,
        available: false,
        error: 'OAuth token не має Indexing API scope. Для Mercato це не критично: Indexing API офіційно не є загальним submit-інструментом для товарів.'
      };
    }
    const isAvailable = service => Boolean(normalizedServices[service]?.available);
    const coreConfigured = isAvailable('gsc') && isAvailable('ga4');
    const performanceConfigured = isAvailable('psi') && isAvailable('crux');
    const configured = coreConfigured || Object.values(normalizedServices).some(service => service?.available);
    const actualCapabilities = [
      isAvailable('psi') ? 'PageSpeed Insights' : null,
      isAvailable('crux') ? 'CrUX' : null,
      isAvailable('crux_history') ? 'CrUX History' : null,
      isAvailable('gsc') ? 'Search Console' : null,
      isAvailable('ga4') ? 'GA4 Organic Traffic' : null,
      isAvailable('indexing') ? 'Indexing API' : null
    ].filter(Boolean);
    let description = parsed.tier?.description || (tier >= 0 ? 'Google API готові.' : 'Google API ще не підключені.');
    if (coreConfigured && !performanceConfigured) {
      description = 'GSC і GA4 підключені. PageSpeed/CrUX ще потребують GOOGLE_API_KEY.';
    } else if (coreConfigured && performanceConfigured) {
      description = 'GSC, GA4 і PageSpeed/CrUX підключені.';
    } else if (configured) {
      description = 'Google API підключені частково.';
    }
    return {
      tier,
      configured,
      coreConfigured,
      performanceConfigured,
      description,
      capabilities: actualCapabilities,
      services: normalizedServices
    };
  }

  googleDataStatus() {
    const cache = readJson(path.join(this.projectRoot, '.seo-cache', 'google-data-status.json'), null);
    const runtimeDir = path.join(this.projectRoot, 'seo-system', 'audits', 'runtime');
    let latestSnapshot = null;
    let latestSnapshotFile = '';
    try {
      latestSnapshotFile = fs.readdirSync(runtimeDir)
        .filter(fileName => /^google-data-snapshot-.+\.json$/.test(fileName))
        .sort()
        .pop() || '';
      if (latestSnapshotFile) {
        latestSnapshot = readJson(path.join(runtimeDir, latestSnapshotFile), null);
      }
    } catch {}
    return {
      cache,
      snapshot: latestSnapshot,
      snapshotFile: latestSnapshotFile,
      available: Boolean(cache || latestSnapshot)
    };
  }

  officialSources() {
    return OFFICIAL_SEO_SOURCES.map(source => ({ ...source }));
  }

  async fetchOfficialSource(source, previousHash = '') {
    const checkedAt = new Date().toISOString();
    try {
      const response = await nodeFetch(source.url, {
        timeout: 12000,
        headers: {
          'user-agent': 'MercatoAI-SEO-DocWatcher/1.0 (+https://mercato.com.ua)'
        }
      });
      const status = Number(response.status || 0);
      const html = await response.text();
      const plain = stripTags(html).slice(0, 240000);
      const hash = contentHash(plain);
      const ok = status >= 200 && status < 400 && plain.length > 200;
      return {
        ...source,
        ok,
        status: ok ? 'ok' : 'http_error',
        statusCode: status,
        statusText: ok ? 'Офіційне джерело прочитано.' : `HTTP ${status || 'unknown'}`,
        checkedAt,
        fetchedTitle: titleFromHtml(html, source.title),
        lastUpdated: lastUpdatedFromText(plain),
        contentHash: hash,
        keywordHits: sourceKeywordHits(plain, source.watchTerms),
        changedSinceLastCheck: Boolean(previousHash && previousHash !== hash)
      };
    } catch (error) {
      return {
        ...fallbackOfficialSource(source),
        checkedAt,
        status: 'fetch_failed',
        statusText: `Live fetch не вдався: ${cleanIssueText(error.message || String(error))}`
      };
    }
  }

  intelligenceReport(siteId = 'mercato') {
    const profile = this.profile(siteId);
    const state = this.readState();
    return state.intelligenceReports[profile.id] || buildIntelligenceReport({ siteId: profile.id, liveDocs: false });
  }

  async refreshIntelligence({ siteId = 'mercato', fetchDocs = true } = {}) {
    const profile = this.profile(siteId);
    const state = this.readState();
    const previousReport = state.intelligenceReports[profile.id] || null;
    const previousHashes = new Map((previousReport?.sources || []).map(source => [source.id, source.contentHash || '']));
    const sourceSnapshots = fetchDocs
      ? await Promise.all(OFFICIAL_SEO_SOURCES.map(source => this.fetchOfficialSource(source, previousHashes.get(source.id) || '')))
      : OFFICIAL_SEO_SOURCES.map(source => fallbackOfficialSource(source));
    const report = buildIntelligenceReport({
      siteId: profile.id,
      sourceSnapshots,
      previousReport,
      liveDocs: Boolean(fetchDocs)
    });
    state.intelligenceReports[profile.id] = report;
    this.writeState(state);
    return report;
  }

  validateTarget(siteId, target) {
    const profile = this.profile(siteId);
    const parsed = new URL(String(target || profile.url).trim());
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Дозволені тільки http/https URL.');
    if (host !== profile.host) throw new Error(`SEO Center дозволяє тільки ${profile.host} для цього профілю.`);
    parsed.hash = '';
    return parsed.toString();
  }

  commandFor({ mode, target, outputRoot }) {
    const definition = AUDIT_MODES[mode];
    if (!definition) throw new Error('Невідомий тип SEO-аудиту.');
    if (definition.runner === 'audit') {
      return {
        script: path.join(this.scriptsRoot, 'run_headless_audit.py'),
        args: [
          target,
          '--timeout', '30',
          '--premium-report', 'never',
          '--data-only',
          '--output-root', outputRoot,
          '--json'
        ]
      };
    }
    return {
      script: path.join(this.scriptsRoot, 'run_skill_workflow.py'),
      args: [
        '--skill', definition.skill,
        target,
        '--output-root', outputRoot,
        '--json'
      ]
    };
  }

  startAudit({ siteId = 'mercato', mode = 'full', target = '' } = {}) {
    if (!fs.existsSync(this.python)) throw new Error('Codex SEO Python runtime не знайдено.');
    const state = this.readState();
    const active = state.jobs.find(job => job.status === 'running');
    if (active) {
      const error = new Error(`Аудит уже виконується: ${active.siteName} · ${active.modeLabel}`);
      error.status = 409;
      error.job = active;
      throw error;
    }
    const profile = this.profile(siteId);
    const definition = AUDIT_MODES[mode] || AUDIT_MODES.full;
    const safeTarget = this.validateTarget(profile.id, target || profile.url);
    const id = `seo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const outputRoot = path.join(this.projectRoot, 'seo-system', 'audits', 'runtime', id);
    fs.mkdirSync(outputRoot, { recursive: true });
    const command = this.commandFor({ mode: definition.id, target: safeTarget, outputRoot });
    const job = {
      id,
      siteId: profile.id,
      siteName: profile.name,
      mode: definition.id,
      modeLabel: definition.label,
      target: safeTarget,
      status: 'running',
      readOnly: true,
      startedAt: new Date().toISOString(),
      completedAt: '',
      outputRoot,
      summary: null,
      error: ''
    };
    state.jobs.unshift(job);
    this.writeState(state);

    const child = spawn(this.python, [command.script, ...command.args], {
      cwd: this.projectRoot,
      env: {
        ...process.env,
        GSC_PROPERTY: process.env.GSC_PROPERTY || process.env.GSC_SITE_URL || '',
        MPLCONFIGDIR: path.join(this.projectRoot, '.seo-matplotlib-cache'),
        PYTHONUNBUFFERED: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.processes.set(id, child);
    let stdout = '';
    let stderr = '';
    const append = (current, chunk) => `${current}${String(chunk || '')}`.slice(-700000);
    child.stdout.on('data', chunk => { stdout = append(stdout, chunk); });
    child.stderr.on('data', chunk => { stderr = append(stderr, chunk); });
    child.on('error', error => this.finishJob(id, { error: error.message, stdout, stderr }));
    child.on('close', code => {
      if (!this.processes.has(id)) return;
      if (code === 0) this.finishJob(id, { payload: parseLastJsonObject(stdout), stdout, stderr });
      else this.finishJob(id, { error: cleanIssueText(stderr || stdout || `Codex SEO завершився з кодом ${code}`), stdout, stderr });
    });
    return job;
  }

  finishJob(id, { payload = null, error = '', stdout = '', stderr = '' } = {}) {
    this.processes.delete(id);
    const state = this.readState();
    const index = state.jobs.findIndex(job => job.id === id);
    if (index < 0) return;
    const job = state.jobs[index];
    const summary = payload ? normalizeAuditResult(job.siteId, job.mode, payload, job.target) : null;
    state.jobs[index] = {
      ...job,
      status: error || !payload ? 'failed' : 'completed',
      completedAt: new Date().toISOString(),
      summary,
      error: error || (!payload ? 'Codex SEO не повернув валідний JSON результат.' : ''),
      stdoutTail: String(stdout || '').slice(-3000),
      stderrTail: String(stderr || '').slice(-3000)
    };
    this.writeState(state);
  }

  job(id) {
    return this.readState().jobs.find(job => job.id === id) || null;
  }

  jobsForSite(siteId, limit = 12) {
    return this.readState().jobs.filter(job => job.siteId === siteId).slice(0, limit);
  }

  saveControlPlan({ siteId = 'mercato', plan = {} } = {}) {
    const state = this.readState();
    state.controlPlans[siteId] = {
      ...plan,
      savedAt: new Date().toISOString()
    };
    state.fixPreviews = state.fixPreviews.map(preview =>
      preview.siteId === siteId && ['pending_approval', 'approved'].includes(preview.status)
        ? { ...preview, status: 'superseded_by_control_scan' }
        : preview
    );
    state.approvals = state.approvals.map(approval =>
      approval.siteId === siteId && approval.status === 'approved'
        ? { ...approval, status: 'superseded_by_control_scan' }
        : approval
    );
    this.writeState(state);
    return state.controlPlans[siteId];
  }

  controlPlan(siteId = 'mercato') {
    return this.readState().controlPlans[siteId] || null;
  }

  postWriteQuality(siteId = 'mercato') {
    const state = this.readState();
    const controlPlan = state.controlPlans[siteId] || null;
    const writeRuns = state.writeRuns.filter(item => item.siteId === siteId).slice(0, 8);
    return buildSeoPostWriteQualityReport({ writeRuns, controlPlan });
  }

  recoveryMode(siteId = 'mercato') {
    const state = this.readState();
    const controlPlan = state.controlPlans[siteId] || null;
    const writeRuns = state.writeRuns.filter(item => item.siteId === siteId).slice(0, 8);
    const fixPreview = state.fixPreviews.find(item => item.siteId === siteId && ['pending_approval', 'approved', 'applying'].includes(item.status)) || null;
    const postWriteQuality = buildSeoPostWriteQualityReport({ writeRuns, controlPlan });
    return buildSeoRecoveryMode({ postWriteQuality, fixPreview });
  }

  fixQueue(siteId = 'mercato') {
    const state = this.readState();
    const controlPlan = state.controlPlans[siteId];
    if (controlPlan) {
      const planTimestamp = Date.parse(controlPlan.savedAt || controlPlan.generatedAt || 0) || 0;
      const completedActionMeta = completedSeoActionMeta(state, siteId);
      const itemWithStatus = item => {
        const base = {
          ...item,
          siteId,
          stableActionKey: item.stableActionKey || primarySeoStableKey({ ...item, siteId })
        };
        const completed = completedMetaForSeoItem(completedActionMeta, base, siteId);
        if (!completed) return { ...base, status: 'open' };
        const rescannedAfterWrite = planTimestamp > completed.runTimestamp + 1000;
        return {
          ...base,
          status: rescannedAfterWrite ? 'verification_review' : 'verification_pending',
          lastWriteRunId: completed.runId,
          lastWriteCompletedAt: completed.completedAt,
          verificationState: rescannedAfterWrite ? 'still_reported_after_rescan' : 'pending_readback',
          reopenedAfterVerification: false,
          needsDetectorReview: rescannedAfterWrite || undefined
        };
      };
      const proposals = (controlPlan.proposals || []).map(itemWithStatus);
      const tasks = (controlPlan.tasks || []).map(itemWithStatus);
      const knownIds = new Set([...proposals, ...tasks].map(item => item.id));
      const knownKeys = new Set([...proposals, ...tasks].flatMap(item => seoStableKeyVariants({ ...item, siteId })));
      const latestByTargetMode = new Map();
      state.jobs
        .filter(job => job.siteId === siteId && job.status === 'completed' && job.summary)
        .forEach(job => {
          const key = `${job.mode}|${String(job.target || '').replace(/\/+$/, '')}`;
          if (!latestByTargetMode.has(key)) latestByTargetMode.set(key, job);
        });
      latestByTargetMode.forEach(job => {
        (job.summary?.actionPlan || []).forEach(rawAction => {
          const action = classifySeoAction({
            siteId,
            mode: job.mode,
            target: job.target,
            issue: rawAction.issue,
            priority: rawAction.priority,
            impact: rawAction.impact,
            verificationRequired: rawAction.verificationRequired
          });
          const actionKeys = seoStableKeyVariants({ ...action, siteId });
          if (knownIds.has(action.id) || actionKeys.some(key => knownKeys.has(key)) || action.execution === 'automatic_after_approval') return;
          knownIds.add(action.id);
          actionKeys.forEach(key => knownKeys.add(key));
          tasks.push(itemWithStatus({
            ...action,
            execution: ['content', 'internal_links'].includes(action.category)
              ? 'editor_after_evidence'
              : ['technical', 'performance', 'indexation', 'schema', 'geo'].includes(action.category)
                ? 'code_patch_after_approval'
                : action.execution,
            auditJobId: job.id,
            auditCompletedAt: job.completedAt,
            status: 'open'
          }));
        });
      });
      return {
        generatedAt: controlPlan.generatedAt,
        source: controlPlan.source,
        inventorySummary: controlPlan.inventorySummary,
        agents: controlPlan.agents || [],
        items: [...proposals, ...tasks].slice(0, 200),
        proposals,
        tasks,
        summary: {
          total: proposals.length + tasks.length,
          executable: proposals.filter(item => item.execution === 'automatic_after_approval' && item.status === 'open').length,
          manual: tasks.filter(item => item.status === 'open').length,
          verificationPending: [...proposals, ...tasks].filter(item => ['verification_pending', 'verification_review'].includes(item.status)).length,
          critical: [...proposals, ...tasks].filter(item => item.priority === 'critical').length,
          important: [...proposals, ...tasks].filter(item => item.priority === 'important').length,
          byExecutor: controlPlan.summary?.byExecutor || {}
        }
      };
    }
    const latestByTargetMode = new Map();
    state.jobs
      .filter(job => job.siteId === siteId && job.status === 'completed' && job.summary)
      .forEach(job => {
        const key = `${job.mode}|${String(job.target || '').replace(/\/+$/, '')}`;
        if (!latestByTargetMode.has(key)) latestByTargetMode.set(key, job);
      });
    const completedActionMeta = completedSeoActionMeta(state, siteId);
    const seen = new Set();
    const items = [];
    latestByTargetMode.forEach(job => {
      (job.summary?.actionPlan || []).forEach(rawAction => {
        const action = classifySeoAction({
          siteId,
          mode: job.mode,
          target: job.target,
          issue: rawAction.issue,
          priority: rawAction.priority,
          impact: rawAction.impact,
          verificationRequired: rawAction.verificationRequired
        });
        if (seen.has(action.id)) return;
        seen.add(action.id);
        const completed = completedMetaForSeoItem(completedActionMeta, action, siteId);
        const auditTimestamp = Date.parse(job.completedAt || job.startedAt || 0) || 0;
        const rescannedAfterWrite = Boolean(completed && auditTimestamp > completed.runTimestamp + 1000);
        items.push({
          ...action,
          stableActionKey: action.stableActionKey || primarySeoStableKey({ ...action, siteId }),
          auditJobId: job.id,
          auditCompletedAt: job.completedAt,
          status: completed ? (rescannedAfterWrite ? 'verification_review' : 'verification_pending') : 'open',
          lastWriteRunId: completed?.runId,
          lastWriteCompletedAt: completed?.completedAt,
          verificationState: completed
            ? rescannedAfterWrite ? 'still_reported_after_rescan' : 'pending_readback'
            : undefined,
          reopenedAfterVerification: false,
          needsDetectorReview: rescannedAfterWrite || undefined
        });
      });
    });
    const priorityOrder = { critical: 0, important: 1, later: 2 };
    items.sort((left, right) =>
      (priorityOrder[left.priority] ?? 9) - (priorityOrder[right.priority] ?? 9)
      || (left.execution === right.execution ? 0 : left.execution === 'automatic_after_approval' ? -1 : 1)
      || (Date.parse(right.auditCompletedAt || 0) || 0) - (Date.parse(left.auditCompletedAt || 0) || 0)
    );
    return {
      generatedAt: new Date().toISOString(),
      items: items.slice(0, 200),
      summary: {
        total: items.length,
        executable: items.filter(item => item.execution === 'automatic_after_approval' && item.status === 'open').length,
        manual: items.filter(item => item.execution === 'manual' && item.status === 'open').length,
        verificationPending: items.filter(item => ['verification_pending', 'verification_review'].includes(item.status)).length,
        critical: items.filter(item => item.priority === 'critical').length,
        important: items.filter(item => item.priority === 'important').length
      }
    };
  }

  selectFixActions({
    siteId = 'mercato',
    actionIds = [],
    limit = SEO_BATCH_LIMITS.maxChanges,
    entityLimit = SEO_BATCH_LIMITS.defaultEntities
  } = {}) {
    const requested = new Set((actionIds || []).map(String).filter(Boolean));
    const queue = this.fixQueue(siteId);
    const maxChanges = Math.max(1, Math.min(Number(limit || SEO_BATCH_LIMITS.maxChanges), SEO_BATCH_LIMITS.maxChanges));
    const maxEntities = Math.max(1, Math.min(Number(entityLimit || SEO_BATCH_LIMITS.defaultEntities), SEO_BATCH_LIMITS.maxEntities));
    const candidates = (queue.proposals || queue.items).filter(item =>
      item.execution === 'automatic_after_approval'
      && item.status === 'open'
      && (!requested.size || requested.has(item.id))
    );
    const selected = [];
    const entityKeys = new Set();
    for (const item of candidates) {
      const entityKey = item.entityType && item.entityId
        ? `${item.entityType}:${item.entityId}`
        : item.executor === 'file_patch'
          ? `file:${item.file || item.target}`
          : `target:${item.target || item.id}`;
      if (!entityKeys.has(entityKey) && entityKeys.size >= maxEntities) continue;
      entityKeys.add(entityKey);
      selected.push(item);
      if (selected.length >= maxChanges) break;
    }
    if (!selected.length) {
      const error = new Error('Немає точних автоматичних SEO-правок. Запустіть page/schema аудит конкретної товарної сторінки або виконайте ручні технічні задачі.');
      error.status = 400;
      throw error;
    }
    return selected;
  }

  action(siteId = 'mercato', actionId = '') {
    const queue = this.fixQueue(siteId);
    return [
      ...(queue.proposals || []),
      ...(queue.tasks || []),
      ...(queue.items || [])
    ].find(item => item.id === actionId) || null;
  }

  createFixPreview({ siteId = 'mercato', actions = [], changes = [] } = {}) {
    if (!actions.length || !changes.length || actions.length !== changes.length) {
      throw new Error('SEO preview потребує однакової кількості перевірених actions і changes.');
    }
    if (changes.length > SEO_BATCH_LIMITS.maxChanges) {
      throw new Error(`Один SEO approval може містити максимум ${SEO_BATCH_LIMITS.maxChanges} змін.`);
    }
    const state = this.readState();
    const createdAt = new Date().toISOString();
    const entityKeys = new Set(changes.map(change =>
      change.entityType && change.entityId
        ? `${change.entityType}:${change.entityId}`
        : change.executor === 'file_patch'
        ? `file:${change.file || change.target}`
        : `target:${change.target || change.actionId}`
    ));
    if (entityKeys.size > SEO_BATCH_LIMITS.maxEntities) {
      throw new Error(`Один SEO approval може містити максимум ${SEO_BATCH_LIMITS.maxEntities} сторінок або файлів.`);
    }
    const normalizedActions = actions.map(action => ({
      ...action,
      siteId,
      stableActionKey: action.stableActionKey || primarySeoStableKey({ ...action, siteId }),
      sourceActionId: action.sourceActionId || action.originalActionId || action.id || ''
    }));
    const normalizedChanges = changes.map((change, index) => {
      const sourceAction = normalizedActions[index] || {};
      const normalizedChange = {
        ...change,
        siteId,
        sourceActionId: change.sourceActionId || sourceAction.sourceActionId || sourceAction.id || '',
        stableActionKey: change.stableActionKey || sourceAction.stableActionKey || primarySeoStableKey({
          ...sourceAction,
          ...change,
          siteId
        })
      };
      return {
        ...normalizedChange,
        changeKey: change.changeKey || this.previewChangeKey(normalizedChange, index)
      };
    });
    const postWriteQuality = buildSeoPostWriteQualityReport({
      writeRuns: state.writeRuns.filter(item => item.siteId === siteId).slice(0, 8),
      controlPlan: state.controlPlans[siteId] || null
    });
    const activePreview = state.fixPreviews.find(item => item.siteId === siteId && ['pending_approval', 'approved', 'applying'].includes(item.status)) || null;
    const recoveryMode = buildSeoRecoveryMode({ postWriteQuality, fixPreview: activePreview });
    if (recoveryMode.locked && !isSeoRepairPreviewPayload(normalizedActions, normalizedChanges)) {
      const error = new Error(recoveryMode.reason);
      error.status = 423;
      error.recoveryMode = recoveryMode;
      throw error;
    }
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(
      normalizedChanges.map(change => ({
        actionId: change.actionId,
        sourceActionId: change.sourceActionId,
        stableActionKey: change.stableActionKey,
        target: change.target,
        task: change.task,
        before: change.before,
        after: change.after,
        sourceFingerprint: change.sourceFingerprint
      }))
    )).digest('hex');
    const preview = {
      id: `seo-preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      siteId,
      status: 'pending_approval',
      createdAt,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      fingerprint,
      actionCount: actions.length,
      entityCount: entityKeys.size,
      executionChunkSize: SEO_BATCH_LIMITS.executionChunkSize,
      actions: normalizedActions.map(action => ({
        id: action.id,
        sourceActionId: action.sourceActionId || '',
        stableActionKey: action.stableActionKey || '',
        agent: action.agent,
        category: action.category || '',
        executor: action.executor || '',
        issue: action.issue,
        target: action.target,
        field: action.field || '',
        task: action.task,
        verification: action.verification || '',
        auditJobId: action.auditJobId
      })),
      changes: normalizedChanges
    };
    state.fixPreviews.unshift(preview);
    this.writeState(state);
    return preview;
  }

  previewChangeKey(change = {}, index = 0) {
    return crypto.createHash('sha256').update(JSON.stringify({
      index,
      actionId: change.actionId || '',
      sourceActionId: change.sourceActionId || '',
      stableActionKey: change.stableActionKey || '',
      target: change.target || '',
      entityType: change.entityType || '',
      entityId: change.entityId || '',
      file: change.file || '',
      executor: change.executor || '',
      field: change.field || '',
      task: change.task || '',
      category: change.category || '',
      sourceFingerprint: change.sourceFingerprint || '',
      before: change.before,
      after: change.after
    })).digest('hex').slice(0, 24);
  }

  fixPreviewFingerprint(changes = []) {
    return crypto.createHash('sha256').update(JSON.stringify(
      changes.map(change => ({
        actionId: change.actionId,
        sourceActionId: change.sourceActionId,
        stableActionKey: change.stableActionKey,
        target: change.target,
        task: change.task,
        before: change.before,
        after: change.after,
        sourceFingerprint: change.sourceFingerprint
      }))
    )).digest('hex');
  }

  removeFixPreviewChanges({ previewId = '', changeKeys = [], removedBy = 'owner-ui' } = {}) {
    const keys = new Set((changeKeys || []).map(String).filter(Boolean));
    if (!keys.size) throw new Error('Не вибрано жодної SEO-зміни для видалення.');
    const state = this.readState();
    const preview = state.fixPreviews.find(item => item.id === previewId);
    if (!preview) throw new Error('SEO preview не знайдено.');
    if (preview.status !== 'pending_approval') {
      throw new Error('Видаляти окремі зміни можна тільки до approval.');
    }
    const removedAt = new Date().toISOString();
    const changes = Array.isArray(preview.changes) ? preview.changes : [];
    const removed = [];
    const kept = [];
    changes.forEach((change, index) => {
      const key = change.changeKey || this.previewChangeKey(change, index);
      const fallbackKey = [
        change.sourceActionId || change.actionId || change.stableActionKey || '',
        change.target || change.file || `${change.entityType || ''}:${change.entityId || ''}`,
        change.field || change.task || change.category || '',
        index
      ].map(value => String(value || '')).join('|');
      const normalizedChange = { ...change, changeKey: key };
      if (keys.has(key) || keys.has(fallbackKey)) removed.push(normalizedChange);
      else kept.push(normalizedChange);
    });
    if (!removed.length) throw new Error('Вибрані зміни не знайдені у поточному preview.');
    preview.removedChanges = [
      ...(Array.isArray(preview.removedChanges) ? preview.removedChanges : []),
      ...removed.map(change => ({
        ...change,
        removedAt,
        removedBy
      }))
    ].slice(-200);
    if (!kept.length) {
      preview.status = 'rejected';
      preview.rejectedBy = removedBy;
      preview.rejectedAt = removedAt;
      preview.rejectionReason = 'Усі зміни вилучено власником до approval.';
      preview.actions = [];
      preview.changes = [];
      preview.actionCount = 0;
      preview.entityCount = 0;
      preview.updatedAt = removedAt;
      this.writeState(state);
      return { preview, removed, removedCount: removed.length };
    }
    const keptSourceActionIds = new Set(kept.map(change => String(change.sourceActionId || change.actionId || '')).filter(Boolean));
    const keptStableKeys = new Set(kept.map(change => String(change.stableActionKey || '')).filter(Boolean));
    preview.actions = (Array.isArray(preview.actions) ? preview.actions : []).filter(action => {
      const sourceId = String(action.sourceActionId || action.id || '');
      const stableKey = String(action.stableActionKey || '');
      return keptSourceActionIds.has(sourceId) || keptStableKeys.has(stableKey);
    });
    const entityKeys = new Set(kept.map(change =>
      change.entityType && change.entityId
        ? `${change.entityType}:${change.entityId}`
        : change.executor === 'file_patch'
          ? `file:${change.file || change.target}`
          : `target:${change.target || change.actionId}`
    ));
    preview.changes = kept;
    preview.actionCount = kept.length;
    preview.entityCount = entityKeys.size;
    preview.fingerprint = this.fixPreviewFingerprint(kept);
    preview.updatedAt = removedAt;
    this.writeState(state);
    return { preview, removed, removedCount: removed.length };
  }

  approveFixPreview({ previewId = '', confirmedBy = 'owner-ui' } = {}) {
    const state = this.readState();
    const preview = state.fixPreviews.find(item => item.id === previewId);
    if (!preview) throw new Error('SEO preview не знайдено.');
    if (preview.status !== 'pending_approval') throw new Error('SEO preview вже оброблено або недійсний.');
    if (Date.parse(preview.expiresAt || 0) <= Date.now()) throw new Error('SEO preview прострочений. Створіть новий.');
    const postWriteQuality = buildSeoPostWriteQualityReport({
      writeRuns: state.writeRuns.filter(item => item.siteId === preview.siteId).slice(0, 8),
      controlPlan: state.controlPlans[preview.siteId] || null
    });
    const recoveryMode = buildSeoRecoveryMode({ postWriteQuality, fixPreview: preview });
    if (recoveryMode.locked && !isSeoRepairPreviewPayload(preview.actions || [], preview.changes || [])) {
      const error = new Error(recoveryMode.reason);
      error.status = 423;
      error.recoveryMode = recoveryMode;
      throw error;
    }
    const approval = {
      id: `seo-approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      siteId: preview.siteId,
      previewId: preview.id,
      fingerprint: preview.fingerprint,
      status: 'approved',
      confirmedBy,
      confirmedAt: new Date().toISOString(),
      actionCount: preview.actionCount,
      entityCount: preview.entityCount || preview.actionCount
    };
    preview.status = 'approved';
    preview.approvalId = approval.id;
    state.approvals.unshift(approval);
    this.writeState(state);
    return approval;
  }

  rejectFixPreview({ previewId = '', rejectedBy = 'owner-ui', reason = '' } = {}) {
    const state = this.readState();
    const preview = state.fixPreviews.find(item => item.id === previewId);
    if (!preview) throw new Error('SEO preview не знайдено.');
    if (!['pending_approval', 'approved'].includes(preview.status)) {
      throw new Error('SEO preview вже оброблено або недійсний.');
    }
    preview.status = 'rejected';
    preview.rejectedBy = rejectedBy;
    preview.rejectedAt = new Date().toISOString();
    preview.rejectionReason = reason || 'Відхилено власником до live-запису.';
    if (preview.approvalId) {
      const approval = state.approvals.find(item => item.id === preview.approvalId);
      if (approval && approval.status === 'approved') {
        approval.status = 'rejected';
        approval.rejectedAt = preview.rejectedAt;
        approval.rejectionReason = preview.rejectionReason;
      }
    }
    this.writeState(state);
    return preview;
  }

  claimApproval(approvalId = '') {
    const state = this.readState();
    const approval = state.approvals.find(item => item.id === approvalId);
    if (!approval) throw new Error('SEO approval не знайдено.');
    if (approval.status !== 'approved') throw new Error('SEO approval вже використано або недійсний.');
    const preview = state.fixPreviews.find(item => item.id === approval.previewId);
    if (!preview || preview.fingerprint !== approval.fingerprint || preview.status !== 'approved') {
      throw new Error('SEO preview змінився після погодження.');
    }
    const postWriteQuality = buildSeoPostWriteQualityReport({
      writeRuns: state.writeRuns.filter(item => item.siteId === approval.siteId).slice(0, 8),
      controlPlan: state.controlPlans[approval.siteId] || null
    });
    const recoveryMode = buildSeoRecoveryMode({ postWriteQuality, fixPreview: preview });
    if (recoveryMode.locked && !isSeoRepairPreviewPayload(preview.actions || [], preview.changes || [])) {
      const error = new Error(recoveryMode.reason);
      error.status = 423;
      error.recoveryMode = recoveryMode;
      throw error;
    }
    approval.status = 'applying';
    approval.startedAt = new Date().toISOString();
    preview.status = 'applying';
    this.writeState(state);
    return { approval: { ...approval }, preview: { ...preview } };
  }

  completeWriteRun({ approvalId = '', results = [], error = '', execution = {} } = {}) {
    const state = this.readState();
    const approval = state.approvals.find(item => item.id === approvalId);
    if (!approval) throw new Error('SEO approval не знайдено для завершення.');
    const preview = state.fixPreviews.find(item => item.id === approval.previewId);
    const normalizedResults = results.map(result => ({
      ...result,
      siteId: approval.siteId,
      stableActionKey: result.stableActionKey || primarySeoStableKey({ ...result, siteId: approval.siteId }),
      sourceActionId: result.sourceActionId || result.source_action_id || ''
    }));
    const okCount = normalizedResults.filter(result => result.ok).length;
    const run = {
      id: `seo-write-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      siteId: approval.siteId,
      approvalId,
      previewId: approval.previewId,
      startedAt: approval.startedAt || new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: error || okCount !== results.length ? 'partial_or_failed' : 'completed',
      okCount,
      failedCount: Math.max(0, normalizedResults.length - okCount),
      results: normalizedResults,
      execution,
      monitoring: null,
      error: error || ''
    };
    run.monitoring = buildSeoWriteMonitoringPlan({ run, approval, results: normalizedResults });
    approval.status = 'used';
    approval.completedAt = run.completedAt;
    if (preview) {
      preview.status = run.status;
      preview.writeRunId = run.id;
    }
    state.writeRuns.unshift(run);
    this.writeState(state);
    return run;
  }

  recordRollback({ siteId = 'mercato', writeRunId = '', changeId = '', result = null, error = '' } = {}) {
    const state = this.readState();
    const rollback = {
      id: `seo-rollback-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      siteId,
      writeRunId,
      changeId,
      completedAt: new Date().toISOString(),
      status: error ? 'failed' : 'completed',
      result,
      error
    };
    state.rollbacks.unshift(rollback);
    this.writeState(state);
    return rollback;
  }

  weeklyPlan(siteId = 'mercato') {
    const profile = this.profile(siteId);
    const jobs = this.jobsForSite(profile.id, 40);
    return profile.weeklyChecks.map(check => {
      const last = jobs.find(job => job.status === 'completed' && job.mode === check.mode && job.target.replace(/\/$/, '') === check.target.replace(/\/$/, ''));
      const ageDays = last?.completedAt ? Math.floor((Date.now() - Date.parse(last.completedAt)) / 86400000) : null;
      return {
        ...check,
        lastRunAt: last?.completedAt || '',
        score: last?.summary?.score || 0,
        due: ageDays === null || ageDays >= 7,
        ageDays
      };
    });
  }

  dashboard(siteId = 'mercato') {
    const profile = this.profile(siteId);
    const jobs = this.jobsForSite(profile.id);
    const state = this.readState();
    const fixQueue = this.fixQueue(profile.id);
    const latest = jobs.find(job => job.status === 'completed') || null;
    const activeJob = state.jobs.find(job => job.status === 'running') || null;
    const googleDataStatus = this.googleDataStatus();
    const controlPlan = state.controlPlans[profile.id] || null;
    const writeRuns = state.writeRuns.filter(item => item.siteId === profile.id).slice(0, 8);
    const fixPreview = state.fixPreviews.find(item => item.siteId === profile.id && ['pending_approval', 'approved', 'applying'].includes(item.status)) || null;
    const postWriteQuality = buildSeoPostWriteQualityReport({ writeRuns, controlPlan });
    const seoRecoveryMode = buildSeoRecoveryMode({ postWriteQuality, fixPreview });
    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      installation: this.installationStatus(),
      google: this.googleStatus(),
      googleDataStatus,
      profiles: this.profiles(),
      profile,
      auditModes: Object.values(AUDIT_MODES).filter(mode => mode.id !== 'weekly'),
      jobs,
      activeJob,
      latest,
      rankingGoals: buildRankingGoals({ profile, googleDataStatus, latest, controlPlan, jobs, activeJob, fixQueue }),
      intelligence: this.intelligenceReport(profile.id),
      weeklyPlan: this.weeklyPlan(profile.id),
      fixQueue,
      fixPreview,
      approvals: state.approvals.filter(item => item.siteId === profile.id).slice(0, 8),
      writeRuns,
      postWriteQuality,
      seoRecoveryMode,
      specialistAgents: buildSeoSpecialistAgents({ recoveryMode: seoRecoveryMode, postWriteQuality, fixQueue, controlPlan, fixPreview }),
      rollbacks: state.rollbacks.filter(item => item.siteId === profile.id).slice(0, 8),
      controlPlan,
      safety: {
        auditReadOnly: true,
        liveChanges: `SEO control plane: inventory → typed patch → approval до ${SEO_BATCH_LIMITS.maxEntities} сторінок / ${SEO_BATCH_LIMITS.maxChanges} змін → chunked execution → backup/readback → re-audit або rollback.`,
        confirmationPhrase: 'APPLY_SEO_CHANGES',
        rollbackPhrase: 'ROLLBACK_SEO_CHANGE',
        defaultEntitiesPerApproval: SEO_BATCH_LIMITS.defaultEntities,
        maxEntitiesPerApproval: SEO_BATCH_LIMITS.maxEntities,
        maxChangesPerApproval: SEO_BATCH_LIMITS.maxChanges,
        executionChunkSize: SEO_BATCH_LIMITS.executionChunkSize,
        contentGate: 'Масова генерація SEO-статей вимкнена; контент створюється тільки після evidence та ручної перевірки.'
      }
    };
  }
}

module.exports = {
  SeoCenterRuntime,
  SITE_PROFILES,
  AUDIT_MODES,
  SEO_BATCH_LIMITS,
  OFFICIAL_SEO_SOURCES,
  SEO_GROWTH_AGENTS,
  CONVERSION_OBJECTIVES,
  SEO_SCAN_SCOPE,
  SEO_RESULT_WINDOWS,
  SEO_AGENT_DECISION_RULES,
  SEO_WORKING_CASE_PATTERNS,
  STATIC_OFFICIAL_RULES,
  buildIntelligenceReport,
  normalizeAuditResult,
  classifySeoAction,
  parseLastJsonObject
};
