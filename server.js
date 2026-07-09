require('dotenv').config();
const INITIAL_CONNECTION_ENV_KEYS = new Set(
  Object.entries(process.env)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([key]) => key)
);
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const dns = require('dns');
const crypto = require('crypto');
const cheerio = require('cheerio');
const { OperationalStore } = require('./operational-store');
const {
  parseCoffeetonPriceHtml,
  coffeetonLotToAttributes,
  diffAttributes,
  summarizeSupplierPreview,
  normalizeArticle
} = require('./supplier-sync');
const {
  DEFAULT_COFFEE_PRICING_CONFIG,
  parseMoney,
  configWithOverrides,
  calculateCoffeePricing,
  calculateSupplierLotPricing
} = require('./pricing-calculator');
const { SeoCenterRuntime } = require('./seo-system/runtime');
const { buildSeoControlPlan } = require('./seo-system/control-plane');
const { MerchantFeedRuntime, runWithSingleRetry } = require('./merchant-system/runtime');

const app = express();
const ACTION_LOG_PATH = path.join(__dirname, 'action-log.json');
const BUSINESS_MEMORY_PATH = path.join(__dirname, 'business-memory.json');
const OPERATIONAL_DB_PATH = path.resolve(__dirname, process.env.OPERATIONAL_DB_PATH || 'mercato-operational.sqlite');
const DIRECTOR_ISSUES_PATH = path.join(__dirname, 'director-issues.md');
const EMAIL_TRACKING_PATH = path.join(__dirname, 'email-tracking.json');
const EMAIL_SUPPRESSION_PATH = path.join(__dirname, 'email-suppression.json');
const FIRST_ORDER_POPUP_CONFIG_PATH = path.join(__dirname, 'first-order-popup-config.json');
const FIRST_ORDER_POPUP_LEADS_PATH = path.join(__dirname, 'first-order-popup-leads.json');
const GENERATION_RESEARCH_CACHE_PATH = path.join(__dirname, 'generation-research-cache.json');
const GSC_OAUTH_TOKEN_PATH = path.join(__dirname, 'gsc-oauth-token.json');
const SEO_AUDIT_CACHE_PATH = path.join(__dirname, 'seo-audit-cache.json');
const STORE_STYLE_CACHE_PATH = path.join(__dirname, 'store-style-cache.json');
const SUPPLIER_SYNC_LOG_PATH = path.join(__dirname, 'supplier-sync-log.json');
const SUPPLIER_PRICE_CACHE_PATH = path.join(__dirname, 'supplier-price-cache.json');
const SUPPLIER_AUTH_PATH = path.join(__dirname, 'supplier-auth.json');
const COMPETITOR_MONITOR_PATH = path.join(__dirname, 'competitor-monitor.json');
const UX_MONITOR_PATH = path.join(__dirname, 'ux-monitor.json');
const TRUST_SKIP_PATH = path.join(__dirname, 'trust-skip.json');
const CONNECTION_SECRETS_PATH = path.join(__dirname, 'connection-secrets.json');
const CONNECTION_VERIFICATION_PATH = path.join(__dirname, 'connection-verification.json');
const COMMAND_CENTER_CACHE_PATH = path.join(__dirname, 'command-center-cache.json');
const MERCHANT_GOOGLE_DIAGNOSTICS_PATH = path.join(__dirname, 'merchant-system', 'google-diagnostics-cache.json');
const BRIDGE_READ_TIMEOUT_MS = Math.max(3000, Number(process.env.BRIDGE_READ_TIMEOUT_MS || 15000));
const MERCHANT_BRIDGE_TIMEOUT_MS = Math.max(10000, Number(process.env.MERCHANT_BRIDGE_TIMEOUT_MS || 30000));
const BRIDGE_PAGE_CACHE_TTL_MS = Math.max(5000, Number(process.env.BRIDGE_PAGE_CACHE_TTL_MS || 60000));
const COMMAND_CENTER_CACHE_TTL_MS = Math.max(10000, Number(process.env.COMMAND_CENTER_CACHE_TTL_MS || 120000));
const CONNECTOR_DEFINITIONS = [
  {
    id: 'opencart',
    title: 'OpenCart / ocStore',
    owner: 'Хостинг або адміністратор сайту',
    fields: [
      { key: 'BRIDGE_URL', label: 'Адреса підключення сайту', required: true, type: 'url', placeholder: 'https://ваш-сайт.ua/mercato-bridge.php' },
      { key: 'BRIDGE_SECRET', label: 'Секрет підключення сайту', required: true, secret: true },
      { key: 'OPENCART_URL', label: 'Адреса магазину', required: false, type: 'url', placeholder: 'https://ваш-сайт.ua' }
    ]
  },
  {
    id: 'gsc',
    title: 'Google Search Console',
    owner: 'Google Search Console',
    fields: [
      { key: 'GSC_SITE_URL', label: 'Адреса сайту в Search Console', required: true, type: 'url', placeholder: 'https://ваш-сайт.ua/' },
      { key: 'GSC_ACCESS_TOKEN', label: 'Ключ доступу Search Console', required: false, secret: true },
      { key: 'GSC_CLIENT_EMAIL', label: 'Email сервісного акаунта', required: false },
      { key: 'GSC_PRIVATE_KEY', label: 'Приватний ключ сервісного акаунта', required: false, secret: true, multiline: true },
      { key: 'GOOGLE_OAUTH_CLIENT_FILE', label: 'Файл авторизації Google', required: false },
      { key: 'GOOGLE_API_KEY', label: 'API key для PageSpeed / CrUX', required: false, secret: true },
      { key: 'GOOGLE_APPLICATION_CREDENTIALS', label: 'Шлях до service account JSON для Codex SEO', required: false }
    ]
  },
  {
    id: 'ga4',
    title: 'Google Analytics 4',
    owner: 'Google Analytics',
    fields: [
      { key: 'GA4_PROPERTY_ID', label: 'ID ресурсу GA4', required: true },
      { key: 'GA4_ACCESS_TOKEN', label: 'Ключ доступу GA4', required: false, secret: true },
      { key: 'GOOGLE_OAUTH_CLIENT_FILE', label: 'Файл авторизації Google', required: false }
    ]
  },
  {
    id: 'merchant',
    title: 'Google Merchant Center',
    owner: 'Google Merchant Center',
    fields: [
      { key: 'MERCHANT_ACCOUNT_ID', label: 'Merchant account ID', required: true },
      { key: 'MERCHANT_DATA_SOURCE_ID', label: 'Merchant API data source ID', required: false },
      { key: 'MERCHANT_ACCESS_TOKEN', label: 'OAuth access token Merchant API', required: false, secret: true },
      { key: 'GOOGLE_APPLICATION_CREDENTIALS', label: 'Шлях до service account JSON', required: false },
      { key: 'GOOGLE_OAUTH_CLIENT_FILE', label: 'Файл OAuth client', required: false }
    ]
  },
  {
    id: 'google_ads',
    title: 'Google Ads',
    owner: 'Google Ads',
    fields: [
      { key: 'GOOGLE_ADS_CUSTOMER_ID', label: 'ID рекламного акаунта', required: true },
      { key: 'GOOGLE_ADS_DEVELOPER_TOKEN', label: 'Токен Google Ads', required: true, secret: true },
      { key: 'GOOGLE_ADS_LOGIN_CUSTOMER_ID', label: 'ID manager account (якщо є MCC)', required: false },
      { key: 'GOOGLE_ADS_CLIENT_ID', label: 'OAuth Client ID', required: false },
      { key: 'GOOGLE_ADS_CLIENT_SECRET', label: 'OAuth Client Secret', required: false, secret: true },
      { key: 'GOOGLE_ADS_REFRESH_TOKEN', label: 'Довгостроковий ключ доступу', required: false, secret: true },
      { key: 'GOOGLE_ADS_ACCESS_TOKEN', label: 'Ключ доступу', required: false, secret: true }
    ]
  },
  {
    id: 'smtp',
    title: 'SMTP / Mailchimp',
    owner: 'Поштова скринька або сервіс розсилки',
    fields: [
      { key: 'SMTP_HOST', label: 'Поштовий сервер', required: true, placeholder: 'mail.example.com' },
      { key: 'SMTP_PORT', label: 'Порт пошти', required: true, placeholder: '465' },
      { key: 'SMTP_USER', label: 'Email відправника', required: true, type: 'email' },
      { key: 'SMTP_PASS', label: 'Пароль поштової скриньки', required: true, secret: true },
      { key: 'SMTP_HOST_IPV4', label: 'Прямий IP поштового сервера', required: false },
      { key: 'SMTP_TLS_SERVERNAME', label: 'Назва TLS сервера', required: false }
    ]
  },
  {
    id: 'tracking',
    title: 'Public tracking',
    owner: 'Публічна адреса дашборду',
    fields: [
      { key: 'PUBLIC_BASE_URL', label: 'Публічна адреса системи', required: false, type: 'url', placeholder: 'https://ai.example.com' },
      { key: 'TRACKING_BASE_URL', label: 'Адреса tracking-посилань', required: false, type: 'url', placeholder: 'https://ai.example.com' },
      { key: 'APP_BASE_URL', label: 'Адреса дашборду', required: false, type: 'url' }
    ]
  },
  {
    id: 'security',
    title: 'Захист live-дій',
    owner: 'Mercato AI',
    fields: [
      { key: 'COMMAND_API_KEY', label: 'Ключ підтвердження live-дій', required: true, secret: true }
    ]
  }
];
const CONNECTOR_KEYS = new Set(CONNECTOR_DEFINITIONS.flatMap(definition => definition.fields.map(field => field.key)));

let connectionSecretsCache = null;

function readConnectionSecrets() {
  if (connectionSecretsCache) return connectionSecretsCache;
  try {
    const raw = fs.readFileSync(CONNECTION_SECRETS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    connectionSecretsCache = {
      values: parsed && typeof parsed.values === 'object' && parsed.values ? parsed.values : {},
      updatedAt: parsed.updatedAt || '',
      version: parsed.version || 1
    };
  } catch {
    connectionSecretsCache = { version: 1, updatedAt: '', values: {} };
  }
  return connectionSecretsCache;
}

function writeConnectionSecrets(data = {}) {
  const safe = {
    version: 1,
    updatedAt: new Date().toISOString(),
    values: {}
  };
  Object.entries(data.values || {}).forEach(([key, value]) => {
    if (CONNECTOR_KEYS.has(key) && value !== undefined && value !== null && String(value).trim() !== '') {
      safe.values[key] = String(value).trim();
    }
  });
  fs.writeFileSync(CONNECTION_SECRETS_PATH, `${JSON.stringify(safe, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(CONNECTION_SECRETS_PATH, 0o600);
  } catch {}
  connectionSecretsCache = safe;
  return safe;
}

function readConnectorVerifications() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CONNECTION_VERIFICATION_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeConnectorVerification(id, result = {}) {
  const current = readConnectorVerifications();
  current[id] = {
    ok: Boolean(result.ok),
    checkedAt: new Date().toISOString(),
    message: String(result.message || ''),
    error: String(result.error || '')
  };
  fs.writeFileSync(CONNECTION_VERIFICATION_PATH, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(CONNECTION_VERIFICATION_PATH, 0o600);
  } catch {}
  return current[id];
}

function clearConnectorVerification(id) {
  const current = readConnectorVerifications();
  if (!Object.prototype.hasOwnProperty.call(current, id)) return;
  delete current[id];
  fs.writeFileSync(CONNECTION_VERIFICATION_PATH, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 });
}

function connectionValue(key) {
  const envValue = process.env[key];
  if (envValue !== undefined && envValue !== null && String(envValue).trim() !== '') return String(envValue).trim();
  const saved = readConnectionSecrets().values?.[key];
  return saved !== undefined && saved !== null ? String(saved).trim() : '';
}

function connectionValueSource(key) {
  if (readConnectionSecrets().values?.[key]) return 'program';
  if (INITIAL_CONNECTION_ENV_KEYS.has(key)) return 'env';
  return '';
}

function applySavedConnectionSecrets() {
  const saved = readConnectionSecrets().values || {};
  Object.entries(saved).forEach(([key, value]) => {
    if (!CONNECTOR_KEYS.has(key)) return;
    if (process.env[key] === undefined || process.env[key] === null || String(process.env[key]).trim() === '') {
      process.env[key] = String(value).trim();
    }
  });
}

function maskConnectionValue(value = '') {
  const clean = String(value || '').trim();
  if (!clean) return '';
  if (clean.length <= 6) return '••••';
  return `${clean.slice(0, 3)}••••${clean.slice(-4)}`;
}

function connectorDefinition(id) {
  return CONNECTOR_DEFINITIONS.find(definition => definition.id === id) || null;
}

function connectorReadiness(definition, fields) {
  const has = key => Boolean(fields.find(field => field.key === key)?.filled);
  const required = fields.filter(field => field.required);
  const allRequired = required.length ? required.every(field => field.filled) : fields.some(field => field.filled);
  const configured = fields.some(field => field.filled);
  let ok = allRequired;
  let detail = ok ? 'Потрібні поля заповнені.' : 'Додайте обовʼязкові поля.';
  let missing = required.filter(field => !field.filled).map(field => field.label);
  let verifyEndpoint = '';

  if (definition.id === 'gsc') {
    const hasAuth = has('GSC_ACCESS_TOKEN')
      || (has('GSC_CLIENT_EMAIL') && has('GSC_PRIVATE_KEY'))
      || hasGoogleOAuthAccessForScope(GSC_READONLY_SCOPE);
    ok = has('GSC_SITE_URL') && hasAuth;
    missing = [
      ...(!has('GSC_SITE_URL') ? ['Адреса сайту в Search Console'] : []),
      ...(!hasAuth ? ['Google OAuth login зі scope webmasters.readonly або service account'] : [])
    ];
    detail = ok
      ? 'Є адреса сайту та підтверджена Google-авторизація.'
      : 'Самої адреси сайту або OAuth client-файлу недостатньо: потрібен Google login і token.';
  } else if (definition.id === 'ga4') {
    const hasAuth = has('GA4_ACCESS_TOKEN') || hasGoogleOAuthAccessForScope(GA4_READONLY_SCOPE);
    ok = has('GA4_PROPERTY_ID') && hasAuth;
    missing = [
      ...(!has('GA4_PROPERTY_ID') ? ['ID ресурсу GA4'] : []),
      ...(!hasAuth ? ['Google OAuth login зі scope analytics.readonly'] : [])
    ];
    detail = ok
      ? 'Є property ID та підтверджена Google-авторизація; виконайте API-перевірку.'
      : 'OAuth client-файл сам по собі не дає доступу: для GA4 потрібен Google login/token.';
    verifyEndpoint = '/api/connectors/ga4/verify';
  } else if (definition.id === 'merchant') {
    const hasAuth = has('MERCHANT_ACCESS_TOKEN')
      || has('GOOGLE_APPLICATION_CREDENTIALS')
      || hasGoogleOAuthAccessForScope(MERCHANT_CONTENT_SCOPE);
    ok = has('MERCHANT_ACCOUNT_ID') && hasAuth;
    missing = [
      ...(!has('MERCHANT_ACCOUNT_ID') ? ['Merchant account ID'] : []),
      ...(!hasAuth ? ['Google OAuth login зі scope content або service account доступ Merchant API'] : [])
    ];
    detail = ok
      ? 'Merchant account і авторизацію збережено; API-запит ще треба перевірити.'
      : 'Збережений лише account ID не підключає Merchant API.';
    verifyEndpoint = '/api/connectors/merchant/verify';
  } else if (definition.id === 'google_ads') {
    const hasDirectToken = has('GOOGLE_ADS_ACCESS_TOKEN');
    const canRefresh = has('GOOGLE_ADS_REFRESH_TOKEN')
      && has('GOOGLE_ADS_CLIENT_ID')
      && has('GOOGLE_ADS_CLIENT_SECRET');
    const hasUnifiedOAuth = hasGoogleOAuthAccessForScope(GOOGLE_ADS_SCOPE);
    ok = has('GOOGLE_ADS_CUSTOMER_ID')
      && has('GOOGLE_ADS_DEVELOPER_TOKEN')
      && (hasDirectToken || canRefresh || hasUnifiedOAuth);
    missing = [
      ...(!has('GOOGLE_ADS_CUSTOMER_ID') ? ['ID рекламного акаунта'] : []),
      ...(!has('GOOGLE_ADS_DEVELOPER_TOKEN') ? ['Developer token Google Ads'] : []),
      ...(!hasDirectToken && !canRefresh && !hasUnifiedOAuth ? ['Google OAuth login зі scope adwords'] : [])
    ];
    detail = ok
      ? 'Усі поля для перевірки Google Ads API заповнені.'
      : 'Customer ID і developer token без OAuth не дають доступу до Google Ads API. Використайте Google login зі scope adwords.';
    verifyEndpoint = '/api/connectors/google-ads/verify';
  } else if (definition.id === 'tracking') {
    ok = fields.some(field => field.filled);
    missing = ok ? [] : ['Публічна HTTPS-адреса системи або tracking'];
    detail = ok ? 'Публічну адресу збережено.' : 'Локальний localhost не може приймати tracking з листів.';
  }

  return {
    ok,
    configured,
    status: ok ? 'ready' : configured ? 'partial' : 'missing',
    statusLabel: ok ? 'Готово до перевірки' : configured ? 'Частково налаштовано' : 'Не налаштовано',
    detail,
    missing,
    verifyEndpoint
  };
}

function connectorStatuses() {
  const savedState = readConnectionSecrets();
  const verifications = readConnectorVerifications();
  return CONNECTOR_DEFINITIONS.map(definition => {
    const fields = definition.fields.map(field => {
      const value = connectionValue(field.key);
      return {
        key: field.key,
        label: field.label,
        required: Boolean(field.required),
        secret: Boolean(field.secret),
        multiline: Boolean(field.multiline),
        type: field.type || (field.secret ? 'password' : 'text'),
        placeholder: field.placeholder || '',
        filled: Boolean(value),
        masked: value ? maskConnectionValue(value) : '',
        source: connectionValueSource(field.key)
      };
    });
    const required = fields.filter(field => field.required);
    const readiness = connectorReadiness(definition, fields);
    const verification = verifications[definition.id];
    const verificationFresh = verification?.checkedAt
      && (!savedState.updatedAt || Date.parse(verification.checkedAt) >= Date.parse(savedState.updatedAt));
    const verifiedReadiness = verificationFresh && readiness.verifyEndpoint
      ? verification.ok
        ? {
            ...readiness,
            ok: true,
            status: 'verified',
            statusLabel: 'Підключено і перевірено',
            detail: verification.message || readiness.detail
          }
        : {
            ...readiness,
            ok: false,
            status: 'error',
            statusLabel: 'Помилка API',
            detail: verification.error || 'API-перевірка не пройдена.'
          }
      : readiness;
    return {
      id: definition.id,
      title: definition.title,
      owner: definition.owner,
      ...verifiedReadiness,
      verification: verificationFresh ? verification : null,
      fields,
      saved: fields.filter(field => field.source === 'program').length,
      env: fields.filter(field => field.source === 'env').length,
      requiredFilled: required.filter(field => field.filled).length,
      requiredTotal: required.length
    };
  });
}

function connectorStatus(id) {
  return connectorStatuses().find(connector => connector.id === id) || {
    id,
    ok: false,
    status: 'missing',
    statusLabel: 'Не налаштовано',
    detail: 'Підключення не налаштовано.',
    missing: []
  };
}

function connectorLiveReadiness(id) {
  const definition = connectorDefinition(id);
  if (!definition) {
    return {
      id,
      ok: false,
      status: 'missing',
      statusLabel: 'Не налаштовано',
      detail: 'Підключення не налаштовано.',
      missing: []
    };
  }
  const fields = definition.fields.map(field => {
    const value = connectionValue(field.key);
    return {
      key: field.key,
      label: field.label,
      required: Boolean(field.required),
      filled: Boolean(value)
    };
  });
  return {
    id,
    ...connectorReadiness(definition, fields),
    fields
  };
}

applySavedConnectionSecrets();
const seoCenterRuntime = new SeoCenterRuntime({
  projectRoot: __dirname,
  statePath: path.join(__dirname, 'seo-center-state.json')
});
const merchantFeedRuntime = new MerchantFeedRuntime({
  projectRoot: __dirname,
  statePath: path.join(__dirname, 'merchant-feed-state.json')
});
const SEO_DOCUMENTATION_BASELINE = {
  reviewedMonth: '2026-05',
  reviewedAt: '2026-05-17',
  cadence: 'monthly',
  sources: [
    {
      title: 'Google Search Central SEO Starter Guide',
      url: 'https://developers.google.com/search/docs/fundamentals/seo-starter-guide',
      appliesTo: ['site structure', 'title links', 'snippets', 'internal links']
    },
    {
      title: 'Google Search Central title links',
      url: 'https://developers.google.com/search/docs/appearance/title-link',
      appliesTo: ['SEO title', 'SERP title link']
    },
    {
      title: 'Google Search Central snippets',
      url: 'https://developers.google.com/search/docs/appearance/snippet',
      appliesTo: ['meta description', 'SERP snippet']
    },
    {
      title: 'Google Search Central Product structured data',
      url: 'https://developers.google.com/search/docs/appearance/structured-data/product',
      appliesTo: ['Product schema', 'merchant/product rich results']
    }
  ]
};
app.use(express.json({ limit: '10mb' }));
app.use((req, res, next) => {
  const origin = req.get('origin') || '';
  const configuredOrigins = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  const defaultLocalOrigins = [
    `http://localhost:${process.env.PORT || 3000}`,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    process.env.STORE_BASE_URL || ''
  ].filter(Boolean);
  const allowedOrigins = configuredOrigins.length ? configuredOrigins : defaultLocalOrigins;
  if (!origin) {
    res.setHeader('Access-Control-Allow-Origin', configuredOrigins.length ? allowedOrigins[0] : '*');
  } else if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!configuredOrigins.length) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const cleanPath = String(req.path || '').replace(/\/+$/, '') || '/';
  if (cleanPath === '/' || cleanPath === '/index.html' || cleanPath === '/app-v2') {
    return res.redirect(302, '/app-v3/');
  }
  if (cleanPath.startsWith('/app-v2/')) {
    return res.redirect(302, '/app-v3/');
  }
  return next();
});
app.use(express.static(path.join(__dirname, 'public')));

const PROTECTED_API_PATHS = new Set([
  '/api/work-items/decision',
  '/command-center/log',
  '/director/issues',
  '/email/send-test',
  '/email/send-one',
  '/email/send-batch',
  '/email/send-segment',
  '/email/schedule-segment',
  '/email/suppression',
  '/email/cleanup-coupons',
  '/email/create-coupon',
  '/email/repair-coupon',
  '/api/first-order-popup/admin-config',
  '/api/first-order-popup/leads',
  '/api/first-order-popup/order-completed',
  '/api/first-order-popup/sync-second-coupons',
  '/monitoring/competitors/run',
  '/monitoring/ux/run',
  '/api/owner-router',
  '/api/publish/dry-run',
  '/api/publish/approve',
  '/api/seo-center/fix-preview',
  '/api/seo-center/control-scan',
  '/api/seo-center/intelligence-refresh',
  '/api/seo-center/agent-draft',
  '/api/seo-center/approve',
  '/api/seo-center/apply',
  '/api/seo-center/rollback',
  '/api/merchant-feed/write-preview',
  '/api/merchant-feed/approve',
  '/api/merchant-feed/apply',
  '/seo/research/refresh',
  '/seo/competitors/save',
  '/seo/audit/run',
  '/seo/gsc/oauth/exchange',
  '/seo/gsc/query',
  '/seo/apply-gap',
  '/opencart/publish-content',
  '/supplier/coffeeton/auth',
  '/supplier/coffeeton/save-price',
  '/supplier/coffeeton/apply',
  '/store/style/clear'
]);
const PUBLIC_API_PATHS = new Set([
  '/api/first-order-popup/config',
  '/api/first-order-popup/lead'
]);

function timingSafeEqualText(a = '', b = '') {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function requireCommandApiKey(req, res, next) {
  const expected = String(process.env.COMMAND_API_KEY || process.env.MERCATO_COMMAND_API_KEY || '').trim();
  if (!expected) return next();
  if (PUBLIC_API_PATHS.has(req.path)) return next();
  const shouldProtect = PROTECTED_API_PATHS.has(req.path)
    || (req.path.startsWith('/api/') && req.method !== 'GET');
  if (!shouldProtect) return next();
  const headerKey = String(req.get('x-api-key') || '').trim();
  const auth = String(req.get('authorization') || '').trim();
  const bearerKey = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const provided = headerKey || bearerKey;
  if (!provided) {
    return res.status(401).json({
      error: 'X-API-Key required',
      code: 'API_KEY_REQUIRED'
    });
  }
  if (!timingSafeEqualText(provided, expected)) {
    return res.status(403).json({
      error: 'Invalid X-API-Key',
      code: 'API_KEY_INVALID'
    });
  }
  next();
}

app.use(requireCommandApiKey);

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY ||
  process.env.OpenAI_API_KEY ||
  process.env['OpenAI_АРІ_KEY'];
const RAW_AI_PROVIDER = String(process.env.AI_PROVIDER || '').trim().toLowerCase();
const AI_PROVIDER = ['openai', 'anthropic'].includes(RAW_AI_PROVIDER)
  ? RAW_AI_PROVIDER
  : (OPENAI_API_KEY ? 'openai' : 'anthropic');
const RAW_EMAIL_AI_PROVIDER = String(process.env.EMAIL_AI_PROVIDER || '').trim().toLowerCase();
const EMAIL_AI_PROVIDER = ['openai', 'anthropic'].includes(RAW_EMAIL_AI_PROVIDER)
  ? RAW_EMAIL_AI_PROVIDER
  : 'openai';
const ALLOW_ANTHROPIC_FALLBACK = /^(1|true|yes|on)$/i.test(String(process.env.ALLOW_ANTHROPIC_FALLBACK || ''));

if (!OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.warn('⚠️ OPENAI_API_KEY або ANTHROPIC_API_KEY не задано. AI-функції будуть недоступні, але CRM і popup API стартують.');
}

const ANTHROPIC_ENABLED = Boolean(process.env.ANTHROPIC_API_KEY)
  && (AI_PROVIDER === 'anthropic' || EMAIL_AI_PROVIDER === 'anthropic' || ALLOW_ANTHROPIC_FALLBACK);

const anthropicClient = ANTHROPIC_ENABLED
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const OPENAI_MAIN_MODEL = process.env.OPENAI_MAIN_MODEL || process.env.OPENAI_MODEL || 'gpt-5';
const OPENAI_FAST_MODEL = process.env.OPENAI_FAST_MODEL || process.env.OPENAI_MODEL || 'gpt-5-mini';
const OPENAI_FALLBACK_MODEL = String(process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o-mini').trim();
const OPENAI_REASONING_EFFORT = String(process.env.OPENAI_REASONING_EFFORT || 'low').trim();
const OPENAI_TEXT_VERBOSITY = String(process.env.OPENAI_TEXT_VERBOSITY || 'medium').trim();
const STORE_OWNER_NAME = process.env.STORE_OWNER_NAME || 'Максим';
const STORE_OWNER_SIGNATURE = process.env.STORE_OWNER_SIGNATURE || `${STORE_OWNER_NAME}, Mercato`;
const TELEGRAM_BOT_USERNAME = String(process.env.TELEGRAM_BOT_USERNAME || 'MercatoAI_bot').trim().replace(/^@+/, '');
const TELEGRAM_BOT_URL = String(process.env.TELEGRAM_BOT_URL || '').trim().replace(/\/+$/, '');
const TELEGRAM_BOT_INTERNAL_URL = String(process.env.TELEGRAM_BOT_INTERNAL_URL || '').trim().replace(/\/+$/, '');
const TELEGRAM_BOT_INTERNAL_TOKEN = String(process.env.TELEGRAM_BOT_INTERNAL_TOKEN || process.env.DIRECTOR_SUMMARY_TOKEN || '').trim();

function telegramStartParam(value = 'email_remind') {
  const param = String(value || 'email_remind')
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return param || 'email_remind';
}

function telegramBotDeepLink(startParam = 'email_remind') {
  const base = TELEGRAM_BOT_URL || (TELEGRAM_BOT_USERNAME ? `https://t.me/${TELEGRAM_BOT_USERNAME}` : '');
  if (!base) return '';
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}start=${encodeURIComponent(telegramStartParam(startParam))}`;
}

async function fetchTelegramDirectorSummary() {
  if (!TELEGRAM_BOT_INTERNAL_URL || !TELEGRAM_BOT_INTERNAL_TOKEN) {
    return {
      configured: false,
      status: 'not_configured',
      botUsername: TELEGRAM_BOT_USERNAME,
      publicUrl: telegramBotDeepLink('site_footer'),
      note: 'TELEGRAM_BOT_INTERNAL_URL або TELEGRAM_BOT_INTERNAL_TOKEN не задані; Command Center бачить тільки public deep links.'
    };
  }
  const url = `${TELEGRAM_BOT_INTERNAL_URL.replace(/\/internal\/director-summary$/, '')}/internal/director-summary`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'X-Internal-Token': TELEGRAM_BOT_INTERNAL_TOKEN
      },
      signal: controller.signal
    });
    const text = await response.text();
    let data = {};
    try {
      data = parsePossiblyDirtyJson(text, 'telegram director summary');
    } catch {
      throw new Error(`Telegram summary не JSON: ${compactApiText(text)}`);
    }
    if (!response.ok || data.error) throw new Error(data.error || `Telegram summary HTTP ${response.status}`);
    return {
      configured: true,
      status: 'ok',
      botUsername: data.bot_username || TELEGRAM_BOT_USERNAME,
      publicUrl: telegramBotDeepLink('site_footer'),
      generatedAt: data.generated_at || '',
      reach: data.reach || {},
      stats: data.stats || {},
      nextRecommendedAction: data.next_recommended_action || '',
      raw: data
    };
  } catch (error) {
    return {
      configured: true,
      status: 'error',
      botUsername: TELEGRAM_BOT_USERNAME,
      publicUrl: telegramBotDeepLink('site_footer'),
      error: error.message
    };
  } finally {
    clearTimeout(timer);
  }
}

function mapModel(model, provider = AI_PROVIDER) {
  if (provider !== 'openai') return model;
  return model && model.includes('haiku') ? OPENAI_FAST_MODEL : OPENAI_MAIN_MODEL;
}

function extractOpenAiText(data) {
  if (data.output_text) return data.output_text;
  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) parts.push(content.text);
      if (content.type === 'text' && content.text) parts.push(content.text);
      if (typeof content.text === 'string' && /text/i.test(String(content.type || ''))) parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

function openAiResponseDiagnostic(data) {
  const outputTypes = [];
  for (const item of data?.output || []) {
    const contentTypes = (item.content || []).map(content => content.type).filter(Boolean);
    outputTypes.push([item.type, ...contentTypes].filter(Boolean).join(':'));
  }
  return [
    data?.status ? `status=${data.status}` : '',
    data?.incomplete_details?.reason ? `reason=${data.incomplete_details.reason}` : '',
    outputTypes.length ? `output=${outputTypes.join(',')}` : ''
  ].filter(Boolean).join('; ') || 'без діагностики';
}

function isOpenAiReasoningModel(model = '') {
  return /^(gpt-5|o[1-9])/i.test(String(model || ''));
}

function openAiMaxTokensForAttempt(options = {}, multiplier = 1) {
  const requested = Number(options.max_tokens || 4096);
  return Math.min(20000, Math.max(1024, Math.ceil(requested * multiplier)));
}

function buildOpenAiPayload(options = {}, attempt = {}) {
  const model = attempt.model || mapModel(options.model, 'openai');
  const body = {
    model,
    input: attempt.input,
    max_output_tokens: attempt.maxOutputTokens || openAiMaxTokensForAttempt(options)
  };
  if (isOpenAiReasoningModel(model)) {
    body.reasoning = { effort: attempt.reasoningEffort || OPENAI_REASONING_EFFORT || 'low' };
    if (/^gpt-5/i.test(model)) body.text = { verbosity: OPENAI_TEXT_VERBOSITY || 'medium' };
  }
  return body;
}

function makeOpenAiError(message, code = 'OPENAI_ERROR', details = {}) {
  const error = new Error(message);
  error.provider = 'OpenAI';
  error.code = code;
  Object.assign(error, details);
  return error;
}

function isOpenAiEmptyResponseError(error) {
  return error?.code === 'OPENAI_EMPTY_TEXT';
}

function isOpenAiRetryableError(error) {
  const text = aiErrorText(error).toLowerCase();
  if (isOpenAiEmptyResponseError(error)) return true;
  if (text.includes('model') && (text.includes('not found') || text.includes('does not exist') || text.includes('not supported'))) return true;
  if (text.includes('max_output_tokens') || text.includes('maximum context') || text.includes('context length')) return true;
  return false;
}

function compactApiText(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 260);
}

function parsePossiblyDirtyJson(text = '', label = 'JSON') {
  const raw = String(text || '').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (firstError) {
    try {
      const parsed = safeParseJson(raw);
      const trailing = raw.slice((extractFirstJsonObject(raw) || '').length).trim();
      if (trailing) console.warn(`${label}: відповідь містила зайвий текст після JSON, використав перший валідний обʼєкт.`);
      return parsed;
    } catch {
      throw firstError;
    }
  }
}

function aiErrorText(error) {
  if (!error) return 'невідома помилка';
  if (typeof error === 'string') return error;
  if (error.message) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function aiErrorBrief(error) {
  return compactApiText(aiErrorText(error)) || 'невідома помилка';
}

function isAnthropicBillingError(error) {
  const text = aiErrorText(error).toLowerCase();
  return text.includes('credit balance')
    || text.includes('purchase credits')
    || text.includes('plans & billing')
    || text.includes('billing');
}

function isAiQuotaOrBillingError(error) {
  const text = aiErrorText(error).toLowerCase();
  return isAnthropicBillingError(error)
    || text.includes('exceeded your current quota')
    || text.includes('insufficient_quota')
    || text.includes('quota')
    || text.includes('too low to access')
    || text.includes('429');
}

function createCombinedAiError(primaryProvider, primaryError, fallbackProvider, fallbackError) {
  const primaryBrief = aiErrorBrief(primaryError);
  const fallbackBrief = aiErrorBrief(fallbackError);
  const hints = [];

  if (fallbackProvider === 'Anthropic' && isAnthropicBillingError(fallbackError)) {
    hints.push('Anthropic не має достатньо кредитів.');
  }
  if (primaryProvider === 'OpenAI') {
    hints.push('Перевір OPENAI_MAIN_MODEL / OPENAI_FAST_MODEL і доступність OpenAI ключа.');
  }
  if (primaryProvider === 'Anthropic') {
    hints.push('Можна поповнити Anthropic або залишити OpenAI як fallback.');
  }

  return new Error([
    'AI генерація зараз недоступна.',
    `${primaryProvider}: ${primaryBrief}.`,
    `${fallbackProvider}: ${fallbackBrief}.`,
    hints.join(' ')
  ].filter(Boolean).join(' '));
}

async function requestOpenAiMessage(options, input, attempt = {}) {
  const model = attempt.model || mapModel(options.model, 'openai');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(buildOpenAiPayload(options, {
      input,
      model,
      maxOutputTokens: attempt.maxOutputTokens,
      reasoningEffort: attempt.reasoningEffort
    }))
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const contentType = response.headers.get('content-type') || 'unknown';
    throw makeOpenAiError(
      `OpenAI API повернув не JSON (HTTP ${response.status}, ${contentType}). Фрагмент: ${compactApiText(text) || 'порожня відповідь'}`,
      'OPENAI_NON_JSON'
    );
  }

  if (!response.ok) {
    throw makeOpenAiError(data.error?.message || `OpenAI API error ${response.status}`, 'OPENAI_HTTP_ERROR', {
      status: response.status
    });
  }

  const outputText = extractOpenAiText(data);
  if (!outputText) {
    throw makeOpenAiError(
      `OpenAI API повернув порожній текст відповіді для моделі ${model} (${openAiResponseDiagnostic(data)})`,
      'OPENAI_EMPTY_TEXT',
      { model, diagnostic: openAiResponseDiagnostic(data) }
    );
  }

  return { content: [{ text: outputText }], provider: 'openai', model };
}

async function createOpenAiMessage(options) {
  const input = [];
  if (options.system) {
    input.push({ role: 'developer', content: [{ type: 'input_text', text: options.system }] });
  }
  for (const msg of options.messages || []) {
    input.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: [{ type: 'input_text', text: msg.content }]
    });
  }

  const primaryModel = mapModel(options.model, 'openai');
  const attempts = [
    { model: primaryModel, maxOutputTokens: openAiMaxTokensForAttempt(options), reasoningEffort: OPENAI_REASONING_EFFORT },
    { model: primaryModel, maxOutputTokens: openAiMaxTokensForAttempt(options, 2), reasoningEffort: 'low' }
  ];

  if (OPENAI_FALLBACK_MODEL && OPENAI_FALLBACK_MODEL !== primaryModel) {
    attempts.push({
      model: OPENAI_FALLBACK_MODEL,
      maxOutputTokens: openAiMaxTokensForAttempt(options, 2),
      reasoningEffort: OPENAI_REASONING_EFFORT
    });
  }

  let lastError = null;
  const used = new Set();
  for (const attempt of attempts) {
    const key = `${attempt.model}:${attempt.maxOutputTokens}:${attempt.reasoningEffort || ''}`;
    if (used.has(key)) continue;
    used.add(key);
    try {
      return await requestOpenAiMessage(options, input, attempt);
    } catch (error) {
      lastError = error;
      if (!isOpenAiRetryableError(error)) throw error;
      console.warn(`OpenAI retryable error (${attempt.model}):`, aiErrorBrief(error));
    }
  }

  throw lastError || makeOpenAiError('OpenAI API не повернув відповідь', 'OPENAI_EMPTY_TEXT');
}

async function createAnthropicMessage(options) {
  if (!anthropicClient) {
    throw new Error('Anthropic API не налаштований: ANTHROPIC_API_KEY відсутній');
  }
  const { provider, fallback, ...anthropicOptions } = options || {};
  return await anthropicClient.messages.create(anthropicOptions);
}

async function createAiMessage(options) {
  const preferredProvider = ['openai', 'anthropic'].includes(String(options?.provider || '').toLowerCase())
    ? String(options.provider).toLowerCase()
    : AI_PROVIDER;
  const allowFallback = options?.fallback !== false && ALLOW_ANTHROPIC_FALLBACK;

  if (preferredProvider === 'openai') {
    try {
      return await createOpenAiMessage(options);
    } catch (openAiError) {
      if (!allowFallback || !anthropicClient) {
        throw openAiError;
      }
      console.warn(`OpenAI failed, falling back to Anthropic (${options.model || 'default'}):`, aiErrorBrief(openAiError));
      try {
        return await createAnthropicMessage(options);
      } catch (anthropicError) {
        throw createCombinedAiError('OpenAI', openAiError, 'Anthropic', anthropicError);
      }
    }
  }

  try {
    return await createAnthropicMessage(options);
  } catch (anthropicError) {
    if (!allowFallback || !OPENAI_API_KEY) {
      throw anthropicError;
    }
    console.warn(`Anthropic failed, falling back to OpenAI (${options.model || 'default'}):`, aiErrorBrief(anthropicError));
    try {
      return await createOpenAiMessage(options);
    } catch (openAiError) {
      throw createCombinedAiError('Anthropic', anthropicError, 'OpenAI', openAiError);
    }
  }
}

const client = { messages: { create: createAiMessage } };

console.log(`AI provider: ${AI_PROVIDER}${AI_PROVIDER === 'openai' ? ` (${OPENAI_MAIN_MODEL}, fast: ${OPENAI_FAST_MODEL}, OpenAI fallback: ${OPENAI_FALLBACK_MODEL || 'off'}${ALLOW_ANTHROPIC_FALLBACK && anthropicClient ? ', Anthropic fallback enabled' : ''})` : `${OPENAI_API_KEY ? ` (OpenAI fallback enabled: ${OPENAI_MAIN_MODEL}, fast: ${OPENAI_FAST_MODEL})` : ''}`}; email provider: ${EMAIL_AI_PROVIDER} (Anthropic fallback: ${ALLOW_ANTHROPIC_FALLBACK && anthropicClient ? 'on' : 'off'})`);

let storeStyleCache = readJsonFile(STORE_STYLE_CACHE_PATH, null);

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function isoDaysAgo(value = '') {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function monitorFreshness(lastRunAt = '', cadenceDays = 7) {
  const ageDays = isoDaysAgo(lastRunAt);
  if (ageDays === null) return { status: 'due', ageDays: null, due: true, label: 'не запускався' };
  const due = ageDays >= cadenceDays;
  return {
    status: due ? 'due' : 'fresh',
    ageDays,
    due,
    label: due ? `${ageDays} дн. тому, треба оновити` : `${ageDays} дн. тому`
  };
}

const operationalStore = new OperationalStore({
  rootDir: __dirname,
  dbPath: OPERATIONAL_DB_PATH
});
operationalStore.init();
operationalStore.importFromJson({
  actionLog: readJsonFile(ACTION_LOG_PATH, { version: 1, entries: [] }),
  businessMemory: readJsonFile(BUSINESS_MEMORY_PATH, { version: 1, events: [], experiments: [], learnings: [] }),
  emailTracking: readJsonFile(EMAIL_TRACKING_PATH, { messages: [] })
});

function readActionLog() {
  const sqliteData = operationalStore.readActionLog();
  if (sqliteData) return sqliteData;
  const data = readJsonFile(ACTION_LOG_PATH, { entries: [] });
  if (Array.isArray(data)) return { entries: data };
  return { entries: Array.isArray(data.entries) ? data.entries : [] };
}

function writeActionLog(entries) {
  const payload = { version: 1, entries: entries.slice(0, 500) };
  writeJsonFile(ACTION_LOG_PATH, payload);
  operationalStore.writeActionLog(payload.entries);
}

function readBusinessMemory() {
  const sqliteData = operationalStore.readBusinessMemory();
  if (sqliteData) return sqliteData;
  const data = readJsonFile(BUSINESS_MEMORY_PATH, { version: 1, events: [], experiments: [], learnings: [] });
  return {
    version: 1,
    events: Array.isArray(data.events) ? data.events : [],
    experiments: Array.isArray(data.experiments) ? data.experiments : [],
    learnings: Array.isArray(data.learnings) ? data.learnings : []
  };
}

function writeBusinessMemory(memory) {
  const payload = {
    version: 1,
    events: (memory.events || []).slice(0, 800),
    experiments: (memory.experiments || []).slice(0, 250),
    learnings: (memory.learnings || []).slice(0, 250)
  };
  writeJsonFile(BUSINESS_MEMORY_PATH, payload);
  operationalStore.writeBusinessMemory(payload);
}

function defaultDirectorIssuesMarkdown() {
  return `# Director briefing issues

RCA-журнал для пропозицій брифінгу, які виявились неточними, недоречними або небезпечними.

Формат кожного запису:
- Симптом: що саме AI запропонував погано.
- Чому дурне: яке правило, дані або контекст були неправильні.
- Що виправити: конкретна зміна в логіці, промпті, stop-list або UX.

`;
}

function readDirectorIssuesMarkdown() {
  try {
    if (!fs.existsSync(DIRECTOR_ISSUES_PATH)) return defaultDirectorIssuesMarkdown();
    const text = fs.readFileSync(DIRECTOR_ISSUES_PATH, 'utf8');
    return text.trim() ? text : defaultDirectorIssuesMarkdown();
  } catch {
    return defaultDirectorIssuesMarkdown();
  }
}

function writeDirectorIssuesMarkdown(markdown) {
  fs.writeFileSync(DIRECTOR_ISSUES_PATH, markdown);
}

function cleanDirectorIssueText(value, max = 900) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max);
}

function markdownBulletText(value) {
  const text = cleanDirectorIssueText(value);
  if (!text) return '-';
  return text.split('\n').map((line, index) => index ? `  ${line}` : line).join('\n');
}

function directorIssueLabel(value, fallback) {
  return String(value || fallback || '')
    .replace(/[^\p{L}\p{N}\s:_-]+/gu, '')
    .trim()
    .slice(0, 80) || fallback;
}

function parseDirectorIssuesMarkdown(markdown = readDirectorIssuesMarkdown()) {
  const sections = String(markdown || '')
    .split(/\n(?=##\s+)/g)
    .filter(section => /^##\s+/m.test(section));
  return sections.map(section => {
    const title = (section.match(/^##\s+(.+)$/m) || [])[1] || 'Без назви';
    const get = (label) => (section.match(new RegExp(`^- ${label}:\\s*(.+)$`, 'm')) || [])[1] || '';
    const symptom = (section.match(/^- Симптом:\s*([\s\S]*?)(?=\n- Чому дурне:|\n- Що виправити:|\n- Статус:|\n##\s+|$)/m) || [])[1] || '';
    const why = (section.match(/^- Чому дурне:\s*([\s\S]*?)(?=\n- Що виправити:|\n- Статус:|\n##\s+|$)/m) || [])[1] || '';
    const fix = (section.match(/^- Що виправити:\s*([\s\S]*?)(?=\n- Статус:|\n##\s+|$)/m) || [])[1] || '';
    return {
      id: get('ID'),
      title: title.trim(),
      severity: get('Серйозність') || 'medium',
      domain: get('Домен') || 'briefing',
      priorityId: get('Priority') || '',
      status: (get('Статус') || 'open').toLowerCase(),
      symptom: cleanDirectorIssueText(symptom, 300),
      why: cleanDirectorIssueText(why, 300),
      fix: cleanDirectorIssueText(fix, 300)
    };
  });
}

function buildDirectorIssuesSummary() {
  const markdown = readDirectorIssuesMarkdown();
  const issues = parseDirectorIssuesMarkdown(markdown);
  const open = issues.filter(issue => issue.status !== 'closed' && issue.status !== 'done');
  const bySeverity = issues.reduce((acc, issue) => {
    const key = issue.severity || 'medium';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    path: DIRECTOR_ISSUES_PATH,
    total: issues.length,
    open: open.length,
    bySeverity,
    recent: issues.slice(-6).reverse()
  };
}

function appendDirectorIssue({ symptom, why, fix, severity = 'medium', domain = 'briefing', priorityId = '', customerId = '', title = '' } = {}) {
  const cleanSymptom = cleanDirectorIssueText(symptom);
  if (!cleanSymptom) throw new Error('Симптом обовʼязковий');
  const now = new Date();
  const id = `dir-issue-${now.getTime()}-${crypto.randomBytes(3).toString('hex')}`;
  const summary = cleanSymptom.split('\n')[0].slice(0, 90);
  const entry = [
    `## ${now.toLocaleString('uk-UA')} — ${summary}`,
    `- ID: ${id}`,
    `- Серйозність: ${directorIssueLabel(severity, 'medium')}`,
    `- Домен: ${directorIssueLabel(domain, 'briefing')}`,
    `- Priority: ${directorIssueLabel(priorityId, '-')}`,
    customerId ? `- Customer: ${directorIssueLabel(customerId, '-')}` : '',
    title ? `- Контекст: ${markdownBulletText(title)}` : '',
    `- Симптом: ${markdownBulletText(cleanSymptom)}`,
    `- Чому дурне: ${markdownBulletText(why)}`,
    `- Що виправити: ${markdownBulletText(fix)}`,
    '- Статус: open',
    ''
  ].filter(Boolean).join('\n');
  const current = readDirectorIssuesMarkdown();
  writeDirectorIssuesMarkdown(`${current.replace(/\s*$/, '\n\n')}${entry}`);
  return { id, createdAt: now.toISOString(), createdAtLocal: now.toLocaleString('uk-UA'), summary: buildDirectorIssuesSummary() };
}

function readSeoAuditCache() {
  const data = readJsonFile(SEO_AUDIT_CACHE_PATH, { version: 1, sitemap: null, productAudit: null, gsc: null });
  return {
    version: 1,
    sitemap: data.sitemap || null,
    productAudit: data.productAudit || null,
    gsc: data.gsc || null,
    competitorSearches: data.competitorSearches && typeof data.competitorSearches === 'object' ? data.competitorSearches : {}
  };
}

function writeSeoAuditCache(patch = {}) {
  const current = readSeoAuditCache();
  writeJsonFile(SEO_AUDIT_CACHE_PATH, { version: 1, ...current, ...patch });
}

function readCompetitorMonitor() {
  const data = readJsonFile(COMPETITOR_MONITOR_PATH, { version: 1, runs: [], targets: [] });
  return {
    version: 1,
    runs: Array.isArray(data.runs) ? data.runs : [],
    targets: Array.isArray(data.targets) ? data.targets : []
  };
}

function writeCompetitorMonitor(data = {}) {
  writeJsonFile(COMPETITOR_MONITOR_PATH, {
    version: 1,
    targets: (data.targets || []).slice(0, 100),
    runs: (data.runs || []).slice(0, 60)
  });
}

function readUxMonitor() {
  const data = readJsonFile(UX_MONITOR_PATH, { version: 1, runs: [] });
  return {
    version: 1,
    runs: Array.isArray(data.runs) ? data.runs : []
  };
}

function writeUxMonitor(data = {}) {
  writeJsonFile(UX_MONITOR_PATH, {
    version: 1,
    runs: (data.runs || []).slice(0, 24)
  });
}

function collectCompetitorMonitorTargets(limit = 5) {
  const configured = readCompetitorMonitor().targets
    .map(item => ({
      keyword: plainOneLine(item.keyword || item.searchQuery || item.productName || ''),
      productName: plainOneLine(item.productName || item.name || item.keyword || ''),
      url: plainOneLine(item.url || ''),
      competitorUrls: cleanCompetitorUrls(item.competitorUrls || [])
    }))
    .filter(item => item.keyword || item.productName);
  if (configured.length) return configured.slice(0, limit);

  const generationEntries = Object.values(readGenerationResearchCache().entries || {})
    .map(item => ({
      keyword: plainOneLine(item.searchQuery || item.research?.query || ''),
      productName: plainOneLine(item.research?.mustUseInGeneration?.find(x => /^Назва товару:/i.test(x))?.replace(/^Назва товару:\s*/i, '') || item.searchQuery || ''),
      url: '',
      competitorUrls: cleanCompetitorUrls(item.research?.competitorUrls || [])
    }))
    .filter(item => item.keyword || item.productName);
  if (generationEntries.length) return generationEntries.slice(0, limit);

  const competitorSearches = Object.values(readSeoAuditCache().competitorSearches || {})
    .map(item => ({
      keyword: plainOneLine(item.searchQuery || item.keyword || item.query || ''),
      productName: plainOneLine(item.productName || item.searchQuery || ''),
      url: plainOneLine(item.url || ''),
      competitorUrls: cleanCompetitorUrls(item.urls || item.competitorUrls || [])
    }))
    .filter(item => item.keyword || item.productName);
  return competitorSearches.slice(0, limit);
}

function buildMonitoringSummary() {
  const competitor = readCompetitorMonitor();
  const ux = readUxMonitor();
  const lastCompetitor = competitor.runs[0] || null;
  const lastUx = ux.runs[0] || null;
  const competitorFreshness = monitorFreshness(lastCompetitor?.generatedAt || '', 7);
  const uxFreshness = monitorFreshness(lastUx?.generatedAt || '', 30);
  return {
    competitors: {
      cadence: 'weekly',
      cadenceDays: 7,
      status: competitorFreshness.status,
      due: competitorFreshness.due,
      lastRunAt: lastCompetitor?.generatedAt || '',
      freshness: competitorFreshness.label,
      targets: competitor.targets.length || collectCompetitorMonitorTargets(5).length,
      lastSummary: lastCompetitor ? {
        targetsChecked: lastCompetitor.targetsChecked || 0,
        competitorsAnalyzed: lastCompetitor.competitorsAnalyzed || 0,
        risks: (lastCompetitor.risks || []).slice(0, 3),
        advantages: (lastCompetitor.advantages || []).slice(0, 3)
      } : null
    },
    ux: {
      cadence: 'monthly',
      cadenceDays: 30,
      status: uxFreshness.status,
      due: uxFreshness.due,
      lastRunAt: lastUx?.generatedAt || '',
      freshness: uxFreshness.label,
      lastSummary: lastUx ? {
        category: lastUx.category || '',
        niche: lastUx.niche || '',
        actions: (lastUx.actions || []).slice(0, 3),
        verification: lastUx.verification || []
      } : null
    }
  };
}

function defaultMercatoStyle(productUrl = '') {
  return {
    colors: {
      primary: '#1f2937',
      secondary: '#4b5563',
      accent: '#ff9f2f',
      text: '#1f2937',
      bg: '#fffaf4',
      cardBg: '#ffffff',
      border: '#e5e7eb'
    },
    fonts: {
      main: 'Inter, system-ui, Arial, sans-serif',
      headings: 'Inter, system-ui, Arial, sans-serif'
    },
    borderRadius: '14px',
    syncedAt: new Date().toLocaleString('uk-UA'),
    productUrl,
    htmlStructurePrompt: HTML_STRUCTURE
  };
}

function saveStoreStyleCache(data) {
  storeStyleCache = data;
  writeJsonFile(STORE_STYLE_CACHE_PATH, data);
}

const BRAND_VOICE = `Ти — експертний SEO-копірайтер для Mercato (mercato.com.ua), українського спеціалті-інтернет-магазину кави та чаю.

ГОЛОС БРЕНДУ MERCATO:
- Теплий, знаючий тон — як бариста-друг, не продавець
- Сенсорно-насичені описи: смак, аромат, відчуття в чашці
- Експертний, але доступний — без зайвого пафосу
- Природне використання термінології саме для типу товару: кава, чай або набір
- Мова: тільки українська
- Конкретно, по суті, деталі що важливі покупцю
- Кожне речення має бути завершеним. Не залишай обірваних фраз типу "щіль", "кислот", "аромат".
- Не дублюй службові заголовки поруч: якщо є "Детальніше", не став одразу "Повний опис товару" як окремий підзаголовок.
- Не пиши шаблонними AI-фразами: "варто обирати за характером чашки", "допомагає зрозуміти", "профіль підходить", "товар легше оцінювати", "ключова особливість". Замінюй їх конкретикою: ноти, кислотність, тіло, післясмак, обробка, кому підійде, як готувати.
- Якщо "білий чай", "чорний чай", "трави" або подібні слова є в полі смаку кави, трактуй їх як смакові ноти, а не як тип товару.
- Не використовуй emoji або інші 4-byte Unicode символи: OpenCart Mercato зберігає описи в MySQL utf8, не utf8mb4.

ЗРАЗКИ СТИЛЮ (реальні речення з описів Mercato; адаптуй лексику під тип товару):
- "яскрава кенійська арабіка з соковитим фруктовим профілем, винною динамікою та чистим післясмаком"
- "на старті кава дає вибухову ягідно-цитрусову соковитість, у середині смаку відчуваються яблучно-винні відтінки, а у фіналі лишається довгий, чистий і фруктовий післясмак"
- "Це хороший вибір для тих, хто любить більш живу, кислотнішу і складнішу чашку без грубої гіркоти"
- Для чаю пиши про аромат, настій, температуру, час, мʼякість, терпкість, кількість настоїв і сценарій чаювання. Не згадуй помел, обсмаження, еспресо або кавомашину.
- Для наборів пиши про склад, логіку добірки, подарунковий сценарій, дегустацію, простоту вибору і кому підійде. Не описуй набір як один сорт кави або один чай.

SEO ТА FEED ПРАВИЛА (Google / Merchant Center 2026):
- Title tag: 50-60 символів, головне ключове слово + "| Mercato"
- Meta description: 150-160 символів, ключове слово + унікальна перевага без агресивного продажу
- H1: унікальний, описовий, містить ключове слово, відрізняється від title
- Природне використання ключових слів, щільність 1-2%
- FAQ: відповідати на реальні пошукові запити покупців
- Product description може потрапляти у Google Merchant feed, тому в описі товару НЕ можна писати ціну, знижки, акції, доставку, гарантії, порівняння з конкурентами, службові SEO-коментарі, URL, внутрішні посилання або заклики типу "купуйте зараз".
- Опис товару має бути plain-text-safe після видалення HTML: тільки факти про сам товар, смак, походження/склад, обробку/тип, сценарій використання і зберігання.

ПЕРЕД НАПИСАННЯМ ТЕКСТУ ОБОВʼЯЗКОВО ВРАХУЙ:
- Пошуковий намір: людина хоче зрозуміти смак, походження/склад, спосіб заварювання або використання, чи підійде їй цей товар і чому варто купити саме тут.
- UX сторінки: текст має легко скануватись блоками, відповідати на заперечення, давати практичні параметри заварювання, не бути "стіною".
- Конкурентний рівень: опис має бути кориснішим за типові короткі описи конкурентів — більше конкретики про чашку, обробку, кому підійде, як заварювати.
- E-commerce користь: кожен блок має допомагати покупцю прийняти рішення, а не просто красиво звучати.
- SEO корисність: природно вплітай ключові слова в title, meta, H1, intro, FAQ і детальний опис, але не переспамлюй і не перетворюй опис на рекламний текст.
- Перевір фінальний текст: немає обірваних слів, дубльованих заголовків, незавершених речень, службових маркерів або води.`;

const HTML_STRUCTURE = `
HTML СТРУКТУРА MERCATO PDP v2 — єдиний стандарт опису для всіх товарів, сумісний з Google Merchant feed:

КРИТИЧНО:
- У ---CONTENT--- повертай ТІЛЬКИ HTML-код опису. Не вставляй ---TITLE---, ---META---, ---H1---, ---CONTENT--- або SEO-тексти всередину HTML.
- Перший тег у ---CONTENT--- має бути:
  <div data-mercato-description="v2" style="font-family:Inter,Arial,sans-serif;color:#1f2937;line-height:1.6;font-size:16px;">
- Це OpenCart Mercato: верхній товарний блок уже має фото, ціну, доступні опції, кнопку купити, виробника, код товару, рейтинг і H1.
- НЕ дублюй верхній товарний блок. Не пиши ціну, фасування/вагу як селектор, кнопку купити, рейтинг, фото або виробника.
- ---CONTENT--- має допомогти покупцю швидко прийняти рішення, а не відволікати від замовлення.
- Стиль має бути однаковий на всіх товарах: світлий фон, темний текст, тонкі рамки #e5e7eb, мʼякі смакові chips, без вертикальних декоративних ліній, важких тіней і hero-лендингу.
- Не використовуй emoji або 4-byte Unicode символи.
- Не використовуй position:absolute/fixed, JavaScript, external CSS, SVG або картинки.
- Опис має бути компактним: орієнтир 1800-3200 символів HTML і до 5000 символів plain text після strip HTML.
- Текст має відповідати моменту покупки: людина вже на конкретному товарі, тому не роби лендинг, не продавай магазин заново і не відволікай від замовлення.
- Якщо OpenCart feed забере цей самий description і прибере HTML, текст має лишитися професійним описом товару без URL, внутрішніх посилань, цін, доставки, акцій, промокодів, "купуйте зараз", конкурентів або службових SEO-пояснень.

RIGHT_CARD:
- Короткий фрагмент для превʼю інформаційної картки товару.
- Не вказуй ціну, вагу, помел або кнопку.
- Не дублюй весь опис: тільки стислий смак, походження/тип і практична перевага.
- Атрибути в ---ATTRIBUTES--- мають бути чесними: якщо точних даних немає, краще не вигадувати поле.
- Для чаю НЕ додавай кавові атрибути "Ступінь обсмаження", "Технологія обсмаження", "Оцінка SCA", "Помел". Натомість можна додати "Тип чаю", "Температура заварювання", "Час настоювання", "Кількість настоїв".
- Для наборів додай доречні атрибути: "Склад набору", "Формат", "Подарунковий формат", "Кому підійде", "Рекомендація".

CONTENT / description структура — порядок не міняти:

1. ШВИДКО ПРО ТОВАР
- Легка картка на фоні #fffaf4 з border #f3ddc8 і radius 14px.
- Заголовок "Швидко про товар".
- Один короткий абзац 2-3 речення: загальне корисне пояснення для покупця — що це за товар, для якого сценарію він доречний, як його краще використати вдома. Можна згадати країну/регіон/формат/врожай, але не роби сухий список фактів і не повторюй смакові ноти. Смак має бути нижче в окремій секції.
- У цьому абзаці використовуй чисту назву товару, а не SEO-title. Не пиши "купити | Mercato", "вказаний як факт партії", "контекст партії" або інші службові фрази.
- Під абзацом 3-4 компактні колонкі без дублювання смаку:
  "Походження" / "Склад" — країна, регіон, ферма або склад, якщо ці факти є.
  "Врожай" — тільки якщо є реальний рік врожаю.
  "Підходить" — для якого покупця або сценарію.
  "Готувати" / "Заварювати" / "Використовувати" — коротка практична порада саме під тип товару.

2. ПОХОДЖЕННЯ І ЛОТ
- Секційний блок з тонкою рамкою, без вертикальних декоративних смуг.
- Рядки таблицею: Країна, Регіон, Ферма / станція, Сорт / різновид, Обробка, Врожай.
- Показуй тільки ті рядки, де є реальні дані. Не вигадуй сорт, ферму, SCA, висоту або рік.
- Якщо значення на кшталт "в зернах", "мелена", "помел" потрапило в обробку, показуй його як "Формат", а не як "Обробка".
- Після таблиці додавай підблок "Деталі лота" тільки якщо він додає реальну користь: є ферма/станція, сорт/різновид або реальний метод обробки. Сам по собі рік врожаю, країна або регіон не є приводом писати окремий текст. Не пиши штучних речень типу "фіксує походження", "задає контекст", "допомагає зрозуміти". Пиши практично: чим цей факт відрізняє партію, що може змінитися в наступній поставці, чому його варто бачити в картці.

3. СМАК У ЧАШЦІ / НАСТОЇ
- Секційний блок з тонкою рамкою, без вертикальних декоративних смуг.
- Один короткий абзац 1-2 речення: смак, баланс, тіло/настій і післясмак. Не повторюй країну/регіон тут ще раз, якщо вони вже є у блоці лота.
- Смакові chips допустимі, але опис смаку не має займати більшу частину картки.

4. ЩО ВАЖЛИВО ЗНАТИ
- 2-3 легкі рядки, не важкі картки. Для кави: Обробка, Свіжість, практичний сценарій. Для чаю: Тип/підготовка, Заварювання, Пакування. Для набору: Склад, Формат, Кому підійде.
- Кожен рядок: короткий заголовок + 1 речення, без довгих абзаців.

5. ЯК ОБРАТИ І ЗАВАРЮВАТИ
- Секційний блок з тонкою рамкою, без вертикальних декоративних смуг.
- 1-2 короткі практичні абзаци:
  для кави: еспресо, фільтр/V60, турка/гейзер/аеропрес, помел під метод;
  для чаю: температура, час, кількість настоїв, кому смак підійде;
  для наборів: як використовувати кожну позицію, чи підходить на подарунок, як дегустувати;
  для какао: молоко/вода, насиченість, десертність.
- Не створюй таблицю з точними рецептами, якщо таких даних немає.

6. FAQ
- 3 питання, які реально допомагають купити: "Кому підійде?", "Чи буде кислинка/гірчинка?", "Як краще заварювати/зберігати?"
- Картки на всю ширину, білий фон, border #e5e7eb, radius 12px, padding 16px 18px.

Фінальна перевірка:
- Немає обрізаних речень.
- Немає дубльованих заголовків.
- Немає порожніх або службових значень на кшталт "уточнити", якщо блок можна просто пропустити.
- Немає посилань, URL, акцій, цін, доставки, промокодів, конкурентів або фраз, які не описують сам товар.
- Опис виглядає як частина товарної сторінки Mercato і не відволікає від купівлі.`;

const TEXT_STRUCTURE = `
ТЕКСТОВА СТРУКТУРА — чистий текст без жодних HTML тегів:

Розбий на секції з назвами у верхньому регістрі:

КОРОТКИЙ ОПИС:
[2-3 речення: назва + профіль + унікальність]

СМАК ТА ВІДЧУТТЯ:
[Детальний опис від першого ковтка до фіналу]

ХАРАКТЕРИСТИКИ:
Походження: ...
Обробка: ...
Профіль: ...
Для чого підійде: ...

КОМУ ПІДІЙДЕ:
- [пункт]
- [пункт]
- [пункт]

ЗБЕРІГАННЯ:
- [пункт]
- [пункт]

FAQ:
Питання: [питання]
Відповідь: [відповідь]

Питання: [питання]
Відповідь: [відповідь]`;

const OUTPUT_FORMAT = `
ФОРМАТ ВІДПОВІДІ — строго тільки ці розділювачі:
---TITLE---
(title tag, 50-60 символів)
---META---
(meta description, 150-160 символів)
---H1---
(заголовок h1)
---RIGHT_CARD---
(превʼю верхньої правої інформаційної картки OpenCart; без ціни, грамів і кнопок. Дані для live-картки все одно мають бути в ---ATTRIBUTES---)
---ATTRIBUTES---
JSON-обʼєкт OpenCart атрибутів для правої картки і вкладки характеристик. Формат:
{
  "Кислотність": "6",
  "Солодкість": "7.5",
  "Тіло": "8.2",
  "Післясмак": "7.6",
  "Фруктовість": "7.4",
  "Смак": "червоні ягоди, нектарин, цитрус",
  "Ступінь обсмаження": "Середня",
  "Країна походження": "Гватемала",
  "Регіон": "Уеуетенанго",
  "Ферма": "назва ферми або не вказано",
  "Оцінка SCA": "84",
  "Спосіб обробки": "Organic",
  "Категорія": "Зернова"
}
Для товарів обовʼязково заповни "Кислотність", "Солодкість", "Тіло", "Фруктовість" числами 0-10. Якщо точного джерела немає — дай обережну приблизну оцінку за профілем товару.
Для чаю замість кавових полів використовуй "Тип чаю", "Температура заварювання", "Час настоювання", "Кількість настоїв", "Рекомендація".
Для наборів використовуй "Склад набору", "Формат", "Подарунковий формат", "Кому підійде", "Рекомендація".
---CONTENT---
(опис у вказаному форматі)
---END---`;

function stripSeoMarkers(value) {
  return (value || '')
    .replace(/^\s*---(?:TITLE|META|H1|RIGHT_CARD|ATTRIBUTES|CONTENT|END)---\s*/gim, '')
    .trim();
}

function extractSeoSection(text, from, to) {
  const startRe = new RegExp(`---\\s*${from}\\s*---`, 'i');
  const startMatch = text.match(startRe);
  if (!startMatch) return '';

  const start = startMatch.index + startMatch[0].length;
  const rest = text.slice(start);
  const endRe = to
    ? new RegExp(`---\\s*${to}\\s*---`, 'i')
    : /---\s*END\s*---/i;
  const endMatch = rest.match(endRe);
  const raw = endMatch ? rest.slice(0, endMatch.index) : rest;
  return stripSeoMarkers(raw);
}

function parseSeoResponse(text) {
  const title = extractSeoSection(text, 'TITLE', 'META');
  const metaDescription = extractSeoSection(text, 'META', 'H1');
  const h1 = extractSeoSection(text, 'H1', 'RIGHT_CARD') || extractSeoSection(text, 'H1', 'CONTENT');
  const rightCard = extractSeoSection(text, 'RIGHT_CARD', 'ATTRIBUTES') || extractSeoSection(text, 'RIGHT_CARD', 'CONTENT');
  const attributesRaw = extractSeoSection(text, 'ATTRIBUTES', 'CONTENT');
  let content = extractSeoSection(text, 'CONTENT', 'END');

  if (!content) {
    content = text
      .replace(/[\s\S]*?---\s*CONTENT\s*---/i, '')
      .replace(/---\s*END\s*---[\s\S]*$/i, '');
  }

  content = stripSeoMarkers(content);

  return {
    title,
    metaDescription,
    h1,
    rightCard,
    attributes: parseAttributesBlock(attributesRaw, {
      title,
      h1,
      rightCard
    }),
    content: content || stripSeoMarkers(text)
  };
}

function parseAttributesBlock(raw, fallback = {}) {
  const text = String(raw || '').trim();
  if (text) {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return normalizeGeneratedAttributes(parsed);
      }
    } catch {}
  }
  return inferAttributesFromText(`${fallback.title || ''}\n${fallback.h1 || ''}\n${fallback.rightCard || ''}`);
}

function normalizeGeneratedAttributes(input) {
  const aliasMap = {
    'Країна': 'Країна походження',
    'Походження': 'Країна походження',
    'Обробка': 'Спосіб обробки',
    'Спосіб': 'Спосіб обробки',
    'Сорт кави': 'Сорт',
    'Різновид': 'Сорт',
    'Культивар': 'Сорт',
    'Ферма / станція': 'Ферма',
    'Станція': 'Ферма',
    'Roast': 'Ступінь обсмаження',
    'Обсмаження': 'Ступінь обсмаження',
    'Склад': 'Склад набору',
    'Що всередині': 'Склад набору',
    'Тип': 'Тип чаю',
    'Температура': 'Температура заварювання',
    'Час': 'Час настоювання',
    'Настої': 'Кількість настоїв'
  };
  const source = { ...(input || {}) };
  for (const [from, to] of Object.entries(aliasMap)) {
    if (source[from] !== undefined && source[to] === undefined) source[to] = source[from];
  }
  const allowed = [
    'Кислотність',
    'Солодкість',
    'Тіло',
    'Післясмак',
    'Фруктовість',
    'Смак',
    'Ступінь обсмаження',
    'Країна походження',
    'Регіон',
    'Ферма',
    'Сорт',
    'Оцінка SCA',
    'Висота зростання',
    'Спосіб обробки',
    'Категорія',
    'Технологія обсмаження',
    'Тип чаю',
    'Склад набору',
    'Формат',
    'Подарунковий формат',
    'Кому підійде',
    'Рекомендація',
    'Температура заварювання',
    'Час настоювання',
    'Кількість настоїв'
  ];
  const out = {};
  const numericKeys = new Set(['Кислотність', 'Солодкість', 'Тіло', 'Післясмак', 'Фруктовість', 'Оцінка SCA']);
  const keys = [...allowed, ...Object.keys(input || {}).filter(key => !allowed.includes(key) && !aliasMap[key])];
  for (const key of keys) {
    const value = source[key];
    if (value === undefined || value === null || !String(value).trim()) continue;
    if (numericKeys.has(key)) {
      const match = String(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
      if (!match) continue;
      const num = Number(match[0]);
      if (!Number.isFinite(num)) continue;
      if (key === 'Оцінка SCA') {
        out[key] = String(Math.max(0, Math.min(100, num)));
      } else {
        out[key] = String(Math.max(0, Math.min(10, num)));
      }
      continue;
    }
    if (key === 'Смак' && !hasUsefulTasteNotes(value)) continue;
    if (!isUsefulTextValue(value)) continue;
    out[key] = String(value).trim();
  }
  return out;
}

function inferAttributesFromText(text) {
  const source = String(text || '');
  const out = {};
  const numericKeys = ['Кислотність', 'Солодкість', 'Тіло', 'Післясмак', 'Фруктовість', 'Оцінка SCA'];
  for (const key of numericKeys) {
    const re = new RegExp(`${key}[^0-9]{0,30}([0-9]+(?:[\\.,][0-9]+)?)`, 'i');
    const match = source.match(re);
    if (match) out[key] = match[1].replace(',', '.');
  }
  const textKeys = ['Смак', 'Ступінь обсмаження', 'Країна походження', 'Регіон', 'Ферма', 'Сорт', 'Висота зростання', 'Спосіб обробки', 'Категорія', 'Тип чаю', 'Склад набору', 'Формат', 'Подарунковий формат', 'Кому підійде', 'Рекомендація', 'Температура заварювання', 'Час настоювання', 'Кількість настоїв'];
  for (const key of textKeys) {
    const re = new RegExp(`${key}\\s*[:\\-–]\\s*([^\\n<;]+)`, 'i');
    const match = source.match(re);
    if (match) out[key] = match[1].trim();
  }
  return out;
}

function htmlTextTail(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(-220);
}

function isLikelyIncompleteSeoResponse(raw, parsed) {
  const source = String(raw || '');
  if (!/---\s*END\s*---/i.test(source)) return true;
  const content = String(parsed?.content || '').trim();
  if (content.length < 700) return true;
  const tail = htmlTextTail(content);
  if (!tail) return true;
  if (/[,:;–—-]\s*$/.test(tail)) return true;
  if (/\b(і|та|або|але|щоб|для|у|в|з|зі|на|як|який|яка|яке|що)$/i.test(tail)) return true;
  return false;
}

function mergeSeoContinuation(raw, continuation) {
  const next = String(continuation || '').trim();
  if (!next) return raw;
  const cleaned = next.replace(/^\s*---\s*CONTENT\s*---\s*/i, '');
  return `${String(raw || '').trim()}\n${cleaned}`;
}

async function completeSeoIfNeeded(raw, parsed, systemPrompt, userPrompt) {
  if (!isLikelyIncompleteSeoResponse(raw, parsed)) return { raw, parsed, completed: false };

  const continuation = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
    system: `${systemPrompt}

Ти дописуєш обрізану відповідь. Поверни ТІЛЬКИ продовження з місця обриву. Не повторюй уже написаний текст. Заверш відповідь маркером ---END---.`,
    messages: [{
      role: 'user',
      content: `Оригінальне завдання:
${userPrompt}

Обрізана відповідь нижче. Продовж її з останнього символу, не дублюй уже написане, закрий HTML-теги якщо потрібно і постав ---END---.

${String(raw || '').slice(-5000)}`
    }]
  });

  const mergedRaw = mergeSeoContinuation(raw, continuation.content[0].text);
  return {
    raw: mergedRaw,
    parsed: parseSeoResponse(mergedRaw),
    completed: true
  };
}

function plainOneLine(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[{}\[\]<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlEscape(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

function escapeCountryRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function localizeCountryNamesUa(value) {
  let output = String(value || '');
  for (const [alias, uaName] of COUNTRY_NAME_UA_ALIASES) {
    const pattern = alias.split(/\s+/).map(escapeCountryRegExp).join('[\\s-]+');
    const rx = new RegExp(`(^|[^\\p{L}])(${pattern})(?=$|[^\\p{L}])`, 'giu');
    output = output.replace(rx, `$1${uaName}`);
  }
  return output;
}

function truncateText(value, maxLength) {
  const text = plainOneLine(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

function formatSeoTitle(value, maxLength = 60) {
  const brand = ' | Mercato';
  const clean = localizeCountryNamesUa(plainOneLine(value)).replace(/\s+\|\s*Mercato\s*$/i, '');
  const maxBase = Math.max(20, maxLength - brand.length);
  if (clean.length <= maxBase) return `${clean}${brand}`;
  const shortened = clean
    .slice(0, maxBase)
    .replace(/\s+\S*$/, '')
    .replace(/[,\-–—:;|]\s*$/, '')
    .trim();
  return `${shortened || clean.slice(0, maxBase).trim()}${brand}`;
}

function cleanProductDisplayName(value) {
  return localizeCountryNamesUa(plainOneLine(value))
    .replace(/\s*[|–—-]\s*Mercato\s*$/iu, '')
    .replace(/\s+купити(?:\s+в\s+Україні)?\s*$/iu, '')
    .replace(/\s+купити\s*$/iu, '')
    .replace(/[,\s;:–—-]+$/u, '')
    .trim();
}

function firstKeyword(keywords, fallback) {
  const first = String(keywords || '')
    .split(/[,\n|;]/)
    .map(item => plainOneLine(item))
    .find(Boolean);
  return localizeCountryNamesUa(first || plainOneLine(fallback));
}

function normalizeProductTypeKey(value) {
  const raw = String(value || '').trim().toLowerCase();
  const map = {
    coffee: 'coffee',
    kava: 'coffee',
    'кава': 'coffee',
    tea: 'tea',
    chai: 'tea',
    chay: 'tea',
    'чай': 'tea',
    coffee_set: 'coffee_set',
    coffeeset: 'coffee_set',
    kava_set: 'coffee_set',
    'кавовий набір': 'coffee_set',
    tea_set: 'tea_set',
    teaset: 'tea_set',
    chai_set: 'tea_set',
    'чайний набір': 'tea_set',
    gift_set: 'gift_set',
    gift: 'gift_set',
    set: 'gift_set',
    'набір': 'gift_set',
    cocoa: 'cocoa',
    cacao: 'cocoa',
    'какао': 'cocoa'
  };
  return map[raw] || '';
}

function inferProductTypeKey(...values) {
  const explicit = values.map(normalizeProductTypeKey).find(Boolean);
  if (explicit) return explicit;

  const text = values.map(value => plainOneLine(value).toLowerCase()).join(' ');
  const hasSet = /(набір|набор|сет|комплект|бокс|box|gift|подар|дегустац|collection|bundle)/i.test(text);
  const hasTea = /(чай|чаю|tea|chai|chay|matcha|матча|улун|оолонг|пуер|сенча|саусеп|soursop|ройбуш|rooibos|каркаде|трав|herbal|earl grey|ерг грей|ерл грей|асам|ассам|цейлон)/i.test(text);
  const hasCoffee = /(кава|кави|кофе|coffee|kava|arabica|арабіка|robusta|робуста|еспресо|espresso|decaf|декаф)/i.test(text);
  const hasCocoa = /(какао|cacao|cocoa|шоколад)/i.test(text);

  if (hasSet && hasTea && !hasCoffee) return 'tea_set';
  if (hasSet && hasCoffee) return 'coffee_set';
  if (hasSet) return 'gift_set';
  if (hasTea) return 'tea';
  if (hasCocoa) return 'cocoa';
  return 'coffee';
}

function productCategoryName(productName, productType = '') {
  const explicit = normalizeProductTypeKey(productType);
  const inferred = inferProductTypeKey(productName);
  const type = explicit || inferred;
  if (type === 'tea') return 'Чай';
  if (type === 'tea_set') return 'Набір чаю';
  if (type === 'coffee_set') return 'Набір кави';
  if (type === 'gift_set') return 'Подарунковий набір';
  if (type === 'cocoa') return 'Какао';
  return 'Кава';
}

function productTypeKeyFromCategory(category) {
  const value = String(category || '').toLowerCase();
  if (/набір чаю|чайний набір/.test(value)) return 'tea_set';
  if (/набір кави|кавовий набір/.test(value)) return 'coffee_set';
  if (/подарунковий набір|набір/.test(value)) return 'gift_set';
  if (/чай/.test(value)) return 'tea';
  if (/какао/.test(value)) return 'cocoa';
  return 'coffee';
}

function isTeaCategory(category) {
  return ['tea', 'tea_set'].includes(productTypeKeyFromCategory(category));
}

function isCoffeeCategory(category) {
  return ['coffee', 'coffee_set'].includes(productTypeKeyFromCategory(category));
}

function isSetCategory(category) {
  return ['coffee_set', 'tea_set', 'gift_set'].includes(productTypeKeyFromCategory(category));
}

function productExperienceWord(category) {
  if (isTeaCategory(category)) return 'настої';
  if (category === 'Какао') return 'напої';
  if (isSetCategory(category)) return 'добірці';
  return 'чашці';
}

function productQualityLine(category) {
  const type = productTypeKeyFromCategory(category);
  if (type === 'coffee') return 'Свіжа обсмажка під замовлення';
  if (type === 'coffee_set') return 'Свіжа підготовка кавового набору';
  if (type === 'tea' || type === 'tea_set') return 'Акуратне фасування для чистого аромату';
  if (type === 'gift_set') return 'Акуратне пакування подарункового набору';
  return 'Акуратна підготовка товару';
}

function productFeedSafeLine(value = '') {
  return localizeCountryNamesUa(plainOneLine(value))
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\bwww\.\S+/gi, '')
    .replace(/\b(безкоштовн\w*\s+доставк\w*|free shipping|доставк\w*|відправк\w*|знижк\w*|акці\w*|промокод\w*|розпродаж\w*|найнижч\w*\s+цін\w*)\b/giu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .trim();
}

function productDraftHash(value = '') {
  return [...String(value || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function normalizeHarvestYear(value = '') {
  const text = plainOneLine(value);
  if (!isUsefulTextValue(text)) return '';
  const match = text.match(/\b(20\d{2})(?:\s*[\/\-–—]\s*(20\d{2}|\d{2}))?\b/);
  if (!match) return text.replace(/^(рік\s+врожаю|врожай|урожай|harvest|crop\s+year)\s*[:\-–—]?\s*/iu, '').trim();
  const start = match[1];
  let end = match[2] || '';
  if (end && end.length === 2) end = `${start.slice(0, 2)}${end}`;
  return end ? `${start}/${end}` : start;
}

function isProductFormatProcessing(value = '') {
  const lower = plainOneLine(value).toLowerCase();
  return /(^|[\s,;:])(в\s+зернах|зернова|зерно|мелен[аийеі]|помел|капсул|др[іи]п|пакетик|фасован|фасування)($|[\s,;:])/iu.test(lower)
    && !/(^|[\s,;:])(washed|natural|honey|anaerobic|carbonic|мит[аоиій]|натурал|медов|анаероб|фермент|суха\s+оброб)($|[\s,;:])/iu.test(lower);
}

function productLotProcessingRow(processing = '') {
  if (!isUsefulTextValue(processing)) return null;
  return [isProductFormatProcessing(processing) ? 'Формат' : 'Обробка', processing];
}

function harvestYearFromAttributes(attributes = {}) {
  for (const [key, value] of Object.entries(attributes || {})) {
    if (/^(рік\s+врожаю|врожай|урожай|harvest|crop\s+year)$/iu.test(plainOneLine(key))) {
      const normalized = normalizeHarvestYear(value);
      if (normalized) return normalized;
    }
  }
  return '';
}

function processingInfoForProduct(category, processing = '') {
  const raw = plainOneLine(processing);
  const lower = raw.toLowerCase();
  const baseTitle = isTeaCategory(category) ? 'Тип / підготовка' : 'Обробка';
  if (!isUsefulTextValue(raw)) {
    if (isTeaCategory(category)) {
      return { title: baseTitle, line: 'Тип чаю краще пояснювати через аромат, колір настою, мʼякість і можливу терпкість.' };
    }
    if (isSetCategory(category)) {
      return { title: 'Формат', line: 'Для набору важливо дивитися на склад, смак і сценарій: дегустація, щоденне використання або подарунок.' };
    }
    return { title: baseTitle, line: 'Якщо метод обробки не вказаний, його не треба вигадувати. Смак краще описувати через ноти, тіло, кислотність і рекомендований спосіб приготування.' };
  }

  if (isProductFormatProcessing(raw)) {
    return {
      title: 'Формат',
      line: `${raw} — це формат товару, а не метод обробки зерна. Для вибору смаку важливіші походження, обсмаження і рецепт приготування.`
    };
  }

  if (isTeaCategory(category)) {
    return { title: baseTitle, line: `${raw} варто пояснювати через аромат, колір настою, мʼякість і можливу терпкість.` };
  }
  if (isSetCategory(category)) {
    return { title: 'Формат / склад', line: `${raw} описує склад набору і допомагає зрозуміти, для чого він краще підходить.` };
  }

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

  if (hasGradeOnly) {
    return {
      title: 'Клас / підготовка',
      line: `${raw} — це не спосіб обробки, а клас і підготовка зерна. Позначення говорить про висоту вирощування, щільність і сортування; остаточне враження формують смакові ноти, обсмаження і рецепт.`
    };
  }
  if (hasWashed) {
    return {
      title: baseTitle,
      line: `Мита обробка (${raw}) зазвичай дає чистішу чашку, прозорішу кислотність і чіткі смакові ноти. Солодкість і тіло все одно залежать від сорту, обсмаження та рецепта.`
    };
  }
  if (hasNatural) {
    return {
      title: baseTitle,
      line: `Натуральна обробка (${raw}) часто дає більше солодкості, щільніше тіло і помітнішу фруктовість, іноді з винними або ферментними відтінками.`
    };
  }
  if (hasHoney) {
    return {
      title: baseTitle,
      line: `Медова обробка (${raw}) зазвичай знаходиться між митою і натуральною: більше солодкості та тіла, але без втрати чистоти профілю.`
    };
  }
  if (hasAnaerobic) {
    return {
      title: baseTitle,
      line: `Анаеробна ферментація (${raw}) може давати інтенсивніші ароматичні ноти, яскраву фруктовість і складніший післясмак. Таку каву краще заварювати уважно, щоб не перевитягнути ферментність.`
    };
  }
  if (hasDecaf) {
    return {
      title: baseTitle,
      line: `Декофеїнізація (${raw}) прибирає кофеїн. Смак залежить від методу, походження зерна й обсмаження, тому профіль варто оцінювати через ноти та тіло в чашці.`
    };
  }
  return {
    title: 'Обробка / підготовка',
    line: `${raw} — характеристика обробки або підготовки. Якщо це не метод обробки, використовуйте її як додатковий факт, а смак описуйте окремо.`
  };
}

function productDefaultLinks(category) {
  const type = productTypeKeyFromCategory(category);
  if (type === 'tea') return '/ua-chai | /ua-chai/cha-sencha | /ua-chai/zelenuy-chay-sausesp';
  if (type === 'tea_set') return '/ua-chai | /ua-chai/cha-sencha | /kava-nabory';
  if (type === 'coffee_set') return '/kava-nabory | /kava-v-zernah | /svizhoobsmazhena-kava';
  if (type === 'gift_set') return '/kava-nabory | /ua-chai | /kava-v-zernah';
  if (type === 'cocoa') return '/kakao | /ua-chai | /kava-nabory';
  return '/kava-v-zernah | /fermerska-kava | /svizhoobsmazhena-kava | /kava-dlya-kavomashiny';
}

function productLinksForCategory(links, category) {
  const clean = plainOneLine(links);
  if (!clean) return productDefaultLinks(category);
  const lower = clean.toLowerCase();
  const hasCoffeeLinks = /\/?kava|fermerska|svizhoobsmazhena|kavomash|coffee/.test(lower);
  const hasTeaLinks = /\/?ua-chai|\/?chai|\/?chay|tea|sencha|souses?p|саусеп|чай/.test(lower);
  const type = productTypeKeyFromCategory(category);
  if ((type === 'tea' || type === 'tea_set') && hasCoffeeLinks && !hasTeaLinks) {
    return productDefaultLinks(category);
  }
  if (type === 'coffee' && hasTeaLinks && !hasCoffeeLinks) {
    return productDefaultLinks(category);
  }
  return clean;
}

function cleanProductTypeNameForAttributes(productName) {
  const text = plainOneLine(productName).toLowerCase();
  if (/сенча/.test(text)) return 'Сенча';
  if (/матча|matcha/.test(text)) return 'Матча';
  if (/улун|оолонг/.test(text)) return 'Улун';
  if (/пуер/.test(text)) return 'Пуер';
  if (/ройбуш|rooibos/.test(text)) return 'Ройбуш';
  if (/каркаде/.test(text)) return 'Каркаде';
  if (/трав/.test(text)) return 'Травʼяний чай';
  if (/зел/.test(text)) return 'Зелений чай';
  if (/чорн|черн|black/.test(text)) return 'Чорний чай';
  return 'Чай';
}

function isGenericTeaTypeValue(value) {
  const text = plainOneLine(value).toLowerCase();
  if (!text) return true;
  return /^(gunpowder|ганпаудер|гунпаудер|зелений|зеленый|green|чорний|черный|black|чай|tea|ароматизований|ароматизированный|листовий|листовой)$/i.test(text);
}

function isUsefulTextValue(value) {
  const text = plainOneLine(value);
  if (!text) return false;
  if (/^(не вказано|не указано|уточнити|уточняется|n\/a|null|undefined|-|—)$/i.test(text)) return false;
  return true;
}

function isUsefulBrewingText(value) {
  const text = plainOneLine(value);
  if (!isUsefulTextValue(text)) return false;
  if (/^(купити|купуйте|замовити|до кошика|в кошик|каталог|перейти|детальніше|читати|наявність|відгуки|характеристики)$/iu.test(text)) return false;
  if (/\b(грн|uah|₴|доставка|відправка|оплата|кошик|замовлення)\b/iu.test(text)) return false;
  return true;
}

function isNumericScaleText(value) {
  const text = plainOneLine(value).toLowerCase();
  if (!text) return false;
  if (/^[\d\s.,:/+-]+$/.test(text)) return true;
  if (/^\d+(?:[\.,]\d+)?\s*(?:\/|з|із|из|out\s+of)\s*\d+/i.test(text)) return true;
  if (/^(?:низька|середня|висока|medium|low|high|баланс|збалансовано|мʼяка|м'яка)\s*\d*(?:[\.,]\d+)?$/i.test(text)) return true;
  return false;
}

function splitCleanList(value, fallback = []) {
  const raw = isUsefulTextValue(value) ? String(value) : '';
  const items = raw
    .split(/[,;\n|]+/)
    .map(item => plainOneLine(item))
    .filter(isUsefulTextValue);
  const base = items.length ? items : fallback;
  return [...new Set(base.map(item => plainOneLine(item)).filter(Boolean))].slice(0, 8);
}

function joinHumanList(items, fallback = '') {
  const clean = (items || []).map(item => plainOneLine(item)).filter(Boolean);
  if (!clean.length) return fallback;
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} і ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')} і ${clean[clean.length - 1]}`;
}

function hasLetters(value) {
  return /[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(String(value || ''));
}

function hasUsefulTasteNotes(value) {
  const text = plainOneLine(value);
  if (!text || !hasLetters(text)) return false;
  if (isNumericScaleText(text)) return false;
  if (/^(смак|кислотність|солодкість|тіло|післясмак|фруктовість)$/i.test(text)) return false;
  return true;
}

function splitTasteNotes(value, fallback = []) {
  const raw = hasUsefulTasteNotes(value) ? String(value) : '';
  const items = raw
    .split(/[,;\n|/]+/)
    .map(item => plainOneLine(item))
    .filter(hasUsefulTasteNotes);
  const base = items.length ? items : fallback.filter(hasUsefulTasteNotes);
  return [...new Set(base.map(item => plainOneLine(item)).filter(Boolean))].slice(0, 7);
}

function clampTasteScore(value) {
  const num = Number(String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/)?.[0]);
  if (!Number.isFinite(num)) return null;
  return Math.max(0, Math.min(10, Math.round(num * 10) / 10));
}

function estimateTasteProfileScores({ productName = '', productType = '', origin = '', region = '', processing = '', flavors = '', keywords = '' } = {}) {
  const category = productCategoryName(productName, productType);
  const source = [
    productName,
    productType,
    origin,
    region,
    processing,
    flavors,
    keywords
  ].map(item => plainOneLine(item).toLowerCase()).join(' ');
  const score = isTeaCategory(category)
    ? { acidity: 3.5, sweetness: 5, body: 4, fruitiness: 3.5 }
    : category === 'Какао'
      ? { acidity: 2, sweetness: 6.5, body: 8, fruitiness: 2 }
      : isSetCategory(category)
        ? { acidity: 4.5, sweetness: 6, body: 5.5, fruitiness: 4.5 }
        : { acidity: 5, sweetness: 6, body: 6, fruitiness: 5 };
  const add = (key, value) => { score[key] += value; };
  const has = (re) => re.test(source);

  if (has(/decaf|декаф|без кофе|co2|декоф/)) {
    add('acidity', -1);
    add('sweetness', 0.4);
    add('body', 0.4);
    add('fruitiness', -0.7);
  }
  if (has(/цитрус|лимон|апельс|грейп|лайм|бергамот|кисл/)) {
    add('acidity', 1.8);
    add('fruitiness', 1.2);
  }
  if (has(/ягод|смород|мали|полуниц|суниц|чорниц|вишн|журавлин|винн|виноград/)) {
    add('acidity', 1.3);
    add('fruitiness', 2);
    add('sweetness', 0.4);
  }
  if (has(/тропіч|манго|ананас|мараку|персик|абрикос|нектарин|слив|кісточк/)) {
    add('acidity', 0.8);
    add('fruitiness', 1.8);
    add('sweetness', 0.8);
  }
  if (has(/яблук|груш|сидр/)) {
    add('acidity', 0.8);
    add('fruitiness', 1);
  }
  if (has(/шокол|какао|горіх|мигдал|фундук|карам|іриск|мед|нуга|сухофрукт|родзин|фінік/)) {
    add('sweetness', 1.5);
    add('body', 1.1);
    add('acidity', -0.7);
    add('fruitiness', -0.6);
  }
  if (has(/квіт|жасмин|бергамот|чай|трав|делікат/)) {
    add('acidity', 0.4);
    add('fruitiness', 0.4);
    add('body', -0.5);
  }
  if (has(/мит|washed|вош|колумб|кені|ефіоп|руанд|бурунд/)) {
    add('acidity', 0.7);
    add('fruitiness', 0.5);
  }
  if (has(/натурал|natural|анаероб|анаэроб|honey|хани|фермент/)) {
    add('sweetness', 1);
    add('fruitiness', 1);
    add('body', 0.5);
  }
  if (has(/бразил|інді|вʼєтнам|вьетнам|робуста|espresso|еспресо|темн|dark/)) {
    add('acidity', -1);
    add('body', 1.2);
    add('sweetness', 0.4);
    add('fruitiness', -0.8);
  }
  if (has(/filter|фільтр|v60|аеропрес|кемекс/)) {
    add('acidity', 0.3);
    add('fruitiness', 0.3);
  }

  return {
    'Кислотність': String(clampTasteScore(score.acidity) ?? 5),
    'Солодкість': String(clampTasteScore(score.sweetness) ?? 6),
    'Тіло': String(clampTasteScore(score.body) ?? 6),
    'Фруктовість': String(clampTasteScore(score.fruitiness) ?? 5)
  };
}

function ensureRequiredTasteProfileScores(attrs = {}, ctx = {}) {
  const out = { ...(attrs || {}) };
  const estimates = estimateTasteProfileScores({
    ...ctx,
    flavors: hasUsefulTasteNotes(out['Смак']) ? out['Смак'] : ctx.flavors
  });
  for (const key of ['Кислотність', 'Солодкість', 'Тіло', 'Фруктовість']) {
    const current = clampTasteScore(out[key]);
    out[key] = String(current ?? estimates[key]);
  }
  return out;
}

function productKindLabel(category) {
  if (category === 'Чай') return 'чай';
  if (category === 'Набір чаю') return 'чайний набір';
  if (category === 'Набір кави') return 'кавовий набір';
  if (category === 'Подарунковий набір') return 'подарунковий набір';
  if (category === 'Какао') return 'какао';
  return 'кава';
}

function inferCustomerFit({ productName, category, flavors }) {
  const source = `${productName || ''} ${flavors || ''}`.toLowerCase();
  if (category === 'Набір чаю') return 'тим, хто хоче спробувати кілька чайних профілів або обрати мʼякий подарунок';
  if (category === 'Набір кави') return 'тим, хто хоче дегустацію кількох кав або зрозумілий подарунок для кавомана';
  if (category === 'Подарунковий набір') return 'тим, хто шукає готовий подарунок без довгого вибору окремих товарів';
  if (category === 'Чай') return 'тим, хто хоче ароматний настій без зайвої терпкості';
  if (isCoffeeCategory(category) && /decaf|декаф|без кофе/.test(source)) {
    return 'тим, хто хоче кавовий смак без зайвого кофеїнового навантаження';
  }
  if (/цитрус|ягод|винн|смород|мали|вишн|грейп|апельс|лимон|фрукт/.test(source)) {
    return 'тим, хто любить яскравішу, фруктову і чисту чашку';
  }
  if (/шокол|горіх|карам|какао|мед|сухофрукт/.test(source)) {
    return 'тим, хто шукає солодший, мʼякий і зрозумілий профіль';
  }
  return 'тим, хто підбирає каву під свій метод заварювання і хоче передбачуваний профіль у чашці';
}

function inferBrewSummary({ category, brewing }) {
  if (isUsefulBrewingText(brewing)) return plainOneLine(brewing);
  if (category === 'Набір чаю') return 'кожен чай окремо; починайте з нижчої температури і коротшого настою, якщо на упаковці не вказано інакше';
  if (category === 'Набір кави') return 'готуйте кожну каву окремо під свій метод: фільтр, гейзер, еспресо або чашку';
  if (category === 'Подарунковий набір') return 'використовуйте кожну позицію набору за її типом і рекомендацією на упаковці';
  if (category === 'Чай') return '70-85°C і короткий настій 1.5-3 хвилини, якщо на упаковці не вказано інакше';
  if (category === 'Какао') return 'готувати на молоці або воді залежно від бажаної щільності';
  return 'еспресо, фільтр, турка, гейзер або аеропрес; помел підбирайте під ваш метод';
}

function inferTasteFlow({ productName, category, flavors }) {
  const notes = splitTasteNotes(flavors);
  const notesText = joinHumanList(notes);
  if (notesText) {
    const experience = productExperienceWord(category);
    return `${plainOneLine(productName)} розкривається через ${notesText}. У ${experience} звертайте увагу на чистоту аромату, баланс, тіло і післясмак, а не тільки на одну окрему ноту.`;
  }
  if (category === 'Набір чаю') {
    return `${plainOneLine(productName)} варто оцінювати як добірку різних чайних настроїв: аромат, мʼякість настою, післясмак і доречність для подарунка або щоденного чаювання.`;
  }
  if (category === 'Набір кави') {
    return `${plainOneLine(productName)} варто оцінювати як дегустацію кількох кавових профілів. Такий формат допомагає порівняти смак, тіло і післясмак без купівлі великого пакування одного сорту.`;
  }
  if (category === 'Подарунковий набір') {
    return `${plainOneLine(productName)} варто оцінювати за складом, зрозумілістю смаків і тим, наскільки легко людині одразу використати подарунок без додаткових пояснень.`;
  }
  if (category === 'Чай') {
    return `${plainOneLine(productName)} варто оцінювати за чистотою настою, мʼякістю тіла і післясмаком. Починайте з делікатного заварювання, а потім підсилюйте час або температуру під власний смак.`;
  }
  return `${plainOneLine(productName)} варто оцінювати за балансом солодкості, тіла і післясмаку. Якщо поле "Смак" ще не заповнене, орієнтуйтесь на походження, обробку і метод приготування: ці параметри найсильніше впливають на відчуття в чашці.`;
}

function buildInternalLinksHtml(links, category) {
  const defaults = productDefaultLinks(category).split('|').map(item => item.trim()).filter(Boolean);
  const safeLinks = productLinksForCategory(links, category);
  const items = String(safeLinks || defaults.join('|'))
    .split('|')
    .map(item => plainOneLine(item))
    .filter(Boolean)
    .slice(0, 4);
  if (!items.length) return '';
  const html = items.map(item => {
    const href = /^https?:\/\//i.test(item) || item.startsWith('/') ? item : `/${item.replace(/^\/+/, '')}`;
    const label = item
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/^\/+/, '')
      .replace(/[-_/]+/g, ' ')
      .trim() || item;
    return `<a href="${htmlEscape(href)}" style="color:#8a5a35;text-decoration:none;border-bottom:1px solid #e5d2c4;">${htmlEscape(label)}</a>`;
  }).join(' · ');
  return `<div data-merchant-feed-exclude="true" style="border-top:1px solid #f1f5f9;margin:22px 0 0;padding-top:14px;color:#6b7280;font-size:14px;">
    <strong style="display:block;color:#1f2937;margin:0 0 6px;">Схожі розділи</strong>
    <p style="margin:0;">${html}</p>
  </div>`;
}

function buildMercatoRightCardText({ productName, productType = '', origin, region, processing, flavors, brewing, harvestYear = '', attributes = null, keywords = '' }) {
  const safeProductName = localizeCountryNamesUa(productName);
  const category = productCategoryName(safeProductName, productType);
  const attrs = attributes || {
    'Смак': hasUsefulTasteNotes(flavors) ? plainOneLine(flavors) : ''
  };
  const taste = hasUsefulTasteNotes(attrs['Смак'])
    ? plainOneLine(attrs['Смак'])
    : (hasUsefulTasteNotes(flavors) ? plainOneLine(flavors) : '');
  const profileLines = ['Кислотність', 'Солодкість', 'Тіло', 'Фруктовість']
    .map(key => attrs[key] ? `${key}: ${plainOneLine(attrs[key])}` : '')
    .filter(Boolean);
  return [
    plainOneLine(safeProductName),
    ...profileLines,
    taste ? `Смак: ${taste}` : '',
    isUsefulTextValue(origin) ? `Походження: ${localizeCountryNamesUa(plainOneLine(origin))}` : '',
    isUsefulTextValue(attrs['Ферма']) ? `Ферма / станція: ${plainOneLine(attrs['Ферма'])}` : '',
    isUsefulTextValue(attrs['Сорт']) ? `Сорт: ${plainOneLine(attrs['Сорт'])}` : '',
    normalizeHarvestYear(harvestYear) ? `Рік врожаю: ${normalizeHarvestYear(harvestYear)}` : '',
    isUsefulTextValue(processing) ? `Обробка: ${plainOneLine(processing)}` : '',
    isUsefulBrewingText(brewing) ? `Рекомендовано: ${plainOneLine(brewing)}` : '',
    productQualityLine(category)
  ].filter(Boolean).join('\n');
}

function buildMercatoProductDescriptionHtml({ productName, productType = '', origin, region, farm, variety, processing, flavors, brewing, harvestYear = '', keywords, links }) {
  const name = cleanProductDisplayName(productName) || 'Товар';
  const category = productCategoryName(name, productType);
  const kind = productKindLabel(category);
  const cleanOrigin = isUsefulTextValue(origin) ? localizeCountryNamesUa(plainOneLine(origin)) : '';
  const cleanRegion = isUsefulTextValue(region) ? plainOneLine(region) : '';
  const cleanFarm = isUsefulTextValue(farm) ? plainOneLine(farm) : '';
  const cleanVariety = isUsefulTextValue(variety) ? plainOneLine(variety) : '';
  const cleanProcessing = isUsefulTextValue(processing) ? plainOneLine(processing) : '';
  const cleanHarvestYear = normalizeHarvestYear(harvestYear);
  const flavorNotes = splitTasteNotes(flavors);
  const flavorFallback = isSetCategory(category)
    ? 'добірка зрозумілих смаків для дегустації або подарунка'
    : category === 'Кава'
      ? 'збалансований профіль, чисте тіло і зрозумілий післясмак'
      : category === 'Чай'
        ? 'чистий аромат, мʼякий настій і приємний післясмак'
        : 'чистий, зрозумілий профіль без зайвої важкості';
  const flavorText = localizeCountryNamesUa(joinHumanList(flavorNotes, flavorFallback));
  const customerFit = inferCustomerFit({ productName: name, category, flavors: flavorText });
  const customerFitFor = customerFit.replace(/^тим(?=[\s,])/iu, 'тих');
  const brewSummary = inferBrewSummary({ category, brewing });
  const keyword = localizeCountryNamesUa(firstKeyword(keywords, name));
  const uniqueValues = values => {
    const seen = new Set();
    return values
      .map(value => plainOneLine(value))
      .filter(isUsefulTextValue)
      .filter(value => {
        const key = value.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };
  const originLabel = uniqueValues([cleanOrigin, cleanFarm, cleanRegion]).join(', ');
  const tasteFlow = inferTasteFlow({ productName: name, category, flavors: flavorNotes.join(', ') });
  const processingInfo = processingInfoForProduct(category, cleanProcessing);
  const brewLine = category === 'Кава'
    ? `Почніть зі свого звичного методу: ${brewSummary}. Якщо чашка виходить різкою, зробіть помел трохи грубішим; якщо водянистою — трохи дрібнішим.`
    : category === 'Чай'
      ? `Починайте з мʼякшого режиму: ${brewSummary}. Так легше зберегти чистоту настою і не витягнути зайву терпкість.`
      : category === 'Набір чаю'
        ? `Заварюйте кожен чай окремо: ${brewSummary}. Так кожна позиція розкриється чисто, без змішування ароматів і зайвої терпкості.`
        : category === 'Набір кави'
          ? `Готуйте кожну каву з набору окремо: ${brewSummary}. Так легше порівняти смак, тіло й післясмак кожної позиції.`
          : isSetCategory(category)
            ? `Орієнтуйтесь на склад набору: ${brewSummary}. Якщо всередині кілька типів товарів, використовуйте кожен за окремою рекомендацією.`
            : `Починайте з мʼякшого рецепта: ${brewSummary}. Далі регулюйте щільність під власний смак.`;
  const roastLine = category === 'Кава'
    ? 'Обсмажуємо під замовлення на Air Roast System, щоб смак залишався чистим, свіжим і передбачуваним.'
    : category === 'Набір кави'
      ? 'Комплектуємо кавовий набір так, щоб позиції було легко порівнювати між собою і використовувати без зайвих пояснень.'
      : isTeaCategory(category)
        ? 'Фасуємо чай акуратно, щоб аромат залишався чистим, а настій — передбачуваним у щоденному заварюванні.'
        : isSetCategory(category)
          ? 'Комплектуємо набір так, щоб його було легко подарувати або одразу використати після отримання.'
          : 'Готуємо товар акуратно, щоб смак залишався стабільним і зрозумілим для щоденного використання.';
  const lowerFlavor = flavorText.toLowerCase();
  const faqAcidity = isSetCategory(category)
    ? 'Так, якщо ви хочете готовий подарунок або дегустацію без вибору кожної позиції окремо. Перед замовленням варто перевірити склад і формат набору.'
    : category === 'Чай'
      ? (/цитрус|ягод|фрукт|бергамот|трав|квіт/.test(lowerFlavor)
          ? 'У настої може бути помітна фруктовість або легка терпкість. Щоб смак залишався мʼяким, починайте з нижчої температури і коротшого часу.'
          : 'Профіль має бути мʼяким, але терпкість залежить від температури води, часу настоювання і кількості чаю.')
      : /цитрус|ягод|винн|смород|мали|вишн|грейп|апельс|лимон|фрукт/.test(lowerFlavor)
        ? 'Так, у профілі може бути помітна жива фруктова кислинка, але без грубої різкості при коректному заварюванні.'
        : /шокол|горіх|карам|какао|мед|сухофрукт/.test(lowerFlavor)
          ? 'Профіль має бути мʼякшим і солодшим, з менш вираженою кислотністю та комфортним післясмаком.'
          : 'Кислотність залежить від рецепта: дрібніший помел і вища екстракція роблять смак інтенсивнішим, мʼякший рецепт — спокійнішим.';
  const introVariant = productDraftHash(`${name}|${flavorText}|${originLabel}|${cleanProcessing}`) % 3;
  const brewShort = plainOneLine(brewSummary).split(/\s*,\s*|\s*;\s*/).filter(Boolean).slice(0, 4).join(', ');
  const dailyUseLine = category === 'Кава'
    ? `Її зручно брати для щоденного приготування${brewShort ? `: ${htmlEscape(brewShort)}` : ' вдома'}.`
    : category === 'Чай'
      ? 'Це позиція для спокійного заварювання, де важливі чистий аромат, мʼякість настою і контроль часу.'
      : isSetCategory(category)
        ? 'Це готовий формат для дегустації, подарунка або швидкого знайомства з кількома позиціями.'
      : 'Це товар для щоденного використання, де важливо розуміти формат, сценарій і очікуваний результат.';
  const formatHelp = isProductFormatProcessing(cleanProcessing)
    ? 'Формат у зернах дає змогу змолоти каву під свій метод і не привʼязуватися до одного рецепта.'
    : category === 'Кава'
      ? 'Орієнтуйтесь на свій метод приготування і коригуйте помел, якщо чашка виходить різкою або водянистою.'
      : 'Орієнтуйтесь на свій звичний сценарій і коригуйте кількість продукту, температуру або час.';
  const harvestHelp = cleanHarvestYear ? `Врожай ${htmlEscape(cleanHarvestYear)} зазначений у характеристиках нижче.` : '';
  const quickIntroOptions = isSetCategory(category)
    ? [
        `${htmlEscape(name)} — ${htmlEscape(kind)}. ${dailyUseLine} Склад і сценарій використання мають бути зрозумілі без довгого вибору.`,
        `${htmlEscape(name)} поєднує кілька позицій в одному зрозумілому форматі. ${dailyUseLine}`,
        `${htmlEscape(name)} зібраний як готова добірка. ${dailyUseLine}`
      ]
    : [
        `${htmlEscape(name)} — ${htmlEscape(kind)}${cleanOrigin ? ` з ${htmlEscape(cleanOrigin)}` : ''}${cleanRegion ? `, регіон ${htmlEscape(cleanRegion)}` : ''}. ${dailyUseLine} ${formatHelp}`,
        `${htmlEscape(name)} підійде для ${htmlEscape(customerFitFor)}. ${dailyUseLine} ${formatHelp}`,
        `${htmlEscape(name)}. ${dailyUseLine} ${formatHelp} ${originLabel ? `Походження: ${htmlEscape(originLabel)}. ` : ''}${harvestHelp}`
      ];
  const quickIntro = quickIntroOptions[introVariant];
  const prepareTitle = isSetCategory(category) ? 'Як використовувати' : 'Як заварювати';
  const prepareCardTitle = category === 'Кава' ? 'Як готувати' : prepareTitle;
  const thirdInfoTitle = isSetCategory(category) ? 'Формат' : isTeaCategory(category) ? 'Пакування' : 'Свіжість';
  const scenarioLine = category === 'Кава'
    ? `Якщо ви шукаєте ${htmlEscape(keyword)}, орієнтуйтесь на смак, обробку і свій звичний сценарій: ранкова чашка, еспресо, фільтр або спокійне заварювання вдома.`
    : category === 'Чай'
      ? `Якщо ви шукаєте ${htmlEscape(keyword)}, орієнтуйтесь на аромат, мʼякість настою, можливу терпкість і ваш звичний формат чаювання.`
      : isSetCategory(category)
        ? `Якщо ви шукаєте ${htmlEscape(keyword)}, звертайте увагу на склад набору, смак і сценарій: подарунок, дегустація або щоденне використання.`
        : `Якщо ви шукаєте ${htmlEscape(keyword)}, орієнтуйтесь на смак, формат і те, як саме плануєте використовувати товар.`;
  const faqSecondQuestion = isSetCategory(category)
    ? 'Чи підійде на подарунок?'
    : category === 'Чай'
      ? 'Чи буде терпкість?'
      : 'Чи буде кислинка або гірчинка?';
  const harvestCard = cleanHarvestYear
    ? `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:13px 15px;background:#ffffff;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#8a5a35;font-weight:700;margin-bottom:5px;">Врожай</div><div style="color:#374151;">${htmlEscape(cleanHarvestYear)}</div></div>`
    : '';
  const originCard = originLabel
    ? `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:13px 15px;background:#ffffff;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#8a5a35;font-weight:700;margin-bottom:5px;">Походження</div><div style="color:#374151;">${htmlEscape(originLabel)}</div></div>`
    : '';
  const internalLinksHtml = buildInternalLinksHtml(links, category);
  const sectionTitleHtml = label => `<div style="font-size:18px;font-weight:700;color:#1f2937;margin:0 0 10px;padding:0 0 8px;border-bottom:1px solid #eef2f7;">${htmlEscape(label)}</div>`;
  const sectionBlockHtml = (label, body, tone = '') => `<section style="border:1px solid #e5e7eb;border-radius:16px;background:${tone === 'warm' ? '#fffdf8' : '#ffffff'};padding:16px 18px;margin:0 0 18px;box-shadow:0 1px 0 rgba(15,23,42,.03);">
    ${sectionTitleHtml(label)}
    <div style="display:grid;gap:10px;">${body}</div>
  </section>`;
  const lotRowsHtml = rows => {
    const cleanRows = rows.filter(([, value]) => isUsefulTextValue(value));
    if (!cleanRows.length) return '<p style="margin:0;color:#4b5563;">Додайте країну, регіон, обробку, сорт або врожай у факти товару, щоб картка була повнішою.</p>';
    return `<div style="display:grid;gap:0;border:1px solid #eef2f7;border-radius:12px;overflow:hidden;background:#ffffff;">
      ${cleanRows.map(([label, value], index) => `<div style="display:grid;grid-template-columns:minmax(120px,170px) 1fr;gap:12px;${index < cleanRows.length - 1 ? 'border-bottom:1px solid #eef2f7;' : ''}padding:11px 12px;">
        <strong style="color:#1f2937;">${htmlEscape(label)}</strong>
        <span style="color:#4b5563;">${htmlEscape(value)}</span>
      </div>`).join('')}
    </div>`;
  };
  const lotContextHtml = () => {
    const context = [];
    const countryPart = cleanOrigin ? ` з країни ${cleanOrigin}` : '';
    const realProcessing = cleanProcessing && !isProductFormatProcessing(cleanProcessing);
    const hasSpecificLotDetail = cleanFarm || cleanVariety || realProcessing;
    if (!hasSpecificLotDetail) return '';
    if (cleanRegion && cleanFarm) {
      context.push(`${cleanFarm}, ${cleanRegion}${countryPart ? ` (${cleanOrigin})` : ''} — конкретне походження цього лота. Так покупцю легше відрізнити його від інших позицій у каталозі.`);
    } else if (cleanFarm) {
      context.push(`${cleanFarm}${countryPart} — походження цієї партії. Цей факт варто залишити в картці, якщо наступна поставка буде з іншої станції або ферми.`);
    } else if (cleanRegion) {
      if (cleanVariety || realProcessing) {
        context.push(`${cleanRegion}${countryPart} — регіон походження цього лота. Разом з обробкою або сортом він допомагає зрозуміти, чому партія відрізняється від іншої кави з тієї самої країни.`);
      }
    }
    if (cleanVariety) {
      context.push(`Сорт / різновид ${cleanVariety} має сенс показувати поруч з обробкою та врожаєм: окремо він не пояснює весь смак, але уточнює характер лота.`);
    }
    if (realProcessing && cleanHarvestYear) {
      context.push(`Обробка ${cleanProcessing} і врожай ${cleanHarvestYear} — факти партії, які можуть змінитися в наступній поставці.`);
    } else if (realProcessing) {
      context.push(`Обробка ${cleanProcessing} впливає на чистоту, солодкість, тіло й фруктовість, тому її варто показувати окремо від смакових нот.`);
    } else if (cleanHarvestYear && (cleanFarm || cleanVariety)) {
      context.push(`Врожай ${cleanHarvestYear} варто тримати поруч із походженням: наступна партія може мати інший рік і потребувати оновлення опису.`);
    }
    if (!context.length) return '';
    const paragraphs = context.slice(0, 3).map((line, index, arr) => `<p style="margin:0${index < arr.length - 1 ? ' 0 8px' : ''};">${htmlEscape(line)}</p>`).join('');
    return `<div style="border:1px solid #eef2f7;border-radius:12px;background:#fbfdff;padding:13px 15px;color:#4b5563;">
      <strong style="display:block;color:#1f2937;margin:0 0 6px;">Деталі лота</strong>
      ${paragraphs}
    </div>`;
  };
  const flavorChipsHtml = flavorNotes.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px;">${flavorNotes.map(note => `<span style="display:inline-flex;align-items:center;border:1px solid #eadfd6;background:#fffaf4;border-radius:999px;padding:5px 10px;color:#6b4a33;font-size:14px;font-weight:700;">${htmlEscape(note)}</span> `).join('')}</div>`
    : '';
  const tasteSection = sectionBlockHtml('Смак у чашці', `
    ${flavorChipsHtml}
    <p style="margin:0;color:#374151;">${htmlEscape(tasteFlow)}</p>
  `, 'warm');
  const lotSection = sectionBlockHtml('Походження і лот', `
    ${lotRowsHtml([
      ['Країна', cleanOrigin],
      ['Регіон', cleanRegion],
      ['Ферма / станція', cleanFarm],
      ['Сорт / різновид', cleanVariety],
      productLotProcessingRow(cleanProcessing),
      ['Врожай', cleanHarvestYear]
    ].filter(Boolean))}
    ${lotContextHtml()}
  `);
  const infoSection = sectionBlockHtml('Що важливо знати', `
    <div style="display:grid;gap:0;border:1px solid #eef2f7;border-radius:12px;overflow:hidden;background:#ffffff;">
      <div style="display:grid;grid-template-columns:minmax(110px,160px) 1fr;gap:12px;border-bottom:1px solid #eef2f7;padding:11px 12px;"><strong style="color:#1f2937;">${htmlEscape(processingInfo.title)}</strong><span style="color:#4b5563;">${htmlEscape(processingInfo.line)}</span></div>
      <div style="display:grid;grid-template-columns:minmax(110px,160px) 1fr;gap:12px;padding:11px 12px;"><strong style="color:#1f2937;">${htmlEscape(thirdInfoTitle)}</strong><span style="color:#4b5563;">${htmlEscape(roastLine)}</span></div>
    </div>
  `);
  const brewSection = sectionBlockHtml('Як обрати і заварювати', `
    <p style="margin:0;color:#374151;">${htmlEscape(brewLine)}</p>
    <p style="margin:0;color:#4b5563;">${scenarioLine}</p>
  `);
  const faqSection = sectionBlockHtml('Питання перед покупкою', `
    <div style="display:grid;gap:10px;">
      <div style="border:1px solid #eef2f7;border-radius:12px;padding:13px 15px;background:#ffffff;"><strong>Кому найкраще підійде?</strong><br><span style="color:#4b5563;">${htmlEscape(`Найкраще підійде ${customerFit}.`)}</span></div>
      <div style="border:1px solid #eef2f7;border-radius:12px;padding:13px 15px;background:#ffffff;"><strong>${htmlEscape(faqSecondQuestion)}</strong><br><span style="color:#4b5563;">${htmlEscape(faqAcidity)}</span></div>
      <div style="border:1px solid #eef2f7;border-radius:12px;padding:13px 15px;background:#ffffff;"><strong>Як зберігати?</strong><br><span style="color:#4b5563;">Тримайте упаковку щільно закритою, подалі від сонця, вологи і сильних запахів. Так смак довше лишається чистим.</span></div>
    </div>
  `);
  return `<div data-mercato-description="v2" style="font-family:Inter,Arial,sans-serif;color:#1f2937;line-height:1.6;font-size:16px;">
  <div style="border:1px solid #f3ddc8;background:#fffaf4;border-radius:14px;padding:18px 20px;margin:0 0 22px;">
    <div style="font-size:18px;font-weight:700;margin:0 0 8px;color:#1f2937;">Швидко про товар</div>
    <p style="margin:0;color:#374151;">${quickIntro}</p>
  </div>

  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin:0 0 24px;">
    ${originCard}
    ${harvestCard}
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:13px 15px;background:#ffffff;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#8a5a35;font-weight:700;margin-bottom:5px;">Кому підійде</div><div style="color:#374151;">${htmlEscape(customerFit)}</div></div>
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:13px 15px;background:#ffffff;"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#8a5a35;font-weight:700;margin-bottom:5px;">${htmlEscape(prepareCardTitle)}</div><div style="color:#374151;">${htmlEscape(brewSummary)}</div></div>
  </div>

  ${lotSection}
  ${tasteSection}
  ${infoSection}
  ${brewSection}
  ${faqSection}
  ${internalLinksHtml}
</div>`;
}

function mergeMercatoGeneratedAttributes(attributes, { productName, productType = '', origin, region, farm, variety, processing, flavors, keywords, brewing, harvestYear = '' }) {
  const attrs = normalizeGeneratedAttributes(attributes || {});
  const category = productCategoryName(localizeCountryNamesUa(productName), productType);
  const cleanHarvestYear = normalizeHarvestYear(harvestYear) || harvestYearFromAttributes(attrs);

  // Explicit form values are the source of truth. AI may suggest attributes, but
  // it must not override what the operator typed into the product form.
  if (hasUsefulTasteNotes(flavors)) attrs['Смак'] = plainOneLine(flavors);
  if (isUsefulTextValue(origin)) attrs['Країна походження'] = localizeCountryNamesUa(plainOneLine(origin));
  if (cleanHarvestYear) attrs['Рік врожаю'] = cleanHarvestYear;
  for (const key of ['Країна', 'Країна походження', 'Походження']) {
    if (isUsefulTextValue(attrs[key])) attrs[key] = localizeCountryNamesUa(plainOneLine(attrs[key]));
  }
  if (category === 'Чай') {
    if (!isUsefulTextValue(attrs['Тип чаю'])) {
      const typeFromProcessing = isUsefulTextValue(processing) ? plainOneLine(processing) : '';
      attrs['Тип чаю'] = typeFromProcessing || cleanProductTypeNameForAttributes(productName);
    }
    if (isGenericTeaTypeValue(attrs['Регіон'])) delete attrs['Регіон'];
    delete attrs['Ферма'];
    delete attrs['Спосіб обробки'];
  } else {
    delete attrs['Тип чаю'];
    delete attrs['Температура заварювання'];
    delete attrs['Час настоювання'];
    delete attrs['Кількість настоїв'];
    if (isUsefulTextValue(region)) attrs['Регіон'] = plainOneLine(region);
    if (isUsefulTextValue(farm)) attrs['Ферма'] = plainOneLine(farm);
    if (isUsefulTextValue(variety)) attrs['Сорт'] = plainOneLine(variety);
    if (isCoffeeCategory(category) && !isUsefulTextValue(attrs['Ферма']) && isUsefulTextValue(region)) attrs['Ферма'] = plainOneLine(region);
    if (isUsefulTextValue(processing)) attrs['Спосіб обробки'] = plainOneLine(processing);
  }
  if (isCoffeeCategory(category)) {
    const coffeeType = plainOneLine(attrs['Тип кави']).toLowerCase();
    if (!coffeeType || /чай|tea|наст(і|о)й|листов/i.test(coffeeType)) {
      attrs['Тип кави'] = category === 'Набір кави' ? 'Кавовий набір' : 'Кава в зернах';
    }
  }
  if (!isUsefulTextValue(attrs['Категорія'])) attrs['Категорія'] = category;
  if (isUsefulBrewingText(brewing)) attrs['Рекомендація'] = plainOneLine(brewing);
  if (isSetCategory(category) && !isUsefulTextValue(attrs['Формат'])) attrs['Формат'] = category;
  if (isCoffeeCategory(category) && category === 'Кава' && !isUsefulTextValue(attrs['Технологія обсмаження'])) {
    attrs['Технологія обсмаження'] = 'Air Roast System';
  }
  if (!isCoffeeCategory(category)) {
    delete attrs['Ступінь обсмаження'];
    delete attrs['Технологія обсмаження'];
    delete attrs['Оцінка SCA'];
  }
  return ensureRequiredTasteProfileScores(attrs, { productName, productType, origin, region, processing, flavors, keywords });
}

function sanitizeOpenCartPublishAttributes(attributes = {}, ctx = {}) {
  const out = {};
  const aliasMap = {
  };
  const numericKeys = new Set(['Кислотність', 'Солодкість', 'Тіло', 'Післясмак', 'Фруктовість', 'Оцінка SCA']);
  for (const [rawName, rawValue] of Object.entries(attributes || {})) {
    const name = aliasMap[plainOneLine(rawName)] || plainOneLine(rawName);
    if (!name) continue;
    const value = /країна|походжен/i.test(name)
      ? localizeCountryNamesUa(plainOneLine(rawValue))
      : plainOneLine(rawValue);
    if (numericKeys.has(name)) {
      if (!value) {
        out[name] = '';
        continue;
      }
      const match = value.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
      if (!match) {
        out[name] = '';
        continue;
      }
      const num = Number(match[0]);
      if (!Number.isFinite(num)) {
        out[name] = '';
        continue;
      }
      out[name] = String(name === 'Оцінка SCA' ? Math.max(0, Math.min(100, num)) : Math.max(0, Math.min(10, num)));
      continue;
    }
    out[name] = value;
  }
  const category = productCategoryName(ctx.productName || ctx.h1 || ctx.title || '', ctx.productType || '');
  if (!isCoffeeCategory(category)) {
    delete out['Ступінь обсмаження'];
    delete out['Технологія обсмаження'];
    delete out['Оцінка SCA'];
  }
  if (category === 'Чай') {
    if (isGenericTeaTypeValue(out['Регіон'])) delete out['Регіон'];
    delete out['Ферма'];
    delete out['Спосіб обробки'];
  } else {
    delete out['Тип чаю'];
    delete out['Температура заварювання'];
    delete out['Час настоювання'];
    delete out['Кількість настоїв'];
  }
  if (isCoffeeCategory(category)) {
    const coffeeType = plainOneLine(out['Тип кави']).toLowerCase();
    if (!coffeeType || /чай|tea|наст(і|о)й|листов/i.test(coffeeType)) {
      out['Тип кави'] = category === 'Набір кави' ? 'Кавовий набір' : 'Кава в зернах';
    }
  }
  if (ctx.type === 'product') {
    return ensureRequiredTasteProfileScores(out, {
      productName: ctx.productName || ctx.h1 || ctx.title || '',
      productType: ctx.productType || '',
      origin: out['Країна походження'] || ctx.origin || '',
      region: out['Регіон'] || ctx.region || '',
      processing: out['Спосіб обробки'] || ctx.processing || '',
      flavors: out['Смак'] || ctx.flavors || '',
      harvestYear: out['Рік врожаю'] || ctx.harvestYear || '',
      keywords: ctx.keywords || ctx.title || ''
    });
  }
  return out;
}

function sanitizeMercatoGeneratedHtml(content) {
  return String(content || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function seoTargetMeta(targetType = 'product') {
  const key = String(targetType || 'product').trim().toLowerCase();
  if (key === 'category') return { key, label: 'категорії', opencartType: 'category', productLike: false };
  if (key === 'information' || key === 'page' || key === 'landing') return { key: 'information', label: 'сторінки', opencartType: 'information', productLike: false };
  return { key: 'product', label: 'товару', opencartType: 'product', productLike: true };
}

function buildGenericSeoContentFallback(ctx, target) {
  const name = plainOneLine(ctx.productName);
  const keyword = firstKeyword(ctx.keywords, name);
  const intro = `${name} — ${target.label} Mercato, яку треба зробити зрозумілою для покупця і пошуку.`;
  const points = [
    ctx.origin ? `Контекст: ${plainOneLine(ctx.origin)}.` : '',
    ctx.processing ? `Основний фокус: ${plainOneLine(ctx.processing)}.` : '',
    ctx.flavors ? `Важливі теми: ${plainOneLine(ctx.flavors)}.` : '',
    ctx.brewing ? `Дія користувача: ${plainOneLine(ctx.brewing)}.` : ''
  ].filter(Boolean);
  if (!ctx.isHtml) {
    return [
      intro,
      '',
      points.join('\n'),
      '',
      `Сторінка має допомогти людині швидко зрозуміти, чи підходить їй цей розділ, які варіанти є всередині і чому варто перейти далі в Mercato.`,
      '',
      `FAQ: що знайти на цій сторінці, як обрати, чому купувати в Mercato.`
    ].filter(Boolean).join('\n');
  }
  return `<section style="font-family:Inter,Arial,sans-serif;color:#202620;line-height:1.6;">
  <h2 style="font-size:24px;margin:0 0 12px;">${htmlEscape(name)}</h2>
  <p style="margin:0 0 12px;">${htmlEscape(intro)}</p>
  ${points.length ? `<ul style="margin:0 0 16px 20px;">${points.map(item => `<li>${htmlEscape(item)}</li>`).join('')}</ul>` : ''}
  <p style="margin:0;">Ця сторінка має швидко вести покупця до правильного вибору: ${htmlEscape(keyword)}.</p>
</section>`;
}

function standardizeGeneratedSeoPayload(parsed, ctx) {
  const target = seoTargetMeta(ctx.targetType || 'product');
  const name = localizeCountryNamesUa(plainOneLine(ctx.productName));
  if (!target.productLike) {
    const keyword = firstKeyword(ctx.keywords, name);
    const rawTitle = localizeCountryNamesUa(parsed.title || `${keyword} | Mercato`);
    const rawMeta = localizeCountryNamesUa(parsed.metaDescription || `${name} у Mercato. Добірка, пояснення і швидкий перехід до потрібного вибору.`);
    const rawContent = parsed.content || buildGenericSeoContentFallback(ctx, target);
    const content = ctx.isHtml
      ? sanitizeMercatoGeneratedHtml(localizeCountryNamesUa(rawContent))
      : localizeCountryNamesUa(rawContent);
    return {
      title: formatSeoTitle(rawTitle, 60),
      metaDescription: truncateText(productFeedSafeLine(rawMeta), 160),
      h1: localizeCountryNamesUa(parsed.h1 || truncateText(name, 90)),
      rightCard: '',
      attributes: {},
      content,
      targetType: target.key,
      opencartType: target.opencartType
    };
  }
  const category = productCategoryName(name, ctx.productType || '');
  const keyword = firstKeyword(ctx.keywords, name);
  const titleKeyword = /(^|[\s,.;:|])купити($|[\s,.;:|])/i.test(keyword) ? keyword : `${keyword} купити`;
  const rawContent = ctx.isHtml
    ? buildMercatoProductDescriptionHtml(ctx)
    : parsed.content;
  const content = ctx.isHtml ? sanitizeMercatoGeneratedHtml(localizeCountryNamesUa(rawContent)) : localizeCountryNamesUa(rawContent);
  const rawTitle = localizeCountryNamesUa(parsed.title || `${titleKeyword} | Mercato`);
  const title = /купити|ціна|замовити|доставка/i.test(rawTitle) ? rawTitle : `${titleKeyword} | Mercato`;
  const rawMeta = productFeedSafeLine(parsed.metaDescription || `${name} у Mercato. ${hasUsefulTasteNotes(ctx.flavors) ? `Смак: ${plainOneLine(ctx.flavors)}. ` : ''}${normalizeHarvestYear(ctx.harvestYear) ? `Врожай: ${normalizeHarvestYear(ctx.harvestYear)}. ` : ''}${productQualityLine(category)}.`);
  const metaDescription = /купити|купуйте|замовити/i.test(rawMeta)
    ? rawMeta
    : `${rawMeta} Детальний профіль товару.`;
  const attributes = mergeMercatoGeneratedAttributes(parsed.attributes, ctx);
  return {
    title: formatSeoTitle(title, 60),
    metaDescription: truncateText(metaDescription, 160),
    h1: localizeCountryNamesUa(parsed.h1 || truncateText(name, 90)),
    rightCard: buildMercatoRightCardText({ ...ctx, attributes }),
    attributes,
    content: content || (ctx.isHtml ? buildMercatoProductDescriptionHtml(ctx) : ''),
    targetType: target.key,
    opencartType: target.opencartType
  };
}

function buildLocalSeoFallback({ productName, productType = '', targetType = 'product', targetUrl = '', origin, region, farm, variety, processing, flavors, brewing, harvestYear = '', keywords, links, isHtml, research, aiError }) {
  const name = localizeCountryNamesUa(plainOneLine(productName));
  const target = seoTargetMeta(targetType);
  const cleanOrigin = localizeCountryNamesUa(plainOneLine(origin));
  const cleanRegion = plainOneLine(region);
  const cleanFarm = plainOneLine(farm);
  const cleanVariety = plainOneLine(variety);
  const cleanProcessing = plainOneLine(processing);
  const cleanFlavors = hasUsefulTasteNotes(flavors) ? plainOneLine(flavors) : '';
  const cleanBrewing = isUsefulBrewingText(brewing) ? plainOneLine(brewing) : '';
  const cleanHarvestYear = normalizeHarvestYear(harvestYear);
  const keyword = localizeCountryNamesUa(firstKeyword(keywords, name));
  if (!target.productLike) {
    const title = truncateText(`${keyword || name} | Mercato`, 60);
    const metaDescription = truncateText(`${name} у Mercato. Зрозуміла сторінка для вибору, порівняння і переходу до покупки.`, 160);
    const h1 = truncateText(name, 90);
    const warning = `AI-провайдери зараз недоступні, тому створено локальну SEO-чернетку для ${target.label}. Причина: ${aiErrorBrief(aiError)}`;
    return {
      title,
      metaDescription,
      h1,
      rightCard: '',
      attributes: {},
      content: buildGenericSeoContentFallback({ productName: name, targetUrl, origin, region, processing, flavors, brewing, keywords, isHtml }, target),
      isHtml,
      targetType: target.key,
      opencartType: target.opencartType,
      research: research
        ? { ...research, aiFallback: true, aiFallbackWarning: warning }
        : {
            date: new Date().toLocaleDateString('uk-UA'),
            source: 'local_ai_fallback',
            query: keyword,
            competitorsAnalyzed: 0,
            aiFallback: true,
            aiFallbackWarning: warning
          },
      completedContinuation: false,
      aiFallback: true,
      warning
    };
  }
  const category = productCategoryName(name, productType);
  const titleKeyword = /(^|[\s,.;:|])купити($|[\s,.;:|])/i.test(keyword) ? keyword : `${keyword} купити`;
  const title = truncateText(`${titleKeyword} | Mercato`, 60);
  const metaDescription = truncateText([
    `${name} у Mercato.`,
    cleanFlavors ? `Смак: ${cleanFlavors}.` : '',
    cleanOrigin ? `Походження: ${cleanOrigin}.` : '',
    cleanHarvestYear ? `Врожай: ${cleanHarvestYear}.` : '',
    `${productQualityLine(category)}, смак і характеристики для зрозумілого вибору.`
  ].filter(Boolean).join(' '), 160);
  const h1 = truncateText(`${name}${cleanFlavors ? `: ${cleanFlavors}` : ''}`, 90);
  const fallbackAttributeSeed = {
    'Смак': cleanFlavors,
    'Країна походження': cleanOrigin,
    'Ферма': cleanFarm,
    'Сорт': cleanVariety,
    'Рік врожаю': cleanHarvestYear,
    'Категорія': category,
    'Тип чаю': category === 'Чай' ? cleanProductTypeNameForAttributes(name) : '',
    'Формат': isSetCategory(category) ? category : '',
    'Рекомендація': cleanBrewing,
    'Технологія обсмаження': category === 'Кава' ? 'Air Roast System' : ''
  };
  if (category === 'Чай') {
    if (cleanProcessing) fallbackAttributeSeed['Тип чаю'] = cleanProcessing;
    if (cleanRegion && !isGenericTeaTypeValue(cleanRegion)) fallbackAttributeSeed['Регіон'] = cleanRegion;
  } else {
    fallbackAttributeSeed['Регіон'] = cleanRegion;
    fallbackAttributeSeed['Ферма'] = isCoffeeCategory(category) ? cleanRegion : '';
    fallbackAttributeSeed['Спосіб обробки'] = cleanProcessing;
  }
  const attributes = normalizeGeneratedAttributes(fallbackAttributeSeed);
  const rightCard = buildMercatoRightCardText({
    productName: name,
    productType,
    origin: cleanOrigin,
    region: cleanRegion,
    processing: cleanProcessing,
    flavors: cleanFlavors,
    brewing: cleanBrewing,
    harvestYear: cleanHarvestYear,
    attributes,
    keywords
  });
  const safeResearchHint = productFeedSafeLine(research?.uniqueAngle || '');
  const researchHint = safeResearchHint && !/конкур|compet/i.test(safeResearchHint)
    ? safeResearchHint
    : `${name} поєднує зрозумілий смаковий профіль, походження і практичний сценарій використання.`;
  const intro = `${name} — ${category.toLowerCase()} з профілем, який варто описувати через конкретний смак і практичний сценарій використання.${cleanFlavors ? ` Смак: ${cleanFlavors}.` : ''}`;
  const originLine = [
    cleanOrigin ? `Походження: ${cleanOrigin}` : '',
    cleanHarvestYear ? `врожай: ${cleanHarvestYear}` : '',
    cleanRegion ? `регіон: ${cleanRegion}` : '',
    cleanFarm ? `ферма/станція: ${cleanFarm}` : '',
    cleanVariety ? `сорт/різновид: ${cleanVariety}` : '',
    cleanProcessing ? `обробка: ${cleanProcessing}` : ''
  ].filter(Boolean).join('; ');
  const brewingLine = cleanBrewing || inferBrewSummary({ category, brewing: '' });
  const textContent = [
    'КОРОТКИЙ ОПИС:',
    intro,
    '',
    'СМАК ТА ВІДЧУТТЯ:',
    cleanFlavors
      ? `Основний акцент цього товару — ${cleanFlavors}. Такий профіль допомагає покупцю швидко зрозуміти, чи підходить йому смак без зайвої води в описі.`
      : 'Опишіть смак конкретними словами: тіло, солодкість і післясмак, щоб покупець розумів характер товару до покупки.',
    '',
    'ХАРАКТЕРИСТИКИ:',
    originLine || 'Походження і характеристики варто оцінювати разом зі смаком, типом товару і способом використання.',
    `Рекомендація: ${brewingLine}.`,
    '',
    'КОМУ ПІДІЙДЕ:',
    `- Тим, хто шукає ${keyword}.`,
    '- Тим, кому важливо зрозуміти смак до покупки.',
    `- Тим, хто цінує ${isCoffeeCategory(category) ? 'свіжість' : 'акуратне пакування'}, прозоре походження і акуратну підготовку товару.`,
    '',
    'FAQ:',
    `Питання: Чим особливий ${name}?`,
    `Відповідь: ${researchHint}.`,
    '',
    `Питання: Як краще використовувати або заварювати ${name}?`,
    `Відповідь: ${brewingLine}.`
  ].join('\n');
  const htmlContent = buildMercatoProductDescriptionHtml({
    productName: name,
    productType,
    origin: cleanOrigin,
    region: cleanRegion,
    farm: cleanFarm,
    variety: cleanVariety,
    processing: cleanProcessing,
    flavors: cleanFlavors,
    brewing: cleanBrewing,
    harvestYear: cleanHarvestYear,
    keywords,
    links
  });

  const warning = `AI-провайдери зараз недоступні, тому створено локальну SEO-чернетку з полів товару. Причина: ${aiErrorBrief(aiError)}`;
  return {
    title,
    metaDescription,
    h1,
    rightCard,
    attributes,
    content: isHtml ? htmlContent : textContent,
    isHtml,
    targetType: target.key,
    opencartType: target.opencartType,
    research: research
      ? { ...research, aiFallback: true, aiFallbackWarning: warning }
      : {
          date: new Date().toLocaleDateString('uk-UA'),
          source: 'local_ai_fallback',
          query: keyword,
          competitorsAnalyzed: 0,
          aiFallback: true,
          aiFallbackWarning: warning
        },
    completedContinuation: false,
    aiFallback: true,
    warning
  };
}

function currentMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function normalizeResearchCacheText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function generationResearchCacheKey({ searchQuery, productName, origin, processing, isHtml, productType = '' }) {
  return [
    currentMonthKey(),
    isHtml ? 'html' : 'text',
    normalizeResearchCacheText(productType).slice(0, 40),
    normalizeResearchCacheText(searchQuery).slice(0, 120),
    normalizeResearchCacheText(productName).slice(0, 90),
    normalizeResearchCacheText(origin).slice(0, 50),
    normalizeResearchCacheText(processing).slice(0, 50)
  ].join('::');
}

function seoCompetitorCacheKey(keyword = '') {
  const normalized = normalizeResearchCacheText(keyword).slice(0, 120) || 'unknown';
  const hash = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 10);
  return `${currentMonthKey()}::${hash}::${normalized}`;
}

function cleanCompetitorUrls(urls = []) {
  const seen = new Set();
  return (Array.isArray(urls) ? urls : [])
    .map(url => String(url || '').trim())
    .filter(Boolean)
    .map(url => {
      try {
        return new URL(url).toString().split('#')[0];
      } catch {
        return '';
      }
    })
    .filter(url => url && isUsefulCompetitorUrl(url))
    .filter(url => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, 10);
}

function monthlyCompetitorSearchForKeyword(keyword = '') {
  const key = seoCompetitorCacheKey(keyword);
  const entry = readSeoAuditCache().competitorSearches?.[key] || null;
  if (!entry || entry.month !== currentMonthKey()) return null;
  return { key, ...entry };
}

function saveMonthlyCompetitorSearch(keyword = '', patch = {}) {
  const cache = readSeoAuditCache();
  const key = seoCompetitorCacheKey(keyword);
  const current = cache.competitorSearches?.[key] || {};
  const competitorSearches = { ...(cache.competitorSearches || {}) };
  competitorSearches[key] = {
    ...current,
    ...patch,
    keyword,
    month: currentMonthKey(),
    savedAt: new Date().toISOString()
  };
  writeSeoAuditCache({ competitorSearches });
  return { key, ...competitorSearches[key] };
}

function readGenerationResearchCache() {
  const cache = readJsonFile(GENERATION_RESEARCH_CACHE_PATH, { version: 1, entries: {} });
  if (!cache.entries || typeof cache.entries !== 'object') cache.entries = {};
  return cache;
}

function writeGenerationResearchCache(cache) {
  const month = currentMonthKey();
  const entries = {};
  for (const [key, value] of Object.entries(cache.entries || {})) {
    if (value?.month === month) entries[key] = value;
  }
  writeJsonFile(GENERATION_RESEARCH_CACHE_PATH, { version: 1, savedAt: new Date().toISOString(), entries });
}

function cachedResearchView(entry) {
  if (!entry?.research) return null;
  return {
    ...entry.research,
    cached: true,
    cacheMonth: entry.month,
    cacheSavedAt: entry.savedAt,
    source: `${entry.research.source || 'research'}_monthly_cache`
  };
}

async function buildGenerationResearch({ productName, productType = '', keywords, isHtml, origin = '', region = '', processing = '', flavors = '', brewing = '', competitorUrls = null, force = false }) {
  const query = String(keywords || productName || '').trim();
  const normalizedName = String(productName || '').trim();
  const category = productCategoryName(normalizedName, productType || inferProductTypeKey(normalizedName, query));
  const isCoffee = isCoffeeCategory(category) && !isSetCategory(category);
  const isTea = isTeaCategory(category) && !isSetCategory(category);
  const isSet = isSetCategory(category);
  const searchQuery = query || `${normalizedName} купити`;
  const cacheKey = generationResearchCacheKey({ searchQuery, productName: normalizedName, origin, processing, isHtml, productType: category });
  const cache = readGenerationResearchCache();
  const cached = cachedResearchView(cache.entries[cacheKey]);
  const manualCompetitorUrls = cleanCompetitorUrls(competitorUrls || []);
  if (cached && !force && !manualCompetitorUrls.length) return cached;

  const search = manualCompetitorUrls.length
    ? { source: 'manual_top10_override', urls: manualCompetitorUrls }
    : await fetchSearchResultUrls(searchQuery);
  const competitorPages = await Promise.all(
    (search.urls || []).slice(0, 10).map(url => fetchPage(url, BROWSER_HEADERS, 4500))
  );
  const snapshots = competitorPages
    .filter(page => page.html && page.html.length > 500)
    .map(extractCompetitorSnapshot)
    .filter(item => item.text.length > 250);

  const fallback = {
    seoPatterns: [
      'Title має починатися з назви товару і містити комерційний намір: купити, ціна або інтернет-магазин.',
      'Meta description має давати смак, походження, формат товару і причину купити саме в Mercato.',
      'H1 має бути природним і не перевантаженим ключами.'
    ],
    contentGaps: [
      'Не обмежуватись загальними фразами: додати походження, обробку, смаковий профіль і сценарії заварювання.',
      isTea
        ? 'Пояснити температуру, час настоювання, можливу терпкість, аромат і кому підійде чай.'
        : isSet
          ? 'Пояснити склад набору, смак, сценарій подарунка або дегустації.'
          : 'Пояснити, кому підійде товар: для еспресо, фільтра, автоматичної кавомашини або подарунка.',
      'Додати внутрішні посилання на релевантні категорії Mercato.'
    ],
    uxRequirements: [
      'Перший екран опису має швидко відповідати: що це, який смак, кому підійде і чому варто купити.',
      'Використовувати короткі секції, списки і читабельні блоки замість суцільного полотна тексту.',
      isHtml
        ? 'HTML має бути готовим для вставки в OpenCart: без html/body/script, без зовнішніх залежностей.'
        : 'Текст має легко вставлятися в CMS без втрати структури.'
    ],
    faqQuestions: [
      `Чим особливий товар "${normalizedName || query}"?`,
      isCoffee ? 'Для яких методів заварювання підходить ця кава?' : isTea ? 'Як правильно заварювати цей чай?' : isSet ? 'Що входить у набір і кому він підійде?' : 'Кому найкраще підійде цей товар?',
      'Як правильно зберігати товар після відкриття?'
    ],
    recommendedStructure: [
      'Короткий вступ з основною перевагою.',
      'Смак / характеристики / походження.',
      'Кому підійде і як використовувати.',
      'Чому купити в Mercato.',
      'FAQ або короткі практичні поради.'
    ]
  };

  let aiResearch = null;
  if (snapshots.length) {
    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2200,
        messages: [{
          role: 'user',
          content: `Ти — ecommerce SEO/CRO researcher для Mercato: кава, чай і подарункові набори.

Дата: ${new Date().toLocaleDateString('uk-UA')}
Запит: ${searchQuery}
Товар Mercato: ${normalizedName}
Тип товару: ${category}
Факти товару:
- Країна: ${origin || 'не вказано'}
- Регіон / ферма: ${region || 'не вказано'}
- Обробка / тип / склад: ${processing || 'не вказано'}
- Смак: ${flavors || 'не вказано'}
- Заварювання / використання: ${brewing || 'не вказано'}

Глобальні UX/CRO сигнали 2026:
${GLOBAL_UX_RESEARCH_2026.map(x => `- ${x}`).join('\n')}

Конкурентні сторінки:
${snapshots.map((item, index) => `
${index + 1}. ${item.title}
URL: ${item.url}
PRICE SIGNALS: ${(item.priceSignals || []).join(', ') || 'не знайдено'}
TEXT: ${item.text.slice(0, 1800)}
`).join('\n')}

Поверни ТІЛЬКИ JSON:
{
  "seoPatterns": ["3-5 конкретних патернів із конкурентних title/meta/content"],
  "contentGaps": ["3-5 прогалин конкурентів, які Mercato може закрити"],
  "uxRequirements": ["4-6 вимог до product page з урахуванням світового UX і типу товару"],
  "faqQuestions": ["3-5 реальних питань покупця"],
  "recommendedStructure": ["5-7 секцій, але адаптованих під цей товар, не шаблон"],
  "uniqueAngle": "один унікальний кут саме для цього товару",
  "avoidCliches": ["слова/фрази, яких уникати, бо вони роблять текст шаблонним"],
  "sensoryMap": ["3-5 конкретних sensory cues для опису товару: чашка, настій або набір"]
}`
        }]
      });
      aiResearch = await parseAiJson(message.content[0].text.trim(), 'generation-research');
    } catch (error) {
      console.warn('generation research AI summary failed:', error.message);
    }
  }

  const research = {
    date: new Date().toLocaleDateString('uk-UA'),
    source: snapshots.length ? search.source : `${search.source}_local_profile_fallback`,
    query: searchQuery,
    competitorsAnalyzed: snapshots.length,
    competitorUrls: snapshots.map(item => item.url),
    competitorTitles: snapshots.map(item => item.title).filter(Boolean),
    competitorPriceSignals: snapshots.map(item => ({
      url: item.url,
      prices: item.priceSignals || []
    })).filter(item => item.prices.length),
    seoPatterns: aiResearch?.seoPatterns?.length ? aiResearch.seoPatterns : fallback.seoPatterns,
    contentGaps: aiResearch?.contentGaps?.length ? aiResearch.contentGaps : fallback.contentGaps,
    uxRequirements: aiResearch?.uxRequirements?.length ? aiResearch.uxRequirements : fallback.uxRequirements,
    faqQuestions: aiResearch?.faqQuestions?.length ? aiResearch.faqQuestions : fallback.faqQuestions,
    recommendedStructure: aiResearch?.recommendedStructure?.length ? aiResearch.recommendedStructure : fallback.recommendedStructure,
    uniqueAngle: aiResearch?.uniqueAngle || `Зробити "${normalizedName || query}" зрозумілим вибором за смаком, способом використання і ситуацією покупки.`,
    avoidCliches: aiResearch?.avoidCliches?.length ? aiResearch.avoidCliches : ['насичений смак без пояснення', 'ідеально підходить усім', 'висока якість без доказу'],
    sensoryMap: aiResearch?.sensoryMap?.length ? aiResearch.sensoryMap : [flavors || 'смак з картки товару', processing ? `вплив обробки: ${processing}` : 'чиста структура чашки'],
    globalUxSources: ['Baymard Product Page UX 2026', 'Baymard PDP research', 'global mobile-first ecommerce PDP patterns'],
    styleGuardrails: [
      'Писати українською, тепло й експертно, без канцеляриту.',
      'Не вигадувати факти, яких немає у введених даних.',
      'Зберігати преміальний, але практичний тон Mercato.',
      'Не копіювати попередні описи Mercato механічно: кожен товар має мати власний angle, sensory map і порядок акцентів.'
    ],
    mustUseInGeneration: [
      normalizedName ? `Назва товару: ${normalizedName}` : '',
      category ? `Тип товару: ${category}` : '',
      query ? `SEO-запит: ${query}` : '',
      aiResearch?.uniqueAngle ? `Унікальний кут: ${aiResearch.uniqueAngle}` : '',
      isCoffee ? 'Для кави обовʼязково показати смак, тіло, кислотність/солодкість і метод заварювання там, де доречно.' : '',
      isTea ? 'Для чаю не згадувати помел, обсмаження або кавомашину; фокус на температурі, часі настоювання, ароматі, терпкості і кількості настоїв.' : '',
      isSet ? 'Для наборів не писати як про один сорт; фокус на складі, сценарії подарунка/дегустації і простоті вибору.' : ''
    ].filter(Boolean)
  };

  cache.entries[cacheKey] = {
    month: currentMonthKey(),
    savedAt: new Date().toISOString(),
    searchQuery,
    research
  };
  writeGenerationResearchCache(cache);

  return research;
}

// Генерація опису
app.post('/generate', async (req, res) => {
  try {
    const { productName, productType, targetType = 'product', targetUrl = '', origin, region, farm, variety, processing, flavors, brewing, harvestYear, keywords, links, outputFormat, styleExamples, useMarketContext } = req.body;
    const target = seoTargetMeta(targetType);

    if (!productName) return res.status(400).json({ error: `Назва ${target.label} обовʼязкова` });

    const isHtml = outputFormat !== 'text';
    const selectedProductType = normalizeProductTypeKey(productType);
    const inferredProductType = inferProductTypeKey(productName, keywords, processing, flavors);
    const normalizedProductType = target.productLike
      ? (selectedProductType || inferredProductType || 'coffee')
      : target.key;
    const category = target.productLike ? productCategoryName(productName, normalizedProductType) : target.label;
    const defaultLinks = productDefaultLinks(category);
    const effectiveLinks = productLinksForCategory(links, category);

    const hasHtml = styleExamples && /<[a-z][\s\S]*>/i.test(styleExamples);
    const styleSection = styleExamples && styleExamples.trim()
      ? `\n\n${hasHtml
          ? `HTML-КОД РЕАЛЬНОГО ТОВАРУ ЦЬОГО МАГАЗИНУ — витягни з нього:
1. Точну HTML-структуру та inline-стилі — використовуй їх як шаблон для нового товару
2. Тон, лексику та стиль тексту — наслідуй максимально точно
Код:\n"""\n${styleExamples.trim()}\n"""`
          : `РЕАЛЬНІ ТЕКСТИ ЦЬОГО МАГАЗИНУ — наслідуй стиль, тон і лексику максимально точно:\n"""\n${styleExamples.trim()}\n"""`
        }`
      : '';

    const cachedStyleHint = (isHtml && storeStyleCache?.colors)
      ? `\n\nПАЛІТРА ЖИВОГО САЙТУ MERCATO ДЛЯ СТРИМАНИХ АКЦЕНТІВ:
- primary: ${storeStyleCache.colors.primary || '#1f2937'}
- secondary: ${storeStyleCache.colors.secondary || '#4b5563'}
- accent: ${storeStyleCache.colors.accent || '#ff9f2f'}
- text: ${storeStyleCache.colors.text || '#1f2937'}
- bg/card/border: ${storeStyleCache.colors.bg || '#fffaf4'} / ${storeStyleCache.colors.cardBg || '#ffffff'} / ${storeStyleCache.colors.border || '#e5e7eb'}
Не копіюй автоматично старий AI-шаблон стилю. Використовуй ці кольори тільки як легкі акценти в контрольованій HTML-структурі нижче.`
      : '';
    const activeHtmlStructure = isHtml ? `${HTML_STRUCTURE}${cachedStyleHint}` : TEXT_STRUCTURE;
    const research = useMarketContext === false
      ? null
      : await buildGenerationResearch({ productName, productType: normalizedProductType, keywords, isHtml, origin, region, processing, flavors, brewing });
    const marketContext = research ? `

ОБОВʼЯЗКОВИЙ MARKET/SEO/UX RESEARCH ПЕРЕД ГЕНЕРАЦІЄЮ:
- Дата аналізу: ${research.date || new Date().toLocaleDateString('uk-UA')}
- Джерело: ${research.source || 'google_top_10'} за запитом "${research.query}"
- Проаналізовано конкурентних сторінок: ${research.competitorsAnalyzed}
- URL конкурентів: ${(research.competitorUrls || []).join(' | ')}

SEO patterns:
${(research.seoPatterns || []).map(x => `- ${x}`).join('\n')}

Content gaps:
${(research.contentGaps || []).map(x => `- ${x}`).join('\n')}

UX/CRO requirements на поточну дату:
${(research.uxRequirements || []).map(x => `- ${x}`).join('\n')}

FAQ questions:
${(research.faqQuestions || []).map(x => `- ${x}`).join('\n')}

Recommended structure:
${(research.recommendedStructure || []).map(x => `- ${x}`).join('\n')}

Style guardrails:
${(research.styleGuardrails || []).map(x => `- ${x}`).join('\n')}

Must use in generation:
${(research.mustUseInGeneration || []).map(x => `- ${x}`).join('\n')}

Unique angle:
${research.uniqueAngle || '-'}

Sensory map:
${(research.sensoryMap || []).map(x => `- ${x}`).join('\n')}

Avoid cliches:
${(research.avoidCliches || []).map(x => `- ${x}`).join('\n')}

Global UX sources:
${(research.globalUxSources || []).map(x => `- ${x}`).join('\n')}

КРИТИЧНЕ ПРАВИЛО:
- Пиши title, meta, H1 і опис тільки на основі цього аналізу, даних товару і стилю Mercato.
- Не показуй research окремим блоком у фінальному описі.
- Опис має бути кориснішим за конкурентів із Google top-10 і при цьому виглядати як природна сторінка Mercato.
- Якщо конкурентів мало або Google заблокований, чесно використовуй global UX + товарні факти, але не вигадуй неіснуючий аналіз.
- Не повторюй механічно попередню структуру: зміни порядок акцентів, вступ і FAQ під конкретний товар, щоб опис не був шаблонним.
` : '';

    const systemPrompt = BRAND_VOICE + styleSection + marketContext + (isHtml ? activeHtmlStructure : TEXT_STRUCTURE) + OUTPUT_FORMAT;

    const userPrompt = `Згенеруй повний SEO-пакет для ${target.label} Mercato:

Назва: ${productName}
URL / поточна сторінка: ${targetUrl || 'не вказано'}
${target.productLike ? `Тип товару: ${category}` : `Тип обʼєкта: ${category}`}
Країна / контекст: ${origin || 'не вказано'}
Регіон / група / розділ: ${region || 'не вказано'}
Ферма / станція: ${farm || 'не вказано'}
Сорт / різновид: ${variety || 'не вказано'}
Рік врожаю: ${normalizeHarvestYear(harvestYear) || 'не вказано'}
Обробка / тип / головний фокус: ${processing || 'не вказано'}
Смак / теми / зміст: ${flavors || 'не вказано'}
Заварювання / дія користувача: ${brewing || 'не вказано'}
Ключові слова: ${keywords || productName}
Посилання для футера: ${effectiveLinks || defaultLinks}
Формат опису: ${isHtml ? 'HTML код' : 'чистий текст'}

${target.productLike ? `ВАЖЛИВО ПРО ТИП ТОВАРУ:
- Тип товару з форми є джерелом правди: ${category}.
- Якщо це кава, не перетворюй її на чай через смакові ноти на кшталт "білий чай", "чайний відтінок", "бергамот" або "травʼяність".
- Для кави слова "чай", "білий чай", "жасминовий чай" у полі смаку означають тільки ароматичну/смакову ноту, а не категорію товару, не температуру настоювання і не tea attributes.
- Для кави не додавай чайні поля: Тип чаю, температура настоювання, час настоювання, кількість настоїв.` : 'ВАЖЛИВО: це не товарна картка. Не вигадуй смакові шкали, OpenCart attributes або праву картку товару. Потрібні title, meta, H1 і зміст сторінки/категорії.'}`;

    let message;
    try {
      message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 14000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      });
    } catch (aiError) {
      if (isAiQuotaOrBillingError(aiError)) {
        console.warn('AI quota/billing fallback for /generate:', aiErrorBrief(aiError));
        return res.json(buildLocalSeoFallback({
          productName,
          productType: normalizedProductType,
          origin,
          region,
          farm,
          variety,
          processing,
          flavors,
          brewing,
          harvestYear,
          keywords,
          links: effectiveLinks || defaultLinks,
          isHtml,
          targetType: target.key,
          targetUrl,
          research,
          aiError
        }));
      }
      throw aiError;
    }

    const text = message.content[0].text;
    const firstParsed = parseSeoResponse(text);
    let completion;
    try {
      completion = await completeSeoIfNeeded(text, firstParsed, systemPrompt, userPrompt);
    } catch (aiError) {
      if (isAiQuotaOrBillingError(aiError)) {
        console.warn('AI continuation skipped for /generate:', aiErrorBrief(aiError));
        completion = { raw: text, parsed: firstParsed, completed: false };
      } else {
        throw aiError;
      }
    }
    const parsed = completion.parsed;
    const standardized = standardizeGeneratedSeoPayload(parsed, {
      productName,
      productType: normalizedProductType,
      origin,
      region,
      farm,
      variety,
      processing,
      flavors,
      brewing,
      harvestYear,
      keywords,
      links: effectiveLinks || defaultLinks,
      isHtml,
      targetType: target.key,
      targetUrl
    });

    res.json({
      title: standardized.title,
      metaDescription: standardized.metaDescription,
      h1: standardized.h1,
      rightCard: standardized.rightCard,
      attributes: standardized.attributes,
      content: standardized.content,
      isHtml,
      targetType: standardized.targetType || target.key,
      opencartType: standardized.opencartType || target.opencartType,
      research,
      completedContinuation: completion.completed
    });

  } catch (error) {
    console.error('Помилка генерації:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/email/o/:id.gif', (req, res) => {
  updateEmailTracking(req.params.id, item => {
    const now = new Date().toISOString();
    item.openCount = Number(item.openCount || 0) + 1;
    item.firstOpenedAt = item.firstOpenedAt || now;
    item.lastOpenedAt = now;
    if (item.status === 'smtp_accepted') item.status = 'opened';
  });
  const pixel = Buffer.from('R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64');
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.end(pixel);
});

app.get('/email/t/:id', (req, res) => {
  const target = String(req.query.u || 'https://mercato.com.ua');
  const safeTarget = /^https?:\/\//i.test(target) ? target : 'https://mercato.com.ua';
  updateEmailTracking(req.params.id, item => {
    const now = new Date().toISOString();
    item.clickCount = Number(item.clickCount || 0) + 1;
    item.firstClickedAt = item.firstClickedAt || now;
    item.lastClickedAt = now;
    item.status = 'clicked';
    item.clicks = Array.isArray(item.clicks) ? item.clicks : [];
    item.clicks.unshift({
      at: now,
      url: safeTarget,
      userAgent: String(req.get('user-agent') || '').slice(0, 220)
    });
    item.clicks = item.clicks.slice(0, 20);
  });
  res.redirect(safeTarget);
});

function unsubscribePageHtml({ ok = true, email = '', message = '' } = {}) {
  const title = ok ? 'Ви відписані від листів Mercato' : 'Не вдалося відписати адресу';
  const body = message || (ok
    ? 'Ми більше не будемо надсилати маркетингові листи на цю адресу.'
    : 'Посилання не знайдено або воно вже неактивне. Напишіть нам у відповідь на лист, і ми відпишемо адресу вручну.');
  return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;background:#f2f6f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#123d31;">
  <main style="max-width:620px;margin:64px auto;padding:0 18px;">
    <section style="background:#fffefa;border:1px solid #dfe7df;border-radius:12px;padding:28px;box-shadow:0 10px 28px rgba(23,32,29,.08);">
      <div style="font-size:24px;font-weight:900;margin-bottom:8px;">${escapeHtml(title)}</div>
      ${email ? `<div style="font-size:13px;color:#66756d;margin-bottom:12px;">${escapeHtml(email)}</div>` : ''}
      <p style="font-size:16px;line-height:1.55;margin:0 0 18px;">${escapeHtml(body)}</p>
      <a href="https://mercato.com.ua/" style="display:inline-block;background:#123d31;color:#fff;text-decoration:none;border-radius:8px;padding:11px 15px;font-weight:900;">Повернутись на Mercato</a>
    </section>
  </main>
</body>
</html>`;
}

function handleEmailUnsubscribe(req, res) {
  const id = String(req.params.id || '').trim();
  const now = new Date().toISOString();
  const item = updateEmailTracking(id, message => {
    message.unsubscribedAt = now;
    message.unsubscribeCount = Number(message.unsubscribeCount || 0) + 1;
  });
  if (!item?.to) {
    res.status(404).send(unsubscribePageHtml({ ok: false }));
    return;
  }
  const email = suppressEmail(item.to, 'unsubscribe link', 'unsubscribe_link');
  if (req.method === 'POST') {
    res.json({ ok: true, email });
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(unsubscribePageHtml({ ok: true, email }));
}

app.get('/email/unsubscribe/:id', handleEmailUnsubscribe);
app.post('/email/unsubscribe/:id', handleEmailUnsubscribe);

app.get('/email/tracking', (req, res) => {
  const messages = readEmailTracking().messages || [];
  const suppressed = emailSuppressionEntries();
  const total = messages.length;
  const sent = messages.filter(item => item.status === 'smtp_accepted' || item.status === 'opened' || item.status === 'clicked').length;
  const failed = messages.filter(item => item.status === 'failed').length;
  const opened = messages.filter(item => Number(item.openCount || 0) > 0).length;
  const clicked = messages.filter(item => Number(item.clickCount || 0) > 0).length;
  const latestError = messages.find(item => item.status === 'failed' && item.error);
  const campaigns = {};
  for (const item of messages) {
    const key = item.segmentTitle || item.campaign || 'manual';
    if (!campaigns[key]) campaigns[key] = { title: key, total: 0, sent: 0, failed: 0, opened: 0, clicked: 0, lastActivityAt: '' };
    campaigns[key].total += 1;
    if (item.status === 'smtp_accepted' || item.status === 'opened' || item.status === 'clicked') campaigns[key].sent += 1;
    if (item.status === 'failed') campaigns[key].failed += 1;
    if (Number(item.openCount || 0) > 0) campaigns[key].opened += 1;
    if (Number(item.clickCount || 0) > 0) campaigns[key].clicked += 1;
    const last = item.lastClickedAt || item.lastOpenedAt || item.sentAt || item.failedAt || item.createdAt || '';
    if (last > campaigns[key].lastActivityAt) campaigns[key].lastActivityAt = last;
  }
  res.json({
    baseUrl: trackingBaseUrl(req),
    publicTrackingConfigured: Boolean(process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || process.env.TRACKING_BASE_URL),
    summary: {
      total,
      sent,
      failed,
      opened,
      clicked,
      unsubscribed: suppressed.length,
      latestError: latestError ? {
        to: latestError.to || '',
        subject: latestError.subject || '',
        error: latestError.error || '',
        failedAt: latestError.failedAt || latestError.createdAt || ''
      } : null
    },
    campaigns: Object.values(campaigns).slice(0, 30),
    messages: messages.slice(0, 200).map(item => ({
      id: item.id,
      to: item.to,
      subject: item.subject,
      campaign: item.campaign,
      campaignId: item.campaignId || '',
      actionId: item.actionId || '',
      segmentId: item.segmentId || '',
      segmentTitle: item.segmentTitle,
      draftName: item.draftName,
      status: item.status,
      sentAt: item.sentAt,
      failedAt: item.failedAt,
      error: item.error,
      openCount: item.openCount,
      firstOpenedAt: item.firstOpenedAt,
      lastOpenedAt: item.lastOpenedAt,
      clickCount: item.clickCount,
      firstClickedAt: item.firstClickedAt,
      lastClickedAt: item.lastClickedAt,
      unsubscribedAt: item.unsubscribedAt,
      messageId: item.messageId
    }))
  });
});

app.get('/email/intelligence', async (req, res) => {
  try {
    const pages = Math.max(1, Math.min(Number(req.query.orderPages || 10) || 10, 30));
    const orders = await fetchBridgePages('orders', 'orders', pages).catch(error => {
      console.warn('email intelligence orders unavailable:', error.message);
      return [];
    });
    res.json(buildEmailIntelligence(orders));
  } catch (error) {
    res.status(500).json({ error: explainBridgeError(error) });
  }
});

app.post('/email/send-segment', async (req, res) => {
  try {
    const body = req.body || {};
    const rawSegment = body.segment && typeof body.segment === 'object'
      ? body.segment
      : {
          id: body.segmentId || body.segment_id || 'manual_segment',
          title: body.segmentTitle || body.segmentName || body.segmentId || 'Сегмент',
          recipients: Array.isArray(body.recipients) ? body.recipients : []
        };
    const draft = body.draft && typeof body.draft === 'object'
      ? body.draft
      : {
          name: body.offer || body.campaignType || 'segment email',
          subject: body.subject,
          preheader: body.preheader,
          body: body.body,
          cta: body.cta,
          ctaLabel: body.cta,
          ctaUrl: body.ctaUrl || body.url,
          productUrl: body.url,
          segmentId: body.segmentId,
          campaignType: body.campaignType,
          couponCode: body.couponCode,
          couponSettings: body.couponSettings
        };
    const segment = filterSegmentRecipientsForRequest(rawSegment, {
      recipientIds: body.recipientIds || body.selectedRecipientIds || body.selectedRecipients,
      excludedRecipientIds: body.excludedRecipientIds || body.excludeRecipientIds
    });
    const limit = Math.max(1, Math.min(200, Number(body.limit || segmentRecipients(segment).length || 20)));
    const { confirmPhrase } = body;
    if (confirmPhrase !== 'SEND_MERCATO_SEGMENT') {
      return res.status(400).json({ error: 'Потрібне підтвердження SEND_MERCATO_SEGMENT' });
    }
    assertEmailDraftSafe(draft, draft?.name || 'segment email');
    await verifySmtpOrThrow();
    const result = await sendSegmentEmailNow({ segment, draft, limit, baseUrl: trackingBaseUrl(req) });
    if (!result.sent.length && result.failed.length) {
      return res.status(500).json({
        error: result.failed[0]?.error || 'Усі листи завершились помилкою',
        ...result
      });
    }
    res.json({ ok: true, ...result });
  } catch (error) {
    console.error('Помилка сегментної відправки:', error.message);
    res.status(500).json({ error: explainSmtpError(error) });
  }
});

app.post('/email/schedule-segment', async (req, res) => {
  try {
    const { segment, emails, rules, confirmPhrase, limit = 20 } = req.body;
    if (confirmPhrase !== 'SCHEDULE_MERCATO_SEGMENT') {
      return res.status(400).json({ error: 'Потрібне підтвердження SCHEDULE_MERCATO_SEGMENT' });
    }
    const drafts = Array.isArray(emails) ? emails : [];
    const planRules = Array.isArray(rules) ? rules : [];
    const scheduled = [];
    for (const rule of planRules) {
      const emailIndex = Math.max(0, Math.min(Number(rule.emailIndex || 0), drafts.length - 1));
      const draft = drafts[emailIndex];
      if (!draft?.subject || !draft?.body) continue;
      assertEmailDraftSafe(draft, rule.label || `Email ${emailIndex + 1}`);
      const days = Math.max(0, Number(rule.daysFromNow || 0));
      const sendAt = new Date(Date.now() + days * 86400000);
      scheduled.push(scheduleSegmentSend({
        segment,
        draft,
        limit,
        emailIndex,
        label: rule.label || `Email ${emailIndex + 1}`,
        segmentTitle: segment?.title || '',
        sendAt: sendAt.toISOString(),
        baseUrl: trackingBaseUrl(req)
      }));
    }
    if (!scheduled.length) return res.status(400).json({ error: 'Немає правил для планування' });
    await verifySmtpOrThrow();
    res.json({ ok: true, scheduled });
  } catch (error) {
    console.error('Помилка планування сегментної відправки:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/email/scheduled-segments', (req, res) => {
  res.json({
    jobs: segmentScheduleLog.slice(0, 50).map(job => ({
      id: job.id,
      status: job.status,
      segmentTitle: job.segmentTitle,
      label: job.label,
      sendAt: job.sendAt,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      result: job.result,
      error: job.error
    }))
  });
});

app.get('/email/suppression', (req, res) => {
  const emails = emailSuppressionEntries()
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .slice(0, 500);
  res.json({ count: emails.length, emails });
});

app.post('/email/suppression', (req, res) => {
  try {
    const { email, reason = 'manual suppression' } = req.body || {};
    const normalized = suppressEmail(email, reason, 'manual');
    if (!normalized) return res.status(400).json({ error: 'Некоректний email' });
    res.json({ ok: true, email: normalized, count: emailSuppressionEntries().length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function cleanupExpiredCouponsSafe({ prefix = 'MRC', mode = 'delete' } = {}) {
  try {
    return await callBridge('cleanup_coupons', { prefix, mode });
  } catch (error) {
    console.error('Помилка автоочищення промокодів:', error.message);
    return { ok: false, error: explainBridgeError(error) };
  }
}

app.post('/email/cleanup-coupons', async (req, res) => {
  try {
    const source = { ...(req.query || {}), ...(req.body || {}) };
    const data = await callBridge('cleanup_coupons', {
      prefix: source.prefix || 'MRC',
      mode: source.mode || 'delete'
    });
    res.json(data);
  } catch (error) {
    console.error('Помилка очищення промокодів:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Імпорт з URL — автозаповнення форми
app.post('/import-url', async (req, res) => {
  try {
    const { url, targetType = 'product' } = req.body;
    const target = seoTargetMeta(targetType);
    if (!url) return res.status(400).json({ error: 'URL обовʼязковий' });

    const imported = await fetchImportPage(url, { requireProduct: target.productLike });
    const pageResponse = imported.response;

    if (!pageResponse.ok) {
      if (pageResponse.status === 422) {
        return res.status(400).json({ error: target.productLike ? 'Посилання веде не на товарну сторінку. Вставте точне посилання товару або заповніть форму вручну.' : 'Не вдалося розпізнати цю сторінку. Заповніть форму вручну.' });
      }
      return res.status(400).json({ error: `Сайт повернув помилку ${pageResponse.status}. Спробуй заповнити форму вручну.` });
    }

    const html = await pageResponse.text();

    const fallbackData = extractImportDataFromHtml(html, imported.url);
    let aiData = {};
    let importWarning = '';

    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Витягни дані для SEO-роботи (${target.label} Mercato) з цього HTML і поверни ТІЛЬКИ валідний JSON без зайвого тексту:
{
  "productName": "повна назва товару/категорії/сторінки",
  "origin": "країна/контекст або порожній рядок",
  "region": "регіон/група/розділ або порожній рядок",
  "processing": "тип/головний фокус або порожній рядок",
  "harvestYear": "рік врожаю або порожній рядок",
  "flavors": "смак або теми сторінки словами через кому; не шкали і не числа",
  "brewing": "методи заварювання або основна дія користувача",
  "existingTitle": "поточний title tag або порожній рядок",
  "existingH1": "поточний h1 або порожній рядок"
}

HTML:
${html.substring(0, 20000)}`
        }]
      });
      const raw = message.content[0].text.trim();
      aiData = safeParseJson(raw);
    } catch (aiError) {
      importWarning = `AI-розбір URL не дав валідний JSON, використав HTML fallback: ${aiError.message}`;
      console.warn('import-url fallback:', aiError.message);
    }

    const mergedData = sanitizeImportedProductData(
      Object.fromEntries(Object.entries(aiData || {}).filter(([, value]) => String(value || '').trim())),
      fallbackData,
      { productLike: target.productLike }
    );

    res.json({
      ...mergedData,
      importedUrl: imported.url,
      importNote: [
        imported.url !== url ? `Знайшов схожу робочу сторінку: ${imported.url}` : '',
        importWarning
      ].filter(Boolean).join(' ')
    });

  } catch (error) {
    console.error('Помилка імпорту:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/opencart/find-product', async (req, res) => {
  try {
    const { q, url = '', productName = '', title = '', h1 = '' } = req.body || {};
    const slug = productSlugFromUrl(url);
    const query = String(q || productName || h1 || title || slug || '').trim();
    if (!query) return res.status(400).json({ error: 'Назва товару обовʼязкова' });

    if (url) {
      const urlProductId = productIdFromUrl(url) || await productIdFromLivePage(url);
      if (urlProductId) {
        return res.json({
          ok: true,
          product: {
            id: urlProductId,
            product_id: urlProductId,
            name: productName || h1 || title || slug || query,
            keyword: slug,
            routeUrl: `https://mercato.com.ua/index.php?route=product/product&product_id=${urlProductId}`,
            url,
            source: 'url_product_id'
          },
          candidates: []
        });
      }
    }

    const data = await callBridge('product_search', { q: query, limit: 8 });
    const products = data.products || [];
    if (!products.length) {
      const liveProductId = await productIdFromLivePage(url);
      if (liveProductId) {
        return res.json({
          ok: true,
          product: {
            id: liveProductId,
            product_id: liveProductId,
            name: productName || h1 || title || slug || query,
            keyword: slug,
            routeUrl: `https://mercato.com.ua/index.php?route=product/product&product_id=${liveProductId}`,
            url,
            source: 'live_page_product_id'
          },
          candidates: []
        });
      }
      return res.status(404).json({ error: 'Товар не знайдено в OpenCart' });
    }
    const normalizedQuery = normalizeProductLookupText(query);
    const ranked = products
      .map(product => ({
        ...product,
        score: productLookupScore(normalizedQuery, product)
      }))
      .sort((a, b) => b.score - a.score);
    res.json({ ok: true, product: ranked[0], candidates: ranked });
  } catch (error) {
    console.error('Помилка пошуку товару:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/opencart/read-product', async (req, res) => {
  try {
    const data = await callBridge('product_read', {
      url: req.query.url || '',
      slug: req.query.slug || '',
      product_id: req.query.product_id || req.query.id || ''
    });
    res.json(data);
  } catch (error) {
    const fallback = await fallbackOpenCartReadProduct(req.query || {}, error).catch(() => null);
    if (fallback) return res.json(fallback);
    res.status(500).json({ error: explainBridgeError(error), raw: String(error.message || error) });
  }
});

function normalizeOpenCartEntryRead(data = {}, { type = 'product', url = '', source = 'bridge' } = {}) {
  const snapshot = data.snapshot || {};
  return {
    ok: true,
    type: data.type || type,
    id: data.id || data.product_id || data.category_id || data.information_id || snapshot.id || '',
    product_id: data.product_id || snapshot.product_id || '',
    category_id: data.category_id || snapshot.category_id || '',
    information_id: data.information_id || snapshot.information_id || '',
    url: data.url || url,
    source,
    snapshot: {
      ...snapshot,
      meta_title: snapshot.meta_title || '',
      meta_description: snapshot.meta_description || '',
      meta_h1: snapshot.meta_h1 || snapshot.name || '',
      descriptionLength: Number(snapshot.descriptionLength || String(snapshot.description || '').length || 0),
      descriptionPreview: snapshot.descriptionPreview || stripHtml(snapshot.description || '').slice(0, 220),
      attributes: snapshot.attributes || {}
    },
    attributeCatalog: Array.isArray(data.attributeCatalog) ? data.attributeCatalog : []
  };
}

async function fallbackOpenCartReadEntry({ type = 'category', url = '' } = {}, cause = null) {
  const fullUrl = normalizeAbsoluteUrl(url);
  if (!fullUrl) return null;
  const page = await fetchPage(fullUrl, BROWSER_HEADERS, 12000);
  if (!page.html) return null;
  const $ = cheerio.load(page.html);
  const contentHtml = $('#content .category-description, #content #tab-description, #content [itemprop="description"], #content').first().html() || '';
  const metaDescription = metaContent($, 'meta[name="description"]') || metaContent($, 'meta[property="og:description"]');
  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
  const title = $('title').first().text().replace(/\s+/g, ' ').trim();
  const descriptionText = stripHtml(contentHtml);
  return normalizeOpenCartEntryRead({
    ok: true,
    type,
    url: fullUrl,
    snapshot: {
      found: true,
      type,
      language_id: '',
      name: h1 || title,
      meta_title: title,
      meta_description: metaDescription,
      meta_h1: h1,
      description: contentHtml,
      descriptionLength: descriptionText.length,
      descriptionPreview: descriptionText.slice(0, 220),
      attributes: {}
    },
    warning: cause ? explainBridgeError(cause) : 'Bridge read fallback'
  }, { type, url: fullUrl, source: 'live_html_fallback' });
}

async function readOpenCartEntry({ type = 'product', url = '', slug = '', id = '' } = {}) {
  const cleanType = ['product', 'category', 'information'].includes(type) ? type : 'product';
  try {
    const data = cleanType === 'product'
      ? await callBridge('product_read', { url, slug, product_id: id })
      : await callBridge('content_read', { type: cleanType, url, slug, id });
    return normalizeOpenCartEntryRead(data, { type: cleanType, url, source: 'bridge' });
  } catch (error) {
    const fallback = await fallbackOpenCartReadEntry({ type: cleanType, url }, error).catch(() => null);
    if (fallback) return fallback;
    throw error;
  }
}

function organicCurrentFromEntry(entry = null) {
  if (!entry?.snapshot) return null;
  const snap = entry.snapshot || {};
  return {
    title: snap.meta_title || '',
    metaDescription: snap.meta_description || '',
    h1: snap.meta_h1 || snap.name || '',
    content: snap.description || '',
    descriptionLength: Number(snap.descriptionLength || 0),
    source: entry.source || ''
  };
}

const PRODUCT_CARD_PROFILE_KEYS = ['Кислотність', 'Солодкість', 'Тіло', 'Фруктовість'];

function normalizeTrustAttributeKey(value) {
  return plainOneLine(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

function trustAttributeValue(attrs = {}, exactKey = '') {
  const target = normalizeTrustAttributeKey(exactKey);
  for (const [name, value] of Object.entries(attrs || {})) {
    if (normalizeTrustAttributeKey(name) === target) return plainOneLine(value);
  }
  return '';
}

function trustAttributeValueAny(attrs = {}, keys = []) {
  for (const key of keys) {
    const value = trustAttributeValue(attrs, key);
    if (value) return value;
  }
  return '';
}

function buildProductCardExpectation(attrs = {}) {
  const profile = {};
  for (const key of PRODUCT_CARD_PROFILE_KEYS) {
    const value = key === 'Фруктовість'
      ? trustAttributeValueAny(attrs, ['Фруктовість', 'Фруктовисть', 'Fruitiness'])
      : trustAttributeValue(attrs, key);
    profile[key] = {
      value,
      score: clampTasteScore(value)
    };
  }

  const rawTaste = trustAttributeValue(attrs, 'Смак');
  const taste = hasUsefulTasteNotes(rawTaste) ? plainOneLine(rawTaste) : '';

  return {
    profile,
    taste,
    tasteNotes: splitTasteNotes(taste),
    rawTaste,
    technology: trustAttributeValue(attrs, 'Технологія обсмаження'),
    sourceOfTruth: 'OpenCart attributes'
  };
}

function trustProductInactiveReason(record = {}) {
  const snapshot = record.snapshot || {};
  const product = record.product || {};
  const statusRaw = record.status ?? snapshot.status ?? product.status ?? '';
  const statusKnown = statusRaw !== '' && statusRaw !== null && statusRaw !== undefined;
  const normalized = String(statusRaw).trim().toLowerCase();
  if (statusKnown && (Number(statusRaw) === 0 || ['0', 'false', 'disabled', 'off', 'inactive'].includes(normalized))) {
    return 'товар вимкнений в OpenCart';
  }
  return '';
}

function cacheBustedUrl(url = '', param = '_trust') {
  if (!url) return '';
  return `${url}${url.includes('?') ? '&' : '?'}${param}=${Date.now()}`;
}

function extractLiveSpecCardSnapshot(html = '') {
  const $ = cheerio.load(String(html || ''));
  const card = $('.spec-card').first();
  if (!card.length) {
    return {
      checked: Boolean(html),
      hasCard: false,
      text: '',
      profile: {},
      notes: []
    };
  }

  const profile = {};
  card.find('.spec-profile-row').each((_, row) => {
    const label = plainOneLine($(row).find('.spec-profile-label').first().text());
    const value = plainOneLine($(row).find('.spec-profile-value').first().text());
    if (label) profile[label] = value;
  });

  return {
    checked: true,
    hasCard: true,
    text: stripHtml(card.html()).slice(0, 3000),
    profile,
    notes: card.find('.spec-note').map((_, el) => plainOneLine($(el).text())).get().filter(Boolean)
  };
}

function liveProfileValue(liveProfile = {}, key = '') {
  const target = normalizeTrustAttributeKey(key);
  for (const [label, value] of Object.entries(liveProfile || {})) {
    const cleanLabel = normalizeTrustAttributeKey(label);
    if (cleanLabel === target) return value;
    if (target === 'фруктовість' && ['фруктовисть', 'fruitiness'].includes(cleanLabel)) return value;
  }
  return '';
}

function buildProductConsistencyAudit({ entry = {}, livePage = null, url = '' } = {}) {
  const snapshot = entry.snapshot || {};
  const attrs = snapshot.attributes || {};
  const inactiveReason = trustProductInactiveReason(entry);
  if (inactiveReason) {
    return {
      ok: true,
      status: 'skipped',
      skipped: true,
      url: url || entry.url || '',
      product: {
        id: entry.product_id || entry.id || snapshot.product_id || '',
        name: snapshot.name || snapshot.meta_h1 || snapshot.meta_title || '',
        source: entry.source || '',
        status: snapshot.status ?? entry.status ?? '',
        quantity: snapshot.quantity ?? entry.quantity ?? '',
        stockStatus: snapshot.stock_status || entry.stock_status || ''
      },
      expected: buildProductCardExpectation(attrs),
      live: null,
      checks: [{
        ok: true,
        severity: 'info',
        code: 'product_inactive_skipped',
        message: `Товар пропущено: ${inactiveReason}. Він не має блокувати Trust Gate.`,
        details: { status: snapshot.status ?? entry.status ?? '', quantity: snapshot.quantity ?? entry.quantity ?? '' }
      }],
      issues: [],
      recommendation: 'Товар вимкнений або не продається на сайті, тому Trust Gate не вимагає виправлення картки.'
    };
  }
  const expected = buildProductCardExpectation(attrs);
  const checks = [];
  const addCheck = (ok, severity, code, message, details = {}) => {
    checks.push({ ok: Boolean(ok), severity, code, message, details });
  };

  addCheck(
    Object.keys(attrs).length > 0,
    'critical',
    'opencart_attributes_present',
    Object.keys(attrs).length
      ? 'OpenCart readback повернув характеристики товару.'
      : 'OpenCart readback не повернув характеристики товару: немає джерела правди для правої картки.',
    { count: Object.keys(attrs).length }
  );

  for (const key of PRODUCT_CARD_PROFILE_KEYS) {
    const row = expected.profile[key] || {};
    if (!row.value) {
      addCheck(false, 'high', `profile_${key}`, `Немає атрибута ${key} для шкали правої картки.`);
    } else if (row.score === null) {
      addCheck(false, 'high', `profile_${key}`, `${key} має нечислове значення: ${row.value}.`, { value: row.value });
    } else {
      addCheck(true, 'info', `profile_${key}`, `${key}: ${row.value}`, { value: row.value, score: row.score });
    }
  }

  if (!expected.rawTaste) {
    addCheck(false, 'critical', 'taste_present', 'Немає точного атрибута Смак. Права картка не має брати Післясмак або числові шкали.');
  } else if (!expected.taste) {
    addCheck(false, 'critical', 'taste_not_numeric', `Атрибут Смак не схожий на текстові ноти: ${expected.rawTaste}.`, { value: expected.rawTaste });
  } else {
    addCheck(true, 'info', 'taste_not_numeric', `Смак читається з точного атрибута Смак: ${expected.taste}.`, { notes: expected.tasteNotes });
  }

  let live = null;
  if (livePage) {
    live = extractLiveSpecCardSnapshot(livePage.html || '');
    if (!livePage.html) {
      addCheck(false, 'medium', 'live_loaded', livePage.error || 'Live-сторінка не завантажилась для перевірки.');
    } else if (!live.hasCard) {
      addCheck(false, 'medium', 'live_spec_card_present', 'На live-сторінці не знайдено .spec-card.');
    } else {
      addCheck(true, 'info', 'live_spec_card_present', 'На live-сторінці знайдено .spec-card.');

      const numericNotes = live.notes.filter(note => isNumericScaleText(note) || !hasLetters(note));
      addCheck(
        numericNotes.length === 0,
        'critical',
        'live_notes_not_numeric',
        numericNotes.length
          ? `Live-картка показує число як смакову ноту: ${numericNotes.join(', ')}.`
          : 'Live-картка не показує числові значення як смакові ноти.',
        { numericNotes, notes: live.notes }
      );

      for (const key of PRODUCT_CARD_PROFILE_KEYS) {
        const expectedScore = expected.profile[key]?.score;
        if (expectedScore === null || expectedScore === undefined) continue;
        const liveValue = liveProfileValue(live.profile, key);
        const liveScore = clampTasteScore(liveValue);
        if (!liveValue) {
          addCheck(false, 'high', `live_profile_${key}`, `Live-картка не показує шкалу ${key}.`);
        } else if (liveScore === null) {
          addCheck(false, 'high', `live_profile_${key}`, `Live-картка має нечислове значення ${key}: ${liveValue}.`, { liveValue });
        } else {
          const same = Math.abs(liveScore - expectedScore) <= 0.15;
          addCheck(
            same,
            'high',
            `live_profile_${key}`,
            same
              ? `Live ${key} збігається з OpenCart: ${liveValue}.`
              : `Розбіжність ${key}: OpenCart ${expected.profile[key].value}, live ${liveValue}.`,
            { expected: expected.profile[key].value, live: liveValue }
          );
        }
      }

      if (expected.tasteNotes.length) {
        const liveText = normalizeTrustAttributeKey(live.text);
        const matchedNotes = expected.tasteNotes.filter(note => liveText.includes(normalizeTrustAttributeKey(note)));
        addCheck(
          matchedNotes.length > 0,
          'high',
          'live_taste_matches_opencart',
          matchedNotes.length
            ? `Live-картка показує смак з OpenCart: ${matchedNotes.join(', ')}.`
            : 'Live-картка не показує жодної очікуваної ноти з атрибута Смак.',
          { expectedNotes: expected.tasteNotes, liveNotes: live.notes }
        );
      }
    }
  }

  const issues = checks.filter(check => !check.ok);
  const hasCritical = issues.some(check => check.severity === 'critical' || check.severity === 'high');
  const hasWarnings = issues.some(check => check.severity === 'medium');
  const status = hasCritical ? 'fail' : hasWarnings ? 'warn' : 'ok';

  return {
    ok: status === 'ok',
    status,
    url: url || entry.url || '',
    product: {
      id: entry.product_id || entry.id || snapshot.product_id || '',
      name: snapshot.name || snapshot.meta_h1 || snapshot.meta_title || '',
      source: entry.source || '',
      status: snapshot.status ?? entry.status ?? '',
      quantity: snapshot.quantity ?? entry.quantity ?? '',
      stockStatus: snapshot.stock_status || entry.stock_status || ''
    },
    expected,
    live,
    checks,
    issues,
    recommendation: status === 'ok'
      ? 'Дані узгоджені: OpenCart attributes і live .spec-card показують одне джерело правди.'
      : 'Спочатку вирівняти OpenCart attributes і product.twig/.spec-card, потім чистити modification/theme/page cache і повторити trust-check.'
  };
}

function trustIssueCounts(audit = {}) {
  const issues = Array.isArray(audit.issues) ? audit.issues : [];
  return {
    criticalCount: issues.filter(issue => issue.severity === 'critical').length,
    highCount: issues.filter(issue => issue.severity === 'high').length,
    mediumCount: issues.filter(issue => issue.severity === 'medium').length
  };
}

function recordTrustCheck(audit = {}, context = {}) {
  if (!audit) return;
  const counts = trustIssueCounts(audit);
  operationalStore.appendTrustCheck({
    url: audit.url || context.url || '',
    productId: audit.product?.id || context.productId || '',
    status: audit.status || '',
    ...counts,
    product: audit.product || {},
    recommendation: audit.recommendation || '',
    checks: (audit.checks || []).map(check => ({
      ok: check.ok,
      severity: check.severity,
      code: check.code,
      message: check.message
    }))
  });
}

function readTrustSkips() {
  const data = readJsonFile(TRUST_SKIP_PATH, { version: 1, entries: [] });
  return {
    version: 1,
    entries: Array.isArray(data.entries) ? data.entries : []
  };
}

function writeTrustSkips(data = {}) {
  writeJsonFile(TRUST_SKIP_PATH, {
    version: 1,
    entries: (Array.isArray(data.entries) ? data.entries : []).slice(0, 500)
  });
}

function trustSkipSet() {
  const set = new Set();
  for (const entry of readTrustSkips().entries) {
    for (const alias of trustCheckAliases(entry)) set.add(alias);
  }
  return set;
}

function isTrustSkipped(item = {}, skipSet = trustSkipSet()) {
  return trustCheckAliases(item).some(alias => skipSet.has(alias));
}

function upsertTrustSkip(input = {}) {
  const now = new Date().toISOString();
  const skip = {
    id: input.id || `trust-skip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url: input.url ? normalizeAbsoluteUrl(input.url) : '',
    productId: input.productId || input.product_id || '',
    product_id: input.productId || input.product_id || '',
    name: input.name || input.productName || input.product?.name || '',
    product: {
      id: input.productId || input.product_id || input.product?.id || '',
      product_id: input.productId || input.product_id || input.product?.product_id || '',
      name: input.name || input.productName || input.product?.name || '',
      status: input.status ?? input.product?.status ?? ''
    },
    reason: input.reason || 'товар вимкнений або не має блокувати Trust Gate',
    source: input.source || 'manual',
    createdAt: now
  };
  const data = readTrustSkips();
  const aliases = new Set(trustCheckAliases(skip));
  data.entries = [
    skip,
    ...data.entries.filter(entry => !trustCheckAliases(entry).some(alias => aliases.has(alias)))
  ];
  writeTrustSkips(data);
  return skip;
}

async function runProductConsistencyCheck({ url = '', productId = '', slug = '', live = true } = {}) {
  const cleanUrl = url ? normalizeAbsoluteUrl(url) : '';
  const entry = await readOpenCartEntry({
    type: 'product',
    url: cleanUrl,
    slug,
    id: productId
  });
  const liveSourceUrl = String(entry.url || cleanUrl || '').trim();
  const liveUrl = liveSourceUrl ? normalizeAbsoluteUrl(liveSourceUrl) : '';
  const inactiveReason = trustProductInactiveReason(entry);
  const livePage = !inactiveReason && live && liveUrl
    ? await fetchPage(cacheBustedUrl(liveUrl), BROWSER_HEADERS, 12000, 120000)
    : null;
  const audit = buildProductConsistencyAudit({ entry, livePage, url: liveUrl || cleanUrl });
  recordTrustCheck(audit, { url: liveUrl || cleanUrl, productId });
  return audit;
}

function defaultTrustCheckCandidates(limit = 10) {
  const candidates = [];
  const skipSet = trustSkipSet();
  const pushCandidate = (item = {}) => {
    const url = normalizeAbsoluteUrl(item.url || item.routeUrl || item.action?.url || '');
    if (!url) return;
    const candidate = {
      url,
      productId: item.product_id || item.productId || item.action?.product_id || '',
      name: item.name || item.productName || item.action?.productName || item.title || '',
      status: item.status ?? item.action?.status ?? '',
      quantity: item.quantity ?? '',
      stockStatus: item.stock_status || item.stockStatus || '',
      source: item.source || ''
    };
    if (trustProductInactiveReason(candidate) || isTrustSkipped(candidate, skipSet)) return;
    candidates.push(candidate);
  };

  for (const event of readBusinessMemory().events || []) {
    if (event?.action?.type === 'seo_monitor' || event?.source === 'opencart_sync') {
      pushCandidate({ ...event.action, title: event.title, source: 'business_memory' });
    }
  }

  const auditCache = readSeoAuditCache();
  const products = Array.isArray(auditCache.productAudit?.products) ? auditCache.productAudit.products : [];
  products
    .filter(product => product.url)
    .sort((a, b) => String(b.date_modified || '').localeCompare(String(a.date_modified || '')))
    .forEach(product => pushCandidate({ ...product, source: 'seo_audit_cache' }));

  const seen = new Set();
  return candidates.filter(item => {
    const key = normalizeAbsoluteUrl(item.url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, Math.max(1, Math.min(Number(limit) || 10, 25)));
}

function trustCheckAliases(item = {}) {
  const product = item.product || {};
  let url = String(item.url || product.url || product.routeUrl || '').trim();
  if (url) {
    try {
      url = normalizeAbsoluteUrl(url);
    } catch {
      url = url.toLowerCase();
    }
  }
  return [
    item.productId,
    item.product_id,
    product.id,
    product.product_id,
    url,
    product.name,
    item.name,
    item.id
  ]
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

function trustCheckKey(item = {}) {
  return trustCheckAliases(item)[0] || '';
}

function latestTrustChecks(checks = []) {
  const seen = new Set();
  const latest = [];
  for (const item of checks || []) {
    const aliases = trustCheckAliases(item);
    if (!aliases.length || aliases.some(alias => seen.has(alias))) continue;
    aliases.forEach(alias => seen.add(alias));
    latest.push(item);
  }
  return latest;
}

function buildTrustReport(limit = 50) {
  const rawLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
  const rawChecks = operationalStore.readTrustChecks(500);
  const skipSet = trustSkipSet();
  const skippedChecks = latestTrustChecks(rawChecks).filter(item => item.status === 'skipped' || isTrustSkipped(item, skipSet));
  const checks = latestTrustChecks(rawChecks)
    .filter(item => item.status !== 'skipped' && !isTrustSkipped(item, skipSet))
    .slice(0, rawLimit);
  const failed = checks.filter(item => item.status === 'fail' || item.status === 'error');
  const warn = checks.filter(item => item.status === 'warn');
  const ok = checks.filter(item => item.status === 'ok');
  const criticalOrHigh = checks.reduce((sum, item) => sum + Number(item.criticalCount || 0) + Number(item.highCount || 0), 0);
  const latestAt = rawChecks[0]?.createdAt || checks[0]?.createdAt || '';
  return {
    checked: checks.length,
    ok: ok.length,
    warn: warn.length,
    failed: failed.length,
    skipped: skippedChecks.length,
    criticalOrHigh,
    latestAt,
    status: failed.length || criticalOrHigh ? 'fail' : warn.length ? 'warn' : checks.length ? 'ok' : 'empty',
    recentFailures: failed.slice(0, 10).map(item => ({
      url: item.url || '',
      productId: item.productId || item.product_id || '',
      status: item.status || '',
      criticalCount: Number(item.criticalCount || 0),
      highCount: Number(item.highCount || 0),
      product: item.product || {},
      recommendation: item.recommendation || ''
    }))
  };
}

app.get('/trust/report', (req, res) => {
  res.json({
    ok: true,
    report: buildTrustReport(Math.max(1, Math.min(Number(req.query.limit || 50) || 50, 500)))
  });
});

app.get('/trust/product-consistency', async (req, res) => {
  try {
    const rawUrl = String(req.query.url || '').trim();
    const url = rawUrl ? normalizeAbsoluteUrl(rawUrl) : '';
    const productId = req.query.product_id || req.query.id || '';
    const slug = req.query.slug || '';
    if (!url && !productId && !slug) {
      return res.status(400).json({ error: 'Передайте url, product_id або slug товару.' });
    }

    res.json(await runProductConsistencyCheck({
      url,
      productId,
      slug,
      live: req.query.live !== '0'
    }));
  } catch (error) {
    console.error('Помилка trust product consistency:', error.message);
    res.status(500).json({ error: explainBridgeError(error), raw: String(error.message || error) });
  }
});

app.post('/trust/product-skip', (req, res) => {
  try {
    const { url = '', productId = '', product_id = '', name = '', reason = 'товар вимкнений на сайті' } = req.body || {};
    if (!url && !productId && !product_id && !name) {
      return res.status(400).json({ error: 'Передайте url, productId або name товару.' });
    }
    const skip = upsertTrustSkip({
      url,
      productId: productId || product_id,
      name,
      reason,
      source: 'trust_gate'
    });
    operationalStore.appendTrustCheck({
      url: skip.url,
      productId: skip.productId,
      status: 'skipped',
      criticalCount: 0,
      highCount: 0,
      product: skip.product,
      recommendation: `Пропущено в Trust Gate: ${skip.reason}`,
      checks: [{
        ok: true,
        severity: 'info',
        code: 'trust_manual_skip',
        message: skip.reason
      }]
    });
    res.json({ ok: true, skip, report: buildTrustReport(50) });
  } catch (error) {
    console.error('Помилка trust skip:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/trust/product-consistency-batch', async (req, res) => {
  const startedAt = new Date().toISOString();
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit || 10) || 10, 25));
    const explicitUrls = String(req.query.urls || '')
      .split(/\s*,\s*/)
      .map(item => item.trim())
      .filter(Boolean);
    const candidates = explicitUrls.length
      ? explicitUrls.slice(0, limit).map(url => ({ url: normalizeAbsoluteUrl(url), source: 'query' })).filter(item => item.url)
      : defaultTrustCheckCandidates(limit);
    const results = [];
    for (const candidate of candidates) {
      try {
        const audit = await runProductConsistencyCheck({
          url: candidate.url,
          productId: candidate.productId || '',
          live: req.query.live !== '0'
        });
        results.push({ candidate, audit });
      } catch (error) {
        results.push({
          candidate,
          error: explainBridgeError(error),
          audit: {
            ok: false,
            status: 'error',
            url: candidate.url,
            product: { id: candidate.productId || '', name: candidate.name || '' },
            issues: [{ severity: 'critical', code: 'trust_check_error', message: explainBridgeError(error) }]
          }
        });
      }
    }
    const failed = results.filter(item => ['fail', 'error'].includes(item.audit?.status));
    const warn = results.filter(item => item.audit?.status === 'warn');
    const criticalOrHigh = results.reduce((sum, item) => {
      const counts = trustIssueCounts(item.audit || {});
      return sum + counts.criticalCount + counts.highCount;
    }, 0);
    res.json({
      ok: failed.length === 0 && criticalOrHigh === 0,
      startedAt,
      finishedAt: new Date().toISOString(),
      summary: {
        checked: results.length,
        ok: results.filter(item => item.audit?.status === 'ok').length,
        warn: warn.length,
        failed: failed.length,
        criticalOrHigh
      },
      results: results.map(item => ({
        candidate: item.candidate,
        status: item.audit?.status || 'error',
        product: item.audit?.product || {},
        issues: item.audit?.issues || [],
        recommendation: item.audit?.recommendation || '',
        error: item.error || ''
      }))
    });
  } catch (error) {
    console.error('Помилка batch trust product consistency:', error.message);
    res.status(500).json({ error: explainBridgeError(error), raw: String(error.message || error) });
  }
});

app.get('/opencart/read-entry', async (req, res) => {
  try {
    const data = await readOpenCartEntry({
      type: req.query.type || 'product',
      url: req.query.url || '',
      slug: req.query.slug || '',
      id: req.query.id || req.query.product_id || req.query.category_id || req.query.information_id || ''
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: explainBridgeError(error), raw: String(error.message || error) });
  }
});

app.get('/opencart/attribute-catalog', async (req, res) => {
  try {
    res.json(await callBridge('attribute_catalog'));
  } catch (error) {
    res.status(500).json({ error: explainBridgeError(error), raw: String(error.message || error) });
  }
});

function coffeetonPriceUrl() {
  return String(process.env.COFFEETON_PRICE_URL || 'https://coffeeton.com/price/').trim() || 'https://coffeeton.com/price/';
}

function coffeetonRequestHeaders() {
  const headers = {
    ...BROWSER_HEADERS,
    Referer: 'https://coffeeton.com/'
  };
  const savedAuth = readJsonFile(SUPPLIER_AUTH_PATH, {});
  const cookie = String(process.env.COFFEETON_COOKIE || process.env.COFFEETON_AUTH_COOKIE || savedAuth.coffeetonCookie || '').trim();
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function coffeetonAuthConfigured() {
  const savedAuth = readJsonFile(SUPPLIER_AUTH_PATH, {});
  return Boolean(String(process.env.COFFEETON_COOKIE || process.env.COFFEETON_AUTH_COOKIE || savedAuth.coffeetonCookie || '').trim());
}

function coffeePricingConfigFromEnv() {
  return configWithOverrides({
    greenVatRate: process.env.MERCATO_PRICE_GREEN_VAT_RATE,
    roastLossRate: process.env.MERCATO_PRICE_ROAST_LOSS_RATE,
    defaultPackageCostPerKg: process.env.MERCATO_PRICE_PACKAGE_PER_KG,
    defaultElectricityCostPerKg: process.env.MERCATO_PRICE_ELECTRICITY_PER_KG,
    defaultDeliveryCostPerKg: process.env.MERCATO_PRICE_DELIVERY_PER_KG,
    saleMarkup: process.env.MERCATO_PRICE_SALE_MARKUP,
    catalogMarkup: process.env.MERCATO_PRICE_CATALOG_MARKUP,
    siteOverhead: process.env.MERCATO_PRICE_SITE_OVERHEAD,
    siteRoundStep: process.env.MERCATO_PRICE_ROUND_STEP
  });
}

function localNbuUsdRate() {
  return parseMoney(process.env.NBU_USD_RATE || process.env.MERCATO_NBU_USD_RATE || '');
}

async function fetchNbuUsdRate() {
  const override = localNbuUsdRate();
  if (override) {
    return {
      ok: true,
      source: 'env',
      currency: 'USD',
      rate: override,
      date: '',
      fetchedAt: new Date().toISOString()
    };
  }
  const response = await fetch('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json', {
    headers: { Accept: 'application/json' }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`NBU повернув HTTP ${response.status}: ${compactApiText(text)}`);
  const data = JSON.parse(text);
  const row = Array.isArray(data) ? data[0] : data;
  const rate = parseMoney(row?.rate);
  if (!rate) throw new Error('NBU не повернув курс USD.');
  return {
    ok: true,
    source: 'nbu',
    currency: row.cc || 'USD',
    rate,
    date: row.exchangedate || '',
    fetchedAt: new Date().toISOString()
  };
}

function enrichSupplierLotPricing(lot = {}, options = {}) {
  const pricing = calculateSupplierLotPricing(lot, {
    nbuRate: options.nbuRate ?? localNbuUsdRate(),
    config: coffeePricingConfigFromEnv()
  });
  return { ...lot, pricing };
}

function mergeCachedSupplierPrices(lots = []) {
  const cache = readJsonFile(SUPPLIER_PRICE_CACHE_PATH, null);
  if (!cache || !Array.isArray(cache.lots)) return lots;
  const byArticle = new Map();
  for (const lot of cache.lots) {
    const key = normalizeArticle(lot.article);
    if (!key) continue;
    byArticle.set(key, lot);
  }
  return lots.map(lot => {
    const cached = byArticle.get(normalizeArticle(lot.article));
    if (!cached) return lot;
    const merged = { ...lot };
    if (!parseMoney(merged.price_uah) && parseMoney(cached.price_uah)) {
      merged.price_uah = cached.price_uah;
      merged.price_source = cached.price_source || 'saved_cache';
    }
    if (!parseMoney(merged.price_usd) && parseMoney(cached.price_usd)) {
      merged.price_usd = cached.price_usd;
      merged.price_source = cached.price_source || 'saved_cache';
    }
    return merged;
  });
}

async function fetchCoffeetonPriceHtml() {
  const localPath = String(process.env.COFFEETON_PRICE_HTML_PATH || '').trim();
  if (localPath) {
    const safePath = path.isAbsolute(localPath) ? localPath : path.join(__dirname, localPath);
    return {
      html: fs.readFileSync(safePath, 'utf8'),
      sourceUrl: `file:${safePath}`,
      authConfigured: false
    };
  }

  const sourceUrl = coffeetonPriceUrl();
  const controller = new AbortController();
  const timeoutMs = Number(process.env.COFFEETON_TIMEOUT_MS || 15000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(sourceUrl, {
      headers: coffeetonRequestHeaders(),
      signal: controller.signal
    });
    const html = await response.text();
    if (!response.ok) {
      throw new Error(`Coffeeton повернув HTTP ${response.status}: ${compactApiText(html)}`);
    }
    return {
      html,
      sourceUrl,
      authConfigured: coffeetonAuthConfigured()
    };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Coffeeton не відповів за ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeArticleFilter(input) {
  if (Array.isArray(input)) return input.map(normalizeArticle).filter(Boolean);
  return String(input || '')
    .split(/[,\n;\s]+/)
    .map(normalizeArticle)
    .filter(Boolean);
}

function filterLotsByRequest(lots, body = {}, query = {}) {
  const requestedArticles = normalizeArticleFilter(body.articles || query.articles || body.article || query.article);
  const requested = new Set(requestedArticles);
  const q = String(body.q || query.q || '').trim().toLowerCase();
  const limit = Math.max(0, Math.min(500, Number(body.limit || query.limit || 0)));
  let filtered = Array.isArray(lots) ? lots : [];
  if (requested.size) filtered = filtered.filter(lot => requested.has(normalizeArticle(lot.article)));
  if (q) {
    filtered = filtered.filter(lot => [
      lot.article,
      lot.country,
      lot.quality,
      lot.processing,
      lot.harvest_year,
      lot.status,
      lot.region,
      lot.variety,
      lot.cup_profile,
      lot.farm
    ].filter(Boolean).join(' ').toLowerCase().includes(q));
  }
  return limit ? filtered.slice(0, limit) : filtered;
}

async function scanCoffeetonLots(request = {}) {
  const fetched = await fetchCoffeetonPriceHtml();
  const parsed = parseCoffeetonPriceHtml(fetched.html, { sourceUrl: fetched.sourceUrl });
  const mergedLots = mergeCachedSupplierPrices(parsed.lots || []);
  const lots = mergedLots.map(lot => enrichSupplierLotPricing(lot));
  const pricedCount = lots.filter(lot => parseMoney(lot.price_uah) || parseMoney(lot.price_usd)).length;
  return {
    ...parsed,
    authConfigured: fetched.authConfigured,
    pricedCount,
    lots: filterLotsByRequest(lots, request.body || {}, request.query || {})
  };
}

async function buildCoffeetonPreview(body = {}, query = {}) {
  const scan = await scanCoffeetonLots({ body, query });
  const lots = scan.lots || [];
  const articles = lots.map(lot => lot.article).filter(Boolean);
  const matchData = articles.length
    ? await postBridge('supplier_match_products', { articles, supplier: 'coffeeton' })
    : { matches: {} };
  const matches = matchData.matches || {};

  const rows = lots.map(lot => {
    const desiredAttributes = coffeetonLotToAttributes(lot);
    const productMatches = Array.isArray(matches[lot.article]) ? matches[lot.article] : [];
    const product = productMatches.length === 1 ? productMatches[0] : null;
    const changes = product ? diffAttributes(desiredAttributes, product.attributes || {}) : [];
    const status = productMatches.length > 1
      ? 'ambiguous'
      : (!product ? 'unmatched' : (changes.length ? 'changed' : 'unchanged'));
    return {
      article: lot.article,
      supplier: 'coffeeton',
      lot,
      opencart: product,
      matches: productMatches,
      desiredAttributes,
      changes,
      status
    };
  });

  return {
    ok: true,
    supplier: 'coffeeton',
    sourceUrl: scan.sourceUrl,
    fetchedAt: scan.fetchedAt,
    authConfigured: scan.authConfigured,
    pricedCount: scan.pricedCount,
    summary: summarizeSupplierPreview(rows),
    rows
  };
}

function appendSupplierSyncLog(entry) {
  const current = readJsonFile(SUPPLIER_SYNC_LOG_PATH, { version: 1, entries: [] });
  const entries = Array.isArray(current.entries) ? current.entries : [];
  entries.unshift(entry);
  writeJsonFile(SUPPLIER_SYNC_LOG_PATH, { version: 1, entries: entries.slice(0, 300) });
}

function supplierSearchText(lot = {}) {
  return [
    lot.article,
    lot.country,
    lot.quality,
    lot.processing,
    lot.harvest_year,
    lot.status,
    lot.coffee_type,
    lot.category,
    lot.score,
    lot.bag_weight,
    lot.region,
    lot.variety,
    lot.cup_profile,
    lot.farm
  ].filter(Boolean).join(' ').toLowerCase();
}

function searchSupplierLots(lots = [], query = '', limit = 50) {
  const q = String(query || '').trim().toLowerCase();
  const max = Math.max(1, Math.min(300, Number(limit || 50)));
  if (!q) return lots.slice(0, max).map(lot => ({ ...lot, relevance: 0 }));
  const terms = [...new Set(q.split(/[,\s;]+/).map(term => term.trim()).filter(term => term.length >= 2))];
  if (!terms.length) return lots.slice(0, max).map(lot => ({ ...lot, relevance: 0 }));

  return lots
    .map(lot => {
      const haystack = supplierSearchText(lot);
      const profile = String(lot.cup_profile || '').toLowerCase();
      const origin = [lot.country, lot.region, lot.processing, lot.variety, lot.farm].filter(Boolean).join(' ').toLowerCase();
      let relevance = 0;
      const matchedTerms = [];
      for (const term of terms) {
        if (!haystack.includes(term)) continue;
        matchedTerms.push(term);
        relevance += 1;
        if (profile.includes(term)) relevance += 4;
        if (origin.includes(term)) relevance += 2;
        if (String(lot.article || '').toLowerCase() === term) relevance += 10;
      }
      return { ...lot, relevance, matchedTerms };
    })
    .filter(lot => lot.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || String(a.article || '').localeCompare(String(b.article || ''), 'uk', { numeric: true }))
    .slice(0, max);
}

app.get('/supplier/coffeeton/scan', async (req, res) => {
  try {
    const scan = await scanCoffeetonLots({ query: req.query || {} });
    res.json(scan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/supplier/coffeeton/auth', (req, res) => {
  const savedAuth = readJsonFile(SUPPLIER_AUTH_PATH, {});
  const hasEnvCookie = Boolean(String(process.env.COFFEETON_COOKIE || process.env.COFFEETON_AUTH_COOKIE || '').trim());
  const hasSavedCookie = Boolean(String(savedAuth.coffeetonCookie || '').trim());
  res.json({
    ok: true,
    supplier: 'coffeeton',
    authConfigured: hasEnvCookie || hasSavedCookie,
    source: hasEnvCookie ? 'env' : (hasSavedCookie ? 'local' : '')
  });
});

app.post('/supplier/coffeeton/auth', (req, res) => {
  const cookie = String(req.body?.cookie || req.body?.coffeetonCookie || '').trim();
  if (!cookie) {
    writeJsonFile(SUPPLIER_AUTH_PATH, { coffeetonCookie: '', updatedAt: new Date().toISOString() });
    return res.json({ ok: true, supplier: 'coffeeton', authConfigured: false });
  }
  writeJsonFile(SUPPLIER_AUTH_PATH, {
    coffeetonCookie: cookie,
    updatedAt: new Date().toISOString()
  });
  res.json({ ok: true, supplier: 'coffeeton', authConfigured: true, source: 'local' });
});

app.post('/supplier/coffeeton/save-price', async (req, res) => {
  try {
    const scan = await scanCoffeetonLots({ body: {}, query: {} });

    const payload = {
      version: 1,
      supplier: 'coffeeton',
      sourceUrl: scan.sourceUrl,
      savedAt: new Date().toISOString(),
      fetchedAt: scan.fetchedAt,
      authConfigured: scan.authConfigured,
      count: scan.lots.length,
      lots: scan.lots
    };
    writeJsonFile(SUPPLIER_PRICE_CACHE_PATH, payload);
    res.json({
      ok: true,
      supplier: 'coffeeton',
      sourceUrl: scan.sourceUrl,
      savedAt: payload.savedAt,
      count: payload.count,
      pricedCount: scan.pricedCount,
      authConfigured: scan.authConfigured
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/supplier/coffeeton/saved', (req, res) => {
  const cache = readJsonFile(SUPPLIER_PRICE_CACHE_PATH, null);
  if (!cache || !Array.isArray(cache.lots)) {
    return res.json({
      ok: true,
      supplier: 'coffeeton',
      saved: false,
      count: 0,
      lots: []
    });
  }
  const q = String(req.query.q || req.query.profile || '').trim();
  const limit = Math.max(1, Math.min(300, Number(req.query.limit || 80)));
  const pricedLots = cache.lots.map(lot => enrichSupplierLotPricing(lot));
  const lots = q ? searchSupplierLots(pricedLots, q, limit) : pricedLots.slice(0, limit);
  res.json({
    ok: true,
    supplier: 'coffeeton',
    saved: true,
    savedAt: cache.savedAt || '',
    sourceUrl: cache.sourceUrl || '',
    total: cache.lots.length,
    count: lots.length,
    query: q,
    lots
  });
});

app.get('/pricing/coffee/config', (req, res) => {
  res.json({
    ok: true,
    config: coffeePricingConfigFromEnv(),
    defaults: DEFAULT_COFFEE_PRICING_CONFIG
  });
});

app.get('/pricing/nbu/usd', async (req, res) => {
  try {
    res.json(await fetchNbuUsdRate());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/pricing/coffee/calculate', async (req, res) => {
  try {
    const body = req.body || {};
    const input = body.input || body;
    const needsNbu = !parseMoney(input.greenPriceUah ?? input.priceUah ?? input.greenPrice)
      && parseMoney(input.priceUsd ?? input.greenPriceUsd);
    let nbu = null;
    if (needsNbu && !parseMoney(input.nbuRate ?? input.usdRate ?? input.rate)) {
      nbu = await fetchNbuUsdRate();
      input.nbuRate = nbu.rate;
    }
    const pricing = calculateCoffeePricing(input, {
      ...coffeePricingConfigFromEnv(),
      ...(body.config || {})
    });
    res.json({
      ok: pricing.ok,
      pricing,
      nbu
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/supplier/coffeeton/preview', async (req, res) => {
  try {
    res.json(await buildCoffeetonPreview(req.body || {}, req.query || {}));
  } catch (error) {
    res.status(500).json({ error: explainBridgeError(error), raw: String(error.message || error) });
  }
});

app.post('/supplier/coffeeton/apply', async (req, res) => {
  try {
    const body = req.body || {};
    const selected = new Set(normalizeArticleFilter(body.articles || body.article || ''));
    const preview = await buildCoffeetonPreview(body, req.query || {});
    const rows = (preview.rows || []).filter(row =>
      row.status === 'changed' && (!selected.size || selected.has(normalizeArticle(row.article)))
    );
    const updates = rows.map(row => {
      const attributes = {};
      (row.changes || []).forEach(change => {
        if (change.name && change.to) attributes[change.name] = change.to;
      });
      return {
        product_id: row.opencart?.product_id || row.opencart?.id,
        article: row.article,
        attributes
      };
    }).filter(update => update.product_id && Object.keys(update.attributes || {}).length);

    if (body.dryRun) {
      return res.json({
        ok: true,
        dryRun: true,
        supplier: 'coffeeton',
        summary: preview.summary,
        updates
      });
    }

    const applied = updates.length
      ? await postBridge('supplier_apply_lots', { supplier: 'coffeeton', updates })
      : { ok: true, results: [] };

    appendSupplierSyncLog({
      at: new Date().toISOString(),
      supplier: 'coffeeton',
      sourceUrl: preview.sourceUrl,
      requestedArticles: [...selected],
      previewSummary: preview.summary,
      updatesCount: updates.length,
      results: applied.results || []
    });

    res.json({
      ok: true,
      supplier: 'coffeeton',
      sourceUrl: preview.sourceUrl,
      fetchedAt: preview.fetchedAt,
      summary: preview.summary,
      updatesCount: updates.length,
      applied
    });
  } catch (error) {
    res.status(500).json({ error: explainBridgeError(error), raw: String(error.message || error) });
  }
});

async function resolveOpenCartProductForPublish({ url = '', productName = '', h1 = '', title = '' } = {}) {
  const directId = productIdFromUrl(url);
  const slug = productSlugFromUrl(url);
  if (url) {
    const urlProductId = directId || await productIdFromLivePage(url);
    if (urlProductId) {
      return {
        product_id: urlProductId,
        slug,
        url,
        product: {
          id: urlProductId,
          product_id: urlProductId,
          name: productName || h1 || title || slug,
          keyword: slug,
          url,
          source: 'url_product_id'
        }
      };
    }
  }
  const query = String(productName || h1 || title || slug || '').trim();
  if (!query) return { product_id: directId || await productIdFromLivePage(url), slug };
  try {
    const data = await callBridge('product_search', { q: query, limit: 8 });
    const products = data.products || [];
    if (!products.length) return { product_id: directId || await productIdFromLivePage(url), slug };
    const normalizedQuery = normalizeProductLookupText(query);
    const best = products
      .map(product => ({ ...product, score: productLookupScore(normalizedQuery, product) }))
      .sort((a, b) => b.score - a.score)[0];
    return {
      product_id: best.id || best.product_id || directId,
      slug: best.keyword || slug,
      url: best.routeUrl || best.url || url,
      product: best
    };
  } catch (error) {
    console.warn('OpenCart product resolve skipped:', error.message);
    return { product_id: directId || await productIdFromLivePage(url), slug };
  }
}

async function fallbackOpenCartReadProduct(query = {}, error = null) {
  const url = String(query.url || '').trim();
  const slug = String(query.slug || productSlugFromUrl(url) || '').trim();
  const directId = String(query.product_id || query.id || productIdFromUrl(url) || '').trim();
  const reason = explainBridgeError(error);
  if (!url && !slug && !directId) return null;

  const resolved = await resolveOpenCartProductForPublish({
    url,
    productName: slug,
    h1: slug,
    title: slug
  }).catch(() => ({ product_id: directId, slug }));
  const productId = resolved?.product_id || directId || '';
  if (!productId && !slug) return null;

  let attributeCatalog = [];
  try {
    const catalog = await callBridge('attribute_catalog');
    attributeCatalog = Array.isArray(catalog.attributes) ? catalog.attributes : [];
  } catch {}

  return {
    ok: true,
    fallback: true,
    warning: 'Bridge product_read повернув порожню відповідь, тому Mercato AI працює в fallback-режимі. Поточний опис/атрибути з БД не підтягнуті.',
    bridgeError: reason,
    product_id: productId,
    id: productId,
    url: url || resolved?.url || '',
    slug: slug || resolved?.slug || '',
    snapshot: {
      found: false,
      fallback: true,
      product_id: productId,
      language_id: '',
      descriptionLength: 0,
      descriptionPreview: '',
      meta_title: '',
      meta_description: '',
      meta_h1: '',
      attributes: {},
      languageRows: []
    },
    attributeCatalog
  };
}

function normalizeProductLookupText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\b(кава|кофе|в|зернах|coffee|kava|kofe)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function productLookupScore(query, product) {
  const name = normalizeProductLookupText(product?.name || '');
  const keyword = normalizeProductLookupText(product?.keyword || '');
  const haystack = `${name} ${keyword}`;
  const words = query.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const word of words) {
    if (haystack.includes(word)) score += 2;
    if (name.includes(word)) score += 1;
  }
  if (name === query) score += 10;
  if (name.includes(query)) score += 5;
  return score;
}

async function fetchImportPage(inputUrl, { requireProduct = true } = {}) {
  const candidates = buildImportUrlCandidates(inputUrl);
  const bridgeCandidates = await findImportUrlsViaBridge(inputUrl).catch(error => {
    console.warn('import-url: bridge product_search unavailable:', error.message);
    return [];
  });

  bridgeCandidates.forEach(url => candidates.push(url));
  let firstResponse = null;

  for (const candidate of candidates) {
    const response = await fetch(candidate, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!firstResponse) firstResponse = response;
    if (response.ok) {
      const html = await response.text();
      if (!requireProduct || isProbablyProductPage(html)) {
        return { response: makeTextResponse(response, html), url: candidate };
      }
      firstResponse = makeTextResponse(response, html);
      continue;
    }
    if (response.status !== 404) return { response, url: candidate };
  }

  return { response: firstResponse, url: candidates[0] };
}

async function findImportUrlsViaBridge(inputUrl) {
  const queries = buildImportSearchQueries(inputUrl);
  const found = [];
  for (const q of queries) {
    const data = await callBridge('product_search', { q, limit: 5 });
    for (const item of data.products || []) {
      if (item.url) found.push(item.url);
    }
    if (found.length) break;
  }
  return [...new Set(found)];
}

function buildImportSearchQueries(inputUrl) {
  const candidates = buildImportUrlCandidates(inputUrl);
  const queries = new Set();
  for (const candidate of candidates) {
    try {
      const parsed = new URL(candidate);
      const slug = parsed.pathname.split('/').filter(Boolean).pop() || '';
      queries.add(slug.replace(/-/g, ' '));
      queries.add(slug.replace(/^kava[- ]/i, '').replace(/-/g, ' '));
    } catch {}
  }
  return [...queries].filter(q => q.length >= 3);
}

function isProbablyProductPage(html) {
  const text = String(html || '');
  if (text.includes('id="product-product"')) return true;
  if (/route=product\/product/i.test(text)) return true;
  return false;
}

function makeTextResponse(response, text) {
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    text: async () => text
  };
}

function buildImportUrlCandidates(inputUrl) {
  const raw = String(inputUrl || '').trim();
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    return [raw];
  }

  const candidates = new Set([parsed.toString()]);
  const path = parsed.pathname;
  const slash = path.lastIndexOf('/');
  const basePath = slash >= 0 ? path.slice(0, slash + 1) : '/';
  const slug = slash >= 0 ? path.slice(slash + 1) : path.replace(/^\//, '');
  const lowerSlug = slug.toLowerCase();

  const slugVariants = new Set([slug, lowerSlug]);
  const replacements = [
    ['kenya', 'keniya'],
    ['kenya', 'kenia'],
    ['keniya', 'kenya'],
    ['keniya', 'kenia'],
    ['kenia', 'keniya'],
    ['kenia', 'kenya']
  ];

  for (const variant of [...slugVariants]) {
    for (const [from, to] of replacements) {
      if (variant.includes(from)) slugVariants.add(variant.replaceAll(from, to));
    }
  }

  for (const variant of slugVariants) {
    const u = new URL(parsed.toString());
    u.pathname = basePath + variant;
    candidates.add(u.toString());
  }

  return [...candidates];
}

/**
 * Більш надійне витягування JSON-обʼєкта:
 * - бере рівно перший { ... } за балансом дужок
 * - прибирає trailing commas
 * - пробує дозакрити масиви/обʼєкти, якщо модель обрізала кінець
 */
function extractFirstJsonObject(raw) {
  const start = raw.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') depth--;

    if (depth === 0) return raw.slice(start, i + 1);
  }

  return null;
}

function safeParseJson(raw) {
  const objStr = extractFirstJsonObject(raw);
  if (!objStr) throw new Error('JSON не знайдено у відповіді');

  let str = objStr;

  try {
    return JSON.parse(str);
  } catch {
    // 1) trailing commas
    str = str.replace(/,(\s*[}\]])/g, '$1');

    // 2) типові LLM-помилки: bare words у значеннях JSON
    str = normalizeBareJsonValues(str);

    // 3) дозакриття, якщо модель обрізала кінець
    const opensArr = (str.match(/\[/g) || []).length - (str.match(/\]/g) || []).length;
    const opensObj = (str.match(/\{/g) || []).length - (str.match(/\}/g) || []).length;

    if (opensArr > 0 || opensObj > 0) {
      str += ']'.repeat(Math.max(0, opensArr)) + '}'.repeat(Math.max(0, opensObj));
    }

    return JSON.parse(str);
  }
}

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100
};

function numberWordToNumber(value) {
  const normalized = String(value).toLowerCase().replace(/-/g, ' ').trim();
  if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, normalized)) return NUMBER_WORDS[normalized];

  const parts = normalized.split(/\s+/);
  if (parts.length === 2 && NUMBER_WORDS[parts[0]] && NUMBER_WORDS[parts[1]] < 10) {
    return NUMBER_WORDS[parts[0]] + NUMBER_WORDS[parts[1]];
  }
  return null;
}

function normalizeBareJsonValues(str) {
  const numericKeys = [
    'titleLength', 'metaLength', 'contentLength', 'h2Count',
    'competitorsHaveIt', 'totalCompetitors', 'rank'
  ];

  numericKeys.forEach(key => {
    const re = new RegExp(`("${key}"\\s*:\\s*)([A-Za-z][A-Za-z\\s-]*?)(\\s*[,}])`, 'g');
    str = str.replace(re, (match, prefix, value, suffix) => {
      const number = numberWordToNumber(value);
      return number === null ? match : `${prefix}${number}${suffix}`;
    });
  });

  return str.replace(/(:\s*)([A-Za-zА-Яа-яІіЇїЄєҐґ][A-Za-zА-Яа-яІіЇїЄєҐґ0-9_\s-]*?)(\s*[,}\]])/g, (match, prefix, value, suffix) => {
    const trimmed = value.trim();
    if (['true', 'false', 'null'].includes(trimmed)) return match;
    return `${prefix}${JSON.stringify(trimmed)}${suffix}`;
  });
}

async function parseAiJson(raw, label = 'AI JSON') {
  try {
    return safeParseJson(raw);
  } catch (firstError) {
    console.warn(`${label}: перший JSON parse не вдався, пробую repair:`, firstError.message);

    const match = extractFirstJsonObject(raw);
    if (!match) throw firstError;

    const repair = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      messages: [{
        role: 'user',
        content: `Виправ цей текст у валідний JSON.

Правила:
- Поверни ТІЛЬКИ JSON, без markdown і пояснень.
- Не змінюй зміст, тільки синтаксис.
- Виправ пропущені коми, лапки, дужки, trailing commas.
- Усі багаторядкові тексти зроби звичайними JSON string.

JSON:
${match}`
      }]
    });

    try {
      return safeParseJson(repair.content[0].text.trim());
    } catch (repairError) {
      console.warn(`${label}: repair JSON parse не вдався, пробую compact regenerate:`, repairError.message);

      const compact = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        messages: [{
          role: 'user',
          content: `На основі зламаного JSON нижче створи НОВИЙ валідний JSON.

Правила:
- Поверни ТІЛЬКИ JSON, без markdown.
- Скороти тексти, але збережи сенс.
- Не використовуй подвійні лапки всередині значень рядків.
- Якщо поле не можеш відновити, постав порожній рядок або порожній масив.
- Збережи ті самі top-level ключі та типи даних, які видно у зламаному JSON.

Зламаний JSON:
${match}`
        }]
      });

      return safeParseJson(compact.content[0].text.trim());
    }
  }
}


async function fetchPage(url, browserHeaders, timeoutMs = 8000, maxLength = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: browserHeaders, signal: controller.signal });
    if (!r.ok) return { url, error: `HTTP ${r.status}`, html: '' };
    const html = await r.text();
    return { url, html: html.substring(0, maxLength) };
  } catch (e) {
    return { url, error: e.name === 'AbortError' ? `Timeout ${timeoutMs}ms` : e.message, html: '' };
  } finally {
    clearTimeout(timer);
  }
}

function decodeBasicHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(value) {
  return decodeBasicHtml(String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function metaContent($, selector) {
  if (!$) return '';
  return String($(selector).first().attr('content') || '').replace(/\s+/g, ' ').trim();
}

function extractImportDataFromHtml(html = '', importedUrl = '') {
  const $ = cheerio.load(String(html || ''));
  const title = $('title').first().text().replace(/\s+/g, ' ').trim();
  const h1 = $('h1').first().text().replace(/\s+/g, ' ').trim();
  const description = metaContent($, 'meta[name="description"]')
    || metaContent($, 'meta[property="og:description"]')
    || stripHtml($('.product-description, #tab-description, [itemprop="description"]').first().html() || '').slice(0, 500);
  const bodyText = stripHtml($('body').text()).slice(0, 8000);
  const productName = h1
    || metaContent($, 'meta[property="og:title"]')
    || title.replace(/\s*[-|]\s*Mercato.*$/i, '').trim()
    || productSlugFromUrl(importedUrl).replace(/[-_]+/g, ' ');

  const findAfter = (labels) => {
    const text = bodyText.replace(/\s+/g, ' ');
    for (const label of labels) {
      const re = new RegExp(`${label}\\s*[:：-]?\\s*([^.;\\n|]{2,80})`, 'iu');
      const match = text.match(re);
      if (match?.[1]) return match[1].trim();
    }
    return '';
  };

  return {
    productName,
    origin: findAfter(['країна', 'походження', 'country', 'origin']),
    region: findAfter(['регіон', 'область', 'region', 'area']),
    farm: findAfter(['ферма', 'станція', 'маєток', 'farm', 'station', 'producer']),
    variety: findAfter(['сорт', 'різновид', 'variety', 'cultivar']),
    processing: findAfter(['обробка', 'processing', 'process']),
    harvestYear: normalizeHarvestYear(findAfter(['рік врожаю', 'врожай', 'урожай', 'harvest', 'crop year'])),
    flavors: findAfter(['смак', 'flavor', 'flavour']),
    brewing: findAfter(['заварювання', 'приготування', 'brewing', 'brew']),
    existingTitle: title,
    existingH1: h1,
    existingMetaDescription: description
  };
}

function sanitizeImportedProductData(data = {}, fallback = {}, options = {}) {
  const merged = { ...(fallback || {}), ...(data || {}) };
  const clean = { ...merged };
  if (options.productLike === false) {
    for (const key of ['productName', 'origin', 'region', 'farm', 'variety', 'processing', 'harvestYear', 'flavors', 'brewing', 'existingTitle', 'existingH1', 'existingMetaDescription']) {
      clean[key] = plainOneLine(clean[key] || '');
    }
    return clean;
  }
  if (!hasUsefulTasteNotes(clean.flavors)) {
    clean.flavors = hasUsefulTasteNotes(fallback.flavors) ? plainOneLine(fallback.flavors) : '';
  } else {
    clean.flavors = plainOneLine(clean.flavors);
  }
  for (const key of ['origin', 'region', 'farm', 'variety', 'processing']) {
    clean[key] = isUsefulTextValue(clean[key]) && !isNumericScaleText(clean[key]) ? plainOneLine(clean[key]) : '';
  }
  clean.brewing = isUsefulBrewingText(clean.brewing) && !isNumericScaleText(clean.brewing) ? plainOneLine(clean.brewing) : '';
  clean.harvestYear = normalizeHarvestYear(clean.harvestYear || fallback.harvestYear || '');
  return clean;
}

function pageDomain(url = '') {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function pageBool($, selectors = [], regex = null) {
  if (!$) return false;
  if (selectors.some(selector => $(selector).length > 0)) return true;
  if (regex) return regex.test(stripHtml($('body').text()).slice(0, 12000));
  return false;
}

function extractCompetitorPageMetrics(page = {}, pageType = 'товар') {
  const html = String(page.html || '');
  const $ = html ? cheerio.load(html) : null;
  const title = $ ? $('title').first().text().replace(/\s+/g, ' ').trim() : '';
  const metaDescription = $ ? metaContent($, 'meta[name="description"]') || metaContent($, 'meta[property="og:description"]') : '';
  const h1 = $ ? $('h1').first().text().replace(/\s+/g, ' ').trim() : '';
  const bodyText = $ ? stripHtml($('body').text()) : '';
  const h2 = $ ? $('h2').map((i, el) => $(el).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean).slice(0, 8) : [];
  const ldJsonText = $ ? $('script[type="application/ld+json"]').map((i, el) => $(el).text()).get().join(' ') : '';
  const blocks = [
    ...h2,
    pageBool($, ['.breadcrumb', '[class*="breadcrumb"]']) ? 'breadcrumbs' : '',
    pageBool($, ['[itemprop="review"]', '.review', '[class*="review"]'], /відгук|review/i) ? 'reviews' : '',
    pageBool($, ['[class*="faq"]'], /faq|питання|запитання/i) ? 'faq' : ''
  ].filter(Boolean).slice(0, 10);
  return {
    url: page.url || '',
    domain: pageDomain(page.url || ''),
    title: title || null,
    titleLength: title.length,
    metaDescription: metaDescription || null,
    metaLength: metaDescription.length,
    h1: h1 || null,
    contentLength: bodyText.length,
    hasH2: h2.length > 0,
    h2Count: h2.length,
    hasFaq: pageBool($, ['[class*="faq"]'], /faq|питання|запитання/i),
    hasReviews: pageBool($, ['[itemprop="review"]', '.review', '[class*="review"]'], /відгук|review/i),
    hasSchema: /Product|Offer|AggregateRating|BreadcrumbList/i.test(ldJsonText),
    hasBreadcrumbs: pageBool($, ['.breadcrumb', '[class*="breadcrumb"]']),
    hasVideo: pageBool($, ['video', 'iframe[src*="youtube"]', 'iframe[src*="vimeo"]']),
    pageBlocks: blocks,
    keyPhrases: [h1, title, ...h2].filter(Boolean).slice(0, 8),
    fetchStatus: page.html ? 'ok' : (page.error ? 'blocked' : 'empty'),
    source: page.source || '',
    pageType
  };
}

function buildCompetitorAnalysisFallback(myPage = {}, competitorPages = [], pageType = 'товар', note = '') {
  const my = extractCompetitorPageMetrics(myPage, pageType);
  const competitors = competitorPages.map(page => extractCompetitorPageMetrics(page, pageType));
  const usable = competitors.filter(page => page.fetchStatus === 'ok');
  const gapDefs = [
    ['hasH2', 'H2-підзаголовки', 'Сторінка легше сканується і краще структурує SEO-теми.'],
    ['hasFaq', 'FAQ блок', 'FAQ закриває заперечення і може підсилити long-tail запити.'],
    ['hasReviews', 'Відгуки', 'Соціальний доказ може підняти довіру і конверсію.'],
    ['hasSchema', 'Product/Breadcrumb schema', 'Структуровані дані допомагають пошуку краще зрозуміти сторінку.'],
    ['hasBreadcrumbs', 'Хлібні крихти', 'Покращують навігацію і контекст категорії.']
  ];
  const gaps = gapDefs
    .map(([key, element, description]) => {
      const competitorsHaveIt = usable.filter(page => Boolean(page[key])).length;
      return {
        element,
        myHas: Boolean(my[key]),
        competitorsHaveIt,
        totalCompetitors: usable.length,
        impact: competitorsHaveIt >= Math.max(1, Math.ceil(usable.length / 2)) ? 'high' : 'medium',
        description
      };
    })
    .filter(gap => !gap.myHas && gap.competitorsHaveIt > 0);
  if (my.titleLength && (my.titleLength < 30 || my.titleLength > 65)) {
    gaps.unshift({
      element: 'SEO title',
      myHas: true,
      competitorsHaveIt: usable.filter(page => page.titleLength >= 30 && page.titleLength <= 65).length,
      totalCompetitors: usable.length,
      impact: 'high',
      description: `Довжина title зараз ${my.titleLength}. Оптимальний робочий діапазон: 30-65 символів.`
    });
  }
  if (!my.metaDescription || my.metaLength < 80 || my.metaLength > 170) {
    gaps.unshift({
      element: 'Meta description',
      myHas: Boolean(my.metaDescription),
      competitorsHaveIt: usable.filter(page => page.metaLength >= 80 && page.metaLength <= 170).length,
      totalCompetitors: usable.length,
      impact: 'medium',
      description: `Meta description зараз ${my.metaLength || 0} символів. Треба короткий сніпет 120-155 символів.`
    });
  }
  const advantages = gapDefs
    .filter(([key]) => Boolean(my[key]) && !usable.some(page => Boolean(page[key])))
    .map(([, element]) => ({ element, description: 'Цей елемент є у Mercato і не помітний у завантажених конкурентів.' }));
  return {
    myPage: my,
    competitors,
    gaps: gaps.slice(0, 8),
    advantages: advantages.slice(0, 5),
    fetchStatus: {
      myPage: my.fetchStatus,
      competitors: competitors.map(page => page.fetchStatus)
    },
    summary: [
      'Fallback-аналіз побудовано локально з HTML, бо AI не повернув валідний JSON.',
      usable.length ? `Проаналізовано ${usable.length} конкурентних сторінок.` : 'Конкурентні сторінки не завантажились або були заблоковані.',
      note ? `Причина fallback: ${note}` : ''
    ].filter(Boolean).join(' ')
  };
}

function extractPageTitle(html) {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]).slice(0, 180) : '';
}

function isUsefulCompetitorUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (!/^https?:$/.test(parsed.protocol)) return false;
    if (host.includes('google.') || host.includes('gstatic.') || host.includes('youtube.') || host.includes('facebook.') || host.includes('instagram.')) return false;
    if (host.includes('mercato.com.ua')) return false;
    return true;
  } catch {
    return false;
  }
}

function parseGoogleResultUrls(html) {
  const urls = [];
  const seen = new Set();
  const add = raw => {
    let url = decodeBasicHtml(raw || '');
    try {
      if (url.startsWith('//')) url = `https:${url}`;
      if (url.startsWith('/url?')) {
        const parsed = new URL(url, 'https://www.google.com');
        url = parsed.searchParams.get('q') || '';
      }
      if (url.includes('duckduckgo.com/l/?')) {
        const parsed = new URL(url);
        url = parsed.searchParams.get('uddg') || '';
      }
      if (!url || !isUsefulCompetitorUrl(url)) return;
      const normalized = url.split('#')[0];
      if (seen.has(normalized)) return;
      seen.add(normalized);
      urls.push(normalized);
    } catch {}
  };

  for (const match of String(html || '').matchAll(/href="([^"]+)"/gi)) {
    const href = match[1];
    if (href.startsWith('/url?') || href.startsWith('http') || href.startsWith('//duckduckgo.com/l/?')) add(href);
    if (urls.length >= 10) break;
  }
  return urls;
}

async function fetchSearchResultUrls(query) {
  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}&gl=ua&hl=uk&num=10`;
  const google = await fetchPage(googleUrl, BROWSER_HEADERS, 6000);
  let urls = parseGoogleResultUrls(google.html).slice(0, 10);
  if (urls.length) return { source: 'google_top_10_live', urls };

  const ddgUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const ddg = await fetchPage(ddgUrl, BROWSER_HEADERS, 6000);
  urls = parseGoogleResultUrls(ddg.html).slice(0, 10);
  if (urls.length) return { source: 'web_search_fallback_duckduckgo', urls };

  return { source: google.error || ddg.error ? 'search_unavailable' : 'search_returned_no_results', urls: [] };
}

function extractPriceSignals(text = '') {
  const signals = [];
  const re = /(?:₴|\bгрн\.?|\bUAH\b)?\s*(\d[\d\s]{1,8})(?:[,.]\d{1,2})?\s*(?:₴|\bгрн\.?|\bUAH\b)/giu;
  for (const match of String(text || '').matchAll(re)) {
    const value = Number(String(match[1] || '').replace(/\s+/g, ''));
    if (value >= 20 && value <= 100000) signals.push(value);
    if (signals.length >= 5) break;
  }
  return signals;
}

function extractCompetitorSnapshot(page) {
  const title = extractPageTitle(page.html);
  const text = stripHtml(page.html).slice(0, 2500);
  return {
    url: page.url,
    title,
    text,
    priceSignals: extractPriceSignals(text)
  };
}

const GLOBAL_UX_RESEARCH_2026 = [
  'Baymard Product Page UX 2026: більшість ecommerce product pages усе ще мають mediocre-or-worse UX; опис має швидко допомагати у purchase decision, а не просто прикрашати сторінку.',
  'Baymard PDP research: користувачі покидають навіть релевантні товари, якщо бракує зрозумілих деталей, доказів, візуального/практичного контексту, варіантів і прозорих умов.',
  'Global ecommerce pattern 2026: AI-assisted shopping підвищує вимогу до structured, specific product data: смакові шкали, attributes, FAQ, порівняння, сценарії використання.',
  'Mobile-first PDP: перший екран і перші 2-3 секції мають відповідати на що це, кому підійде, чим відрізняється, як вибрати і чому довіряти магазину.',
  'Content UX: краще працюють короткі модулі з конкретними параметрами, ніж довгі універсальні тексти; кожен блок має виконувати окрему роботу для покупця.'
];

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8',
  'Cache-Control': 'no-cache'
};

// Перевірка чи можна завантажити сторінку
app.post('/check-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ ok: false, error: 'URL відсутній' });
  const result = await fetchPage(url, BROWSER_HEADERS);
  if (result.error || !result.html || result.html.length < 500) {
    res.json({ ok: false, error: result.error || 'Сторінка порожня або заблокована' });
  } else {
    res.json({ ok: true, length: result.html.length });
  }
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    status: 'running',
    generatedAt: new Date().toISOString(),
    localTime: new Date().toLocaleString('uk-UA'),
    host: HOST,
    port: Number(PORT),
    storeBaseUrl: storeBaseUrl(),
    files: {
      actionLog: fs.existsSync(ACTION_LOG_PATH),
      businessMemory: fs.existsSync(BUSINESS_MEMORY_PATH),
      emailTracking: fs.existsSync(EMAIL_TRACKING_PATH),
      seoAuditCache: fs.existsSync(SEO_AUDIT_CACHE_PATH),
      operationalDb: fs.existsSync(OPERATIONAL_DB_PATH)
    },
    storage: operationalStore.status(),
    checks: {
      commandCenter: '/command-center',
      productConsistency: '/trust/product-consistency?url=...',
      productConsistencyBatch: '/trust/product-consistency-batch?limit=10',
      storage: '/ops/storage/status'
    }
  });
});

app.get('/ops/storage/status', (req, res) => {
  res.json({
    ok: operationalStore.available(),
    storage: operationalStore.status(),
    jsonFallbacks: {
      actionLog: ACTION_LOG_PATH,
      businessMemory: BUSINESS_MEMORY_PATH,
      emailTracking: EMAIL_TRACKING_PATH
    }
  });
});

app.get('/telegram/summary', async (req, res) => {
  res.json({
    ok: true,
    telegram: await fetchTelegramDirectorSummary()
  });
});

function storeBaseUrl() {
  return String(process.env.STORE_BASE_URL || process.env.OPENCART_URL || 'https://mercato.com.ua')
    .trim()
    .replace(/\/+$/, '') || 'https://mercato.com.ua';
}

function defaultSitemapUrl() {
  return process.env.SITEMAP_URL || `${storeBaseUrl()}/sitemap.xml`;
}

function normalizeAbsoluteUrl(value, base = storeBaseUrl()) {
  try {
    return new URL(String(value || '').trim(), base).toString();
  } catch {
    return '';
  }
}

function extractSitemapLocs(xml = '') {
  const locs = [];
  const re = /<loc[^>]*>([\s\S]*?)<\/loc>/gi;
  let match;
  while ((match = re.exec(xml))) {
    const loc = decodeBasicHtml(match[1]).trim();
    if (loc) locs.push(loc);
  }
  return [...new Set(locs)];
}

async function collectSitemapUrls({ sitemapUrl = defaultSitemapUrl(), limit = 500, depth = 0, seen = new Set() } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 2000));
  const url = normalizeAbsoluteUrl(sitemapUrl);
  if (!url || seen.has(url) || depth > 2) return [];
  seen.add(url);

  const page = await fetchPage(url, BROWSER_HEADERS, 12000);
  if (page.error || !page.html) throw new Error(`Не вдалося прочитати sitemap: ${page.error || 'порожня відповідь'}`);
  const locs = extractSitemapLocs(page.html);
  const sitemapLocs = locs.filter(loc => /\.xml(\?|$)/i.test(loc)).slice(0, 20);
  const pageLocs = locs.filter(loc => !/\.xml(\?|$)/i.test(loc));
  const collected = [...pageLocs];

  for (const child of sitemapLocs) {
    if (collected.length >= safeLimit) break;
    const childUrls = await collectSitemapUrls({ sitemapUrl: child, limit: safeLimit - collected.length, depth: depth + 1, seen });
    collected.push(...childUrls);
  }

  return [...new Set(collected)].slice(0, safeLimit);
}

function seoIssue(severity, message, field = '') {
  return { severity, message, field };
}

function auditHtmlPage(url, result = {}) {
  const status = result.error ? 0 : 200;
  const html = result.html || '';
  const issues = [];
  if (result.error) issues.push(seoIssue('critical', result.error, 'fetch'));
  const $ = html ? cheerio.load(html) : null;
  const title = $ ? $('title').first().text().trim().replace(/\s+/g, ' ') : '';
  const metaDescription = $ ? $('meta[name="description"]').attr('content')?.trim() || '' : '';
  const h1s = $ ? $('h1').map((_, el) => $(el).text().trim().replace(/\s+/g, ' ')).get().filter(Boolean) : [];
  const canonical = $ ? $('link[rel="canonical"]').attr('href') || '' : '';
  const robots = $ ? $('meta[name="robots"]').attr('content') || '' : '';
  const bodyText = $ ? stripHtml($('body').html() || '') : '';
  const wordCount = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;
  const jsonLd = $ ? $('script[type="application/ld+json"]').map((_, el) => $(el).text()).get().join('\n') : '';
  const hasProductSchema = /"@type"\s*:\s*"?Product"?|@type['"]?\s*:\s*['"]?Product/i.test(jsonLd);

  if (!title) issues.push(seoIssue('critical', 'Немає title', 'title'));
  else if (title.length < 25) issues.push(seoIssue('medium', 'Title занадто короткий', 'title'));
  else if (title.length > 65) issues.push(seoIssue('medium', 'Title довший за ~65 символів', 'title'));

  if (!metaDescription) issues.push(seoIssue('high', 'Немає meta description', 'metaDescription'));
  else if (metaDescription.length < 70) issues.push(seoIssue('medium', 'Meta description занадто короткий', 'metaDescription'));
  else if (metaDescription.length > 170) issues.push(seoIssue('medium', 'Meta description занадто довгий', 'metaDescription'));

  if (!h1s.length) issues.push(seoIssue('high', 'Немає H1', 'h1'));
  if (h1s.length > 1) issues.push(seoIssue('medium', `Кілька H1: ${h1s.length}`, 'h1'));
  if (!canonical) issues.push(seoIssue('medium', 'Немає canonical', 'canonical'));
  if (/noindex/i.test(robots)) issues.push(seoIssue('critical', 'Сторінка має noindex', 'robots'));
  if (wordCount > 0 && wordCount < 120) issues.push(seoIssue('medium', 'Контент виглядає тонким (<120 слів)', 'content'));
  if (/\/(kava|chai|coffee|tea|product|tovar)/i.test(url) && !hasProductSchema) {
    issues.push(seoIssue('low', 'Не знайдено Product schema у HTML', 'schema'));
  }

  const penalty = issues.reduce((sum, item) => {
    if (item.severity === 'critical') return sum + 30;
    if (item.severity === 'high') return sum + 18;
    if (item.severity === 'medium') return sum + 9;
    return sum + 4;
  }, result.error ? 40 : 0);

  return {
    url,
    status,
    title,
    titleLength: title.length,
    metaDescription,
    metaDescriptionLength: metaDescription.length,
    h1: h1s[0] || '',
    h1Count: h1s.length,
    canonical,
    robots,
    wordCount,
    hasProductSchema,
    score: Math.max(0, Math.min(100, 100 - penalty)),
    issues
  };
}

function summarizeSeoAudit(pages = []) {
  const issueCounts = {};
  for (const page of pages) {
    for (const issue of page.issues || []) {
      const key = `${issue.severity}:${issue.message}`;
      issueCounts[key] = (issueCounts[key] || 0) + 1;
    }
  }
  const topIssues = Object.entries(issueCounts)
    .map(([key, count]) => {
      const [severity, ...rest] = key.split(':');
      return { severity, message: rest.join(':'), count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  return {
    pages: pages.length,
    avgScore: pages.length ? Math.round(pages.reduce((sum, page) => sum + Number(page.score || 0), 0) / pages.length) : 0,
    critical: pages.reduce((sum, page) => sum + (page.issues || []).filter(i => i.severity === 'critical').length, 0),
    high: pages.reduce((sum, page) => sum + (page.issues || []).filter(i => i.severity === 'high').length, 0),
    medium: pages.reduce((sum, page) => sum + (page.issues || []).filter(i => i.severity === 'medium').length, 0),
    low: pages.reduce((sum, page) => sum + (page.issues || []).filter(i => i.severity === 'low').length, 0),
    topIssues
  };
}

async function runSitemapSeoAudit({ sitemapUrl = defaultSitemapUrl(), limit = 40 } = {}) {
  const urls = await collectSitemapUrls({ sitemapUrl, limit });
  const pages = [];
  for (const url of urls.slice(0, Math.max(1, Math.min(Number(limit) || 40, 200)))) {
    const result = await fetchPage(url, BROWSER_HEADERS, 10000);
    pages.push(auditHtmlPage(url, result));
  }
  const audit = {
    generatedAt: new Date().toISOString(),
    generatedAtLocal: new Date().toLocaleString('uk-UA'),
    sitemapUrl,
    urlsFound: urls.length,
    summary: summarizeSeoAudit(pages),
    pages: pages.sort((a, b) => a.score - b.score).slice(0, 200)
  };
  writeSeoAuditCache({ sitemap: audit });
  return audit;
}

function scoreOpenCartSeoProduct(product = {}) {
  const issues = [];
  const title = String(product.meta_title || '').trim();
  const metaDescription = String(product.meta_description || '').trim();
  const h1 = String(product.meta_h1 || '').trim();
  const descriptionLength = Number(product.description_length || product.descriptionLength || 0);
  const keyword = String(product.keyword || '').trim();
  const status = Number(product.status ?? 1);
  if (!title) issues.push(seoIssue('critical', 'Немає meta title', 'meta_title'));
  else if (title.length < 25) issues.push(seoIssue('medium', 'Meta title короткий', 'meta_title'));
  else if (title.length > 65) issues.push(seoIssue('medium', 'Meta title довгий', 'meta_title'));
  if (!metaDescription) issues.push(seoIssue('high', 'Немає meta description', 'meta_description'));
  else if (metaDescription.length < 70) issues.push(seoIssue('medium', 'Meta description короткий', 'meta_description'));
  else if (metaDescription.length > 170) issues.push(seoIssue('medium', 'Meta description довгий', 'meta_description'));
  if ('meta_h1' in product && !h1) issues.push(seoIssue('medium', 'Немає meta H1', 'meta_h1'));
  if (descriptionLength < 600) issues.push(seoIssue('medium', 'Опис товару короткий (<600 символів)', 'description'));
  if (!keyword) issues.push(seoIssue('high', 'Немає SEO URL keyword', 'keyword'));
  if (status !== 1) issues.push(seoIssue('low', 'Товар вимкнений', 'status'));
  const penalty = issues.reduce((sum, issue) => sum + (issue.severity === 'critical' ? 30 : issue.severity === 'high' ? 18 : issue.severity === 'medium' ? 9 : 4), 0);
  return { ...product, score: Math.max(0, 100 - penalty), issues };
}

function productAuditItemKey(product = {}, index = 0) {
  return String(product.product_id || product.id || product.model || product.sku || product.keyword || product.url || product.name || `product-${index}`);
}

function productSeoFingerprint(product = {}) {
  const payload = {
    name: String(product.name || '').trim(),
    meta_title: String(product.meta_title || '').trim(),
    meta_description: String(product.meta_description || '').trim(),
    meta_h1: String(product.meta_h1 || '').trim(),
    description_length: Number(product.description_length || product.descriptionLength || 0),
    attributes_count: Number(product.attributes_count || product.attributesCount || 0),
    keyword: String(product.keyword || '').trim(),
    status: String(product.status ?? ''),
    quantity: String(product.quantity ?? '')
  };
  return crypto.createHash('sha1').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

function productSeoChangedFields(previous = {}, current = {}) {
  const fields = [
    ['name', 'назва'],
    ['meta_title', 'meta title'],
    ['meta_description', 'meta description'],
    ['meta_h1', 'H1'],
    ['description_length', 'опис'],
    ['attributes_count', 'характеристики'],
    ['keyword', 'SEO URL'],
    ['status', 'статус'],
    ['quantity', 'залишок']
  ];
  const changed = [];
  for (const [key, label] of fields) {
    const left = key.includes('length') || key.includes('count')
      ? Number(previous[key] || previous[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] || 0)
      : String(previous[key] ?? '').trim();
    const right = key.includes('length') || key.includes('count')
      ? Number(current[key] || current[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] || 0)
      : String(current[key] ?? '').trim();
    if (left !== right) changed.push(label);
  }
  if (!changed.length && String(previous.date_modified || '') !== String(current.date_modified || '')) changed.push('date_modified');
  return changed;
}

function compactProductSeoSnapshot(product = {}) {
  return {
    product_id: product.product_id || product.id || '',
    model: product.model || product.sku || '',
    name: product.name || product.meta_h1 || product.meta_title || '',
    url: productMatrixProductUrl(product),
    keyword: product.keyword || '',
    meta_title: product.meta_title || '',
    meta_description: product.meta_description || '',
    meta_h1: product.meta_h1 || '',
    description_length: Number(product.description_length || product.descriptionLength || 0),
    attributes_count: Number(product.attributes_count || product.attributesCount || 0),
    score: Number(product.score || 0),
    issues: Array.isArray(product.issues) ? product.issues.slice(0, 6) : [],
    date_modified: product.date_modified || '',
    fingerprint: productSeoFingerprint(product)
  };
}

function seoMonitoringActionIdForProduct(product = {}) {
  const key = product.product_id || product.id || productMatrixUrlKey(productMatrixProductUrl(product)) || product.name || 'product';
  return `seo-monitor-product-${crypto.createHash('sha1').update(String(key)).digest('hex').slice(0, 10)}`;
}

function addDaysIso(days = 14) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString();
}

function localDateKeyDaysAgo(daysAgo = 0) {
  const date = new Date();
  date.setDate(date.getDate() - Number(daysAgo || 0));
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function hasRecentStoreDate(value = '', daysBack = 1) {
  const dateKey = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
  for (let i = 0; i <= daysBack; i += 1) {
    if (dateKey === localDateKeyDaysAgo(i)) return true;
  }
  return false;
}

function gscBaselineForProduct(product = {}) {
  const cache = readSeoAuditCache();
  const rows = Array.isArray(cache.gsc?.rows) ? cache.gsc.rows.map(compactGscRow).filter(row => row.url) : [];
  const row = matchGscRowToProduct(product, rows);
  return row ? {
    url: row.url,
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0),
    gscGeneratedAt: cache.gsc?.generatedAt || '',
    gscDateRange: [cache.gsc?.startDate || '', cache.gsc?.endDate || ''].filter(Boolean).join(' — ')
  } : {
    url: productMatrixProductUrl(product),
    clicks: 0,
    impressions: 0,
    ctr: 0,
    position: 0,
    gscGeneratedAt: cache.gsc?.generatedAt || '',
    gscDateRange: [cache.gsc?.startDate || '', cache.gsc?.endDate || ''].filter(Boolean).join(' — ')
  };
}

function activeSeoMonitors() {
  const memory = readBusinessMemory();
  return (memory.experiments || [])
    .filter(item => item.status !== 'completed')
    .filter(item => item.action?.type === 'seo_monitor' || item.baseline?.seo?.product)
    .map(item => {
      const seo = item.baseline?.seo || {};
      const product = seo.product || {};
      const action = item.action || {};
      const urls = [
        product.url,
        action.url,
        seo.baselineGsc?.url,
        product.keyword ? `${storeBaseUrl()}/${String(product.keyword).replace(/^\/+/, '')}` : ''
      ].filter(Boolean);
      return {
        actionId: item.actionId || '',
        title: item.title || '',
        product_id: String(product.product_id || action.product_id || ''),
        productName: product.name || action.productName || '',
        url: product.url || action.url || seo.baselineGsc?.url || '',
        urlKeys: urls.map(productMatrixUrlKey).filter(Boolean),
        checkAt: action.checkAt || seo.checkAt || '',
        checkAtLocal: seo.checkAtLocal || (action.checkAt ? new Date(action.checkAt).toLocaleDateString('uk-UA') : ''),
        baselineGsc: seo.baselineGsc || null,
        startedAt: item.startedAt || ''
      };
    });
}

function activeSeoMonitorForTarget({ url = '', product = null, productName = '' } = {}) {
  const urlKeys = [
    productMatrixUrlKey(url),
    product ? productMatrixUrlKey(productMatrixProductUrl(product)) : '',
    product?.keyword ? productMatrixUrlKey(`${storeBaseUrl()}/${String(product.keyword).replace(/^\/+/, '')}`) : ''
  ].filter(Boolean);
  const productId = String(product?.product_id || product?.id || '').trim();
  const name = productName || product?.name || product?.meta_h1 || product?.meta_title || '';
  return activeSeoMonitors().find(monitor => {
    if (productId && monitor.product_id && productId === monitor.product_id) return true;
    if (urlKeys.length && monitor.urlKeys.some(key => urlKeys.includes(key))) return true;
    if (name && monitor.productName && productMatrixTextScore(name, monitor.productName) >= 0.9) return true;
    return false;
  }) || null;
}

function eventAlreadyLoggedForFingerprint(actionId = '', fingerprint = '') {
  if (!actionId || !fingerprint) return false;
  const memory = readBusinessMemory();
  const events = [...(memory.events || []), ...readActionLog().entries];
  return events.some(event => event.actionId === actionId && event.action?.fingerprint === fingerprint && event.source === 'opencart_sync');
}

function createOpenCartSyncSeoEvent({ product = {}, previous = null, changedFields = [], reason = 'opencart_sync' } = {}) {
  const now = new Date();
  const productSnapshot = compactProductSeoSnapshot(product);
  const previousSnapshot = previous ? compactProductSeoSnapshot(previous) : null;
  const actionId = seoMonitoringActionIdForProduct(product);
  const checkAt = addDaysIso(14);
  const baselineGsc = gscBaselineForProduct(product);
  return {
    id: `mem-${now.getTime()}-${crypto.randomBytes(3).toString('hex')}`,
    actionId,
    title: `SEO-моніторинг: ${productSnapshot.name || 'товар OpenCart'}`,
    status: 'started',
    statusLabel: 'почато',
    note: `OpenCart змінив: ${changedFields.join(', ') || 'товар'}. Контроль GSC після ${new Date(checkAt).toLocaleDateString('uk-UA')}.`,
    source: 'opencart_sync',
    action: {
      type: 'seo_monitor',
      reason,
      product_id: productSnapshot.product_id,
      productName: productSnapshot.name,
      url: productSnapshot.url,
      changedFields,
      dateModified: productSnapshot.date_modified,
      fingerprint: productSnapshot.fingerprint,
      checkAfterDays: 14,
      checkAt
    },
    hypothesis: 'Після оновлення товарної картки треба не просто забути про неї, а порівняти CTR, кліки і позицію в GSC після індексації.',
    expectedImpact: 'Очікуємо кращий сніпет/опис і вимірюємо результат після оновлення даних GSC.',
    modules: ['SEO', 'OpenCart', 'GSC'],
    productOpportunities: [],
    snapshot: {
      capturedAt: now.toISOString(),
      seo: {
        product: productSnapshot,
        previous: previousSnapshot,
        baselineGsc,
        checkAt,
        checkAtLocal: new Date(checkAt).toLocaleDateString('uk-UA')
      }
    },
    createdAt: now.toISOString(),
    createdAtLocal: now.toLocaleString('uk-UA')
  };
}

function recordBusinessMemoryEvent(event) {
  const actionLog = readActionLog().entries;
  actionLog.unshift(event);
  writeActionLog(actionLog);
  const memory = readBusinessMemory();
  upsertBusinessExperiment(memory, event);
  memory.events.unshift(event);
  writeBusinessMemory(memory);
}

function registerOpenCartAuditChanges(previousAudit = null, currentProducts = [], { reason = 'opencart_sync' } = {}) {
  const previousProducts = Array.isArray(previousAudit?.products) ? previousAudit.products : [];
  const previousByKey = new Map();
  previousProducts.forEach((product, index) => previousByKey.set(productAuditItemKey(product, index), product));
  const changedProducts = [];
  const events = [];
  currentProducts.forEach((product, index) => {
    const key = productAuditItemKey(product, index);
    const previous = previousByKey.get(key);
    const fingerprint = productSeoFingerprint(product);
    const actionId = seoMonitoringActionIdForProduct(product);
    const recentlyModifiedWithoutMonitor = Boolean(
      previous &&
      hasRecentStoreDate(product.date_modified || '', 1) &&
      !eventAlreadyLoggedForFingerprint(actionId, fingerprint)
    );
    if (!previous) return;
    const previousFingerprint = productSeoFingerprint(previous);
    const hasDiff = fingerprint !== previousFingerprint || String(product.date_modified || '') !== String(previous.date_modified || '');
    if (!hasDiff && !recentlyModifiedWithoutMonitor) return;
    const changedFields = hasDiff ? productSeoChangedFields(previous, product) : ['date_modified'];
    changedProducts.push({
      product_id: product.product_id || product.id || '',
      name: product.name || '',
      url: productMatrixProductUrl(product),
      changedFields,
      date_modified: product.date_modified || '',
      score: Number(product.score || 0)
    });
    if (eventAlreadyLoggedForFingerprint(actionId, fingerprint)) return;
    const event = createOpenCartSyncSeoEvent({ product, previous, changedFields, reason });
    recordBusinessMemoryEvent(event);
    events.push(event);
  });
  return {
    status: 'synced',
    changedCount: changedProducts.length,
    eventsCreated: events.length,
    changedProducts: changedProducts.slice(0, 10)
  };
}

async function refreshOpenCartProductAudit({ page = 1, limit = 120, reason = 'manual' } = {}) {
  const previous = readSeoAuditCache().productAudit || null;
  const data = await callBridge('product_audit_list', { page, limit });
  const products = (data.products || []).map(scoreOpenCartSeoProduct).sort((a, b) => a.score - b.score);
  const sync = registerOpenCartAuditChanges(previous, products, { reason });
  const audit = {
    generatedAt: new Date().toISOString(),
    generatedAtLocal: new Date().toLocaleString('uk-UA'),
    page,
    limit,
    total: data.total || products.length,
    summary: summarizeSeoAudit(products.map(product => ({ score: product.score, issues: product.issues || [] }))),
    products,
    sync
  };
  writeSeoAuditCache({ productAudit: audit });
  return { audit, sync };
}

function isIsoFresh(value = '', maxAgeMinutes = 10) {
  const ts = Date.parse(value || '');
  if (!ts) return false;
  return Date.now() - ts <= maxAgeMinutes * 60000;
}

async function syncOpenCartAuditForCommandCenter({ force = false, limit = 120 } = {}) {
  const current = readSeoAuditCache().productAudit || null;
  if (!force && current?.generatedAt && isIsoFresh(current.generatedAt, 10)) {
    return {
      status: 'cached',
      generatedAt: current.generatedAt,
      generatedAtLocal: current.generatedAtLocal || '',
      changedCount: Number(current.sync?.changedCount || 0),
      eventsCreated: 0,
      changedProducts: []
    };
  }
  try {
    const result = await refreshOpenCartProductAudit({
      page: 1,
      limit,
      reason: force ? 'command_center_force' : 'command_center_auto'
    });
    return {
      ...result.sync,
      generatedAt: result.audit.generatedAt,
      generatedAtLocal: result.audit.generatedAtLocal
    };
  } catch (error) {
    return {
      status: 'error',
      error: explainBridgeError(error),
      raw: String(error.message || error)
    };
  }
}

const GSC_READONLY_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const GA4_READONLY_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const MERCHANT_CONTENT_SCOPE = 'https://www.googleapis.com/auth/content';
const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';
const GOOGLE_DATA_SCOPES = [
  GSC_READONLY_SCOPE,
  GA4_READONLY_SCOPE,
  MERCHANT_CONTENT_SCOPE,
  GOOGLE_ADS_SCOPE
];
const GOOGLE_DATA_SCOPE = GOOGLE_DATA_SCOPES.join(' ');

function gscOAuthClientPath() {
  const saved = readConnectionSecrets().values || {};
  return saved.GOOGLE_OAUTH_CLIENT_FILE
    || saved.GSC_OAUTH_CLIENT_FILE
    || process.env.GSC_OAUTH_CLIENT_FILE
    || process.env.GOOGLE_OAUTH_CLIENT_FILE
    || '/Users/macbook/Downloads/gsc_oauth_client.json';
}

function readGscOAuthClient() {
  const filePath = gscOAuthClientPath();
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const rootKey = data.installed ? 'installed' : data.web ? 'web' : '';
    const cfg = rootKey ? data[rootKey] : data;
    if (!cfg?.client_id || !cfg?.client_secret) return null;
    return {
      rootKey: rootKey || 'raw',
      filePath,
      clientId: cfg.client_id,
      clientSecret: cfg.client_secret,
      redirectUris: Array.isArray(cfg.redirect_uris) ? cfg.redirect_uris : [],
      authUri: cfg.auth_uri || 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUri: cfg.token_uri || 'https://oauth2.googleapis.com/token'
    };
  } catch (error) {
    console.warn('GSC OAuth client read failed:', error.message);
    return null;
  }
}

function readGscOAuthToken() {
  const data = readJsonFile(GSC_OAUTH_TOKEN_PATH, null);
  return data && typeof data === 'object' ? data : null;
}

function googleOAuthScopeList(token = readGscOAuthToken()) {
  return String(token?.scope || '')
    .split(/\s+/)
    .map(scope => scope.trim())
    .filter(Boolean);
}

function googleOAuthTokenHasScope(scope) {
  if (!scope) return false;
  return googleOAuthScopeList().includes(scope);
}

function hasGoogleOAuthAccessForScope(scope) {
  const client = readGscOAuthClient();
  const token = readGscOAuthToken();
  if (!client || !token || !(token.refresh_token || token.access_token)) return false;
  return googleOAuthTokenHasScope(scope);
}

function googleOAuthStatus() {
  const client = readGscOAuthClient();
  const token = readGscOAuthToken();
  const scopes = googleOAuthScopeList(token);
  const missingScopes = GOOGLE_DATA_SCOPES.filter(scope => !scopes.includes(scope));
  return {
    clientPath: gscOAuthClientPath(),
    hasClient: Boolean(client),
    clientType: client?.rootKey || '',
    hasToken: Boolean(token?.refresh_token || token?.access_token),
    hasRefreshToken: Boolean(token?.refresh_token),
    expiresAt: token?.expiresAt || '',
    scopes,
    requestedScopes: GOOGLE_DATA_SCOPES,
    missingScopes
  };
}

function writeGscOAuthToken(data = {}) {
  const existing = readGscOAuthToken() || {};
  const merged = {
    ...existing,
    ...data,
    refresh_token: data.refresh_token || existing.refresh_token || '',
    scope: data.scope || existing.scope || '',
    token_type: data.token_type || existing.token_type || 'Bearer',
    updatedAt: new Date().toISOString()
  };
  if (data.expires_in) {
    merged.expiresAt = new Date(Date.now() + Math.max(1, Number(data.expires_in) - 60) * 1000).toISOString();
  }
  writeJsonFile(GSC_OAUTH_TOKEN_PATH, merged);
  return merged;
}

function gscOAuthRedirectUri(req, client = readGscOAuthClient()) {
  const host = req?.get?.('host') || `localhost:${process.env.PORT || 3001}`;
  const requestRedirect = `http://${host}/seo/gsc/oauth/callback`;
  if (client?.redirectUris?.includes(requestRedirect)) return requestRedirect;
  if (client?.redirectUris?.length) return client.redirectUris[0];
  if (client?.rootKey === 'installed') return requestRedirect;
  if (process.env.GSC_OAUTH_REDIRECT_URI) return process.env.GSC_OAUTH_REDIRECT_URI;
  return requestRedirect;
}

function gscOAuthAuthUrl(req) {
  const client = readGscOAuthClient();
  if (!client) throw new Error(`OAuth client JSON не знайдено або він неповний: ${gscOAuthClientPath()}`);
  const redirectUri = gscOAuthRedirectUri(req, client);
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_DATA_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: `mercato-google-data-${Date.now()}`
  });
  return {
    url: `${client.authUri}?${params.toString()}`,
    redirectUri,
    clientType: client.rootKey,
    scopes: GOOGLE_DATA_SCOPES
  };
}

async function exchangeGscOAuthCode({ code, redirectUri, req } = {}) {
  if (!code) throw new Error('OAuth code required');
  const client = readGscOAuthClient();
  if (!client) throw new Error(`OAuth client JSON не знайдено або він неповний: ${gscOAuthClientPath()}`);
  const response = await fetch(client.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(code || ''),
      client_id: client.clientId,
      client_secret: client.clientSecret,
      redirect_uri: redirectUri || gscOAuthRedirectUri(req, client),
      grant_type: 'authorization_code'
    }).toString()
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Google OAuth token endpoint повернув не JSON: ${compactApiText(text)}`);
  }
  if (!response.ok) throw new Error(data.error_description || data.error || `Google OAuth HTTP ${response.status}`);
  const saved = writeGscOAuthToken(data);
  ['gsc', 'ga4', 'merchant', 'google_ads'].forEach(clearConnectorVerification);
  return {
    ok: true,
    hasAccessToken: Boolean(saved.access_token),
    hasRefreshToken: Boolean(saved.refresh_token),
    expiresAt: saved.expiresAt || '',
    scope: saved.scope || ''
  };
}

async function refreshGoogleOAuthAccessToken(requiredScope = '') {
  const client = readGscOAuthClient();
  const token = readGscOAuthToken();
  if (!client) throw new Error(`OAuth client JSON не знайдено або він неповний: ${gscOAuthClientPath()}`);
  if (!token) throw new Error('Google OAuth token ще не отримано');
  if (requiredScope && !googleOAuthTokenHasScope(requiredScope)) {
    throw new Error(`Google OAuth token не має потрібного scope: ${requiredScope}. Відкрийте /seo/gsc/oauth/start і погодьте доступи ще раз.`);
  }
  const expiresAtMs = Date.parse(token.expiresAt || '') || 0;
  if (token.access_token && expiresAtMs > Date.now() + 60000) return token.access_token;
  if (!token.refresh_token) throw new Error('Google OAuth refresh token ще не отримано');
  const response = await fetch(client.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token'
    }).toString()
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Google refresh endpoint повернув не JSON: ${compactApiText(text)}`);
  }
  if (!response.ok) {
    const message = data.error_description || data.error || `Google refresh HTTP ${response.status}`;
    const error = new Error(`${message}. Відкрийте /seo/gsc/oauth/start і погодьте Google OAuth ще раз.`);
    error.status = response.status || 401;
    error.code = data.error || 'GOOGLE_OAUTH_REFRESH_FAILED';
    if (googleOAuthNeedsReconnect(error)) {
      ['gsc', 'ga4', 'merchant', 'google_ads'].forEach(id => writeConnectorVerification(id, {
        ok: false,
        error: 'Google OAuth token expired or revoked. Reconnect Google OAuth.',
        message: ''
      }));
    }
    throw error;
  }
  const saved = writeGscOAuthToken(data);
  return saved.access_token;
}

async function refreshGscOAuthAccessToken() {
  return refreshGoogleOAuthAccessToken(GSC_READONLY_SCOPE);
}

function gscConfigStatus() {
  const oauthClient = readGscOAuthClient();
  const oauthToken = readGscOAuthToken();
  const hasOAuthToken = Boolean(oauthToken?.refresh_token || oauthToken?.access_token);
  const oauthScopes = googleOAuthScopeList(oauthToken);
  const oauthMissingScopes = GOOGLE_DATA_SCOPES.filter(scope => !oauthScopes.includes(scope));
  const hasServiceAccount = Boolean(connectionValue('GSC_CLIENT_EMAIL') && connectionValue('GSC_PRIVATE_KEY'));
  const hasAccessToken = Boolean(connectionValue('GSC_ACCESS_TOKEN'));
  const hasUsableOAuth = hasGoogleOAuthAccessForScope(GSC_READONLY_SCOPE);
  const authMode = hasAccessToken ? 'access_token' : hasUsableOAuth ? 'oauth' : hasServiceAccount ? 'service_account' : 'none';
  return {
    siteUrl: connectionValue('GSC_SITE_URL') || '',
    hasAccessToken,
    hasServiceAccount,
    hasOAuthClient: Boolean(oauthClient),
    hasOAuthToken,
    hasUsableOAuth,
    oauthScopes,
    oauthMissingScopes,
    authMode,
    oauthClientType: oauthClient?.rootKey || '',
    oauthTokenExpiresAt: oauthToken?.expiresAt || '',
    configured: Boolean(connectionValue('GSC_SITE_URL') && (hasAccessToken || hasUsableOAuth || hasServiceAccount))
  };
}

function seoMeasurementSnapshot() {
  const cache = readSeoAuditCache();
  const sitemap = cache.sitemap || null;
  const productAudit = cache.productAudit || null;
  const gsc = cache.gsc || null;
  const gscStatus = gscConfigStatus();
  return {
    sitemap: sitemap ? {
      generatedAt: sitemap.generatedAt,
      generatedAtLocal: sitemap.generatedAtLocal,
      sitemapUrl: sitemap.sitemapUrl,
      urlsFound: sitemap.urlsFound,
      summary: sitemap.summary
    } : null,
    productAudit: productAudit ? {
      generatedAt: productAudit.generatedAt,
      generatedAtLocal: productAudit.generatedAtLocal,
      summary: productAudit.summary
    } : null,
    gsc: {
      configured: gscStatus.configured,
      siteUrl: gscStatus.siteUrl,
      authMode: gscStatus.authMode,
      hasOAuthClient: gscStatus.hasOAuthClient,
      hasOAuthToken: gscStatus.hasOAuthToken,
      lastRunAt: gsc?.generatedAt || '',
      summary: gsc?.summary || null,
      opportunities: buildGscOpportunities(gsc)
    }
  };
}

function gscRowUrl(row = {}) {
  const keys = Array.isArray(row.keys) ? row.keys : [];
  return keys.find(key => /^https?:\/\//i.test(String(key || ''))) || keys[0] || '';
}

function gscRowLabel(row = {}) {
  const url = gscRowUrl(row);
  if (!url) return 'Сторінка';
  try {
    const parsed = new URL(url);
    const pathName = decodeURIComponent(parsed.pathname || '/');
    return pathName === '/' ? parsed.hostname : pathName.replace(/^\/+/, '');
  } catch {
    return String(url).replace(/^https?:\/\/(www\.)?/i, '').slice(0, 90);
  }
}

function compactGscRow(row = {}) {
  return {
    url: gscRowUrl(row),
    label: gscRowLabel(row),
    clicks: Math.round(Number(row.clicks || 0)),
    impressions: Math.round(Number(row.impressions || 0)),
    ctr: Number(row.ctr || 0),
    position: Number(Number(row.position || 0).toFixed(1))
  };
}

function buildGscOpportunities(gsc = null) {
  const rows = Array.isArray(gsc?.rows) ? gsc.rows.map(compactGscRow).filter(row => row.url) : [];
  if (!rows.length) return { topPages: [], lowCtr: [], strikingDistance: [] };
  const topPages = rows
    .slice()
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 5);
  const lowCtr = rows
    .filter(row => row.impressions >= 100 && row.ctr < 0.015)
    .sort((a, b) => b.impressions - a.impressions || a.ctr - b.ctr)
    .slice(0, 5);
  const strikingDistance = rows
    .filter(row => row.impressions >= 50 && row.position > 4 && row.position <= 15)
    .sort((a, b) => b.impressions - a.impressions || a.position - b.position)
    .slice(0, 5);
  return { topPages, lowCtr, strikingDistance };
}

function productMatrixUrlKey(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, storeBaseUrl());
    const pathName = decodeURIComponent(parsed.pathname || '/').replace(/\/+$/, '') || '/';
    return `${parsed.hostname}${pathName}`.toLowerCase().replace(/^www\./, '');
  } catch {
    return raw
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
      .toLowerCase();
  }
}

function productMatrixSlug(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, storeBaseUrl());
    return decodeURIComponent(parsed.pathname || '')
      .split('/')
      .filter(Boolean)
      .pop() || '';
  } catch {
    return decodeURIComponent(raw)
      .split(/[/?#]/)[0]
      .split('/')
      .filter(Boolean)
      .pop() || '';
  }
}

const PRODUCT_MATRIX_STOP_WORDS = new Set([
  'mercato', 'coffee', 'coffeeton', 'kava', 'кава', 'кави', 'каву', 'купити', 'ціна',
  'чай', 'чаю', 'chay', 'cha', 'зелений', 'зелена', 'zelenyy', 'zelenuy', 'green',
  'чорний', 'чорна', 'black', 'зернах', 'зернова', 'зерновий', 'beans', 'bean',
  'колумбія', 'colombia', 'ефіопія', 'ethiopia', 'сальвадор', 'salvador', 'руанда', 'rwanda',
  'індія', 'india', 'гватемала', 'guatemala', 'бразилія', 'brasilia', 'brazil', 'перу', 'peru',
  'кенія', 'kenya', 'мексика', 'mexico', 'танзанія', 'tanzania',
  'в', 'у', 'z', 'v', 'ua', 'ru', 'com', 'html', 'product'
]);

function normalizeProductMatrixText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function productMatrixTokens(value = '') {
  return normalizeProductMatrixText(value)
    .split(/\s+/)
    .filter(token => token.length >= 3 && !/^\d{1,2}$/.test(token) && !PRODUCT_MATRIX_STOP_WORDS.has(token));
}

function productMatrixTextScore(left = '', right = '') {
  const a = normalizeProductMatrixText(left);
  const b = normalizeProductMatrixText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aTokens = productMatrixTokens(a);
  const bTokens = productMatrixTokens(b);
  if (!aTokens.length || !bTokens.length) return 0;
  const aSignature = aTokens.join(' ');
  const bSignature = bTokens.join(' ');
  if (aSignature === bSignature) return 1;
  if (aTokens.length >= 2 && bTokens.length >= 2 && ((aSignature.length >= 8 && bSignature.includes(aSignature)) || (bSignature.length >= 8 && aSignature.includes(bSignature)))) return 0.9;
  const bSet = new Set(bTokens);
  const overlap = aTokens.filter(token => bSet.has(token)).length;
  if (overlap < 2 && Math.min(aTokens.length, bTokens.length) > 1) return 0;
  return overlap / Math.min(aTokens.length, bTokens.length);
}

function productMatrixProductUrl(product = {}) {
  const direct = product.url || product.routeUrl || '';
  if (direct) return direct;
  const keyword = String(product.keyword || '').replace(/^\/+/, '').trim();
  return keyword ? `${storeBaseUrl()}/${keyword}` : '';
}

function productMatrixProductKey(product = {}, index = 0) {
  return String(product.product_id || product.id || product.model || product.sku || product.keyword || product.url || `product-${index}`);
}

function productMatrixProductCandidates(product = {}) {
  const urls = [
    product.url,
    product.routeUrl,
    product.keyword ? `${storeBaseUrl()}/${String(product.keyword).replace(/^\/+/, '')}` : ''
  ].filter(Boolean);
  return {
    urls,
    urlKeys: urls.map(productMatrixUrlKey).filter(Boolean),
    slugs: urls.map(productMatrixSlug).filter(Boolean),
    name: product.name || product.meta_h1 || product.meta_title || '',
    model: product.model || product.sku || ''
  };
}

function matchGscRowToProduct(product = {}, gscRows = []) {
  const candidates = productMatrixProductCandidates(product);
  if (!gscRows.length) return null;
  const exact = gscRows.find(row => candidates.urlKeys.includes(productMatrixUrlKey(row.url)));
  if (exact) return exact;
  const bySlug = gscRows.find(row => {
    const slug = productMatrixSlug(row.url);
    return slug && candidates.slugs.includes(slug);
  });
  if (bySlug) return bySlug;
  const keyword = String(product.keyword || '').replace(/^\/+/, '').trim();
  if (keyword) {
    const byKeyword = gscRows.find(row => productMatrixUrlKey(row.url).includes(keyword.toLowerCase()));
    if (byKeyword) return byKeyword;
  }
  return gscRows
    .map(row => ({ row, score: productMatrixTextScore(candidates.name, gscRowLabel({ keys: [row.url] })) }))
    .filter(item => item.score >= 0.55)
    .sort((a, b) => b.score - a.score || Number(b.row.impressions || 0) - Number(a.row.impressions || 0))[0]?.row || null;
}

function matchOrderItemToProduct(itemName = '', products = []) {
  let best = null;
  for (const product of products) {
    const score = Math.max(
      productMatrixTextScore(itemName, product.name || ''),
      productMatrixTextScore(itemName, product.meta_h1 || ''),
      productMatrixTextScore(itemName, `${product.name || ''} ${product.model || product.sku || ''}`)
    );
    if (!best || score > best.score) best = { product, score };
  }
  return best && best.score >= 0.6 ? best.product : null;
}

function aggregateProductMatrixSales(orders = [], products = []) {
  const sales = new Map();
  const ensure = (product, index = 0) => {
    const key = productMatrixProductKey(product, index);
    if (!sales.has(key)) {
      sales.set(key, {
        orders: 0,
        quantity: 0,
        revenue: 0,
        latestOrderAt: '',
        matchedNames: new Set(),
        orderKeys: new Set()
      });
    }
    return sales.get(key);
  };

  orders.forEach((order, orderIndex) => {
    const detailed = Array.isArray(order.products) ? order.products : [];
    const names = detailed.length
      ? detailed.map(product => product.name).filter(Boolean)
      : splitOrderProducts(order.products_list);
    if (!names.length) return;
    const orderTotal = Number(order.total || 0);
    const fallbackRevenue = orderTotal > 0 ? orderTotal / names.length : 0;
    const orderKey = String(order.order_id || order.id || `${order.email || ''}-${order.date_added || ''}-${orderIndex}`);
    names.forEach((name, itemIndex) => {
      const matched = matchOrderItemToProduct(name, products);
      if (!matched) return;
      const key = productMatrixProductKey(matched, products.indexOf(matched));
      const entry = ensure(matched, products.indexOf(matched));
      const detailedItem = detailed[itemIndex] || {};
      const quantity = Math.max(1, Number(detailedItem.quantity || 1));
      const revenue = Number(detailedItem.total || 0) || Number(detailedItem.price || 0) * quantity || fallbackRevenue;
      entry.quantity += quantity;
      entry.revenue += revenue;
      entry.matchedNames.add(String(name || '').trim());
      const uniqueOrderKey = `${orderKey}:${key}`;
      if (!entry.orderKeys.has(uniqueOrderKey)) {
        entry.orderKeys.add(uniqueOrderKey);
        entry.orders += 1;
      }
      const latestMs = Math.max(Date.parse(entry.latestOrderAt || '') || 0, orderDateMs(order) || 0);
      entry.latestOrderAt = latestMs ? new Date(latestMs).toISOString() : entry.latestOrderAt;
    });
  });

  for (const entry of sales.values()) {
    entry.avgOrderValue = entry.orders ? Math.round(entry.revenue / entry.orders) : 0;
    entry.revenue = Math.round(entry.revenue);
    entry.matchedNames = [...entry.matchedNames].slice(0, 4);
    delete entry.orderKeys;
  }
  return sales;
}

function productMatrixTrafficLevel({ clicks = 0, impressions = 0 } = {}) {
  if (clicks >= 20 || impressions >= 800) return 'high';
  if (clicks >= 5 || impressions >= 150) return 'medium';
  return 'low';
}

function productMatrixProductDisabled(product = {}) {
  const rawStatus = product.status ?? product.enabled ?? product.active ?? '';
  const status = String(rawStatus).trim().toLowerCase();
  if (['0', 'false', 'disabled', 'off', 'no'].includes(status)) return true;
  return (Array.isArray(product.issues) ? product.issues : []).some(issue => {
    const field = String(issue?.field || '').toLowerCase();
    const message = String(issue?.message || '').toLowerCase();
    return field === 'status' || /вимкнен|disabled|inactive/.test(message);
  });
}

function productMatrixStatus({ gsc = {}, sales = {}, product = {}, avgOrderValue = 0 } = {}) {
  if (productMatrixProductDisabled(product)) {
    return {
      status: 'disabled',
      label: 'Вимкнений товар',
      action: 'Не тягнути в SEO-чергу. Спочатку вирішити, чи товар треба активувати або прибрати з контролю.',
      tone: 'muted',
      traffic: productMatrixTrafficLevel({ clicks: gsc.clicks || 0, impressions: gsc.impressions || 0 }),
      conversionRate: null,
      potentialRevenue: 0,
      priorityScore: -1000
    };
  }
  const clicks = Number(gsc.clicks || 0);
  const impressions = Number(gsc.impressions || 0);
  const ctr = Number(gsc.ctr || 0);
  const orders = Number(sales.orders || 0);
  const revenue = Number(sales.revenue || 0);
  const traffic = productMatrixTrafficLevel({ clicks, impressions });
  const conversion = clicks > 0 ? orders / clicks : null;
  const targetConversion = 0.025;
  const lowConversion = clicks >= 5 && (orders === 0 || conversion < 0.012);
  const seoScore = Number(product.score || 0);
  const issues = Array.isArray(product.issues) ? product.issues.length : 0;
  const descLength = Number(product.description_length || product.descriptionLength || 0);
  const productAov = Number(sales.avgOrderValue || avgOrderValue || 0);
  const seoClickUpside = seoPotentialClicks(gsc, 0.03);
  const seoPotential = seoClickUpside * targetConversion * productAov;
  const conversionPotential = Math.max(0, (clicks * targetConversion - orders) * productAov);
  let status = 'needs_data';
  let label = 'Потрібні дані';
  let action = 'Зібрати GSC/GA4 і перевірити OpenCart-readback';
  let tone = 'warn';
  let potentialRevenue = Math.max(seoPotential, conversionPotential, 0);

  if ((traffic === 'high' || traffic === 'medium') && orders >= 2 && (conversion === null || conversion >= targetConversion)) {
    status = 'winner';
    label = 'Переможець';
    action = 'Масштабуй: додай у email, рекламу і схожі товари';
    tone = 'good';
    potentialRevenue = Math.max(productAov, revenue * 0.15);
  } else if (traffic === 'high' && lowConversion) {
    status = 'money_leak';
    label = 'Витік грошей';
    action = 'Терміново: конверсійний аудит сторінки';
    tone = 'critical';
    potentialRevenue = Math.max(conversionPotential, productAov);
  } else if (impressions >= 100 && ctr < 0.015) {
    status = 'seo_hole';
    label = 'SEO-дірка';
    action = 'Фіксуй title/meta і комерційний намір';
    tone = 'critical';
    potentialRevenue = Math.max(seoPotential, productAov * 0.5);
  } else if ((traffic === 'medium' || traffic === 'high') && (lowConversion || seoScore < 75 || descLength < 700 || issues >= 2)) {
    status = 'page_not_selling';
    label = 'Сторінка не продає';
    action = 'Фіксуй опис, фото, атрибути і CTA';
    tone = 'warn';
    potentialRevenue = Math.max(conversionPotential, seoPotential, productAov * 0.5);
  } else if (traffic === 'low' && orders === 0) {
    status = 'seo_hole';
    label = 'SEO-дірка';
    action = 'Створити/оновити SEO-пакет і перевірити індексацію';
    tone = 'warn';
    potentialRevenue = Math.max(seoPotential, productAov * 0.25);
  }

  const priorityScore = Math.round(
    potentialRevenue +
    impressions * 0.35 +
    clicks * 35 +
    Math.max(0, 80 - seoScore) * 12 +
    issues * 80 +
    (status === 'money_leak' ? 1000 : status === 'seo_hole' ? 600 : status === 'page_not_selling' ? 350 : 0)
  );

  return {
    status,
    label,
    action,
    tone,
    traffic,
    conversionRate: conversion,
    potentialRevenue: Math.round(potentialRevenue),
    priorityScore
  };
}

function buildProductMatrix({ orders = [] } = {}) {
  const cache = readSeoAuditCache();
  const productAudit = cache.productAudit || {};
  const products = Array.isArray(productAudit.products) ? productAudit.products : [];
  const gscRaw = cache.gsc || {};
  const gscRows = Array.isArray(gscRaw.rows) ? gscRaw.rows.map(compactGscRow).filter(row => row.url) : [];
  const salesByProduct = aggregateProductMatrixSales(orders, products);
  const validOrders = (orders || []).filter(order => Number(order.total || 0) > 0);
  const avgOrderValue = validOrders.length
    ? validOrders.reduce((sum, order) => sum + Number(order.total || 0), 0) / validOrders.length
    : 650;
  const usedGscUrls = new Set();
  const rows = products.map((product, index) => {
    const key = productMatrixProductKey(product, index);
    const gsc = matchGscRowToProduct(product, gscRows);
    if (gsc?.url) usedGscUrls.add(productMatrixUrlKey(gsc.url));
    const sales = salesByProduct.get(key) || { orders: 0, quantity: 0, revenue: 0, avgOrderValue: 0, matchedNames: [] };
    const monitor = activeSeoMonitorForTarget({ url: gsc?.url || productMatrixProductUrl(product), product });
    const status = monitor
      ? {
        status: 'seo_monitoring',
        label: 'На SEO-контролі',
        action: `Зміни вже внесені, контроль GSC ${monitor.checkAtLocal || 'через 14 днів'}`,
        tone: 'good',
        traffic: productMatrixTrafficLevel({ clicks: gsc?.clicks || 0, impressions: gsc?.impressions || 0 }),
        conversionRate: null,
        potentialRevenue: 0,
        priorityScore: -1
      }
      : productMatrixStatus({ gsc: gsc || {}, sales, product, avgOrderValue });
    return {
      kind: 'product',
      key,
      productId: product.product_id || product.id || '',
      disabled: productMatrixProductDisabled(product),
      opencartStatus: product.status ?? '',
      model: product.model || product.sku || '',
      name: product.name || product.meta_h1 || product.meta_title || `Товар ${key}`,
      url: productMatrixProductUrl(product),
      seo: {
        score: Number(product.score || 0),
        title: product.meta_title || '',
        h1: product.meta_h1 || '',
        descriptionLength: Number(product.description_length || product.descriptionLength || 0),
        issues: Array.isArray(product.issues) ? product.issues.slice(0, 5) : [],
        attributes: Number(product.attributes_count || product.attributesCount || 0)
      },
      gsc: gsc || { url: '', label: '', clicks: 0, impressions: 0, ctr: 0, position: 0 },
      sales,
      monitoring: monitor,
      ...status
    };
  });

  const unmatchedPages = [];
  for (const gsc of gscRows) {
    const urlKey = productMatrixUrlKey(gsc.url);
    if (!urlKey || usedGscUrls.has(urlKey)) continue;
    unmatchedPages.push({
      key: `gsc-${crypto.createHash('sha1').update(gsc.url).digest('hex').slice(0, 10)}`,
      name: gsc.label || seoActionUrlLabel(gsc.url),
      url: gsc.url,
      gsc
    });
  }

  rows.sort((a, b) => b.priorityScore - a.priorityScore || Number(b.gsc?.impressions || 0) - Number(a.gsc?.impressions || 0));
  const byStatus = status => rows.filter(row => row.status === status);
  const topOpportunities = rows
    .filter(row => row.status !== 'winner' && (row.priorityScore > 0 || row.potentialRevenue > 0))
    .slice(0, 5);
  const summary = {
    products: products.length,
    rows: rows.length,
    gscRows: gscRows.length,
    unmatchedPages: unmatchedPages.length,
    orders: (orders || []).length,
    matchedSalesProducts: [...salesByProduct.values()].filter(item => item.orders > 0).length,
    winners: byStatus('winner').length,
    disabled: byStatus('disabled').length,
    seoHoles: byStatus('seo_hole').length,
    leaks: byStatus('money_leak').length,
    pageNotSelling: byStatus('page_not_selling').length,
    potentialRevenue: Math.round(topOpportunities.reduce((sum, row) => sum + Number(row.potentialRevenue || 0), 0))
  };

  return {
    generatedAt: new Date().toISOString(),
    generatedAtLocal: new Date().toLocaleString('uk-UA'),
    sources: {
      gsc: {
        configured: gscConfigStatus().configured,
        lastRunAt: gscRaw.generatedAt || '',
        rows: gscRows.length,
        clicks: Math.round(Number(gscRaw.summary?.clicks || 0)),
        impressions: Math.round(Number(gscRaw.summary?.impressions || 0))
      },
      ga4: {
        configured: false,
        status: 'pending',
        note: 'GA4 буде наступним шаром матриці: сесії, engagement і події add_to_cart/purchase.'
      },
      opencart: {
        products: products.length,
        orders: (orders || []).length,
        salesMatched: summary.matchedSalesProducts,
        productAuditAt: productAudit.generatedAt || ''
      }
    },
    summary,
    rows: rows.slice(0, 80),
    topOpportunities,
    seoHoles: byStatus('seo_hole').slice(0, 5),
    leaks: byStatus('money_leak').slice(0, 5),
    pageNotSelling: byStatus('page_not_selling').slice(0, 5),
    winners: byStatus('winner').slice(0, 5),
    unmatchedPages: unmatchedPages
      .sort((a, b) => Number(b.gsc?.impressions || 0) - Number(a.gsc?.impressions || 0))
      .slice(0, 10)
  };
}

function productMatrixApiSource({ matrix = {}, orders = [], bridgeWarning = '', pages = 0, bridgeTimeoutMs = 0, durationMs = 0 } = {}) {
  const sources = matrix.sources || {};
  return {
    status: bridgeWarning ? 'partial' : 'ready',
    durationMs: Number(durationMs || 0),
    opencartOrders: {
      ok: !bridgeWarning,
      ordersRead: Array.isArray(orders) ? orders.length : 0,
      pagesRequested: Number(pages || 0),
      timeoutMs: Number(bridgeTimeoutMs || 0),
      warning: bridgeWarning || ''
    },
    opencart: sources.opencart || {},
    gsc: sources.gsc || {},
    ga4: sources.ga4 || {}
  };
}

function organicGrowthExpectedCtr(position = 0) {
  const pos = Number(position || 0);
  if (!pos) return 0.02;
  if (pos <= 3) return 0.09;
  if (pos <= 5) return 0.055;
  if (pos <= 8) return 0.035;
  if (pos <= 12) return 0.025;
  if (pos <= 20) return 0.016;
  return 0.01;
}

function organicGrowthOpportunityType(row = {}, sales = {}, product = null) {
  const impressions = Number(row.impressions || 0);
  const clicks = Number(row.clicks || 0);
  const ctr = Number(row.ctr || 0);
  const position = Number(row.position || 0);
  const expectedCtr = organicGrowthExpectedCtr(position);
  if (clicks >= 10 && Number(sales.orders || 0) === 0) return 'conversion_leak';
  if (impressions >= 100 && ctr < expectedCtr * 0.6) return 'snippet_ctr';
  if (position > 4 && position <= 15 && impressions >= 50) return 'striking_distance';
  if (!product && impressions >= 100) return 'content_gap';
  return 'maintain';
}

function organicGrowthTypeLabel(type = '') {
  return {
    snippet_ctr: 'CTR-дірка',
    striking_distance: 'Близько до топу',
    conversion_leak: 'Трафік без продажів',
    content_gap: 'Попит без товару',
    maintain: 'Підтримати'
  }[type] || 'SEO-можливість';
}

function organicGrowthActionText(type = '') {
  return {
    snippet_ctr: 'Переписати title/meta під комерційний намір і підняти CTR.',
    striking_distance: 'Додати корисні блоки, FAQ і внутрішні посилання, щоб дотиснути позиції.',
    conversion_leak: 'Провести конверсійний аудит: опис, опції, CTA, довіра, внутрішні переходи.',
    content_gap: 'Вирішити: створити/посилити категорію або привʼязати сторінку до товару.',
    maintain: 'Підтримати сторінку: перевірити сніпет, внутрішні посилання і актуальність.'
  }[type] || 'Покращити сторінку і перевірити результат у GSC.';
}

function organicGrowthTargetType(url = '', product = null) {
  if (product?.product_id || product?.id) return 'product';
  const pathName = (() => {
    try { return new URL(url).pathname.toLowerCase(); } catch { return String(url || '').toLowerCase(); }
  })();
  const segments = pathName.split('/').filter(Boolean);
  if (segments.length <= 1) return 'category';
  return 'product';
}

function productForOrganicGscRow(row = {}, products = []) {
  const scored = products.map((product, index) => {
    const match = matchGscRowToProduct(product, [row]);
    const candidates = productMatrixProductCandidates(product);
    const urlScore = candidates.urlKeys.includes(productMatrixUrlKey(row.url)) ? 1 : 0;
    const slugScore = candidates.slugs.includes(productMatrixSlug(row.url)) ? 0.95 : 0;
    const textScore = productMatrixTextScore(candidates.name, gscRowLabel({ keys: [row.url] }));
    return { product, index, score: Math.max(urlScore, slugScore, textScore, match ? 0.75 : 0) };
  }).filter(item => item.score >= 0.55)
    .sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

function buildOrganicGrowth({ orders = [] } = {}) {
  const cache = readSeoAuditCache();
  const products = Array.isArray(cache.productAudit?.products) ? cache.productAudit.products : [];
  const gscRows = Array.isArray(cache.gsc?.rows) ? cache.gsc.rows.map(compactGscRow).filter(row => row.url) : [];
  const salesByProduct = aggregateProductMatrixSales(orders, products);
  const validOrders = (orders || []).filter(order => Number(order.total || 0) > 0);
  const avgOrderValue = validOrders.length
    ? validOrders.reduce((sum, order) => sum + Number(order.total || 0), 0) / validOrders.length
    : 650;
  const opportunities = gscRows.map(row => {
    const matched = productForOrganicGscRow(row, products);
    const product = matched?.product || null;
    const productIndex = matched?.index ?? -1;
    const productKey = product ? productMatrixProductKey(product, productIndex) : '';
    const sales = productKey ? (salesByProduct.get(productKey) || { orders: 0, quantity: 0, revenue: 0, avgOrderValue: 0, matchedNames: [] }) : { orders: 0, quantity: 0, revenue: 0, avgOrderValue: 0, matchedNames: [] };
    const expectedCtr = organicGrowthExpectedCtr(row.position);
    const lostClicks = Math.max(0, Math.round(Number(row.impressions || 0) * Math.max(0, expectedCtr - Number(row.ctr || 0))));
    const type = organicGrowthOpportunityType(row, sales, product);
    const keyword = product?.name || seoKeywordFromUrl(row.url);
    const pageType = seoPageType(row.url, keyword);
    const monitor = activeSeoMonitorForTarget({ url: row.url, product, productName: keyword });
    const revenuePerOrganicClick = Number(sales.avgOrderValue || avgOrderValue || 650) * 0.025;
    const potentialRevenue = Math.round(lostClicks * revenuePerOrganicClick);
    const priorityScore = Math.round(
      lostClicks * 12 +
      Number(row.impressions || 0) * 0.22 +
      Math.max(0, 20 - Number(row.position || 20)) * 35 +
      (type === 'conversion_leak' ? 700 : type === 'snippet_ctr' ? 520 : type === 'striking_distance' ? 420 : type === 'content_gap' ? 260 : 100) +
      Number(sales.revenue || 0) * 0.05
    );
    return {
      id: seoActionId(`organic-${type}`, row.url),
      type,
      label: monitor ? 'На контролі' : organicGrowthTypeLabel(type),
      action: monitor
        ? `Зміни вже внесені. Не переписувати повторно: чекаємо контроль GSC ${monitor.checkAtLocal || 'через 14 днів'}.`
        : organicGrowthActionText(type),
      priority: monitor ? 'low' : priorityScore >= 1000 ? 'high' : priorityScore >= 550 ? 'medium' : 'low',
      priorityScore: monitor ? -1 : priorityScore,
      monitoring: monitor,
      url: row.url,
      pageLabel: row.label || seoActionUrlLabel(row.url),
      keyword,
      pageType,
      targetType: organicGrowthTargetType(row.url, product),
      publishable: Boolean(row.url),
      gsc: {
        ...row,
        expectedCtr,
        lostClicks
      },
      sales: {
        orders: Number(sales.orders || 0),
        revenue: Number(sales.revenue || 0),
        avgOrderValue: Number(sales.avgOrderValue || 0),
        matchedNames: sales.matchedNames || []
      },
      potentialRevenue,
      product: product ? {
        product_id: product.product_id || product.id || '',
        model: product.model || product.sku || '',
        name: product.name || product.meta_h1 || product.meta_title || '',
        url: productMatrixProductUrl(product),
        keyword: product.keyword || '',
        score: Number(product.score || 0),
        status: product.status,
        meta_title: product.meta_title || '',
        meta_description: product.meta_description || '',
        meta_h1: product.meta_h1 || '',
        description_length: Number(product.description_length || product.descriptionLength || 0),
        attributes_count: Number(product.attributes_count || product.attributesCount || 0),
        issues: Array.isArray(product.issues) ? product.issues.slice(0, 5) : []
      } : null,
      recommendation: professionalSeoRecommendations({
        kind: type === 'snippet_ctr' ? 'gsc_low_ctr' : type === 'striking_distance' ? 'gsc_striking_distance' : type === 'conversion_leak' ? 'gsc_top_page' : 'gsc_low_ctr',
        row,
        product,
        url: row.url,
        label: row.label,
        products,
        measurement: seoMeasurementSnapshot()
      })
    };
  }).sort((a, b) => b.priorityScore - a.priorityScore || Number(b.gsc?.impressions || 0) - Number(a.gsc?.impressions || 0));

  const summary = {
    startDate: cache.gsc?.startDate || '',
    endDate: cache.gsc?.endDate || '',
    gscLastRunAt: cache.gsc?.generatedAt || '',
    clicks: Number(cache.gsc?.summary?.clicks || 0),
    impressions: Number(cache.gsc?.summary?.impressions || 0),
    ctr: Number(cache.gsc?.summary?.ctr || 0),
    avgPosition: Number(cache.gsc?.summary?.avgPosition || 0),
    opportunities: opportunities.length,
    high: opportunities.filter(item => item.priority === 'high').length,
    snippetCtr: opportunities.filter(item => item.type === 'snippet_ctr').length,
    strikingDistance: opportunities.filter(item => item.type === 'striking_distance').length,
    conversionLeaks: opportunities.filter(item => item.type === 'conversion_leak').length,
    estimatedLostClicks: opportunities.reduce((sum, item) => sum + Number(item.gsc?.lostClicks || 0), 0),
    potentialRevenue: opportunities.reduce((sum, item) => sum + Number(item.potentialRevenue || 0), 0)
  };

  return {
    generatedAt: new Date().toISOString(),
    generatedAtLocal: new Date().toLocaleString('uk-UA'),
    sources: {
      gsc: {
        configured: gscConfigStatus().configured,
        lastRunAt: cache.gsc?.generatedAt || '',
        rows: gscRows.length
      },
      opencart: {
        productAuditAt: cache.productAudit?.generatedAt || '',
        products: products.length,
        orders: (orders || []).length
      },
      ga4: {
        configured: false,
        note: 'GA4 наступним шаром додасть sessions/add_to_cart/purchase для конверсії сторінок.'
      }
    },
    summary,
    opportunities: opportunities.slice(0, 80)
  };
}

function organicGrowthDraftHtml({ keyword = '', pageType = 'generic', opportunity = {}, product = null, research = null, operatorBrief = '' } = {}) {
  const name = product?.name || keyword || opportunity.pageLabel || 'сторінка';
  const blocks = seoContentBlocks(pageType, keyword || name);
  const researchFaq = Array.isArray(research?.faqQuestions) ? research.faqQuestions.filter(Boolean).slice(0, 4) : [];
  const faq = researchFaq.length ? researchFaq : seoFaq(pageType, keyword || name);
  const cleanOperatorBrief = plainOneLine(operatorBrief).slice(0, 500);
  const introByType = {
    coffee: `${name} — кава для покупців, яким важливо швидко зрозуміти смак, свіжість обсмаження і зручний спосіб приготування.`,
    tea: `${name} — чай для щоденного заварювання або подарунка, де важливі аромат, мʼякість настою і проста інструкція.`,
    coffee_set: `${name} — готовий кавовий набір для подарунка, дегустації або знайомства з кількома смаками Mercato.`,
    generic: `${name} — сторінка вибору з коротким поясненням формату, користі і наступного кроку для покупця.`
  };
  return `
<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.65;font-size:16px;">
  <p style="margin:0 0 18px;">${htmlEscape(introByType[pageType] || introByType.generic)}</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:18px 0;">
    ${blocks.slice(0, 3).map(block => `
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;">
      <strong>${htmlEscape(block.title)}</strong><br>
      <span style="color:#4b5563;">${htmlEscape(block.text)}</span>
    </div>`).join('')}
  </div>
  ${cleanOperatorBrief ? `<div style="border:1px solid #f0d7ba;background:#fffaf4;border-radius:12px;padding:14px 16px;margin:18px 0;">
    <strong>Додатково про товар</strong>
    <p style="margin:8px 0 0;color:#4b5563;">${htmlEscape(cleanOperatorBrief)}</p>
  </div>` : ''}
  <h3 style="font-size:20px;margin:24px 0 12px;color:#1f2937;">Як обрати</h3>
  <p style="margin:0 0 14px;">Орієнтуйтесь на смак, спосіб приготування і ситуацію: для щоденної чашки краще працює зрозумілий профіль, для подарунка — набір або універсальний смак, для експериментів — яскравіші лоти.</p>
  <h3 style="font-size:20px;margin:24px 0 12px;color:#1f2937;">Питання перед покупкою</h3>
  <ul style="margin:0 0 16px 20px;padding:0;">
    ${faq.slice(0, 4).map(item => `<li style="margin-bottom:6px;">${htmlEscape(item)}</li>`).join('')}
  </ul>
  <p style="margin:18px 0 0;color:#4b5563;">Mercato допомагає підібрати формат, спосіб заварювання або готову добірку під ваш сценарій. Якщо вагаєтесь між кількома варіантами, почніть із найзрозумілішого смакового профілю.</p>
</div>`.trim();
}

function buildOrganicGrowthDraft(opportunity = {}, currentEntry = null) {
  const product = opportunity.product || null;
  const keyword = String(opportunity.keyword || product?.name || seoKeywordFromUrl(opportunity.url || '') || '').trim();
  const pageType = opportunity.pageType || seoPageType(opportunity.url || '', keyword);
  const operatorBrief = String(opportunity.operatorBrief || '').trim();
  const competitorResearch = opportunity.competitorResearch || opportunity.research || opportunity.recommendation?.evidence?.competitorResearch || null;
  const currentTitle = currentEntry?.title || product?.meta_title || '';
  const currentMeta = currentEntry?.metaDescription || product?.meta_description || '';
  const currentH1 = currentEntry?.h1 || product?.meta_h1 || '';
  const proposed = opportunity.recommendation?.proposed || {};
  const title = trimSeoText(proposed.title || seoTitleFor(keyword, pageType, opportunity.type), 65);
  const metaDescription = trimSeoText(proposed.metaDescription || seoMetaFor(keyword, pageType), 155);
  const h1 = trimSeoText(proposed.h1 || ucfirstSeo(keyword), 70);
  const targetType = opportunity.targetType || organicGrowthTargetType(opportunity.url || '', product);
  const rightCard = '';
  return {
    ok: true,
    opportunityId: opportunity.id || '',
    type: targetType,
    mode: 'existing',
    url: opportunity.url || product?.url || '',
    productName: product?.name || keyword,
    productId: product?.product_id || '',
    title,
    metaDescription,
    h1,
    rightCard,
    content: organicGrowthDraftHtml({ keyword, pageType, opportunity, product, research: competitorResearch, operatorBrief }),
    attributes: {},
    allowProductFields: false,
    isHtml: true,
    seoKeyword: '',
    current: {
      title: currentTitle,
      metaDescription: currentMeta,
      h1: currentH1,
      descriptionLength: Number(currentEntry?.descriptionLength ?? product?.description_length ?? 0),
      source: currentEntry?.source || (product ? 'product_audit' : '')
    },
    basis: {
      generatedFrom: ['Google Search Console', 'OpenCart readback/audit', 'orders/sales model'].concat(competitorResearch ? ['competitor research'] : []),
      rule: organicGrowthActionText(opportunity.type),
      searchIntent: opportunity.recommendation?.searchIntent || '',
      competitorResearch: competitorResearch ? {
        query: competitorResearch.query || keyword,
        source: competitorResearch.source || '',
        competitorsAnalyzed: Number(competitorResearch.competitorsAnalyzed || 0),
        competitorUrls: (competitorResearch.competitorUrls || []).slice(0, 10),
        seoPatterns: (competitorResearch.seoPatterns || []).slice(0, 3),
        contentGaps: (competitorResearch.contentGaps || []).slice(0, 3)
      } : null,
      operatorBrief
    },
    notes: [
      `Основа генерації: GSC-сигнал, OpenCart ${currentEntry ? 'readback' : 'audit/cache'} і модель потенціалу за кліками.`,
      competitorResearch
        ? `Конкуренти враховано: ${Number(competitorResearch.competitorsAnalyzed || 0).toLocaleString('uk')} сторінок за запитом "${competitorResearch.query || keyword}".`
        : 'Конкуренти не були враховані в цій чернетці: натисніть “Оновити конкурентів” у Organic Growth, якщо треба порівняти з видачею перед publish.',
      operatorBrief ? `Враховано додаткову вимогу: ${operatorBrief}` : '',
      'URL не змінюємо: працюємо зі сніпетом, контентом і внутрішніми посиланнями.',
      'Перед publish перечитайте HTML опис: це чернетка, яку можна редагувати вручну.',
      'Через 14 днів після publish перевірити GSC: CTR, позиція, кліки.'
    ].filter(Boolean)
  };
}

function seoActionId(kind, value) {
  const hash = crypto.createHash('sha1').update(String(value || kind || 'seo')).digest('hex').slice(0, 10);
  return `director-seo-${kind}-${hash}`;
}

function seoActionUrlLabel(url = '') {
  if (!url) return 'сторінка';
  try {
    const parsed = new URL(url);
    const pathName = decodeURIComponent(parsed.pathname || '/');
    return pathName === '/' ? parsed.hostname : pathName.replace(/^\/+/, '');
  } catch {
    return String(url).replace(/^https?:\/\/(www\.)?/i, '').slice(0, 90);
  }
}

function seoCtrLabel(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function seoPotentialClicks(row = {}, targetCtr = 0.03) {
  const impressions = Number(row.impressions || 0);
  const currentCtr = Number(row.ctr || 0);
  return Math.max(0, Math.round(impressions * Math.max(0, targetCtr - currentCtr)));
}

function trimSeoText(text = '', max = 155) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const trimmed = cut
    .replace(/\s+\S*$/, '')
    .replace(/[\s,;:–—-]+$/u, '')
    .trim();
  if (!trimmed) return clean.slice(0, max).trim();
  return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

function seoKeywordFromUrl(url = '', fallback = '') {
  if (fallback) return String(fallback).replace(/\s+/g, ' ').trim();
  if (/^(?:www\.)?mercato\.com\.ua\/?$/i.test(String(url || '').trim())) return 'головна сторінка';
  let pathName = '';
  try {
    pathName = decodeURIComponent(new URL(url).pathname || '');
  } catch {
    pathName = String(url || '');
  }
  const pathParts = pathName.split('/').filter(Boolean);
  const slug = pathParts.pop() || pathName.replace(/^\/+/, '') || 'головна сторінка';
  const normalized = slug.toLowerCase();
  const exact = {
    'kava-nabory': 'набори кави',
    'kava-nabor-blend-100': 'кавовий набір Blend 100',
    'kava-v-zernah': 'кава в зернах',
    'svizhoobsmazhena-kava': 'свіжообсмажена кава',
    'kavyarnya-urban-coffee': 'кавʼярня Urban Coffee',
    'bu-kavomashyny-franke': 'БУ кавомашини Franke',
    'v60-easy-recipe-218': 'V60 простий рецепт',
    'ua-chai': 'чай',
    'cha-sencha': 'чай Сенча',
    'zelenuy-chay-sausesp': 'зелений чай Саусеп',
    'kava-brasilia-santos': 'кава Бразилія Santos',
    'kava-efiopiya-yirgacheffe': 'кава Ефіопія Yirgacheffe',
    'kava-kolumbiya-medelin-supremo': 'кава Колумбія Меделін Supremo',
    'kava-Guatemala-Maragogype': 'кава Гватемала Maragogype',
    'kava-kolumbiya-supremo-decaf-co2': 'кава Колумбія Supremo Decaf CO2',
    'kava-dnipro': 'кава у Дніпрі',
    'kava-zernova-dnepr': 'зернова кава у Дніпрі'
  };
  if (exact[slug] || exact[normalized]) return exact[slug] || exact[normalized];
  const dictionary = {
    kava: 'кава',
    kofe: 'кава',
    v: 'в',
    zernah: 'в зернах',
    zernova: 'зернова',
    svizhoobsmazhena: 'свіжообсмажена',
    svizhoobsmazhenu: 'свіжообсмажену',
    kavyarnya: 'кавʼярня',
    urban: 'Urban',
    bu: 'БУ',
    kavomashyny: 'кавомашини',
    franke: 'Franke',
    easy: 'простий',
    recipe: 'рецепт',
    nabory: 'набори',
    nabor: 'набір',
    blend: 'Blend',
    chai: 'чай',
    chay: 'чай',
    cha: 'чай',
    zelenuy: 'зелений',
    sencha: 'Сенча',
    sausesp: 'Саусеп',
    brasilia: 'Бразилія',
    santos: 'Santos',
    efiopiya: 'Ефіопія',
    yirgacheffe: 'Yirgacheffe',
    kolumbiya: 'Колумбія',
    medelin: 'Меделін',
    supremo: 'Supremo',
    decaf: 'декаф',
    co2: 'CO2',
    guatemala: 'Гватемала',
    maragogype: 'Maragogype',
    dnipro: 'Дніпро',
    dnepr: 'Дніпро',
    v60: 'V60',
    easy: 'простий',
    recipe: 'рецепт'
  };
  const words = slug
    .replace(/-\d+$/g, '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map(word => dictionary[word.toLowerCase()] || word)
    .filter(word => !/^\d+$/.test(word));
  return words.join(' ').replace(/\s+/g, ' ').trim() || seoActionUrlLabel(url);
}

function seoPageType(url = '', keyword = '') {
  const text = `${url} ${keyword}`.toLowerCase();
  if (/(dnipro|dnepr|дніпр|днепр)/i.test(text) && /(kava|coffee|кава|kofe)/i.test(text)) return 'local_coffee';
  if (text.includes('nabory') || text.includes('набор')) return 'coffee_set';
  if (text.includes('chai') || text.includes('chay') || text.includes('сенча') || text.includes('чай')) return 'tea';
  if (text.includes('kava') || text.includes('кава') || text.includes('coffee')) return 'coffee';
  return 'generic';
}

function ucfirstSeo(text = '') {
  const clean = String(text || '').trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : '';
}

function seoTitleFor(keyword, pageType, kind) {
  const pretty = ucfirstSeo(keyword);
  if (pageType === 'local_coffee') return trimSeoText(`${pretty} купити | Mercato`, 65);
  if (pageType === 'coffee_set') return trimSeoText(`${pretty} купити | набір кави Mercato`, 65);
  if (pageType === 'tea') {
    if (/^чай$/i.test(String(keyword || '').trim())) {
      return trimSeoText('Чай купити | зелений, чорний, пуер Mercato', 65);
    }
    return trimSeoText(`${pretty} купити | Mercato`, 65);
  }
  if (pageType === 'coffee') return trimSeoText(`${pretty} купити | Mercato`, 65);
  if (kind === 'product_audit') return trimSeoText(`${pretty} | Mercato`, 65);
  return trimSeoText(`${pretty} - купити в Mercato`, 65);
}

function seoMetaFor(keyword, pageType) {
  const pretty = ucfirstSeo(keyword);
  if (pageType === 'local_coffee') {
    return trimSeoText(`${pretty}: свіжообсмажена кава Mercato, зерно або помел під еспресо, фільтр чи турку. Онлайн-замовлення і доставка.`, 155);
  }
  if (pageType === 'coffee_set') {
    return trimSeoText(`${pretty}: добірка кави для подарунка або дегустації. Порівняйте склад, смаки й фасування з доставкою по Україні.`, 155);
  }
  if (pageType === 'tea') {
    if (/^чай$/i.test(String(keyword || '').trim())) {
      return trimSeoText('Натуральний листовий чай Mercato: зелений, чорний, улун, пуер і суміші. Фасування від 50 г, швидка доставка по Україні.', 155);
    }
    return trimSeoText(`${pretty} від Mercato: смак, аромат, рекомендації із заварювання і доставка по Україні. Фасування від 50 г.`, 155);
  }
  if (pageType === 'coffee') {
    if (/^свіжообсмажена\s+кава$/iu.test(String(keyword || '').trim())) {
      return trimSeoText(`${pretty}: кава свіжого обсмаження в зернах або помелі під еспресо, фільтр чи турку. Доставка по Україні.`, 155);
    }
    const detail = /washed|мит/i.test(keyword)
      ? 'мита арабіка з чистою чашкою'
      : /natural|натурал/i.test(keyword)
        ? 'арабіка з виразним фруктовим профілем'
        : /decaf|декаф|без кофе/i.test(keyword)
          ? 'кава без кофеїну зі свіжим обсмаженням'
          : 'свіжообсмажена кава зі смаковим профілем';
    return trimSeoText(`${pretty}: ${detail}, зерно або помел під ваш спосіб приготування. Доставка по Україні.`, 155);
  }
  return trimSeoText(`${pretty}: головні переваги, сценарії вибору і наступний крок для замовлення в Mercato без зайвого пошуку.`, 155);
}

function seoContentBlocks(pageType, keyword) {
  const pretty = ucfirstSeo(keyword);
  if (pageType === 'coffee_set') {
    return [
      { title: 'Для кого', text: `${pretty} підходять для подарунка, дегустації кількох смаків або першого знайомства з кавою Mercato.` },
      { title: 'Що всередині', text: 'У наборі покупець бачить склад, вагу, формат зерно/помел і короткий смаковий орієнтир для кожної позиції.' },
      { title: 'Як обрати', text: 'Мʼякі, фруктові, насичені або безкофеїнові варіанти легко порівняти між собою перед замовленням.' },
      { title: 'Подарунок', text: 'Набір можна вибрати як готовий кавовий подарунок або як дегустаційний формат для дому чи офісу.' }
    ];
  }
  if (pageType === 'tea') {
    return [
      { title: 'Смак', text: `${pretty} має зрозумілий опис інтенсивності, солодкості, аромату і післясмаку.` },
      { title: 'Як заварювати', text: 'На сторінці є прості орієнтири щодо температури води, грамування і часу настоювання.' },
      { title: 'Кому підійде', text: 'Чай можна обрати на щодень, після їжі, замість кави, для холодного заварювання або подарунка.' },
      { title: 'Порівняння', text: 'Покупець може швидко зрозуміти різницю між чорним, зеленим, ароматизованим або травʼяним чаєм.' }
    ];
  }
  if (pageType === 'coffee') {
    return [
      { title: 'Смаковий профіль', text: `На сторінці ${pretty} легко оцінити кислотність, солодкість, тіло, післясмак і основні смакові ноти.` },
      { title: 'Методи приготування', text: 'Каву можна підібрати під еспресо, фільтр, турку або гейзерну кавоварку без зайвих здогадок.' },
      { title: 'Помел і фасування', text: 'Покупець обирає зерно або помел під свій спосіб приготування і зручну вагу для першого замовлення.' },
      { title: 'Схожі товари', text: 'Якщо подобається цей профіль, можна перейти до близьких сортів або кавових наборів Mercato.' }
    ];
  }
  return [
    { title: 'Коротко про сторінку', text: `${pretty} має одразу пояснювати, кому це підходить і як зробити вибір.` },
    { title: 'Вибір без плутанини', text: 'Покупець бачить основні опції, обмеження і відповіді на типові питання перед замовленням.' },
    { title: 'Довіра', text: 'Сторінка показує доставку, оплату, консультацію, реальні характеристики і важливі деталі.' }
  ];
}

function seoFaq(pageType, keyword) {
  if (pageType === 'local_coffee') {
    return [
      'Яку каву обрати для дому чи офісу в Дніпрі?',
      'Який помел потрібен для еспресо, фільтра або турки?',
      'Чи можна замовити каву в зерні?',
      'Як швидко оформити доставку?'
    ];
  }
  if (pageType === 'coffee_set') {
    const firstQuestion = /набори/i.test(String(keyword || ''))
      ? `Які ${keyword} обрати для подарунка?`
      : `Який ${keyword} обрати для подарунка?`;
    return [
      firstQuestion,
      'Чи можна замовити набір у зернах або мелену каву?',
      'Скільки чашок кави вийде з набору?',
      'Які смаки входять у набір?'
    ];
  }
  if (pageType === 'tea') {
    return [
      `Як правильно заварювати ${keyword}?`,
      'Скільки разів можна заварювати цей чай?',
      'Який смак має цей чай?',
      'Чи підходить цей чай на подарунок?'
    ];
  }
  if (pageType === 'coffee') {
    return [
      `Для якого приготування підходить ${keyword}?`,
      'Який помел обрати для цієї кави?',
      'Який смак у цієї кави?',
      'Чим ця кава відрізняється від схожих сортів?'
    ];
  }
  return [
    `Як обрати ${keyword}?`,
    'Кому це підійде?',
    'Які є умови доставки?',
    'Що варто спробувати разом із цим?'
  ];
}

function seoInternalLinks(pageType, keyword, products = []) {
  const productLinks = products
    .slice(0, 2)
    .map(product => ({
      anchor: product.name || 'популярний товар',
      target: product.name || '',
      why: 'перелити попит на товар, який уже має продажі'
    }));
  if (pageType === 'coffee_set') {
    return [
      { anchor: 'кава в зернах', target: '/kava-v-zernah', why: 'дати шлях тим, хто хоче купити не набір, а конкретний сорт' },
      { anchor: 'кавовий набір Blend 100', target: '/kava-nabory/kava-nabor-blend-100', why: 'підсилити сторінку, що вже близько до топу в GSC' },
      ...productLinks
    ].slice(0, 4);
  }
  if (pageType === 'tea') {
    return [
      { anchor: 'зелений чай', target: '/ua-chai', why: 'звʼязати товар/підкатегорію з чайною категорією' },
      { anchor: 'чай Сенча', target: '/ua-chai/cha-sencha', why: 'підсилити сторінку з великими показами і низьким CTR' },
      ...productLinks
    ].slice(0, 4);
  }
  if (pageType === 'coffee') {
    return [
      { anchor: 'набори кави', target: '/kava-nabory', why: 'перевести частину органіки у подарунковий/дегустаційний сценарій' },
      { anchor: 'кава в зернах', target: '/kava-v-zernah', why: 'підсилити головну комерційну категорію кави' },
      ...productLinks
    ].slice(0, 4);
  }
  return productLinks;
}

function daysSinceIso(value) {
  const ms = Date.parse(value || '');
  if (!ms) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 86400000));
}

function seoFreshness(value, maxAgeDays) {
  const ageDays = daysSinceIso(value);
  if (ageDays == null) return { status: 'missing', ageDays: null, label: 'немає даних' };
  if (ageDays <= maxAgeDays) return { status: 'fresh', ageDays, label: ageDays === 0 ? 'сьогодні' : `${ageDays} дн. тому` };
  return { status: 'stale', ageDays, label: `${ageDays} дн. тому, треба оновити` };
}

function findMonthlyResearchForKeyword(keyword = '') {
  const normalizedKeyword = normalizeResearchCacheText(keyword);
  if (!normalizedKeyword) return null;
  const cache = readGenerationResearchCache();
  const month = currentMonthKey();
  const entries = Object.entries(cache.entries || {})
    .map(([key, value]) => ({ key, ...value }))
    .filter(entry => entry.month === month && entry.research);
  const scored = entries.map(entry => {
    const haystack = normalizeResearchCacheText([
      entry.key,
      entry.searchQuery,
      entry.research?.query,
      ...(entry.research?.competitorTitles || [])
    ].filter(Boolean).join(' '));
    const keywordWords = normalizedKeyword.split(/\s+/).filter(word => word.length > 2);
    const hits = keywordWords.filter(word => haystack.includes(word)).length;
    const phraseHit = haystack.includes(normalizedKeyword) ? 3 : 0;
    return { entry, score: hits + phraseHit };
  }).filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.entry || null;
}

function buildSeoEvidence({ kind = '', row = null, product = null, url = '', keyword = '', measurement = {} } = {}) {
  const cache = readSeoAuditCache();
  const gscFresh = seoFreshness(measurement.gsc?.lastRunAt || cache.gsc?.generatedAt, 3);
  const productFresh = seoFreshness(cache.productAudit?.generatedAt, 14);
  const sitemapFresh = seoFreshness(cache.sitemap?.generatedAt, 14);
  const siteFresh = product ? productFresh : sitemapFresh;
  const monthlyResearch = findMonthlyResearchForKeyword(keyword);
  const competitorFresh = seoFreshness(monthlyResearch?.savedAt, 35);
  const docsFresh = SEO_DOCUMENTATION_BASELINE.reviewedMonth === currentMonthKey()
    ? { status: 'fresh', ageDays: daysSinceIso(SEO_DOCUMENTATION_BASELINE.reviewedAt), label: `переглянуто ${SEO_DOCUMENTATION_BASELINE.reviewedAt}` }
    : { status: 'stale', ageDays: null, label: `останній перегляд ${SEO_DOCUMENTATION_BASELINE.reviewedMonth}, треба оновити цього місяця` };

  const sources = [
    {
      id: 'site',
      label: product ? 'Сайт / OpenCart readback' : 'Сайт / sitemap HTML audit',
      cadence: 'перед publish і після readback',
      status: siteFresh.status,
      lastRunAt: product ? cache.productAudit?.generatedAt : cache.sitemap?.generatedAt,
      freshness: siteFresh.label,
      details: product
        ? `OpenCart audit: score ${Number(product.score || 0).toLocaleString('uk')}/100, issues ${(product.issues || []).length}`
        : `Sitemap audit: ${Number(cache.sitemap?.summary?.pages || 0).toLocaleString('uk')} сторінок, avg score ${Number(cache.sitemap?.summary?.avgScore || 0).toLocaleString('uk')}/100`
    },
    {
      id: 'gsc',
      label: 'Google Search Console',
      cadence: 'постійно / кожне оновлення Command Center',
      status: gscFresh.status,
      lastRunAt: measurement.gsc?.lastRunAt || cache.gsc?.generatedAt,
      freshness: gscFresh.label,
      details: row
        ? `${Number(row.clicks || 0).toLocaleString('uk')} кліків, ${Number(row.impressions || 0).toLocaleString('uk')} показів, CTR ${seoCtrLabel(row.ctr)}, позиція ${Number(row.position || 0).toLocaleString('uk')}`
        : `${Number(cache.gsc?.summary?.clicks || 0).toLocaleString('uk')} кліків, ${Number(cache.gsc?.summary?.impressions || 0).toLocaleString('uk')} показів`
    },
    {
      id: 'competitors',
      label: 'Конкуренти з першої 10 видачі',
      cadence: 'раз на місяць',
      status: monthlyResearch ? competitorFresh.status : 'missing',
      lastRunAt: monthlyResearch?.savedAt || '',
      freshness: monthlyResearch ? competitorFresh.label : 'немає аналізу цього місяця для цього запиту',
      details: monthlyResearch
        ? `${Number(monthlyResearch.research?.competitorsAnalyzed || 0).toLocaleString('uk')} конкурентів, query: ${monthlyResearch.research?.query || monthlyResearch.searchQuery || keyword}`
        : `Потрібно оновити competitor research для "${keyword}" перед фінальним publish`
    },
    {
      id: 'docs',
      label: 'Google Search Central документація',
      cadence: SEO_DOCUMENTATION_BASELINE.cadence,
      status: docsFresh.status,
      lastRunAt: SEO_DOCUMENTATION_BASELINE.reviewedAt,
      freshness: docsFresh.label,
      details: SEO_DOCUMENTATION_BASELINE.sources.map(source => source.title).join('; ')
    }
  ];

  const blocking = sources.filter(source => ['missing', 'stale'].includes(source.status) && ['competitors', 'docs'].includes(source.id));
  return {
    keyword,
    verdict: blocking.length
      ? 'Чернетка: перед фінальним publish оновити джерела нижче.'
      : 'Готово до роботи: сайт, GSC, конкуренти і документація в актуальному вікні.',
    policy: 'GSC аналізуємо постійно; конкурентів з першої 10 видачі і документацію оновлюємо не частіше одного разу на місяць.',
    sources,
    competitorCandidates: (() => {
      const candidateEntry = monthlyCompetitorSearchForKeyword(keyword);
      return candidateEntry ? {
        keyword: candidateEntry.keyword || keyword,
        source: candidateEntry.source || '',
        savedAt: candidateEntry.savedAt || '',
        month: candidateEntry.month || '',
        urls: cleanCompetitorUrls(candidateEntry.urls || candidateEntry.manualUrls || [])
      } : null;
    })(),
    competitorResearch: monthlyResearch?.research ? {
      query: monthlyResearch.research.query || monthlyResearch.searchQuery || keyword,
      savedAt: monthlyResearch.savedAt,
      source: monthlyResearch.research.source || '',
      competitorsAnalyzed: monthlyResearch.research.competitorsAnalyzed || 0,
      competitorUrls: (monthlyResearch.research.competitorUrls || []).slice(0, 10),
      seoPatterns: (monthlyResearch.research.seoPatterns || []).slice(0, 3),
      contentGaps: (monthlyResearch.research.contentGaps || []).slice(0, 3)
    } : null
  };
}

function professionalSeoRecommendations({ kind = '', row = null, product = null, url = '', label = '', products = [], measurement = {} } = {}) {
  const keyword = product?.name
    ? String(product.name).replace(/\s+/g, ' ').trim()
    : (seoKeywordFromUrl(url) || String(label || '').split('/').filter(Boolean).pop() || 'сторінка');
  const pageType = seoPageType(url, keyword);
  const title = seoTitleFor(keyword, pageType, kind);
  const metaDescription = seoMetaFor(keyword, pageType);
  const h1 = trimSeoText(keyword.charAt(0).toUpperCase() + keyword.slice(1), 70);
  const ctr = row ? seoCtrLabel(row.ctr) : '';
  const position = row ? Number(row.position || 0).toLocaleString('uk') : '';
  const recommendationByKind = {
    gsc_low_ctr: `Фокус на SERP-сніпеті: Google уже дає покази, але CTR ${ctr}. Не міняємо URL, міняємо обіцянку в title/meta і перший екран.`,
    gsc_striking_distance: `Фокус на content depth: позиція ${position}, сторінка вже близько. Потрібні FAQ, внутрішні посилання і корисні блоки, а не нова сторінка.`,
    gsc_top_page: 'Фокус на конверсії органіки: сторінка уже збирає кліки, треба додати шляхи до товарів і комерційних сторінок.',
    product_audit: 'Фокус на технічній гігієні OpenCart: виправити title/meta/H1, прибрати переспам і зробити readback після publish.'
  };
  return {
    keyword,
    pageType,
    searchIntent: recommendationByKind[kind] || `Фокус: зробити сторінку зрозумілою для запиту “${keyword}” і для покупця.`,
    proposed: {
      title,
      metaDescription,
      h1
    },
    changeList: [
      `Замінити SEO title на: ${title}`,
      `Замінити meta description на: ${metaDescription}`,
      `H1 зробити простим: ${h1}`,
      'Перший абзац: 2-3 речення про смак/вигоду/сценарій вибору без шаблонного “купити зараз”.',
      'Після змін зробити OpenCart readback і перевірити, що title/meta/H1 реально записались.'
    ],
    contentBlocks: seoContentBlocks(pageType, keyword),
    faq: seoFaq(pageType, keyword),
    internalLinks: seoInternalLinks(pageType, keyword, products),
    evidence: buildSeoEvidence({ kind, row, product, url, keyword, measurement }),
    technicalChecks: [
      'Один H1 на сторінці; H1 не дублює title дослівно.',
      'Canonical веде на поточний чистий URL без параметрів.',
      'Meta title 45-60 символів, meta description 120-155 символів.',
      'Для товару має бути Product schema: price, availability, image, name.',
      'Зображення мають alt із назвою товару/категорії без переспаму.'
    ]
  };
}

function buildSeoDirectorActions({ measurement = {}, products = [] } = {}) {
  const actions = [];
  const seen = new Set();
  const add = (action) => {
    const key = action.actionId || action.id;
    if (!key || seen.has(key)) return;
    seen.add(key);
    actions.push({
      id: key,
      actionId: key,
      priority: action.priority || 'medium',
      type: action.type || 'seo',
      title: action.title,
      action: action.action,
      why: action.why,
      expectedImpact: action.expectedImpact || '',
      pageLabel: action.pageLabel || '',
      url: action.url || '',
      productName: action.productName || '',
      metrics: action.metrics || null,
      issues: action.issues || [],
      recommendations: action.recommendations || null,
      steps: action.steps || [],
      data: action.data || [],
      primaryAction: action.primaryAction || null,
      secondaryAction: action.secondaryAction || null
    });
  };

  const opportunities = measurement.gsc?.opportunities || {};
  const lowCtr = Array.isArray(opportunities.lowCtr) ? opportunities.lowCtr : [];
  const strikingDistance = Array.isArray(opportunities.strikingDistance) ? opportunities.strikingDistance : [];
  const topPages = Array.isArray(opportunities.topPages) ? opportunities.topPages : [];
  const isOnSeoMonitor = (rowOrProduct = {}) => {
    const url = rowOrProduct.url || rowOrProduct.routeUrl || '';
    const product = rowOrProduct.product_id || rowOrProduct.id || rowOrProduct.name ? rowOrProduct : null;
    return Boolean(activeSeoMonitorForTarget({ url, product, productName: rowOrProduct.name || rowOrProduct.label || '' }));
  };

  for (const row of lowCtr.filter(row => !isOnSeoMonitor(row)).slice(0, 2)) {
    const potentialClicks = seoPotentialClicks(row, 0.03);
    const label = row.label || seoActionUrlLabel(row.url);
    const recommendations = professionalSeoRecommendations({ kind: 'gsc_low_ctr', row, url: row.url, label, products, measurement });
    add({
      type: 'gsc_low_ctr',
      actionId: seoActionId('ctr', row.url || label),
      priority: Number(row.impressions || 0) >= 500 ? 'high' : 'medium',
      title: `Підняти CTR сторінки: ${label}`,
      action: 'Переписати SEO title і meta description так, щоб сніпет продавав клік. URL не міняти.',
      why: `Google уже показує цю сторінку: ${Number(row.impressions || 0).toLocaleString('uk')} показів, але CTR лише ${seoCtrLabel(row.ctr)}.`,
      expectedImpact: potentialClicks
        ? `Якщо підняти CTR до 3%, це дасть приблизно +${potentialClicks.toLocaleString('uk')} органічних переходів за такий самий період.`
        : 'Мета — підняти частку кліків без зміни позицій: спочатку сніпет, потім контент.',
      pageLabel: label,
      url: row.url,
      metrics: row,
      recommendations,
      data: [
        `Покази: ${Number(row.impressions || 0).toLocaleString('uk')}`,
        `CTR: ${seoCtrLabel(row.ctr)}`,
        `Позиція: ${Number(row.position || 0).toLocaleString('uk')}`
      ],
      steps: [
        'відкрити сторінку у SEO workflow',
        'імпортувати поточний текст і SEO-поля',
        'скоротити title до 45-60 символів з чіткою обіцянкою',
        'переписати meta description 120-155 символів без “купіть зараз”',
        'опублікувати в OpenCart і через 7-14 днів перевірити GSC'
      ],
      primaryAction: { label: 'Відкрити SEO workflow', tab: 'organic', url: row.url },
      secondaryAction: { label: 'Порівняти конкурентів', tab: 'analysis', url: row.url }
    });
  }

  for (const row of strikingDistance.filter(row => !isOnSeoMonitor(row)).slice(0, 2)) {
    const label = row.label || seoActionUrlLabel(row.url);
    const recommendations = professionalSeoRecommendations({ kind: 'gsc_striking_distance', row, url: row.url, label, products, measurement });
    add({
      type: 'gsc_striking_distance',
      actionId: seoActionId('near-top', row.url || label),
      priority: Number(row.position || 0) <= 10 ? 'high' : 'medium',
      title: `Дотиснути до топу: ${label}`,
      action: 'Додати змістовний блок, FAQ і внутрішні посилання на сторінку, яка вже близько до топу.',
      why: `Сторінка має позицію ${Number(row.position || 0).toLocaleString('uk')} і ${Number(row.impressions || 0).toLocaleString('uk')} показів. Це не “писати з нуля”, а підсилити те, що Google уже тестує.`,
      expectedImpact: 'Найкоротший SEO-шлях: сторінки на позиціях 5-15 часто ростуть швидше за нові сторінки без сигналів.',
      pageLabel: label,
      url: row.url,
      metrics: row,
      recommendations,
      data: [
        `Позиція: ${Number(row.position || 0).toLocaleString('uk')}`,
        `Покази: ${Number(row.impressions || 0).toLocaleString('uk')}`,
        `Кліки: ${Number(row.clicks || 0).toLocaleString('uk')}`
      ],
      steps: [
        'відкрити сторінку і конкурентів',
        'додати 3-5 FAQ з реальними питаннями покупця',
        'додати внутрішні посилання з топових сторінок/категорій',
        'прибрати дубльовані або слабкі абзаци',
        'після публікації перевірити позицію через наступний GSC замір'
      ],
      primaryAction: { label: 'Підсилити сторінку', tab: 'organic', url: row.url },
      secondaryAction: { label: 'Конкуренти', tab: 'analysis', url: row.url }
    });
  }

  const topPage = topPages.find(row => !isOnSeoMonitor(row));
  if (topPage) {
    const row = topPage;
    const label = row.label || seoActionUrlLabel(row.url);
    const recommendations = professionalSeoRecommendations({ kind: 'gsc_top_page', row, url: row.url, label, products, measurement });
    add({
      type: 'gsc_top_page',
      actionId: seoActionId('top-page', row.url || label),
      priority: 'medium',
      title: `Перелити органічний попит: ${label}`,
      action: 'З топової органічної сторінки додати внутрішні переходи на 2-3 комерційні товари або набори.',
      why: `Ця сторінка вже приносить ${Number(row.clicks || 0).toLocaleString('uk')} кліків. Її задача — не тільки збирати трафік, а вести покупця до товару.`,
      expectedImpact: 'Підсилюємо не лише SEO, а й конверсію з уже наявного органічного трафіку.',
      pageLabel: label,
      url: row.url,
      metrics: row,
      recommendations,
      data: [
        `Кліки: ${Number(row.clicks || 0).toLocaleString('uk')}`,
        `Покази: ${Number(row.impressions || 0).toLocaleString('uk')}`,
        `CTR: ${seoCtrLabel(row.ctr)}`
      ],
      steps: [
        'відкрити сторінку',
        'знайти місця для 2-3 природних внутрішніх посилань',
        'поставити посилання на товари/набори з попитом',
        'додати короткий блок “що обрати далі”',
        'перевірити, чи не зламалась структура сторінки'
      ],
      primaryAction: { label: 'Відкрити SEO workflow', tab: 'organic', url: row.url },
      secondaryAction: { label: 'Порівняти конкурентів', tab: 'analysis', url: row.url }
    });
  }

  const cache = readSeoAuditCache();
  const auditedProducts = Array.isArray(cache.productAudit?.products) ? cache.productAudit.products : [];
  const weakProducts = auditedProducts
    .filter(product => Array.isArray(product.issues) && product.issues.length)
    .filter(product => !isOnSeoMonitor(product))
    .sort((a, b) => Number(a.score || 100) - Number(b.score || 100))
    .slice(0, 2);

  for (const product of weakProducts) {
    const productUrl = product.routeUrl || product.url || '';
    const issues = (product.issues || []).slice(0, 4).map(issue => issue.message || issue.field || 'SEO issue').filter(Boolean);
    const recommendations = professionalSeoRecommendations({ kind: 'product_audit', product, url: productUrl, products, measurement });
    add({
      type: 'product_audit',
      actionId: seoActionId('product', productUrl || product.name),
      priority: (product.issues || []).some(issue => issue.severity === 'critical' || issue.severity === 'high') ? 'high' : 'medium',
      title: `Виправити SEO-поля товару: ${product.name || 'товар'}`,
      action: 'Скоротити title/meta, перевірити H1/опис/атрибути і зробити readback після публікації.',
      why: `OpenCart audit дав score ${Number(product.score || 0).toLocaleString('uk')}/100. Проблеми: ${issues.join(', ') || 'SEO-поля потребують перевірки'}.`,
      expectedImpact: 'Це швидка гігієна: прибираємо технічні слабкі місця до того, як масштабувати контент.',
      pageLabel: product.name || seoActionUrlLabel(productUrl),
      productName: product.name || '',
      url: productUrl,
      issues,
      recommendations,
      data: [
        `Score: ${Number(product.score || 0).toLocaleString('uk')}/100`,
        `Issues: ${issues.join('; ') || '-'}`,
        product.status === '0' ? 'Увага: товар вимкнений' : ''
      ].filter(Boolean),
      steps: [
        'відкрити товар у генерації картки',
        'імпортувати поточну картку з OpenCart',
        'виправити SEO title/meta description/H1',
        'опублікувати через OpenCart bridge',
        'зробити readback і переконатися, що зміни записались'
      ],
      primaryAction: { label: 'Виправити картку', tab: 'generate', productName: product.name || '', url: productUrl },
      secondaryAction: { label: 'Конкуренти', tab: 'analysis', productName: product.name || '', url: productUrl }
    });
  }

  if (!actions.length && products.length) {
    const product = products[0];
    const recommendations = professionalSeoRecommendations({ kind: 'product_focus', product, label: product.name, products, measurement });
    add({
      type: 'product_focus',
      actionId: seoActionId('focus', product.name),
      priority: 'medium',
      title: `Провести SEO-loop для товару з попитом: ${product.name}`,
      action: 'Зібрати SEO-пакет, опублікувати в OpenCart і зробити readback.',
      why: `Поки GSC не дав сильних сторінкових сигналів, найкраща SEO-дія — товар, який уже купують: ${Number(product.count || 0).toLocaleString('uk')} продажів у вибірці.`,
      expectedImpact: 'Підсилюємо сторінку, де вже є попит і яку потім можна використати в email/retention.',
      pageLabel: product.name,
      productName: product.name,
      recommendations,
      data: [
        `Продажів у вибірці: ${Number(product.count || 0).toLocaleString('uk')}`,
        `Орієнтовний попит: ${Math.round(Number(product.demandValue || 0)).toLocaleString('uk')} грн`
      ],
      steps: [
        'відкрити товар у генерації',
        'підтягнути поточну картку з OpenCart',
        'оновити SEO-пакет',
        'опублікувати і перевірити readback'
      ],
      primaryAction: { label: 'Зібрати SEO-пакет', tab: 'generate', productName: product.name },
      secondaryAction: { label: 'Порівняти конкурентів', tab: 'analysis', productName: product.name }
    });
  }

  return actions.slice(0, 6);
}

app.get('/seo/sitemap', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 2000));
    const sitemapUrl = req.query.url || defaultSitemapUrl();
    const urls = await collectSitemapUrls({ sitemapUrl, limit });
    res.json({ ok: true, sitemapUrl, count: urls.length, urls });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/seo/audit', (req, res) => {
  res.json({ ok: true, measurement: seoMeasurementSnapshot(), cache: readSeoAuditCache() });
});

app.get('/api/seo-center', (req, res) => {
  try {
    const siteId = String(req.query.siteId || 'mercato').trim().toLowerCase();
    res.json(seoCenterRuntime.dashboard(siteId));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/seo-center/jobs/:id', (req, res) => {
  const job = seoCenterRuntime.job(String(req.params.id || ''));
  if (!job) return res.status(404).json({ error: 'SEO-аудит не знайдено.' });
  res.json({ ok: true, job });
});

app.post('/api/seo-center/audits', (req, res) => {
  try {
    const { siteId = 'mercato', mode = 'full', target = '' } = req.body || {};
    const job = seoCenterRuntime.startAudit({ siteId, mode, target });
    res.status(202).json({
      ok: true,
      job,
      message: 'Read-only SEO-аудит запущено. Live-сайт не змінюється.'
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      job: error.job || null
    });
  }
});

app.post('/api/seo-center/weekly', (req, res) => {
  try {
    const siteId = String(req.body?.siteId || 'mercato').trim().toLowerCase();
    const profile = seoCenterRuntime.profile(siteId);
    const job = seoCenterRuntime.startAudit({
      siteId: profile.id,
      mode: 'weekly',
      target: profile.url
    });
    res.status(202).json({
      ok: true,
      job,
      message: `Щотижневий read-only аудит ${profile.name} запущено.`
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      job: error.job || null
    });
  }
});

app.post('/api/seo-center/intelligence-refresh', async (req, res) => {
  try {
    const siteId = String(req.body?.siteId || 'mercato').trim().toLowerCase();
    const fetchDocs = req.body?.fetchDocs !== false;
    const report = await seoCenterRuntime.refreshIntelligence({ siteId, fetchDocs });
    res.json({
      ok: true,
      report,
      message: report.liveDocs
        ? `Оновлено ${report.sourceCount} офіційних SEO/AI джерел. Змін у документації: ${report.changedCount}.`
        : `Збережено rules baseline без live-fetch. Потрібні джерела: ${report.sourceCount}.`
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post('/api/seo-center/control-scan', async (req, res) => {
  try {
    const siteId = String(req.body?.siteId || 'mercato').trim().toLowerCase();
    if (siteId !== 'mercato') {
      return res.status(400).json({
        error: 'Повний write inventory зараз підключений до OpenCart Mercato. Для Prom3D потрібен окремий deploy adapter до репозиторію сайту.',
        code: 'SEO_WRITE_ADAPTER_NOT_CONFIGURED'
      });
    }
    const liveBridge = await callBridge('version', {}, { timeoutMs: MERCHANT_BRIDGE_TIMEOUT_MS });
    if (bridgeMajorVersion(liveBridge.version) < 32 || !(Array.isArray(liveBridge.features) ? liveBridge.features : []).includes('seo_control_inventory')) {
      return res.status(409).json({
        error: `Live bridge ${liveBridge.version || 'невідомої версії'} не віддає повний SEO inventory. Завантажте bridge v35.`,
        code: 'SEO_CONTROL_BRIDGE_UPDATE_REQUIRED',
        liveBridge
      });
    }
    const inventory = await callBridge('seo_inventory', {}, { timeoutMs: MERCHANT_BRIDGE_TIMEOUT_MS });
    const plan = buildSeoControlPlan(inventory);
    const saved = seoCenterRuntime.saveControlPlan({ siteId, plan });
    res.json({
      ok: true,
      plan: saved,
      message: `SEO control scan прочитав ${plan.inventorySummary.entities} сутностей і ${plan.inventorySummary.files} технічних файлів. Підготовлено ${plan.summary.executable} точних patches; запис не виконувався.`
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: explainBridgeError(error), raw: error.message });
  }
});

app.get('/api/seo-center/file', async (req, res) => {
  try {
    const siteId = String(req.query.siteId || 'mercato').trim().toLowerCase();
    if (siteId !== 'mercato') return res.status(400).json({ error: 'File adapter для цього сайту не налаштований.' });
    const data = await callBridge('seo_file_read', { file: String(req.query.path || '') });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: explainBridgeError(error), raw: error.message });
  }
});

function seoCandidateFiles(controlPlan = {}, category = '', target = '') {
  const files = (Array.isArray(controlPlan.files) ? controlPlan.files : []).filter(file => file.size <= 180000 && file.writable);
  const scores = file => {
    const filePath = String(file.path || '').toLowerCase();
    let score = file.exists ? 2 : 0;
    if (category === 'performance' && /\.(twig|css|js)$/.test(filePath)) score += 10;
    if (category === 'schema' && /(header|product|category).*\.(php|twig)$/.test(filePath)) score += 12;
    if (category === 'indexation' && /(\.htaccess|robots\.txt|seo_url\.php|header\.php)/.test(filePath)) score += 12;
    if (category === 'geo' && /(llms\.txt|robots\.txt|home\.twig|header\.twig)/.test(filePath)) score += 12;
    if (category === 'technical' && /\.(php|twig|htaccess)$/.test(filePath)) score += 8;
    if (/product/.test(String(target).toLowerCase()) && /product\.(twig|php)$/.test(filePath)) score += 4;
    return score;
  };
  return files
    .map(file => ({ ...file, score: scores(file) }))
    .filter(file => file.score > 2)
    .sort((left, right) => right.score - left.score || left.size - right.size)
    .slice(0, 5);
}

async function seoAgentDraftEntity(action, controlPlan) {
  let entity = (Array.isArray(controlPlan.entityIndex) ? controlPlan.entityIndex : []).find(item =>
    item.type === action.entityType && Number(item.id) === Number(action.entityId)
  );
  if (!entity) {
    const normalizedTarget = String(action.target || '').replace(/\/+$/, '');
    entity = (Array.isArray(controlPlan.entityIndex) ? controlPlan.entityIndex : []).find(item => String(item.url || '').replace(/\/+$/, '') === normalizedTarget);
  }
  if (!entity) throw new Error('Agent не зміг зіставити задачу з OpenCart сутністю. Спочатку запустіть новий control scan.');
  const read = await readSeoControlTarget({
    target: entity.url,
    entityType: entity.type,
    entityId: entity.id
  });
  const snapshot = {
    type: entity.type,
    entityType: entity.type,
    name: entity.name || '',
    ...(read.snapshot || {})
  };
  const currentDescription = String(snapshot.description || '');
  const managedBlocks = currentDescription.match(/<!--\s*MERCATO_AI_[A-Z0-9_]+_START\s*-->[\s\S]*?<!--\s*MERCATO_AI_[A-Z0-9_]+_END\s*-->/g) || [];
  const visibleDescription = managedBlocks.reduce((html, block) => html.replace(block, ''), currentDescription).trim();
  const linkTargets = seoEntityLinkTargets(controlPlan, entity, action.category);
  if (action.category === 'internal_links') {
    return seoBuildInternalLinksDraft({
      action,
      entity,
      snapshot,
      visibleDescription,
      managedBlocks,
      linkTargets
    });
  }
  const message = await createAiMessage({
    model: OPENAI_MAIN_MODEL,
    max_tokens: 12000,
    fallback: true,
    system: `Ти — SEO execution agent для OpenCart Mercato.
Ти готуєш ОДИН точний patch після прочитання фактичного стану.
Не вигадуй факти, характеристики, відгуки, рейтинги, ціни, гарантії чи доставку.
	Не вставляй службові слова SEO, AI, GSC, brief, agent у видимий текст.
	Для category/information description не вставляй H1: H1 керується шаблоном OpenCart; використовуй H2/H3.
	Збережи корисні факти поточного HTML. Не створюй FAQ schema або HowTo.
	Для внутрішніх посилань використовуй лише URL зі списку allowedTargets.
	Для internal_links не додавай href до конкретної назви сорту/товару, якщо цільовий URL явно не відповідає цій назві.
	Краще додати короткий блок "Корисні розділи" з 2-3 внутрішніми посиланнями, використовуючи назви allowedTargets як анкори.
	Поверни тільки валідний JSON.`,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        task: {
          id: action.id,
          agent: action.agent,
          category: action.category,
          issue: action.issue,
          impact: action.impact,
          target: action.target,
          recommendedAction: action.recommendedAction
        },
        entity: {
          type: entity.type,
          id: entity.id,
          url: entity.url,
          name: snapshot.name,
          meta_title: snapshot.meta_title,
          meta_description: snapshot.meta_description,
          meta_h1: snapshot.meta_h1,
          description: visibleDescription,
          attributes: snapshot.attributes || {}
        },
        allowedTargets: linkTargets,
        responseSchema: {
          field: 'description',
          after: 'повний готовий HTML опису',
          reason: 'коротко що змінено',
          verification: 'що перевірити після запису'
        }
      })
    }]
  });
  const draft = await parseAiJson(message.content[0].text.trim(), 'SEO entity agent draft');
  const draftField = String(draft.field || draft.targetField || 'description').trim().toLowerCase();
  if (!['description', 'description_html', 'content', 'html', 'internal_links'].includes(draftField)) {
    throw new Error('Entity agent може змінювати лише description HTML через цей workflow.');
  }
  const visibleAfter = String(draft.after || draft.description || draft.description_html || draft.html || draft.content || '').trim();
  if (!visibleAfter || visibleAfter === visibleDescription) throw new Error('Agent не створив корисного description diff.');
  if (visibleAfter.length > 80000 || /<script\b|<iframe\b|javascript:/i.test(visibleAfter)) throw new Error('Agent draft не пройшов HTML safety gate.');
  validateSeoEntityDraft({ action, before: visibleDescription, after: visibleAfter, allowedTargets: linkTargets });
  const preservedManagedBlocks = managedBlocks.filter(block =>
    action.category !== 'content' || !/MERCATO_AI_INTERNAL_LINKS/i.test(String(block || ''))
  );
  const after = `${visibleAfter}${preservedManagedBlocks.length ? `\n${preservedManagedBlocks.join('\n')}` : ''}`.trim();
  const syntheticAction = {
    ...action,
    id: `seo-agent-draft-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    sourceActionId: action.sourceActionId || action.originalActionId || action.id || '',
    execution: 'automatic_after_approval',
    executor: 'entity_patch',
    entityType: entity.type,
    entityId: entity.id,
    field: 'description',
    after,
    note: draft.reason || 'Agent підготував точний HTML diff після читання поточної сутності.',
    verification: draft.verification || action.verification
  };
  return {
    action: syntheticAction,
    change: controlChangeFromAction(syntheticAction, snapshot)
  };
}

function seoBuildInternalLinksDraft({
  action = {},
  entity = {},
  snapshot = {},
  visibleDescription = '',
  managedBlocks = [],
  linkTargets = []
} = {}) {
  if (String(entity.type || action.entityType || '') === 'product') {
    throw new Error('Internal Linking Agent заблоковано для товарних описів: перелінковку товарів треба робити через UX/шаблонні блоки, а не через поле description.');
  }
  const existing = stripSeoInternalLinksBlock(String(visibleDescription || '')).trim();
  const existingPlain = seoVisibleDescriptionPlain(existing);
  if (existingPlain.length < 350) {
    throw new Error('Internal Linking Agent заблоковано: на сторінці замало фактичного опису для перелінковки. Спочатку Content Quality Agent має відновити/написати корисний опис.');
  }
  const existingUrls = new Set(extractHtmlAnchors(decodeSeoHtmlForAnchorScan(existing)).map(anchor => anchor.href).filter(Boolean));
  const selected = (linkTargets || [])
    .filter(item => item.url && !existingUrls.has(normalizeSeoHref(item.url)))
    .slice(0, 3);
  if (selected.length < 2) {
    throw new Error('Internal Linking Agent не має достатньо релевантних allowedTargets для якісного patch.');
  }
  const rawBlock = [
    '<!-- MERCATO_AI_INTERNAL_LINKS_START -->',
    '<hr>',
    '<h4><font face="Verdana">Корисні розділи Mercato</font></h4>',
    '<ul>',
    ...selected.map(item => {
      const label = stripAnchorText(item.name || item.url || 'Розділ Mercato');
      return `<li><font face="Verdana"><a href="${escapeHtmlAttr(normalizeSeoHref(item.url))}">${escapeHtml(label)}</a></font></li>`;
    }),
    '</ul>',
    '<!-- MERCATO_AI_INTERNAL_LINKS_END -->'
  ].join('\n');
  validateSeoEntityDraft({ action, before: existing, after: `${existing}\n\n${rawBlock}`.trim(), allowedTargets: linkTargets });
  const block = isSeoVisibleHtmlEscaped(existing) ? escapeSeoVisibleHtmlBlock(rawBlock) : rawBlock;
  const visibleAfter = `${existing}\n\n${block}`.trim();
  const preservedBlocks = (managedBlocks || []).filter(blockItem => !/MERCATO_AI_INTERNAL_LINKS/i.test(String(blockItem || '')));
  const after = `${visibleAfter}${preservedBlocks.length ? `\n${preservedBlocks.join('\n')}` : ''}`.trim();
  const syntheticAction = {
    ...action,
    id: `seo-agent-draft-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    sourceActionId: action.sourceActionId || action.originalActionId || action.id || '',
    execution: 'automatic_after_approval',
    executor: 'entity_patch',
    entityType: entity.type,
    entityId: entity.id,
    field: 'description',
    after,
    note: `Додано контрольований блок внутрішніх посилань на ${selected.map(item => item.name || item.url).join(', ')}.`,
    verification: 'Перевірити, що посилання ведуть на HTTP 200 сторінки Mercato, блок відображається коректно і не дублює існуючу навігацію.'
  };
  return {
    action: syntheticAction,
    change: controlChangeFromAction(syntheticAction, snapshot)
  };
}

function seoEntityLinkTargets(controlPlan = {}, sourceEntity = {}, category = '') {
  const sourceUrl = String(sourceEntity.url || '').replace(/\/+$/, '');
  const sourceType = String(sourceEntity.type || '');
  const ecommerceUrl = /(kava-v-zernah|kava-nabory|kava-dnipro|kava-korporativny|kupit-kava|kavyarnya|arabika|blendy|espresso|filter|decaf)/i;
  const weakUrl = /(privacy|konfidencial|oplata|dostavka|success|return|checkout|cart|account|affiliate|voucher|telegram|coupon|kupon|blog|ua-)/i;
  return (Array.isArray(controlPlan.entityIndex) ? controlPlan.entityIndex : [])
    .filter(item => item.url && String(item.url || '').replace(/\/+$/, '') !== sourceUrl)
    .map(item => {
      const url = String(item.url || '');
      const name = String(item.name || '');
      let score = 0;
      if (item.type === 'category') score += 140;
      if (item.type === 'product') score += sourceType === 'category' ? 85 : 55;
      if (item.type === 'information') score += 20;
      if (ecommerceUrl.test(url) || /кава|coffee|espresso|arabica|арабіка|бленд/i.test(name)) score += 180;
      if (/kava-v-zernah|kava-nabory|kava-dnipro/i.test(url)) score += 120;
      if (category === 'internal_links' && item.type === 'category') score += 70;
      if (weakUrl.test(url)) score -= 260;
      return { item, score };
    })
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score || String(left.item.url || '').localeCompare(String(right.item.url || '')))
    .slice(0, 18)
    .map(({ item }) => ({ type: item.type, name: item.name, url: item.url }));
}

function normalizeSeoHref(value = '') {
  try {
    const url = new URL(String(value || ''), 'https://mercato.com.ua');
    return `${url.origin}${url.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return String(value || '').replace(/\/+$/, '');
  }
}

function isUtilitySeoTarget(value = '') {
  return /\/(?:a-telegram|bonusna-prohrama|obgortka|privacy|konfidencial|oplata|dostavka|return|checkout|cart|account|affiliate|voucher|coupon|kupon)(?:$|\/)/i.test(normalizeSeoHref(value));
}

const SEO_AGENT_DRAFT_BATCH_DEFAULT = 10;
const SEO_AGENT_DRAFT_BATCH_MAX = 50;
const SEO_AGENT_DRAFT_ITEM_TIMEOUT_MS = 25000;
const SEO_AGENT_DRAFT_CATEGORY_MINIMUMS = {
  internal_links: 2,
  content: 3,
  schema: 2,
  indexation: 2,
  technical: 2,
  performance: 2,
  geo: 1,
  on_page: 6,
  images: 1,
  other: 2
};
const SEO_AGENT_DRAFT_CATEGORY_RATIOS = {
  internal_links: 0.18,
  content: 0.28,
  schema: 0.18,
  indexation: 0.18,
  technical: 0.18,
  performance: 0.18,
  geo: 0.1,
  on_page: 0.55,
  images: 0.08,
  other: 0.12
};

function seoAgentDraftCategoryLimit(category = 'other', limit = SEO_AGENT_DRAFT_BATCH_DEFAULT, requested = false) {
  if (requested) return Number.POSITIVE_INFINITY;
  const normalizedCategory = String(category || 'other');
  const safeLimit = Math.max(1, Math.min(Number(limit || SEO_AGENT_DRAFT_BATCH_DEFAULT), SEO_AGENT_DRAFT_BATCH_MAX));
  const minimum = SEO_AGENT_DRAFT_CATEGORY_MINIMUMS[normalizedCategory] || SEO_AGENT_DRAFT_CATEGORY_MINIMUMS.other;
  const ratio = SEO_AGENT_DRAFT_CATEGORY_RATIOS[normalizedCategory] || SEO_AGENT_DRAFT_CATEGORY_RATIOS.other;
  return Math.min(safeLimit, Math.max(minimum, Math.ceil(safeLimit * ratio)));
}

function seoDraftWithTimeout(candidate, controlPlan) {
  return Promise.race([
    seoDraftActionForPreview(candidate, controlPlan),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Agent draft timeout після ${Math.round(SEO_AGENT_DRAFT_ITEM_TIMEOUT_MS / 1000)}с. Запустіть цю сторінку окремо або зменшіть batch.`));
      }, SEO_AGENT_DRAFT_ITEM_TIMEOUT_MS);
    })
  ]);
}

function seoAgentDraftEntityKey(action = {}) {
  if (action.category === 'on_page' && action.entityType && action.entityId) {
    return `${action.entityType}:${action.entityId}:${action.field || action.task || 'on_page'}`;
  }
  if (action.entityType && action.entityId) return `${action.entityType}:${action.entityId}`;
  if (action.file) return `file:${action.file}`;
  return `target:${normalizeSeoHref(action.target || action.id || '')}`;
}

function seoLikelyInternalLinksBatchBlocker(action = {}, controlPlan = {}) {
  if (action.category !== 'internal_links') return '';
  const entity = seoFindControlEntity(controlPlan, action);
  if (!entity) return 'немає OpenCart entity readback для безпечної перелінковки';
  if (String(entity.type || action.entityType || '') === 'product') {
    return 'товарні описи не можна масово змінювати internal-links блоками; це має бути UX/шаблон або товарний контент';
  }
  let visibleLength = Number(entity.visibleDescriptionLength || entity.descriptionLength || 0);
  if (!visibleLength) {
    visibleLength = seoVisibleDescriptionPlain(
      entity.descriptionPreview
      || entity.description
      || entity.description_html
      || entity.html
      || ''
    ).length;
  }
  if (visibleLength > 0 && visibleLength < 350) {
    return 'у сторінки замало фактичного опису; спочатку потрібен Content Quality patch, а не блок лінків';
  }
  return '';
}

function seoCanAgentDraftAction(action = {}, { batch = false, controlPlan = null } = {}) {
  const supportedCategories = ['technical', 'performance', 'indexation', 'schema', 'geo', 'content', 'internal_links', 'on_page'];
  const supportedExecutions = ['manual', 'editor_after_evidence', 'code_patch_after_approval', 'file_editor_after_review'];
  if (!action || !action.id) return false;
  if (['verification_pending', 'verification_review'].includes(action.status)) return false;
  if (action.execution === 'automatic_after_approval' || action.execution === 'capability_only') return false;
  if (!supportedExecutions.includes(action.execution || 'manual')) return false;
  if (!supportedCategories.includes(action.category || '')) return false;
  if (['content', 'internal_links'].includes(action.category || '') && isUtilitySeoTarget(action.target)) return false;
  const hasEntityReadback = Boolean(action.entityType && action.entityId);
  const hasExplicitFileTarget = Boolean(action.file || /(?:robots\.txt|llms\.txt|\.htaccess|catalog\/|system\/)/i.test(String(action.target || '')));
  if (action.auditJobId && !hasEntityReadback && !hasExplicitFileTarget) return false;
  if (batch && action.category === 'images') return false;
  if (batch && controlPlan && seoLikelyInternalLinksBatchBlocker(action, controlPlan)) return false;
  return true;
}

function seoGoogleSnapshotForServer(dashboard = {}) {
  const cacheMetrics = dashboard.googleDataStatus?.cache?.metrics || {};
  const snapshot = dashboard.googleDataStatus?.snapshot || {};
  return {
    gscTopPages: snapshot.gsc?.topPages || cacheMetrics.gsc_snapshot?.topPages || [],
    ga4TopPages: snapshot.ga4?.topPages || cacheMetrics.ga4_snapshot?.topPages || []
  };
}

function seoAgentDraftActionScore(action = {}, dashboard = {}) {
  const priorityScore = { critical: 1000, important: 600, later: 100 }[action.priority] || 0;
  const target = normalizeSeoHref(action.target || '');
  const snapshot = seoGoogleSnapshotForServer(dashboard);
  let score = priorityScore;
  for (const [index, row] of (snapshot.gscTopPages || []).entries()) {
    const page = normalizeSeoHref(row.page || row.keys?.[0] || '');
    if (page !== target) continue;
    score += 650 - (index * 20);
    score += Number(row.clicks || 0) * 20;
    score += Number(row.impressions || 0) / 20;
    score += Math.max(0, 30 - Number(row.position || 30)) * 5;
  }
  for (const [index, row] of (snapshot.ga4TopPages || []).entries()) {
    const landing = String(row.landing_page || row.page || '');
    const page = normalizeSeoHref(landing.startsWith('http') ? landing : `https://mercato.com.ua${landing.startsWith('/') ? landing : `/${landing}`}`);
    if (page !== target) continue;
    score += 500 - (index * 20);
    score += Number(row.sessions || 0) * 25;
    score += Number(row.pageviews || 0) * 3;
    score += Number(row.engagement_rate || 0);
  }
  if (action.entityType === 'category') score += 420;
  if (action.entityType === 'product') score += 260;
  if (action.entityType === 'information') score += 60;
  if (/\/(?:arabika-kava|blendy-kava|kava-v-zernah|kava-nabory|kava-dnipro|kava-korporativny|kupit-kava|kavyarnya)/i.test(target)) score += 420;
  if (/\/(?:kava-v-zernah|kava-nabory|kava-dnipro|kava-korporativny|kupit-kava|kavyarnya)/i.test(target)) score += 180;
  if (action.category === 'on_page') score += 520;
  if (action.category === 'internal_links') score += 360;
  if (isUtilitySeoTarget(target)) score -= 1200;
  return score;
}

function seoAgentDateValue(value = '') {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : 0;
}

function seoOnPageTaskFromIssue(issue = '') {
  const text = String(issue || '').toLowerCase();
  if (/title tag|meta title|seo title|тайтл/.test(text)) return 'meta_title';
  if (/meta description|мета description|мета опис/.test(text)) return 'meta_description';
  if (/(?:0 h1|exposes 0 h1|missing h1|немає h1|primary heading|one clear primary heading|meta h1)/.test(text)) return 'meta_h1';
  return '';
}

function seoSyntheticOnPageCandidateId(entity = {}, field = '', sourceAction = {}, job = {}) {
  const seed = JSON.stringify({
    type: entity.type,
    id: entity.id,
    field,
    issue: sourceAction.issue || '',
    target: normalizeSeoHref(entity.url || sourceAction.target || job.target || '')
  });
  return `seo-agent-onpage-candidate-${crypto.createHash('sha1').update(seed).digest('hex').slice(0, 12)}`;
}

function seoSyntheticOnPageDraftCandidates({ siteId = 'mercato', controlPlan = {} } = {}) {
  const state = seoCenterRuntime.readState();
  const jobs = (Array.isArray(state.jobs) ? state.jobs : [])
    .filter(job => job?.siteId === siteId && job.status === 'completed')
    .sort((left, right) =>
      seoAgentDateValue(right.completedAt || right.updatedAt || right.createdAt || right.startedAt)
      - seoAgentDateValue(left.completedAt || left.updatedAt || left.createdAt || left.startedAt)
    );
  const candidates = [];
  const seenJobTargets = new Set();
  const seenEntityFields = new Set();
  for (const job of jobs) {
    const jobTarget = normalizeSeoHref(job.target || '');
    if (!jobTarget || seenJobTargets.has(jobTarget) || isUtilitySeoTarget(jobTarget)) continue;
    seenJobTargets.add(jobTarget);
    const entity = seoFindControlEntity(controlPlan, { target: jobTarget });
    if (!entity || !['product', 'category', 'information'].includes(entity.type)) continue;
    const actions = Array.isArray(job.summary?.actionPlan) ? job.summary.actionPlan : [];
    for (const sourceAction of actions) {
      const field = seoOnPageTaskFromIssue(sourceAction.issue || sourceAction.recommendedAction || '');
      if (!field) continue;
      const entityFieldKey = `${entity.type}:${entity.id}:${field}`;
      if (seenEntityFields.has(entityFieldKey)) continue;
      seenEntityFields.add(entityFieldKey);
      candidates.push({
        ...sourceAction,
        id: seoSyntheticOnPageCandidateId(entity, field, sourceAction, job),
        sourceActionId: sourceAction.id || '',
        originalActionId: sourceAction.id || '',
        stableActionKey: entityFieldKey,
        siteId,
        mode: job.mode || sourceAction.mode || 'page',
        target: entity.url || jobTarget,
        scope: entity.type,
        priority: sourceAction.priority || 'important',
        category: 'on_page',
        agent: 'On-page Agent',
        issue: sourceAction.issue || `${field} потребує перевіреного on-page diff.`,
        impact: sourceAction.impact || 'CTR, релевантність сторінки та зрозумілий SERP snippet.',
        recommendedAction: sourceAction.recommendedAction || 'Підготувати точний diff для title, meta description або H1 без переписування опису сторінки.',
        verification: sourceAction.verification || 'Readback OpenCart, повторний page audit і контроль CTR/позиції через 7–14 днів.',
        verificationRequired: true,
        execution: 'editor_after_evidence',
        task: field,
        field,
        entityType: entity.type,
        entityId: Number(entity.id || 0),
        auditJobId: job.id || sourceAction.auditJobId || '',
        generatedFrom: 'page_audit_on_page_adapter'
      });
    }
  }
  return candidates;
}

function seoAgentDraftBatchCandidates({ siteId = 'mercato', limit = SEO_AGENT_DRAFT_BATCH_DEFAULT, actionIds = [] } = {}) {
  const dashboard = seoCenterRuntime.dashboard(siteId);
  const controlPlan = dashboard.controlPlan || seoCenterRuntime.controlPlan(siteId) || {};
  const queue = dashboard.fixQueue || {};
  const requested = new Set((actionIds || []).map(String).filter(Boolean));
  const seenIds = new Set();
  const candidates = [
    ...seoSyntheticOnPageDraftCandidates({ siteId, controlPlan }),
    ...(queue.proposals || []),
    ...(queue.tasks || []),
    ...(queue.items || [])
  ]
    .filter(action => {
      if (!action?.id || seenIds.has(action.id)) return false;
      seenIds.add(action.id);
      if (requested.size && !requested.has(action.id)) return false;
      return seoCanAgentDraftAction(action, { batch: !requested.size, controlPlan });
    })
    .sort((left, right) =>
      seoAgentDraftActionScore(right, dashboard) - seoAgentDraftActionScore(left, dashboard)
      || String(left.target || '').localeCompare(String(right.target || ''))
    );
  const max = Math.max(1, Math.min(Number(limit || SEO_AGENT_DRAFT_BATCH_DEFAULT), SEO_AGENT_DRAFT_BATCH_MAX));
  const candidatePoolMax = requested.size ? max : Math.min(SEO_AGENT_DRAFT_BATCH_MAX, Math.max(max, max * 4));
  const selected = [];
  const entityKeys = new Set();
  const categoryCounts = new Map();
  for (const action of candidates) {
    const key = seoAgentDraftEntityKey(action);
    if (entityKeys.has(key)) continue;
    if (!requested.size) {
      const category = String(action.category || 'other');
      const cap = seoAgentDraftCategoryLimit(category, candidatePoolMax, requested.size > 0);
      if ((categoryCounts.get(category) || 0) >= cap) continue;
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    }
    entityKeys.add(key);
    selected.push(action);
    if (selected.length >= candidatePoolMax) break;
  }
  return selected;
}

function seoActiveFixPreview(siteId = 'mercato') {
  return seoCenterRuntime.readState().fixPreviews.find(item =>
    item.siteId === siteId && ['pending_approval', 'approved', 'applying'].includes(item.status)
  ) || null;
}

function assertSeoGrowthUnlocked(siteId = 'mercato') {
  const recoveryMode = seoCenterRuntime.recoveryMode(siteId);
  if (recoveryMode.locked) {
    const error = new Error(recoveryMode.reason);
    error.status = 423;
    error.recoveryMode = recoveryMode;
    throw error;
  }
  return recoveryMode;
}

function stripAnchorText(value = '') {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHtmlAnchors(html = '') {
  const anchors = [];
  const pattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(String(html || '')))) {
    const attrs = match[1] || '';
    const href = (attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i) || [])[1] || '';
    anchors.push({
      href: normalizeSeoHref(href),
      text: stripAnchorText(match[2] || '')
    });
  }
  return anchors;
}

function stripSeoInternalLinksBlock(html = '') {
  return String(html || '')
    .replace(/<!--\s*MERCATO_AI_INTERNAL_LINKS_START\s*-->[\s\S]*?<!--\s*MERCATO_AI_INTERNAL_LINKS_END\s*-->/gi, '')
    .replace(/&lt;!--\s*MERCATO_AI_INTERNAL_LINKS_START\s*--&gt;[\s\S]*?&lt;!--\s*MERCATO_AI_INTERNAL_LINKS_END\s*--&gt;/gi, '')
    .trim();
}

function seoVisibleDescriptionPlain(html = '') {
  return stripHtml(decodeSeoHtmlForAnchorScan(stripSeoInternalLinksBlock(html)))
    .replace(/\s+/g, ' ')
    .trim();
}

function isSeoVisibleHtmlEscaped(html = '') {
  const sample = String(html || '').slice(0, 60000);
  const tagPattern = '(?:meta|title|style|header|section|h[1-6]|p|ul|ol|li|a|br|div|span|font|strong|em|hr)';
  const escapedTags = (sample.match(new RegExp(`&lt;/?${tagPattern}\\b`, 'gi')) || []).length;
  const rawTags = (sample.match(new RegExp(`</?${tagPattern}\\b`, 'gi')) || []).length;
  return escapedTags > rawTags;
}

function escapeSeoVisibleHtmlBlock(html = '') {
  return String(html || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function decodeSeoHtmlForAnchorScan(html = '') {
  return String(html || '')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
}

function validateSeoEntityDraft({ action = {}, before = '', after = '', allowedTargets = [] } = {}) {
  const category = String(action.category || '');
  if (!['content', 'internal_links'].includes(category)) return;
  const decodedAfter = decodeSeoHtmlForAnchorScan(after);
  if (/<(?:html|head|body|meta|title|style)\b/i.test(decodedAfter)) {
    throw new Error(`${category === 'content' ? 'Content draft' : 'Internal links draft'} заблоковано: description не має містити повний HTML-документ, meta/title/style або CSS.`);
  }
  if (category === 'content' && /<h1\b/i.test(decodedAfter)) {
    throw new Error('Content Quality Agent заблоковано: description не має вставляти H1, бо H1 керується шаблоном OpenCart.');
  }
  const allowed = new Set((allowedTargets || []).map(item => normalizeSeoHref(item.url)).filter(Boolean));
  const beforeAnchorKeys = new Set(extractHtmlAnchors(decodeSeoHtmlForAnchorScan(before)).map(anchor => `${anchor.href}|${anchor.text.toLowerCase()}`));
  const added = extractHtmlAnchors(decodeSeoHtmlForAnchorScan(after)).filter(anchor =>
    anchor.href && !beforeAnchorKeys.has(`${anchor.href}|${anchor.text.toLowerCase()}`)
  );
  const mismatchRules = [
    { text: /(ethiopia|yirgacheffe|ефіоп)/i, href: /(ethiopia|efiop|yirgacheffe)/i, label: 'Ethiopia / Yirgacheffe' },
    { text: /(colombia|supremo|колумб)/i, href: /(colombia|kolumb|supremo)/i, label: 'Colombia / Supremo' },
    { text: /(brazil|brasil|santos|бразил)/i, href: /(brazil|brasil|santos)/i, label: 'Brazil / Santos' },
    { text: /(burundi|kayanza|бурунд)/i, href: /(burundi|kayanza)/i, label: 'Burundi / Kayanza' }
  ];
  for (const anchor of added) {
    if (!allowed.has(anchor.href)) {
      throw new Error(`${category === 'content' ? 'Content draft' : 'Internal links draft'} містить URL поза allowedTargets: ${anchor.href}`);
    }
    for (const rule of mismatchRules) {
      if (rule.text.test(anchor.text) && !rule.href.test(anchor.href)) {
        throw new Error(`Internal links draft лінкує "${rule.label}" на нерелевантний URL: ${anchor.href}`);
      }
    }
  }
  if (category !== 'internal_links') return;
  const afterWithoutManagedLinks = seoVisibleDescriptionPlain(after);
  if (afterWithoutManagedLinks.length < 350) {
    throw new Error('Internal Linking Agent заблоковано: внутрішні посилання не можна додавати замість фактичного опису. Спочатку потрібен нормальний опис товару/сторінки.');
  }
}

function seoFindControlEntity(controlPlan = {}, action = {}) {
  const normalizedTarget = normalizeSeoHref(action.target || '');
  return (Array.isArray(controlPlan.entityIndex) ? controlPlan.entityIndex : []).find(item =>
    (action.entityType && item.type === action.entityType && Number(item.id) === Number(action.entityId))
    || normalizeSeoHref(item.url || '') === normalizedTarget
  ) || null;
}

function seoOnPageDraftField(action = {}) {
  const task = String(action.task || action.field || '').trim().toLowerCase();
  const issue = String(action.issue || '').toLowerCase();
  if (['meta_title', 'title'].includes(task) || /title tag|meta title|seo title|тайтл/.test(issue)) return 'meta_title';
  if (['meta_description', 'description_meta'].includes(task) || /meta description|мета description|мета опис/.test(issue)) return 'meta_description';
  if (['h1', 'meta_h1'].includes(task) || /(?:0 h1|exposes 0 h1|missing h1|немає h1|meta h1)/.test(issue)) return 'meta_h1';
  return '';
}

function seoSnippetText(value = '') {
  return plainOneLine(stripHtml(decodeSeoHtmlForAnchorScan(String(value || ''))))
    .replace(/\b(?:SEO|GSC|GA4|AI|agent|brief)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function seoOnPageEntityName(snapshot = {}) {
  return seoSnippetText(snapshot.name || snapshot.meta_h1 || snapshot.meta_title || 'Mercato');
}

function seoMetaTitleBase(name = '', snapshot = {}) {
  const cleanName = seoSnippetText(name || 'Mercato');
  const type = String(snapshot.type || snapshot.entityType || '').toLowerCase();
  const lowerName = cleanName.toLowerCase();
  if (type === 'category') {
    if (/horeca|ho\s*re\s*ca/i.test(cleanName)) return 'Кава HoReCa для ресторанів і офісів';
    if (/сироп|топінг|toping/i.test(lowerName)) return 'Сиропи для кави купити';
    if (/арабік|arabica/i.test(lowerName)) return 'Кава арабіка в зернах купити';
    if (/бленд|blend/i.test(lowerName)) return 'Бленди кави купити';
    if (/фермер/i.test(lowerName)) return 'Фермерська кава купити';
    if (/корпоратив|подар/i.test(lowerName)) return 'Подарункові набори кави для бізнесу';
    if (/корисн|статт/i.test(lowerName)) return 'Корисні статті про каву';
  }
  if (type === 'information') {
    if (/купити каву в зернах/i.test(lowerName)) return 'Кава в зернах купити онлайн';
    if (/подарунк/i.test(lowerName)) return 'Подарункові набори кави та чаю';
    if (/дніпр/i.test(lowerName)) return 'Кава в Дніпрі купити';
  }
  if (`${cleanName} | Mercato`.length >= 20) return cleanName;
  if (type === 'category') return /кава|чай/i.test(cleanName) ? cleanName : `${cleanName} для кави`;
  if (type === 'information') return /кава|чай|mercato/i.test(cleanName) ? cleanName : `${cleanName} про каву`;
  return `${cleanName} купити`;
}

function seoCleanSnippetLead(value = '') {
  return seoSnippetText(value || 'Mercato')
    .replace(/[.,:;!?]+$/u, '')
    .trim();
}

function seoFallbackMetaDescription(name = '', snapshot = {}) {
  const cleanName = seoCleanSnippetLead(name);
  const type = String(snapshot.type || snapshot.entityType || '').toLowerCase();
  if (type === 'category') {
    return `${cleanName} в Mercato: добірка кави та чаю, актуальні товари, зручне замовлення онлайн і доставка по Україні.`;
  }
  if (type === 'information') {
    return `${cleanName}: корисна інформація Mercato для вибору кави, чаю або подарунків і швидкий перехід до потрібних товарів.`;
  }
  return `${cleanName} в Mercato: характеристики, смаковий профіль, фасування та зручне замовлення онлайн з доставкою по Україні.`;
}

function seoMetaDescriptionFromDescription(name = '', description = '') {
  const cleanName = seoCleanSnippetLead(name);
  const cleanDescription = seoSnippetText(description);
  if (!cleanDescription) return '';
  const sentences = cleanDescription
    .split(/(?<=[.!?])\s+/u)
    .map(sentence => sentence.trim())
    .filter(Boolean);
  const firstUsefulSentence = sentences.find(sentence =>
    /[.!?]$/u.test(sentence)
    && sentence.length >= 45
    && sentence.length <= 145
  ) || '';
  if (!firstUsefulSentence) return '';
  if (firstUsefulSentence.toLowerCase().startsWith(cleanName.toLowerCase())) {
    const rest = firstUsefulSentence.slice(cleanName.length).replace(/^[-–—:.,;\s]+/u, '').trim();
    return rest ? `${cleanName}: ${rest}` : firstUsefulSentence;
  }
  const withName = `${cleanName}: ${firstUsefulSentence}`;
  return withName.length <= 155 ? withName : firstUsefulSentence;
}

function seoFinalizeMetaDescription(value = '') {
  let clean = trimSeoText(value, 155).replace(/\s+/g, ' ').trim();
  if (!clean) return clean;
  if (/[.!?]$/u.test(clean)) return clean;
  if (clean.length > 145) {
    clean = clean.replace(/\s+\S*$/u, '').trim();
  }
  clean = clean.replace(/[.,:;!?\s]+$/u, '').trim();
  return clean ? `${clean}.` : '';
}

function seoBuildOnPageValue(field = '', snapshot = {}) {
  const name = seoOnPageEntityName(snapshot);
  if (field === 'meta_title') {
    const suffix = ' | Mercato';
    const base = seoMetaTitleBase(name, snapshot);
    return trimSeoField(`${trimSeoField(base, 60 - suffix.length)}${suffix}`, 60);
  }
  if (field === 'meta_description') {
    const current = seoSnippetText(snapshot.meta_description || '');
    const description = seoSnippetText(snapshot.descriptionPreview || snapshot.description || '');
    const descriptionSeed = description ? seoMetaDescriptionFromDescription(name, description) : '';
    const seed = current && current.length >= 70
      ? current
      : descriptionSeed || seoFallbackMetaDescription(name, snapshot);
    return seoFinalizeMetaDescription(seed);
  }
  if (field === 'meta_h1') return trimSeoField(name, 90);
  throw new Error(`On-page agent не підтримує поле ${field || 'невідоме'}.`);
}

function seoValidateOnPageValue({ field = '', before = '', after = '' } = {}) {
  const cleanAfter = seoSnippetText(after);
  if (!cleanAfter) throw new Error('On-page agent не створив корисного значення.');
  if (cleanAfter !== String(after || '').trim()) throw new Error('On-page agent value містить HTML або службовий текст.');
  if (String(before || '').trim() === cleanAfter) throw new Error('On-page patch не створює корисної зміни.');
  if (/[\r\n<>]|(?:SEO|GSC|GA4|agent|brief)/i.test(cleanAfter)) throw new Error('On-page patch не пройшов safety gate.');
  if (field === 'meta_title' && (cleanAfter.length < 20 || cleanAfter.length > 65)) {
    throw new Error(`Meta title має бути приблизно 20–65 символів, зараз ${cleanAfter.length}.`);
  }
  if (field === 'meta_description' && (cleanAfter.length < 70 || cleanAfter.length > 170)) {
    throw new Error(`Meta description має бути приблизно 70–170 символів, зараз ${cleanAfter.length}.`);
  }
  if (field === 'meta_h1' && cleanAfter.length > 100) {
    throw new Error(`H1 має бути до 100 символів, зараз ${cleanAfter.length}.`);
  }
  return cleanAfter;
}

async function seoAgentDraftOnPage(action, controlPlan) {
  const entity = seoFindControlEntity(controlPlan, action);
  if (!entity) {
    throw new Error('On-page Agent не зміг зіставити URL з OpenCart сутністю. Натисніть “Перечитати SEO-контур”, потім повторіть diff.');
  }
  const read = await readSeoControlTarget({
    target: entity.url,
    entityType: entity.type,
    entityId: entity.id
  });
  const snapshot = {
    type: entity.type,
    entityType: entity.type,
    name: entity.name || '',
    ...(read.snapshot || {})
  };
  if (!snapshot.found) throw new Error('OpenCart не підтвердив сутність для on-page patch.');
  const field = seoOnPageDraftField(action);
  if (!field) throw new Error('On-page Agent підтримує тільки meta title, meta description або H1.');
  const before = field === 'meta_title'
    ? String(snapshot.meta_title || '')
    : field === 'meta_description'
      ? String(snapshot.meta_description || '')
      : String(snapshot.meta_h1 || '');
  const after = seoValidateOnPageValue({
    field,
    before,
    after: seoBuildOnPageValue(field, snapshot)
  });
  const label = field === 'meta_title' ? 'SEO title' : field === 'meta_description' ? 'meta description' : 'H1';
  const syntheticAction = {
    ...action,
    id: `seo-agent-onpage-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    sourceActionId: action.sourceActionId || action.originalActionId || action.id || '',
    execution: 'automatic_after_approval',
    executor: 'entity_patch',
    category: 'on_page',
    agent: action.agent || 'On-page Agent',
    entityType: entity.type,
    entityId: entity.id,
    target: entity.url,
    field,
    task: field,
    after,
    note: `On-page Agent підготував точний diff для ${label} без зміни HTML-опису сторінки.`,
    verification: action.verification || 'Readback OpenCart, повторний page audit і контроль CTR/позиції через 7–14 днів.'
  };
  return {
    action: syntheticAction,
    change: controlChangeFromAction(syntheticAction, snapshot)
  };
}

async function seoAgentDraftFile(action, controlPlan) {
  if (['content', 'internal_links'].includes(action.category)) {
    throw new Error('Контентні задачі та внутрішні посилання не можна перетворювати у footer/header file patch. Потрібна конкретна OpenCart сутність: товар, категорія або інформаційна сторінка з readback.');
  }
  const candidates = seoCandidateFiles(controlPlan, action.category, action.target);
  if (!candidates.length) throw new Error('Для цієї задачі немає доступного й writable SEO-файла в manifest.');
  const files = [];
  let totalBytes = 0;
  for (const candidate of candidates) {
    if (totalBytes >= 240000) break;
    const data = await callBridge('seo_file_read', { file: candidate.path });
    const file = data.file || {};
    if (String(file.content || '').length + totalBytes > 240000) continue;
    files.push(file);
    totalBytes += String(file.content || '').length;
  }
  if (!files.length) throw new Error('Agent не зміг прочитати жоден файл для patch.');
  const message = await createAiMessage({
    model: OPENAI_MAIN_MODEL,
    max_tokens: 16000,
    fallback: true,
    system: `Ти — senior technical SEO engineer для OpenCart.
Підготуй ОДИН мінімальний точний file patch для заявленої проблеми.
Не переписуй файл повністю без потреби. Не змінюй секрети, config, auth, database або admin.
Не прибирай існуючу функціональність. Не додавай зовнішні скрипти.
PHP/Twig/JS/CSS patch має бути синтаксично обережним і мати rollback через точний before hash.
Якщо доказів недостатньо, поверни safe=false і пояснення.
Поверни тільки валідний JSON.`,
    messages: [{
      role: 'user',
      content: JSON.stringify({
        task: {
          id: action.id,
          agent: action.agent,
          category: action.category,
          issue: action.issue,
          impact: action.impact,
          target: action.target,
          recommendedAction: action.recommendedAction
        },
        files: files.map(file => ({
          path: file.path,
          exists: file.exists,
          sha1: file.sha1,
          content: file.content
        })),
        responseSchema: {
          safe: true,
          file: 'точний path з files',
          search: 'точний фрагмент, який зустрічається один раз; порожній тільки для нового файла',
          replace: 'новий фрагмент',
          fullContent: 'використовувати тільки для нового файла',
          reason: 'чому цей patch виправляє проблему',
          verification: 'syntax/live/re-audit перевірки'
        }
      })
    }]
  });
  const draft = await parseAiJson(message.content[0].text.trim(), 'SEO file agent draft');
  if (draft.safe !== true) throw new Error(draft.reason || 'Agent вважає file patch недостатньо підтвердженим.');
  const file = files.find(item => item.path === draft.file);
  if (!file) throw new Error('Agent вибрав файл поза прочитаним allowlist.');
  const beforeContent = String(file.content || '');
  const search = String(draft.search || '');
  let afterContent = '';
  if (!file.exists) {
    afterContent = String(draft.fullContent || draft.replace || '');
  } else {
    if (!search) throw new Error('Для існуючого файла потрібен точний search fragment.');
    const occurrences = beforeContent.split(search).length - 1;
    if (occurrences !== 1) throw new Error(`Search fragment має зустрічатися один раз, знайдено ${occurrences}.`);
    afterContent = beforeContent.replace(search, String(draft.replace ?? ''));
  }
  if (!afterContent || afterContent === beforeContent) throw new Error('Agent не створив корисного file diff.');
  const syntheticAction = {
    ...action,
    id: `seo-agent-file-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    sourceActionId: action.sourceActionId || action.originalActionId || action.id || '',
    execution: 'automatic_after_approval',
    executor: 'file_patch',
    field: 'content',
    target: file.path,
    file: file.path,
    after: afterContent,
    note: draft.reason || 'Technical agent підготував мінімальний file patch.',
    verification: draft.verification || action.verification
  };
  return {
    action: syntheticAction,
    change: {
      actionId: syntheticAction.id,
      sourceActionId: syntheticAction.sourceActionId || '',
      agent: syntheticAction.agent,
      category: syntheticAction.category,
      target: file.path,
      file: file.path,
      executor: 'file_patch',
      task: 'file_content',
      field: 'content',
      before: beforeContent,
      after: afterContent,
      sourceFingerprint: file.sha1,
      note: syntheticAction.note,
      verification: syntheticAction.verification
    }
  };
}

async function seoDraftActionForPreview(action, controlPlan) {
  if (['content', 'internal_links'].includes(action.category) && isUtilitySeoTarget(action.target)) {
    throw new Error('Цю службову сторінку не беремо як SEO patch: вона слабко впливає на трафік/конверсії.');
  }
  if (action.category === 'on_page') return seoAgentDraftOnPage(action, controlPlan);
  const matchedEntity = seoFindControlEntity(controlPlan, action);
  if (matchedEntity && ['content', 'internal_links'].includes(action.category)) return seoAgentDraftEntity(action, controlPlan);
  if (['content', 'internal_links'].includes(action.category)) {
    throw new Error('Ця задача має змінювати опис конкретної сторінки, а не шаблон footer/header. Оберіть товар/категорію/інфосторінку або запустіть свіжий control scan, щоб агент мав entity readback.');
  }
  if (['technical', 'performance', 'indexation', 'schema', 'geo'].includes(action.category)) {
    return seoAgentDraftFile(action, controlPlan);
  }
  throw new Error('Для цієї задачі ще немає безпечного agent draft adapter.');
}

function seoDraftSkipBucket(reason = '') {
  const text = String(reason || '').toLowerCase();
  if (/internal linking agent|internal links|перелінков|внутрішн/.test(text)) return 'internal_links';
  if (/on-page|meta title|meta description|h1/.test(text)) return 'on_page';
  if (/bridge|opencart|readback|не підтвердив|не зміг прочитати/.test(text)) return 'readback';
  if (/schema|json-ld|product schema/.test(text)) return 'schema';
  if (/file|файл|search fragment|syntax/.test(text)) return 'technical_file';
  return 'other';
}

function seoDraftSkipLabel(bucket = 'other') {
  return {
    internal_links: 'internal links',
    on_page: 'title/meta/H1',
    readback: 'OpenCart readback',
    schema: 'schema',
    technical_file: 'technical file',
    other: 'інші'
  }[bucket] || bucket;
}

function seoSummarizeDraftSkips(skipped = []) {
  const groups = new Map();
  for (const item of skipped || []) {
    const bucket = seoDraftSkipBucket(item.reason || '');
    const current = groups.get(bucket) || {
      bucket,
      label: seoDraftSkipLabel(bucket),
      count: 0,
      examples: []
    };
    current.count += 1;
    if (current.examples.length < 3) {
      current.examples.push({
        target: item.target || '',
        reason: item.reason || ''
      });
    }
    groups.set(bucket, current);
  }
  return [...groups.values()].sort((left, right) => right.count - left.count);
}

function seoBatchBlockedInternalLinksSummary(siteId = 'mercato', controlPlan = {}) {
  const dashboard = seoCenterRuntime.dashboard(siteId);
  const queue = dashboard.fixQueue || {};
  const items = [
    ...(queue.proposals || []),
    ...(queue.tasks || []),
    ...(queue.items || [])
  ];
  const blocked = [];
  for (const action of items) {
    if (action.category !== 'internal_links') continue;
    if (!seoCanAgentDraftAction(action, { batch: false, controlPlan })) continue;
    const reason = seoLikelyInternalLinksBatchBlocker(action, controlPlan);
    if (!reason) continue;
    blocked.push({
      id: action.id,
      target: action.target || '',
      reason
    });
  }
  return blocked;
}

function seoBatchFailureMessage({ skipped = [], blockedInternalLinks = [] } = {}) {
  const skippedSummary = seoSummarizeDraftSkips(skipped);
  const parts = [];
  if (blockedInternalLinks.length) {
    parts.push(`${blockedInternalLinks.length} internal-link задач заблоковано, бо немає нормального опису або це товарні сторінки`);
  }
  skippedSummary.slice(0, 3).forEach(group => {
    const example = group.examples?.[0]?.reason || '';
    parts.push(`${group.count} ${group.label}: ${example}`);
  });
  if (!parts.length) {
    return 'Немає batch-safe agent draft задач: потрібен свіжий page audit або задача з конкретною OpenCart сутністю.';
  }
  return `Агенти не створили безпечний batch: ${parts.join(' · ')}`;
}

app.post('/api/seo-center/agent-draft', async (req, res) => {
  try {
    const siteId = String(req.body?.siteId || 'mercato').trim().toLowerCase();
    assertSeoGrowthUnlocked(siteId);
    const actionId = String(req.body?.actionId || '').trim();
    const action = seoCenterRuntime.action(siteId, actionId);
    const controlPlan = seoCenterRuntime.controlPlan(siteId);
    if (!action || !controlPlan) return res.status(404).json({ error: 'SEO action або control plan не знайдено.' });
    const drafted = await seoDraftWithTimeout(action, controlPlan);
    const preview = seoCenterRuntime.createFixPreview({
      siteId,
      actions: [drafted.action],
      changes: [drafted.change]
    });
    res.json({
      ok: true,
      preview,
      message: `Агент ${drafted.action.agent} прочитав фактичне джерело й підготував точний patch. Запис ще не виконувався.`
    });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message, recoveryMode: error.recoveryMode || null });
  }
});

app.post('/api/seo-center/agent-draft-batch', async (req, res) => {
  try {
    const siteId = String(req.body?.siteId || 'mercato').trim().toLowerCase();
    assertSeoGrowthUnlocked(siteId);
    const limit = Math.max(1, Math.min(Number(req.body?.limit || SEO_AGENT_DRAFT_BATCH_DEFAULT), SEO_AGENT_DRAFT_BATCH_MAX));
    const replaceActive = req.body?.replaceActive !== false;
    const controlPlan = seoCenterRuntime.controlPlan(siteId);
    if (!controlPlan) return res.status(404).json({ error: 'SEO control plan не знайдено. Спочатку прочитайте SEO-контур.' });
    const candidates = seoAgentDraftBatchCandidates({
      siteId,
      limit,
      actionIds: Array.isArray(req.body?.actionIds) ? req.body.actionIds : []
    });
    if (!candidates.length) {
      const blockedInternalLinks = seoBatchBlockedInternalLinksSummary(siteId, controlPlan);
      return res.status(400).json({
        error: seoBatchFailureMessage({ blockedInternalLinks }),
        blockedInternalLinks: blockedInternalLinks.slice(0, 10),
        diagnostics: {
          blockedInternalLinks: blockedInternalLinks.length,
          nextStep: blockedInternalLinks.length
            ? 'Спочатку підготувати Content Quality/on-page patch для сторінок із порожнім описом; internal links не мають бути першим batch.'
            : 'Запустіть page audit для конкретної сторінки з GSC/GA4 попитом або перечитайте SEO-контур.'
        }
      });
    }
    const activePreview = seoActiveFixPreview(siteId);
    if (activePreview) {
      if (activePreview.status !== 'pending_approval') {
        return res.status(409).json({ error: 'Є вже підтверджений або активний SEO preview. Спочатку внесіть/відхиліть його, щоб не змішати різні batch.' });
      }
      if (!replaceActive) {
        return res.status(409).json({ error: 'Є pending SEO preview. Увімкніть replaceActive або відхиліть поточний preview.' });
      }
      seoCenterRuntime.rejectFixPreview({
        previewId: activePreview.id,
        rejectedBy: 'agent-batch',
        reason: 'Замінено більшим agent draft batch без live-запису.'
      });
    }
    const actions = [];
    const changes = [];
    const skipped = [];
    const changeKeys = new Set();
    for (const candidate of candidates) {
      try {
        const drafted = await seoDraftWithTimeout(candidate, controlPlan);
        const changeKey = seoAgentDraftEntityKey(drafted.change || candidate);
        if (changeKeys.has(changeKey)) continue;
        changeKeys.add(changeKey);
        actions.push(drafted.action);
        changes.push(drafted.change);
      } catch (error) {
        skipped.push({
          id: candidate.id,
          agent: candidate.agent,
          category: candidate.category,
          target: candidate.target,
          reason: error.message
        });
      }
      if (actions.length >= limit) break;
    }
    if (!actions.length) {
      const blockedInternalLinks = seoBatchBlockedInternalLinksSummary(siteId, controlPlan);
      return res.status(400).json({
        error: seoBatchFailureMessage({ skipped, blockedInternalLinks }),
        skipped,
        skippedSummary: seoSummarizeDraftSkips(skipped),
        blockedInternalLinks: blockedInternalLinks.slice(0, 10),
        diagnostics: {
          skipped: skipped.length,
          blockedInternalLinks: blockedInternalLinks.length,
          nextStep: 'Не повторюйте той самий batch. Візьміть on-page/content/schema задачі з конкретним readback або запустіть page audit для URL із попитом.'
        }
      });
    }
    const preview = seoCenterRuntime.createFixPreview({ siteId, actions, changes });
    res.json({
      ok: true,
      preview,
      skipped,
      replacedPreviewId: activePreview?.id || '',
      message: `Агенти підготували batch: ${actions.length} SEO-змін для ${preview.entityCount} сторінок/файлів. Live-запис ще не виконувався.`
    });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message, recoveryMode: error.recoveryMode || null });
  }
});

app.post('/api/seo-center/reject-preview', (req, res) => {
  try {
    const preview = seoCenterRuntime.rejectFixPreview({
      previewId: String(req.body?.previewId || '').trim(),
      rejectedBy: String(req.body?.rejectedBy || 'owner-ui').trim(),
      reason: String(req.body?.reason || '').trim()
    });
    res.json({
      ok: true,
      preview,
      message: 'SEO preview відхилено. Live-запис не виконувався.'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/seo-center/preview-remove-changes', (req, res) => {
  try {
    const result = seoCenterRuntime.removeFixPreviewChanges({
      previewId: String(req.body?.previewId || '').trim(),
      changeKeys: Array.isArray(req.body?.changeKeys) ? req.body.changeKeys : [],
      removedBy: String(req.body?.removedBy || 'owner-ui').trim()
    });
    res.json({
      ok: true,
      preview: result.preview,
      removedCount: result.removedCount,
      message: result.preview.status === 'rejected'
        ? `Вилучено ${result.removedCount} SEO-змін. Preview спорожнів і відхилений без live-запису.`
        : `Вилучено ${result.removedCount} SEO-змін із preview. Live-сайт не змінювався.`
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

function trimSeoField(value = '', maxLength = 160) {
  const clean = plainOneLine(stripHtml(String(value || '')))
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
  if (clean.length <= maxLength) return clean;
  const clipped = clean.slice(0, maxLength + 1);
  const boundary = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, boundary > Math.floor(maxLength * 0.65) ? boundary : maxLength).replace(/[.,:;!?\s]+$/, '')}.`;
}

function proposedSeoChange(action, snapshot = {}) {
  const task = String(action.task || '');
  const name = plainOneLine(snapshot.name || 'Товар Mercato');
  let before;
  let after;
  if (task === 'meta_title') {
    before = String(snapshot.meta_title || '');
    after = trimSeoField(`${trimSeoField(name, 49)} | Mercato`, 60);
  } else if (task === 'meta_description') {
    before = String(snapshot.meta_description || '');
    after = trimSeoField(before || snapshot.descriptionPreview || name, 155);
  } else if (task === 'h1') {
    before = String(snapshot.meta_h1 || (snapshot.h1_marker ? name : ''));
    after = trimSeoField(name, 90);
  } else if (task === 'product_schema') {
    before = Boolean(snapshot.schema_marker);
    after = true;
  } else {
    throw new Error(`Непідтримувана SEO-дія: ${task || 'невідома'}.`);
  }
  if ((task !== 'product_schema' && !after) || JSON.stringify(before) === JSON.stringify(after)) {
    throw new Error(`SEO-правка ${task} для ${action.target} не створює корисної зміни.`);
  }
  const sourceFingerprint = crypto.createHash('sha256').update(JSON.stringify({
    productId: snapshot.product_id || '',
    task,
    before,
    descriptionSha1: snapshot.descriptionSha1 || '',
    schemaMarker: Boolean(snapshot.schema_marker),
    h1Marker: Boolean(snapshot.h1_marker)
  })).digest('hex');
  return {
    actionId: action.id,
    auditJobId: action.auditJobId,
    agent: action.agent,
    target: action.target,
    productId: snapshot.product_id || '',
    task,
    before,
    after,
    sourceFingerprint,
    note: task === 'product_schema'
      ? 'Додається Product + Offer з реальною назвою, брендом, ціною, наявністю та фото OpenCart. Review/AggregateRating не вигадуються.'
      : 'Значення сформовано з поточної картки OpenCart; масова генерація контенту не використовується.'
  };
}

function currentSeoSourceFingerprint(change, snapshot = {}) {
  const task = String(change.task || '');
  const before = task === 'meta_title'
    ? String(snapshot.meta_title || '')
    : task === 'meta_description'
      ? String(snapshot.meta_description || '')
      : task === 'h1'
        ? String(snapshot.meta_h1 || (snapshot.h1_marker ? snapshot.name || '' : ''))
        : Boolean(snapshot.schema_marker);
  return crypto.createHash('sha256').update(JSON.stringify({
    productId: snapshot.product_id || '',
    task,
    before,
    descriptionSha1: snapshot.descriptionSha1 || '',
    schemaMarker: Boolean(snapshot.schema_marker),
    h1Marker: Boolean(snapshot.h1_marker)
  })).digest('hex');
}

function seoReadbackMatches(change, snapshot = {}, applied = {}) {
  if (change.task === 'meta_title') return String(snapshot.meta_title || '') === String(change.after || '');
  if (change.task === 'meta_description') return String(snapshot.meta_description || '') === String(change.after || '');
  if (change.task === 'h1') {
    return String(snapshot.meta_h1 || '') === String(change.after || '')
      || (Boolean(snapshot.h1_marker) && String(applied.fields?.description_h1 || '') === String(change.after || ''));
  }
  if (change.task === 'product_schema') return snapshot.schema_marker === true;
  return false;
}

async function readSeoControlTarget(action = {}) {
  const entityType = String(action.entityType || action.entity_type || '');
  const entityId = Number(action.entityId || action.entity_id || 0);
  if (entityType === 'product') {
    return await callBridge('product_read', {
      url: action.target,
      product_id: entityId,
      slug: productSlugFromUrl(action.target)
    });
  }
  if (['category', 'information'].includes(entityType)) {
    return await callBridge('content_read', {
      type: entityType,
      url: action.target,
      id: entityId,
      slug: productSlugFromUrl(action.target)
    });
  }
  throw new Error(`Немає read adapter для ${entityType || 'невідомої сутності'}.`);
}

function controlChangeFromAction(action, snapshot = {}) {
  const field = String(action.field || action.task || '');
  const before = field === 'schema_type' ? Boolean(snapshot.schema_marker) : snapshot[field] ?? action.before ?? '';
  return {
    actionId: action.id,
    sourceActionId: action.sourceActionId || action.originalActionId || '',
    stableActionKey: action.stableActionKey || '',
    auditJobId: action.auditJobId || '',
    agent: action.agent,
    category: action.category,
    target: action.target,
    executor: action.executor || (field === 'schema_type' ? 'managed_schema' : 'entity_patch'),
    entityType: action.entityType || snapshot.type || '',
    entityId: Number(action.entityId || snapshot.id || snapshot.product_id || snapshot.category_id || snapshot.information_id || 0),
    task: field,
    field,
    before,
    after: action.after,
    sourceFingerprint: snapshot.source_fingerprint || action.sourceFingerprint || '',
    note: action.note || '',
    verification: action.verification || ''
  };
}

app.post('/api/seo-center/fix-preview', async (req, res) => {
  try {
    const siteId = String(req.body?.siteId || 'mercato').trim().toLowerCase();
    assertSeoGrowthUnlocked(siteId);
    const actions = seoCenterRuntime.selectFixActions({
      siteId,
      actionIds: req.body?.actionIds || [],
      limit: req.body?.limit || 100,
      entityLimit: req.body?.entityLimit || 25
    });
    const changes = [];
    const sourceReads = new Map();
    const sourceTargets = new Map();
    actions.forEach(action => {
      const readKey = action.entityType
        ? `${action.entityType}:${action.entityId}`
        : `legacy:${action.target}`;
      if (!sourceTargets.has(readKey)) sourceTargets.set(readKey, action);
    });
    const sourceEntries = [...sourceTargets.entries()];
    for (let offset = 0; offset < sourceEntries.length; offset += 5) {
      const chunk = sourceEntries.slice(offset, offset + 5);
      const chunkReads = await Promise.all(chunk.map(async ([readKey, action]) => {
        const data = action.entityType
          ? await readSeoControlTarget(action)
          : await callBridge('product_read', {
              url: action.target,
              slug: productSlugFromUrl(action.target)
            });
        return [readKey, data];
      }));
      chunkReads.forEach(([readKey, data]) => sourceReads.set(readKey, data));
    }
    for (const action of actions) {
      if (action.entityType) {
        const readKey = `${action.entityType}:${action.entityId}`;
        const data = sourceReads.get(readKey);
        if (!data?.snapshot?.found) throw new Error(`OpenCart не підтвердив SEO-сутність ${action.target}.`);
        changes.push(controlChangeFromAction(action, data.snapshot));
      } else {
        const readKey = `legacy:${action.target}`;
        const data = sourceReads.get(readKey);
        if (!data?.snapshot?.found) throw new Error(`OpenCart не підтвердив товарну сторінку ${action.target}.`);
        changes.push(proposedSeoChange(action, data.snapshot));
      }
    }
    const preview = seoCenterRuntime.createFixPreview({ siteId, actions, changes });
    res.json({
      ok: true,
      preview,
      message: `Підготовлено ${preview.actionCount} точних SEO-змін для ${preview.entityCount} сторінок/файлів. Запис ще не виконувався.`
    });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message, recoveryMode: error.recoveryMode || null });
  }
});

app.post('/api/seo-center/approve', (req, res) => {
  try {
    if (String(req.body?.confirmPhrase || '').trim() !== 'APPLY_SEO_CHANGES') {
      return res.status(400).json({
        error: 'Потрібне явне підтвердження APPLY_SEO_CHANGES.',
        code: 'SEO_APPROVAL_REQUIRED'
      });
    }
    const approval = seoCenterRuntime.approveFixPreview({
      previewId: req.body?.previewId,
      confirmedBy: req.body?.confirmedBy || 'owner-ui'
    });
    res.json({
      ok: true,
      approval,
      message: `Погоджено ${approval.actionCount} SEO-змін для ${approval.entityCount} сторінок/файлів. Вони ще не внесені.`
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

function groupSeoExecutionUnits(changes = []) {
  const units = new Map();
  changes.forEach((change, index) => {
    const key = change.entityType && change.entityId
      ? `entity:${change.entityType}:${change.entityId}`
      : change.executor === 'file_patch'
        ? `file:${change.file || change.target}`
        : `legacy:${change.target || index}`;
    if (!units.has(key)) units.set(key, { key, changes: [] });
    units.get(key).changes.push(change);
  });
  return [...units.values()];
}

function seoFailedResults(changes = [], error) {
  return changes.map(change => ({
    actionId: change.actionId,
    sourceActionId: change.sourceActionId || '',
    stableActionKey: change.stableActionKey || '',
    target: change.target,
    task: change.task,
    executor: change.executor || 'legacy_product_field',
    entityType: change.entityType || 'product',
    entityId: change.entityId || change.productId || '',
    before: change.before,
    after: change.after,
    ok: false,
    error: error.message || String(error)
  }));
}

async function executeSeoUnit(unit, approval, liveBridge) {
  const changes = unit.changes || [];
  if (!changes.length) return [];
  const completed = [];
  try {
    const first = changes[0];
    if (first.entityType && first.entityId) {
      let currentRead = await readSeoControlTarget(first);
      if (!currentRead?.snapshot?.found) throw new Error('OpenCart не підтвердив SEO-сутність перед записом.');
      const originalFingerprint = currentRead.snapshot.source_fingerprint || '';
      const expectedFingerprints = [...new Set(changes.map(change => change.sourceFingerprint).filter(Boolean))];
      if (expectedFingerprints.length && !expectedFingerprints.includes(originalFingerprint)) {
        throw new Error('SEO-сутність змінилася після preview. Створіть новий control scan і preview.');
      }
      const results = [];
      const entityChanges = changes.filter(change => change.executor === 'entity_patch');
      if (entityChanges.length) {
        if (bridgeMajorVersion(liveBridge.version) < 32 || !(Array.isArray(liveBridge.features) ? liveBridge.features : []).includes('seo_entity_patch')) {
          throw new Error(`Live bridge ${liveBridge.version || 'невідомої версії'} не підтримує універсальні SEO entity patches. Завантажте bridge v35.`);
        }
        const payloadChanges = {};
        entityChanges.forEach(change => {
          if (Object.prototype.hasOwnProperty.call(payloadChanges, change.field) && payloadChanges[change.field] !== change.after) {
            throw new Error(`Preview містить конфлікт для поля ${change.field}.`);
          }
          payloadChanges[change.field] = change.after;
        });
        const applied = await postBridge('seo_apply_entity_patch', {
          approval_id: approval.id,
          confirmPhrase: 'APPLY_SEO_CHANGES',
          entity_type: first.entityType,
          entity_id: first.entityId,
          expected_source_fingerprint: originalFingerprint,
          changes: payloadChanges
        });
        if (!applied.readbackExact) throw new Error('OpenCart не підтвердив точний entity readback.');
        currentRead = { snapshot: applied.after || {} };
        entityChanges.forEach(change => results.push({
          actionId: change.actionId,
          sourceActionId: change.sourceActionId || '',
          stableActionKey: change.stableActionKey || '',
          target: change.target,
          task: change.task,
          executor: 'entity_patch',
          entityType: change.entityType,
          entityId: change.entityId,
          before: change.before,
          after: change.after,
          ok: true,
          changeId: applied.change_id || null,
          bridgeVersion: applied.bridgeVersion || liveBridge.version || '',
          readback: applied.after || null
        }));
        completed.push(...results);
      }

      const schemaChanges = changes.filter(change =>
        change.executor === 'managed_schema' || change.task === 'product_schema' || change.task === 'schema_type'
      );
      for (const change of schemaChanges) {
        try {
          const currentFingerprint = currentRead.snapshot?.source_fingerprint || originalFingerprint;
          const applied = change.entityType === 'product'
            ? await postBridge('seo_apply_product_schema', {
                url: change.target,
                product_id: change.entityId,
                approval_id: approval.id,
                confirmPhrase: 'APPLY_SEO_CHANGES',
                expected_source_fingerprint: currentFingerprint
              })
            : await postBridge('seo_apply_managed_schema', {
                entity_type: change.entityType,
                entity_id: change.entityId,
                approval_id: approval.id,
                confirmPhrase: 'APPLY_SEO_CHANGES',
                expected_source_fingerprint: currentFingerprint
              });
          if (!applied.schemaReadback) throw new Error('OpenCart не підтвердив schema marker.');
          currentRead = { snapshot: applied.readback || applied.after || {} };
          const success = {
            actionId: change.actionId,
            sourceActionId: change.sourceActionId || '',
            stableActionKey: change.stableActionKey || '',
            target: change.target,
            task: change.task,
            executor: 'managed_schema',
            entityType: change.entityType,
            entityId: change.entityId,
            before: change.before,
            after: change.after,
            ok: true,
            changeId: applied.change_id || null,
            bridgeVersion: applied.bridgeVersion || liveBridge.version || '',
            readback: currentRead.snapshot
          };
          results.push(success);
          completed.push(success);
        } catch (error) {
          results.push(...seoFailedResults([change], error));
        }
      }

      const unsupported = changes.filter(change =>
        !entityChanges.includes(change) && !schemaChanges.includes(change)
      );
      if (unsupported.length) {
        results.push(...seoFailedResults(unsupported, new Error('Непідтримуваний executor у entity batch.')));
      }
      return results;
    }

    if (first.executor === 'file_patch') {
      if (changes.length !== 1) throw new Error('Один файл може мати лише один погоджений patch у batch.');
      if (bridgeMajorVersion(liveBridge.version) < 32 || !(Array.isArray(liveBridge.features) ? liveBridge.features : []).includes('seo_file_patch')) {
        throw new Error(`Live bridge ${liveBridge.version || 'невідомої версії'} не підтримує file patches. Завантажте bridge v35.`);
      }
      const applied = await postBridge('seo_apply_file_patch', {
        approval_id: approval.id,
        confirmPhrase: 'APPLY_SEO_CHANGES',
        file: first.file || first.target,
        content: first.after,
        expected_sha1: first.sourceFingerprint
      });
      if (!applied.readbackExact) throw new Error('OpenCart не підтвердив file hash readback.');
      return [{
        actionId: first.actionId,
        sourceActionId: first.sourceActionId || '',
        stableActionKey: first.stableActionKey || '',
        target: first.target,
        task: first.task,
        executor: 'file_patch',
        entityType: 'site_file',
        entityId: first.file || first.target,
        before: first.before,
        after: first.after,
        ok: true,
        changeId: applied.change_id || null,
        bridgeVersion: applied.bridgeVersion || liveBridge.version || '',
        readback: applied.after || null
      }];
    }

    const results = [];
    for (const change of changes) {
      const beforeRead = await callBridge('product_read', {
        url: change.target,
        product_id: change.productId,
        slug: productSlugFromUrl(change.target)
      });
      if (currentSeoSourceFingerprint(change, beforeRead.snapshot || {}) !== change.sourceFingerprint) {
        throw new Error('Картка товару змінилася після preview. Створіть новий SEO preview.');
      }
      const applied = await postBridge('seo_apply_product_basics', {
        url: change.target,
        product_id: change.productId,
        approval_id: approval.id,
        confirmPhrase: 'APPLY_SEO_CHANGES',
        task: change.task,
        ...(change.task === 'meta_title' ? { meta_title: change.after } : {}),
        ...(change.task === 'meta_description' ? { meta_description: change.after } : {}),
        ...(change.task === 'h1' ? { meta_h1: change.after } : {})
      });
      const afterRead = await callBridge('product_read', {
        url: change.target,
        product_id: change.productId,
        slug: productSlugFromUrl(change.target)
      });
      if (!seoReadbackMatches(change, afterRead.snapshot || {}, applied || {})) {
        throw new Error('OpenCart readback не підтвердив погоджене SEO-значення.');
      }
      results.push({
        actionId: change.actionId,
        sourceActionId: change.sourceActionId || '',
        stableActionKey: change.stableActionKey || '',
        target: change.target,
        task: change.task,
        executor: 'legacy_product_field',
        entityType: 'product',
        entityId: change.productId || '',
        before: change.before,
        after: change.after,
        ok: true,
        changeId: applied.change_id || null,
        bridgeVersion: applied.bridgeVersion || liveBridge.version || '',
        readback: afterRead.snapshot
      });
      completed.push(results[results.length - 1]);
    }
    return results;
  } catch (error) {
    const completedIds = new Set(completed.map(result => result.actionId));
    return [
      ...completed,
      ...seoFailedResults(changes.filter(change => !completedIds.has(change.actionId)), error)
    ];
  }
}

app.post('/api/seo-center/apply', async (req, res) => {
  let claimed = null;
  const results = [];
  try {
    if (String(req.body?.confirmPhrase || '').trim() !== 'APPLY_SEO_CHANGES') {
      return res.status(400).json({
        error: 'Потрібне явне підтвердження APPLY_SEO_CHANGES.',
        code: 'SEO_APPROVAL_REQUIRED'
      });
    }
    const approvalId = String(req.body?.approvalId || '').trim();
    const liveBridge = await callBridge('version');
    if (bridgeMajorVersion(liveBridge.version) < 31 || !(Array.isArray(liveBridge.features) ? liveBridge.features : []).includes('seo_approved_fixes')) {
      return res.status(409).json({
        error: `Live bridge ${liveBridge.version || 'невідомої версії'} не підтримує approval-gated SEO fixes. Завантажте bridge v35.`,
        code: 'SEO_BRIDGE_UPDATE_REQUIRED',
        liveBridge
      });
    }
    claimed = seoCenterRuntime.claimApproval(approvalId);
    const units = groupSeoExecutionUnits(claimed.preview.changes || []);
    const chunkSize = Math.max(1, Math.min(Number(claimed.preview.executionChunkSize || 5), 5));
    let chunksProcessed = 0;
    let stoppedEarly = false;
    let stopReason = '';
    const repeatedErrors = new Map();
    for (let offset = 0; offset < units.length; offset += chunkSize) {
      const chunk = units.slice(offset, offset + chunkSize);
      const unitResults = await Promise.all(
        chunk.map(unit => executeSeoUnit(unit, claimed.approval, liveBridge))
      );
      const chunkResults = unitResults.flat();
      results.push(...chunkResults);
      chunksProcessed += 1;
      unitResults.forEach(unitResult => {
        const unitErrors = new Set(
          unitResult
            .filter(result => !result.ok)
            .map(result => String(result.error || 'невідома помилка').slice(0, 240))
        );
        unitErrors.forEach(key => {
          repeatedErrors.set(key, (repeatedErrors.get(key) || 0) + 1);
        });
      });
      const systemic = [...repeatedErrors.entries()].find(([, count]) => count >= 3);
      if (systemic && offset + chunkSize < units.length) {
        stoppedEarly = true;
        stopReason = `Виконання зупинено після повторення системної помилки 3 рази: ${systemic[0]}`;
        const remaining = units.slice(offset + chunkSize).flatMap(unit => unit.changes || []);
        results.push(...remaining.map(change => ({
          ...seoFailedResults([change], new Error(stopReason))[0],
          skipped: true
        })));
        break;
      }
    }
    const execution = {
      unitCount: units.length,
      chunkSize,
      chunksProcessed,
      stoppedEarly,
      stopReason
    };
    const run = seoCenterRuntime.completeWriteRun({
      approvalId: claimed.approval.id,
      results,
      execution
    });
    let reAuditJob = null;
    let reAuditWarning = '';
    const firstSuccess = results.find(result => result.ok);
    if (firstSuccess) {
      try {
        reAuditJob = seoCenterRuntime.startAudit({
          siteId: claimed.approval.siteId,
          mode: ['product_schema', 'schema_type'].includes(firstSuccess.task) ? 'schema' : 'page',
          target: firstSuccess.target
        });
      } catch (error) {
        reAuditWarning = error.message;
      }
    }
    const failureText = [
      run.execution?.stopReason || '',
      run.error || '',
      ...results.filter(result => !result.ok).slice(0, 5).map(result => result.error || '')
    ].join(' ');
    const productSchemaBridgeFailed = run.failedCount > 0 && /seo_apply_product_schema|Порожня відповідь від bridge/i.test(failureText);
    const failureMessage = productSchemaBridgeFailed
      ? `Bridge не відповів на Product Schema. Внесено ${run.okCount}, не підтверджено ${run.failedCount}. Live-запис зупинено; потрібен bridge v35 і повторний preview.`
      : `Внесено ${run.okCount}, не підтверджено ${run.failedCount}. Перевірте журнал.`;
    res.json({
      ok: run.failedCount === 0,
      run,
      reAuditJob,
      warning: reAuditWarning,
      message: run.failedCount
        ? failureMessage
        : `Внесено й підтверджено readback: ${run.okCount} SEO-змін. Повторний аудит ${reAuditJob ? 'запущено' : 'потрібно запустити вручну'}.`
    });
  } catch (error) {
    if (claimed?.approval?.id) {
      try {
        seoCenterRuntime.completeWriteRun({ approvalId: claimed.approval.id, results, error: error.message });
      } catch {}
    }
    res.status(error.status || 500).json({ error: error.message, results });
  }
});

app.post('/api/seo-center/rollback', async (req, res) => {
  try {
    if (String(req.body?.confirmPhrase || '').trim() !== 'ROLLBACK_SEO_CHANGE') {
      return res.status(400).json({
        error: 'Потрібне явне підтвердження ROLLBACK_SEO_CHANGE.',
        code: 'SEO_ROLLBACK_APPROVAL_REQUIRED'
      });
    }
    const siteId = String(req.body?.siteId || 'mercato').trim().toLowerCase();
    const writeRunId = String(req.body?.writeRunId || '').trim();
    const changeId = String(req.body?.changeId || '').trim();
    if (!changeId) return res.status(400).json({ error: 'Потрібен changeId з журналу SEO write run.' });
    const liveBridge = await callBridge('version');
    if (bridgeMajorVersion(liveBridge.version) < 32 || !(Array.isArray(liveBridge.features) ? liveBridge.features : []).includes('seo_change_rollback')) {
      return res.status(409).json({
        error: `Live bridge ${liveBridge.version || 'невідомої версії'} не підтримує SEO rollback. Завантажте bridge v35.`,
        code: 'SEO_ROLLBACK_BRIDGE_UPDATE_REQUIRED'
      });
    }
    const approvalId = `seo-rollback-approval-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const result = await postBridge('seo_rollback_change', {
      approval_id: approvalId,
      confirmPhrase: 'ROLLBACK_SEO_CHANGE',
      change_id: changeId
    });
    const rollback = seoCenterRuntime.recordRollback({
      siteId,
      writeRunId,
      changeId,
      result
    });
    res.json({
      ok: true,
      rollback,
      message: `SEO change ${changeId} відновлено з backup і підтверджено readback.`
    });
  } catch (error) {
    const rollback = seoCenterRuntime.recordRollback({
      siteId: String(req.body?.siteId || 'mercato').trim().toLowerCase(),
      writeRunId: String(req.body?.writeRunId || '').trim(),
      changeId: String(req.body?.changeId || '').trim(),
      error: error.message
    });
    res.status(500).json({ error: explainBridgeError(error), rollback });
  }
});

let merchantLiveBridgeCache = null;

function bridgeMajorVersion(version = '') {
  const matches = [...String(version || '').matchAll(/v(\d+)/gi)];
  return matches.length ? Number(matches[matches.length - 1][1] || 0) : 0;
}

function merchantBridgeSupportsVariants(bridge = {}) {
  return bridgeMajorVersion(bridge.version) >= 27;
}

function merchantBridgeSupportsApprovedWrites(bridge = {}) {
  const features = Array.isArray(bridge.features) ? bridge.features : [];
  return features.includes('merchant_apply_product_patch') || bridgeMajorVersion(bridge.version) >= 29;
}

function merchantBridgeSupportsRemediationQueue(bridge = {}) {
  const features = Array.isArray(bridge.features) ? bridge.features : [];
  return features.includes('merchant_feed_overrides') || bridgeMajorVersion(bridge.version) >= 30;
}

async function getMerchantLiveBridge({ force = false } = {}) {
  const now = Date.now();
  if (!force && merchantLiveBridgeCache && now - merchantLiveBridgeCache.cachedAt < 30000) {
    return merchantLiveBridgeCache.value;
  }
  try {
    const data = await callBridge('version', {}, { timeoutMs: 8000 });
    const value = {
      ok: true,
      version: data.version || '',
      languageId: data.language_id,
      features: Array.isArray(data.features) ? data.features : [],
      supportsVariants: merchantBridgeSupportsVariants(data),
      supportsApprovedWrites: merchantBridgeSupportsApprovedWrites(data),
      supportsRemediationQueue: merchantBridgeSupportsRemediationQueue(data),
      checkedAt: new Date().toISOString(),
      error: ''
    };
    merchantLiveBridgeCache = { cachedAt: now, value };
    return value;
  } catch (error) {
    const previous = merchantLiveBridgeCache?.value || {};
    const value = {
      ...previous,
      ok: false,
      checkedAt: new Date().toISOString(),
      error: error.message
    };
    merchantLiveBridgeCache = { cachedAt: now, value };
    return value;
  }
}

function retriableMerchantBridgeError(error) {
  return error?.code === 'BRIDGE_TIMEOUT'
    || [502, 503, 504].includes(Number(error?.bridgeStatus || 0));
}

async function callMerchantBridgeWithRetry(action, params, onAttempt) {
  const result = await runWithSingleRetry(
    () => callBridge(action, params, { timeoutMs: MERCHANT_BRIDGE_TIMEOUT_MS }),
    {
      shouldRetry: retriableMerchantBridgeError,
      onAttempt: attempt => onAttempt?.(attempt),
      delayMs: 750
    }
  );
  return { data: result.value, attempt: result.attempt };
}

async function loadMerchantCatalogFromBridge({ onProgress } = {}) {
  const limit = 50;
  const maxPages = 20;
  const liveBridge = await getMerchantLiveBridge({ force: true });
  const loadAction = async (action) => {
    const products = [];
    let total = 0;
    let coverage = null;
    let bridgeVersion = liveBridge.version || '';
    for (let page = 1; page <= maxPages; page += 1) {
      const result = await callMerchantBridgeWithRetry(
        action,
        { page, limit },
        attempt => onProgress?.({
          attempt,
          pagesRead: Math.max(0, page - 1),
          productsRead: products.length,
          bridgeVersion
        })
      );
      const data = result.data;
      const rows = Array.isArray(data.products) ? data.products : [];
      total = Number(data.total || total || rows.length);
      coverage = data.coverage || coverage;
      bridgeVersion = data.bridgeVersion || bridgeVersion;
      products.push(...rows);
      onProgress?.({
        attempt: result.attempt,
        pagesRead: page,
        productsRead: products.length,
        bridgeVersion
      });
      if (!rows.length || products.length >= total || rows.length < limit) break;
    }
    return { products, total, coverage, bridgeVersion };
  };

  try {
    const rich = await loadAction('merchant_feed_audit_list');
    const coverage = rich.coverage || {
      full: true,
      source: 'merchant_feed_audit_list',
      fields: ['id', 'title', 'description', 'link', 'image_link', 'image_width', 'image_height', 'availability', 'price', 'price_currency', 'brand', 'gtin', 'mpn', 'sku', 'identifier_exists', 'option_count', 'variant_options', 'variant_value_count', 'item_group_id']
    };
    coverage.variantFull = Array.isArray(coverage.fields) && coverage.fields.includes('variant_options');
    if (!coverage.variantFull) {
      coverage.warning = liveBridge.supportsVariants
        ? 'Останній успішний звіт створено без значень опцій. Повторіть scan із поточним bridge.'
        : 'Основні Merchant-поля прочитані, але значення опцій ще не доступні. Потрібен актуальний bridge v35.';
    }
    return {
      products: rich.products,
      source: 'opencart_merchant_feed_audit_list',
      coverage,
      bridgeVersion: rich.bridgeVersion || liveBridge.version || ''
    };
  } catch (error) {
    if (!/unknown action/i.test(String(error.message || ''))) throw error;
    const legacy = await loadAction('product_audit_list');
    return {
      products: legacy.products,
      source: 'opencart_product_audit_list_legacy',
      bridgeVersion: liveBridge.version || '',
      coverage: {
        full: false,
        source: 'product_audit_list',
        fields: ['product_id', 'name', 'link', 'url', 'status', 'quantity', 'stock_status', 'sku', 'model'],
        warning: 'Live bridge ще не має merchant_feed_audit_list. Оновіть mercato-bridge.php для перевірки ціни, фото, бренду, description та variant policy.'
      }
    };
  }
}

app.get('/api/merchant-feed', async (req, res) => {
  try {
    const liveBridge = await getMerchantLiveBridge();
    const connectorVerification = readJsonFile(CONNECTION_VERIFICATION_PATH, {});
    const dashboard = merchantFeedRuntime.dashboard({ liveBridge, connectorVerification });
    const googleDiagnostics = readJsonFile(MERCHANT_GOOGLE_DIAGNOSTICS_PATH, null);
    if (googleDiagnostics) dashboard.googleDiagnostics = googleDiagnostics;
    res.json(dashboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/merchant-feed/google-diagnostics', async (req, res) => {
  try {
    const result = await queryMerchantCenterDiagnostics({
      limit: Number(req.query.limit || 80)
    });
    res.json(result);
  } catch (error) {
    const failure = writeMerchantDiagnosticsFailure(error);
    res.status(error.status || 500).json({
      ...failure,
      ok: false,
      error: error.message,
      missing: error.missing || []
    });
  }
});

app.get('/api/merchant-feed/jobs/:id', (req, res) => {
  const job = merchantFeedRuntime.job(String(req.params.id || ''));
  if (!job) return res.status(404).json({ error: 'Merchant scan не знайдено.' });
  res.json({ ok: true, job });
});

app.post('/api/merchant-feed/scan', (req, res) => {
  try {
    const job = merchantFeedRuntime.startScan(options => loadMerchantCatalogFromBridge(options));
    res.status(202).json({
      ok: true,
      job,
      message: 'Read-only Merchant scan запущено. OpenCart не змінюється.'
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message, job: error.job || null });
  }
});

app.post('/api/merchant-feed/fix-plan', (req, res) => {
  try {
    const plan = merchantFeedRuntime.createFixPlan();
    res.json({
      ok: true,
      plan,
      message: 'Dry-run план створено. Publish вимкнений до ручного погодження.'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/merchant-feed/test-batch', (req, res) => {
  try {
    const batch = merchantFeedRuntime.createTestBatch();
    const batchUnit = batch.variantExportMode === 'split_by_package'
      ? 'variant feed items'
      : 'канонічних feed offerів';
    res.json({
      ok: true,
      batch,
      message: `Dry-run preview підготовлено: ${batch.selectedProducts} товарів, ${batch.feedItems} ${batchUnit}. Publish вимкнений.`
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/merchant-feed/write-preview', (req, res) => {
  try {
    const preview = merchantFeedRuntime.createWritePreview({
      productIds: req.body?.productIds || [],
      limit: req.body?.limit || 5
    });
    res.json({
      ok: true,
      preview,
      message: `Підготовлено ${preview.changeCount} точних змін для ${preview.productCount} товарів. Запис ще не виконувався.`
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/merchant-feed/approve', (req, res) => {
  try {
    if (String(req.body?.confirmPhrase || '').trim() !== 'APPLY_MERCHANT_CHANGES') {
      return res.status(400).json({
        error: 'Потрібне явне підтвердження APPLY_MERCHANT_CHANGES.',
        code: 'MERCHANT_APPROVAL_REQUIRED'
      });
    }
    const approval = merchantFeedRuntime.approveWritePreview({
      previewId: req.body?.previewId,
      confirmedBy: req.body?.confirmedBy || 'owner-ui'
    });
    res.json({
      ok: true,
      approval,
      message: `Зміни погоджено для ${approval.productCount} товарів. Вони ще не внесені.`
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/merchant-feed/apply', async (req, res) => {
  try {
    if (String(req.body?.confirmPhrase || '').trim() !== 'APPLY_MERCHANT_CHANGES') {
      return res.status(400).json({
        error: 'Потрібне явне підтвердження APPLY_MERCHANT_CHANGES.',
        code: 'MERCHANT_APPROVAL_REQUIRED'
      });
    }
    const liveBridge = await getMerchantLiveBridge({ force: true });
    const approvalId = String(req.body?.approvalId || '').trim();
    const run = await merchantFeedRuntime.applyApprovedChanges({
      approvalId,
      remoteExecutor: async (item, proposals, approval) => {
        if (!liveBridge.supportsApprovedWrites) {
          throw new Error(`Live bridge ${liveBridge.version || 'невідомої версії'} не підтримує погоджені Merchant-зміни. Завантажте актуальний bridge v35.`);
        }
        const advancedProposals = proposals.filter(proposal => proposal.action !== 'set_brand');
        if (advancedProposals.length && !liveBridge.supportsRemediationQueue) {
          throw new Error(`Live bridge ${liveBridge.version || 'невідомої версії'} вміє змінювати лише бренд. Для GTIN і feed overrides завантажте актуальний bridge v35.`);
        }
        const changes = {};
        const payload = {
          approval_id: approval.id,
          confirmPhrase: 'APPLY_MERCHANT_CHANGES',
          product_id: item.productId,
          changes
        };
        proposals.forEach(proposal => {
          if (proposal.action === 'set_brand') {
            changes.brand = proposal.after;
            payload.expected_before_brand = proposal.before;
          }
          if (proposal.action === 'clear_invalid_gtin') {
            changes.clear_invalid_gtin = true;
            payload.expected_invalid_gtin = proposal.before;
          }
          if (proposal.action === 'set_feed_title_override') changes.feed_title = proposal.after;
          if (proposal.action === 'set_feed_description_override') changes.feed_description = proposal.after;
          if (proposal.action === 'set_identifier_exists') changes.identifier_exists = Boolean(proposal.after);
        });
        const result = await postBridge('merchant_apply_product_patch', {
          ...payload,
          changes
        });
        return proposals.map(proposal => ({
          proposalId: proposal.id,
          action: proposal.action,
          target: proposal.target,
          ok: proposal.action === 'set_brand'
            ? result.readback?.brandExact === true
            : proposal.action === 'clear_invalid_gtin'
              ? result.readback?.invalidGtinCleared === true
              : proposal.action === 'set_feed_title_override'
                ? result.readback?.feedTitleExact === true
                : proposal.action === 'set_feed_description_override'
                  ? result.readback?.feedDescriptionExact === true
                  : proposal.action === 'set_identifier_exists'
                    ? result.readback?.identifierExistsExact === true
                    : false,
          before: result.before || null,
          after: result.after || null,
          readback: result.readback || null,
          bridgeVersion: result.bridgeVersion || liveBridge.version || ''
        }));
      }
    });
    let scanJob = null;
    if (run.completedProducts > 0) {
      scanJob = merchantFeedRuntime.startScan(options => loadMerchantCatalogFromBridge(options));
    }
    res.json({
      ok: run.status === 'completed',
      run,
      scanJob,
      merchantCenterPublished: false,
      message: run.completedProducts > 0
        ? `Погоджені зміни внесено для ${run.completedProducts} товарів. Контрольний scan запущено.`
        : 'Жодну зміну не внесено. Перевірте журнал помилок.'
    });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.post('/seo/research/refresh', async (req, res) => {
  try {
    const { keyword = '', productName = '', url = '', competitorUrls = [] } = req.body || {};
    const searchTerm = String(keyword || productName || seoKeywordFromUrl(url) || '').trim();
    if (!searchTerm) return res.status(400).json({ error: 'keyword або productName required' });
    const manualUrls = cleanCompetitorUrls(competitorUrls);
    if (manualUrls.length) {
      saveMonthlyCompetitorSearch(searchTerm, {
        source: 'manual_top10_override',
        urls: manualUrls,
        manualUrls
      });
    }
    const research = await buildGenerationResearch({
      productName: productName || searchTerm,
      keywords: searchTerm,
      isHtml: true,
      competitorUrls: manualUrls,
      force: Boolean(manualUrls.length)
    });
    if (!manualUrls.length && Array.isArray(research.competitorUrls) && research.competitorUrls.length) {
      saveMonthlyCompetitorSearch(searchTerm, {
        source: research.source || 'research_top10',
        urls: cleanCompetitorUrls(research.competitorUrls),
        searchSource: research.source || '',
        searchRanAt: new Date().toISOString()
      });
    }
    res.json({
      ok: true,
      keyword: searchTerm,
      cached: Boolean(research.cached),
      cacheMonth: research.cacheMonth || currentMonthKey(),
      competitorsAnalyzed: research.competitorsAnalyzed || 0,
      competitorUrls: (research.competitorUrls || []).slice(0, 10),
      research
    });
  } catch (error) {
    console.error('SEO research refresh error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/seo/competitors/top10', async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '').trim();
    const refresh = String(req.query.refresh || '') === '1';
    if (!keyword) return res.status(400).json({ error: 'keyword required' });
    const cached = monthlyCompetitorSearchForKeyword(keyword);
    if (cached && !refresh) {
      return res.json({
        ok: true,
        cached: true,
        keyword,
        source: cached.source || 'monthly_cache',
        urls: cleanCompetitorUrls(cached.urls || cached.manualUrls || []),
        savedAt: cached.savedAt || '',
        month: cached.month || currentMonthKey()
      });
    }
    const search = await fetchSearchResultUrls(keyword);
    const urls = cleanCompetitorUrls(search.urls || []);
    const saved = saveMonthlyCompetitorSearch(keyword, {
      source: search.source || 'search',
      urls,
      searchSource: search.source || '',
      searchRanAt: new Date().toISOString()
    });
    res.json({
      ok: true,
      cached: false,
      keyword,
      source: saved.source,
      urls,
      savedAt: saved.savedAt,
      month: saved.month
    });
  } catch (error) {
    console.error('SEO competitor top10 error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/seo/competitors/save', async (req, res) => {
  try {
    const { keyword = '', urls = [] } = req.body || {};
    const searchTerm = String(keyword || '').trim();
    if (!searchTerm) return res.status(400).json({ error: 'keyword required' });
    const cleanUrls = cleanCompetitorUrls(urls);
    const saved = saveMonthlyCompetitorSearch(searchTerm, {
      source: 'manual_top10_override',
      urls: cleanUrls,
      manualUrls: cleanUrls
    });
    res.json({
      ok: true,
      keyword: searchTerm,
      urls: cleanUrls,
      savedAt: saved.savedAt,
      month: saved.month
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/seo/audit/run', async (req, res) => {
  try {
    const { sitemapUrl = defaultSitemapUrl(), limit = 40 } = req.body || {};
    const audit = await runSitemapSeoAudit({ sitemapUrl, limit });
    res.json({ ok: true, audit });
  } catch (error) {
    console.error('SEO sitemap audit error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/seo/opencart-products-audit', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Math.min(Number(req.query.limit || 100), 300));
    const { audit, sync } = await refreshOpenCartProductAudit({ page, limit, reason: 'manual_opencart_audit' });
    res.json({ ok: true, audit, sync });
  } catch (error) {
    res.status(500).json({
      error: explainBridgeError(error),
      raw: String(error.message || error),
      note: 'Потрібно завантажити оновлений mercato-bridge.php з action=product_audit_list на сайт.'
    });
  }
});

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function googleServiceAccountToken(scope) {
  const email = connectionValue('GSC_CLIENT_EMAIL');
  const rawKey = connectionValue('GSC_PRIVATE_KEY') || '';
  if (!email || !rawKey) throw new Error('GSC_CLIENT_EMAIL/GSC_PRIVATE_KEY не задані');
  const privateKey = rawKey.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  const assertion = `${signingInput}.${base64Url(signature)}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    }).toString()
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Google token endpoint повернув не JSON: ${compactApiText(text)}`);
  }
  if (!response.ok) throw new Error(data.error_description || data.error || `Google token HTTP ${response.status}`);
  return data.access_token;
}

async function gscAccessToken() {
  const direct = connectionValue('GSC_ACCESS_TOKEN');
  if (direct) return direct;
  if (hasGoogleOAuthAccessForScope(GSC_READONLY_SCOPE)) return refreshGscOAuthAccessToken();
  if (connectionValue('GSC_CLIENT_EMAIL') && connectionValue('GSC_PRIVATE_KEY')) {
    return googleServiceAccountToken(GSC_READONLY_SCOPE);
  }
  throw new Error('GSC OAuth не підключено: потрібен Google login/token зі scope webmasters.readonly або service account.');
}

function isoDateDaysAgo(daysBack) {
  const date = new Date();
  date.setDate(date.getDate() - Number(daysBack || 0));
  return date.toISOString().slice(0, 10);
}

async function queryGscSearchAnalytics({ startDate = isoDateDaysAgo(28), endDate = isoDateDaysAgo(1), dimensions = ['page'], rowLimit = 25 } = {}) {
  const status = gscConfigStatus();
  if (!status.configured) throw new Error('GSC не налаштований: потрібні GSC_SITE_URL і OAuth login, GSC_ACCESS_TOKEN або service account credentials');
  const token = await gscAccessToken();
  const siteUrl = encodeURIComponent(status.siteUrl);
  const response = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions,
      rowLimit: Math.max(1, Math.min(Number(rowLimit || 25), 250))
    })
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`GSC повернув не JSON: ${compactApiText(text)}`);
  }
  if (!response.ok) throw new Error(data.error?.message || `GSC HTTP ${response.status}`);
  const rows = data.rows || [];
  const totals = rows.reduce((acc, row) => {
    acc.clicks += Number(row.clicks || 0);
    acc.impressions += Number(row.impressions || 0);
    acc.ctrWeighted += Number(row.ctr || 0) * Number(row.impressions || 0);
    acc.positionWeighted += Number(row.position || 0) * Number(row.impressions || 0);
    return acc;
  }, { clicks: 0, impressions: 0, ctrWeighted: 0, positionWeighted: 0 });
  const summary = {
    clicks: Math.round(totals.clicks),
    impressions: Math.round(totals.impressions),
    ctr: totals.impressions ? Number((totals.ctrWeighted / totals.impressions).toFixed(4)) : 0,
    avgPosition: totals.impressions ? Number((totals.positionWeighted / totals.impressions).toFixed(1)) : 0,
    rows: rows.length
  };
  const gsc = { generatedAt: new Date().toISOString(), generatedAtLocal: new Date().toLocaleString('uk-UA'), startDate, endDate, dimensions, summary, rows };
  writeSeoAuditCache({ gsc });
  return gsc;
}

app.get('/seo/gsc/status', (req, res) => {
  const status = gscConfigStatus();
  const cache = readSeoAuditCache().gsc || null;
  res.json({
    ok: true,
    configured: status.configured,
    siteUrl: status.siteUrl,
    authMode: status.authMode,
    hasOAuthClient: status.hasOAuthClient,
    hasOAuthToken: status.hasOAuthToken,
    hasUsableOAuth: status.hasUsableOAuth,
    oauthScopes: status.oauthScopes,
    oauthMissingScopes: status.oauthMissingScopes,
    oauthClientType: status.oauthClientType,
    oauthTokenExpiresAt: status.oauthTokenExpiresAt,
    lastRunAt: cache?.generatedAt || '',
    summary: cache?.summary || null
  });
});

app.get('/seo/gsc/oauth/url', (req, res) => {
  try {
    res.json({ ok: true, ...gscOAuthAuthUrl(req), siteUrl: connectionValue('GSC_SITE_URL') || '' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/seo/gsc/oauth/start', (req, res) => {
  try {
    res.redirect(gscOAuthAuthUrl(req).url);
  } catch (error) {
    res.status(500).send(`<pre>${escapeHtml(error.message)}</pre>`);
  }
});

app.get('/seo/gsc/oauth/callback', async (req, res) => {
  try {
    if (req.query.error) throw new Error(`${req.query.error}: ${req.query.error_description || ''}`.trim());
    const result = await exchangeGscOAuthCode({ code: req.query.code, req });
    res.send(`<!doctype html>
      <html lang="uk"><meta charset="utf-8"><title>Google data OAuth підключено</title>
      <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:720px;margin:48px auto;line-height:1.55;color:#202620;">
        <h1>Google data OAuth підключено</h1>
        <p>Refresh token збережено локально. Тепер Mercato AI може перевіряти Search Console, GA4, Merchant Center і Google Ads через один Google-login, якщо ви погодили відповідні scope-и.</p>
        <p><strong>Token:</strong> ${result.hasRefreshToken ? 'refresh token є' : 'тільки access token'} · expires: ${escapeHtml(result.expiresAt || 'невідомо')}</p>
        <p><strong>Scopes:</strong> ${escapeHtml(result.scope || 'Google не повернув список scope-ів')}</p>
      </body></html>`);
  } catch (error) {
    res.status(500).send(`<!doctype html>
      <html lang="uk"><meta charset="utf-8"><title>Google OAuth помилка</title>
      <body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;max-width:760px;margin:48px auto;line-height:1.55;color:#202620;">
        <h1>Не вдалося підключити Google OAuth</h1>
        <p>${escapeHtml(error.message)}</p>
        <p>Якщо Google показав redirect_uri_mismatch, додай redirect URI <code>${escapeHtml(gscOAuthRedirectUri(req))}</code> у OAuth client або створи Desktop client.</p>
      </body></html>`);
  }
});

app.post('/seo/gsc/oauth/exchange', async (req, res) => {
  try {
    const { code, redirectUri = '' } = req.body || {};
    res.json(await exchangeGscOAuthCode({ code, redirectUri, req }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/seo/gsc/query', async (req, res) => {
  try {
    const { startDate, endDate, dimensions = ['page'], rowLimit = 25 } = req.body || {};
    const gsc = await queryGscSearchAnalytics({ startDate, endDate, dimensions, rowLimit });
    res.json({ ok: true, gsc });
  } catch (error) {
    res.status(500).json({ error: error.message, configured: gscConfigStatus().configured });
  }
});

// Аналіз конкурентів — порівнює МОЮ сторінку з конкурентами
app.post('/analyze-competitors', async (req, res) => {
  try {
    const { myUrl, myHtml, competitorUrls, competitorHtmls, pageType } = req.body;
    if (!myUrl && !myHtml) return res.status(400).json({ error: 'Вкажіть URL або HTML вашої сторінки' });
    if (!competitorUrls?.length) return res.status(400).json({ error: 'Додайте хоча б одного конкурента' });

    // Отримуємо HTML: або вручну вставлений, або завантажений
    const getHtml = async (url, manualHtml, label) => {
      if (manualHtml?.trim().length > 200) {
        return { url: url || label, html: manualHtml.substring(0, 20000), source: 'manual' };
      }
      if (url) {
        const fetched = await fetchPage(url, BROWSER_HEADERS);
        if (fetched.error || fetched.html.length < 500) {
          return { url, html: '', error: fetched.error || 'заблоковано', source: 'failed' };
        }
        return { ...fetched, source: 'auto' };
      }
      return { url: label, html: '', error: 'немає даних', source: 'failed' };
    };

    const [myPage, ...competitorPages] = await Promise.all([
      getHtml(myUrl, myHtml, 'Моя сторінка'),
      ...competitorUrls.map((url, i) => getHtml(url, competitorHtmls?.[i], `Конкурент ${i+1}`))
    ]);

    // Перевірка — якщо моя сторінка не завантажилась
    if (!myPage.html) {
      return res.status(400).json({
        error: 'Не вдалось завантажити вашу сторінку',
        needsManual: true,
        url: myUrl
      });
    }

    const formatPage = (p, label) => {
      if (!p.html) return `=== ${label}: ${p.url} ===\nНЕ ВДАЛОСЬ ЗАВАНТАЖИТИ: ${p.error}\n`;
      return `=== ${label}: ${p.url} (джерело: ${p.source}) ===\n${p.html}\n`;
    };

    const allPagesText = formatPage(myPage, 'МОЯ СТОРІНКА') + '\n' +
      competitorPages.map((p, i) => formatPage(p, `КОНКУРЕНТ ${i + 1}`)).join('\n');

    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: `Зроби порівняльний аналіз сторінки (тип: ${pageType || 'товар'}) на основі ТІЛЬКИ наданого HTML.

КРИТИЧНО ВАЖЛИВО:
- Звітуй ТІЛЬКИ про те що реально бачиш у HTML коді
- Якщо сторінку не вдалось завантажити — пропускай її в порівнянні, не вигадуй
- НЕ ВИГАДУЙ елементи яких немає в HTML
- Якщо не можеш визначити значення — пиши null, не 0 і не false
- gaps показуй ТІЛЬКИ якщо є реальна різниця між моєю та конкурентами

Поверни ТІЛЬКИ валідний JSON, рядки до 150 символів:

{
  "myPage": {
    "url": "${myUrl || 'невідомо'}",
    "title": "точний текст тегу <title> або null",
    "titleLength": 0,
    "metaDescription": "точний текст meta description або null",
    "metaLength": 0,
    "h1": "точний текст першого H1 або null",
    "contentLength": 0,
    "hasH2": false, "h2Count": 0,
    "hasFaq": false,
    "hasReviews": false,
    "hasSchema": false,
    "hasBreadcrumbs": false,
    "hasVideo": false,
    "pageBlocks": ["тільки блоки що реально видно в HTML"],
    "keyPhrases": ["фрази що реально є в тексті"]
  },
  "competitors": [
    {
      "url": "...", "domain": "...",
      "title": null, "titleLength": 0,
      "h1": null, "contentLength": 0,
      "hasH2": false, "h2Count": 0,
      "hasFaq": false, "hasReviews": false,
      "hasSchema": false, "hasBreadcrumbs": false,
      "hasVideo": false,
      "pageBlocks": [],
      "keyPhrases": []
    }
  ],
  "gaps": [
    {
      "element": "конкретна назва елементу",
      "myHas": false,
      "competitorsHaveIt": 1,
      "totalCompetitors": 1,
      "impact": "high",
      "description": "чому це важливо — конкретно"
    }
  ],
  "advantages": [
    { "element": "що є у тебе але не у конкурентів", "description": "..." }
  ],
  "fetchStatus": {
    "myPage": "ok або blocked або empty",
    "competitors": ["ok", "blocked"]
  },
  "summary": "чесний висновок на основі реальних даних. Якщо даних мало — скажи що саме не вдалось проаналізувати"
}

СТОРІНКИ ДЛЯ АНАЛІЗУ:
${allPagesText}`
        }]
      });

      const raw = message.content[0].text.trim();
      res.json(await parseAiJson(raw, 'analyze-competitors'));
    } catch (aiError) {
      console.warn('analyze-competitors fallback:', aiError.message);
      res.json(buildCompetitorAnalysisFallback(myPage, competitorPages, pageType || 'товар', aiError.message));
    }

  } catch (error) {
    console.error('Помилка аналізу:', error.message);
    res.status(500).json({ error: error.message });
  }
});

async function generateUxTrendReport({ category, niche } = {}) {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Ти — експерт з UX, CRO та e-commerce дизайну. Дата: ${new Date().toLocaleDateString('uk-UA')}.

Звіт по трендам сторінок товарів для: "${category || 'e-commerce'}", ніша: "${niche || 'онлайн-магазин'}".

ВАЖЛИВО: Поверни ТІЛЬКИ валідний JSON. Максимум 3 тренди на секцію, максимум 2 пункти в avoid, максимум 5 рекомендацій, максимум 8 пунктів в checklist. Текст коротко — до 120 символів на поле.

{
  "date": "${new Date().toLocaleDateString('uk-UA')}",
  "category": "${category || 'e-commerce'}",
  "sections": [
    {
      "title": "Структура сторінки",
      "icon": "🏗️",
      "trends": [
        { "trend": "назва тренду", "status": "hot", "description": "короткий опис до 120 символів", "example": "приклад до 80 символів" }
      ],
      "avoid": ["що уникати 1", "що уникати 2"]
    },
    {
      "title": "Контент та текст",
      "icon": "✍️",
      "trends": [ { "trend": "...", "status": "rising", "description": "...", "example": "..." } ],
      "avoid": ["..."]
    },
    {
      "title": "Довіра та конверсія",
      "icon": "🎯",
      "trends": [ { "trend": "...", "status": "hot", "description": "...", "example": "..." } ],
      "avoid": ["..."]
    },
    {
      "title": "Мобільний досвід",
      "icon": "📱",
      "trends": [ { "trend": "...", "status": "stable", "description": "...", "example": "..." } ],
      "avoid": ["..."]
    },
    {
      "title": "Візуальний дизайн",
      "icon": "🎨",
      "trends": [ { "trend": "...", "status": "rising", "description": "...", "example": "..." } ],
      "avoid": ["..."]
    }
  ],
  "topRecommendations": [
    { "rank": 1, "action": "дія до 100 символів", "impact": "high", "effort": "low", "why": "причина до 100 символів" },
    { "rank": 2, "action": "...", "impact": "high", "effort": "medium", "why": "..." },
    { "rank": 3, "action": "...", "impact": "medium", "effort": "low", "why": "..." }
  ],
  "checklist": [
    { "item": "пункт чекліста", "category": "must-have" },
    { "item": "...", "category": "must-have" },
    { "item": "...", "category": "must-have" },
    { "item": "...", "category": "nice-to-have" },
    { "item": "...", "category": "nice-to-have" }
  ]
}

Статуси: "hot", "rising", "stable", "declining". Impact/effort: "high", "medium", "low".`
      }]
    });

    const raw = message.content[0].text.trim();
    return safeParseJson(raw);
}

// UX/CRO тренди 2026
app.post('/trends', async (req, res) => {
  try {
    const { category, niche } = req.body;
    res.json(await generateUxTrendReport({ category, niche }));
  } catch (error) {
    console.error('Помилка трендів:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/monitoring/status', (req, res) => {
  res.json({
    generatedAt: new Date().toISOString(),
    ...buildMonitoringSummary()
  });
});

app.post('/monitoring/competitors/run', async (req, res) => {
  try {
    const targets = (Array.isArray(req.body?.targets) && req.body.targets.length)
      ? req.body.targets
      : collectCompetitorMonitorTargets(Number(req.body?.limit || 5));
    const cleanTargets = targets
      .map(item => ({
        keyword: plainOneLine(item.keyword || item.searchQuery || item.productName || ''),
        productName: plainOneLine(item.productName || item.name || item.keyword || ''),
        url: plainOneLine(item.url || ''),
        competitorUrls: cleanCompetitorUrls(item.competitorUrls || [])
      }))
      .filter(item => item.keyword || item.productName)
      .slice(0, 8);

    const results = [];
    for (const target of cleanTargets) {
      const research = await buildGenerationResearch({
        productName: target.productName || target.keyword,
        keywords: target.keyword || target.productName,
        isHtml: true,
        competitorUrls: target.competitorUrls,
        force: true
      });
      results.push({ target, research });
    }

    const generatedAt = new Date().toISOString();
    const run = {
      generatedAt,
      generatedAtLocal: new Date().toLocaleString('uk-UA'),
      targetsChecked: results.length,
      competitorsAnalyzed: results.reduce((sum, item) => sum + Number(item.research?.competitorsAnalyzed || 0), 0),
      results: results.map(item => ({
        keyword: item.target.keyword || item.target.productName,
        productName: item.target.productName,
        url: item.target.url,
        competitorsAnalyzed: item.research?.competitorsAnalyzed || 0,
        competitorUrls: (item.research?.competitorUrls || []).slice(0, 10),
        competitorPriceSignals: item.research?.competitorPriceSignals || [],
        changedOrImproved: [
          ...(item.research?.seoPatterns || []).slice(0, 2),
          ...(item.research?.uxRequirements || []).slice(0, 2)
        ],
        gaps: (item.research?.contentGaps || []).slice(0, 4),
        advantages: (item.research?.uniqueAngle ? [item.research.uniqueAngle] : []).slice(0, 2)
      })),
      risks: results.flatMap(item => (item.research?.contentGaps || []).slice(0, 2)).slice(0, 8),
      advantages: results.map(item => item.research?.uniqueAngle).filter(Boolean).slice(0, 8)
    };

    const current = readCompetitorMonitor();
    writeCompetitorMonitor({
      targets: current.targets.length ? current.targets : cleanTargets,
      runs: [run, ...current.runs]
    });
    res.json({ ok: true, run, summary: buildMonitoringSummary().competitors });
  } catch (error) {
    console.error('competitor monitoring error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/monitoring/ux/run', async (req, res) => {
  try {
    const category = req.body?.category || 'e-commerce';
    const niche = req.body?.niche || 'спеціалті кава та чай';
    const report = await generateUxTrendReport({ category, niche });
    const run = {
      generatedAt: new Date().toISOString(),
      generatedAtLocal: new Date().toLocaleString('uk-UA'),
      category: report.category || category,
      niche,
      report,
      actions: (report.topRecommendations || []).map(item => item.action || '').filter(Boolean).slice(0, 8),
      verification: (report.checklist || []).map(item => item.item || '').filter(Boolean).slice(0, 12)
    };
    const current = readUxMonitor();
    writeUxMonitor({ runs: [run, ...current.runs] });
    res.json({ ok: true, run, summary: buildMonitoringSummary().ux });
  } catch (error) {
    console.error('ux monitoring error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PLATFORM_GUIDES = {
  opencart: {
    name: 'OpenCart',
    paths: {
      товару:    'Адмін → Каталог → Товари → [товар] → вкладка "Опис" → кнопка Source (</>)',
      категорії: 'Адмін → Каталог → Категорії → [категорія] → вкладка "Опис" → кнопка Source (</>)',
      головна:   'Адмін → Design → Layouts → Home (або System → Settings → Store → тема)',
      meta:      'Адмін → Каталог → Товари / Категорії → вкладка "SEO" або "Meta"',
      schema:    'Адмін → Extensions → Extensions → тип "SEO" → знайти SEO-розширення, або редагувати header.tpl через FTP',
      breadcrumbs: 'Адмін → System → Settings → вкладка "Server", або через тему — breadcrumb.tpl',
      default:   'Адмін OpenCart → відповідний розділ'
    },
    notes: 'OpenCart підтримує повний HTML+CSS в описі товарів та категорій через TinyMCE. Для головної та Schema.org потрібні розширення або правка шаблонів.'
  },
  prom: {
    name: 'Prom.ua',
    paths: {
      товару:    'Кабінет Prom → Товари → [товар] → поле "Опис" → кнопка HTML',
      категорії: 'Кабінет Prom → Товари → Категорії → [категорія] → поле "Опис"',
      головна:   'Кабінет Prom → Сайт → Дизайн → Блоки головної сторінки',
      meta:      'Кабінет Prom → Товари → [товар] → вкладка "SEO" → Title / Description',
      schema:    'Prom.ua генерує Schema.org автоматично для товарів',
      default:   'Кабінет Prom → відповідний розділ'
    },
    notes: 'Prom.ua підтримує базовий HTML. Schema.org генерується автоматично. Для головної — редактор блоків.'
  },
  woocommerce: {
    name: 'WooCommerce',
    paths: {
      товару:    'WordPress Адмін → Товари → [товар] → блок "Опис товару" → кнопка Text',
      категорії: 'WordPress Адмін → Товари → Категорії → [категорія] → поле "Опис"',
      головна:   'WordPress Адмін → Зовнішній вигляд → Редактор / Widgets / Page Builder',
      meta:      'Встановити Yoast SEO або RankMath → заповнити SEO Title / Description на сторінці товару',
      schema:    'Yoast SEO або RankMath генерують Schema.org автоматично після встановлення',
      default:   'WordPress Адмін → відповідний розділ'
    },
    notes: 'WooCommerce: для SEO використовуй Yoast SEO або RankMath — вони автоматизують meta та Schema.org.'
  },
  horoshop: {
    name: 'Horoshop',
    paths: {
      товару:    'Адмін → Товари → [товар] → вкладка "Опис" → кнопка HTML',
      категорії: 'Адмін → Каталог → Категорії → [категорія] → поле "Опис"',
      головна:   'Адмін → Дизайн → Редактор сторінок → Головна',
      meta:      'Адмін → Товари → [товар] → вкладка "SEO"',
      schema:    'Horoshop генерує Schema.org автоматично',
      default:   'Адмін Horoshop → відповідний розділ'
    },
    notes: 'Horoshop підтримує HTML в описі. Schema.org генерується платформою автоматично.'
  },
  shopify: {
    name: 'Shopify',
    paths: {
      товару:    'Admin → Products → [товар] → поле Description → кнопка "<>" (Show HTML)',
      категорії: 'Admin → Products → Collections → [колекція] → поле Description',
      головна:   'Admin → Online Store → Themes → Customize → Home Page секції',
      meta:      'Admin → Products → [товар] → розділ "Search engine listing preview" → Edit',
      schema:    'Shopify генерує базовий Schema.org автоматично. Для розширеного — Apps → SEO',
      default:   'Shopify Admin → відповідний розділ'
    },
    notes: 'Shopify: meta і базова Schema.org генеруються автоматично. Для головної — Customize у Theme Editor.'
  }
};

// Реалізація рекомендації на конкретній платформі
app.post('/implement', async (req, res) => {
  try {
    const { recommendation, platform, context, type } = req.body;
    if (!recommendation) return res.status(400).json({ error: 'Рекомендація обовʼязкова' });

    const guide = PLATFORM_GUIDES[platform] || PLATFORM_GUIDES.opencart;

    // Визначаємо тип задачі та правильний шлях
    const rec = recommendation.toLowerCase();
    const pageTypeKey = context?.includes('головн') ? 'головна'
      : context?.includes('категорі') ? 'категорії'
      : 'товару';

    const taskKey = rec.includes('schema') || rec.includes('structured') ? 'schema'
      : rec.includes('breadcrumb') || rec.includes('хлібн') ? 'breadcrumbs'
      : rec.includes('meta') || rec.includes('title') || rec.includes('description') ? 'meta'
      : pageTypeKey;

    const wherePath = guide.paths[taskKey] || guide.paths[pageTypeKey] || guide.paths.default;

    // Чи потрібен HTML код
    const isCodeTask = type === 'html'
      || ['FAQ', 'блок відгук', 'секці', 'картк', 'grid', 'бейдж', 'banner'].some(k => rec.includes(k.toLowerCase()))
      && !['schema', 'meta', 'title', 'breadcrumb', 'хлібн', 'canonical', 'og:'].some(k => rec.includes(k));

    // Чи це технічна задача що потребує розширення/файлів
    const needsExtension = ['schema', 'structured data', 'breadcrumb', 'хлібн', 'canonical'].some(k => rec.includes(k))
      && (platform === 'opencart');

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{
        role: 'user',
        content: `Ти — e-commerce консультант. Допоможи власнику магазину реалізувати рекомендацію БЕЗ програміста.

Рекомендація: "${recommendation}"
Платформа: ${guide.name}
Тип сторінки: ${pageTypeKey}
Правильний шлях для цієї задачі: ${wherePath}
Примітки: ${guide.notes}
${needsExtension ? 'ВАЖЛИВО: Ця задача на OpenCart зазвичай потребує SEO-розширення (extension), а НЕ редагування опису товару. Порекомендуй безкоштовне розширення або правильний підхід.' : ''}

${isCodeTask ? 'Згенеруй готовий HTML/CSS код + кроки.' : 'Покрокова інструкція без коду.'}

Поверни ТІЛЬКИ валідний JSON (рядки до 200 символів):
{
  "hasCode": ${isCodeTask && !needsExtension},
  "code": "",
  "whereToInsert": "${wherePath}",
  "steps": [
    { "step": 1, "title": "назва", "action": "конкретна дія зрозуміла без технічних знань", "time": "X хв" }
  ],
  "result": "що зміниться після втілення",
  "difficulty": "easy"
}

Кроки — максимум 5, максимально прості для власника без технічних знань.`
      }]
    });

    const raw = message.content[0].text.trim();
    const data = await parseAiJson(raw, 'generate-ads');
    data.platformName = guide.name;
    data.whereToInsert = wherePath;
    res.json(data);

  } catch (error) {
    console.error('Помилка реалізації:', error.message);
    res.status(500).json({ error: error.message });
  }
});

function seoGapTaskType(text = '') {
  const normalized = String(text || '').toLowerCase();
  if (/breadcrumb|breadcrumbs|хлібн|крихт/.test(normalized)) return 'breadcrumbs';
  if (/schema|json-ld|structured|структурован|мікророзмітк|мікроразмет|schema\.org/.test(normalized)) return 'product_schema';
  if (/meta\s*description|мета\s*опис|meta\s*опис/.test(normalized)) return 'meta_description';
  if (/\btitle\b|seo\s*title|тайтл|заголовок\s*title/.test(normalized)) return 'meta_title';
  if (/h1|н1|головн(ий|ого)\s+заголов/.test(normalized)) return 'h1';
  if (/faq|часті\s+питання|питання\s+відповід/.test(normalized)) return 'faq';
  return 'manual';
}

app.post('/seo/apply-gap', async (req, res) => {
  try {
    return res.status(409).json({
      error: 'Пряме SEO-внесення вимкнено. Відкрийте SEO Center і використайте: fix preview → підтвердження → внесення → readback.',
      code: 'SEO_APPROVAL_WORKFLOW_REQUIRED'
    });
    const { myUrl = '', pageType = '', platform = 'opencart', recommendation = '', gap = {} } = req.body || {};
    const allowedRequestedTasks = new Set(['product_schema', 'h1', 'meta_title', 'meta_description']);
    const requestedTask = String(req.body?.task || '').trim();
    const detectedTask = seoGapTaskType(`${recommendation} ${gap.element || ''} ${gap.description || ''}`);
    const task = allowedRequestedTasks.has(requestedTask) ? requestedTask : detectedTask;
    if (String(platform || 'opencart') !== 'opencart') {
      return res.status(400).json({ error: 'Автоматичне внесення зараз підключене тільки для OpenCart.' });
    }
    if (!String(pageType || '').toLowerCase().includes('товар')) {
      return res.status(400).json({ error: 'Автоматичне внесення поки працює тільки для сторінок товарів.' });
    }
    if (!myUrl) return res.status(400).json({ error: 'Потрібен URL сторінки товару.' });

    if (task === 'product_schema') {
      const applied = await postBridge('seo_apply_product_schema', { url: myUrl });
      return res.json({
        ok: true,
        applied: true,
        task,
        title: 'Product JSON-LD додано/оновлено',
        message: 'Mercato AI сам вніс Schema.org Product у HTML-опис товару через OpenCart bridge.',
        result: applied
      });
    }

    if (['h1', 'meta_title', 'meta_description'].includes(task)) {
      const applied = await postBridge('seo_apply_product_basics', { url: myUrl, task });
      const labels = {
        h1: 'H1 товару додано/оновлено',
        meta_title: 'SEO title додано/оновлено',
        meta_description: 'Meta description додано/оновлено'
      };
      return res.json({
        ok: true,
        applied: true,
        task,
        title: labels[task],
        message: 'Mercato AI сам вніс базову SEO-правку через OpenCart bridge.',
        result: applied
      });
    }

    return res.status(400).json({
      error: 'Для цього SEO-пункту авто-внесення ще не підключене.',
      task,
      next: 'Система може показати інструкцію, але запис на сайт поки підтриманий для Product JSON-LD, H1, SEO title і meta description.'
    });
  } catch (error) {
    const isUnknownAction = /Unknown action/i.test(error.message || '');
    const isBridgeSecretMissing = /Bridge secret is not configured/i.test(error.message || '');
    res.status(500).json({
      error: isBridgeSecretMissing
        ? 'На хостингу немає mercato-bridge-secrets.php або в ньому не заданий BRIDGE_SECRET. Завантаж файл mercado-bridge-secrets.php поруч із mercado-bridge.php.'
        : isUnknownAction
          ? 'На сайті ще стара версія mercado-bridge.php. Завантаж оновлений файл, після цього кнопка зможе вносити SEO-правки автоматично.'
          : explainBridgeError(error),
      raw: String(error.message || error)
    });
  }
});

// Підказки ключових слів з Google Autocomplete
async function fetchGoogleSuggest(query) {
  const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}&hl=uk&gl=ua`;
  try {
    const r = await fetch(url);
    const buffer = await r.arrayBuffer();
    const text = new TextDecoder('windows-1251').decode(buffer);
    const data = JSON.parse(text);
    return data[1] || [];
  } catch {
    return [];
  }
}

app.post('/suggest-keywords', async (req, res) => {
  try {
    const { productName, pageUrl } = req.body;
    if (!productName && !pageUrl) return res.status(400).json({ error: 'Введіть назву товару або URL' });

    const base = productName || pageUrl;

    // Паралельно тягнемо підказки по кільком запитам
    const [s1, s2, s3] = await Promise.all([
      fetchGoogleSuggest(base),
      fetchGoogleSuggest(`купити ${base}`),
      fetchGoogleSuggest(`${base} ціна`)
    ]);

    // Унікальні підказки
    const all = [...new Set([...s1, ...s2, ...s3])].slice(0, 25);
    if (!all.length) return res.json({ keywords: [], note: 'Google не повернув підказок. Спробуйте інший запит.' });

    // Claude класифікує і ранжує
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: `Класифікуй ці ключові слова для Google Ads кампанії. Продукт: "${base}".

Ключові слова:
${all.map((k, i) => `${i + 1}. ${k}`).join('\n')}

Поверни ТІЛЬКИ JSON:
{
  "keywords": [
    {
      "text": "ключове слово",
      "intent": "transactional",
      "note": "коротка причина чому добре або погано для реклами",
      "recommended": true
    }
  ]
}

intent: "transactional" (купити/замовити/ціна — найкращі для реклами), "informational" (як/що/чому), "navigational" (бренд/сайт).
recommended: true тільки для transactional з комерційним наміром.`
      }]
    });

    const data = safeParseJson(message.content[0].text.trim());
    res.json(data);

  } catch (error) {
    console.error('Помилка підказок:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Генерація рекламних текстів — Google Ads RSA + Meta Ads + TikTok Ads
app.post('/generate-ads', async (req, res) => {
  try {
    const { pageUrl, productName, keyword, price, usp, audience } = req.body;
    if (!pageUrl && !productName) return res.status(400).json({ error: "Вставте посилання або вкажіть назву товару" });
    if (!keyword) return res.status(400).json({ error: "Ключове слово обов'язкове" });

    // Паралельно: завантажуємо цільову сторінку + Google-видачу
    const searchQuery = `купити ${keyword} Україна`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}&gl=ua&hl=uk&num=10`;

    const [pageResult, searchResult] = await Promise.all([
      pageUrl ? fetchPage(pageUrl.startsWith('http') ? pageUrl : `https://${pageUrl}`, BROWSER_HEADERS) : Promise.resolve({ html: '' }),
      fetchPage(searchUrl, BROWSER_HEADERS)
    ]);

    const hasPage = pageResult.html && pageResult.html.length > 500;
    const hasSearch = searchResult.html && searchResult.html.length > 2000;

    // Визначаємо тип сторінки за URL
    let pageType = 'сторінка товару';
    if (pageUrl) {
      try {
        const urlPath = new URL(pageUrl.startsWith('http') ? pageUrl : `https://${pageUrl}`).pathname;
        if (urlPath === '/' || urlPath === '') pageType = 'головна сторінка магазину';
        else if ((urlPath.match(/\//g) || []).length <= 2 && !/\d{5,}/.test(urlPath)) pageType = 'сторінка категорії';
      } catch {}
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `Ти — senior PPC-спеціаліст з 10+ роками e-commerce досвіду. Три задачі в одному запиті.

ТИП СТОРІНКИ: ${pageType}
ПОСИЛАННЯ: ${pageUrl || ''}
ПРОДУКТ / НАЗВА: ${productName || '(витягти зі сторінки)'}
КЛЮЧОВЕ СЛОВО (Google Ads): ${keyword}
ЦІНА: ${price || '(витягти зі сторінки або не вказана)'}
ГОЛОВНА ПЕРЕВАГА: ${usp || '(витягти зі сторінки або визначити самостійно)'}
АУДИТОРІЯ: ${audience || '(визначити зі змісту сторінки)'}
${hasPage
  ? `\n=== ЗМІСТ ЦІЛЬОВОЇ СТОРІНКИ (${pageUrl}) ===\n${pageResult.html.substring(0, 14000)}\n=== КІНЕЦЬ СТОРІНКИ ===\nВитягни: назву, ціну, ключові переваги, характеристики, аудиторію.\n`
  : pageUrl ? '\n(Сторінка недоступна — генеруй на основі ключового слова та наданих даних)\n' : ''
}
${hasSearch
  ? `\n=== ДАНІ ПОШУКОВОЇ ВИДАЧІ GOOGLE (запит: "${searchQuery}") ===\n${searchResult.html.substring(0, 10000)}\n=== КІНЕЦЬ ВИДАЧІ ===\n`
  : '\n(Дані Google-видачі недоступні — аналізуй конкурентів на основі знань про нішу)\n'
}

ЗАДАЧА 1 — РОЗВІДКА РИНКУ:
Проаналізуй що роблять конкуренти в рекламі цього продукту: які гачки, USP, паттерни заголовків.
Знайди де їх слабкі місця і який унікальний кут дасть перевагу.

ЗАДАЧА 2 — GOOGLE ADS RSA (15 заголовків + 4 описи):
Правила Google:
- Заголовки: СТРОГО ≤30 символів разом з пробілами (Google обріже якщо більше!)
- Описи: СТРОГО ≤90 символів
- Різноманітність типів: ключ.слово, бренд, перевага, ціна, соц.доказ, заклик, питання
- Включи ключове слово в 2-3 заголовки природньо
- Уникай CAPS LOCK і знаків оклику в кожному заголовку

ЗАДАЧА 3 — META ADS (Facebook/Instagram), 3 A/B варіанти:
Правила Meta:
- Гачок: перший рядок змушує зупинити скрол — питання, протиріччя, цифра, що дивує
- Текст: природньо, без "Купуйте!", без клішованих фраз типу "найкраща якість"
- Headline (під фото): до 40 символів, конкретна вигода
- A = Раціональний (факти, характеристики, для тих хто порівнює)
- B = Емоційний (відчуття, момент, досвід, для тих хто шукає натхнення)
- C = Соціальний доказ / FOMO (що обирають інші, обмеженість, тренд)

Поверни ТІЛЬКИ валідний JSON:
- КРИТИЧНО: не використовуй подвійні лапки всередині значень рядків. Якщо треба виділити слово — використовуй одинарні лапки або без лапок.
- КРИТИЧНО: не вставляй перенос рядка всередині JSON string, використовуй короткі однорядкові значення.
- КРИТИЧНО: кожен обʼєкт і кожне поле має мати правильну кому.
{
  "research": {
    "competitorPatterns": [
      { "pattern": "назва паттерну", "frequency": "більшість/частина/рідко", "isGap": false, "note": "коментар" }
    ],
    "marketGaps": ["слабке місце конкурентів 1", "слабке місце 2", "слабке місце 3"],
    "ourAngle": "рекомендований кут атаки для цього конкретного продукту — 1-2 речення",
    "dataSource": "${hasSearch ? 'google_serp' : 'knowledge_base'}"
  },
  "googleAds": {
    "headlines": [
      { "text": "≤30 символів", "chars": 0, "type": "keyword", "note": "чому сильний" },
      { "text": "≤30 символів", "chars": 0, "type": "brand", "note": "..." },
      { "text": "≤30 символів", "chars": 0, "type": "usp", "note": "..." },
      { "text": "≤30 символів", "chars": 0, "type": "price", "note": "..." },
      { "text": "≤30 символів", "chars": 0, "type": "social_proof", "note": "..." },
      { "text": "≤30 символів", "chars": 0, "type": "cta", "note": "..." },
      { "text": "≤30 символів", "chars": 0, "type": "keyword", "note": "..." },
      { "text": "≤30 символів", "chars": 0, "type": "usp", "note": "..." },
      { "text": "≤30 символів", "chars": 0, "type": "emotional", "note": "..." },
      { "text": "≤30 символів", "chars": 0, "type": "question", "note": "..." },
      { "text": "≤30 символів", "chars": 0, "type": "brand", "note": "..." },
      { "text": "≤30 символів", "chars": 0, "type": "usp", "note": "..." },
      { "text": "≤30 символів", "chars": 0, "type": "cta", "note": "..." },
      { "text": "≤30 символів", "chars": 0, "type": "social_proof", "note": "..." },
      { "text": "≤30 символів", "chars": 0, "type": "keyword", "note": "..." }
    ],
    "descriptions": [
      { "text": "≤90 символів — конкретна перевага + заклик", "chars": 0, "angle": "Переваги + CTA" },
      { "text": "≤90 символів — соціальний доказ + довіра", "chars": 0, "angle": "Соц. доказ" },
      { "text": "≤90 символів — подолання головного заперечення", "chars": 0, "angle": "Заперечення" },
      { "text": "≤90 символів — терміновість або ексклюзивність", "chars": 0, "angle": "Терміновість" }
    ],
    "assemblyTip": "яку комбінацію з 3 заголовків + 1 описи запустити першою і чому"
  },
  "metaAds": [
    {
      "variant": "A",
      "strategy": "Раціональний",
      "strategyNote": "Для тих хто порівнює — факти, характеристики, конкретні цифри",
      "hook": "перший рядок що зупиняє скрол — до 100 символів",
      "primaryText": "основний текст 150-250 символів — природньо, без клішованих фраз",
      "headline": "заголовок під фото до 40 символів",
      "cta": "Замовити"
    },
    {
      "variant": "B",
      "strategy": "Емоційний",
      "strategyNote": "Для тих хто шукає натхнення — відчуття, момент, досвід",
      "hook": "...",
      "primaryText": "...",
      "headline": "...",
      "cta": "Дізнатись більше"
    },
    {
      "variant": "C",
      "strategy": "Соціальний доказ",
      "strategyNote": "Що обирають інші — тренд, кількість, дефіцит лоту",
      "hook": "...",
      "primaryText": "...",
      "headline": "...",
      "cta": "Замовити зараз"
    }
  ],
  "tiktokAds": [
    {
      "variant": "A",
      "strategy": "Проблема/рішення",
      "duration": "15-20 сек",
      "hook": "перші 2 секунди — до 90 символів",
      "scenes": [
        { "time": "0-2с", "visual": "що показати в кадрі", "textOverlay": "текст на екрані" },
        { "time": "3-7с", "visual": "...", "textOverlay": "..." },
        { "time": "8-14с", "visual": "...", "textOverlay": "..." },
        { "time": "15-20с", "visual": "...", "textOverlay": "..." }
      ],
      "voiceover": "короткий текст дикторського голосу або текст для субтитрів",
      "caption": "підпис до ролика до 120 символів",
      "cta": "Дізнатись більше"
    },
    {
      "variant": "B",
      "strategy": "Демонстрація продукту",
      "duration": "15-25 сек",
      "hook": "...",
      "scenes": [],
      "voiceover": "...",
      "caption": "...",
      "cta": "Замовити"
    },
    {
      "variant": "C",
      "strategy": "Нативна порада",
      "duration": "15-25 сек",
      "hook": "...",
      "scenes": [],
      "voiceover": "...",
      "caption": "...",
      "cta": "Перейти на сайт"
    }
  ]
}`
      }]
    });

    const raw = message.content[0].text.trim();
    const data = await parseAiJson(raw, 'generate-ads');
    data.searchUsed = hasSearch;
    data.pageLoaded = hasPage;
    data.pageType = pageType;
    res.json(data);

  } catch (error) {
    console.error('Помилка генерації реклами:', error.message);
    res.status(500).json({ error: error.message });
  }
});

function isRecoverableAiGenerationError(error) {
  const text = aiErrorText(error).toLowerCase();
  return error?.provider === 'OpenAI'
    || isAiQuotaOrBillingError(error)
    || text.includes('порожній текст')
    || text.includes('json parse')
    || text.includes('valid json')
    || text.includes('невалідний json');
}

function pickEmailRecommendation({ productOffer = '', segmentData = null, customerData = null } = {}) {
  const fromOffer = String(productOffer || '').replace(/\s+/g, ' ').trim();
  if (fromOffer) return fromOffer.slice(0, 180);
  const product =
    segmentData?.topProducts?.[0]?.name
    || segmentData?.preferenceTags?.[0]
    || customerData?.topProducts?.[0]?.name
    || customerData?.orders?.[0]?.products?.[0]?.name
    || '';
  return product || 'добірку кави та чаю Mercato під ваш смак';
}

function localEmailBody({ audience, recommendation, bonus, scenario }) {
  const intro = audience
    ? `Доброго дня!\n\nМи подивились на ваші попередні покупки в Mercato і підготували спокійну рекомендацію: ${recommendation}.`
    : `Доброго дня!\n\nПідібрали для вас ${recommendation}, щоб було простіше обрати щось доречне до наступної чашки.`;
  const middle = scenario === 'reactivation'
    ? 'Якщо давно не повертались до замовлення, можна почати з невеликої упаковки або написати нам у відповідь — підкажемо, що буде ближче за смаком.'
    : 'Якщо хочеться повторити знайомий профіль або спробувати щось близьке, ця добірка буде хорошою відправною точкою.';
  const bonusLine = bonus ? `\n\n${bonus}` : '';
  return sanitizeOwnerNameInText(`${intro}\n\n${middle}${bonusLine}\n\nЗ повагою, ${STORE_OWNER_SIGNATURE}`);
}

function buildLocalEmailFallback({ scenario, productOffer, goal, discount, segmentData, customerData, coupon, aiError }) {
  const recommendation = pickEmailRecommendation({ productOffer, segmentData, customerData });
  const ctaUrl = firstUrlFromText(productOffer) || segmentData?.categoryUrl || customerData?.categoryUrl || 'https://mercato.com.ua/';
  const audience = customerData?.name
    || [customerData?.firstname, customerData?.lastname].filter(Boolean).join(' ')
    || segmentData?.title
    || '';
  const couponText = coupon
    ? `Для цього листа можна використати персональний бонус ${coupon.discount}${coupon.type === 'F' ? ' грн' : '%'} протягом ${coupon.days || 14} днів.`
    : discount
      ? `Бонус: ${discount}.`
      : '';
  return {
    aiFallback: true,
    warning: `AI не дав стабільну відповідь, тому створено безпечний локальний драфт без Anthropic. Причина: ${aiErrorBrief(aiError)}`,
    strategy: {
      segment: audience || 'клієнти Mercato',
      mainAngle: goal || 'мʼяко повернути до наступного замовлення через релевантну рекомендацію',
      timing: 'після ручної перевірки тексту',
      personalization: ['історія покупок', 'смаковий профіль або категорія']
    },
    emails: [
      {
        name: 'Email 1',
        subject: 'Підібрали варіант під ваш смак',
        preheader: 'Коротка рекомендація від Mercato',
        body: localEmailBody({ audience, recommendation, bonus: couponText, scenario }),
        cta: 'Переглянути добірку',
        ctaUrl,
        whyItWorks: 'Лист не вигадує факти, не тисне і веде до безпечної категорії або сайту.'
      },
      {
        name: 'Email 2',
        subject: 'Є свіжа ідея до вашої чашки',
        preheader: 'Добірка кави та чаю без зайвого шуму',
        body: localEmailBody({
          audience,
          recommendation,
          bonus: couponText,
          scenario: 'reactivation'
        }),
        cta: 'Відкрити Mercato',
        ctaUrl,
        whyItWorks: 'Другий варіант коротший і підходить для повторного мʼякого контакту.'
      }
    ],
    sms: {
      text: 'Mercato підібрав кілька варіантів під ваш смак. Перегляньте добірку на сайті.',
      whenToUse: 'Тільки після email і без частих повторів.'
    },
    notes: ['Локальний fallback: перед масовою відправкою перевірити текст вручну.']
  };
}

function buildLocalEmailBatchFallback({ segment, customers, discount, aiError }) {
  return {
    aiFallback: true,
    warning: `AI не дав стабільну відповідь, тому створено локальні персональні драфти без Anthropic. Причина: ${aiErrorBrief(aiError)}`,
    segmentTitle: segment?.title || '',
    drafts: customers.map(customer => {
      const firstName = String(customer?.name || '').trim().split(/\s+/)[0] || '';
      const recommendation = customer?.recommendations?.[0]?.name
        || customer?.topProducts?.[0]?.name
        || segment?.topProducts?.[0]?.name
        || segment?.offerHint
        || 'добірку Mercato під ваш смак';
      const body = sanitizeOwnerNameInText([
        firstName ? `Доброго дня, ${firstName}!` : 'Доброго дня!',
        `Підібрали для вас ${recommendation}. Якщо хочеться повторити знайомий смак або спробувати щось близьке, це хороший варіант для наступного замовлення.`,
        discount ? `Бонус: ${discount}.` : '',
        `З повагою, ${STORE_OWNER_SIGNATURE}`
      ].filter(Boolean).join('\n\n'));
      return {
        customerId: customer.customer_id || customer.customerId || 0,
        name: customer.name || '',
        email: normalizeEmail(customer.email),
        canSend: Boolean(normalizeEmail(customer.email)) && customer?.spam?.canEmail !== false,
        reason: normalizeEmail(customer.email) ? '' : 'немає коректного email',
        subject: 'Підібрали варіант під ваш смак',
        preheader: 'Коротка рекомендація від Mercato',
        body,
        cta: 'Переглянути добірку',
        ctaUrl: customer?.recommendations?.[0]?.url || segment?.categoryUrl || 'https://mercato.com.ua/',
        personalOffer: recommendation,
        unsubscribeNote: 'Додати стандартний footer відписки перед відправкою.'
      };
    }),
    notes: ['Локальний fallback: перевірити тексти перед відправкою.']
  };
}

// Генерація email / retention сценаріїв
app.post('/generate-email', async (req, res) => {
  try {
    const { scenario, customerContext, productOffer, goal, discount, tone, segmentData, customerData, promoCodes = {}, coupon = null } = req.body;
    if (!scenario) return res.status(400).json({ error: 'Оберіть сценарій листа' });

    const scenarioLabels = {
      abandoned_cart: 'покинутий кошик',
      newsletter: 'персоналізована розсилка',
      reactivation: 'реактивація клієнта',
      post_purchase: 'лист після покупки'
    };

    const emailPromoCodes = normalizeEmailPromoCodes(promoCodes);
    const couponCondition = coupon
      ? `${coupon.discount}${coupon.type === 'F' ? ' грн' : '%'}, діє ${coupon.days} днів, одноразовий персональний промокод`
      : '(купон не створюється)';
    const orderIntelligence = buildEmailOrderIntelligence({ segmentData, customerData });
    const emailSafety = await buildEmailInventoryGuard({ productOffer, segmentData, customerData });

    const message = await client.messages.create({
      provider: EMAIL_AI_PROVIDER,
      fallback: false,
      model: 'claude-sonnet-4-6',
      max_tokens: 3500,
      messages: [{
        role: 'user',
        content: `Ти — retention/email-маркетолог для Mercato, українського магазину specialty кави та чаю.

Згенеруй email-пакет для сценарію: ${scenarioLabels[scenario] || scenario}.

Контекст клієнта або сегмента:
${customerContext || '(не вказано)'}

Дані сегмента з CRM/замовлень:
${segmentData ? JSON.stringify(segmentData, null, 2).substring(0, 9000) : '(не передано)'}

Дані конкретного клієнта з історією покупок:
${customerData ? JSON.stringify(customerData, null, 2).substring(0, 9000) : '(не передано)'}

АНАЛІТИКА ЗАМОВЛЕНЬ ДЛЯ ПЕРСОНАЛІЗАЦІЇ:
${orderIntelligence}

Товар / пропозиція:
${productOffer || '(визначити доречну пропозицію для кави/чаю Mercato)'}

${emailSafety.prompt}

Ціль листа:
${goal || '(підштовхнути до покупки без агресивного продажу)'}

Знижка / бонус:
${discount || '(не вказано)'}

Тон:
${tone || 'теплий, експертний, без тиску'}

Правила бренду:
- Мова тільки українська.
- Власника Mercato звати ${STORE_OWNER_NAME}; лист не може бути від Олега, Олексія, Алексія або будь-якого іншого імені. Якщо потрібен підпис — тільки "${STORE_OWNER_SIGNATURE}".
- Тон Mercato: теплий, експертний, людяний, без агресії; ніби власник магазину особисто пише клієнту після перегляду його історії покупок.
- Текст листа має бути коротким: 2-4 живі абзаци, 550-900 символів, без довгої "маркетингової" прелюдії.
- Без крику, маніпуляцій, штучного дефіциту і кліше типу 'найкраща якість'.
- Не змішуй усе підряд. Один лист = один простий кут: 1 минула покупка або смаковий профіль → 1-2 доречні рекомендації → 1 спокійний CTA.
- Не використовуй клієнтські CRM-терміни у тілі листа: "decaf-профіль", "preference profile", "сегмент", "директор", "guard", "тригери", "retention", "CTA".
- Не вставляй англійські слова там, де є нормальна українська: aftertaste = післясмак.
- Не давай баристські інструкції, якщо клієнт їх не просив. Достатньо 1 короткої смакової причини, чому товар може підійти.
- Якщо є історія покупок — використай її для персоналізації.
- Якщо є preference profile / улюблений товар — згадай конкретний товар або смаковий профіль природно, без відчуття стеження.
- Для кави говори про смак, свіжу обсмажку, спосіб заварювання, відчуття в чашці.
- Якщо передано сегмент — пиши не абстрактно, а під реальні ознаки сегмента: давність, частота, сума, улюблені товари.
- Якщо передано конкретного клієнта — зроби персональний лист із згадкою його реальних вподобань, але без зайвої навʼязливості.
- Аналізуй саме замовлення: що купували, коли востаннє, скільки разів, які товарні патерни повторюються, що логічно порадити далі.
- Не пропонуй товар, якщо inventory guard вище не підтвердив IN_STOCK. UNKNOWN = не пропонувати конкретно.
- Головна рекомендація має бути не "що завгодно безпечне", а 1-2 сорти або категорії, схожі на профіль клієнта: країна/походження, обробка, кислотність, тіло, солодкість, смак, спосіб заварювання.
- Decaf / каву без кофеїну не пропонуй за замовчуванням. Decaf доречний тільки якщо inventory guard прямо показує DECAF PROFILE = так.
- Для decaf / кави без кофеїну не пропонуй кофеїнові лоти як "схожі" або "альтернативу"; якщо немає безпечного decaf, краще чай або нейтральна категорійна рекомендація.
- Не використовуй технічні placeholder-и і шаблонні welcome-фрази у готовому тексті: жодних {{first_name}}, {{purchased_product}}, {{product}}, WELCOME, "Dear customer" або подібних змінних. Якщо даних бракує, пиши природно без змінної.
- У кожному email додай ctaUrl: якщо пропозиція містить URL товару або категорії — постав саме його; якщо ні — https://mercato.com.ua/.
- Не вигадуй конкретний промокод, дату завершення або код WELCOME, якщо конкретний код не передано. Якщо бонус доречний, пиши нейтрально: "персональний бонус" або "[ПРОМОКОД]".
- Якщо пізніше буде створено купон у UI, система сама замінить placeholder/старий welcome-код на реальний код і дату.

Поверни ТІЛЬКИ валідний JSON:
{
  "strategy": {
    "segment": "для кого цей лист",
    "mainAngle": "головний кут комунікації",
    "timing": "коли відправити",
    "personalization": ["що персоналізувати 1", "що персоналізувати 2"]
  },
  "emails": [
    {
      "name": "Email 1",
      "subject": "тема до 55 символів",
      "preheader": "preheader до 90 символів",
      "body": "готовий текст листа 900-1400 символів, з абзацами через \\n\\n",
      "cta": "короткий CTA",
      "ctaUrl": "https://mercato.com.ua/ або URL конкретного товару/категорії",
      "whyItWorks": "чому це спрацює"
    },
    {
      "name": "Email 2",
      "subject": "альтернативна тема до 55 символів",
      "preheader": "preheader до 90 символів",
      "body": "готовий текст листа",
      "cta": "короткий CTA",
      "ctaUrl": "https://mercato.com.ua/ або URL конкретного товару/категорії",
      "whyItWorks": "чому це спрацює"
    }
  ],
  "sms": {
    "text": "короткий SMS/Viber варіант до 160 символів",
    "whenToUse": "коли доречно використовувати"
  },
  "notes": ["практична порада 1", "практична порада 2"]
}`
      }]
    });

    const data = await parseAiJson(message.content[0].text.trim(), 'generate-email');
    applyEmailLinkDefaults(data, { productOffer });
    applyEmailSafetyGuards(data, emailSafety);
    applyPromoCodesToEmailDrafts(data, emailPromoCodes, couponCondition);
    res.json(data);
  } catch (error) {
    console.error('Помилка генерації email:', error.message);
    if (isRecoverableAiGenerationError(error)) {
      const { scenario, productOffer, goal, discount, segmentData, customerData, coupon = null } = req.body || {};
      return res.json(buildLocalEmailFallback({
        scenario,
        productOffer,
        goal,
        discount,
        segmentData,
        customerData,
        coupon,
        aiError: error
      }));
    }
    res.status(500).json({ error: error.message });
  }
});

function buildEmailOrderIntelligence({ segmentData = null, customerData = null } = {}) {
  const lines = [];
  if (customerData && typeof customerData === 'object') {
    const orders = Array.isArray(customerData.orders) ? customerData.orders : [];
    const products = orders.flatMap(order => (order.products || []).map(product => ({
      name: product.name,
      quantity: Number(product.quantity || 0),
      price: Number(product.price || 0),
      date: order.date_added || ''
    }))).filter(product => product.name);
    lines.push(`Клієнт: ${[customerData.firstname, customerData.lastname].filter(Boolean).join(' ') || customerData.name || 'без імені'}`);
    lines.push(`Email: ${customerData.email || 'не вказано'}`);
    lines.push(`Замовлень: ${customerData.order_count ?? orders.length}, сума: ${Math.round(Number(customerData.total_spent || 0)).toLocaleString('uk')} грн`);
    if (customerData.preferenceProfile?.summary) lines.push(`Профіль уподобань: ${customerData.preferenceProfile.summary}`);
    if (customerData.nextBestAction?.recommendation) lines.push(`Наступна найкраща дія: ${customerData.nextBestAction.recommendation}`);
    if (orders[0]?.date_added) lines.push(`Останнє замовлення: ${String(orders[0].date_added).slice(0, 10)} (${daysSince(orders[0].date_added) ?? '?'} днів тому)`);
    if (products.length) {
      const top = topItemsFromProducts(products.map(product => product.name), 8);
      lines.push(`Купував: ${top.map(item => `${item.name} x${item.count}`).join(', ')}`);
      lines.push(`Останні товари: ${products.slice(0, 8).map(product => `${product.name}${product.date ? ` (${String(product.date).slice(0, 10)})` : ''}`).join('; ')}`);
      lines.push(`Смакові/товарні теги: ${inferPreferenceTags(products.map(product => product.name)).join(', ') || 'не визначені'}`);
    }
  }

  if (segmentData && typeof segmentData === 'object') {
    const recipients = Array.isArray(segmentData.recipients) ? segmentData.recipients : [];
    const batch = Array.isArray(segmentData.batchPreview) ? segmentData.batchPreview : [];
    const sample = [...recipients.slice(0, 10), ...batch.slice(0, 10)]
      .filter((item, index, arr) => item?.email && arr.findIndex(x => x.email === item.email) === index)
      .slice(0, 12);
    lines.push(`Сегмент: ${segmentData.title || segmentData.id || 'без назви'}`);
    lines.push(`Клієнтів: ${segmentData.count || recipients.length || 0}, email-адресатів: ${recipients.filter(r => r.email && r.spam?.canEmail !== false).length}`);
    lines.push(`Виручка сегмента: ${Math.round(Number(segmentData.revenue || 0)).toLocaleString('uk')} грн, середній чек: ${Math.round(Number(segmentData.avgOrderValue || 0)).toLocaleString('uk')} грн`);
    if (segmentData.triggers?.length) lines.push(`Retention-тригери: ${segmentData.triggers.map(t => `${t.label}: ${t.count}`).join(', ')}`);
    if (segmentData.topProducts?.length) lines.push(`Найчастіше купували: ${segmentData.topProducts.slice(0, 8).map(p => `${p.name} x${p.count}`).join(', ')}`);
    if (segmentData.preferenceTags?.length) lines.push(`Патерни смаку/товарів: ${segmentData.preferenceTags.join(', ')}`);
    if (sample.length) {
      lines.push('Приклади клієнтів із сегмента:');
      sample.forEach(customer => {
        const products = (customer.topProducts || []).slice(0, 4).map(p => `${p.name} x${p.count}`).join(', ');
        const recs = (customer.recommendations || []).slice(0, 2).map(r => r.name).join(', ');
        const recent = (customer.recentOrders || []).slice(0, 2)
          .map(order => `${String(order.date || '').slice(0, 10)}: ${(order.products || []).slice(0, 3).join(', ')}`)
          .filter(Boolean)
          .join(' | ');
        lines.push(`- ${customer.name || customer.email}: ${customer.orderCount || 0} зам., останнє ${customer.lastOrder ? String(customer.lastOrder).slice(0, 10) : 'невідомо'}, купував: ${products || '-'}, останні замовлення: ${recent || '-'}, порадити: ${recs || customer.proposedOffer || '-'}`);
      });
    }
  }

  return lines.length ? lines.join('\n') : '(історія замовлень не передана; не вигадуй персональні факти)';
}

function normalizeEmailPromoCodes(promoCodes = {}) {
  return {
    email1: String(promoCodes.email1 || '').trim(),
    email2: String(promoCodes.email2 || '').trim()
  };
}

function applyPromoCodesToEmailDrafts(data, promoCodes, couponCondition) {
  if (!Array.isArray(data?.emails)) return;
  const codes = [promoCodes.email1, promoCodes.email2];

  data.emails.forEach((email, index) => {
    const code = codes[index];
    if (!code || typeof email?.body !== 'string' || email.body.includes(code)) return;
    email.body = `${stripOldCouponText(email.body)}\n\nВаш персональний промокод: ${code}\nУмова: ${couponCondition}.`;
  });
}

function firstUrlFromText(value = '') {
  const match = String(value || '').match(/https?:\/\/[^\s)]+/i);
  return match ? match[0].replace(/[),.]+$/, '') : '';
}

function mercatoSearchUrl(query = '') {
  const q = String(query || '').trim();
  if (!q) return 'https://mercato.com.ua/';
  return `https://mercato.com.ua/index.php?route=product/search&search=${encodeURIComponent(q)}`;
}

function normalizeProductText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDecafProductName(value = '') {
  return /(decaf|декаф|без\s*кофеїн|без\s*кофеин|безкофеїн|безкофеин)/i.test(String(value || ''));
}

function hasExactDecafTag(tags = []) {
  return (Array.isArray(tags) ? tags : [])
    .some(tag => String(tag || '').trim().toLowerCase() === 'decaf');
}

function isCoffeeProductName(value = '') {
  return /(кав|кофе|coffee|арабіка|arabica|robusta|еспресо|espresso|зерн)/i.test(String(value || ''));
}

function isTeaProductName(value = '') {
  return /(чай|tea|улун|пуер|матча|сенча|ройбуш|rooibos|трав)/i.test(String(value || ''));
}

function emailProductKind(name = '') {
  if (isTeaProductName(name)) return 'tea';
  if (isCoffeeProductName(name)) return 'coffee';
  return 'other';
}

function productAvailabilityState(product = {}) {
  const statusRaw = product.status ?? product.enabled ?? '';
  const statusKnown = statusRaw !== '' && statusRaw !== null && statusRaw !== undefined;
  const enabled = !statusKnown || Number(statusRaw) === 1 || String(statusRaw).toLowerCase() === 'enabled';
  const quantityRaw = product.quantity ?? product.qty ?? product.stock ?? '';
  const quantityKnown = quantityRaw !== '' && quantityRaw !== null && quantityRaw !== undefined && !Number.isNaN(Number(quantityRaw));
  const quantity = quantityKnown ? Number(quantityRaw) : null;
  const stockText = String(product.stock_status || product.stockStatus || product.availability || '').toLowerCase();
  const unavailableByText = /(нема|немає|відсут|закінч|out\s*of\s*stock|pre\s*order|предзаказ|очіку)/i.test(stockText);
  const availableByText = /(в\s*наяв|є\s*в\s*наяв|in\s*stock|available)/i.test(stockText);
  if (!enabled) return { available: false, label: 'OUT_OF_STOCK', reason: 'товар вимкнений' };
  if (quantityKnown) return quantity > 0
    ? { available: true, label: 'IN_STOCK', reason: `кількість ${quantity}` }
    : { available: false, label: 'OUT_OF_STOCK', reason: `кількість ${quantity}` };
  if (unavailableByText) return { available: false, label: 'OUT_OF_STOCK', reason: product.stock_status || 'stock status' };
  if (availableByText) return { available: true, label: 'IN_STOCK', reason: product.stock_status || 'stock status' };
  return { available: null, label: 'UNKNOWN', reason: 'немає quantity/stock_status у даних bridge' };
}

function productIdentity(product = {}) {
  return normalizeProductText([product.name, product.model, product.sku, product.keyword].filter(Boolean).join(' '));
}

function cachedInventoryProducts() {
  const cached = readSeoAuditCache().productAudit?.products || [];
  return Array.isArray(cached) ? cached : [];
}

function scoreInventoryMatch(query = '', product = {}) {
  const q = normalizeProductText(query);
  const name = normalizeProductText(product.name || '');
  const identity = productIdentity(product);
  if (!q || !identity) return 0;
  if (name === q) return 100;
  if (identity.includes(q)) return 80;
  const tokens = q.split(' ').filter(token => token.length > 2);
  if (!tokens.length) return 0;
  const hits = tokens.filter(token => identity.includes(token)).length;
  return Math.round((hits / tokens.length) * 60);
}

async function searchInventoryProduct(query = '') {
  const q = String(query || '').trim();
  if (!q || q.length < 3) return [];
  const cached = cachedInventoryProducts()
    .map(product => ({ ...product, matchScore: scoreInventoryMatch(q, product), source: 'seo_audit_cache' }))
    .filter(product => product.matchScore >= 50)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 4);
  if (cached.some(product => productAvailabilityState(product).available !== null)) return cached;
  try {
    const data = await callBridge('product_search', { q, limit: 6 });
    const live = (data.products || [])
      .map(product => ({ ...product, matchScore: scoreInventoryMatch(q, product), source: 'bridge_product_search' }))
      .filter(product => product.name)
      .sort((a, b) => b.matchScore - a.matchScore);
    return live.length ? live : cached;
  } catch (error) {
    return cached.map(product => ({ ...product, sourceError: error.message }));
  }
}

function collectEmailCandidateProductNames({ productOffer = '', segmentData = null, customerData = null } = {}) {
  const names = [];
  const add = (value) => {
    const clean = String(value || '').trim().replace(/^["'«“”]+|["'«“”]+$/g, '');
    if (clean.length >= 3 && !names.some(name => normalizeProductText(name) === normalizeProductText(clean))) names.push(clean);
  };
  for (const match of String(productOffer || '').matchAll(/["“«]([^"”»]{3,120})["”»]/g)) add(match[1]);
  String(productOffer || '')
    .split(/\n|;|\||,/)
    .map(part => part.trim())
    .filter(part => /(кава|чай|coffee|tea|decaf|декаф)/i.test(part))
    .filter(part => !/(не\s+пропон|тільки\s+товар|підібрати|якщо|наявност|останн(ій|ю)\s+товар|без\s+явн)/i.test(part))
    .forEach(add);
  const customerPools = [
    ...(Array.isArray(segmentData?.recipients) ? segmentData.recipients.slice(0, 3) : []),
    ...(Array.isArray(segmentData?.batchPreview) ? segmentData.batchPreview.slice(0, 3) : []),
    ...(Array.isArray(segmentData?.sampleCustomers) ? segmentData.sampleCustomers.slice(0, 3) : [])
  ];
  for (const customer of customerPools) {
    (customer.topProducts || []).slice(0, 3).forEach(item => add(item.name || item));
    (customer.recommendations || []).slice(0, 3).forEach(item => add(item.name || item));
    (customer.recentOrders || []).slice(0, 2).flatMap(order => order.products || []).forEach(add);
    if (customer.proposedOffer) add(customer.proposedOffer);
  }
  const isPersonalDirectorSegment = String(segmentData?.id || '').startsWith('director-')
    || String(segmentData?.actionId || '').startsWith('director-');
  if (!isPersonalDirectorSegment) {
    (segmentData?.topProducts || []).slice(0, 5).forEach(item => add(item.name || item));
  }
  const orders = Array.isArray(customerData?.orders) ? customerData.orders : [];
  orders.slice(0, 3).flatMap(order => order.products || []).forEach(product => add(product.name || product));
  return names.slice(0, 12);
}

function collectDecafEvidenceProductNames({ segmentData = null, customerData = null } = {}) {
  const names = [];
  const add = (value) => {
    const clean = String(value || '').trim();
    if (clean && !names.some(name => normalizeProductText(name) === normalizeProductText(clean))) names.push(clean);
  };
  const addCustomer = (customer) => {
    (customer?.topProducts || []).forEach(item => add(item.name || item));
    (customer?.recentOrders || []).forEach(order => (order.products || []).forEach(add));
  };
  const customerOrders = Array.isArray(customerData?.orders) ? customerData.orders : [];
  customerOrders.flatMap(order => order.products || []).forEach(product => add(product.name || product));

  const recipients = [
    ...(Array.isArray(segmentData?.recipients) ? segmentData.recipients : []),
    ...(Array.isArray(segmentData?.batchPreview) ? segmentData.batchPreview : []),
    ...(Array.isArray(segmentData?.sampleCustomers) ? segmentData.sampleCustomers : [])
  ];
  const uniqueRecipients = recipients
    .filter((item, index, arr) => item && (!item.email || arr.findIndex(x => x?.email === item.email) === index));
  if (uniqueRecipients.length === 1 || Number(segmentData?.count || 0) === 1) {
    uniqueRecipients.slice(0, 1).forEach(addCustomer);
  }
  return names;
}

function explicitDecafProfile(input = {}) {
  const evidenceProducts = collectDecafEvidenceProductNames(input);
  if (evidenceProducts.some(isDecafProductName)) return true;
  const customerTags = [
    ...(Array.isArray(input.customerData?.preferenceTags) ? input.customerData.preferenceTags : []),
    ...(Array.isArray(input.customerData?.preferenceProfile?.preferenceTags) ? input.customerData.preferenceProfile.preferenceTags : [])
  ];
  if (hasExactDecafTag(customerTags)) return true;
  const recipients = [
    ...(Array.isArray(input.segmentData?.recipients) ? input.segmentData.recipients : []),
    ...(Array.isArray(input.segmentData?.batchPreview) ? input.segmentData.batchPreview : []),
    ...(Array.isArray(input.segmentData?.sampleCustomers) ? input.segmentData.sampleCustomers : [])
  ].filter(Boolean);
  const uniqueRecipients = recipients
    .filter((item, index, arr) => !item.email || arr.findIndex(x => x?.email === item.email) === index);
  if (uniqueRecipients.length === 1) {
    const recipientTags = [
      ...(Array.isArray(uniqueRecipients[0].preferenceTags) ? uniqueRecipients[0].preferenceTags : []),
      ...(Array.isArray(uniqueRecipients[0].preferenceProfile?.preferenceTags) ? uniqueRecipients[0].preferenceProfile.preferenceTags : [])
    ];
    if (hasExactDecafTag(recipientTags)) return true;
  }
  return false;
}

async function buildEmailInventoryGuard(input = {}) {
  const candidateNames = collectEmailCandidateProductNames(input);
  const found = [];
  const seen = new Set();
  for (const name of candidateNames.slice(0, 8)) {
    const products = await searchInventoryProduct(name);
    for (const product of products.slice(0, 3)) {
      const key = normalizeProductText(product.name || product.keyword || product.url || '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const state = productAvailabilityState(product);
      found.push({
        name: product.name || name,
        url: product.routeUrl || product.url || '',
        kind: emailProductKind(product.name || name),
        decaf: isDecafProductName(product.name || name),
        status: state.label,
        available: state.available,
        reason: state.reason,
        source: product.source || 'unknown'
      });
    }
  }
  const decafProfile = explicitDecafProfile(input);
  const inStock = found.filter(product => product.available === true);
  const unavailable = found.filter(product => product.available === false);
  const unknown = found.filter(product => product.available === null);
  const caffeineBlocked = decafProfile
    ? inStock.filter(product => product.kind === 'coffee' && !product.decaf)
    : [];
  const allowed = decafProfile
    ? inStock.filter(product => product.kind !== 'coffee' || product.decaf)
    : inStock;
  const list = (items) => items.length
    ? items.slice(0, 8).map(item => `- ${item.name}${item.url ? ` (${item.url})` : ''} — ${item.status}; ${item.reason}`).join('\n')
    : '- немає';
  const prompt = `OWNER / INVENTORY SAFETY:
- Власника Mercato звати ${STORE_OWNER_NAME}. Якщо є підпис або фраза "від мене", використовуй тільки "${STORE_OWNER_SIGNATURE}". Заборонено підписуватись Олег, Олексій, Алексей або будь-яким іншим іменем.
- Конкретний товар можна пропонувати як покупку/CTA тільки якщо він у списку IN_STOCK нижче.
- Якщо товар OUT_OF_STOCK або UNKNOWN, його можна згадати лише як минулу покупку клієнта, але НЕ як "замовити", "спробувати", "рекомендую", CTA або предмет бонусу.
- DECAF PROFILE: ${decafProfile ? 'так, є явний decaf/без кофеїну в історії клієнта' : 'ні, decaf НЕ є профілем клієнта'}.
- Decaf / каву без кофеїну пропонуй ТІЛЬКИ якщо DECAF PROFILE = так. Не використовуй decaf як стандартну "безпечну" рекомендацію.
- Якщо DECAF PROFILE = так, НЕ пропонуй кофеїнову каву як альтернативу (Гватемала, Кенія, Ефіопія тощо), якщо вона не позначена як decaf. Якщо немає in-stock decaf, краще запропонувати чайну добірку або нейтральний вибір на сайті.
- Якщо DECAF PROFILE = ні, рекомендуй 1-2 сорти/категорії за смаковим профілем клієнта: країна, обробка, кислотність, тіло, смак, спосіб заварювання. Не пропонуй decaf.
- Якщо немає безпечного IN_STOCK товару, пиши категорійно: "підберу свіжий лот під ваш профіль" або "можна подивитися добірку", без назви конкретної кави.

IN_STOCK, які можна пропонувати:
${list(allowed)}

OUT_OF_STOCK, НЕ пропонувати:
${list(unavailable)}

UNKNOWN stock, НЕ пропонувати як конкретний товар без ручної перевірки:
${list(unknown)}

${caffeineBlocked.length ? `DECAF GUARD: ці кофеїнові кави НЕ пропонувати decaf-клієнту, навіть якщо вони in-stock:\n${list(caffeineBlocked)}` : ''}`;
  return { prompt, candidateNames, found, inStock: allowed, unavailable, unknown, decafProfile, caffeineBlocked };
}

function sanitizeOwnerNameInText(value = '') {
  return String(value || '')
    .replace(/\b(Олексій|Олег|Алексей|Oleksiy|Oleg|Alexey)\b(?=\s*,?\s*(Mercato|власник|команда|$))/giu, STORE_OWNER_NAME)
    .replace(/(мене звати|я\s*[—-]\s*)\s*(Олексій|Олег|Алексей|Oleksiy|Oleg|Alexey)\b/giu, `$1 ${STORE_OWNER_NAME}`)
    .replace(/(з повагою|тепло|щиро|з турботою|до зустрічі)[,\s\n]*(Олексій|Олег|Алексей|Oleksiy|Oleg|Alexey)\b/giu, `$1,\n${STORE_OWNER_SIGNATURE}`);
}

function escapeRegExpText(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function softenUnsafeProductRecommendation(text = '', productName = '', fallback = 'добірку Mercato у наявності') {
  const name = String(productName || '').trim();
  if (!text || !name || name.length < 4) return text;
  const recommendationVerb = '(рекоменд|пропон|замов|спроб|обер|перейд|візьм|підійд|раджу|можете\\s+повторити)';
  const escaped = escapeRegExpText(name);
  const nearBefore = new RegExp(`(${recommendationVerb}[^.!?\\n]{0,120})${escaped}`, 'giu');
  const nearAfter = new RegExp(`${escaped}([^.!?\\n]{0,120}${recommendationVerb})`, 'giu');
  return String(text)
    .replace(nearBefore, `$1${fallback}`)
    .replace(nearAfter, `${fallback}$1`);
}

function softenNonProfileDecafRecommendation(text = '') {
  const recommendationVerb = '(рекоменд|пропон|замов|спроб|обер|перейд|візьм|підійд|раджу|можете\\s+повторити|варто\\s+спробувати)';
  return String(text || '')
    .replace(new RegExp(`(${recommendationVerb}[^.!?\\n]{0,120})(каву\\s+без\\s+кофеїну|каву\\s+без\\s+кофеина|decaf|декаф)`, 'giu'), '$1каву у близькому смаковому профілі')
    .replace(new RegExp(`(кава\\s+без\\s+кофеїну|кава\\s+без\\s+кофеина|decaf|декаф)([^.!?\\n]{0,120}${recommendationVerb})`, 'giu'), 'кава у близькому смаковому профілі$2');
}

function sanitizeCustomerFacingEmailText(value = '') {
  return String(value || '')
    .replace(/\baftertaste\b/gi, 'післясмак')
    .replace(/\bpreference\s*profile\b/gi, 'ваш смак')
    .replace(/decaf[\s-]*профіл[ьюяі]*/giu, 'смак без кофеїну')
    .replace(/профіл[ьюяі]*\s+decaf/giu, 'смак без кофеїну')
    .replace(/\b(CRM|retention|CTA|guard|директор|сегмент|тригер[аиів]?|tracking)\b/giu, '')
    .replace(/коротк[ау]\s+передекстракц[іюя]/giu, 'коротший час екстракції')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function emailDraftSafetyIssues(draft = {}) {
  const customerText = [
    draft.subject,
    draft.preheader,
    draft.body,
    draft.cta
  ].map(value => String(value || '')).join('\n');
  const issues = [];
  const checks = [
    [/decaf\s*[-–—]?\s*профіл|профіл[^\n.!?]{0,70}decaf|decaf[^\n.!?]{0,70}профіл/iu, 'внутрішній термін decaf-профіль'],
    [/\bpreference\s*profile\b/iu, 'внутрішній термін preference profile'],
    [/\baftertaste\b/iu, 'англійське aftertaste у клієнтському тексті'],
    [/передекстракц/iu, 'технічна баристська інструкція передекстракції'],
    [/\b(CRM|retention|guard|CTA)\b/iu, 'внутрішній CRM/marketing термін'],
    [/(^|[\s,.;:])директор([а-яіїєґ]*)([\s,.;:]|$)/iu, 'внутрішній термін директор'],
    [/(^|[\s,.;:])сегмент([а-яіїєґ]*)([\s,.;:]|$)/iu, 'внутрішній термін сегмент']
  ];
  for (const [re, label] of checks) {
    if (re.test(customerText)) issues.push(label);
  }
  return [...new Set(issues)];
}

function assertEmailDraftSafe(draft = {}, label = 'лист') {
  const issues = emailDraftSafetyIssues(draft);
  if (issues.length) {
    throw new Error(`Лист заблоковано перед відправкою (${label}): ${issues.join('; ')}. Перегенеруй лист або відредагуй текст вручну.`);
  }
}

function applyEmailSafetyGuards(data, safety = {}) {
  if (!Array.isArray(data?.emails)) return;
  const unsafeProducts = [...(safety.unavailable || []), ...(safety.unknown || []), ...(safety.caffeineBlocked || [])];
  const fallbackProduct = safety.decafProfile
    ? 'чайну добірку Mercato'
    : 'добірку Mercato у наявності';
  for (const email of data.emails) {
    for (const key of ['subject', 'preheader', 'body', 'cta', 'whyItWorks']) {
      if (typeof email[key] === 'string') email[key] = sanitizeCustomerFacingEmailText(sanitizeOwnerNameInText(email[key]));
    }
    for (const product of unsafeProducts) {
      if (typeof email.body === 'string') email.body = softenUnsafeProductRecommendation(email.body, product.name, fallbackProduct);
      if (typeof email.whyItWorks === 'string') email.whyItWorks = softenUnsafeProductRecommendation(email.whyItWorks, product.name, fallbackProduct);
    }
    if (!safety.decafProfile) {
      if (typeof email.body === 'string') email.body = softenNonProfileDecafRecommendation(email.body);
      if (typeof email.subject === 'string') email.subject = softenNonProfileDecafRecommendation(email.subject);
      if (typeof email.preheader === 'string') email.preheader = softenNonProfileDecafRecommendation(email.preheader);
      if (typeof email.whyItWorks === 'string') email.whyItWorks = softenNonProfileDecafRecommendation(email.whyItWorks);
    }
    const unsafeCta = unsafeProducts.some(product => {
      const name = normalizeProductText(product.name || '');
      const url = String(product.url || '').trim();
      return (name && normalizeProductText(`${email.cta || ''} ${email.ctaUrl || ''}`).includes(name))
        || (url && String(email.ctaUrl || '').includes(url));
    });
    if (unsafeCta) {
      email.cta = 'Подивитися добірку Mercato';
      email.ctaUrl = 'https://mercato.com.ua/';
    }
  }
  data.notes = Array.isArray(data.notes) ? data.notes : [];
  data.notes.push(`Safety guard: власник ${STORE_OWNER_NAME}; конкретні товари дозволені тільки з IN_STOCK; decaf не змішуємо з кофеїновою кавою.`);
}

function replaceEmailPlaceholders(body = '', context = {}) {
  const firstName = String(context.firstName || '').trim() || 'друже';
  const purchasedProduct = String(context.purchasedProduct || '').trim() || 'ваша кава';
  const recommendedProduct = String(context.recommendedProduct || '').trim() || purchasedProduct;
  return String(body || '')
    .replace(/\{\{\s*(first_name|firstname|name)\s*\}\}/gi, firstName)
    .replace(/\{\{\s*(purchased_product|product_name|product)\s*\}\}/gi, purchasedProduct)
    .replace(/\{\{\s*(recommended_product|recommendation)\s*\}\}/gi, recommendedProduct)
    .replace(/\{\{\s*promo_?code\s*\}\}/gi, '[ПРОМОКОД]')
    .replace(/\{\{\s*[^}]+\s*\}\}/g, '');
}

function applyEmailLinkDefaults(data, { productOffer = '' } = {}) {
  if (!Array.isArray(data?.emails)) return;
  const offerUrl = firstUrlFromText(productOffer);
  for (const email of data.emails) {
    if (!email.cta) email.cta = 'Перейти на Mercato';
    if (!email.ctaUrl) email.ctaUrl = offerUrl || 'https://mercato.com.ua/';
    email.body = replaceEmailPlaceholders(email.body, {
      firstName: '',
      purchasedProduct: productOffer && !offerUrl ? productOffer : ''
    });
  }
}

function stripOldCouponText(body = '') {
  return String(body || '')
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(part => {
      const hasCouponSignal = /промокод|купон|welcome|персональн(ий|ого)\s+код|код\s+[a-z0-9_-]{3,}|діє\s+\d+\s*дн|термін\s+дії/i.test(part);
      const hasOfferSignal = /зниж|%|грн|бонус|код|діє|дн|welcome/i.test(part);
      return !(hasCouponSignal && hasOfferSignal);
    })
    .join('\n\n')
    .trim();
}

function normalizeCouponSettings(raw = {}) {
  const discount = Number(String(raw.discount || 10).replace(',', '.')) || 10;
  const type = String(raw.type || 'P').toUpperCase() === 'F' ? 'F' : 'P';
  const days = Math.max(1, Math.min(Number(raw.days || 7) || 7, 365));
  return { discount, type, days };
}

function extractCouponSettingsFromDraft(draft = {}) {
  if (draft.couponSettings || draft.couponCode) {
    return normalizeCouponSettings(draft.couponSettings || {});
  }

  const body = String(draft.body || '');
  const codeMatch = body.match(/\bMRC[A-Z0-9]{3,9}\b/i) || body.match(/\bMRC\d{2}-[A-Z0-9]{4,12}\b/i);
  if (!codeMatch) return null;

  const discountMatch = body.match(/(?:знижка|умова)\D{0,20}(\d+(?:[.,]\d+)?)\s*(грн|%)/i);
  return normalizeCouponSettings({
    discount: discountMatch?.[1] || 10,
    type: discountMatch?.[2] === 'грн' ? 'F' : 'P',
    days: draft.couponSettings?.days || 7
  });
}

function extractCouponCodeFromDraft(draft = {}) {
  const direct = String(draft.couponCode || draft.coupon_code || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
  if (direct) return direct;

  const body = String(draft.body || '');
  const match = body.match(/\bMRC[A-Z0-9]{3,9}\b/i) || body.match(/\bMRC\d{2}-[A-Z0-9]{4,12}\b/i);
  return match ? String(match[0]).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) : '';
}

function formatCouponDateUk(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('uk-UA');
}

function addServerCouponText(body, code, coupon = {}, dateEnd = '') {
  const settings = normalizeCouponSettings(coupon);
  const label = settings.type === 'F' ? `${settings.discount} грн` : `${settings.discount}%`;
  const validTo = dateEnd ? formatCouponDateUk(dateEnd) : `${settings.days} дн.`;
  return `${stripOldCouponText(body)}\n\nВаш персональний промокод: ${code}\nЗнижка: ${label}. Діє до: ${validTo}. Код діє для одного замовлення.`;
}

// ── STORE INTEGRATION (PHP Bridge) ───────────────────────────

function getBridgeUrl() {
  const bridgeUrl = connectionValue('BRIDGE_URL');
  const bridgeSecret = connectionValue('BRIDGE_SECRET');
  if (!bridgeUrl || !bridgeSecret) throw new Error('BRIDGE_URL або BRIDGE_SECRET не задано в .env або програмі');
  const raw = String(bridgeUrl).trim();
  try {
    return new URL(raw);
  } catch {
    if (/^mercato\.com\.ua/i.test(raw)) return new URL(`https://${raw}`);
    if (raw.startsWith('/')) return new URL(raw, connectionValue('OPENCART_URL') || 'https://mercato.com.ua');
    throw new Error(`Некоректний BRIDGE_URL у .env або програмі: ${raw}`);
  }
}

async function callBridge(action, params = {}, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || BRIDGE_READ_TIMEOUT_MS));
  const url = getBridgeUrl();
  url.searchParams.set('secret', connectionValue('BRIDGE_SECRET'));
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let r;
  let text;
  try {
    r = await fetch(url.toString(), { headers: BROWSER_HEADERS, signal: controller.signal });
    text = await r.text();
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`OpenCart bridge не відповів за ${timeoutMs}ms (${action}).`);
      timeoutError.code = 'BRIDGE_TIMEOUT';
      timeoutError.bridgeAction = action;
      timeoutError.bridgeTimeoutMs = timeoutMs;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  let data;
  try {
    data = parsePossiblyDirtyJson(text, `Bridge ${action}`);
  } catch {
    const contentType = r.headers.get('content-type') || 'unknown';
    const snippet = compactApiText(text) || 'порожня відповідь';
    const error = new Error(`Неочікувана відповідь від сервера магазину (HTTP ${r.status}, ${contentType}): ${snippet}`);
    error.bridgeStatus = r.status;
    error.bridgeContentType = contentType;
    error.bridgeEmptyResponse = !String(text || '').trim();
    throw error;
  }
  if (data.error) {
    const details = [data.error, data.message].filter(Boolean).join(': ');
    const error = new Error(details || 'OpenCart bridge error');
    error.bridgeData = data;
    error.bridgeStatus = r.status;
    throw error;
  }
  if (!r.ok) {
    const error = new Error(`OpenCart bridge повернув HTTP ${r.status} (${action}).`);
    error.bridgeStatus = r.status;
    throw error;
  }
  return data;
}

app.get('/bridge/health', async (req, res) => {
  try {
    const data = await callBridge('health');
    res.json({ ok: true, bridge: data });
  } catch (error) {
    res.status(500).json({ ok: false, error: explainBridgeError(error), raw: String(error.message || error) });
  }
});

app.get('/bridge/version', async (req, res) => {
  try {
    const data = await callBridge('version');
    res.json({ ok: true, bridge: data });
  } catch (error) {
    res.status(500).json({ ok: false, error: explainBridgeError(error), raw: String(error.message || error) });
  }
});

function bridgeFormBody(payload = {}, options = {}) {
  const body = new URLSearchParams();
  const b64Fields = new Set([
    'title',
    'metaDescription',
    'meta_description',
    'h1',
    'meta_h1',
    'productName',
    'name',
    'content',
    'description',
    'rightCard',
    'right_card'
  ]);
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    if (options.base64Html && b64Fields.has(key) && typeof value === 'string') {
      body.set(`${key}_b64`, Buffer.from(value, 'utf8').toString('base64'));
      continue;
    }
    if (typeof value === 'object') {
      body.set(key, JSON.stringify(value));
    } else {
      body.set(key, String(value));
    }
  }
  return body;
}

async function postBridgeRequest(action, payload = {}, mode = 'json') {
  const url = getBridgeUrl();
  url.searchParams.set('secret', connectionValue('BRIDGE_SECRET'));
  url.searchParams.set('action', action);
  const isForm = mode === 'form' || mode === 'form_b64';
  const body = isForm ? bridgeFormBody(payload, { base64Html: mode === 'form_b64' }).toString() : JSON.stringify(payload);

  let r;
  try {
    r = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': isForm ? 'application/x-www-form-urlencoded' : 'application/json'
      },
      body
    });
  } catch (fetchError) {
    if (mode === 'json') {
      console.warn(`Bridge ${action} POST failed for JSON body (${fetchError.message}); retrying as form body.`);
      return await postBridgeRequest(action, payload, 'form');
    }
    if (mode === 'form' && action === 'publish_content') {
      console.warn(`Bridge ${action} POST failed for form body (${fetchError.message}); retrying with base64 HTML fields.`);
      return await postBridgeRequest(action, payload, 'form_b64');
    }
    fetchError.bridgePostMode = mode;
    fetchError.bridgeAction = action;
    throw fetchError;
  }

  const text = await r.text();
  if (!text) {
    if (mode === 'json') {
      console.warn(`Bridge ${action} returned empty response for JSON POST; retrying as form body.`);
      return await postBridgeRequest(action, payload, 'form');
    }
    if (mode === 'form' && action === 'publish_content') {
      console.warn(`Bridge ${action} returned empty response for form POST; retrying with base64 HTML fields.`);
      return await postBridgeRequest(action, payload, 'form_b64');
    }
    const error = new Error(`Порожня відповідь від bridge (${action}) після JSON і form fallback`);
    error.bridgeStatus = r.status;
    error.bridgeContentType = r.headers.get('content-type') || 'unknown';
    error.bridgeEmptyResponse = true;
    throw error;
  }

  let data;
  try {
    data = parsePossiblyDirtyJson(text, `Bridge ${action} POST`);
  } catch (parseError) {
    if (mode === 'json') {
      return await postBridgeRequest(action, payload, 'form');
    }
    if (mode === 'form' && action === 'publish_content') {
      return await postBridgeRequest(action, payload, 'form_b64');
    }
    throw new Error(`Bridge response is not valid JSON: ${text.slice(0, 160)}`);
  }

  if (data.error) {
    if (
      action === 'publish_content' &&
      mode === 'json' &&
      /title\s+and\s+content\s+are\s+required/i.test(String(data.error || ''))
    ) {
      console.warn(`Bridge ${action} returned empty publish fields for JSON body; retrying with base64 form body.`);
      return await postBridgeRequest(action, payload, 'form_b64');
    }
    const error = new Error(data.error);
    error.bridgeData = data;
    throw error;
  }
  return data;
}

async function postBridge(action, payload = {}) {
  return await postBridgeRequest(action, payload, 'json');
}

function meaningfulContentProbe(content) {
  const text = stripHtml(content)
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = text.split(/(?<=[.!?])\s+/u).filter(s => s.length > 40);
  const candidates = [
    sentences.find(s => /смак|чашц|оброб|завар|кислот|солод/i.test(s)),
    sentences[1],
    sentences[0],
    text
  ].filter(Boolean);
  return candidates[0].slice(0, 90).trim();
}

async function verifyOpenCartPublish({ url = '', title = '', content = '', productId = '' } = {}) {
  if (!url) return { ok: false, checked: false, reason: 'Немає URL для перевірки.' };
  const urls = [
    `${url}${url.includes('?') ? '&' : '?'}_ai_verify=${Date.now()}`
  ];
  if (productId) {
    urls.push(`https://mercato.com.ua/index.php?route=product/product&product_id=${encodeURIComponent(productId)}&_ai_verify=${Date.now()}`);
  }
  let page = { html: '', error: '' };
  let checkedUrl = urls[0];
  for (const candidate of urls) {
    page = await fetchPage(candidate, BROWSER_HEADERS, 8000);
    checkedUrl = candidate;
    if (page.html && page.html.length >= 500) break;
  }
  if (!page.html || page.html.length < 500) {
    return { ok: false, checked: true, reason: page.error || 'Сторінка не завантажилась після запису.' };
  }
  const html = page.html;
  const text = stripHtml(html);
  const titleOk = title ? html.includes(title) || text.includes(title) : true;
  const probe = meaningfulContentProbe(content);
  const contentOk = probe ? text.includes(probe) || html.includes(probe) : true;
  return {
    ok: Boolean(titleOk && contentOk),
    checked: true,
    url: checkedUrl,
    titleOk,
    contentOk,
    probe,
    reason: titleOk && contentOk
      ? 'Зміни знайдено на сторінці товару.'
      : 'Bridge відповів успішно, але новий title/фрагмент опису не знайдено на живій сторінці. Перевірте БД readback і мовні рядки товару: найчастіша причина — запис пішов не в той language_id або сторінка показує кеш/інше поле.'
  };
}

function bridgeHasPublishDiagnostics(data = {}) {
  return (
    Object.prototype.hasOwnProperty.call(data, 'language_id')
    && Object.prototype.hasOwnProperty.call(data, 'descriptionAffectedRows')
    && Object.prototype.hasOwnProperty.call(data, 'contentLength')
  ) || Boolean(data.readback?.found || data.descriptionWrite?.ok || Array.isArray(data.languageRows));
}

function bridgeSupportsProductCommerce(data = {}) {
  const version = String(data.version || '');
  const features = Array.isArray(data.features) ? data.features : [];
  return features.includes('product_publish_now') || /product-commerce-v(2[2-9]|[3-9]\d+)/i.test(version);
}

function productSlugFromUrl(inputUrl) {
  try {
    const parsed = new URL(inputUrl);
    return decodeURIComponent((parsed.pathname.split('/').filter(Boolean).pop() || '').trim());
  } catch {
    return '';
  }
}

function productIdFromUrl(inputUrl) {
  try {
    const parsed = new URL(inputUrl);
    const direct = parsed.searchParams.get('product_id');
    if (direct) return direct;
    const routeMatch = parsed.href.match(/[?&]product_id=(\d+)/i);
    return routeMatch ? routeMatch[1] : '';
  } catch {
    const match = String(inputUrl || '').match(/[?&]product_id=(\d+)/i);
    return match ? match[1] : '';
  }
}

function productIdFromHtml(html) {
  const text = String(html || '');
  const patterns = [
    /name=["']product_id["'][^>]*value=["'](\d+)["']/i,
    /value=["'](\d+)["'][^>]*name=["']product_id["']/i,
    /product_id[=:]\s*["']?(\d+)["']?/i,
    /product\/product&product_id=(\d+)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return '';
}

async function productIdFromLivePage(inputUrl) {
  if (!inputUrl) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(inputUrl, { headers: BROWSER_HEADERS, signal: controller.signal });
    if (!response.ok) return '';
    const html = await response.text();
    return productIdFromHtml(html);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function summarizePublishPayload(payload = {}) {
  const attributes = payload.attributes || {};
  return {
    type: payload.type || '',
    mode: payload.mode || '',
    url: payload.url || '',
    product_id: payload.product_id || '',
    title: payload.title || payload.meta_title || '',
    h1: payload.h1 || payload.meta_h1 || '',
    metaDescriptionLength: String(payload.metaDescription || payload.meta_description || '').length,
    contentLength: String(payload.content || payload.description || '').length,
    attributesCount: Object.keys(attributes).length,
    attributeKeys: Object.keys(attributes).slice(0, 40),
    updateCommerce: Boolean(payload.updateCommerce || payload.update_commerce),
    updatePrice: Boolean(payload.updatePrice || payload.update_price),
    publishNow: Boolean(payload.publishNow || payload.publish_now)
  };
}

function recordPublishRun({ status, payload = {}, result = null, error = '', dryRun = false } = {}) {
  operationalStore.appendPublishRun({
    status,
    type: payload.type || '',
    mode: payload.mode || '',
    url: payload.url || '',
    dryRun,
    payload: summarizePublishPayload(payload),
    result: result ? {
      ok: result.ok !== false,
      id: result.id || result.product_id || result.category_id || result.information_id || '',
      url: result.url || '',
      message: result.message || '',
      bridgeDiagnosticsOk: Boolean(result.bridgeDiagnosticsOk),
      verification: result.verification || null
    } : null,
    error
  });
}

function unsafePublishContentReasons(payload = {}) {
  const content = String(payload.content || payload.description || '');
  const title = String(payload.title || payload.meta_title || '');
  const meta = String(payload.metaDescription || payload.meta_description || '');
  const h1 = String(payload.h1 || payload.meta_h1 || '');
  const combined = [content, title, meta, h1].join('\n').toLowerCase();
  const reasons = [];
  const internalPatterns = [
    [/має\s+працювати\s+як/iu, 'службова інструкція “має працювати як”'],
    [/що\s+підсилюємо\s+після\s+аналізу/iu, 'внутрішній блок про аналіз конкурентів'],
    [/основа\s+генерації|gsc-сигнал|opencart\s+readback|модель\s+потенціалу/iu, 'внутрішнє пояснення джерел генерації'],
    [/поясніть\s+смаки|додайте\s+швидк/iu, 'інструкція оператору замість клієнтського тексту']
  ];
  for (const [pattern, label] of internalPatterns) {
    if (pattern.test(combined)) reasons.push(label);
  }
  const attributeNames = Object.keys(payload.attributes || {});
  const internalAttrs = attributeNames.filter(name => {
    if (!/^(SEO фокус|Сценарій вибору|GSC покази|GSC CTR)$/iu.test(String(name || '').trim())) return false;
    return String(payload.attributes?.[name] || '').trim() !== '';
  });
  if (internalAttrs.length) reasons.push(`службові характеристики: ${internalAttrs.join(', ')}`);
  return Array.from(new Set(reasons));
}

const V2_PUBLISH_CONFIRM_PHRASE = 'PUBLISH_MERCATO_CONTENT';

function apiPublishApprovalError(input = {}) {
  const confirm = String(input.confirmPhrase || input.approval || '').trim();
  if (confirm === V2_PUBLISH_CONFIRM_PHRASE) return '';
  return `Потрібне підтвердження ${V2_PUBLISH_CONFIRM_PHRASE}`;
}

function apiPublishContractPayload(input = {}, { dryRun = true } = {}) {
  return {
    ...(input || {}),
    dryRun: Boolean(dryRun),
    source: input.source || (dryRun ? 'app_v2_publish_dry_run' : 'app_v2_publish_approve'),
    attributes: {},
    allowProductFields: false
  };
}

async function handleOpenCartPublishContent(req, res, bodyOverrides = {}) {
  const requestBody = { ...(req.body || {}), ...(bodyOverrides || {}) };
  try {
    const {
      type = 'product',
      mode = 'existing',
      url = '',
      productName = '',
      title = '',
      metaDescription = '',
      h1 = '',
      content = '',
      rightCard = '',
      attributes = {},
      price = '',
      pricing = null,
      optionPrices = null,
      supplierLot = null,
      manufacturerName = '',
      categoryName = '',
      categoryId = '',
      seoKeyword = '',
      publishNow = true,
      updateCommerce = false,
      updatePrice = false,
      isHtml = true,
      source = '',
      allowProductFields = true,
      dryRun = false
    } = requestBody;

    if (!content || !title) {
      return res.status(400).json({ error: 'Спочатку потрібен згенерований SEO-пакет з title і описом.' });
    }
    const unsafeReasons = unsafePublishContentReasons(requestBody);
    if (unsafeReasons.length) {
      return res.status(422).json({
        error: `Publish зупинено: контент схожий на внутрішній бриф, а не на текст для покупця. Причини: ${unsafeReasons.join('; ')}.`,
        code: 'UNSAFE_PUBLISH_CONTENT',
        reasons: unsafeReasons
      });
    }
    const resolvedProduct = type === 'product' && mode !== 'new'
      ? await resolveOpenCartProductForPublish({ url, productName, h1, title })
      : {};

    const publishAttributes = allowProductFields === false
      ? {}
      : sanitizeOpenCartPublishAttributes(attributes, {
        productName,
        h1,
        title,
        keywords: seoKeyword,
        type,
        productType: requestBody.productType || '',
        origin: requestBody.origin || '',
        region: requestBody.region || '',
        processing: requestBody.processing || '',
        flavors: attributes?.['Смак'] || requestBody.flavors || ''
      });

    const payload = {
      type,
      mode,
      url: resolvedProduct.url || url,
      slug: resolvedProduct.slug || productSlugFromUrl(url),
      product_id: resolvedProduct.product_id || productIdFromUrl(url),
      productName,
      name: productName || h1 || title,
      title,
      meta_title: title,
      metaDescription,
      meta_description: metaDescription,
      h1,
      meta_h1: h1,
      content,
      description: content,
      rightCard,
      right_card: rightCard,
      attributes: publishAttributes,
      price,
      pricing,
      optionPrices,
      supplierLot,
      manufacturerName,
      manufacturer_name: manufacturerName,
      categoryName,
      category_name: categoryName,
      categoryId,
      category_id: categoryId,
      seoKeyword,
      seo_keyword: seoKeyword,
      publishNow,
      publish_now: publishNow,
      updateCommerce,
      update_commerce: updateCommerce,
      updatePrice,
      update_price: updatePrice,
      isHtml,
      source,
      allowProductFields
    };

    if (dryRun) {
      recordPublishRun({ status: 'dry_run', payload, dryRun: true });
      return res.json({
        ok: true,
        dryRun: true,
        type,
        mode,
        id: payload.product_id || '',
        url: payload.url || url,
        message: 'Dry run: payload готовий, запис у OpenCart не виконувався.',
        resolvedProduct: resolvedProduct.product || null,
        payload
      });
    }

    if (type === 'product' && (mode === 'new' || updateCommerce)) {
      const bridgeVersion = await callBridge('version');
      if (!bridgeSupportsProductCommerce(bridgeVersion)) {
        return res.status(409).json({
          error: `На хостингу зараз mercato-bridge.php ${bridgeVersion.version || 'старої версії'}. Для ціни, опцій 100/250/1000, SEO URL, виробника, категорії і публікації товару потрібен локальний bridge v23. Завантажте файл mercato-bridge.php з цієї папки у /public_html/mercato-bridge.php і спробуйте ще раз.`,
          bridgeVersion
        });
      }
    }

    const data = await postBridge('publish_content', payload);
    const publishedUrl = data.url || payload.url || url;
    const bridgeDiagnosticsOk = bridgeHasPublishDiagnostics(data);
    const verification = mode === 'new'
      ? {
          ok: Boolean(data.readback?.found || data.descriptionWrite?.ok),
          checked: false,
          reason: 'Новий товар створюється як вимкнена чернетка, тому живу сторінку не перевіряємо. Перевіряємо через БД readback.'
        }
      : await verifyOpenCartPublish({
          url: publishedUrl,
          title,
          content,
          productId: data.id || data.product_id || payload.product_id || ''
        }).catch(error => ({
          ok: false,
          checked: true,
          reason: `Не вдалося перевірити живу сторінку: ${error.message}`
        }));
    if (!bridgeDiagnosticsOk && verification.checked && !verification.ok) {
      verification.reason = 'На хостингу, схоже, стара версія mercato-bridge.php: bridge відповів успішно, але не повернув діагностику запису українського товару (language_id, affected rows, content length), і жива сторінка не підтвердила зміни. Завантажте оновлений локальний mercato-bridge.php у /public_html/mercato-bridge.php.';
      verification.bridgeNeedsUpdate = true;
    }
    if (data.readback?.found) {
      const dbTitleOk = data.readback.metaTitleExact !== false;
      const dbDescriptionOk = data.readback.descriptionExact !== false;
      const dbAttributesOk = data.readback.attributesExact !== false;
      verification.dbReadback = {
        ok: dbTitleOk && dbDescriptionOk && dbAttributesOk,
        titleOk: dbTitleOk,
        descriptionOk: dbDescriptionOk,
        attributesOk: dbAttributesOk,
        descriptionLength: data.readback.descriptionLength,
        writtenAttributesCount: data.readback.writtenAttributesCount,
        storedAttributesCount: data.readback.storedAttributesCount,
        languageRows: data.readback.languageRows || [],
        descriptionRowRepair: data.descriptionRowRepair || null
      };
      if (!verification.ok && dbTitleOk && dbDescriptionOk) {
        verification.reason = 'База OpenCart підтвердила новий title і опис, але жива сторінка їх ще не показує. Найімовірніше, це кеш OpenCart/шаблону/модифікатора або сторінка виводить опис з іншого поля.';
      } else if (!dbTitleOk || !dbDescriptionOk) {
        verification.reason = 'Bridge виконав запит, але контрольне читання з бази не підтвердило новий title/опис. Треба дивитись SQL-поле, language_id або права запису на таблицю product_description.';
      }
    }
    const responsePayload = {
      ok: true,
      type,
      mode,
      id: data.id || data.product_id || data.category_id || data.information_id || '',
      product_id: data.product_id || data.id || '',
      model: data.model || '',
      sku: data.sku || '',
      price: data.price ?? payload.price ?? '',
      pricing: data.pricing || pricing || null,
      commerce: data.commerce || null,
      url: publishedUrl,
      message: data.message || 'OpenCart оновлено.',
      resolvedProduct: resolvedProduct.product || null,
      verification,
      bridgeDiagnosticsOk,
      bridge: data
    };
    recordPublishRun({ status: verification?.ok === false ? 'published_warn' : 'published', payload, result: responsePayload });
    res.json(responsePayload);
  } catch (error) {
    console.error('Помилка OpenCart publish:', error.message);
    const message = explainBridgeError(error);
    recordPublishRun({
      status: 'failed',
      payload: requestBody,
      error: error.bridgeEmptyResponse
        ? `${message}. Mercato AI вже спробував JSON, form і base64 fallback.`
        : message
    });
    res.status(500).json({
      error: error.bridgeEmptyResponse
        ? `${message}. Mercato AI вже спробував JSON, form і base64 fallback. Завантажте актуальний mercato-bridge.php v23 на хостинг: він підтримує form/base64 fallback, описові рядки product_description, SEO URL, виробника, категорію, ціну, опції фасування і публікацію товару.`
        : message
    });
  }
}

app.post('/api/publish/dry-run', async (req, res) => {
  const payload = apiPublishContractPayload(req.body || {}, { dryRun: true });
  return handleOpenCartPublishContent(req, res, payload);
});

app.post('/api/publish/approve', async (req, res) => {
  const approvalError = apiPublishApprovalError(req.body || {});
  if (approvalError) {
    return res.status(400).json({
      error: approvalError,
      code: 'PUBLISH_APPROVAL_REQUIRED'
    });
  }
  const payload = apiPublishContractPayload(req.body || {}, { dryRun: false });
  return handleOpenCartPublishContent(req, res, payload);
});

app.post('/opencart/publish-content', handleOpenCartPublishContent);

function percentileScore(value, sortedValues, higherIsBetter = true) {
  if (!sortedValues.length || value === null || value === undefined) return 1;
  const idx = sortedValues.findIndex(v => value <= v);
  const rank = idx === -1 ? sortedValues.length : idx + 1;
  const pct = rank / sortedValues.length;
  const normalized = higherIsBetter ? pct : 1 - pct;
  return Math.min(5, Math.max(1, Math.ceil(normalized * 5)));
}

function daysSince(dateValue) {
  if (!dateValue) return null;
  const date = new Date(String(dateValue).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / 86400000);
}

function topItemsFromProducts(products, limit = 5) {
  const counts = new Map();
  for (const product of products) {
    const name = String(product || '').trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function percentileScore(value, sortedValues, higherIsBetter = true) {
  if (!sortedValues.length || value === null || value === undefined) return 1;
  const idx = sortedValues.findIndex(v => value <= v);
  const rank = idx === -1 ? sortedValues.length : idx + 1;
  const pct = rank / sortedValues.length;
  const normalized = higherIsBetter ? pct : 1 - pct;
  return Math.min(5, Math.max(1, Math.ceil(normalized * 5)));
}

function getRetentionTrigger(days, cadence = null) {
  if (days === null || days === undefined) return { id: 'no_orders', label: 'немає покупок', days: null, action: 'welcome/email-знайомство' };
  if (cadence?.typicalIntervalDays) {
    if (cadence.status === 'overdue') {
      return {
        id: 'cadence_overdue',
        label: `аномальна пауза: ${Number(cadence.anomalyDays || 0)} дн. понад звичний цикл`,
        days: Number(cadence.riskAfterDays || cadence.typicalIntervalDays || 0),
        action: 'персональна реактивація тільки після перевірки останніх замовлень'
      };
    }
    if (cadence.status === 'due_soon') {
      return {
        id: 'cadence_due',
        label: `час повтору: цикл ~${Number(cadence.typicalIntervalDays || 0)} дн.`,
        days: Number(cadence.typicalIntervalDays || 0),
        action: 'мʼяке нагадування або персональна рекомендація без знижкового тиску'
      };
    }
    return {
      id: 'cadence_active',
      label: `ще в нормальному циклі: ~${Number(cadence.typicalIntervalDays || 0)} дн.`,
      days: Number(cadence.typicalIntervalDays || 0),
      action: 'не тиснути; чекати природного вікна повтору'
    };
  }
  if (days >= 180) return { id: '180_days', label: '180+ днів без покупки', days: 180, action: 'сильна реактивація з персональним бонусом' };
  if (days >= 90) return { id: '90_days', label: '90+ днів без покупки', days: 90, action: 'реактивація через новий лот або улюблений профіль' };
  if (days >= 60) return { id: '60_days', label: '60+ днів без покупки', days: 60, action: 'мʼяке нагадування і добірка' };
  if (days >= 30) return { id: '30_days', label: '30+ днів без покупки', days: 30, action: 'порада/добірка для наступної покупки' };
  return { id: 'active', label: 'активний клієнт', days: 0, action: 'новинки, cross-sell, без тиску' };
}

function getSpamStatus(customer, suppressed = null) {
  const email = String(customer.email || '').trim();
  const normalized = normalizeEmail(email).toLowerCase();
  const isSuppressed = normalized && suppressed && suppressed.has(normalized);
  if (isSuppressed) {
    return {
      emailPresent: Boolean(email),
      canEmail: false,
      consentStatus: 'unsubscribed',
      unsubscribeRequired: true,
      suppressionReason: 'відписався або у stop-list',
      maxFrequency: 'не писати'
    };
  }
  return {
    emailPresent: Boolean(email),
    canEmail: Boolean(email),
    consentStatus: customer.newsletter === 1 || customer.newsletter === '1' ? 'subscribed' : 'unknown',
    unsubscribeRequired: true,
    maxFrequency: '1 лист на 7-14 днів без явної поведінкової події'
  };
}

function inferPreferenceTags(products) {
  const text = products.join(' ').toLowerCase();
  const tags = [];
  const rules = [
    ['filter', ['фільтр', 'v60', 'аеропрес', 'кемекс', 'drip']],
    ['espresso', ['еспресо', 'espresso', 'кавомаш', 'бленд']],
    ['decaf', ['decaf', 'декаф', 'без кофеїну', 'без кофеина', 'безкофеїнова', 'безкофеиновая']],
    ['ethiopia', ['ефіоп', 'ethiopia']],
    ['kenya', ['кенія', 'kenya']],
    ['colombia', ['колумб', 'colombia']],
    ['guatemala', ['гватемал', 'guatemala']],
    ['fruit', ['фрукт', 'ягід', 'berry', 'citrus', 'цитрус', 'яблук', 'персик', 'бергамот']],
    ['sweet', ['солод', 'карамел', 'мед', 'шоколад', 'какао', 'горіх', 'nut']],
    ['washed', ['мита', 'washed']],
    ['natural', ['натурал', 'natural']],
    ['tea', ['чай', 'матча', 'улун', 'пуер', 'сенча']],
    ['coffee', ['кава', 'арабіка', 'robusta', 'зерн']]
  ];
  for (const [tag, needles] of rules) {
    if (needles.some(n => text.includes(n))) tags.push(tag);
  }
  return tags;
}

function recommendProducts(products, tags, globalTopProducts = []) {
  const boughtText = products.map(p => p.name || p).join(' ').toLowerCase();
  const recommendations = [];
  const add = (name, reason) => {
    if (!name || boughtText.includes(String(name).toLowerCase())) return;
    if (!recommendations.some(r => r.name === name)) recommendations.push({ name, reason });
  };
  const decafProfile = tags.includes('decaf') || isDecafProductName(boughtText);

  if (decafProfile) {
    add('Чайна добірка Mercato', 'безпечна альтернатива без підмішування кофеїнового лоту до decaf-профілю');
    add('Дегустаційний набір чаю', 'мʼякий спосіб запропонувати новий смак без кофеїнової кави');
  }

  if (!decafProfile && tags.includes('kenya')) {
    add('Кава Колумбія Супремо', 'чиста й збалансована чашка для мʼякшого переходу після Кенії');
    add('Кава Руанда Isimbi', 'ягідна чашка без повторення тієї самої країни');
  }
  if (!decafProfile && tags.includes('ethiopia')) {
    add('Кава Кенія Ruka Chui', 'схожа фруктова яскравість, але інша кислотність і щільність');
    add('Кава Гватемала Уеуетенанго Organic', 'солодший профіль для контрасту після Ефіопії');
  }
  if (!decafProfile && tags.includes('filter')) add('Свіжий лот під фільтр', 'логічне продовження для V60, аеропресу або кемексу');
  if (!decafProfile && tags.includes('espresso')) add('Бленд для еспресо', 'стабільна солодкість і щільність для кавомашини');
  if (!decafProfile && tags.includes('fruit')) add('Фруктовий свіжий лот', 'схожий напрям за яскравим фруктовим смаком');
  if (!decafProfile && tags.includes('sweet')) add('Солодкий шоколадно-горіховий профіль', 'близький профіль за солодкістю, тілом і мʼяким післясмаком');
  if (!decafProfile && tags.includes('washed')) add('Мита арабіка у близькому профілі', 'чистіша чашка для тих, кому подобається прозорий смак');
  if (!decafProfile && tags.includes('natural')) add('Натуральна арабіка з фруктовістю', 'логічний крок для тих, кому подобається насиченіший ферментаційний смак');
  if (tags.includes('tea')) add('Дегустаційний набір чаю', 'розширює смаковий досвід без великого ризику');

  for (const item of globalTopProducts.slice(0, 8)) {
    if (decafProfile && productKind(item) === 'coffee' && !isDecafProductName(item.name)) continue;
    if (!decafProfile && isDecafProductName(item.name)) continue;
    add(item.name, 'популярний товар серед клієнтів Mercato');
  }

  return recommendations.slice(0, 3);
}

function topCountItems(values, limit = 5) {
  const counts = new Map();
  for (const value of values) {
    const clean = String(value || '').trim();
    if (!clean) continue;
    counts.set(clean, (counts.get(clean) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'uk'))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function splitAttributeValue(value) {
  return String(value || '')
    .split(/\s*[,;|/]\s*/u)
    .map(item => item.trim())
    .filter(Boolean);
}

function productKind(product = {}) {
  const text = [
    product.name,
    product.model,
    Object.values(product.attributes || {}).join(' '),
    (product.options || []).map(option => `${option.name} ${option.value}`).join(' ')
  ].join(' ').toLowerCase();
  if (/(чай|tea|улун|пуер|матча|сенча|цейлон|ерг грей|earl grey)/i.test(text)) return 'tea';
  if (/(дегустац|набір|set|bundle)/i.test(text)) return 'set';
  if (/(кав|coffee|arabica|арабіка|зерн|espresso|еспресо)/i.test(text)) return 'coffee';
  return 'other';
}

function extractOrderDates(orders = []) {
  return orders
    .map(order => ({ order, ms: parseStoreDateMs(order.date_added || order.date || '') }))
    .filter(item => item.ms)
    .sort((a, b) => b.ms - a.ms);
}

function averageOrderIntervalDays(orders = []) {
  return orderIntervalStats(orders).avgIntervalDays;
}

function orderIntervalStats(orders = []) {
  const dated = extractOrderDates(orders);
  if (dated.length < 2) return { avgIntervalDays: null, medianIntervalDays: null, intervals: [] };
  const gaps = [];
  for (let i = 0; i < dated.length - 1; i++) {
    const gap = Math.round((dated[i].ms - dated[i + 1].ms) / 86400000);
    if (gap > 0 && gap < 730) gaps.push(gap);
  }
  if (!gaps.length) return { avgIntervalDays: null, medianIntervalDays: null, intervals: [] };
  const sorted = [...gaps].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const medianIntervalDays = sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  return {
    avgIntervalDays: Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length),
    medianIntervalDays,
    intervals: gaps
  };
}

function buildOrderCadence(orders = [], fallbackLastOrder = '') {
  const stats = orderIntervalStats(orders);
  const dated = extractOrderDates(orders);
  const lastOrderDate = dated[0]?.order?.date_added || dated[0]?.order?.date || fallbackLastOrder || '';
  const daysSinceLastOrder = daysSince(lastOrderDate);
  const typicalIntervalDays = stats.medianIntervalDays || stats.avgIntervalDays;
  const nextDueInDays = typicalIntervalDays !== null && daysSinceLastOrder !== null ? typicalIntervalDays - daysSinceLastOrder : null;
  const leadWindowDays = typicalIntervalDays !== null
    ? Math.max(7, Math.min(21, Math.round(typicalIntervalDays * 0.2)))
    : null;
  const graceDays = typicalIntervalDays !== null
    ? Math.max(14, Math.min(45, Math.round(typicalIntervalDays * 0.35)))
    : null;
  const riskAfterDays = typicalIntervalDays !== null ? typicalIntervalDays + graceDays : null;
  const ratio = typicalIntervalDays && daysSinceLastOrder !== null
    ? Number((daysSinceLastOrder / typicalIntervalDays).toFixed(2))
    : null;
  let status = 'unknown';
  if (typicalIntervalDays !== null && daysSinceLastOrder !== null) {
    if (daysSinceLastOrder < typicalIntervalDays - leadWindowDays) status = 'not_due';
    else if (daysSinceLastOrder <= riskAfterDays) status = 'due_soon';
    else status = 'overdue';
  }
  return {
    orderCount: Array.isArray(orders) ? orders.length : 0,
    avgIntervalDays: stats.avgIntervalDays,
    medianIntervalDays: stats.medianIntervalDays,
    typicalIntervalDays,
    intervals: stats.intervals,
    daysSinceLastOrder,
    nextDueInDays,
    leadWindowDays,
    graceDays,
    riskAfterDays,
    anomalyDays: status === 'overdue' && riskAfterDays !== null && daysSinceLastOrder !== null
      ? Math.max(0, daysSinceLastOrder - riskAfterDays)
      : 0,
    ratio,
    status
  };
}

function isCadenceSleepingCustomer(customer = {}) {
  if (customer.daysSinceLastOrder === null || customer.daysSinceLastOrder === undefined) return false;
  const cadence = customer.cadence || {};
  if (cadence.typicalIntervalDays) {
    const sleepingAfterDays = Math.max(
      180,
      Number(cadence.riskAfterDays || cadence.typicalIntervalDays) + Math.max(60, Number(cadence.typicalIntervalDays || 0))
    );
    return Number(customer.daysSinceLastOrder || 0) > sleepingAfterDays || Number(cadence.ratio || 0) >= 2.5;
  }
  return Number(customer.daysSinceLastOrder || 0) > 180;
}

function buildCustomerPreferenceProfile(customer = {}) {
  const orders = Array.isArray(customer.orders) ? customer.orders : [];
  const products = orders.flatMap(order => (order.products || []).map(product => ({
    ...product,
    orderId: order.order_id,
    orderDate: order.date_added,
    orderTotal: Number(order.total || 0)
  })));
  const productNames = products.map(product => product.name).filter(Boolean);
  const categories = topCountItems(products.map(productKind), 5);
  const topProducts = topItemsFromProducts(productNames, 8);
  const allAttributes = products.flatMap(product => Object.entries(product.attributes || {}).map(([name, value]) => ({ name, value })));
  const allOptions = products.flatMap(product => (product.options || []).map(option => ({ ...option, productName: product.name })));
  const byAttr = (attrNames) => topCountItems(allAttributes
    .filter(attr => attrNames.some(name => String(attr.name || '').toLowerCase().includes(name)))
    .flatMap(attr => splitAttributeValue(attr.value)), 6);
  const numericAvg = (attrName) => {
    const values = allAttributes
      .filter(attr => String(attr.name || '').toLowerCase().includes(attrName))
      .map(attr => Number(String(attr.value || '').replace(',', '.').match(/\d+(?:\.\d+)?/)?.[0]))
      .filter(Number.isFinite);
    return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
  };
  const grindOptions = allOptions.filter(option => /(помел|мел|grind)/i.test(`${option.name} ${option.value}`));
  const packageOptions = allOptions.filter(option => /(вага|фасов|грам|кг|упаков|weight|size)/i.test(`${option.name} ${option.value}`));
  const paymentMethods = topCountItems(orders.map(order => order.payment_method), 4);
  const shippingMethods = topCountItems(orders.map(order => order.shipping_method), 4);
  const cadence = buildOrderCadence(orders, customer.last_order || '');
  const preferenceTags = inferPreferenceTags(productNames);
  const favoriteKind = categories.find(item => item.name !== 'other')?.name || categories[0]?.name || '';
  const origins = byAttr(['країна', 'походження']);
  const processing = byAttr(['оброб']);
  const roast = byAttr(['обсмаж']);
  const flavors = byAttr(['смак', 'післясмак']);
  const acidity = numericAvg('кислот');
  const body = numericAvg('тіло');
  const sweetness = numericAvg('солод');
  const profile = {
    confidence: Math.min(100, Math.round(
      Math.min(45, products.length * 6) +
      Math.min(40, allAttributes.length * 3) +
      Math.min(15, allOptions.length * 5)
    )),
    favoriteKind,
    categories,
    topProducts,
    preferenceTags,
    origins,
    processing,
    roast,
    flavors,
    tasteScores: { acidity, sweetness, body },
    grind: topCountItems(grindOptions.map(option => option.value || option.name), 4),
    package: topCountItems(packageOptions.map(option => option.value || option.name), 4),
    paymentMethods,
    shippingMethods,
    cadence
  };
  profile.summary = [
    favoriteKind === 'tea' ? 'переважно чай' : favoriteKind === 'coffee' ? 'переважно кава' : '',
    origins[0]?.name ? `часто бере ${origins[0].name}` : '',
    processing[0]?.name ? `обробка: ${processing[0].name}` : '',
    profile.grind[0]?.name ? `помел/формат: ${profile.grind[0].name}` : '',
    cadence.typicalIntervalDays ? `цикл покупки ~${cadence.typicalIntervalDays} дн.` : ''
  ].filter(Boolean).join('; ');
  return profile;
}

function buildCustomerNextBestAction(customer = {}, profile = {}) {
  const name = `${customer.firstname || ''} ${customer.lastname || ''}`.trim() || customer.email || 'клієнт';
  const cadence = profile.cadence || {};
  const favoriteProduct = profile.topProducts?.[0]?.name || '';
  const favoriteKind = profile.favoriteKind || '';
  const origin = profile.origins?.[0]?.name || '';
  const offer = favoriteKind === 'tea'
    ? 'персональна чайна добірка або дегустаційний набір'
    : favoriteKind === 'coffee' && origin
      ? `свіжий лот у близькому профілі до ${origin}`
      : favoriteProduct || 'персональна добірка Mercato';
  if (!Number(cadence.orderCount || 0)) {
    return {
      type: 'welcome',
      priority: 'medium',
      title: 'Перший мʼякий контакт',
      recommendation: `${name}: познайомити з Mercato і зібрати перші вподобання.`,
      offer,
      channel: 'email',
      timing: 'після першої взаємодії',
      reason: 'Ще немає історії покупок, тому не варто робити жорстку персоналізацію.'
    };
  }
  if (cadence.status === 'overdue') {
    const cycleDays = cadence.typicalIntervalDays || cadence.avgIntervalDays;
    return {
      type: 'replenishment_winback',
      priority: 'high',
      title: 'Клієнт вийшов за свій цикл покупки',
      recommendation: `${name}: нагадати про ${favoriteProduct || offer} і дати простий шлях повторити або оновити вибір.`,
      offer,
      channel: 'email + персональний купон',
      timing: 'сьогодні',
      reason: `Типовий цикл ~${cycleDays} дн., остання покупка була ${cadence.daysSinceLastOrder} дн. тому, аномальна пауза ${cadence.anomalyDays || 0} дн.`
    };
  }
  if (cadence.status === 'due_soon') {
    return {
      type: 'replenishment',
      priority: 'high',
      title: 'Скоро час наступної покупки',
      recommendation: `${name}: запропонувати повторити улюблене або спробувати близький профіль.`,
      offer,
      channel: 'email без агресивної знижки',
      timing: cadence.nextDueInDays <= 0 ? 'зараз' : `через ${cadence.nextDueInDays} дн.`,
      reason: `Клієнт близько до свого звичного інтервалу покупки.`
    };
  }
  return {
    type: 'cross_sell',
    priority: 'medium',
    title: 'Підтримати активного клієнта',
    recommendation: `${name}: не тиснути знижкою, а запропонувати релевантну новинку або добірку.`,
    offer,
    channel: 'email або персональна рекомендація в замовленні',
    timing: cadence.nextDueInDays ? `орієнтовно через ${Math.max(1, cadence.nextDueInDays)} дн.` : 'після наступної поведінкової події',
    reason: 'Клієнт не виглядає простроченим, тому краще працювати через цінність, а не через терміновість.'
  };
}

function enrichCustomer360(customer = {}) {
  const orders = Array.isArray(customer.orders) ? customer.orders : [];
  const totalSpent = Number(customer.total_spent || orders.reduce((sum, order) => sum + Number(order.total || 0), 0));
  const topProducts = topProductsFromDetailedOrders(orders);
  const profile = buildCustomerPreferenceProfile({ ...customer, orders, total_spent: totalSpent, topProducts });
  return {
    ...customer,
    orders,
    order_count: Number(customer.order_count || orders.length || 0),
    total_spent: totalSpent,
    avg_order_value: orders.length ? Math.round(totalSpent / orders.length) : 0,
    topProducts,
    preferenceProfile: profile,
    nextBestAction: buildCustomerNextBestAction(customer, profile)
  };
}

function topProductsFromDetailedOrders(orders = []) {
  const map = new Map();
  for (const order of orders) {
    for (const product of order.products || []) {
      const name = String(product.name || '').trim();
      if (!name) continue;
      const current = map.get(name) || { name, quantity: 0, orders: 0, revenue: 0 };
      current.quantity += Number(product.quantity || 0);
      current.orders += 1;
      current.revenue += Number(product.total || Number(product.price || 0) * Number(product.quantity || 0));
      map.set(name, current);
    }
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue).slice(0, 10);
}

const bridgePagesCache = new Map();
const bridgePagesInFlight = new Map();

async function fetchBridgePages(action, key, maxPages = 10, options = {}) {
  const pageTimeoutMs = Number(options.timeoutMs || BRIDGE_READ_TIMEOUT_MS);
  const maxElapsedMs = Number(options.maxElapsedMs || 0);
  const cacheKey = `${action}:${key}:${Number(maxPages || 10)}:${pageTimeoutMs}:${maxElapsedMs || 'full'}`;
  const cached = bridgePagesCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < BRIDGE_PAGE_CACHE_TTL_MS) return cached.rows;
  if (bridgePagesInFlight.has(cacheKey)) return bridgePagesInFlight.get(cacheKey);

  const request = (async () => {
    const startedAt = Date.now();
    const all = [];
    for (let page = 1; page <= maxPages; page++) {
      if (maxElapsedMs && Date.now() - startedAt > maxElapsedMs) {
        const error = new Error(`OpenCart bridge не встиг прочитати ${action} за ${maxElapsedMs}ms.`);
        error.code = 'BRIDGE_PAGE_TIMEOUT';
        error.bridgeAction = action;
        error.bridgeTimeoutMs = maxElapsedMs;
        throw error;
      }
      const data = await callBridge(action, { page }, { timeoutMs: pageTimeoutMs });
      const rows = data[key] || [];
      all.push(...rows);
      if (!rows.length || rows.length < 50) break;
    }
    bridgePagesCache.set(cacheKey, { savedAt: Date.now(), rows: all });
    return all;
  })();

  bridgePagesInFlight.set(cacheKey, request);
  try {
    return await request;
  } finally {
    bridgePagesInFlight.delete(cacheKey);
  }
}

function buildEmailSegments(customers, orders, bridgeTopProducts = []) {
  const suppressedEmails = emailSuppressionSet();
  const orderByEmail = new Map();
  const orderByCustomerId = new Map();
  for (const order of orders) {
    const email = String(order.email || '').trim().toLowerCase();
    if (email) {
      if (!orderByEmail.has(email)) orderByEmail.set(email, []);
      orderByEmail.get(email).push(order);
    }
    const customerId = String(order.customer_id || order.customerId || '').trim();
    if (customerId) {
      if (!orderByCustomerId.has(customerId)) orderByCustomerId.set(customerId, []);
      orderByCustomerId.get(customerId).push(order);
    }
  }

  const splitProductsList = (value) => String(value || '')
    .split(/\s*\|\|\s*|\s*,\s*/)
    .map(p => p.trim())
    .filter(Boolean);

  const allProducts = orders
    .flatMap(order => splitProductsList(order.products_list))
    .map(p => p.trim())
    .filter(Boolean);
  const globalTopProducts = bridgeTopProducts.length ? bridgeTopProducts.slice(0, 10) : topItemsFromProducts(allProducts, 10);
  const sortAndDedupeOrders = (list = []) => {
    const seen = new Set();
    return list
      .filter(Boolean)
      .filter(order => {
        const key = String(order.order_id || order.id || `${order.date_added || order.date || ''}-${order.total || ''}-${order.products_list || ''}`);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => parseStoreDateMs(b.date_added || b.date || '') - parseStoreDateMs(a.date_added || a.date || ''));
  };

  const baseCustomers = customers.map(customer => {
    const email = String(customer.email || '').trim().toLowerCase();
    const customerIdKey = String(customer.customer_id || customer.customerId || customer.id || '').trim();
    const customerOrders = sortAndDedupeOrders([
      ...(Array.isArray(customer.orders) ? customer.orders : []),
      ...(customerIdKey ? (orderByCustomerId.get(customerIdKey) || []) : []),
      ...(email ? (orderByEmail.get(email) || []) : [])
    ]);
    const firstName = cleanCustomerNamePart(customer.firstname || customer.first_name);
    const lastName = cleanCustomerNamePart(customer.lastname || customer.last_name);
    const fullName = customerFullNameFromParts(firstName, lastName, customer.name || email || customer.customer_id);
    const bridgeProducts = splitProductsList(customer.products_list);
    const orderProducts = customerOrders
      .flatMap(order => splitProductsList(order.products_list));
    const products = [...bridgeProducts, ...orderProducts];
    const lastOrder = customer.last_order || customerOrders[0]?.date_added || customerOrders[0]?.date || '';
    const cadence = buildOrderCadence(customerOrders, lastOrder);
    const orderCount = Math.max(Number(customer.order_count || 0), customerOrders.length);
    const orderSpent = customerOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const customerSpent = Number(customer.total_spent || 0);
    const totalSpent = customerSpent > 0 ? customerSpent : orderSpent;
    const avgOrderValue = orderCount ? Math.round(totalSpent / orderCount) : 0;
    const recentOrders = customerOrders.slice(0, 5).map(order => ({
      orderId: order.order_id,
      date: order.date_added || order.date || '',
      total: Number(order.total || 0),
      products: splitProductsList(order.products_list).slice(0, 8)
    }));
    return {
      id: customer.customer_id || customer.customerId || customer.id,
      name: fullName,
      fullName,
      firstName,
      lastName,
      email: customer.email || '',
      phone: customer.telephone || '',
      orderCount,
      totalSpent,
      avgOrderValue,
      lastOrder,
      daysSinceLastOrder: cadence.daysSinceLastOrder,
      cadence: {
        ...cadence,
        orderCount
      },
      recentOrders,
      topProducts: topItemsFromProducts(products, 5),
      preferenceTags: inferPreferenceTags(products),
      spam: getSpamStatus(customer, suppressedEmails)
    };
  });

  const recencyValues = baseCustomers.map(c => c.daysSinceLastOrder).filter(v => v !== null).sort((a, b) => a - b);
  const frequencyValues = baseCustomers.map(c => c.orderCount).sort((a, b) => a - b);
  const monetaryValues = baseCustomers.map(c => c.totalSpent).sort((a, b) => a - b);

  const enriched = baseCustomers.map(customer => {
    const r = percentileScore(customer.daysSinceLastOrder, recencyValues, false);
    const f = percentileScore(customer.orderCount, frequencyValues, true);
    const m = percentileScore(customer.totalSpent, monetaryValues, true);
    const trigger = getRetentionTrigger(customer.daysSinceLastOrder, customer.cadence);
    return {
      ...customer,
      rfm: { recency: r, frequency: f, monetary: m, score: `${r}${f}${m}`, total: r + f + m },
      trigger,
      recommendations: recommendProducts(customer.topProducts, customer.preferenceTags, globalTopProducts)
    };
  });

  const addSegment = (id, title, description, scenario, goal, offerHint, predicate) => {
    const members = enriched.filter(predicate);
    const products = members.flatMap(c => c.topProducts.flatMap(p => Array(p.count).fill(p.name)));
    const tags = members.flatMap(c => c.preferenceTags);
    return {
      id,
      title,
      description,
      scenario,
      goal,
      offerHint,
      count: members.length,
      revenue: Math.round(members.reduce((sum, c) => sum + c.totalSpent, 0)),
      avgOrderValue: members.length ? Math.round(members.reduce((sum, c) => sum + c.avgOrderValue, 0) / members.length) : 0,
      topProducts: topItemsFromProducts(products, 6),
      preferenceTags: [...new Set(tags)].slice(0, 8),
      sampleCustomers: members.slice(0, 8),
	      recipients: members.slice(0, 500).map(c => ({
	        customerId: c.id,
	        name: c.name,
	        fullName: c.fullName || c.name,
	        firstName: c.firstName || '',
	        lastName: c.lastName || '',
	        email: c.email,
	        phone: c.phone,
        orderCount: c.orderCount,
	        totalSpent: c.totalSpent,
	        lastOrder: c.lastOrder,
	        cadence: c.cadence,
	        rfm: c.rfm,
        trigger: c.trigger,
        topProducts: c.topProducts,
        recentOrders: c.recentOrders,
        recommendations: c.recommendations,
        spam: c.spam
      })),
      rfmAvg: members.length ? Math.round(members.reduce((sum, c) => sum + c.rfm.total, 0) / members.length) : 0,
      triggers: Object.values(members.reduce((acc, c) => {
        acc[c.trigger.id] ||= { id: c.trigger.id, label: c.trigger.label, count: 0, action: c.trigger.action };
        acc[c.trigger.id].count++;
        return acc;
      }, {})),
      adAudience: {
        name: `Mercato - ${title}`,
        type: id.includes('sleeping') || id.includes('risk') ? 'reactivation_custom_audience' : 'retention_custom_audience',
        useFor: id === 'vip'
          ? 'Meta lookalike + early access campaign'
          : id === 'sleeping'
            ? 'Meta custom audience + email winback'
            : 'email segment + Meta reminder audience',
        exportFields: ['email', 'phone', 'first_name', 'last_name']
      },
	      batchPreview: members.slice(0, 20).map(c => ({
	        customerId: c.id,
	        name: c.name,
	        fullName: c.fullName || c.name,
	        firstName: c.firstName || '',
	        lastName: c.lastName || '',
	        email: c.email,
	        rfm: c.rfm,
	        trigger: c.trigger,
	        cadence: c.cadence,
	        topProducts: c.topProducts,
        recentOrders: c.recentOrders,
        recommendations: c.recommendations,
        proposedOffer: c.recommendations[0]?.name || offerHint,
        spam: c.spam
      }))
    };
  };

  const segments = [
    addSegment(
      'vip',
      'VIP клієнти',
      'Висока сума або багато повторних покупок. Їм потрібні ранній доступ, рідкісні лоти, персональна увага.',
      'newsletter',
      'підтримати лояльність і запропонувати преміальний/новий лот',
      'ранній доступ до нового лоту, дегустаційний набір або персональна добірка',
      c => c.totalSpent >= 3000 || c.orderCount >= 5
    ),
	    addSegment(
	      'loyal_recent',
	      'Активні повторні',
      'Купували 2+ рази і ще не вийшли за власний цикл повтору. Добрий сегмент для регулярних добірок і cross-sell без тиску.',
      'newsletter',
      'стимулювати наступне замовлення без знижкового тиску',
      'добірка під їхній спосіб заварювання або смаковий профіль',
	      c => c.orderCount >= 2
	        && c.daysSinceLastOrder !== null
	        && (c.cadence?.typicalIntervalDays ? c.cadence.status === 'not_due' : c.daysSinceLastOrder <= 60)
	    ),
	    addSegment(
	      'replenishment_due',
	      'Час повторної покупки',
	      'Клієнти з повторними покупками, які наблизились до свого звичного інтервалу або трохи його перейшли, але це ще не аномальна пауза.',
	      'post_purchase',
	      'піймати природний момент наступного замовлення',
	      'повторити улюблений товар або запропонувати дуже близький профіль без агресивної знижки',
	      c => c.orderCount >= 2
	        && c.cadence?.typicalIntervalDays
	        && c.cadence.status === 'due_soon'
	        && c.daysSinceLastOrder !== null
	    ),
	    addSegment(
	      'at_risk',
      'Аномальна пауза після звичного циклу',
      'Раніше купували з повторюваним циклом, але зараз пауза вже помітно довша за їхню норму. Це не fixed 60 днів, а персональний сигнал.',
      'reactivation',
      'повернути до повторної покупки',
      'невеликий бонус, безкоштовна доставка або рекомендація нового лоту',
      c => c.orderCount >= 2
        && c.daysSinceLastOrder !== null
        && c.cadence?.typicalIntervalDays
        && c.cadence.status === 'overdue'
        && !isCadenceSleepingCustomer(c)
    ),
    addSegment(
      'sleeping',
      'Сплячі клієнти',
      'Дуже давно не купували. Тут доречна реактивація з сильнішою причиною повернутись.',
      'reactivation',
      'мʼяко повернути клієнта після довгої паузи',
      'персональний бонус або простий набір для повернення до улюбленого смаку',
      c => isCadenceSleepingCustomer(c)
    ),
    addSegment(
      'new_customers',
      'Нові клієнти',
      'Одна покупка або свіжа перша покупка. Головне — довести до другої покупки.',
      'post_purchase',
      'перетворити першу покупку на повторну',
      'порада по заварюванню, рекомендація схожого товару, welcome-бонус',
      c => c.orderCount <= 1 && (c.daysSinceLastOrder === null || c.daysSinceLastOrder <= 45)
    )
  ].filter(s => s.count > 0);

  return {
    generatedAt: new Date().toLocaleString('uk-UA'),
    source: 'store_bridge',
    totals: {
      customers: enriched.length,
      orders: orders.length,
      revenue: Math.round(enriched.reduce((sum, c) => sum + c.totalSpent, 0)),
      avgOrderValue: enriched.length ? Math.round(enriched.reduce((sum, c) => sum + c.avgOrderValue, 0) / enriched.length) : 0,
      unsubscribed: enriched.filter(customer => customer.spam?.canEmail === false && customer.spam?.consentStatus === 'unsubscribed').length
    },
    topProducts: globalTopProducts,
    customers: enriched,
    segments
  };
}

function compactEmailSegmentsResponse(data = {}) {
  return {
    generatedAt: data.generatedAt,
    source: data.source,
    totals: data.totals,
    topProducts: data.topProducts,
    segments: data.segments
  };
}

function buildCustomerIntelligence(retention = {}) {
  const customers = Array.isArray(retention.customers) ? retention.customers : [];
  const withCadence = customers.filter(customer => Number(customer.orderCount || 0) >= 2 && customer.cadence?.typicalIntervalDays && customer.daysSinceLastOrder !== null);
  const dueSoon = withCadence
    .filter(customer => customer.cadence.status === 'due_soon')
    .sort((a, b) => Number(a.cadence.nextDueInDays || 0) - Number(b.cadence.nextDueInDays || 0));
  const overdue = withCadence
    .filter(customer => customer.cadence.status === 'overdue' && !isCadenceSleepingCustomer(customer))
    .sort((a, b) => Number(a.cadence.nextDueInDays || 0) - Number(b.cadence.nextDueInDays || 0));
  const ready = [...overdue, ...dueSoon];
  const forecastRevenue = ready.reduce((sum, customer) => sum + Number(customer.avgOrderValue || 0), 0);
  const products = ready.flatMap(customer => customer.topProducts?.[0]?.name ? [customer.topProducts[0].name] : []);
	  const toRow = (customer) => ({
	    customerId: customer.id,
	    name: customer.name,
	    fullName: customer.fullName || customer.name,
	    firstName: customer.firstName || '',
	    lastName: customer.lastName || '',
	    email: customer.email,
    totalSpent: customer.totalSpent,
    avgOrderValue: customer.avgOrderValue,
    lastOrder: customer.lastOrder,
    cadence: customer.cadence,
    favoriteProduct: customer.topProducts?.[0]?.name || '',
    proposedOffer: customer.recommendations?.[0]?.name || customer.topProducts?.[0]?.name || ''
  });
  return {
    sampleCustomers: customers.length,
    withCadence: withCadence.length,
    dueSoon: dueSoon.length,
    overdue: overdue.length,
    readyToBuy: ready.length,
    forecastRevenue: Math.round(forecastRevenue),
    topDueProducts: topItemsFromProducts(products, 5),
    lists: {
      dueSoon: dueSoon.slice(0, 30).map(toRow),
      overdue: overdue.slice(0, 30).map(toRow),
      ready: ready.slice(0, 40).map(toRow)
    }
  };
}

// Автоматична сегментація клієнтів для Email/retention
app.get('/email/segments', async (req, res) => {
  try {
    const pages = Number(req.query.pages || 10);
    try {
      const direct = await callBridge('email_segments');
      const orders = await fetchBridgePages('orders', 'orders', pages).catch(error => {
        console.warn('email_segments orders unavailable for cadence:', error.message);
        return [];
      });
      return res.json(compactEmailSegmentsResponse(buildEmailSegments(direct.customers || [], orders, direct.topProducts || [])));
    } catch (directError) {
      console.warn('email_segments bridge action unavailable, fallback to paged data:', directError.message);
    }

    const [customers, orders] = await Promise.all([
      fetchBridgePages('customers', 'customers', pages),
      fetchBridgePages('orders', 'orders', pages)
    ]);
    res.json(compactEmailSegmentsResponse(buildEmailSegments(customers, orders)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── EMAIL SENDING (SMTP) ─────────────────────────────────────

function smtpConfigured() {
  return Boolean(connectionValue('SMTP_HOST') && connectionValue('SMTP_PORT') && connectionValue('SMTP_USER') && connectionValue('SMTP_PASS'));
}

function createMailer() {
  if (!smtpConfigured()) {
    throw new Error('SMTP_HOST, SMTP_PORT, SMTP_USER або SMTP_PASS не задано в .env або програмі');
  }
  const smtpHost = connectionValue('SMTP_HOST_IPV4') || connectionValue('SMTP_HOST');
  return nodemailer.createTransport({
    host: smtpHost,
    port: Number(connectionValue('SMTP_PORT') || 465),
    secure: String(connectionValue('SMTP_PORT') || '465') === '465',
    family: 4,
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, { ...options, family: 4 }, callback);
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 30000,
    auth: {
      user: connectionValue('SMTP_USER'),
      pass: connectionValue('SMTP_PASS')
    },
    tls: {
      servername: connectionValue('SMTP_TLS_SERVERNAME') || connectionValue('SMTP_HOST')
    }
  });
}

function explainSmtpError(error) {
  const msg = error?.message || String(error);
  if (msg.includes('SMTP авторизація не пройшла')) return msg;
  if (msg.includes('SMTP недоступний через IPv6')) return msg;
  if (/\b535\b/i.test(msg) || /invalid login|authentication|auth/i.test(msg)) {
    return `${msg}. SMTP авторизація не пройшла: поштовий сервер не приймає SMTP_USER/SMTP_PASS. Перевір пароль саме для скриньки ${connectionValue('SMTP_USER') || 'SMTP_USER'} у cPanel/хостингу або створи новий пароль поштової скриньки.`;
  }
  if (msg.includes('ENETUNREACH') && msg.includes(':465')) {
    return 'SMTP недоступний через IPv6. Я примусово увімкнув IPv4; якщо помилка лишиться, у .env треба вказати справжній IP поштового сервера як SMTP_HOST_IPV4, бо mail.mercato.com.ua може вести на Cloudflare, а Cloudflare не приймає SMTP 465.';
  }
  if (msg.includes('ETIMEDOUT') || msg.includes('ECONNECTION')) {
    return `${msg}. Можливо SMTP_HOST веде на Cloudflare/proxy. Для SMTP потрібен прямий mail-server host або IP від хостингу/cPanel.`;
  }
  return msg;
}

async function verifySmtpOrThrow() {
  try {
    await createMailer().verify();
  } catch (error) {
    throw new Error(explainSmtpError(error));
  }
}

function normalizeEmail(value) {
  const email = String(value || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function readEmailTracking() {
  const sqliteData = operationalStore.readEmailTracking();
  if (sqliteData) return sqliteData;
  return readJsonFile(EMAIL_TRACKING_PATH, { messages: [] });
}

function writeEmailTracking(data) {
  const payload = {
    messages: Array.isArray(data?.messages) ? data.messages : []
  };
  writeJsonFile(EMAIL_TRACKING_PATH, payload);
  operationalStore.writeEmailTracking(payload);
}

function updateEmailTracking(id, updater) {
  if (!id) return null;
  const data = readEmailTracking();
  const item = data.messages.find(message => message.id === id);
  if (!item) return null;
  updater(item);
  item.updatedAt = new Date().toISOString();
  writeEmailTracking(data);
  return item;
}

function readEmailSuppression() {
  try {
    const data = JSON.parse(fs.readFileSync(EMAIL_SUPPRESSION_PATH, 'utf8'));
    return { emails: Array.isArray(data.emails) ? data.emails : [] };
  } catch {
    return { emails: [] };
  }
}

function writeEmailSuppression(data) {
  fs.writeFileSync(EMAIL_SUPPRESSION_PATH, JSON.stringify({
    emails: (data.emails || []).slice(0, 5000)
  }, null, 2));
}

function isHardEmailFailure(errorOrMessage) {
  const msg = String(errorOrMessage?.message || errorOrMessage || '').toLowerCase();
  return /\b550\b/.test(msg)
    || msg.includes('all recipients were rejected')
    || msg.includes('recipient address rejected')
    || msg.includes('mailbox unavailable')
    || msg.includes('user unknown')
    || msg.includes('domain may not exist')
    || msg.includes('account or domain may not exist');
}

function suppressEmail(email, reason, source = 'smtp_hard_bounce') {
  const normalized = normalizeEmail(email).toLowerCase();
  if (!normalized) return null;
  const data = readEmailSuppression();
  const existing = data.emails.find(item => normalizeEmail(item.email).toLowerCase() === normalized);
  if (existing) {
    existing.reason = existing.reason || String(reason || '');
    existing.source = existing.source || source;
    existing.updatedAt = new Date().toISOString();
  } else {
    data.emails.unshift({
      email: normalized,
      reason: String(reason || ''),
      source,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
  writeEmailSuppression(data);
  return normalized;
}

function emailSuppressionEntries() {
  const byEmail = new Map();
  for (const item of readEmailSuppression().emails || []) {
    const email = normalizeEmail(item.email).toLowerCase();
    if (email) byEmail.set(email, item);
  }
  for (const item of readEmailTracking().messages || []) {
    const email = normalizeEmail(item.to).toLowerCase();
    if (!email || item.status !== 'failed' || !isHardEmailFailure(item.error)) continue;
    if (!byEmail.has(email)) {
      byEmail.set(email, {
        email,
        reason: item.error || 'SMTP hard bounce',
        source: 'tracking_hard_bounce',
        createdAt: item.failedAt || item.createdAt || '',
        updatedAt: item.failedAt || item.createdAt || ''
      });
    }
  }
  return Array.from(byEmail.values());
}

function emailSuppressionSet() {
  return new Set(emailSuppressionEntries().map(item => normalizeEmail(item.email).toLowerCase()).filter(Boolean));
}

function emailSuppressionEntry(email) {
  const normalized = normalizeEmail(email).toLowerCase();
  if (!normalized) return null;
  return emailSuppressionEntries().find(item => normalizeEmail(item.email).toLowerCase() === normalized) || null;
}

function createEmailTrackingRecord({ to, subject, campaign = 'manual', campaignId = '', actionId = '', segmentId = '', segmentTitle = '', draftName = '' }) {
  const data = readEmailTracking();
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const record = {
    id,
    to: normalizeEmail(to),
    subject: String(subject || ''),
    campaign: String(campaign || 'manual'),
    campaignId: String(campaignId || ''),
    actionId: String(actionId || ''),
    segmentId: String(segmentId || ''),
    segmentTitle: String(segmentTitle || ''),
    draftName: String(draftName || ''),
    status: 'queued',
    createdAt: new Date().toISOString(),
    sentAt: '',
    failedAt: '',
    messageId: '',
    error: '',
    openCount: 0,
    firstOpenedAt: '',
    lastOpenedAt: '',
    clickCount: 0,
    firstClickedAt: '',
    lastClickedAt: '',
    clicks: []
  };
  data.messages.unshift(record);
  data.messages = data.messages.slice(0, 2000);
  writeEmailTracking(data);
  return record;
}

function trackingBaseUrl(req) {
  const configured = connectionValue('PUBLIC_BASE_URL') || connectionValue('APP_BASE_URL') || connectionValue('TRACKING_BASE_URL') || '';
  if (configured) return configured.replace(/\/+$/, '');
  if (!req) return '';
  return `${req.protocol}://${req.get('host')}`;
}

function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function trackingUrl(baseUrl, trackingId, targetUrl) {
  if (!baseUrl || !trackingId) return targetUrl;
  return `${baseUrl}/email/t/${encodeURIComponent(trackingId)}?u=${encodeURIComponent(targetUrl)}`;
}

function emailUnsubscribeUrl(baseUrl, trackingId) {
  if (!baseUrl || !trackingId) return '';
  return `${baseUrl}/email/unsubscribe/${encodeURIComponent(trackingId)}`;
}

function commandActionIdForSegment(segmentId) {
  const map = {
    at_risk: 'retain-at-risk',
    new_customers: 'second-purchase',
    replenishment_due: 'customer-replenishment-now',
    vip: 'vip-premium',
    sleeping: 'sleeping-cleanup'
  };
  return map[String(segmentId || '')] || '';
}

function buildEmailTrackingSummary({ actionId = '', segmentId = '' } = {}) {
  const messages = (readEmailTracking().messages || []).filter(item => {
    if (actionId && item.actionId === actionId) return true;
    if (segmentId && item.segmentId === segmentId) return true;
    return false;
  });
  if (!messages.length) return null;
  const sentStatuses = new Set(['smtp_accepted', 'opened', 'clicked']);
  const campaigns = {};
  for (const item of messages) {
    const key = item.campaignId || `${item.campaign || 'manual'}-${item.segmentId || ''}`;
    if (!campaigns[key]) {
      campaigns[key] = {
        id: key,
        title: item.segmentTitle || item.campaign || 'manual',
        draftName: item.draftName || '',
        total: 0,
        sent: 0,
        failed: 0,
        opened: 0,
        clicked: 0,
        lastActivityAt: ''
      };
    }
    campaigns[key].total += 1;
    if (sentStatuses.has(item.status)) campaigns[key].sent += 1;
    if (item.status === 'failed') campaigns[key].failed += 1;
    if (Number(item.openCount || 0) > 0) campaigns[key].opened += 1;
    if (Number(item.clickCount || 0) > 0) campaigns[key].clicked += 1;
    const last = item.lastClickedAt || item.lastOpenedAt || item.sentAt || item.failedAt || item.createdAt || '';
    if (last > campaigns[key].lastActivityAt) campaigns[key].lastActivityAt = last;
  }
  const summary = {
    total: messages.length,
    sent: messages.filter(item => sentStatuses.has(item.status)).length,
    failed: messages.filter(item => item.status === 'failed').length,
    opened: messages.filter(item => Number(item.openCount || 0) > 0).length,
    clicked: messages.filter(item => Number(item.clickCount || 0) > 0).length,
    lastActivityAt: '',
    campaigns: Object.values(campaigns)
      .sort((a, b) => String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)))
      .slice(0, 5)
  };
  summary.lastActivityAt = summary.campaigns[0]?.lastActivityAt || '';
  return summary;
}

function parseStoreDateMs(value) {
  if (!value) return 0;
  const raw = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw) ? raw.replace(' ', 'T') : raw;
  const ms = new Date(normalized).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function compactTrackingPerson(message, extra = {}) {
  const lastActivityAt = message.lastClickedAt || message.lastOpenedAt || message.sentAt || message.failedAt || message.createdAt || '';
  return {
    id: message.id,
    email: normalizeEmail(message.to),
    subject: message.subject || '',
    segmentId: message.segmentId || '',
    segmentTitle: message.segmentTitle || '',
    draftName: message.draftName || '',
    status: message.status || '',
    sentAt: message.sentAt || '',
    lastActivityAt,
    openCount: Number(message.openCount || 0),
    clickCount: Number(message.clickCount || 0),
    ...extra
  };
}

function emailCalibrationType(message = {}) {
  if (directorTrackingActionId(message)) return 'director_personal';
  const campaign = String(message.campaign || '').toLowerCase();
  if (campaign === 'one' || campaign === 'batch') return 'manual_personal';
  if (campaign === 'segment') return 'mass_segment';
  if (campaign === 'test') return 'test';
  return 'other';
}

function emptyEmailCalibrationBucket(id, label) {
  return {
    id,
    label,
    total: 0,
    sent: 0,
    opened: 0,
    clicked: 0,
    ordered: 0,
    buyers: 0,
    revenue: 0,
    revenuePerSent: 0,
    conversionPct: 0,
    sampleReady: false,
    lastActivityAt: ''
  };
}

function summarizeEmailCalibrationBuckets(groups) {
  const combine = (id, label, keys) => {
    const bucket = emptyEmailCalibrationBucket(id, label);
    const buyers = new Set();
    for (const key of keys) {
      const group = groups[key];
      if (!group) continue;
      bucket.total += group.total;
      bucket.sent += group.sent;
      bucket.opened += group.opened;
      bucket.clicked += group.clicked;
      bucket.ordered += group.ordered;
      bucket.revenue += group.revenue;
      for (const email of group._buyers || []) buyers.add(email);
      if (group.lastActivityAt > bucket.lastActivityAt) bucket.lastActivityAt = group.lastActivityAt;
    }
    bucket.buyers = buyers.size;
    bucket.revenue = Math.round(bucket.revenue);
    bucket.revenuePerSent = bucket.sent ? Math.round(bucket.revenue / bucket.sent) : 0;
    bucket.conversionPct = bucket.sent ? Number(((bucket.ordered / bucket.sent) * 100).toFixed(1)) : 0;
    bucket.sampleReady = bucket.sent >= 30;
    return bucket;
  };
  const rows = [
    groups.director_personal,
    groups.manual_personal,
    groups.mass_segment,
    groups.other
  ].filter(Boolean).map(group => {
    const clean = { ...group };
    delete clean._buyers;
    delete clean._orders;
    clean.revenue = Math.round(clean.revenue);
    clean.revenuePerSent = clean.sent ? Math.round(clean.revenue / clean.sent) : 0;
    clean.conversionPct = clean.sent ? Number(((clean.ordered / clean.sent) * 100).toFixed(1)) : 0;
    clean.sampleReady = clean.sent >= 30;
    return clean;
  });
  const personal = combine('personal_total', 'Персональні листи', ['director_personal', 'manual_personal']);
  const mass = combine('mass_total', 'Масові сегменти', ['mass_segment']);
  const neededPersonal = Math.max(0, 30 - personal.sent);
  const verdict = personal.sampleReady
    ? `Персональна вибірка готова до калібрування: ${personal.sent} листів, ${personal.revenuePerSent} грн/лист.`
    : `Для B3 треба ще ${neededPersonal} персональних листів до мінімальної вибірки 30.`;
  return {
    note: 'B3 observation only: ці метрики не змінюють прогноз брифінгу до 2 тижнів даних.',
    personal,
    mass,
    groups: rows,
    verdict
  };
}

function buildEmailIntelligence(orders = []) {
  const messages = (readEmailTracking().messages || [])
    .slice()
    .sort((a, b) => String(b.sentAt || b.createdAt || '').localeCompare(String(a.sentAt || a.createdAt || '')));
  const sentStatuses = new Set(['smtp_accepted', 'opened', 'clicked']);
  const orderByEmail = new Map();
  for (const order of orders || []) {
    const email = normalizeEmail(order.email).toLowerCase();
    if (!email) continue;
    if (!orderByEmail.has(email)) orderByEmail.set(email, []);
    orderByEmail.get(email).push(order);
  }
  for (const list of orderByEmail.values()) {
    list.sort((a, b) => parseStoreDateMs(a.date_added) - parseStoreDateMs(b.date_added));
  }

  const campaignsMap = {};
  const calibrationGroups = {
    director_personal: emptyEmailCalibrationBucket('director_personal', 'Директорські персональні'),
    manual_personal: emptyEmailCalibrationBucket('manual_personal', 'Інші персональні'),
    mass_segment: emptyEmailCalibrationBucket('mass_segment', 'Масові сегменти'),
    other: emptyEmailCalibrationBucket('other', 'Інше')
  };
  for (const group of Object.values(calibrationGroups)) {
    group._buyers = new Set();
    group._orders = new Set();
  }
  const buckets = { ordered: [], clickedNoOrder: [], openedNoClick: [], ignored: [], failed: [] };
  const buyerEmails = new Set();
  let revenueAfterCampaign = 0;

  for (const message of messages) {
    const email = normalizeEmail(message.to).toLowerCase();
    const sentAtMs = parseStoreDateMs(message.sentAt || message.createdAt);
    const matchingOrders = (orderByEmail.get(email) || []).filter(order => parseStoreDateMs(order.date_added) >= sentAtMs);
    const firstOrder = matchingOrders[0] || null;
    const calibrationType = emailCalibrationType(message);
    const calibration = calibrationGroups[calibrationType === 'test' ? 'other' : calibrationType] || calibrationGroups.other;
    const campaignKey = [message.segmentId || message.campaign || 'manual', message.subject || '', message.draftName || ''].join('|');
    if (!campaignsMap[campaignKey]) {
      campaignsMap[campaignKey] = {
        id: campaignKey,
        title: message.segmentTitle || message.campaign || 'manual',
        subject: message.subject || '',
        draftName: message.draftName || '',
        segmentId: message.segmentId || '',
        total: 0,
        sent: 0,
        failed: 0,
        opened: 0,
        clicked: 0,
        ordered: 0,
        revenue: 0,
        lastActivityAt: ''
      };
    }
    const campaign = campaignsMap[campaignKey];
    campaign.total += 1;
    if (sentStatuses.has(message.status)) campaign.sent += 1;
    if (message.status === 'failed') campaign.failed += 1;
    if (Number(message.openCount || 0) > 0) campaign.opened += 1;
    if (Number(message.clickCount || 0) > 0) campaign.clicked += 1;
    const lastActivityAt = message.lastClickedAt || message.lastOpenedAt || message.sentAt || message.failedAt || message.createdAt || '';
    if (lastActivityAt > campaign.lastActivityAt) campaign.lastActivityAt = lastActivityAt;
    calibration.total += 1;
    if (sentStatuses.has(message.status)) calibration.sent += 1;
    if (Number(message.openCount || 0) > 0) calibration.opened += 1;
    if (Number(message.clickCount || 0) > 0) calibration.clicked += 1;
    if (lastActivityAt > calibration.lastActivityAt) calibration.lastActivityAt = lastActivityAt;

    if (firstOrder) {
      const ordersTotal = matchingOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
      campaign.ordered += 1;
      campaign.revenue += ordersTotal;
      buyerEmails.add(email);
      revenueAfterCampaign += ordersTotal;
      calibration.ordered += 1;
      calibration._buyers.add(email);
      for (const order of matchingOrders) {
        const key = directorOrderKey(order, email);
        if (calibration._orders.has(key)) continue;
        calibration._orders.add(key);
        calibration.revenue += Number(order.total || 0);
      }
      buckets.ordered.push(compactTrackingPerson(message, {
        orderId: firstOrder.order_id || '',
        orderDate: firstOrder.date_added || '',
        orderTotal: Number(firstOrder.total || 0),
        ordersAfterEmail: matchingOrders.length,
        products: String(firstOrder.products_list || '').slice(0, 240)
      }));
    } else if (message.status === 'failed') {
      buckets.failed.push(compactTrackingPerson(message, { error: message.error || '' }));
    } else if (Number(message.clickCount || 0) > 0) {
      buckets.clickedNoOrder.push(compactTrackingPerson(message));
    } else if (Number(message.openCount || 0) > 0) {
      buckets.openedNoClick.push(compactTrackingPerson(message));
    } else if (sentStatuses.has(message.status)) {
      buckets.ignored.push(compactTrackingPerson(message));
    }
  }

  const campaigns = Object.values(campaignsMap)
    .sort((a, b) => String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)))
    .slice(0, 12)
    .map(campaign => ({ ...campaign, revenue: Math.round(campaign.revenue) }));

  return {
    publicTrackingConfigured: Boolean(process.env.PUBLIC_BASE_URL || process.env.APP_BASE_URL || process.env.TRACKING_BASE_URL),
    total: messages.length,
    sent: messages.filter(item => sentStatuses.has(item.status)).length,
    opened: messages.filter(item => Number(item.openCount || 0) > 0).length,
    clicked: messages.filter(item => Number(item.clickCount || 0) > 0).length,
    failed: messages.filter(item => item.status === 'failed').length,
    ignored: buckets.ignored.length,
    ordered: buckets.ordered.length,
    buyers: buyerEmails.size,
    revenueAfterCampaign: Math.round(revenueAfterCampaign),
    campaigns,
    calibration: summarizeEmailCalibrationBuckets(calibrationGroups),
    lists: {
      ordered: buckets.ordered.slice(0, 30),
      clickedNoOrder: buckets.clickedNoOrder.slice(0, 30),
      openedNoClick: buckets.openedNoClick.slice(0, 30),
      ignored: buckets.ignored.slice(0, 60),
      failed: buckets.failed.slice(0, 30)
    }
  };
}

function textToHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .split(/\n{2,}/)
    .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function linkifyTrackedHtml(html, baseUrl, trackingId) {
  if (!baseUrl || !trackingId) return html;
  return String(html || '').replace(/https?:\/\/[^\s<"]+/gi, rawUrl => {
    const cleanUrl = rawUrl.replace(/[),.]+$/, '');
    const tail = rawUrl.slice(cleanUrl.length);
    const href = trackingUrl(baseUrl, trackingId, cleanUrl);
    return `<a href="${escapeHtmlAttr(href)}">${escapeHtmlAttr(cleanUrl)}</a>${tail}`;
  });
}

function appendComplianceFooter(body, unsubscribeLink = '') {
  const telegramLink = telegramBotDeepLink('email_remind');
  const telegramLine = telegramLink
    ? `\nTelegram-нагадування: ${telegramLink}\nБот може допомогти повторити замовлення або нагадати, коли час оновити запаси.`
    : '';
  const unsubscribeLine = unsubscribeLink
    ? `\nВідписатися від листів Mercato: ${unsubscribeLink}`
    : '\nЯкщо не хочете отримувати такі листи, напишіть нам у відповідь: відписатися.';
  const source = String(body || '');
  const footer = `\n\n---\nMercato: https://mercato.com.ua/${telegramLine}${unsubscribeLine}`;
  return unsubscribeLink && source.includes(unsubscribeLink) ? source : source + footer;
}

function extractEmailCouponHighlight(body = '') {
  const text = String(body || '');
  const codeMatch = text.match(/(?:промокод|купон|код)\s*[:\-]?\s*([A-Z0-9][A-Z0-9_-]{3,18})/iu);
  const hasCouponSignal = /промокод|купон|знижк|бонус|персональн(ий|ого)\s+код/iu.test(text);
  const discountMatch =
    text.match(/(?:знижка|умова|бонус)\D{0,44}(\d+(?:[.,]\d+)?)\s*(грн|%)/iu)
    || text.match(/(\d+(?:[.,]\d+)?)\s*(грн|%)/iu);
  if (!codeMatch && !(discountMatch && hasCouponSignal)) return null;

  const validToMatch = text.match(/(?:діє\s+до|до)\s*[:\-]?\s*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/iu);
  const code = String(codeMatch?.[1] || '').toUpperCase();
  const discountValue = discountMatch?.[1] ? String(discountMatch[1]).replace(',', '.') : '';
  const discountUnit = discountMatch?.[2] || '';
  return {
    code,
    discountLabel: discountValue ? `${discountValue}${discountUnit === '%' ? '%' : ` ${discountUnit}`}` : '',
    validTo: validToMatch?.[1] || ''
  };
}

function renderEmailCouponBlock(coupon) {
  if (!coupon) return '';
  const discount = coupon.discountLabel || 'персональна знижка';
  const code = coupon.code || '';
  const validTo = coupon.validTo || '';
  return `
    <div style="margin:22px 0 16px;padding:16px 18px;border:2px solid #1f7a5c;border-radius:10px;background:#eefaf2;">
      <div style="font-size:12px;font-weight:900;text-transform:uppercase;color:#1f7a5c;margin-bottom:6px;">Персональний бонус</div>
      <div style="font-size:30px;line-height:1.05;font-weight:900;color:#123d31;margin-bottom:8px;">${escapeHtml(discount)}</div>
      ${code ? `<div style="font-size:15px;line-height:1.45;color:#2e2b29;">Промокод: <span style="display:inline-block;margin-left:6px;padding:4px 9px;border-radius:6px;background:#123d31;color:#ffffff;font-weight:900;letter-spacing:0.5px;">${escapeHtml(code)}</span></div>` : ''}
      <div style="margin-top:8px;font-size:12px;line-height:1.45;color:#3d554a;">${validTo ? `Діє до ${escapeHtml(validTo)}. ` : ''}Код працює для одного замовлення.</div>
    </div>`;
}

function buildBrandedEmailHtml({ body, preheader = '', ctaLabel = 'Перейти на Mercato', ctaUrl = 'https://mercato.com.ua/', baseUrl = '', trackingId = '' }) {
  const trackedCtaUrl = trackingUrl(baseUrl, trackingId, ctaUrl || 'https://mercato.com.ua/');
  const unsubscribeLink = emailUnsubscribeUrl(baseUrl, trackingId);
  const coupon = extractEmailCouponHighlight(body);
  const bodyForHtml = coupon ? stripOldCouponText(body) : body;
  const htmlBody = linkifyTrackedHtml(textToHtml(bodyForHtml), baseUrl, trackingId);
  const siteUrl = trackingUrl(baseUrl, trackingId, 'https://mercato.com.ua/');
  const telegramUrl = telegramBotDeepLink('email_remind');
  const trackedTelegramUrl = telegramUrl ? trackingUrl(baseUrl, trackingId, telegramUrl) : '';
  return `
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>` : ''}
    <div style="margin:0;padding:0;background:#f2f6f0;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f6f0;margin:0;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#2e2b29;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fffefa;border:1px solid #dfe7df;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="padding:22px 26px 16px;border-bottom:1px solid #dfe7df;background:#123d31;">
                  <div style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:0;">Mercato</div>
                  <div style="margin-top:4px;font-size:13px;line-height:1.45;color:#d7f58a;">Свіжообсмажена кава, чай і уважні поради до вашої чашки</div>
                </td>
              </tr>
              <tr>
                <td style="padding:26px 26px 12px;font-size:16px;line-height:1.72;color:#26312c;">
                  ${htmlBody}
                  ${renderEmailCouponBlock(coupon)}
                  <div style="margin:24px 0 8px;">
                    <a href="${escapeHtmlAttr(trackedCtaUrl)}" style="display:inline-block;background:#3e2c24;color:#ffffff;text-decoration:none;border-radius:8px;padding:13px 20px;font-size:15px;font-weight:900;">${escapeHtml(ctaLabel || 'Перейти на Mercato')}</a>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:18px 26px 24px;border-top:1px solid #dfe7df;background:#f7fbf5;font-size:12px;line-height:1.55;color:#5f6f66;">
                  ${trackedTelegramUrl ? `
                  <div style="margin:0 0 14px;padding:14px 16px;border:2px solid #1f7a5c;border-radius:10px;background:#123d31;color:#ffffff;">
                    <div style="font-size:15px;font-weight:900;color:#ffffff;margin-bottom:4px;">Нагадування без зайвих листів</div>
                    <div style="margin-bottom:12px;color:#dce9e2;">Telegram допоможе повторити замовлення або підкаже, коли час оновити запаси кави чи чаю.</div>
                    <a href="${escapeHtmlAttr(trackedTelegramUrl)}" style="display:inline-block;background:#d7f58a;color:#123d31;border-radius:7px;padding:9px 12px;font-weight:900;text-decoration:none;">Увімкнути в Telegram</a>
                  </div>` : ''}
                  <div style="margin-bottom:8px;">
                    <a href="${escapeHtmlAttr(siteUrl)}" style="color:#123d31;font-weight:900;text-decoration:none;">mercato.com.ua</a>
                    <span style="color:#a5b5ab;"> · </span>
                    <a href="${escapeHtmlAttr(trackingUrl(baseUrl, trackingId, 'https://mercato.com.ua/kava-v-zernah'))}" style="color:#1f7a5c;text-decoration:none;">Кава</a>
                    <span style="color:#a5b5ab;"> · </span>
                    <a href="${escapeHtmlAttr(trackingUrl(baseUrl, trackingId, 'https://mercato.com.ua/chay'))}" style="color:#1f7a5c;text-decoration:none;">Чай</a>
                  </div>
                  Ви отримали цей лист, бо взаємодіяли з Mercato.
                  ${unsubscribeLink ? `<br>Якщо більше не хочете отримувати наші листи, <a href="${escapeHtmlAttr(unsubscribeLink)}" style="color:#1f7a5c;font-weight:900;text-decoration:underline;">відпишіться тут</a>. Ми одразу додамо адресу у stop-list.` : '<br>Якщо більше не хочете отримувати наші листи, напишіть нам у відповідь: відписатися.'}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>`;
}

async function sendEmailMessage({ to, subject, body, preheader, ctaLabel = '', ctaUrl = '', baseUrl = '', tracking = {} }) {
  const email = normalizeEmail(to);
  if (!email) throw new Error('Некоректний email отримувача');
  if (!subject || !body) throw new Error('Тема і текст листа обовʼязкові');
  const suppression = emailSuppressionEntry(email);
  if (suppression && tracking.campaign !== 'test') {
    throw new Error(`Email у stop-list (${suppression.reason || suppression.source || 'відписався'}): ${email}`);
  }
  const safeBody = replaceEmailPlaceholders(body, {});

  const record = createEmailTrackingRecord({
    to: email,
    subject,
    campaign: tracking.campaign || 'manual',
    campaignId: tracking.campaignId || '',
    actionId: tracking.actionId || '',
    segmentId: tracking.segmentId || '',
    segmentTitle: tracking.segmentTitle || '',
    draftName: tracking.draftName || ''
  });

  const unsubscribeLink = emailUnsubscribeUrl(baseUrl, record.id);
  const finalBody = appendComplianceFooter(safeBody, unsubscribeLink);
  const pixel = baseUrl ? `<img src="${escapeHtmlAttr(baseUrl)}/email/o/${encodeURIComponent(record.id)}.gif" width="1" height="1" alt="" style="display:none;width:1px;height:1px;opacity:0;">` : '';
  const html = `${buildBrandedEmailHtml({
    body: safeBody,
    preheader,
    ctaLabel: ctaLabel || tracking.ctaLabel || 'Перейти на Mercato',
    ctaUrl: ctaUrl || tracking.ctaUrl || firstUrlFromText(safeBody) || 'https://mercato.com.ua/',
    baseUrl,
    trackingId: record.id
  })}${pixel}`;
  const transport = createMailer();
  try {
    const headers = unsubscribeLink
      ? {
          'List-Unsubscribe': `<${unsubscribeLink}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
      : {};
    const info = await transport.sendMail({
      from: `"Mercato" <${connectionValue('SMTP_USER')}>`,
      to: email,
      subject,
      text: finalBody,
      html,
      headers
    });
    updateEmailTracking(record.id, item => {
      item.status = 'smtp_accepted';
      item.sentAt = new Date().toISOString();
      item.messageId = info.messageId || '';
    });
    return { ...info, trackingId: record.id };
  } catch (error) {
    const explained = explainSmtpError(error);
    updateEmailTracking(record.id, item => {
      item.status = 'failed';
      item.failedAt = new Date().toISOString();
      item.error = explained;
    });
    throw new Error(explained);
  }
}

const segmentScheduleJobs = new Map();
const segmentScheduleLog = [];

function segmentRecipients(segment) {
  const raw = Array.isArray(segment?.recipients) && segment.recipients.length
    ? segment.recipients
    : Array.isArray(segment?.batchPreview)
      ? segment.batchPreview
      : Array.isArray(segment?.sampleCustomers)
        ? segment.sampleCustomers
        : [];
  const seen = new Set();
  const suppressed = emailSuppressionSet();
  return raw
    .filter(customer => {
      const email = normalizeEmail(customer?.email).toLowerCase();
      if (!email || seen.has(email)) return false;
      seen.add(email);
      if (suppressed.has(email)) return false;
      return customer?.spam?.canEmail !== false && customer?.canSend !== false;
    })
    .map(customer => ({ ...customer, email: normalizeEmail(customer.email) }));
}

function recipientSelectorSet(value = []) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[,\s]+/);
  const expanded = raw.flatMap(item => {
    if (item && typeof item === 'object') {
      return [
        item.customerId,
        item.customer_id,
        item.id,
        item.email,
        item.name,
        item.fullName
      ];
    }
    return [item];
  });
  return new Set(expanded
    .map(item => String(item || '').trim().toLowerCase())
    .filter(Boolean));
}

function recipientMatchKeys(customer = {}) {
  return [
    customer.customerId,
    customer.customer_id,
    customer.id,
    customer.email,
    customer.name,
    customer.fullName
  ].map(item => String(item || '').trim().toLowerCase()).filter(Boolean);
}

function filterSegmentRecipientsForRequest(segment = {}, options = {}) {
  const includeSet = recipientSelectorSet(options.recipientIds);
  const excludeSet = recipientSelectorSet(options.excludedRecipientIds);
  if (!includeSet.size && !excludeSet.size) return segment;

  const recipients = segmentRecipients(segment).filter(customer => {
    const keys = recipientMatchKeys(customer);
    const included = !includeSet.size || keys.some(key => includeSet.has(key));
    const excluded = excludeSet.size && keys.some(key => excludeSet.has(key));
    return included && !excluded;
  });

  return {
    ...segment,
    recipients,
    count: recipients.length,
    selectedCount: recipients.length
  };
}

function personalizeSegmentDraft(draft, customer) {
  const firstName = String(customer?.name || '').trim().split(/\s+/)[0] || '';
  const purchasedProduct = customer?.recentOrders?.[0]?.products?.[0]
    || customer?.topProducts?.[0]?.name
    || customer?.recommendations?.[0]?.name
    || '';
  const recommendedProduct = customer?.recommendations?.[0]?.name || customer?.topProducts?.[0]?.name || purchasedProduct;
  let body = replaceEmailPlaceholders(draft?.body || '', {
    firstName,
    purchasedProduct,
    recommendedProduct
  });
  if (firstName) {
    body = body.replace(/\b(Привіт|Вітаю|Доброго дня),\s*друже!?/i, `$1, ${firstName}!`);
  }
  if (purchasedProduct) {
    body = body.replace(/\bваша кава\b/i, purchasedProduct);
  }
  if (firstName && !body.toLowerCase().includes(firstName.toLowerCase())) {
    body = `Доброго дня, ${firstName}!\n\n${body}`;
  }
  const favorite = customer?.topProducts?.[0]?.name || customer?.recommendations?.[0]?.name || '';
  if (favorite && !body.includes(favorite)) {
    body += `\n\nПідібрали пропозицію з урахуванням ваших попередніх покупок, зокрема ${favorite}.`;
  }
  return {
    email: customer.email,
    name: customer.name || '',
    subject: draft.subject,
    preheader: draft.preheader,
    body,
    cta: draft.cta || 'Перейти на Mercato',
    ctaUrl: draft.ctaUrl || draft.productUrl || draft.categoryUrl || (recommendedProduct ? mercatoSearchUrl(recommendedProduct) : 'https://mercato.com.ua/'),
    canSend: true
  };
}

async function sendSegmentEmailNow({ segment, draft, limit = 20, baseUrl = '' }) {
  if (!draft?.subject || !draft?.body) throw new Error('Немає теми або тексту листа');
  assertEmailDraftSafe(draft, draft.name || 'segment email');
  await verifySmtpOrThrow();
  const max = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const segmentCoupon = extractCouponSettingsFromDraft(draft);
  const existingCouponCode = extractCouponCodeFromDraft(draft);
  const existingCouponDateEnd = draft.couponDateEnd || draft.dateEnd || draft.date_end || '';
  const couponCleanup = segmentCoupon && !existingCouponCode ? await cleanupExpiredCouponsSafe({ prefix: 'MRC', mode: 'delete' }) : null;
  const recipients = segmentRecipients(segment);
  const trackingActionId = String(segment?.actionId || draft?.actionId || commandActionIdForSegment(segment?.id) || '').trim();
  const trackingSegmentId = String(segment?.id || draft?.segmentId || '').trim();
  const trackingCampaignId = String(segment?.campaignId || trackingActionId || '').trim();
  const sentSubjects = new Set((readEmailTracking().messages || [])
    .filter(item =>
      item.segmentId === trackingSegmentId
      && item.subject === String(draft.subject || '')
      && ['smtp_accepted', 'opened', 'clicked'].includes(item.status)
    )
    .map(item => normalizeEmail(item.to).toLowerCase()));
  const remaining = recipients.filter(customer => !sentSubjects.has(normalizeEmail(customer.email).toLowerCase()));
  const queue = remaining.slice(0, max).map(customer => personalizeSegmentDraft(draft, customer));
  if (!queue.length) throw new Error('У сегменті немає клієнтів з email для відправки');

  const sent = [];
  const failed = [];
  for (const item of queue) {
    try {
      let body = item.body;
      assertEmailDraftSafe({ ...item, body }, item.name || item.email || 'personalized segment email');
      let couponCode = '';
      if (segmentCoupon) {
        if (existingCouponCode) {
          couponCode = existingCouponCode;
          body = addServerCouponText(item.body, couponCode, segmentCoupon, existingCouponDateEnd);
        } else {
          const coupon = await callBridge('create_coupon', {
            code: generateCouponCode('MRC'),
            name: `Mercato сегментна знижка - ${item.name || item.email}`,
            discount: segmentCoupon.discount,
            type: segmentCoupon.type,
            days: segmentCoupon.days,
            uses_total: 1000,
            uses_customer: 1,
            logged: 0
          });
          couponCode = coupon.code || '';
          body = addServerCouponText(item.body, couponCode, segmentCoupon, coupon.date_end);
        }
        assertEmailDraftSafe({ ...item, body }, item.name || item.email || 'personalized segment email');
      }
      const info = await sendEmailMessage({
        to: item.email,
        subject: item.subject,
        preheader: item.preheader,
        body,
        ctaLabel: item.cta,
        ctaUrl: item.ctaUrl,
        baseUrl,
        tracking: {
          campaign: 'segment',
          campaignId: trackingCampaignId,
          actionId: trackingActionId,
          segmentId: trackingSegmentId,
          segmentTitle: segment?.title || '',
          draftName: draft?.name || 'segment email'
        }
      });
      sent.push({ to: item.email, name: item.name, messageId: info.messageId, trackingId: info.trackingId, couponCode });
    } catch (error) {
      failed.push({ to: item.email, name: item.name, error: error.message });
    }
  }
  return {
    sent,
    failed,
    attempted: queue.length,
    skippedAlreadySent: sentSubjects.size,
    remainingAfterThisBatch: Math.max(0, remaining.length - queue.length),
    totalRecipients: recipients.length,
    couponCleanup
  };
}

function scheduleSegmentSend(job) {
  const id = `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const delay = Math.max(0, new Date(job.sendAt).getTime() - Date.now());
  const record = { id, status: 'scheduled', createdAt: new Date().toISOString(), ...job };
  segmentScheduleLog.unshift(record);
  const timer = setTimeout(async () => {
    record.status = 'sending';
    record.startedAt = new Date().toISOString();
    try {
      const result = await sendSegmentEmailNow(job);
      record.status = 'sent';
      record.finishedAt = new Date().toISOString();
      record.result = result;
    } catch (error) {
      record.status = 'failed';
      record.finishedAt = new Date().toISOString();
      record.error = error.message;
    } finally {
      segmentScheduleJobs.delete(id);
    }
  }, delay);
  segmentScheduleJobs.set(id, timer);
  return record;
}

app.get('/email/smtp-status', (req, res) => {
  res.json({
    configured: smtpConfigured(),
    host: connectionValue('SMTP_HOST') || '',
    hostOverride: connectionValue('SMTP_HOST_IPV4') || '',
    tlsServername: connectionValue('SMTP_TLS_SERVERNAME') || connectionValue('SMTP_HOST') || '',
    port: connectionValue('SMTP_PORT') || '',
    user: connectionValue('SMTP_USER') || '',
    from: connectionValue('SMTP_USER') || '',
    trackingBaseUrl: trackingBaseUrl(req),
    publicTrackingConfigured: Boolean(connectionValue('PUBLIC_BASE_URL') || connectionValue('APP_BASE_URL') || connectionValue('TRACKING_BASE_URL'))
  });
});

app.get('/email/smtp-verify', async (req, res) => {
  try {
    await verifySmtpOrThrow();
    res.json({ ok: true, message: 'SMTP підключення успішне' });
  } catch (error) {
    console.error('SMTP verify error:', error.message);
    res.status(500).json({ error: explainSmtpError(error) });
  }
});

app.get('/email/coupon-attribution', async (req, res) => {
  try {
    const data = await callBridge('coupon_usage', {
      prefix: req.query.prefix || 'MRC',
      days: req.query.days || 90,
      limit: req.query.limit || 300
    });
    const coupons = Array.isArray(data.coupons) ? data.coupons : [];
    const totals = coupons.reduce((acc, row) => {
      const uses = Number(row.uses_count || 0);
      acc.uses += uses;
      acc.discount += Math.abs(Number(row.amount_total || 0));
      if (Number(row.status || 0) === 1) acc.active += 1;
      if (uses >= Number(row.uses_total || 0) && Number(row.uses_total || 0) > 0) acc.exhausted += 1;
      return acc;
    }, { uses: 0, active: 0, exhausted: 0, discount: 0 });
    res.json({
      since: data.since || '',
      summary: {
        uses: totals.uses,
        coupons: coupons.length,
        active: totals.active,
        exhausted: totals.exhausted,
        discount: Math.round(totals.discount)
      },
      coupons
    });
  } catch (error) {
    res.status(500).json({ error: explainBridgeError(error) });
  }
});

function explainBridgeError(error) {
  const msg = String(error?.message || error || 'Невідома помилка bridge');
  if (msg.includes('Unauthorized') || msg.includes('403')) {
    return 'Bridge не авторизовано. Перевірте BRIDGE_SECRET і BRIDGE_URL в .env.';
  }
  if (msg.includes('POST required')) {
    return 'Bridge вимагає POST-запит. Перевірте, чи на сервері завантажено актуальний mercato-bridge.php.';
  }
  if (msg.includes('Unknown action')) {
    return 'На хостингу ще стара версія mercato-bridge.php. Завантажте локальний bridge v23 у /public_html/mercato-bridge.php.';
  }
  if (/title\s+and\s+content\s+are\s+required/i.test(msg)) {
    return 'Bridge не отримав title/content після fallback-передачі. На хостингу зараз стара версія bridge: завантажте локальний mercato-bridge.php v23, він правильно читає form/base64 payload.';
  }
  if (/Field 'upc' doesn't have a default value|Product insert failed/i.test(msg)) {
    return 'OpenCart не створив товар або опис товару, бо в таблицях product/product_description є обовʼязкові поля без default. Це виправлено у локальному bridge v23: завантажте його у /public_html/mercato-bridge.php.';
  }
  if (msg.includes('Product not found') || msg.includes('Category not found') || msg.includes('Information page not found')) {
    return msg;
  }
  if (msg.includes('Bridge response is not valid JSON')) {
    return `${msg}. Можливо, на хостингу ще стара версія bridge або він повертає HTML/невалідний JSON.`;
  }
  if (/fetch failed|network|ECONNRESET|UND_ERR|socket|TLS/i.test(msg)) {
    return `${msg}. Не вдалося стабільно передати POST у OpenCart bridge. Система пробує JSON → form → base64, але якщо це повториться, перевірте ModSecurity/WAF на хостингу або доступність ${connectionValue('BRIDGE_URL') || 'BRIDGE_URL'}.`;
  }
  if (/порожня відповідь/i.test(msg)) {
    return `${msg}. Це найчастіше означає PHP fatal error у bridge, WAF/ModSecurity на HTML POST або частково завантажений mercado-bridge.php. Завантажте актуальний bridge v23 і mercado-bridge-secrets.php поруч.`;
  }
  if (msg.includes('Порожня відповідь від bridge')) {
    return `${msg}. Перевірте, чи bridge доступний за BRIDGE_URL і чи відповідає.`;
  }
  return msg;
}

app.post('/email/send-test', async (req, res) => {
  try {
    const { to, subject, body, preheader, cta, ctaUrl } = req.body;
    assertEmailDraftSafe({ subject, body, preheader, cta }, 'тестовий лист');
    await verifySmtpOrThrow();
    const info = await sendEmailMessage({
      to,
      subject,
      body,
      preheader,
      ctaLabel: cta,
      ctaUrl,
      baseUrl: trackingBaseUrl(req),
      tracking: { campaign: 'test', draftName: 'test' }
    });
    res.json({ ok: true, messageId: info.messageId, trackingId: info.trackingId, to: normalizeEmail(to) });
  } catch (error) {
    console.error('Помилка тестової відправки:', error.message);
    res.status(500).json({ error: explainSmtpError(error) });
  }
});

app.post('/email/send-one', async (req, res) => {
  try {
    const { draft, confirmPhrase } = req.body;
    if (confirmPhrase !== 'SEND_MERCATO_EMAIL') {
      return res.status(400).json({ error: 'Потрібне підтвердження SEND_MERCATO_EMAIL' });
    }
    if (draft?.canSend === false) {
      return res.status(400).json({ error: draft.reason || 'Цей лист позначено як небажаний до відправки' });
    }
    assertEmailDraftSafe(draft, draft.name || 'персональний лист');
    await verifySmtpOrThrow();
    const couponSettings = extractCouponSettingsFromDraft(draft);
    let body = draft.body;
    let couponCode = '';
    let coupon = null;
    if (couponSettings) {
      const existingCouponCode = extractCouponCodeFromDraft(draft);
      if (existingCouponCode) {
        couponCode = existingCouponCode;
        coupon = {
          code: couponCode,
          date_end: draft.couponDateEnd || draft.dateEnd || draft.date_end || '',
          source: 'draft'
        };
        body = addServerCouponText(draft.body, couponCode, couponSettings, coupon.date_end);
      } else {
        await cleanupExpiredCouponsSafe({ prefix: 'MRC', mode: 'delete' });
        coupon = await callBridge('create_coupon', {
          code: generateCouponCode('MRC'),
          name: `Mercato персональна знижка - ${draft.name || draft.email}`,
          discount: couponSettings.discount,
          type: couponSettings.type,
          days: couponSettings.days,
          uses_total: 1,
          uses_customer: 1,
          logged: 0
        });
        couponCode = coupon.code || '';
        body = addServerCouponText(draft.body, couponCode, couponSettings, coupon.date_end);
      }
      assertEmailDraftSafe({ ...draft, body }, draft.name || 'персональний лист з купоном');
    }
    const info = await sendEmailMessage({
      to: draft.email,
      subject: draft.subject,
      preheader: draft.preheader,
      body,
      ctaLabel: draft.cta,
      ctaUrl: draft.ctaUrl || draft.productUrl || draft.categoryUrl,
      baseUrl: trackingBaseUrl(req),
      tracking: {
        campaign: 'one',
        campaignId: draft.campaignId || draft.actionId || '',
        actionId: draft.actionId || '',
        segmentId: draft.segmentId || '',
        segmentTitle: draft.segmentTitle || '',
        draftName: draft.name || draft.personalOffer || 'personal'
      }
    });
    res.json({ ok: true, messageId: info.messageId, trackingId: info.trackingId, to: normalizeEmail(draft.email), couponCode, coupon });
  } catch (error) {
    console.error('Помилка відправки листа:', error.message);
    res.status(500).json({ error: explainSmtpError(error) });
  }
});

app.post('/email/send-batch', async (req, res) => {
  try {
    const { drafts, confirmPhrase, limit = 10 } = req.body;
    if (confirmPhrase !== 'SEND_MERCATO_BATCH') {
      return res.status(400).json({ error: 'Потрібне підтвердження SEND_MERCATO_BATCH' });
    }
    const queue = (Array.isArray(drafts) ? drafts : [])
      .filter(d => d?.canSend !== false && normalizeEmail(d?.email))
      .slice(0, Math.min(Number(limit) || 10, 20));
    if (!queue.length) return res.status(400).json({ error: 'Немає листів для відправки' });
    for (const draft of queue) {
      assertEmailDraftSafe(draft, draft.name || draft.email || 'batch email');
    }
    await verifySmtpOrThrow();

    const sent = [];
    const failed = [];
    for (const draft of queue) {
      try {
        const info = await sendEmailMessage({
          to: draft.email,
          subject: draft.subject,
          preheader: draft.preheader,
          body: draft.body,
          ctaLabel: draft.cta,
          ctaUrl: draft.ctaUrl || draft.productUrl || draft.categoryUrl,
          baseUrl: trackingBaseUrl(req),
          tracking: {
            campaign: 'batch',
            campaignId: draft.campaignId || draft.actionId || '',
            actionId: draft.actionId || '',
            segmentId: draft.segmentId || '',
            segmentTitle: draft.segmentTitle || '',
            draftName: draft.name || 'batch'
          }
        });
        sent.push({ to: normalizeEmail(draft.email), messageId: info.messageId, trackingId: info.trackingId });
      } catch (error) {
        failed.push({ to: draft.email, error: error.message });
      }
    }

    res.json({ ok: true, sent, failed });
  } catch (error) {
    console.error('Помилка batch-відправки:', error.message);
    res.status(500).json({ error: explainSmtpError(error) });
  }
});

async function buildCommandCenterPayload({ forceRefresh = false } = {}) {
  let bridgeWarning = '';
  let commandOrders = [];
  const stats = await callBridge('stats').catch(error => {
    bridgeWarning = error.message;
    return {};
  });
  let retention;
  let source = 'email_segments';
  try {
    const direct = await callBridge('email_segments');
    commandOrders = await fetchBridgePages('orders', 'orders', 10).catch(error => {
      console.warn('command-center orders unavailable:', error.message);
      return [];
    });
    retention = buildEmailSegments(direct.customers || [], commandOrders, direct.topProducts || []);
  } catch (directError) {
    if (!/unknown action/i.test(String(directError.message || ''))) {
      console.warn('command-center email_segments unavailable, fallback to customers/orders:', directError.message);
    }
    source = 'customers_orders_fallback';
    try {
      const [customers, orders] = await Promise.all([
        fetchBridgePages('customers', 'customers', 10),
        fetchBridgePages('orders', 'orders', 10)
      ]);
      commandOrders = orders;
      retention = buildEmailSegments(customers, orders);
    } catch (fallbackError) {
      bridgeWarning = fallbackError.message || bridgeWarning;
      source = 'bridge_unavailable';
      retention = {
        totals: { customers: 0, orders: 0, revenue: 0, avgOrderValue: 0 },
        topProducts: [],
        segments: []
      };
    }
  }
  const opencartSync = await syncOpenCartAuditForCommandCenter({ force: forceRefresh, limit: 120 });
  const syncWarning = opencartSync.status === 'error' ? opencartSync.error : '';
  if (syncWarning && !bridgeWarning) bridgeWarning = syncWarning;
  const payload = { ...buildCommandCenter({ stats, retention, orders: commandOrders }), source, bridgeWarning, opencartSync };
  payload.telegramSummary = await fetchTelegramDirectorSummary();
  if (opencartSync.changedCount) {
    payload.actions = [{
      id: `opencart-sync-${Date.now()}`,
      priority: 'high',
      title: `OpenCart оновив ${Number(opencartSync.changedCount || 0).toLocaleString('uk')} товар(ів)`,
      why: 'Command Center знайшов зміни у товарних SEO-полях/описі/характеристиках і поставив їх у SEO-моніторинг.',
      expectedImpact: 'Через 14 днів після індексації перевірити GSC: CTR, кліки, позиція.',
      modules: ['OpenCart', 'SEO', 'GSC'],
      data: (opencartSync.changedProducts || []).slice(0, 5).map(item => `${item.name || item.product_id}: ${(item.changedFields || []).join(', ') || 'зміна'}`),
      primaryAction: { label: 'Подивитись памʼять', tab: 'command' },
      secondaryAction: { label: 'Оновити GSC', tab: 'command' }
    }, ...(payload.actions || [])];
    payload.summary.highPriority = Number(payload.summary.highPriority || 0) + 1;
    payload.summary.actions = Number(payload.summary.actions || 0) + 1;
  }
  payload.trustSummary = buildTrustReport(50);
  if (payload.telegramSummary.status === 'ok' && Number(payload.telegramSummary.stats?.warm_leads?.length || 0)) {
    payload.actions = [{
      id: 'telegram-warm-leads',
      priority: 'medium',
      title: `Telegram: ${Number(payload.telegramSummary.stats.warm_leads.length).toLocaleString('uk')} теплих лідів`,
      why: 'Бот бачить людей із переглядами/кошиком/checkout intent без замовлення сьогодні. Це permission-based канал, не холодна розсилка.',
      expectedImpact: 'Перевірити, чи варто дати мʼяке нагадування в Telegram або не чіпати людину через спільний cooldown.',
      modules: ['Telegram', 'Retention', 'Кошик'],
      data: payload.telegramSummary.stats.warm_leads.slice(0, 5).map(item => `${item.name || `tg:${item.tg_id}`}: 👀${item.views || 0} 🛒${item.adds || 0} ✅${item.checkout || 0}`),
      primaryAction: { label: 'Подивитись Telegram', tab: 'command' }
    }, ...(payload.actions || [])];
    payload.summary.actions = Number(payload.summary.actions || 0) + 1;
  }
  if (payload.trustSummary.status === 'fail') {
    const failures = payload.trustSummary.recentFailures || [];
    payload.actions = [{
      id: 'trust-gate-failed',
      priority: 'high',
      title: `Trust gate не пройдено: ${Number(payload.trustSummary.failed || 0).toLocaleString('uk')} товар(ів)`,
      why: 'Останні consistency checks знайшли high/critical розбіжності між OpenCart attributes і live/preview правої картки.',
      expectedImpact: 'Перед зовнішнім клієнтом і масовим publish треба вирівняти джерело правди: характеристики OpenCart → preview → live .spec-card.',
      modules: ['Trust', 'OpenCart', 'Product page'],
      data: failures.slice(0, 5).map(item => `${item.product?.name || item.url || item.productId}: ${Number(item.criticalCount || 0) + Number(item.highCount || 0)} high/critical`),
      primaryAction: { label: 'Відкрити Trust Gate', tab: 'command', focus: 'trustGate' },
      secondaryAction: { label: 'Повторити перевірку', tab: 'command', focus: 'trustGate', run: 'trust_batch' }
    }, ...(payload.actions || [])];
    payload.summary.highPriority = Number(payload.summary.highPriority || 0) + 1;
    payload.summary.actions = Number(payload.summary.actions || 0) + 1;
  }
  payload.memory = buildBusinessMemoryDigest(payload);
  return payload;
}

const savedCommandCenterCache = readJsonFile(COMMAND_CENTER_CACHE_PATH, null);
let commandCenterPayloadCache = savedCommandCenterCache?.payload || null;
let commandCenterPayloadCachedAt = Date.parse(savedCommandCenterCache?.savedAt || '') || 0;
let commandCenterPayloadInFlight = null;

async function refreshCommandCenterPayload({ forceRefresh = false } = {}) {
  if (commandCenterPayloadInFlight) return commandCenterPayloadInFlight;
  commandCenterPayloadInFlight = buildCommandCenterPayload({ forceRefresh })
    .then(payload => {
      commandCenterPayloadCache = payload;
      commandCenterPayloadCachedAt = Date.now();
      writeJsonFile(COMMAND_CENTER_CACHE_PATH, {
        version: 1,
        savedAt: new Date(commandCenterPayloadCachedAt).toISOString(),
        payload
      });
      return payload;
    })
    .finally(() => {
      commandCenterPayloadInFlight = null;
    });
  return commandCenterPayloadInFlight;
}

async function loadCommandCenterPayload({ forceRefresh = false } = {}) {
  const hasCache = Boolean(commandCenterPayloadCache);
  const cacheFresh = hasCache && Date.now() - commandCenterPayloadCachedAt < COMMAND_CENTER_CACHE_TTL_MS;

  if (!forceRefresh && hasCache) {
    if (!cacheFresh && !commandCenterPayloadInFlight) {
      refreshCommandCenterPayload().catch(error => {
        console.warn('Command Center background refresh failed:', error.message);
      });
    }
    return commandCenterPayloadCache;
  }

  try {
    return await refreshCommandCenterPayload({ forceRefresh });
  } catch (error) {
    if (hasCache) {
      console.warn('Command Center refresh failed, serving last successful cache:', error.message);
      return {
        ...commandCenterPayloadCache,
        bridgeWarning: commandCenterPayloadCache.bridgeWarning || `Показано останні збережені дані: ${error.message}`
      };
    }
    throw error;
  }
}

function apiPriorityRank(priority = '') {
  return ({ high: 0, medium: 1, low: 2 })[String(priority || '').toLowerCase()] ?? 3;
}

function apiActionTarget(action = {}) {
  const primary = action.primaryAction || action.secondaryAction || {};
  const product = Array.isArray(action.productOpportunities) ? action.productOpportunities[0] : null;
  const url = primary.url || action.url || product?.url || '';
  const pageLabel = action.pageLabel || primary.pageLabel || seoActionUrlLabel(url);
  const name = primary.productName || action.productName || product?.name || pageLabel || action.title || '';
  const tab = primary.tab || action.tab || '';
  let kind = 'business';
  if (/email|retention|customer/i.test(`${tab} ${action.id || ''} ${(action.modules || []).join(' ')}`)) kind = 'customer';
  if (/seo|product|generate|opencart|trust/i.test(`${tab} ${action.id || ''} ${(action.modules || []).join(' ')}`)) kind = 'content';
  if (/monitor|competitor|ux/i.test(`${tab} ${action.id || ''} ${(action.modules || []).join(' ')}`)) kind = 'monitoring';
  return { kind, name, url, tab };
}

function apiWorkItemFromAction(action = {}, index = 0, source = 'command_center') {
  const target = apiActionTarget(action);
  const primary = action.primaryAction || null;
  const secondary = action.secondaryAction || null;
  return {
    id: String(action.id || `action-${index}`),
    title: String(action.title || 'Дія').trim(),
    type: target.kind,
    priority: action.priority || 'medium',
    status: action.status || 'open',
    source,
    why: action.why || '',
    expectedImpact: action.expectedImpact || '',
    modules: Array.isArray(action.modules) ? action.modules : [],
    data: Array.isArray(action.data) ? action.data.slice(0, 6) : [],
    target,
    actions: [
      primary ? { id: 'primary', label: primary.label || 'Відкрити', ...primary } : null,
      secondary ? { id: 'secondary', label: secondary.label || 'Деталі', ...secondary } : null
    ].filter(Boolean),
    sort: {
      priority: apiPriorityRank(action.priority),
      index
    }
  };
}

function apiWorkItemDisabled(item = {}) {
  if (item.disabled || item.status === 'disabled') return true;
  const haystack = [
    item.title,
    item.why,
    item.expectedImpact,
    item.target?.name,
    item.target?.url,
    ...(item.data || []),
    ...(item.modules || [])
  ].join(' ').toLowerCase();
  return /товар\s+вимкнен|вимкнен(ий|а|о|і)?\s+товар|disabled|inactive/.test(haystack);
}

function apiDecisionEntries(options = {}) {
  if (Array.isArray(options.decisionEntries)) return options.decisionEntries;
  return readActionLog().entries || [];
}

function apiDecisionForIds(ids = [], entries = []) {
  for (const id of ids.map(value => String(value || '').trim()).filter(Boolean)) {
    const decision = activeDirectorDecisionForActionId(id, entries);
    if (decision) return decision;
  }
  return null;
}

function apiShouldHideDecision(decision = null) {
  return ['done', 'deferred', 'dismissed'].includes(String(decision?.status || ''));
}

function apiOwnerRouterRecentRoutes(entries = []) {
  const seen = new Set();
  return (entries || [])
    .filter(entry => String(entry.source || '') === 'app_v2_owner_router'
      || String(entry.actionId || '').startsWith('director-router-'))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .filter(entry => {
      const key = entry.actionId || entry.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6)
    .map(entry => ({
      id: entry.id || '',
      actionId: entry.actionId || '',
      title: entry.title || '',
      status: entry.status || '',
      statusLabel: businessMemoryEventLabel(entry.status),
      workflow: entry.action?.workflow || entry.action?.route?.workflow || '',
      skill: entry.action?.skill || '',
      targetName: entry.action?.route?.targetName || '',
      targetUrl: entry.action?.route?.targetUrl || '',
      createdAt: entry.createdAt || '',
      createdAtLocal: entry.createdAtLocal || ''
    }));
}

function apiPublishRunVerified(run = {}) {
  if (!run || run.dryRun) return false;
  if (!['published', 'published_warn'].includes(String(run.status || ''))) return false;
  const verification = run.result?.verification || run.verification || {};
  if (verification.ok === true) return true;
  if (verification.dbReadback?.ok === true) return true;
  if (verification.dbReadback?.titleOk && verification.dbReadback?.descriptionOk) return true;
  return false;
}

function apiPublishVerificationSummary(publishRuns = []) {
  const runs = Array.isArray(publishRuns) ? publishRuns : [];
  const liveRuns = runs.filter(run => !run.dryRun && ['published', 'published_warn', 'failed'].includes(String(run.status || '')));
  const verified = liveRuns.filter(apiPublishRunVerified);
  const warnings = liveRuns.filter(run => String(run.status || '') === 'published_warn');
  const failed = liveRuns.filter(run => String(run.status || '') === 'failed');
  const latest = liveRuns[0] || runs[0] || null;
  return {
    total: runs.length,
    live: liveRuns.length,
    verified: verified.length,
    warnings: warnings.length,
    failed: failed.length,
    latest: latest ? {
      id: latest.id || '',
      status: latest.status || '',
      dryRun: Boolean(latest.dryRun),
      url: latest.url || latest.payload?.url || latest.result?.url || '',
      createdAt: latest.createdAt || '',
      message: latest.result?.message || latest.error || '',
      verificationOk: apiPublishRunVerified(latest)
    } : null
  };
}

function apiOperatingModelFromPayload(payload = {}) {
  const metrics = payload.businessBrain?.metrics || {};
  const customer = payload.customerIntelligence || {};
  const email = payload.emailIntelligence || {};
  const matrix = payload.productMatrix?.summary || payload.summary?.productMatrix || {};
  const gscSummary = payload.productSeo?.measurement?.gsc?.summary || {};
  const topProducts = Array.isArray(payload.businessBrain?.productLeaders)
    ? payload.businessBrain.productLeaders
    : Array.isArray(payload.retention?.topProducts)
      ? payload.retention.topProducts
      : [];
  const bridgeConfigured = Boolean(connectionValue('BRIDGE_URL') && connectionValue('BRIDGE_SECRET'));
  const gscConfigured = Boolean(
    payload.productSeo?.measurement?.gsc?.configured
    || Number(gscSummary.clicks || 0)
    || Number(gscSummary.impressions || 0)
    || (connectionValue('GSC_SITE_URL') && (connectionValue('GSC_ACCESS_TOKEN') || connectionValue('GSC_CLIENT_EMAIL') || connectionValue('GOOGLE_OAUTH_CLIENT_FILE')))
  );
  const ga4Configured = connectorStatus('ga4').ok;
  const merchantConfigured = connectorStatus('merchant').ok;
  const googleAdsConfigured = connectorStatus('google_ads').ok;
  const smtpConfigured = connectorStatus('smtp').ok;
  const trackingConfigured = connectorStatus('tracking').ok && email.publicTrackingConfigured !== false;

  return {
	    positioning: {
	      headline: 'AI-команда для малого інтернет-магазину',
	      promise: 'Замінює маркетолога, SEO, рекламіста, email/CRM-менеджера, аналітика і контент-оператора в одному щоденному кабінеті.',
	      targetCustomer: 'Власник магазину зі штатом 1–5 людей, який продає товари або послуги в Україні і не має ресурсу найняти окрему команду.',
	      firstWow: 'перший результат за 10 хвилин після підключення магазину'
	    },
	    economics: {
	      teamCost: '$2 000–4 500/міс',
	      mercatoPrice: '$25–100/міс',
	      message: 'Власник купує не ще один dashboard, а AI-команду за ціною однієї підписки.'
	    },
    dailyOverview: {
      revenueToday: Math.round(Number(metrics.revenue1d || 0)),
      revenue7d: Math.round(Number(metrics.revenue7d || 0)),
      revenue30d: Math.round(Number(metrics.revenue30d || 0)),
      ordersToday: Number(metrics.orders1d || 0),
      orders7d: Number(metrics.orders7d || 0),
      orders30d: Number(metrics.orders30d || 0),
      avgOrderValue: Math.round(Number(metrics.avgOrderValue || payload.retention?.totals?.avgOrderValue || 0)),
      topProducts: topProducts.slice(0, 3).map(product => ({
        name: product.name || product.productName || product.title || '',
        revenue: Math.round(Number(product.revenue || product.total || product.value || 0)),
        orders: Number(product.orders || product.count || product.qty || 0)
      })).filter(product => product.name)
    },
    roles: [
      { role: 'Маркетолог', output: 'обирає привід кампанії, офер, сегмент і наступну дію' },
      { role: 'SEO-спеціаліст', output: 'генерує title, meta, H1, описи, schema і знаходить сторінки з низьким CTR' },
      { role: 'Email/CRM-менеджер', output: 'бачить цикл покупки, ризик відтоку, suppression і пише персональні листи' },
      { role: 'Аналітик реклами', output: 'читає Google Ads/GA4, знаходить злив бюджету і пропонує зміни' },
      { role: 'Контент-оператор', output: 'оформлює товари, послуги, категорії і сторінки без копіпасту' },
      { role: 'Аналітик даних', output: 'зводить OpenCart, GSC, GA4, Ads і email у 3–5 дій на сьогодні' }
    ],
    actionPriorityRule: [
      { rank: 1, label: 'ризик відтоку клієнта', signal: `${Number(customer.readyToBuy || 0).toLocaleString('uk')} клієнтів близько до повтору` },
      { rank: 2, label: 'втрата органічного трафіку', signal: `${Number(matrix.seoHoles || 0).toLocaleString('uk')} SEO-дір(ок), ${Number(gscSummary.clicks || 0).toLocaleString('uk')} кліків GSC` },
      { rank: 3, label: 'потенційний дохід', signal: `${Math.round(Number(customer.forecastRevenue || 0)).toLocaleString('uk')} грн прогноз повтору` },
      { rank: 4, label: 'час виконання', signal: 'одна дія має вести до preview/dry-run/live proof, а не до нового меню' }
    ],
    dataSources: [
      { id: 'opencart', title: 'OpenCart / ocStore', ok: bridgeConfigured && payload.source !== 'bridge_unavailable', value: `${Number(payload.retention?.totals?.orders || metrics.sampleOrders || 0).toLocaleString('uk')} замовлень`, need: 'замовлення, клієнти, товари, категорії, publish' },
      { id: 'gsc', title: 'Google Search Console', ok: gscConfigured, value: `${Number(gscSummary.impressions || 0).toLocaleString('uk')} показів`, need: 'кліки, CTR, позиції, сторінки з попитом' },
      { id: 'ga4', title: 'Google Analytics 4', ok: ga4Configured, value: ga4Configured ? 'підключено' : 'не підключено', need: 'сесії, конверсії, поведінка, purchase revenue' },
      { id: 'merchant', title: 'Google Merchant Center', ok: merchantConfigured, value: merchantConfigured ? 'готово до перевірки API' : 'частково або не підключено', need: 'diagnostics, disapprovals, data sources, free listings' },
      { id: 'google_ads', title: 'Google Ads', ok: googleAdsConfigured, value: googleAdsConfigured ? 'підключено' : 'не підключено', need: 'витрати, CPC, конверсії, ROAS' },
      { id: 'email', title: 'SMTP / Mailchimp', ok: smtpConfigured, value: `${Number(email.sent || 0).toLocaleString('uk')} листів`, need: 'тест, live-відправка, сценарії retention' },
      { id: 'tracking', title: 'Public tracking', ok: trackingConfigured, value: trackingConfigured ? 'tracking готовий' : 'сліпа зона', need: 'open, click, orders після кампанії' }
    ]
  };
}

function apiCommercialValueFromPayload(payload = {}, options = {}) {
  const decisionEntries = apiDecisionEntries(options);
  const workItems = apiWorkItemsFromPayload(payload, { ...options, decisionEntries });
  const contentWorkbench = apiContentWorkbenchFromPayload(payload, { ...options, decisionEntries });
  const customerDna = apiCustomerDnaFromPayload(payload);
  const email = payload.emailIntelligence || {};
  const trust = payload.trustSummary || {};
  const director = payload.directorMetrics || payload.directorBriefing?.directorMetrics || {};
  const matrix = payload.productMatrix?.summary || payload.summary?.productMatrix || {};
  const gscSummary = payload.productSeo?.measurement?.gsc?.summary || {};
  const publishSummary = apiPublishVerificationSummary(
    Array.isArray(options.publishRuns) ? options.publishRuns : operationalStore.readPublishRuns(50)
  );
  const contentItems = Array.isArray(contentWorkbench.items) ? contentWorkbench.items : [];
  const topContent = contentItems[0] || null;
  const topCustomer = Array.isArray(customerDna.lists?.ready) ? customerDna.lists.ready[0] : null;
  const organicPotential = Math.round((payload.productMatrix?.topOpportunities || [])
    .slice(0, 10)
    .reduce((sum, item) => sum + Number(item.potentialRevenue || 0), 0));
  const retentionForecast = Math.round(Number(customerDna.summary?.forecastRevenue || 0));
  const attributedRevenue = Math.round(Number(email.revenueAfterCampaign || 0));
  const totalPipeline = Math.max(0, organicPotential + retentionForecast + attributedRevenue);
  const doneDecisions = Number(director.done || 0);
  const targetDecisions = Number(director.target || 5);
  const trackingConfigured = email.publicTrackingConfigured !== false;
  const blockers = [];

  if (!workItems.length) blockers.push('Немає готової черги дій на сьогодні');
  if (doneDecisions < targetDecisions) blockers.push(`Мало зафіксованих директорських рішень: ${doneDecisions}/${targetDecisions}`);
  if (trust.status !== 'ok' || Number(trust.failed || 0) > 0 || Number(trust.checked || 0) < 10) blockers.push('Trust gate ще не дає достатнього доказу якості');
  if (publishSummary.verified < 1) blockers.push('Немає verified publish proof для demo');
  if (!trackingConfigured) blockers.push('Public tracking attribution не налаштований');

  const canSellAsPilot = workItems.length > 0 && Number(trust.checked || 0) >= 10 && Number(trust.failed || 0) === 0;
  const canSellAsProduct = canSellAsPilot && publishSummary.verified >= 1 && trackingConfigured && doneDecisions >= targetDecisions;

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    positioning: {
      title: 'AI-комерційний директор для малого OpenCart-магазину',
      audience: 'Власник e-commerce з повторними покупками, базою клієнтів і без окремої маркетинг-команди.',
      promise: 'Щодня показує 1-3 конкретні дії для продажів: кому написати, яку сторінку підсилити, що безпечно опублікувати.',
      mode: canSellAsProduct ? 'product_ready' : canSellAsPilot ? 'managed_pilot' : 'internal_beta',
      label: canSellAsProduct
        ? 'Можна продавати як продукт'
        : canSellAsPilot
          ? 'Можна продавати як керований пілот'
          : 'Ще внутрішня beta',
      verdict: canSellAsProduct
        ? 'Є достатньо доказів для зовнішнього demo: рішення, trust, publish і tracking.'
        : canSellAsPilot
          ? 'Це ще не self-serve SaaS, але вже можна продавати як пілот із вашим супроводом.'
          : 'Спочатку треба закрити базові докази користі й стабільності на Mercato.'
    },
    summary: {
      totalPipeline,
      totalPipelineLabel: totalPipeline ? formatMoney(totalPipeline) : 'потрібно більше даних',
      attributedRevenue,
      organicPotential,
      retentionForecast,
      readyActions: workItems.length,
      contentActions: contentItems.length,
      readyToBuy: Number(customerDna.summary?.readyToBuy || 0),
      verifiedPublish: publishSummary.verified,
      trustOk: Number(trust.ok || 0),
      trustChecked: Number(trust.checked || 0)
    },
    valueCards: [
      {
        id: 'today-actions',
        title: 'Що зробити сьогодні',
        value: `${Number(workItems.length || 0).toLocaleString('uk')} дій`,
        note: workItems[0]?.title || 'Потрібно оновити сигнали.',
        tone: workItems.length ? 'ok' : 'warn'
      },
      {
        id: 'retention',
        title: 'Повернення клієнтів',
        value: `${Number(customerDna.summary?.readyToBuy || 0).toLocaleString('uk')} людей`,
        note: retentionForecast ? `${formatMoney(retentionForecast)} прогноз повтору` : 'Потрібна активна клієнтська черга.',
        tone: Number(customerDna.summary?.readyToBuy || 0) ? 'ok' : 'warn'
      },
      {
        id: 'organic',
        title: 'Органічний попит',
        value: `${Number(gscSummary.clicks || 0).toLocaleString('uk')} кліків`,
        note: `${Number(matrix.seoHoles || 0).toLocaleString('uk')} SEO-дір(ок), ${organicPotential ? formatMoney(organicPotential) : 'потенціал рахується'} opportunity.`,
        tone: Number(gscSummary.clicks || 0) || Number(matrix.seoHoles || 0) ? 'ok' : 'warn'
      },
      {
        id: 'proof',
        title: 'Доказ безпечного виконання',
        value: `${Number(publishSummary.verified || 0).toLocaleString('uk')} publish`,
        note: `${Number(trust.ok || 0).toLocaleString('uk')}/${Number(trust.checked || 0).toLocaleString('uk')} trust checks OK.`,
        tone: publishSummary.verified && trust.status === 'ok' ? 'ok' : 'warn'
      }
    ],
    todayPlan: [
      {
        title: 'Почати з однієї дії, не з меню',
        detail: workItems[0]?.title || 'Оновити сигнали й сформувати головну дію.',
        action: workItems[0]?.type === 'content' ? 'Відкрити Content Workbench' : 'Відкрити головну дію'
      },
      {
        title: 'Довести до доказу',
        detail: topContent
          ? `${topContent.name}: preview -> dry-run -> publish/readback.`
          : 'Будь-яка дія має завершитись done/deferred/dismissed і verification.',
        action: topContent ? 'Підготувати сторінку' : 'Зафіксувати рішення'
      },
      {
        title: 'Показати власнику результат',
        detail: topCustomer
          ? `${topCustomer.name || topCustomer.email || 'Клієнт'}: персональна retention-дія без спаму.`
          : 'Після дії показати, що змінилось: кліки, замовлення, readback або stop-list.',
        action: 'Закрити цикл'
      }
    ],
    pilotOffer: {
      title: '30-денний пілот для першого клієнта',
      price: canSellAsProduct ? '$300/міс після setup' : '$100-150 beta або перший місяць за кейс',
      deliverables: [
        'Щоденний список 1-3 дій для продажів.',
        'Готові SEO/email/publish чернетки з safety gates.',
        'Щотижневий звіт: виконані дії, замовлення, органіка, blockers.'
      ],
      riskReversal: 'Продавати не “AI-кабінет”, а супроводжений пілот: якщо за 30 днів немає корисних дій і доказів, не продовжуємо.'
    },
    operatingModel: apiOperatingModelFromPayload(payload),
    blockers
	  };
	}

function appV2PricingModel() {
  return {
    teamCost: '$2 000–4 500/міс',
    trial: '14 днів безкоштовно',
    billingMode: 'manual_beta',
    note: 'У цьому MVP оплата не підключена: тарифи показуються як комерційна пропозиція для beta/pilot.',
    plans: [
      { id: 'starter', name: 'Starter', price: '$25/міс', products: 'до 100 товарів', seo: '50 SEO-генерацій/міс', email: '30 AI email-листів/міс', stores: '1 магазин', support: 'Email, 48 год' },
      { id: 'growth', name: 'Growth', price: '$50/міс', products: 'до 1 000 товарів', seo: '500 SEO-генерацій/міс', email: '300 AI email-листів/міс', stores: '2 магазини', support: 'Чат, 24 год' },
      { id: 'pro', name: 'Pro', price: '$100/міс', products: 'необмежено', seo: 'необмежено', email: 'необмежено', stores: '5 магазинів', support: 'Пріоритет, 4 год' }
    ]
  };
}

function syntheticSalesSeries(metrics = {}) {
  const total = Math.round(Number(metrics.revenue7d || metrics.revenue30d || metrics.revenue1d || 0));
  const today = Math.round(Number(metrics.revenue1d || 0));
  const base = total > 0 ? Math.max(1, Math.round(total / 7)) : 0;
  const labels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
  return labels.map((label, index) => {
    const weight = [0.82, 0.9, 1.05, 0.96, 1.16, 1.08, 1.03][index] || 1;
    const value = index === labels.length - 1 && today ? today : Math.max(0, Math.round(base * weight));
    return { label, revenue: value, orders: Math.max(0, Math.round(value / Math.max(1, Number(metrics.avgOrderValue || 900)))) };
  });
}

function flattenCustomerLists(lists = {}) {
  const rows = [];
  Object.entries(lists || {}).forEach(([group, list]) => {
    (Array.isArray(list) ? list : []).forEach(item => rows.push({ ...item, group }));
  });
  return rows;
}

function apiDashboardV2FromPayload(payload = {}, options = {}) {
  const metrics = payload.businessBrain?.metrics || {};
  const matrix = payload.productMatrix?.summary || payload.summary?.productMatrix || {};
  const gscSummary = payload.productSeo?.measurement?.gsc?.summary || {};
  const workItems = Array.isArray(options.workItems) ? options.workItems : apiWorkItemsFromPayload(payload, options);
  const contentWorkbench = options.contentWorkbench || apiContentWorkbenchFromPayload(payload, options);
  const customerDna = options.customerDna || apiCustomerDnaFromPayload(payload);
  const email = payload.emailIntelligence || {};
  const customerRows = flattenCustomerLists(customerDna.lists)
    .concat(Array.isArray(customerDna.customers) ? customerDna.customers : [])
    .filter((item, index, arr) => {
      const key = item.email || item.customerId || item.id || `${item.name || ''}-${index}`;
      return key && arr.findIndex(row => (row.email || row.customerId || row.id || '') === key) === index;
    });
  const attentionCustomers = customerRows.slice(0, 6).map(customer => ({
    id: customer.customerId || customer.id || customer.email || customer.name || '',
    name: customer.name || customer.email || 'Клієнт',
    status: customer.status || customer.group || 'під увагою',
    reason: customer.reason || customer.proposedOffer || customer.favoriteProduct || 'є сигнал для персональної дії',
    cadence: customer.cadence || {},
    avgOrderValue: Math.round(Number(customer.avgOrderValue || customer.averageOrderValue || 0))
  }));
  const seoTop = (contentWorkbench.items || []).slice(0, 6).map(item => ({
    id: item.id,
    name: item.name,
    type: item.type || 'product',
    score: Number(item.current?.seoScore || item.score || item.seoScore || 0),
    issue: item.why || item.summary || item.expectedImpact || 'потрібна SEO-перевірка',
    url: item.url || item.target?.url || ''
  }));
  const productsAttention = (payload.productMatrix?.topOpportunities || []).slice(0, 6).map(item => ({
    name: item.name || item.productName || item.key || 'Товар',
    status: item.status || 'attention',
    reason: item.label || item.action || 'потрібна дія',
    revenue: Math.round(Number(item.sales?.revenue || item.potentialRevenue || 0)),
    clicks: Number(item.gsc?.clicks || 0),
    impressions: Number(item.gsc?.impressions || 0)
  }));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    pricing: appV2PricingModel(),
    topbar: {
      title: 'Command Center',
      subtitle: 'Що відбувається в магазині і що зробити сьогодні',
      store: payload.settings?.company || payload.settings?.site || 'OpenCart магазин'
    },
    metrics: [
      { id: 'sales_week', label: 'Продажі тиждень', value: formatMoney(metrics.revenue7d || 0), unit: 'виручка за 7 днів', delta: Number(metrics.revenue7d || 0) ? 'реальні OpenCart дані' : 'потрібні замовлення', tone: Number(metrics.revenue7d || 0) ? 'ok' : 'warn' },
      { id: 'orders_today', label: 'Замовлення сьогодні', value: Number(metrics.orders1d || 0).toLocaleString('uk'), unit: 'зам.', delta: `${Number(metrics.orders7d || 0).toLocaleString('uk')} за 7 днів`, tone: Number(metrics.orders1d || 0) ? 'ok' : 'neutral' },
      { id: 'customers_attention', label: 'Покупці під увагою', value: Number(customerDna.summary?.readyToBuy || attentionCustomers.length || 0).toLocaleString('uk'), unit: 'клієнтів', delta: `${formatMoney(customerDna.summary?.forecastRevenue || 0)} прогноз`, tone: Number(customerDna.summary?.readyToBuy || 0) ? 'warn' : 'ok' },
      { id: 'products_without_seo', label: 'Товари без SEO', value: Number(matrix.seoHoles || seoTop.length || 0).toLocaleString('uk'), unit: 'пріоритетів', delta: `${Number(gscSummary.clicks || 0).toLocaleString('uk')} кліків GSC`, tone: Number(matrix.seoHoles || 0) ? 'warn' : 'ok' }
    ],
    actionQueue: workItems.slice(0, 5).map((item, index) => ({
      number: index + 1,
      id: item.id,
      title: item.title,
      reason: item.why || 'AI знайшов бізнес-сигнал.',
      expectedResult: item.expectedImpact || 'Після виконання зʼявиться proof або зафіксоване рішення.',
      priority: item.priority || 'medium',
      type: item.type || 'business',
      cta: item.primaryAction?.label || 'Відкрити дію',
      target: item.target || {}
    })),
    attentionCustomers,
    seoTop,
    salesChart: Array.isArray(metrics.sales7d) && metrics.sales7d.length ? metrics.sales7d.slice(-7) : syntheticSalesSeries(metrics),
    productsAttention,
    weeklySummary: {
      title: 'Минулий тиждень — підсумок',
      doneActions: Number(payload.directorMetrics?.done || payload.directorBriefing?.directorMetrics?.done || 0),
      recommendedActions: workItems.length,
      emailOrders: Number(email.ordered || 0),
      emailRevenue: Math.round(Number(email.revenueAfterCampaign || 0)),
      topProducts: (payload.businessBrain?.productLeaders || payload.retention?.topProducts || []).slice(0, 3)
    }
  };
}

function apiSetupGuideFromPayload(payload = {}) {
  const bridgeConfigured = Boolean(connectionValue('BRIDGE_URL') && connectionValue('BRIDGE_SECRET'));
  const bridgeReachable = payload.source && payload.source !== 'bridge_unavailable' && !payload.bridgeWarning;
  const gscSummary = payload.productSeo?.measurement?.gsc?.summary || {};
  const gscConfigured = Boolean(
    payload.productSeo?.measurement?.gsc?.configured
    || Number(gscSummary.clicks || 0)
    || Number(gscSummary.impressions || 0)
    || (connectionValue('GSC_SITE_URL') && (connectionValue('GSC_ACCESS_TOKEN') || connectionValue('GSC_CLIENT_EMAIL') || connectionValue('GOOGLE_OAUTH_CLIENT_FILE')))
  );
  const ga4Status = connectorStatus('ga4');
  const merchantStatus = connectorStatus('merchant');
  const googleAdsStatus = connectorStatus('google_ads');
  const smtpStatus = connectorStatus('smtp');
  const trackingStatus = connectorStatus('tracking');
  const securityStatus = connectorStatus('security');
  const ga4Configured = ga4Status.ok;
  const googleAdsConfigured = googleAdsStatus.ok;
  const smtpConfigured = smtpStatus.ok;
  const trackingConfigured = trackingStatus.ok && payload.emailIntelligence?.publicTrackingConfigured !== false;
  const commandKeyConfigured = securityStatus.ok || Boolean(process.env.MERCATO_COMMAND_API_KEY);
  const checks = [
    {
      id: 'platform',
      title: 'Платформа магазину',
      ok: bridgeConfigured && bridgeReachable,
      description: 'OpenCart підключається через bridge: читання товарів, клієнтів, замовлень і безпечний publish.',
      detail: bridgeConfigured
        ? bridgeReachable ? 'Підключення відповідає і дані читаються.' : (payload.bridgeWarning || 'Доступ збережено, але відповідь сайту треба перевірити.')
        : 'Додайте адресу підключення сайту і секрет у Налаштуваннях.'
    },
    {
      id: 'search-console',
      title: 'Google Search Console',
      ok: gscConfigured,
      description: 'Потрібна для SEO-сигналів: кліки, покази, CTR, позиції і сторінки біля топу.',
      detail: gscConfigured
        ? `${Number(gscSummary.clicks || 0).toLocaleString('uk')} кліків у поточному snapshot.`
        : 'Додайте доступ Google Search Console у Налаштуваннях.'
    },
    {
      id: 'email',
      title: 'Email SMTP',
      ok: smtpConfigured,
      description: 'Потрібен для тестових і персональних листів після stop-list/safety gate.',
      detail: smtpConfigured ? 'Поштовий сервіс підключено.' : 'Додайте поштовий сервер, email відправника і пароль у Налаштуваннях.'
    },
    {
      id: 'tracking',
      title: 'Public tracking',
      ok: trackingConfigured,
      description: 'Потрібен, щоб бачити відкриття, кліки і замовлення після листів.',
      detail: trackingConfigured ? 'Tracking-посилання налаштовані.' : 'Додайте публічну адресу системи або адресу tracking у Налаштуваннях.'
    },
    {
      id: 'safety',
      title: 'Захист live-дій',
      ok: commandKeyConfigured,
      description: 'Небезпечні дії мають вимагати ключ: email, coupon, publish.',
      detail: commandKeyConfigured ? 'Захист live-дій увімкнено.' : 'Для demo можна працювати локально; для клієнта потрібен захист live-дій.'
    },
    {
      id: 'analytics',
      title: 'Google Analytics 4',
      ok: ga4Configured,
      description: 'Потрібна для аналітики сайту: sessions, users, conversions, add_to_cart, purchase і revenue по сторінках/кампаніях.',
      detail: ga4Configured
        ? `GA4 підключено: ${maskConnectionValue(connectionValue('GA4_PROPERTY_ID'))}.`
        : ga4Status.detail
    },
    {
      id: 'merchant',
      title: 'Google Merchant Center',
      ok: merchantStatus.ok,
      description: 'Потрібен для API diagnostics, статусів товарів, free listings і джерел даних.',
      detail: merchantStatus.ok
        ? `Merchant account налаштовано: ${maskConnectionValue(connectionValue('MERCHANT_ACCOUNT_ID'))}.`
        : merchantStatus.detail
    },
    {
      id: 'google-ads',
      title: 'Google Ads',
      ok: googleAdsConfigured,
      description: 'Потрібен, щоб бачити spend, clicks, conversions, ROAS і звʼязувати рекламу з листами/сторінками.',
      detail: googleAdsConfigured
        ? `Google Ads підключено: ${maskConnectionValue(connectionValue('GOOGLE_ADS_CUSTOMER_ID'))}.`
        : googleAdsStatus.detail
    }
  ];
	  const ready = checks.filter(check => check.ok).length;
	  const byId = Object.fromEntries(checks.map(check => [check.id, check]));
	  const wizard = [
	    {
	      step: 1,
	      id: 'platform',
	      title: 'Платформа',
	      body: 'Вибрати OpenCart / ocStore як перший магазин для MVP.',
	      status: byId.platform?.ok ? 'done' : 'active',
	      result: byId.platform?.ok ? 'Сайт читається.' : 'Потрібні адреса підключення сайту і секрет.'
	    },
	    {
	      step: 2,
	      id: 'connect',
	      title: 'Підключення магазину',
	      body: 'Перевірити товари, категорії, клієнтів і замовлення за останні 12 місяців.',
	      status: byId.platform?.ok ? 'done' : 'blocked',
	      result: byId.platform?.detail || ''
	    },
	    {
	      step: 3,
	      id: 'google',
	      title: 'Google',
	      body: 'Підключити Search Console зараз; GA4 і Ads можна додати пізніше без блокування MVP.',
	      status: byId['search-console']?.ok ? 'done' : 'active',
	      result: byId['search-console']?.detail || ''
	    },
	    {
	      step: 4,
	      id: 'profile',
	      title: 'Профіль магазину',
	      body: 'Назва, ніша, мова, sender email і правила безпечних live-дій.',
	      status: byId.email?.ok ? 'done' : 'active',
	      result: byId.email?.ok ? 'Email налаштований.' : 'SMTP можна додати після першого аналізу.'
	    },
	    {
	      step: 5,
	      id: 'first-result',
	      title: 'Перший результат',
	      body: 'Показати перші 3 рекомендації на реальних даних: клієнт, SEO-сторінка, товар/реклама.',
	      status: ready >= 3 ? 'done' : 'blocked',
	      result: ready >= 3 ? 'Можна переходити в Command Center.' : 'Спочатку потрібні OpenCart і хоча б один сигнал попиту.'
	    }
	  ];
	  return {
	    ok: true,
	    generatedAt: new Date().toISOString(),
	    platform: 'OpenCart',
    label: ready >= 6 ? 'Підключення майже готове' : ready >= 3 ? 'Підключення часткове' : 'Почніть з OpenCart bridge',
	    ready,
	    total: checks.length,
	    checks,
	    wizard,
	    currentStep: wizard.find(step => step.status !== 'done') || wizard[wizard.length - 1],
	    steps: [
      {
        title: 'Додати bridge на OpenCart',
        body: 'Встановити файл підключення на хостинг і додати адресу підключення та секрет у Налаштуваннях.',
        result: 'Система зможе читати товари, клієнтів, замовлення і робити publish тільки після approval.'
      },
      {
        title: 'Підключити Google Search Console',
        body: 'Додати доступ Search Console у Налаштуваннях. Це дає сторінки з показами, низьким CTR і позиціями 4-15.',
        result: 'План дій отримає SEO-можливості не “з голови”, а з реальних пошукових даних.'
      },
      {
        title: 'Підключити GA4 і Google Ads',
        body: 'Додати доступи GA4 і Google Ads у Налаштуваннях: ID акаунтів і ключі доступу з Google.',
        result: 'Система зможе бачити не тільки органіку й email, а й витрати реклами, кліки, конверсії, purchase revenue і ROAS.'
      },
      {
        title: 'Налаштувати email і tracking',
        body: 'Додати поштовий сервіс і публічну адресу для відкриттів, кліків і attribution.',
        result: 'Retention-дії можна оцінювати по фактичних замовленнях після листів.'
      },
      {
        title: 'Запустити перший аналіз',
        body: 'Натиснути “Оновити”, перевірити trust gate і перейти в “План дій”.',
        result: 'Клієнт бачить не dashboard, а першу зрозумілу дію.'
      }
    ],
    nextStep: checks.find(check => !check.ok)?.detail || 'Перейдіть у План дій і виконайте першу рекомендацію.'
  };
}

function apiDemoReadinessFromPayload(payload = {}, options = {}) {
  const decisionEntries = apiDecisionEntries(options);
  const today = apiTodayFromPayload(payload, { ...options, decisionEntries });
  const trust = payload.trustSummary || {};
  const director = payload.directorMetrics || payload.directorBriefing?.directorMetrics || {};
  const email = payload.emailIntelligence || {};
  const publishSummary = apiPublishVerificationSummary(
    Array.isArray(options.publishRuns) ? options.publishRuns : operationalStore.readPublishRuns(50)
  );
  const recentRoutes = today.ownerRouter?.recentRoutes || apiOwnerRouterRecentRoutes(decisionEntries);
  const doneDecisions = Number(director.done || 0);
  const targetDecisions = Number(director.target || 5);
  const trustChecked = Number(trust.checked || 0);
  const trustOk = Number(trust.ok || 0);
  const trustFailed = Number(trust.failed || 0);
  const trackingConfigured = email.publicTrackingConfigured !== false;
  const gates = [
    {
      id: 'router-decisions',
      label: 'Router і директорські рішення',
      ok: doneDecisions >= targetDecisions && recentRoutes.length > 0,
      metric: `${doneDecisions}/${targetDecisions} виконано · ${recentRoutes.length} router routes`,
      why: 'Потрібно показати, що власник не просто дивиться дані, а система веде до рішень і памʼятає маршрути.',
      nextStep: doneDecisions >= targetDecisions
        ? 'Підготувати один чистий demo flow з уже виконаного маршруту.'
        : 'Виконати або зафіксувати ще кілька Owner Router / Director рішень цього тижня.',
      evidence: recentRoutes.slice(0, 3).map(route => `${route.statusLabel || route.status}: ${route.title || route.workflow}`)
    },
    {
      id: 'trust-gate',
      label: 'Trust gate товарів',
      ok: trust.status === 'ok' && trustChecked >= 10 && trustFailed === 0,
      metric: trustChecked ? `${trustOk}/${trustChecked} OK` : 'немає перевірок',
      why: 'Перед demo не можна показувати publish/SEO workflow, якщо live картка товару може розійтися з OpenCart.',
      nextStep: trust.status === 'ok' && trustChecked >= 10
        ? 'Тримати trust check як evidence у demo.'
        : 'Запустити 10-product trust gate і закрити high/critical розбіжності.',
      evidence: (trust.recentFailures || []).slice(0, 3).map(item => item.product?.name || item.url || item.productId || 'trust failure')
    },
    {
      id: 'publish-verification',
      label: 'Publish verification',
      ok: publishSummary.verified >= 1 && publishSummary.latest?.status !== 'failed',
      metric: `${publishSummary.verified} verified · ${publishSummary.failed} failed`,
      why: 'Demo має доводити, що live-запис проходить через dry-run, approval і readback/live verification.',
      nextStep: publishSummary.verified
        ? 'Взяти verified publish як demo proof, а старі failed runs тримати як RCA-ризики, не як blocker.'
        : 'Зробити один безпечний publish через v2 contract і отримати readback/live verification.',
      evidence: publishSummary.latest ? [
        `${publishSummary.latest.status}: ${publishSummary.latest.url || 'без URL'}`,
        publishSummary.latest.message || ''
      ].filter(Boolean) : []
    },
    {
      id: 'tracking',
      label: 'Tracking і attribution',
      ok: trackingConfigured && Number(email.sent || 0) > 0,
      metric: trackingConfigured
        ? `${Number(email.sent || 0).toLocaleString('uk')} sent · ${Number(email.ordered || 0).toLocaleString('uk')} orders`
        : 'public tracking URL не налаштований',
      why: 'Після demo-клієнта треба бачити не тільки створені дії, а й opens/clicks/orders після кампаній.',
      nextStep: trackingConfigured
        ? 'Показати email/order attribution як доказ замикання циклу.'
        : 'Налаштувати PUBLIC_BASE_URL/TRACKING_BASE_URL перед зовнішнім demo.',
      evidence: [
        `${Math.round(Number(email.revenueAfterCampaign || 0)).toLocaleString('uk')} грн після email`,
        email.publicTrackingConfigured === false ? 'tracking blind spot' : ''
      ].filter(Boolean)
    }
  ].map(gate => ({
    ...gate,
    status: gate.ok ? 'ok' : 'blocker'
  }));
  const blockers = gates.filter(gate => !gate.ok);
  const score = Math.round((gates.filter(gate => gate.ok).length / gates.length) * 100);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: payload.source || '',
    ready: blockers.length === 0,
    label: blockers.length ? 'Ще ні: demo readiness не закритий' : 'Можна показувати клієнту',
    score,
    verdict: blockers.length
      ? `Є ${blockers.length} blocker(и): ${blockers.map(gate => gate.label).join(', ')}.`
      : 'Ключові demo gates закриті: можна готувати зовнішній показ.',
    gates,
    blockers,
    proof: {
      recentRoutes,
      publish: publishSummary,
      trust: {
        status: trust.status || '',
        checked: trustChecked,
        ok: trustOk,
        failed: trustFailed,
        skipped: Number(trust.skipped || 0)
      },
      tracking: {
        publicTrackingConfigured: trackingConfigured,
        sent: Number(email.sent || 0),
        opened: Number(email.opened || 0),
        clicked: Number(email.clicked || 0),
        ordered: Number(email.ordered || 0),
        revenueAfterCampaign: Math.round(Number(email.revenueAfterCampaign || 0))
      },
      director: {
        done: doneDecisions,
        target: targetDecisions,
        readiness: director.readiness || ''
      }
    },
    commercialValue: today.commercialValue || apiCommercialValueFromPayload(payload, { ...options, decisionEntries }),
    nextStep: blockers[0]?.nextStep || 'Підготувати один clean demo flow і зафіксувати його в docs/mercato-demo-case.md.'
  };
}

function apiWorkItemsFromPayload(payload = {}, options = {}) {
  const items = [];
  const seen = new Set();
  const decisionEntries = apiDecisionEntries(options);
  const push = (item) => {
    if (!item?.id || seen.has(item.id)) return;
    if (apiWorkItemDisabled(item) && !options.includeDisabled) return;
    const decision = apiDecisionForIds([item.id], decisionEntries);
    if (apiShouldHideDecision(decision) && !options.includeDecided) return;
    if (decision) item.decision = decision;
    seen.add(item.id);
    items.push(item);
  };

  (payload.actions || []).forEach((action, index) => {
    push(apiWorkItemFromAction(action, index, 'command_action'));
  });

  (payload.directorBriefing?.priorities || []).forEach((priority, index) => {
    push(apiWorkItemFromAction({
      id: priority.id ? `director-${priority.id}` : `director-${index}`,
      title: priority.title || 'Director Briefing',
      priority: priority.priority || 'high',
      why: priority.why || '',
      expectedImpact: priority.expectedImpact || priority.action || '',
      modules: ['Director Briefing'],
      primaryAction: priority.cta || { label: 'Брифінг', tab: 'command', focus: priority.id || '' },
      data: (priority.people || []).slice(0, 4).map(person => `${person.name || person.emailMasked || 'клієнт'}: ${person.reason || person.nextAction || ''}`)
    }, 100 + index, 'director_briefing'));
  });

  (payload.productSeo?.seoActions || []).slice(0, 8).forEach((action, index) => {
    push(apiWorkItemFromAction({
      id: action.actionId || `seo-${index}`,
      title: action.title || action.action || 'SEO дія',
      priority: action.priority || 'medium',
      url: action.url || '',
      pageLabel: action.pageLabel || '',
      productName: action.productName || '',
      why: action.why || action.action || '',
      expectedImpact: action.expectedImpact || '',
      modules: ['SEO', 'OpenCart'],
      primaryAction: action.primaryAction || { label: 'SEO workflow', tab: 'generate', productName: action.productName || '', url: action.url || '' },
      secondaryAction: action.secondaryAction || { label: 'Evidence', tab: 'command', focus: 'productSeo' },
      productOpportunities: action.productOpportunities || []
    }, 200 + index, 'seo_action'));
  });

  return items
    .sort((a, b) => (a.sort.priority - b.sort.priority) || (a.sort.index - b.sort.index))
    .map(({ sort, ...item }) => item);
}

function apiTodayFromPayload(payload = {}, options = {}) {
  const decisionEntries = apiDecisionEntries(options);
  const workItems = apiWorkItemsFromPayload(payload, { ...options, decisionEntries });
  const commercialValue = apiCommercialValueFromPayload(payload, { ...options, decisionEntries });
  const contentWorkbench = apiContentWorkbenchFromPayload(payload, { ...options, decisionEntries });
  const customerDna = apiCustomerDnaFromPayload(payload);
  const trust = payload.trustSummary || {};
  const director = payload.directorMetrics || payload.directorBriefing?.directorMetrics || {};
  const email = payload.emailIntelligence || {};
  const matrix = payload.productMatrix?.summary || payload.summary?.productMatrix || {};
  const readinessIssues = [];
  if (Number(director.done || 0) < Number(director.target || 5)) readinessIssues.push(`Director decisions: ${Number(director.done || 0)}/${Number(director.target || 5)}`);
  if (trust.status !== 'ok' || Number(trust.checked || 0) < 10) readinessIssues.push(`Trust Gate: ${Number(trust.ok || 0)}/${Number(trust.checked || 0) || 10}`);
  if (email.publicTrackingConfigured === false) readinessIssues.push('Public email tracking не налаштований');
  if (payload.source && payload.source !== 'email_segments') readinessIssues.push(`Command source: ${payload.source}`);
  if (Number(matrix.unmatchedPages || 0)) readinessIssues.push(`${Number(matrix.unmatchedPages || 0)} GSC URL без привʼязки`);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: payload.source || '',
    bridgeWarning: payload.bridgeWarning || '',
    readiness: {
      sellable: readinessIssues.length === 0,
      label: readinessIssues.length ? 'Не готово до продажу' : 'Готово до demo gate',
      issues: readinessIssues
    },
	    primary: workItems[0] || null,
	    queue: workItems.slice(0, 5),
	    dashboardV2: apiDashboardV2FromPayload(payload, { ...options, decisionEntries, workItems, contentWorkbench, customerDna }),
	    pricing: appV2PricingModel(),
	    commercialValue,
    operatingModel: commercialValue.operatingModel || apiOperatingModelFromPayload(payload),
    ownerRouter: {
      recentRoutes: apiOwnerRouterRecentRoutes(decisionEntries)
    },
    metrics: {
      trust: {
        value: Number(trust.checked || 0) ? `${Number(trust.ok || 0)}/${Number(trust.checked || 0)}` : '—',
        status: trust.status || 'empty',
        note: Number(trust.failed || 0) ? `${Number(trust.failed || 0)} failed` : `${Number(trust.skipped || 0)} skipped`
      },
      director: {
        value: `${Number(director.done || 0)}/${Number(director.target || 5)}`,
        status: Number(director.done || 0) >= Number(director.target || 5) ? 'ok' : 'warn',
        note: director.readiness || ''
      },
      organic: {
        value: Number(payload.productSeo?.measurement?.gsc?.summary?.clicks || 0).toLocaleString('uk'),
        status: Number(matrix.seoHoles || 0) ? 'warn' : 'ok',
        note: `${Number(matrix.seoHoles || 0).toLocaleString('uk')} SEO holes`
      },
      retention: {
        value: Number(email.ordered || 0) ? `${Number(email.ordered || 0)} зам.` : `${Number(email.sent || 0)} sent`,
        status: email.publicTrackingConfigured === false ? 'warn' : 'ok',
        note: `${Math.round(Number(email.revenueAfterCampaign || 0)).toLocaleString('uk')} грн`
      }
    },
    links: {
      legacy: '/',
      commandCenter: '/command-center',
      workItems: '/api/work-items'
    }
  };
}

function apiOwnerRouterIntent(query = '') {
  const text = String(query || '').trim().toLowerCase();
  const has = (...patterns) => patterns.some(pattern => pattern.test(text));
  if (!text || has(/що\s+далі|що\s+робити|з\s+чого\s+почати|не\s+розумію|what\s+next|start/i)) return 'next';
  if (has(/публікац|publish|bridge|readback|smtp|помилк|не\s+застос|не\s+спрац|інцидент|incident/i)) return 'incident';
  if (has(/продавати\s+продукт|зовнішн(ій|ього|ому)?\s+клієнт|перш(ий|ого)\s+клієнт|готов(ий|о).*(клієнт|demo|saas)|readiness|demo|saas/i)) return 'readiness';
  if (has(/ціну|ціна|марж|собіварт|прайс|price|margin|вартість/i)) return 'pricing';
  if (has(/клієнт|retention|email|лист|розсил|повторн|мовчать|поверта/i)) return 'retention';
  if (has(/просува|постити|кампан|реклам|продажі\s+прос|що\s+прода|контент[-\s]?план|campaign/i)) return 'content_strategy';
  if (has(/seo|organic|gsc|категор|товар|опис|контент|сторінк|позиці|ctr/i)) return 'content';
  if (has(/монітор|конкурент|ux|тренд|контроль/i)) return 'monitoring';
  return 'next';
}

function apiOwnerRouterContentTarget(payload = {}, options = {}) {
  const content = apiContentWorkbenchFromPayload(payload, options);
  return content.items?.[0] || null;
}

function apiOwnerRouterWorkflowPlan(workflow = '', response = {}, context = {}) {
  const action = response.action || {};
  const target = context.contentTarget || context.primary?.target || {};
  const routeSeed = [
    workflow,
    response.query || response.intent || '',
    action.openContentUrl || action.url || target.url || '',
    context.contentTarget?.name || target.name || response.title || ''
  ].join('|');
  const actionId = `director-router-${workflow || 'workflow'}-${crypto.createHash('sha1').update(routeSeed).digest('hex').slice(0, 10)}`;
  const byWorkflow = {
    incident_runbook: {
      skill: 'Incident / Runbook',
      steps: [
        'Зафіксувати симптом і impact.',
        'Перевірити останній blocker у Контролі.',
        'Зробити dry-run/readback або іншу безпечну verification.',
        'Записати RCA і наступний контроль.'
      ],
      approvalGate: 'Жодних live email/publish/coupon дій без явної перевірки причини.',
      verification: 'Є запис RCA, команда перевірки і підтвердження, що симптом зник або локалізований.'
    },
    readiness_gates: {
      skill: 'Readiness Gates',
      steps: [
        'Відкрити Контроль.',
        'Пройти blockers зверху вниз.',
        'Закрити trust/publish/tracking/GSC gate доказом.',
        'Повернутися до demo flow тільки після чистого статусу.'
      ],
      approvalGate: 'Зовнішній demo або клієнт тільки після закритих gates.',
      verification: 'Readiness показує sellable, 10/10 trust checks і хоча б один publish/readback proof.'
    },
    price_margin_check: {
      skill: 'Price / Margin Check',
      steps: [
        'Вибрати товар або групу товарів.',
        'Зібрати green cost, пакування, доставку і поточну ціну.',
        'Порахувати сценарії +5%, +10%, +15%.',
        'Підготувати рішення власника без автоматичного live-запису.'
      ],
      approvalGate: 'Ціну не змінюємо без ручного рішення власника і dry-run.',
      verification: 'Є unit-economics таблиця, сценарій і запис рішення у памʼяті.'
    },
    customer_dna_retention: {
      skill: 'Customer Pulse / Retention Email Sequence',
      steps: [
        'Відкрити ДНК клієнтів.',
        'Обрати людей у вікні повторної покупки або відповідний сегмент.',
        'Перевірити stop-list, cooldown і попередні листи.',
        'Підготувати тестовий лист і тільки потім відправку.'
      ],
      approvalGate: 'Не відправляти без safety gate, test email і зрозумілого exit condition.',
      verification: 'Email tracking/action log має campaign/actionId, а після відправки є контроль покупок.'
    },
    content_strategy: {
      skill: 'Content Strategy',
      steps: [
        'Відкрити першу контент-можливість.',
        'Звірити GSC, sales, trust і статус товару.',
        'Визначити канал: SEO, email, реклама або пауза.',
        'Перед publish перейти через preview, blockers і dry-run.'
      ],
      approvalGate: 'Не просувати disabled/out-of-stock/trust-failed сторінки.',
      verification: 'Є рішення у action log і контроль GSC/sales після зміни.'
    },
    content_seo_publish: {
      skill: 'SEO Audit + Brand/Copy Gate',
      steps: [
        'Перевірити текст, який побачить покупець.',
        'Прибрати службові фрази і внутрішні brief-и.',
        'Зробити dry-run саме поточної версії.',
        'Публікувати тільки після readback/live verification gate.'
      ],
      approvalGate: 'Publish дозволений тільки після актуального dry-run і approval phrase.',
      verification: 'OpenCart readback або live verification підтверджує зміну; інакше це warning, не успіх.'
    },
    monitoring: {
      skill: 'Operations Runbook',
      steps: [
        'Відкрити Контроль.',
        'Запустити due competitor або UX monitoring.',
        'Перевірити, чи зʼявився actionable summary.',
        'Перетворити сигнал на одну робочу дію.'
      ],
      approvalGate: 'Monitoring не є live-записом, але його результат не має автоматично публікувати зміни.',
      verification: 'Оновлений timestamp, summary і новий або підтверджений work item.'
    },
    owner_next_best_action: {
      skill: 'Business Pulse / Director Brief',
      steps: [
        'Відкрити головну дію Today.',
        'Перевірити evidence і expected impact.',
        'Прийняти рішення: done, deferred або dismissed.',
        'Повернутися до контролю результату.'
      ],
      approvalGate: 'Якщо дія веде до live email/publish/coupon, спершу потрібен відповідний safety gate.',
      verification: 'Action log має рішення, baseline snapshot і дату наступного контролю.'
    }
  };
  const plan = byWorkflow[workflow] || byWorkflow.owner_next_best_action;
  return {
    actionId,
    skill: plan.skill,
    steps: plan.steps,
    approvalGate: plan.approvalGate,
    verification: plan.verification,
    route: {
      actionId,
      workflow,
      destination: action.view || (action.legacyTab ? 'legacy' : ''),
      label: action.label || '',
      targetName: context.contentTarget?.name || target.name || response.title || '',
      targetUrl: action.openContentUrl || action.url || target.url || '',
      workItemId: action.workItemId || context.primary?.id || '',
      contentType: action.contentType || context.contentTarget?.type || '',
      legacyTab: action.legacyTab || ''
    }
  };
}

function apiOwnerRouterFromPayload(payload = {}, options = {}) {
  const query = String(options.query || '').trim();
  const intent = apiOwnerRouterIntent(query);
  const decisionEntries = apiDecisionEntries(options);
  const today = apiTodayFromPayload(payload, { decisionEntries });
  const workItems = apiWorkItemsFromPayload(payload, { decisionEntries });
  const contentTarget = apiOwnerRouterContentTarget(payload, { decisionEntries });
  const customerDna = apiCustomerDnaFromPayload(payload);
  const trust = payload.trustSummary || {};
  const email = payload.emailIntelligence || {};
  const matrix = payload.productMatrix?.summary || {};
  const primary = today.primary || workItems[0] || null;
  const responseBase = {
    ok: true,
    generatedAt: new Date().toISOString(),
    query,
    intent,
    confidence: 'medium',
    sources: [
      payload.source ? `Command Center: ${payload.source}` : '',
      Number(trust.checked || 0) ? `Trust: ${Number(trust.ok || 0)}/${Number(trust.checked || 0)}` : '',
      Number(matrix.seoHoles || 0) ? `SEO holes: ${Number(matrix.seoHoles || 0)}` : '',
      Number(email.sent || 0) ? `Email sent: ${Number(email.sent || 0)}` : ''
    ].filter(Boolean)
  };
  const contentAction = {
    label: 'Відкрити Контент',
    view: 'content',
    openContentUrl: contentTarget?.url || primary?.target?.url || '',
    contentType: contentTarget?.type || ''
  };
  const withPlan = response => ({
    ...response,
    ...apiOwnerRouterWorkflowPlan(response.workflow, response, { contentTarget, primary, today })
  });

  if (intent === 'incident') {
    return withPlan({
      ...responseBase,
      confidence: 'high',
      workflow: 'incident_runbook',
      title: 'Завести це як інцидент, а не шукати кнопку навмання',
      why: 'Запити про publish, bridge, SMTP або readback означають ризик живої інтеграції. Тут потрібні impact, причина, перевірка і runbook.',
      evidence: [
        payload.bridgeWarning ? `Bridge warning: ${payload.bridgeWarning}` : '',
        `Publish runs у SQLite: ${Number(operationalStore.status()?.tables?.publish_runs || 0).toLocaleString('uk')}`,
        today.readiness?.issues?.length ? `Readiness blockers: ${today.readiness.issues.slice(0, 2).join('; ')}` : ''
      ].filter(Boolean),
      nextStep: 'Відкрий Контроль, перевір останній blocker, потім фіксуємо RCA/verification у памʼяті.',
      control: 'Після fix має бути dry-run/readback/live verification або явна причина, чому live verification неможлива.',
      action: { label: 'Відкрити Контроль', view: 'monitoring' }
    });
  }

  if (intent === 'readiness') {
    return withPlan({
      ...responseBase,
      confidence: 'high',
      workflow: 'readiness_gates',
      title: today.readiness.sellable ? 'Readiness gates чисті, можна готувати demo flow' : 'Спочатку закрити readiness blockers',
      why: today.readiness.sellable
        ? 'Поточний Today payload не бачить активних blockers.'
        : 'Зовнішньому клієнту не можна показувати продукт, поки gates не закриті конкретними виконаними діями.',
      evidence: today.readiness.issues || [],
      nextStep: 'Відкрити Контроль і пройти blockers зверху вниз: trust, publish verification, tracking, GSC привʼязки.',
      control: 'Готовність підтверджена тільки після 5+ director decisions, 10/10 trust checks і одного publish з readback/live verification.',
      action: { label: 'Відкрити Контроль', view: 'monitoring' }
    });
  }

  if (intent === 'pricing') {
    return withPlan({
      ...responseBase,
      confidence: 'high',
      workflow: 'price_margin_check',
      title: 'Запустити Price / Margin Check перед будь-якою зміною ціни',
      why: 'Ціна має спиратися на green cost, roast loss, пакування, delivery, VAT і поточну ціну, а не на відчуття.',
      evidence: [
        'У проєкті є pricing-calculator.js і supplier price cache.',
        payload.productMatrix?.summary?.products ? `OpenCart audit products: ${Number(payload.productMatrix.summary.products).toLocaleString('uk')}` : ''
      ].filter(Boolean),
      nextStep: 'Відкрий Магазин або Постачальники, вибери товар і порахуй сценарії +5%, +10%, +15%.',
      control: 'Публікувати зміну ціни тільки через dry-run і після рішення власника.',
      action: { label: 'Відкрити Постачальники', view: 'store', legacyTab: 'supplier' }
    });
  }

  if (intent === 'retention') {
    return withPlan({
      ...responseBase,
      confidence: 'high',
      workflow: 'customer_dna_retention',
      title: 'Працювати через ДНК клієнтів, не через сирий email-генератор',
      why: 'Retention-рішення має врахувати покупки, stop-list, cooldown, попередні листи, замовлення після кампанії і suppression.',
      evidence: [
        `${Number(customerDna.summary.readyToBuy || 0).toLocaleString('uk')} клієнтів готові до повторної покупки`,
        `${Number(customerDna.summary.suppressed || 0).toLocaleString('uk')} у stop-list`,
        `${Number(customerDna.email.ordered || 0).toLocaleString('uk')} замовлень після email`
      ],
      nextStep: 'Відкрий ДНК клієнтів, обери клієнтську дію або email workflow з suppression/exit rules.',
      control: 'Не відправляти, якщо немає safety gate, test email і зрозумілого exit condition.',
      action: { label: 'Відкрити ДНК клієнтів', view: 'customers' }
    });
  }

  if (intent === 'content_strategy') {
    return withPlan({
      ...responseBase,
      confidence: 'high',
      workflow: 'content_strategy',
      title: 'Спочатку визначити, що просувати, а вже потім генерувати контент',
      why: 'Промо має спиратися на sales velocity, GSC, inventory, margin і trust status. Інакше легко підсилити не той товар.',
      evidence: [
        Number(matrix.seoHoles || 0) ? `${Number(matrix.seoHoles).toLocaleString('uk')} SEO holes у product matrix` : '',
        contentTarget ? `Перший content target: ${contentTarget.name}` : '',
        payload.productSeo?.measurement?.gsc?.summary?.clicks ? `GSC clicks: ${Number(payload.productSeo.measurement.gsc.summary.clicks).toLocaleString('uk')}` : ''
      ].filter(Boolean),
      nextStep: contentTarget
        ? `Відкрити Content Workbench на "${contentTarget.name}" і пройти preview -> blockers -> dry-run.`
        : 'Оновити Content Workbench і вибрати першу high-priority можливість.',
      control: 'Не просувати disabled/out-of-stock/trust-failed товари.',
      action: contentAction
    });
  }

  if (intent === 'content') {
    return withPlan({
      ...responseBase,
      confidence: contentTarget ? 'high' : 'medium',
      workflow: 'content_seo_publish',
      title: contentTarget ? `Працювати зі сторінкою: ${contentTarget.name}` : 'Відкрити Content Workbench',
      why: 'SEO/контент зміни мають йти через preview, readiness checklist, dry-run і publish contract.',
      evidence: [
        contentTarget?.why || '',
        contentTarget?.expectedImpact || '',
        contentTarget?.url || ''
      ].filter(Boolean),
      nextStep: contentTarget
        ? 'Перевір текст для покупця, readiness checklist, зроби dry-run і лише потім publish.'
        : 'Відкрити Content Workbench і оновити сигнали.',
      control: 'Після publish потрібен OpenCart readback/live verification або warning, а не “зелений успіх” без доказу.',
      action: contentAction
    });
  }

  if (intent === 'monitoring') {
    return withPlan({
      ...responseBase,
      workflow: 'monitoring',
      title: 'Оновити контрольні сигнали',
      why: 'Конкуренти, UX і readiness мають cadence. Якщо сигнали stale, Today може вести не туди.',
      evidence: today.readiness?.issues || [],
      nextStep: 'Відкрий Контроль і запусти due monitoring.',
      control: 'Після run має оновитись timestamp і зʼявитися новий actionable summary.',
      action: { label: 'Відкрити Контроль', view: 'monitoring' }
    });
  }

  const primaryAction = primary?.type === 'content'
    ? { label: 'Відкрити головну дію', view: 'content', openContentUrl: primary.target?.url || '' }
    : primary?.type === 'customer'
      ? { label: 'Відкрити ДНК клієнтів', view: 'customers' }
      : primary?.type === 'monitoring'
        ? { label: 'Відкрити Контроль', view: 'monitoring' }
        : { label: 'Відкрити робоче місце', view: primary ? 'workbench' : 'queue', workItemId: primary?.id || '' };

  return withPlan({
    ...responseBase,
    workflow: 'owner_next_best_action',
    title: primary?.title || 'Спочатку оновити сигнали',
    why: primary?.why || 'Router не побачив конкретного наміру, тому веде в найважливішу дію Today.',
    evidence: [
      primary?.expectedImpact || '',
      ...(today.readiness?.issues || []).slice(0, 2)
    ].filter(Boolean),
    nextStep: primary ? 'Відкрити головну дію і довести її до рішення: done/deferred/dismissed.' : 'Оновити сигнали і перевірити readiness.',
    control: 'Будь-яка виконана дія має лишити запис в action log і контроль результату.',
    action: primaryAction
  });
}

function apiContentTypeFromTarget({ url = '', targetType = '', productId = '' } = {}) {
  if (productId || targetType === 'product') return 'product';
  if (targetType === 'category') return 'category';
  const pathName = (() => {
    try { return new URL(url).pathname; } catch { return String(url || ''); }
  })();
  const parts = pathName.split('/').filter(Boolean);
  if (/blog|info|delivery|oplata|about|contacts/i.test(pathName)) return 'page';
  if (parts.length <= 1) return 'category';
  return 'product';
}

function apiContentTypeLabel(type = '') {
  return {
    product: 'Товар',
    category: 'Категорія',
    page: 'Сторінка'
  }[type] || 'Контент';
}

function apiContentItemDisabled(item = {}) {
  if (item.disabled || item.status === 'disabled') return true;
  const issues = Array.isArray(item.current?.issues) ? item.current.issues : [];
  return issues.some(issue => {
    const field = String(issue?.field || '').toLowerCase();
    const message = String(issue?.message || '').toLowerCase();
    return field === 'status' || /вимкнен|disabled|inactive/.test(message);
  });
}

function apiContentPriority(row = {}) {
  const status = String(row.status || row.type || '').toLowerCase();
  if (row.priority) return row.priority;
  if (['seo_hole', 'money_leak', 'conversion_leak', 'snippet_ctr'].includes(status)) return 'high';
  if (['page_not_selling', 'striking_distance', 'content_gap'].includes(status)) return 'medium';
  return 'low';
}

function apiContentKindForRecommendation(row = {}) {
  const status = String(row.status || row.type || '').toLowerCase();
  if (status === 'snippet_ctr') return 'gsc_low_ctr';
  if (status === 'striking_distance') return 'gsc_striking_distance';
  if (status === 'conversion_leak' || status === 'money_leak' || status === 'page_not_selling') return 'gsc_top_page';
  if (status === 'seo_hole') return 'product_audit';
  return 'gsc_low_ctr';
}

function apiContentCurrentFromRow(row = {}, type = '') {
  return {
    title: row.seo?.title || row.product?.meta_title || '',
    metaDescription: row.seo?.metaDescription || row.product?.meta_description || '',
    h1: row.seo?.h1 || row.product?.meta_h1 || '',
    descriptionLength: Number(row.seo?.descriptionLength || row.product?.description_length || 0),
    score: Number(row.seo?.score || row.product?.score || 0),
    attributes: Number(row.seo?.attributes || row.product?.attributes_count || 0),
    source: type === 'product' ? 'OpenCart product audit' : 'GSC / sitemap audit',
    issues: Array.isArray(row.seo?.issues)
      ? row.seo.issues.slice(0, 5)
      : Array.isArray(row.product?.issues)
        ? row.product.issues.slice(0, 5)
        : []
  };
}

function apiContentPreviewPlain(proposed = {}, name = '') {
  const title = proposed.title || name || 'Сторінка Mercato';
  const meta = proposed.metaDescription || 'Короткий опис для Google і покупця.';
  const h1 = proposed.h1 || name || title;
  return [
    title,
    meta,
    '',
    h1,
    'На сторінці покупець одразу бачить, що це за добірка або товар, кому він підходить і як зробити вибір без зайвого пошуку.',
    'Далі йдуть короткі блоки про смак, формат, фасування, доставку і відповіді на часті питання.'
  ].join('\n');
}

function apiContentPublishType(type = '') {
  if (type === 'category') return 'category';
  if (type === 'page') return 'information';
  return 'product';
}

function apiContentLooksInternal(text = '') {
  return /має\s+працювати\s+як|що\s+підсилюємо\s+після\s+аналізу|основа\s+генерації|gsc-сигнал|opencart\s+readback|модель\s+потенціалу|дотиснути\s+до\s+топу|підняти\s+ctr|перелити\s+органічний\s+попит|виправити\s+seo[-\s]?поля|seo\s*loop|seo\s+workflow|command\s+center|director\s+briefing|поясніть\s+смаки|додайте\s+швидк|винести\s+у\s+видимий\s+блок|long[-\s]?tail/iu.test(String(text || ''));
}

function apiContentIntent({ name = '', url = '', type = '', proposed = {} } = {}) {
  const text = `${name} ${url} ${proposed.h1 || ''} ${proposed.title || ''}`.toLowerCase();
  if (/(dnipro|dnepr|дніпр|днепр)/i.test(text) && /(kava|coffee|кава|kofe)/i.test(text)) return 'local_coffee';
  if (/(nabory|nabor|набор|набір|добірк)/i.test(text) && /(kava|coffee|кава|kofe)/i.test(text)) return 'coffee_set';
  if (/(чай|chai|chay|улун|пуер|сенча|матча|мате)/i.test(text)) return type === 'product' ? 'tea_product' : 'tea_category';
  if (/(kava|coffee|кава|kofe)/i.test(text)) return type === 'product' ? 'coffee_product' : 'coffee_category';
  return type === 'page' ? 'info_page' : 'generic';
}

function apiContentLooksWeakCopy(text = '') {
  return /зрозумілий\s+смак|добрий\s+вибір\s+для\s+тих|допомагають\s+швидко\s+підібрати\s+каву\s+під\s+подарунок|для\s+подарунка[\s\S]{0,160}для\s+дегустац|\|\s*кава\s+Mercato\s*$|оберіть\s*[-–—]?$/iu.test(String(text || ''));
}

function apiContentCleanNameCandidate(value = '') {
  return String(value || '')
    .trim()
    .replace(/^https?:\/\/[^/]+\/?/i, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/^(?:дотиснути\s+до\s+топу|підняти\s+ctr\s+сторінки|перелити\s+органічний\s+попит|виправити\s+seo[-\s]?поля\s+товару|провести\s+seo[-\s]?loop\s+для\s+товару\s+з\s+попитом|працювати\s+зі\s+сторінкою)\s*:\s*/iu, '')
    .trim();
}

function apiContentLooksSlugName(value = '') {
  const clean = apiContentCleanNameCandidate(value);
  return /^[a-z0-9-_/]+$/i.test(clean) && clean.includes('-');
}

function apiContentLooksTransliteratedName(value = '') {
  const clean = apiContentCleanNameCandidate(value);
  if (!clean) return false;
  if (/[\u0400-\u04ff]/u.test(clean)) return false;
  return /^[a-z0-9\s/_-]+$/i.test(clean) && /(kava|kofe|svizho|zernah|chai|chay|zelenuy|dnipro|dnepr|kavyarnya|kavomashyny|franke|v60|recipe)/i.test(clean);
}

function apiContentLooksDomainName(value = '') {
  return /^(?:www\.)?mercato\.com\.ua\/?$/i.test(apiContentCleanNameCandidate(value));
}

function apiContentHumanizeName(value = '') {
  const clean = apiContentCleanNameCandidate(value);
  if (!clean) return '';
  if (apiContentLooksSlugName(clean) || apiContentLooksTransliteratedName(clean) || apiContentLooksDomainName(clean)) return ucfirstSeo(seoKeywordFromUrl(clean));
  return clean;
}

function apiContentDisplayName(name = '', proposed = {}) {
  const primaryRaw = String(name || '').trim();
  const proposedRaw = String(proposed.h1 || proposed.title || '').trim();
  const primary = apiContentCleanNameCandidate(primaryRaw);
  const proposedName = apiContentCleanNameCandidate(proposedRaw);
  const primaryBlocked = apiContentLooksInternal(primaryRaw) || apiContentLooksWeakCopy(primaryRaw);
  const proposedBlocked = apiContentLooksInternal(proposedRaw) || apiContentLooksWeakCopy(proposedRaw);
  const raw = apiContentLooksSlugName(primary) && proposedName && !proposedBlocked && !apiContentLooksSlugName(proposedName)
    ? proposedName
    : primary && !primaryBlocked
      ? primary
      : proposedName && !proposedBlocked
        ? proposedName
        : primary || proposedName;
  return ucfirstSeo(apiContentHumanizeName(raw) || 'Mercato');
}

function apiContentFallbackTitle({ name = '', type = 'product', proposed = {}, url = '' } = {}) {
  const displayName = apiContentDisplayName(name, proposed);
  const intent = apiContentIntent({ name: displayName, type, proposed, url });
  if (intent === 'local_coffee') return trimSeoText(`${displayName} купити | Mercato`, 65);
  if (intent === 'coffee_set') return trimSeoText(`${displayName} купити | Mercato`, 65);
  if (type === 'category') return trimSeoText(`${displayName} купити | Mercato`, 65);
  if (type === 'page') return trimSeoText(`${displayName} | Mercato`, 65);
  return trimSeoText(`${displayName} купити | Mercato`, 65);
}

function apiContentFallbackMeta({ name = '', type = 'product', proposed = {}, url = '' } = {}) {
  const displayName = apiContentDisplayName(name, proposed);
  const intent = apiContentIntent({ name: displayName, type, proposed, url });
  if (intent === 'local_coffee') {
    return trimSeoText(`${displayName}: свіжообсмажена кава Mercato, зерно або помел під еспресо, фільтр чи турку. Онлайн-замовлення і доставка.`, 155);
  }
  if (intent === 'coffee_set') {
    return trimSeoText(`${displayName}: добірки для подарунка, дегустації або щоденного запасу. Порівняйте склад, смак і фасування з доставкою по Україні.`, 155);
  }
  if (type === 'page') {
    return trimSeoText(`${displayName}: умови, варіанти і наступний крок у Mercato. Знайдіть потрібну інформацію без зайвого пошуку.`, 155);
  }
  if (intent === 'tea_category' || intent === 'tea_product') {
    return trimSeoText(`${displayName}: листовий чай Mercato зі смаком, ароматом і рекомендаціями із заварювання. Фасування від 50 г, доставка по Україні.`, 155);
  }
  const detail = /washed|мит/i.test(displayName)
    ? 'мита арабіка з чистою чашкою'
    : /natural|натурал/i.test(displayName)
      ? 'арабіка з виразним фруктовим профілем'
      : /decaf|декаф|без кофе/i.test(displayName)
        ? 'кава без кофеїну зі свіжим обсмаженням'
        : 'свіжообсмажена кава зі смаковим профілем';
  return trimSeoText(`${displayName}: ${detail}, зерно або помел під ваш спосіб приготування. Доставка по Україні.`, 155);
}

function apiContentSafeSeoField(value = '', fallback = '') {
  const clean = String(value || '').trim();
  if (!clean || apiContentLooksInternal(clean) || apiContentLooksWeakCopy(clean)) return fallback;
  return clean;
}

function apiContentHtmlDraft({ name = '', type = 'product', proposed = {}, url = '' } = {}) {
  const title = apiContentDisplayName(name, proposed);
  const intent = apiContentIntent({ name: title, type, proposed, url });
  const coffeeTitle = title.replace(/^Кава\s+/iu, 'кава ');
  const productIntro = intent === 'local_coffee'
    ? `У Mercato можна замовити свіжообсмажену каву в Дніпрі для дому або офісу без випадкового вибору навмання. Доступні зерно і помел під еспресо, фільтр, турку чи гейзерну кавоварку.`
    : /чай|улун|пуер|сенча|матча|мате/i.test(title)
    ? `${title} у Mercato має описаний смак, аромат і прості рекомендації із заварювання. Можна підібрати фасування для дегустації, подарунка або щоденного запасу.`
    : /washed|мит/i.test(title)
    ? `Свіжообсмажена ${coffeeTitle} у Mercato — мита арабіка з чистою чашкою, мʼякою солодкістю і фруктовими акцентами. Доступна в зерні або помелі під ваш спосіб приготування.`
    : /natural|натурал/i.test(title)
      ? `Свіжообсмажена ${coffeeTitle} у Mercato має виразний фруктовий профіль і підходить для тих, хто любить ароматну, живу чашку. Доступна в зерні або помелі.`
      : /decaf|декаф|без кофе/i.test(title)
        ? `Свіжообсмажена ${coffeeTitle} у Mercato — варіант без кофеїну для щоденного заварювання без зайвої гіркоти. Доступна в зерні або помелі.`
        : `Свіжообсмажена ${coffeeTitle} у Mercato має описаний смаковий профіль, актуальне обсмаження і формат під ваш спосіб приготування. Доступна в зерні або помелі.`;
  const intro = type === 'category'
    ? intent === 'local_coffee'
      ? productIntro
      : intent === 'coffee_set'
        ? `${title} у Mercato допомагають порівняти кілька смаків кави в одному замовленні: для подарунка, дегустації або щоденного запасу.`
        : intent === 'tea_category'
          ? `${title} у Mercato зібраний для швидкого вибору листового чаю за смаком, ароматом, фасуванням і способом заварювання.`
          : intent === 'coffee_category'
            ? `${title} у Mercato зібрана для швидкого вибору свіжообсмаженої кави за смаком, форматом і способом приготування.`
            : `${title} у Mercato допомагає швидко зрозуміти варіанти, умови і наступний крок перед замовленням.`
    : type === 'page'
      ? `${title} зібрано для швидкої відповіді на головні питання перед замовленням. Тут можна зрозуміти умови, варіанти і наступний крок без зайвого пошуку.`
      : productIntro;
  const productCards = intent === 'local_coffee'
    ? [
      ['Що вибрати', 'Почніть зі способу приготування: еспресо, фільтр, турка або гейзерна кавоварка. Так легше підібрати обсмаження, помел і смак.'],
      ['Зерно чи помел', 'Якщо є кавомолка, беріть зерно. Якщо потрібна зручність, оберіть помел під конкретний спосіб заварювання.'],
      ['Доставка', 'Замовлення можна оформити онлайн; Mercato підготує каву у потрібному форматі й відправить зручним способом.']
    ]
    : /washed|мит/i.test(title)
    ? [
      ['Смак', 'Мита обробка дає чистішу чашку: легше відчути кислотність, солодкість і фруктові відтінки без важкої ферментності.'],
      ['Приготування', 'Добре розкривається у фільтрі, V60, кемексі або в еспресо, якщо хочете прозорий профіль без грубої гіркоти.'],
      ['Формат', 'Замовляйте в зерні або помелі під свій спосіб приготування; для першої проби зручно почати з меншого фасування.']
    ]
    : /natural|натурал/i.test(title)
      ? [
        ['Смак', 'Натуральна обробка зазвичай дає більш ягідний, солодкий і ароматний профіль у чашці.'],
        ['Приготування', 'Підійде для фільтра, V60 або френч-преса, якщо хочеться виразнішого фруктового характеру.'],
        ['Формат', 'Можна замовити зерно або помел під домашній спосіб приготування.']
      ]
      : [
        ['Смак', 'Орієнтуйтесь на аромат, кислотність, солодкість і тіло, щоб підібрати чашку під свій смак.'],
        ['Формат', 'Можна замовити зерно або помел, фасування для проби чи більший запас для регулярного використання.'],
        ['Порада', 'Якщо вагаєтесь між кількома варіантами, орієнтуйтесь на кислотність, солодкість, тіло і спосіб заварювання.']
      ];
  const setCards = [
    ['Для подарунка', 'Обирайте набори з кількома смаками, якщо хочете подарунок без ризику не вгадати один конкретний сорт.'],
    ['Для дегустації', 'Формат із кількох позицій допомагає порівняти аромат, тіло, кислотність і солодкість у різних чашках.'],
    ['Для щоденного запасу', 'Якщо кава потрібна додому або в офіс, звертайте увагу на вагу, помел і знайомий смаковий профіль.']
  ];
  const teaCards = [
    ['Смак', 'Орієнтуйтесь на інтенсивність, солодкість, травʼяність, фруктовість і післясмак.'],
    ['Заварювання', 'Температура води, грамування і час настоювання сильно впливають на смак чаю.'],
    ['Формат', 'Для проби зручно взяти менше фасування, для щоденного запасу — більший обʼєм.']
  ];
  const cards = type === 'category'
    ? intent === 'coffee_set'
      ? setCards
      : intent === 'tea_category'
        ? teaCards
        : productCards
    : type === 'page'
      ? [
        ['Що важливо', 'Перевірте умови, терміни і деталі перед оформленням замовлення.'],
        ['Як діяти', 'Оберіть потрібний варіант або зверніться до Mercato, якщо потрібна коротка консультація.'],
        ['Що далі', 'Після уточнення деталей можна перейти до каталогу або оформлення замовлення.']
      ]
      : productCards;
  const faq = (proposed.faq || []).slice(0, 4).filter(item => !apiContentLooksInternal(item));
  const closing = intent === 'local_coffee'
    ? 'Mercato допомагає підібрати зерно, помел і спосіб заварювання під ваш смак. Якщо потрібна порада, напишіть нам перед замовленням.'
    : intent === 'coffee_set'
      ? 'Mercato допомагає підібрати добірку під ваш сценарій: подарунок, дегустацію або регулярне замовлення. Якщо потрібна порада, напишіть нам перед замовленням.'
      : intent === 'tea_category' || intent === 'tea_product'
        ? 'Mercato допомагає підібрати чай за смаком, ароматом і способом заварювання. Якщо потрібна порада, напишіть нам перед замовленням.'
        : 'Mercato допомагає підібрати формат і спосіб заварювання під ваш сценарій. Якщо потрібна порада, напишіть нам перед замовленням.';
  return `
<div style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.65;font-size:16px;">
  <p style="margin:0 0 18px;">${htmlEscape(intro)}</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:18px 0;">
    ${cards.map(([heading, text]) => `<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;">
      <strong>${htmlEscape(heading)}</strong><br>
      <span style="color:#4b5563;">${htmlEscape(text)}</span>
    </div>`).join('')}
  </div>
  ${faq.length ? `<h3 style="font-size:20px;margin:24px 0 12px;color:#1f2937;">Питання перед покупкою</h3>
  <ul style="margin:0 0 16px 20px;padding:0;">${faq.map(item => `<li style="margin-bottom:6px;">${htmlEscape(item)}</li>`).join('')}</ul>` : ''}
  <p style="margin:18px 0 0;color:#4b5563;">${htmlEscape(closing)}</p>
</div>`.trim();
}

function apiContentDraftPayload(item = {}) {
  const proposed = item.proposed || {};
  const fallbackTitle = apiContentFallbackTitle({ name: item.name, type: item.type, proposed, url: item.url });
  const fallbackMeta = apiContentFallbackMeta({ name: item.name, type: item.type, proposed, url: item.url });
  const fallbackH1 = apiContentDisplayName(item.name, proposed);
  return {
    type: apiContentPublishType(item.type),
    mode: 'existing',
    url: item.url || '',
    productName: item.name || '',
    title: apiContentSafeSeoField(proposed.title, fallbackTitle),
    metaDescription: apiContentSafeSeoField(proposed.metaDescription, fallbackMeta),
    h1: apiContentSafeSeoField(proposed.h1, fallbackH1),
    content: apiContentHtmlDraft({ name: item.name, type: item.type, proposed, url: item.url }),
    attributes: {},
    isHtml: true,
    allowProductFields: false,
    source: 'app_v2_content_workbench'
  };
}

function apiContentUiTypeFromPublishType(type = '') {
  if (type === 'information') return 'page';
  if (type === 'category') return 'category';
  return 'product';
}

function apiContentRepairDraft(input = {}) {
  const draft = input.draft || input.payload || input || {};
  const uiType = input.itemType || input.contentType || apiContentUiTypeFromPublishType(draft.type || input.type || '');
  const proposed = {
    ...(input.proposed || {}),
    title: draft.title || input.title || input.proposed?.title || '',
    metaDescription: draft.metaDescription || input.metaDescription || input.proposed?.metaDescription || '',
    h1: draft.h1 || input.h1 || input.proposed?.h1 || ''
  };
  const name = input.name || draft.productName || input.productName || proposed.h1 || proposed.title || '';
  const url = draft.url || input.url || '';
  const title = apiContentSafeSeoField(proposed.title, apiContentFallbackTitle({ name, type: uiType, proposed, url }));
  const metaDescription = apiContentSafeSeoField(proposed.metaDescription, apiContentFallbackMeta({ name, type: uiType, proposed, url }));
  const h1 = apiContentSafeSeoField(proposed.h1, apiContentDisplayName(name, proposed));
  const repaired = {
    ...draft,
    type: apiContentPublishType(uiType),
    mode: draft.mode || 'existing',
    url,
    productName: draft.productName || name,
    title,
    metaDescription,
    h1,
    content: apiContentHtmlDraft({
      name: h1 || name,
      type: uiType,
      url,
      proposed: {
        ...proposed,
        title,
        metaDescription,
        h1,
        faq: (input.proposed?.faq || []).filter(item => !apiContentLooksInternal(item))
      }
    }),
    attributes: draft.allowProductFields === false ? {} : (draft.attributes || {}),
    isHtml: true,
    allowProductFields: draft.allowProductFields === false ? false : Boolean(draft.allowProductFields),
    source: 'app_v2_content_repair'
  };
  if (repaired.allowProductFields === false) repaired.attributes = {};
  return {
    ok: true,
    repaired,
    reasonsBefore: unsafePublishContentReasons(draft),
    reasonsAfter: unsafePublishContentReasons(repaired)
  };
}

function apiContentEntityFromMatrixRow(row = {}, index = 0, payload = {}) {
  const productId = row.productId || row.product_id || '';
  const url = row.url || row.gsc?.url || '';
  const type = apiContentTypeFromTarget({ url, productId });
  const rawName = row.name || row.pageLabel || seoActionUrlLabel(url);
  const urlKeyword = seoKeywordFromUrl(url);
  const name = apiContentDisplayName(
    (apiContentLooksSlugName(rawName) || apiContentLooksTransliteratedName(rawName) || apiContentLooksDomainName(rawName)) ? (urlKeyword || rawName) : rawName,
    { h1: urlKeyword, title: urlKeyword }
  );
  const product = productId ? {
    product_id: productId,
    model: row.model || '',
    name,
    url,
    meta_title: row.seo?.title || '',
    meta_description: row.seo?.metaDescription || '',
    meta_h1: row.seo?.h1 || '',
    description_length: row.seo?.descriptionLength || 0,
    attributes_count: row.seo?.attributes || 0,
    score: row.seo?.score || 0,
    issues: row.seo?.issues || []
  } : null;
  const recommendation = professionalSeoRecommendations({
    kind: apiContentKindForRecommendation(row),
    row: row.gsc || null,
    product,
    url,
    label: name,
    products: [],
    measurement: payload.productSeo?.measurement || {}
  });
  const current = apiContentCurrentFromRow(row, type);
  const proposed = {
    title: recommendation.proposed?.title || '',
    metaDescription: recommendation.proposed?.metaDescription || '',
    h1: recommendation.proposed?.h1 || '',
    htmlBlocks: recommendation.contentBlocks || [],
    faq: recommendation.faq || [],
    internalLinks: recommendation.internalLinks || []
  };
  const status = row.status || row.type || 'seo_opportunity';
  const statusKey = String(status || '').toLowerCase();
  const isContentGap = statusKey === 'content_gap';
  const gscImpressions = Number(row.gsc?.impressions || 0);
  const gscClicks = Number(row.gsc?.clicks || 0);
  const gscLostClicks = Number(row.gsc?.lostClicks || 0);
  const why = isContentGap
    ? `Google уже показує цю сторінку, але система ще не знає, що це: товар, категорія, стаття чи посадкова. Спочатку треба привʼязати URL до правильного workflow.`
    : row.action || recommendation.searchIntent || 'Потрібно пройти SEO production loop: сигнал, зміна, preview, publish, readback, контроль.';
  const expectedImpact = isContentGap
    ? `${gscImpressions.toLocaleString('uk')} показів і ${gscClicks.toLocaleString('uk')} кліків у GSC. Результат після дії: сторінку можна безпечно завести у SEO/publish workflow.`
    : row.potentialRevenue
      ? `${formatMoney(row.potentialRevenue)} потенціалу за моделлю.`
      : gscLostClicks
        ? `${gscLostClicks.toLocaleString('uk')} потенційних кліків.`
        : gscImpressions
          ? `${gscImpressions.toLocaleString('uk')} показів у GSC. Треба перевірити, чи можна підняти CTR або конверсію.`
          : 'Очікуваний ефект стане зрозумілий після readback і привʼязки даних.';
  const entity = {
    id: `content-${crypto.createHash('sha1').update(`${url}|${name}|${status}`).digest('hex').slice(0, 10)}`,
    type,
    typeLabel: apiContentTypeLabel(type),
    disabled: row.disabled || status === 'disabled',
    priority: apiContentPriority(row),
    status,
    name,
    url,
    source: 'product_matrix',
    linkedWorkItemId: '',
    summary: isContentGap ? 'Потрібна привʼязка сторінки' : row.label || organicGrowthTypeLabel(row.type) || 'SEO можливість',
    why,
    expectedImpact,
    current,
    proposed,
    preview: {
      snippet: {
        title: proposed.title,
        url,
        description: proposed.metaDescription
      },
      plain: apiContentPreviewPlain(proposed, name)
    },
    evidence: {
      gsc: {
        clicks: gscClicks,
        impressions: gscImpressions,
        ctr: Number(row.gsc?.ctr || 0),
        position: Number(row.gsc?.position || 0),
        lostClicks: gscLostClicks
      },
      sales: row.sales || {},
      sources: recommendation.evidence?.sources || [],
      verdict: recommendation.evidence?.verdict || ''
    },
    workflow: isContentGap ? [
      'Відкрити URL і перевірити, що бачить покупець.',
      'Визначити тип: товар, категорія, стаття, посадкова або сторінка без комерційного сенсу.',
      'Привʼязати сторінку до правильного workflow перед генерацією тексту.',
      'Тільки після привʼязки переходити до preview, dry-run і publish.'
    ] : [
      'Перевірити, чи це товар, категорія або інформаційна сторінка.',
      'Порівняти поточні title/meta/H1 з пропозицією.',
      'Відредагувати сенс, а не просто прийняти текст.',
      'Перед publish подивитись preview і прибрати службові формулювання.',
      'Після publish зробити OpenCart readback і live перевірку.',
      'Поставити контроль GSC через 14 днів.'
    ],
    controls: isContentGap ? [
      'Не генерувати publish-текст, поки URL не привʼязаний до сутності.',
      'Не змінювати URL без окремого рішення.',
      'Якщо сторінка не має бізнес-сенсу, прибрати її з черги.'
    ] : [
      'Не змінювати URL без окремого рішення.',
      'Не публікувати службові блоки про GSC, конкурентів або internal brief.',
      'Для товарів не перезаписувати характеристики без trust-check.'
    ],
    sort: {
      priority: apiPriorityRank(apiContentPriority(row)) + (isContentGap ? 0.5 : 0),
      potential: Number(row.potentialRevenue || 0),
      impressions: gscImpressions,
      index
    }
  };
  entity.draft = apiContentDraftPayload(entity);
  return entity;
}

function apiContentEntityFromWorkItem(item = {}, index = 0) {
  const url = item.target?.url || '';
  const needsTarget = !url;
  const type = apiContentTypeFromTarget({ url, targetType: item.target?.kind === 'content' ? '' : item.target?.kind || '' });
  const keyword = seoKeywordFromUrl(url) || apiContentDisplayName(item.target?.name || item.title || '');
  const name = apiContentDisplayName(item.target?.name || keyword || item.title || seoActionUrlLabel(url));
  const pageType = seoPageType(item.target?.url || '', keyword);
  const proposed = {
    title: seoTitleFor(keyword, pageType, 'product_audit'),
    metaDescription: seoMetaFor(keyword, pageType),
    h1: ucfirstSeo(keyword),
    htmlBlocks: seoContentBlocks(pageType, keyword),
    faq: seoFaq(pageType, keyword),
    internalLinks: seoInternalLinks(pageType, keyword, [])
  };
  const entity = {
    id: `content-work-${item.id}`,
    type,
    typeLabel: apiContentTypeLabel(type),
    priority: item.priority || 'medium',
    status: needsTarget ? 'content_gap' : item.status || 'open',
    name,
    url,
    source: item.source || 'work_item',
    linkedWorkItemId: item.id || '',
    summary: needsTarget ? 'Потрібно знайти URL для дії' : item.title || 'SEO дія',
    why: needsTarget
      ? 'Система знає, яку сторінку або товар треба підсилити, але не має URL для безпечного preview, dry-run і publish. Спочатку треба знайти сторінку в OpenCart або привʼязати товар до URL.'
      : item.why || '',
    expectedImpact: needsTarget
      ? 'Результат після дії: зʼявиться точна сторінка, яку можна перевірити, відредагувати і безпечно відправити в publish workflow.'
      : item.expectedImpact || '',
    current: apiContentCurrentFromRow({}, type),
    proposed,
    preview: {
      snippet: {
        title: proposed.title,
        url: item.target?.url || '',
        description: proposed.metaDescription
      },
      plain: apiContentPreviewPlain(proposed, name)
    },
    evidence: {
      gsc: {},
      sales: {},
      sources: [],
      verdict: 'Дія прийшла з Command Center. Для publish потрібен readback поточного стану.'
    },
    workflow: needsTarget ? [
      'Знайти товар або сторінку в OpenCart.',
      'Додати або підтвердити URL для цієї дії.',
      'Після привʼязки перейти до preview, dry-run і publish.'
    ] : [
      'Відкрити цільову сторінку.',
      'Підтягнути або вручну перевірити поточні SEO-поля.',
      'Підготувати правку у відповідному workflow.',
      'Перевірити preview перед publish.',
      'Зафіксувати рішення done/deferred/dismissed.'
    ],
    controls: needsTarget ? [
      'Не публікувати без URL.',
      'Не здогадуватись, який товар мався на увазі.',
      'Якщо сторінки немає, створити окрему задачу на товар/категорію.'
    ] : [
      'Якщо товар вимкнений або нерелевантний, натиснути “Прибрати”, а не публікувати.',
      'Якщо немає URL, спершу привʼязати сторінку або товар.'
    ],
    sort: {
      priority: apiPriorityRank(item.priority) + (needsTarget ? 0.5 : 0),
      potential: 0,
      impressions: 0,
      index: 100 + index
    }
  };
  entity.draft = apiContentDraftPayload(entity);
  return entity;
}

function apiContentWorkbenchFromPayload(payload = {}, options = {}) {
  const seen = new Set();
  const items = [];
  let skippedDisabled = 0;
  let skippedDecided = 0;
  const decisionEntries = apiDecisionEntries(options);
  const push = (item) => {
    if (!item?.id) return;
    if (apiContentItemDisabled(item)) {
      skippedDisabled += 1;
      return;
    }
    const decision = apiDecisionForIds([item.id, item.linkedWorkItemId], decisionEntries);
    if (apiShouldHideDecision(decision) && !options.includeDecided) {
      skippedDecided += 1;
      return;
    }
    if (decision) item.decision = decision;
    const key = item.url || item.id;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  (payload.productMatrix?.topOpportunities || []).forEach((row, index) => {
    push(apiContentEntityFromMatrixRow(row, index, payload));
  });
  (payload.productMatrix?.unmatchedPages || []).forEach((row, index) => {
    push(apiContentEntityFromMatrixRow({
      ...row,
      status: 'content_gap',
      label: 'Попит без привʼязки',
      action: 'Вирішити: привʼязати до товару/категорії або створити нормальну сторінку.',
      potentialRevenue: 0
    }, 40 + index, payload));
  });
  apiWorkItemsFromPayload(payload, {
    decisionEntries,
    includeDecided: options.includeDecided
  })
    .filter(item => item.type === 'content')
    .forEach((item, index) => push(apiContentEntityFromWorkItem(item, index)));

  const sorted = items
    .sort((a, b) => (a.sort.priority - b.sort.priority)
      || (b.sort.potential - a.sort.potential)
      || (b.sort.impressions - a.sort.impressions)
      || (a.sort.index - b.sort.index))
    .map(({ sort, ...item }) => item);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: payload.source || '',
    summary: {
      total: sorted.length,
      products: sorted.filter(item => item.type === 'product').length,
      categories: sorted.filter(item => item.type === 'category').length,
      pages: sorted.filter(item => item.type === 'page').length,
      high: sorted.filter(item => item.priority === 'high').length,
      skippedDisabled,
      skippedDecided
    },
    items: sorted
  };
}

function apiCustomerDnaFromPayload(payload = {}) {
  const retention = payload.retention || {};
  const customer = payload.customerIntelligence || {};
  const email = payload.emailIntelligence || {};
  const segments = Array.isArray(retention.segments) ? retention.segments : [];
  const suppression = emailSuppressionEntries()
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .slice(0, 25);
  const segmentStatusMap = {
    new_customers: 'new',
    active: 'active',
    replenishment_due: 'watch',
    at_risk: 'risk',
    sleeping: 'churn',
    vip: 'vip'
  };
  const customerRows = flattenCustomerLists(customer.lists || {}).slice(0, 50).map((row, index) => ({
    id: row.customerId || row.id || row.email || `customer-${index}`,
    customerId: row.customerId || row.id || '',
    name: row.name || row.email || 'Клієнт',
    email: row.email || row.emailMasked || '',
    phone: row.phone || row.telephone || '',
    status: row.status || segmentStatusMap[row.group] || row.group || 'watch',
    lastOrder: row.lastOrder || row.last_order || '',
    daysSinceLastOrder: row.daysSinceLastOrder ?? row.daysWithoutOrder ?? null,
    orders: Number(row.orders || row.orderCount || 0),
    totalSpent: Math.round(Number(row.totalSpent || row.revenue || 0)),
    avgOrderValue: Math.round(Number(row.avgOrderValue || 0)),
    favoriteProduct: row.favoriteProduct || row.product || '',
    tasteProfile: row.tasteProfile || row.preferenceTags || [],
    proposedOffer: row.proposedOffer || row.reason || '',
    cadence: row.cadence || {}
  }));
  const communicationLog = (email.campaigns || []).slice(0, 20).map((campaign, index) => ({
    id: campaign.id || `campaign-${index}`,
    date: campaign.sentAt || campaign.createdAt || campaign.date || '',
    subject: campaign.subject || campaign.title || 'Email campaign',
    status: Number(campaign.ordered || campaign.orders || 0) ? 'ordered' : Number(campaign.clicked || 0) ? 'clicked' : Number(campaign.opened || 0) ? 'opened' : 'sent',
    sent: Number(campaign.sent || 0),
    opened: Number(campaign.opened || 0),
    clicked: Number(campaign.clicked || 0),
    revenue: Math.round(Number(campaign.revenue || 0))
  }));
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: payload.source || '',
    summary: {
      customers: Number(retention.totals?.customers || payload.stats?.customers || 0),
      orders: Number(retention.totals?.orders || payload.stats?.orders || 0),
      revenue: Math.round(Number(retention.totals?.revenue || payload.stats?.revenue || 0)),
      avgOrderValue: Math.round(Number(retention.totals?.avgOrderValue || payload.stats?.avgOrderValue || 0)),
      readyToBuy: Number(customer.readyToBuy || 0),
      forecastRevenue: Math.round(Number(customer.forecastRevenue || 0)),
      suppressed: suppression.length
    },
	    segments: segments.map(segment => ({
	      id: segment.id,
	      title: segment.title,
	      status: segmentStatusMap[segment.id] || segment.id || 'watch',
	      count: Number(segment.count || 0),
	      revenue: Math.round(Number(segment.revenue || 0)),
	      avgOrderValue: Math.round(Number(segment.avgOrderValue || 0)),
	      topProducts: segment.topProducts || [],
	      preferenceTags: segment.preferenceTags || []
	    })),
	    customers: customerRows,
	    cadence: {
	      method: 'median_order_interval',
	      riskThreshold: '1.4x цикл',
	      churnThreshold: '3x цикл або 90 днів',
	      note: 'Цикл покупки рахується медіаною між замовленнями, щоб не реагувати на нормальні покупки раз на 2 місяці як на відтік.'
	    },
	    communicationLog,
	    lists: customer.lists || {},
    email: {
      publicTrackingConfigured: email.publicTrackingConfigured !== false,
      total: Number(email.total || 0),
      sent: Number(email.sent || 0),
      opened: Number(email.opened || 0),
      clicked: Number(email.clicked || 0),
      failed: Number(email.failed || 0),
      ordered: Number(email.ordered || 0),
      buyers: Number(email.buyers || 0),
      revenueAfterCampaign: Math.round(Number(email.revenueAfterCampaign || 0)),
      campaigns: email.campaigns || [],
      lists: email.lists || {}
    },
    suppression
  };
}

async function logWorkItemDecision({ id, body = {} } = {}) {
  const payload = await loadCommandCenterPayload().catch(() => null);
  const workItems = apiWorkItemsFromPayload(payload || {});
  const matchedWorkItem = workItems.find(item => item.id === id) || null;
  const status = String(body.status || 'started').trim();
  const event = createBusinessMemoryEvent({
    actionId: id,
    title: body.title || matchedWorkItem?.title || id,
    status,
    note: body.note || '',
    source: body.source || 'app_v2',
    action: body.action || matchedWorkItem?.actions?.[0] || null,
    matched: matchedWorkItem ? {
      id: matchedWorkItem.id,
      title: matchedWorkItem.title,
      why: matchedWorkItem.why,
      expectedImpact: matchedWorkItem.expectedImpact,
      modules: matchedWorkItem.modules
    } : {},
    payload,
    hypothesis: body.hypothesis || matchedWorkItem?.why || '',
    expectedImpact: body.expectedImpact || matchedWorkItem?.expectedImpact || ''
  });
  const actionLog = readActionLog().entries;
  actionLog.unshift(event);
  writeActionLog(actionLog);

  const memory = readBusinessMemory();
  upsertBusinessExperiment(memory, event);
  memory.events.unshift(event);
  writeBusinessMemory(memory);
  return { ok: true, event, workItem: matchedWorkItem };
}

app.get('/app-v2', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app-v2', 'index.html'));
});

app.get(['/app', '/app-v3'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app-v3', 'index.html'));
});

app.get('/api/today', async (req, res) => {
  try {
    const payload = await loadCommandCenterPayload({ forceRefresh: req.query.refresh === '1' || req.query.force === '1' });
    res.json(apiTodayFromPayload(payload));
  } catch (error) {
    console.error('Помилка app-v2 today:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const payload = await loadCommandCenterPayload({ forceRefresh: req.query.refresh === '1' || req.query.force === '1' });
    const today = apiTodayFromPayload(payload);
    res.json({
      ok: true,
      generatedAt: today.generatedAt,
      summary: today.dashboardV2,
      metrics: today.dashboardV2?.metrics || [],
      pricing: today.pricing
    });
  } catch (error) {
    console.error('Помилка app-v2 dashboard summary:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard/actions', async (req, res) => {
  try {
    const payload = await loadCommandCenterPayload({ forceRefresh: req.query.refresh === '1' || req.query.force === '1' });
    const today = apiTodayFromPayload(payload);
    res.json({
      ok: true,
      generatedAt: today.generatedAt,
      actions: today.dashboardV2?.actionQueue || today.queue || []
    });
  } catch (error) {
    console.error('Помилка app-v2 dashboard actions:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/setup-guide', async (req, res) => {
  try {
    const payload = await loadCommandCenterPayload({ forceRefresh: req.query.refresh === '1' || req.query.force === '1' });
    res.json(apiSetupGuideFromPayload(payload));
  } catch (error) {
    console.error('Помилка app-v2 setup-guide:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

const GOOGLE_ADS_API_VERSION = 'v24';

function normalizedGoogleAdsCustomerId(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function googleApiErrorMessage(payload = {}, fallback = 'Google API request failed') {
  return payload?.error?.message
    || payload?.error_description
    || (typeof payload?.error === 'string' ? payload.error : '')
    || fallback;
}

function googleOAuthNeedsReconnect(error = {}) {
  const text = `${error.code || ''} ${error.message || error.error || ''}`;
  return /invalid_grant|expired|revoked|reconnect|unauthorized/i.test(text);
}

async function googleDataAccessToken({ directKey = '', scope = '', source = 'google_data_oauth' } = {}) {
  if (scope && hasGoogleOAuthAccessForScope(scope)) {
    return { accessToken: await refreshGoogleOAuthAccessToken(scope), source };
  }
  const direct = directKey ? connectionValue(directKey) : '';
  if (direct) return { accessToken: direct, source: directKey.toLowerCase() };
  const error = new Error(`Google OAuth не підключено або не має scope: ${scope || 'unknown'}.`);
  error.status = 400;
  throw error;
}

async function googleAdsAccessToken() {
  if (hasGoogleOAuthAccessForScope(GOOGLE_ADS_SCOPE)) {
    return {
      accessToken: await refreshGoogleOAuthAccessToken(GOOGLE_ADS_SCOPE),
      source: 'google_data_oauth'
    };
  }

  const direct = connectionValue('GOOGLE_ADS_ACCESS_TOKEN');
  if (direct) return { accessToken: direct, source: 'google_ads_access_token' };

  const refreshToken = connectionValue('GOOGLE_ADS_REFRESH_TOKEN');
  const clientId = connectionValue('GOOGLE_ADS_CLIENT_ID');
  const clientSecret = connectionValue('GOOGLE_ADS_CLIENT_SECRET');
  const missing = [
    ...(!refreshToken ? ['refresh token'] : []),
    ...(!clientId ? ['OAuth Client ID'] : []),
    ...(!clientSecret ? ['OAuth Client Secret'] : [])
  ];
  if (missing.length) {
    const error = new Error(`Google Ads OAuth неповний: бракує ${missing.join(', ')}.`);
    error.status = 400;
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      }),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Google OAuth не відповів за 15 секунд.');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const error = new Error(googleApiErrorMessage(payload, `Google OAuth HTTP ${response.status}`));
    error.status = response.status || 502;
    throw error;
  }
  return { accessToken: payload.access_token, source: 'refresh_token' };
}

async function verifyGoogleAdsConnection() {
  const status = connectorLiveReadiness('google_ads');
  if (!status.ok) {
    const error = new Error(status.detail);
    error.status = 400;
    error.missing = status.missing;
    throw error;
  }

  const customerId = normalizedGoogleAdsCustomerId(connectionValue('GOOGLE_ADS_CUSTOMER_ID'));
  const loginCustomerId = normalizedGoogleAdsCustomerId(connectionValue('GOOGLE_ADS_LOGIN_CUSTOMER_ID'));
  const developerToken = connectionValue('GOOGLE_ADS_DEVELOPER_TOKEN');
  const { accessToken, source } = await googleAdsAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json'
    };
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;
    response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query: 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1'
        }),
        signal: controller.signal
      }
    );
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Google Ads API не відповів за 20 секунд.');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const requestId = response.headers.get('request-id') || '';
    const message = googleApiErrorMessage(payload, `Google Ads API HTTP ${response.status}`);
    const error = new Error(requestId ? `${message} (request-id: ${requestId})` : message);
    error.status = response.status || 502;
    throw error;
  }
  const customer = payload.results?.[0]?.customer || {};
  return {
    ok: true,
    apiVersion: GOOGLE_ADS_API_VERSION,
    oauthSource: source,
    customer: {
      id: String(customer.id || customerId),
      name: customer.descriptiveName || customer.descriptive_name || '',
      currencyCode: customer.currencyCode || customer.currency_code || '',
      timeZone: customer.timeZone || customer.time_zone || ''
    },
    loginCustomerId: loginCustomerId ? maskConnectionValue(loginCustomerId) : '',
    message: `Google Ads API відповідає для customer ${maskConnectionValue(customerId)}.`
  };
}

function roundGoogleAdsMetric(value, digits = 2) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** digits;
  return Math.round(numeric * factor) / factor;
}

function googleAdsMetricNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

async function googleAdsSearch({ customerId, loginCustomerId, developerToken, accessToken, query, timeoutMs = 25000, timeoutLabel = 'Google Ads API' }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'Content-Type': 'application/json'
    };
    if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;
    response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
        signal: controller.signal
      }
    );
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`${timeoutLabel} не відповів за ${Math.round(timeoutMs / 1000)} секунд.`);
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const requestId = response.headers.get('request-id') || '';
    const message = googleApiErrorMessage(payload, `Google Ads API HTTP ${response.status}`);
    const error = new Error(requestId ? `${message} (request-id: ${requestId})` : message);
    error.status = response.status || 502;
    throw error;
  }
  return payload;
}

async function queryGoogleAdsPerformance({ dateRange = 'LAST_30_DAYS', limit = 20 } = {}) {
  const status = connectorLiveReadiness('google_ads');
  if (!status.ok) {
    const error = new Error(status.detail);
    error.status = 400;
    error.missing = status.missing;
    throw error;
  }

  const safeDateRange = /^[A-Z0-9_]+$/.test(String(dateRange || '')) ? String(dateRange) : 'LAST_30_DAYS';
  const safeLimit = Math.max(1, Math.min(Number(limit || 20), 50));
  const customerId = normalizedGoogleAdsCustomerId(connectionValue('GOOGLE_ADS_CUSTOMER_ID'));
  const loginCustomerId = normalizedGoogleAdsCustomerId(connectionValue('GOOGLE_ADS_LOGIN_CUSTOMER_ID'));
  const developerToken = connectionValue('GOOGLE_ADS_DEVELOPER_TOKEN');
  const { accessToken, source } = await googleAdsAccessToken();
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.ctr,
      metrics.average_cpc
    FROM campaign
    WHERE segments.date DURING ${safeDateRange}
    ORDER BY metrics.cost_micros DESC
    LIMIT ${safeLimit}
  `.replace(/\s+/g, ' ').trim();
  const payload = await googleAdsSearch({
    customerId,
    loginCustomerId,
    developerToken,
    accessToken,
    query,
    timeoutMs: 25000,
    timeoutLabel: 'Google Ads API під час читання кампаній'
  });

  const campaigns = (Array.isArray(payload.results) ? payload.results : []).map(row => {
    const metrics = row.metrics || {};
    const campaign = row.campaign || {};
    const costMicros = googleAdsMetricNumber(metrics.costMicros || metrics.cost_micros);
    const clicks = googleAdsMetricNumber(metrics.clicks);
    const impressions = googleAdsMetricNumber(metrics.impressions);
    return {
      id: String(campaign.id || ''),
      name: campaign.name || '',
      status: campaign.status || '',
      channel: campaign.advertisingChannelType || campaign.advertising_channel_type || '',
      impressions,
      clicks,
      cost: roundGoogleAdsMetric(costMicros / 1000000, 2),
      costMicros,
      conversions: roundGoogleAdsMetric(metrics.conversions, 2),
      conversionValue: roundGoogleAdsMetric(metrics.conversionsValue || metrics.conversions_value, 2),
      ctr: roundGoogleAdsMetric(metrics.ctr ? Number(metrics.ctr) * 100 : (impressions ? (clicks / impressions) * 100 : 0), 2),
      averageCpc: roundGoogleAdsMetric((metrics.averageCpc || metrics.average_cpc || 0) / 1000000, 2)
    };
  });
  const totals = campaigns.reduce((acc, campaign) => {
    acc.impressions += campaign.impressions;
    acc.clicks += campaign.clicks;
    acc.costMicros += campaign.costMicros;
    acc.conversions += campaign.conversions;
    acc.conversionValue += campaign.conversionValue;
    return acc;
  }, { impressions: 0, clicks: 0, costMicros: 0, conversions: 0, conversionValue: 0 });
  totals.cost = roundGoogleAdsMetric(totals.costMicros / 1000000, 2);
  totals.ctr = roundGoogleAdsMetric(totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0, 2);
  totals.averageCpc = roundGoogleAdsMetric(totals.clicks ? totals.cost / totals.clicks : 0, 2);
  totals.conversions = roundGoogleAdsMetric(totals.conversions, 2);
  totals.conversionValue = roundGoogleAdsMetric(totals.conversionValue, 2);

  let landingPages = [];
  let landingPagesError = '';
  try {
    const landingQuery = `
      SELECT
        landing_page_view.unexpanded_final_url,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.conversions_value,
        metrics.ctr
      FROM landing_page_view
      WHERE segments.date DURING ${safeDateRange}
      ORDER BY metrics.clicks DESC
      LIMIT ${safeLimit}
    `.replace(/\s+/g, ' ').trim();
    const landingPayload = await googleAdsSearch({
      customerId,
      loginCustomerId,
      developerToken,
      accessToken,
      query: landingQuery,
      timeoutMs: 25000,
      timeoutLabel: 'Google Ads API під час читання landing pages'
    });
    landingPages = (Array.isArray(landingPayload.results) ? landingPayload.results : []).map(row => {
      const metrics = row.metrics || {};
      const landingPage = row.landingPageView || row.landing_page_view || {};
      const costMicros = googleAdsMetricNumber(metrics.costMicros || metrics.cost_micros);
      const clicks = googleAdsMetricNumber(metrics.clicks);
      const impressions = googleAdsMetricNumber(metrics.impressions);
      const conversions = roundGoogleAdsMetric(metrics.conversions, 2);
      const cost = roundGoogleAdsMetric(costMicros / 1000000, 2);
      return {
        url: landingPage.unexpandedFinalUrl || landingPage.unexpanded_final_url || '',
        impressions,
        clicks,
        cost,
        costMicros,
        conversions,
        conversionValue: roundGoogleAdsMetric(metrics.conversionsValue || metrics.conversions_value, 2),
        ctr: roundGoogleAdsMetric(metrics.ctr ? Number(metrics.ctr) * 100 : (impressions ? (clicks / impressions) * 100 : 0), 2),
        cpa: roundGoogleAdsMetric(conversions ? cost / conversions : 0, 2),
        conversionRate: roundGoogleAdsMetric(clicks ? (conversions / clicks) * 100 : 0, 2)
      };
    }).filter(row => row.url || row.clicks || row.cost);
  } catch (error) {
    landingPagesError = error.message || 'Landing-page performance не прочитано.';
  }

  return {
    ok: true,
    apiVersion: GOOGLE_ADS_API_VERSION,
    oauthSource: source,
    dateRange: safeDateRange,
    dateRangeLabel: 'Останні 30 днів',
    customer: {
      id: maskConnectionValue(customerId),
      loginCustomerId: loginCustomerId ? maskConnectionValue(loginCustomerId) : ''
    },
    totals,
    campaigns,
    landingPages,
    landingPagesError,
    message: campaigns.length
      ? `Прочитано ${campaigns.length} кампаній Google Ads за останні 30 днів${landingPages.length ? ` і ${landingPages.length} landing pages` : ''}.`
      : 'Google Ads API відповідає, але кампаній з метриками за останні 30 днів не знайдено.'
  };
}

async function verifyGa4Connection() {
  const status = connectorLiveReadiness('ga4');
  if (!status.ok) {
    const error = new Error(status.detail);
    error.status = 400;
    error.missing = status.missing;
    throw error;
  }
  const propertyId = String(connectionValue('GA4_PROPERTY_ID') || '').replace(/\D/g, '');
  const { accessToken, source } = await googleDataAccessToken({
    directKey: 'GA4_ACCESS_TOKEN',
    scope: GA4_READONLY_SCOPE
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
          metrics: [{ name: 'activeUsers' }],
          limit: '1'
        }),
        signal: controller.signal
      }
    );
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Google Analytics Data API не відповів за 20 секунд.');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = googleApiErrorMessage(payload, `Google Analytics Data API HTTP ${response.status}`);
    const error = new Error(message);
    error.status = response.status || 502;
    throw error;
  }
  return {
    ok: true,
    oauthSource: source,
    propertyId: maskConnectionValue(propertyId),
    activeUsers7d: Number(payload.rows?.[0]?.metricValues?.[0]?.value || 0),
    message: `GA4 Data API відповідає для property ${maskConnectionValue(propertyId)}.`
  };
}

async function merchantAccessToken() {
  return googleDataAccessToken({
    directKey: 'MERCHANT_ACCESS_TOKEN',
    scope: MERCHANT_CONTENT_SCOPE
  });
}

async function merchantContentApiGet(pathname, {
  accessToken = '',
  timeoutMs = 20000,
  timeoutLabel = 'Google Merchant Content API'
} = {}) {
  const safePathname = String(pathname || '').replace(/^\/+/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(
      `https://shoppingcontent.googleapis.com/content/v2.1/${safePathname}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal
      }
    );
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`${timeoutLabel} не відповів за ${Math.round(timeoutMs / 1000)} секунд.`);
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = googleApiErrorMessage(payload, `Google Merchant Content API HTTP ${response.status}`);
    const error = new Error(message);
    error.status = response.status || 502;
    throw error;
  }
  return payload;
}

function normalizeMerchantIssue(issue = {}) {
  return {
    code: String(issue.code || issue.issueId || issue.id || issue.type || 'unknown_issue'),
    servability: String(issue.servability || issue.severity || ''),
    resolution: String(issue.resolution || ''),
    attributeName: String(issue.attributeName || issue.attribute || ''),
    destination: String(issue.destination || issue.destinationName || ''),
    description: String(issue.description || issue.detail || issue.detailMessage || issue.message || ''),
    documentation: String(issue.documentation || issue.documentationUri || issue.link || '')
  };
}

function normalizeMerchantDestinationStatus(status = {}) {
  return {
    destination: String(status.destination || status.destinationName || ''),
    status: String(status.status || status.approvalStatus || ''),
    approvedCountries: Array.isArray(status.approvedCountries) ? status.approvedCountries : [],
    pendingCountries: Array.isArray(status.pendingCountries) ? status.pendingCountries : [],
    disapprovedCountries: Array.isArray(status.disapprovedCountries) ? status.disapprovedCountries : []
  };
}

function normalizeMerchantProductStatus(row = {}) {
  const issues = (row.itemLevelIssues || row.issues || []).map(normalizeMerchantIssue);
  const destinationStatuses = (row.destinationStatuses || row.destinations || []).map(normalizeMerchantDestinationStatus);
  return {
    productId: String(row.productId || row.offerId || row.id || ''),
    offerId: String(row.offerId || row.productId || ''),
    title: String(row.title || ''),
    link: String(row.link || row.product?.link || ''),
    destinationStatuses,
    issues,
    issueCount: issues.length,
    hasIssues: issues.length > 0
  };
}

function normalizeMerchantAccountStatus(row = {}) {
  const issues = (row.accountLevelIssues || row.issues || []).map(normalizeMerchantIssue);
  return {
    accountId: String(row.accountId || row.accountIdentifier || row.id || ''),
    websiteClaimed: row.websiteClaimed === undefined ? null : Boolean(row.websiteClaimed),
    products: row.products || null,
    accountLevelIssues: issues,
    issueCount: issues.length,
    rawStatus: row.kind || row.status || ''
  };
}

function normalizeMerchantDatafeed(row = {}) {
  return {
    id: String(row.id || row.feedId || ''),
    name: String(row.name || row.fileName || row.contentType || ''),
    contentType: String(row.contentType || ''),
    attributeLanguage: String(row.attributeLanguage || row.language || ''),
    contentLanguage: String(row.contentLanguage || ''),
    targetCountry: String(row.targetCountry || row.country || ''),
    input: String(row.input || ''),
    fetchSchedule: row.fetchSchedule ? {
      dayOfMonth: row.fetchSchedule.dayOfMonth || '',
      hour: row.fetchSchedule.hour || '',
      timeZone: row.fetchSchedule.timeZone || '',
      fetchUrl: row.fetchSchedule.fetchUrl ? maskConnectionValue(row.fetchSchedule.fetchUrl) : ''
    } : null
  };
}

function summarizeMerchantDiagnostics({ accountStatus = null, productStatuses = [], datafeeds = [] } = {}) {
  const issueCounts = new Map();
  const destinations = new Map();
  productStatuses.forEach(product => {
    product.issues.forEach(issue => {
      const code = issue.code || 'unknown_issue';
      issueCounts.set(code, (issueCounts.get(code) || 0) + 1);
    });
    product.destinationStatuses.forEach(status => {
      const key = status.destination || 'unknown_destination';
      destinations.set(key, (destinations.get(key) || 0) + 1);
    });
  });
  (accountStatus?.accountLevelIssues || []).forEach(issue => {
    const code = `account:${issue.code || 'unknown_issue'}`;
    issueCounts.set(code, (issueCounts.get(code) || 0) + 1);
  });
  return {
    productsRead: productStatuses.length,
    productsWithIssues: productStatuses.filter(product => product.hasIssues).length,
    productIssueCount: productStatuses.reduce((sum, product) => sum + product.issueCount, 0),
    accountIssueCount: Number(accountStatus?.issueCount || 0),
    datafeedCount: datafeeds.length,
    topIssues: Array.from(issueCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code))
      .slice(0, 10),
    destinations: Array.from(destinations.entries())
      .map(([destination, count]) => ({ destination, count }))
      .sort((left, right) => right.count - left.count || left.destination.localeCompare(right.destination))
      .slice(0, 8)
  };
}

function writeMerchantDiagnosticsFailure(error = {}) {
  const message = String(error.message || error || 'Google Merchant diagnostics не прочитано.');
  const failure = {
    ok: false,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    publishAllowed: false,
    api: 'Content API for Shopping v2.1',
    error: message,
    reconnectRequired: googleOAuthNeedsReconnect(error),
    migrationNotice: 'Read-only режим: Merchant Center publish вимкнений.',
    summary: {
      productsRead: 0,
      productsWithIssues: 0,
      productIssueCount: 0,
      accountIssueCount: 0,
      datafeedCount: 0,
      topIssues: [],
      destinations: []
    },
    errors: {
      oauth: message
    }
  };
  writeJsonFile(MERCHANT_GOOGLE_DIAGNOSTICS_PATH, failure);
  if (failure.reconnectRequired) {
    writeConnectorVerification('merchant', {
      ok: false,
      error: 'Google OAuth token expired or revoked. Reconnect Google OAuth.',
      message: ''
    });
  }
  return failure;
}

async function queryMerchantCenterDiagnostics({ limit = 80 } = {}) {
  const status = connectorLiveReadiness('merchant');
  if (!status.ok) {
    const error = new Error(status.detail);
    error.status = 400;
    error.missing = status.missing;
    throw error;
  }
  const merchantId = normalizedGoogleAdsCustomerId(connectionValue('MERCHANT_ACCOUNT_ID'));
  const safeLimit = Math.max(1, Math.min(Number(limit || 80), 250));
  const { accessToken, source } = await merchantAccessToken();
  const generatedAt = new Date().toISOString();
  const attempt = async (label, fn) => {
    try {
      return { ok: true, value: await fn() };
    } catch (error) {
      return { ok: false, error: error.message || `${label} не прочитано.` };
    }
  };

  const [accountResult, productsResult, datafeedsResult] = await Promise.all([
    attempt('accountstatuses', () => merchantContentApiGet(`${merchantId}/accountstatuses/${merchantId}`, {
      accessToken,
      timeoutLabel: 'Google Merchant accountstatuses'
    })),
    attempt('productstatuses', () => merchantContentApiGet(`${merchantId}/productstatuses?maxResults=${safeLimit}`, {
      accessToken,
      timeoutLabel: 'Google Merchant productstatuses'
    })),
    attempt('datafeeds', () => merchantContentApiGet(`${merchantId}/datafeeds?maxResults=50`, {
      accessToken,
      timeoutLabel: 'Google Merchant datafeeds'
    }))
  ]);

  const accountStatus = accountResult.ok ? normalizeMerchantAccountStatus(accountResult.value) : null;
  const productStatuses = (productsResult.ok
    ? (productsResult.value.resources || productsResult.value.productStatuses || productsResult.value.items || [])
    : []).slice(0, safeLimit).map(normalizeMerchantProductStatus);
  const datafeeds = (datafeedsResult.ok
    ? (datafeedsResult.value.resources || datafeedsResult.value.datafeeds || datafeedsResult.value.items || [])
    : []).slice(0, 50).map(normalizeMerchantDatafeed);
  const errors = {
    accountStatus: accountResult.ok ? '' : accountResult.error,
    productStatuses: productsResult.ok ? '' : productsResult.error,
    datafeeds: datafeedsResult.ok ? '' : datafeedsResult.error
  };
  const ok = accountResult.ok || productsResult.ok || datafeedsResult.ok;
  const result = {
    ok,
    generatedAt,
    readOnly: true,
    publishAllowed: false,
    api: 'Content API for Shopping v2.1',
    migrationNotice: 'Content API for Shopping має sunset 2026-08-18; цей read-only reader лишається перехідним шаром до Merchant API/MCP.',
    oauthSource: source,
    merchantId: maskConnectionValue(merchantId),
    limit: safeLimit,
    accountStatus,
    productStatuses,
    datafeeds,
    summary: summarizeMerchantDiagnostics({ accountStatus, productStatuses, datafeeds }),
    errors
  };

  if (!ok) {
    const error = new Error(Object.values(errors).filter(Boolean).join(' · ') || 'Google Merchant diagnostics не прочитано.');
    error.status = 502;
    throw error;
  }

  writeJsonFile(MERCHANT_GOOGLE_DIAGNOSTICS_PATH, result);
  writeConnectorVerification('merchant', {
    ok: true,
    message: `Google Merchant diagnostics прочитано: ${productStatuses.length} product statuses, ${datafeeds.length} feeds.`
  });
  return result;
}

async function verifyMerchantConnection() {
  const status = connectorLiveReadiness('merchant');
  if (!status.ok) {
    const error = new Error(status.detail);
    error.status = 400;
    error.missing = status.missing;
    throw error;
  }
  const merchantId = normalizedGoogleAdsCustomerId(connectionValue('MERCHANT_ACCOUNT_ID'));
  const { accessToken, source } = await merchantAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response;
  try {
    response = await fetch(
      `https://shoppingcontent.googleapis.com/content/v2.1/${merchantId}/accounts/${merchantId}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal
      }
    );
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Google Merchant Content API не відповів за 20 секунд.');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = googleApiErrorMessage(payload, `Google Merchant Content API HTTP ${response.status}`);
    const error = new Error(message);
    error.status = response.status || 502;
    throw error;
  }
  return {
    ok: true,
    oauthSource: source,
    merchantId: maskConnectionValue(merchantId),
    account: {
      name: payload.name || '',
      websiteUrl: payload.websiteUrl || '',
      adultContent: Boolean(payload.adultContent)
    },
    message: `Merchant API відповідає для account ${maskConnectionValue(merchantId)}.`
  };
}

app.get('/api/connectors/credentials', (req, res) => {
  res.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    storage: fs.existsSync(CONNECTION_SECRETS_PATH) ? 'program' : 'none',
    googleOAuth: googleOAuthStatus(),
    warning: 'Секрети зберігаються локально на цьому сервері. API повертає тільки masked значення.',
    connectors: connectorStatuses()
  });
});

app.get('/api/connectors/google-ads/verify', async (req, res) => {
  try {
    const result = await verifyGoogleAdsConnection();
    writeConnectorVerification('google_ads', result);
    res.json(result);
  } catch (error) {
    writeConnectorVerification('google_ads', { ok: false, error: error.message });
    res.status(error.status || 500).json({
      ok: false,
      error: error.message,
      missing: error.missing || []
    });
  }
});

app.get('/api/connectors/google-ads/performance', async (req, res) => {
  try {
    const result = await queryGoogleAdsPerformance({
      dateRange: String(req.query.dateRange || 'LAST_30_DAYS'),
      limit: Number(req.query.limit || 20)
    });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      ok: false,
      error: error.message,
      missing: error.missing || []
    });
  }
});

app.get('/api/connectors/ga4/verify', async (req, res) => {
  try {
    const result = await verifyGa4Connection();
    writeConnectorVerification('ga4', result);
    res.json(result);
  } catch (error) {
    writeConnectorVerification('ga4', { ok: false, error: error.message });
    res.status(error.status || 500).json({
      ok: false,
      error: error.message,
      missing: error.missing || []
    });
  }
});

app.get('/api/connectors/merchant/verify', async (req, res) => {
  try {
    const result = await verifyMerchantConnection();
    writeConnectorVerification('merchant', result);
    res.json(result);
  } catch (error) {
    writeConnectorVerification('merchant', { ok: false, error: error.message });
    res.status(error.status || 500).json({
      ok: false,
      error: error.message,
      missing: error.missing || []
    });
  }
});

app.get('/api/connectors/google-oauth/status', (req, res) => {
  res.json({
    ok: true,
    ...googleOAuthStatus()
  });
});

app.post('/api/connectors/credentials', (req, res) => {
  try {
    const connectorId = String(req.body?.connectorId || req.body?.id || '').trim();
    const definition = connectorDefinition(connectorId);
    if (!definition) return res.status(400).json({ ok: false, error: 'Unknown connector' });
    const incoming = req.body?.values && typeof req.body.values === 'object' ? req.body.values : {};
    const current = readConnectionSecrets();
    const next = { ...current, values: { ...(current.values || {}) } };
    const savedKeys = [];

    definition.fields.forEach(field => {
      if (!Object.prototype.hasOwnProperty.call(incoming, field.key)) return;
      const raw = incoming[field.key];
      if (raw === undefined || raw === null) return;
      const value = String(raw).trim();
      if (!value) return;
      next.values[field.key] = value;
      process.env[field.key] = value;
      savedKeys.push(field.key);
    });

    if (!savedKeys.length) {
      return res.status(400).json({
        ok: false,
        error: 'Немає нових значень для збереження. Порожні поля не перезаписують наявні ключі.'
      });
    }

    writeConnectionSecrets(next);
    clearConnectorVerification(connectorId);
    applySavedConnectionSecrets();
    res.json({
      ok: true,
      connectorId,
      savedKeys,
      message: `Збережено ${savedKeys.length} пол(я).`,
      connectors: connectorStatuses()
    });
  } catch (error) {
    console.error('Помилка збереження connector credentials:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get('/api/demo-readiness', async (req, res) => {
  try {
    const payload = await loadCommandCenterPayload({ forceRefresh: req.query.refresh === '1' || req.query.force === '1' });
    res.json(apiDemoReadinessFromPayload(payload));
  } catch (error) {
    console.error('Помилка app-v2 demo readiness:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/owner-router', async (req, res) => {
  try {
    const body = req.body || {};
    const payload = await loadCommandCenterPayload({ forceRefresh: body.refresh === true || body.refresh === '1' });
    res.json(apiOwnerRouterFromPayload(payload, { query: body.query || '' }));
  } catch (error) {
    console.error('Помилка app-v2 owner router:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/work-items', async (req, res) => {
  try {
    const payload = await loadCommandCenterPayload({ forceRefresh: req.query.refresh === '1' || req.query.force === '1' });
    const items = apiWorkItemsFromPayload(payload);
    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      source: payload.source || '',
      count: items.length,
      items,
      summary: {
        total: items.length,
        high: items.filter(item => item.priority === 'high').length,
        medium: items.filter(item => item.priority === 'medium').length,
        low: items.filter(item => item.priority === 'low').length
      }
    });
  } catch (error) {
    console.error('Помилка app-v2 work-items:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/work-items/:id', async (req, res) => {
  try {
    const payload = await loadCommandCenterPayload({ forceRefresh: req.query.refresh === '1' || req.query.force === '1' });
    const item = apiWorkItemsFromPayload(payload).find(row => row.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Work item not found' });
    res.json({ ok: true, item });
  } catch (error) {
    console.error('Помилка app-v2 work-item:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/work-items/:id/decision', async (req, res) => {
  try {
    const result = await logWorkItemDecision({ id: req.params.id, body: req.body || {} });
    res.json(result);
  } catch (error) {
    console.error('Помилка app-v2 decision:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/content-workbench', async (req, res) => {
  try {
    const payload = await loadCommandCenterPayload({ forceRefresh: req.query.refresh === '1' || req.query.force === '1' });
    res.json(apiContentWorkbenchFromPayload(payload));
  } catch (error) {
    console.error('Помилка app-v2 content-workbench:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/content-workbench/repair-draft', async (req, res) => {
  try {
    res.json(apiContentRepairDraft(req.body || {}));
  } catch (error) {
    console.error('Помилка app-v2 repair draft:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/content-workbench/:id', async (req, res) => {
  try {
    const payload = await loadCommandCenterPayload({ forceRefresh: req.query.refresh === '1' || req.query.force === '1' });
    const content = apiContentWorkbenchFromPayload(payload);
    const item = content.items.find(row => row.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Content work item not found' });
    res.json({ ok: true, item });
  } catch (error) {
    console.error('Помилка app-v2 content-workbench item:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/customer-dna', async (req, res) => {
  try {
    const payload = await loadCommandCenterPayload({ forceRefresh: req.query.refresh === '1' || req.query.force === '1' });
    res.json(apiCustomerDnaFromPayload(payload));
  } catch (error) {
    console.error('Помилка app-v2 customer-dna:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/docs/:file', (req, res) => {
  const file = path.basename(String(req.params.file || ''));
  if (!/^[\w.-]+\.md$/i.test(file)) return res.status(404).send('Not found');
  const fullPath = path.join(__dirname, 'docs', file);
  if (!fs.existsSync(fullPath)) return res.status(404).send('Not found');
  res.type('text/plain; charset=utf-8').sendFile(fullPath);
});

app.get('/command-center', async (req, res) => {
  try {
    res.json(await loadCommandCenterPayload({ forceRefresh: req.query.refresh === '1' || req.query.force === '1' }));
  } catch (error) {
    console.error('Помилка командного центру:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/business/product-matrix', async (req, res) => {
  try {
    let bridgeWarning = '';
    const pages = Math.max(1, Math.min(3, Number(req.query.pages || 2) || 2));
    const bridgeTimeoutMs = Math.max(1500, Math.min(8000, Number(req.query.bridgeTimeoutMs || 3500) || 3500));
    const orders = await fetchBridgePages('orders', 'orders', pages, {
      timeoutMs: bridgeTimeoutMs,
      maxElapsedMs: Math.max(3000, bridgeTimeoutMs + 1500)
    }).catch(error => {
      bridgeWarning = error.message;
      return [];
    });
    const matrix = buildProductMatrix({ orders });
    res.json({
      ok: true,
      matrix,
      bridgeWarning,
      source: productMatrixApiSource({ matrix, orders, bridgeWarning, pages, bridgeTimeoutMs })
    });
  } catch (error) {
    console.error('Помилка матриці товарів:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/matrix', async (req, res) => {
  try {
    let bridgeWarning = '';
    const pages = Math.max(1, Math.min(3, Number(req.query.pages || 2) || 2));
    const bridgeTimeoutMs = Math.max(1500, Math.min(8000, Number(req.query.bridgeTimeoutMs || 3500) || 3500));
    const startedAt = Date.now();
    const orders = await fetchBridgePages('orders', 'orders', pages, {
      timeoutMs: bridgeTimeoutMs,
      maxElapsedMs: Math.max(3000, bridgeTimeoutMs + 1500)
    }).catch(error => {
      bridgeWarning = error.message;
      return [];
    });
    const matrix = buildProductMatrix({ orders });
    const source = productMatrixApiSource({ matrix, orders, bridgeWarning, pages, bridgeTimeoutMs, durationMs: Date.now() - startedAt });
    res.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      status: bridgeWarning ? 'partial' : 'ready',
      matrix,
      items: matrix.items || matrix.products || [],
      topOpportunities: matrix.topOpportunities || [],
      bridgeWarning,
      source,
      message: bridgeWarning
        ? 'Матриця оновлена частково: продажі OpenCart тимчасово недоступні, SEO/GSC шари залишаються видимими.'
        : 'Матриця оновлена.'
    });
  } catch (error) {
    console.error('Помилка app-v2 products matrix:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/seo/organic-growth', async (req, res) => {
  try {
    let bridgeWarning = '';
    const pages = Math.max(1, Math.min(20, Number(req.query.pages || 10) || 10));
    const orders = await fetchBridgePages('orders', 'orders', pages).catch(error => {
      bridgeWarning = error.message;
      return [];
    });
    res.json({ ok: true, organic: buildOrganicGrowth({ orders }), bridgeWarning });
  } catch (error) {
    console.error('Помилка Organic Growth:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/seo/organic-growth/draft', async (req, res) => {
  try {
    const opportunity = req.body?.opportunity || {};
    if (!opportunity?.url) return res.status(400).json({ error: 'Немає URL сторінки для покращення.' });
    const enrichedOpportunity = {
      ...opportunity,
      operatorBrief: req.body?.operatorBrief || opportunity.operatorBrief || '',
      competitorResearch: req.body?.competitorResearch || opportunity.competitorResearch || null
    };
    let current = null;
    try {
      const entry = await readOpenCartEntry({
        type: enrichedOpportunity.targetType || organicGrowthTargetType(enrichedOpportunity.url || '', enrichedOpportunity.product || null),
        url: enrichedOpportunity.url || ''
      });
      current = organicCurrentFromEntry(entry);
    } catch (readError) {
      console.warn('Organic Growth draft read current skipped:', readError.message);
    }
    res.json(buildOrganicGrowthDraft(enrichedOpportunity, current));
  } catch (error) {
    console.error('Помилка Organic Growth draft:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/command-center/log', async (req, res) => {
  try {
    const {
      actionId = '',
      title = '',
      status = 'started',
      note = '',
      action = null,
      source = 'command_center',
      hypothesis = '',
      expectedImpact = ''
    } = req.body || {};
    if (!actionId && !title) return res.status(400).json({ error: 'actionId або title required' });
    const payload = await loadCommandCenterPayload().catch(() => null);
    const allActions = [
      ...(payload?.actions || []),
      ...(payload?.moneyMissions || []).map(mission => ({
        id: mission.id,
        title: mission.title,
        why: mission.why,
        expectedImpact: mission.moneyValue ? `${formatMoney(mission.moneyValue)} / ${mission.moneyLabel || 'потенціал'}` : mission.moneyLabel || '',
        primaryAction: mission.action || null
      }))
    ];
    const matched = allActions.find(item => item.id === actionId) || {};
    const event = createBusinessMemoryEvent({
      actionId,
      title: title || matched.title || actionId,
      status,
      note,
      source,
      action: action || matched.primaryAction || null,
      matched,
      payload,
      hypothesis,
      expectedImpact
    });
    const actionLog = readActionLog().entries;
    actionLog.unshift(event);
    writeActionLog(actionLog);

    const memory = readBusinessMemory();
    if (source !== 'director_briefing') {
      upsertBusinessExperiment(memory, event);
    }
    memory.events.unshift(event);
    writeBusinessMemory(memory);

    res.json({ ok: true, event, memory: buildBusinessMemoryDigest(payload || {}) });
  } catch (error) {
    console.error('Помилка запису памʼяті:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/director/issues', (req, res) => {
  try {
    const markdown = readDirectorIssuesMarkdown();
    res.json({
      ok: true,
      markdown,
      issues: parseDirectorIssuesMarkdown(markdown),
      summary: buildDirectorIssuesSummary()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/director/issues', (req, res) => {
  try {
    const result = appendDirectorIssue(req.body || {});
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

function formatMoney(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('uk')} грн`;
}

function commandMetricSnapshot(payload = {}) {
  const metrics = payload.businessBrain?.metrics || {};
  const stats = payload.stats || {};
  const email = payload.emailIntelligence || {};
  const customer = payload.customerIntelligence || {};
  return {
    capturedAt: new Date().toISOString(),
    revenueTotal: Math.round(Number(stats.revenue || 0)),
    ordersTotal: Number(stats.orders || 0),
    customersTotal: Number(stats.customers || 0),
    revenue1d: Math.round(Number(metrics.revenue1d || 0)),
    revenue7d: Math.round(Number(metrics.revenue7d || 0)),
    revenue30d: Math.round(Number(metrics.revenue30d || 0)),
    orders7d: Number(metrics.orders7d || 0),
    atRiskRevenue: Math.round(Number(metrics.atRiskRevenue || 0)),
    emailRevenue: Math.round(Number(metrics.emailRevenue || 0)),
    emailOrdered: Number(email.ordered || 0),
    emailClicked: Number(email.clicked || 0),
    replenishmentCustomers: Number(customer.readyToBuy || 0),
    replenishmentRevenue: Math.round(Number(customer.forecastRevenue || 0))
  };
}

function businessMemoryEventLabel(status) {
  if (status === 'done') return 'виконано';
  if (status === 'deferred') return 'відкладено';
  if (status === 'dismissed') return 'не зараз';
  if (status === 'note') return 'нотатка';
  return 'почато';
}

function createBusinessMemoryEvent({ actionId, title, status, note, source, action, matched, payload, hypothesis = '', expectedImpact = '' }) {
  const now = new Date();
  return {
    id: `mem-${now.getTime()}-${crypto.randomBytes(3).toString('hex')}`,
    actionId: String(actionId || matched?.id || '').trim(),
    title: String(title || matched?.title || 'Дія').trim(),
    status: ['started', 'done', 'deferred', 'dismissed', 'note'].includes(status) ? status : 'started',
    statusLabel: businessMemoryEventLabel(status),
    note: String(note || '').trim(),
    source: source || 'command_center',
    action: action || null,
    hypothesis: String(hypothesis || matched?.why || matched?.expectedImpact || '').trim(),
    expectedImpact: String(expectedImpact || matched?.expectedImpact || '').trim(),
    modules: matched?.modules || [],
    productOpportunities: matched?.productOpportunities || [],
    snapshot: commandMetricSnapshot(payload),
    createdAt: now.toISOString(),
    createdAtLocal: now.toLocaleString('uk-UA')
  };
}

function upsertBusinessExperiment(memory, event) {
  const experiments = Array.isArray(memory.experiments) ? memory.experiments : [];
  const actionId = event.actionId || event.id;
  let experiment = experiments.find(item => item.actionId === actionId && item.status !== 'completed');
  if (!experiment) {
    experiment = {
      id: `exp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      actionId,
      title: event.title,
      status: 'active',
      hypothesis: event.hypothesis || event.title,
      expectedImpact: event.expectedImpact || '',
      action: event.action || null,
      modules: event.modules || [],
      baseline: event.snapshot,
      startedAt: event.createdAt,
      startedAtLocal: event.createdAtLocal,
      lastEventAt: event.createdAt,
      notes: [],
      events: []
    };
    experiments.unshift(experiment);
  }

  experiment.title = event.title || experiment.title;
  experiment.lastEventAt = event.createdAt;
  experiment.events = [event.id, ...(experiment.events || []).filter(id => id !== event.id)].slice(0, 20);
  if (event.note) {
    experiment.notes = [{ text: event.note, at: event.createdAt, status: event.status }, ...(experiment.notes || [])].slice(0, 20);
  }
  if (event.status === 'done') {
    experiment.status = 'completed';
    experiment.completedAt = event.createdAt;
    experiment.completedAtLocal = event.createdAtLocal;
    experiment.result = event.snapshot;
    experiment.conclusion = event.note || autoExperimentConclusion(experiment);
    memory.learnings = [{
      id: `learn-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      actionId,
      title: event.title,
      conclusion: experiment.conclusion,
      createdAt: event.createdAt,
      createdAtLocal: event.createdAtLocal
    }, ...(memory.learnings || [])].slice(0, 250);
  }
  memory.experiments = experiments.slice(0, 250);
}

function autoExperimentConclusion(experiment) {
  const base = experiment.baseline || {};
  const result = experiment.result || {};
  const emailDelta = Number(result.emailRevenue || 0) - Number(base.emailRevenue || 0);
  const revenue7dDelta = Number(result.revenue7d || 0) - Number(base.revenue7d || 0);
  if (emailDelta > 0) return `Є приріст email-виручки: +${formatMoney(emailDelta)}. Варто повторити або масштабувати після перевірки якості аудиторії.`;
  if (revenue7dDelta > 0) return `Є загальний приріст виручки за 7 днів: +${formatMoney(revenue7dDelta)}. Потрібно звʼязати його з конкретними діями.`;
  return 'Результат ще не доведений цифрами. Потрібно або дати більше часу, або змінити гіпотезу перед повтором.';
}

function metricDeltaText(baseline = {}, result = {}) {
  if (!result || !baseline) return [];
  const rows = [
    ['emailRevenue', 'email-виручка'],
    ['emailOrdered', 'замовлень після email'],
    ['revenue7d', 'виручка 7 днів'],
    ['orders7d', 'замовлень 7 днів'],
    ['replenishmentRevenue', 'прогноз повтору']
  ];
  return rows.map(([key, label]) => {
    const delta = Number(result[key] || 0) - Number(baseline[key] || 0);
    if (!delta) return '';
    const value = key.toLowerCase().includes('revenue') ? formatMoney(Math.abs(delta)) : Math.abs(delta).toLocaleString('uk');
    return `${label}: ${delta > 0 ? '+' : '-'}${value}`;
  }).filter(Boolean);
}

function seoMonitorForExperiment(experiment = {}) {
  const seo = experiment.baseline?.seo || null;
  if (!seo?.product) return null;
  const product = seo.product || {};
  const baseline = seo.baselineGsc || {};
  const current = gscBaselineForProduct(product);
  const checkAt = experiment.action?.checkAt || seo.checkAt || '';
  const checkAtMs = Date.parse(checkAt || '') || 0;
  const due = Boolean(checkAtMs && Date.now() >= checkAtMs);
  const ctrDelta = Number(current.ctr || 0) - Number(baseline.ctr || 0);
  const positionDelta = Number(baseline.position || 0) && Number(current.position || 0)
    ? Number(baseline.position || 0) - Number(current.position || 0)
    : 0;
  return {
    productName: product.name || experiment.action?.productName || '',
    url: product.url || experiment.action?.url || '',
    checkAt,
    checkAtLocal: checkAt ? new Date(checkAt).toLocaleDateString('uk-UA') : '',
    due,
    statusLabel: due ? 'час перевірити GSC' : 'очікує індексації',
    baseline,
    current,
    deltas: {
      clicks: Number(current.clicks || 0) - Number(baseline.clicks || 0),
      impressions: Number(current.impressions || 0) - Number(baseline.impressions || 0),
      ctr: Number(ctrDelta.toFixed(4)),
      position: Number(positionDelta.toFixed(1))
    },
    gscLastRunAt: current.gscGeneratedAt || '',
    gscDateRange: current.gscDateRange || ''
  };
}

function buildBusinessMemoryDigest(payload = {}) {
  const memory = readBusinessMemory();
  const actionEntries = readActionLog().entries;
  const events = [...(memory.events || []), ...actionEntries]
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const uniqueEvents = [];
  const seen = new Set();
  for (const event of events) {
    if (!event?.id || seen.has(event.id)) continue;
    seen.add(event.id);
    uniqueEvents.push(event);
  }
  const experiments = (memory.experiments || [])
    .slice()
    .sort((a, b) => String(b.lastEventAt || b.startedAt || '').localeCompare(String(a.lastEventAt || a.startedAt || '')))
    .map(item => ({
      ...item,
      deltas: item.status === 'completed' ? metricDeltaText(item.baseline, item.result) : [],
      ageDays: item.startedAt ? Math.max(0, Math.floor((Date.now() - new Date(item.startedAt).getTime()) / 86400000)) : 0,
      seoMonitor: seoMonitorForExperiment(item)
    }));
  const active = experiments.filter(item => item.status !== 'completed');
  const completed = experiments.filter(item => item.status === 'completed');
  const latestByAction = {};
  for (const event of uniqueEvents) {
    if (event.actionId && !latestByAction[event.actionId]) latestByAction[event.actionId] = event;
  }
  return {
    title: 'Памʼять бізнесу',
    verdict: uniqueEvents.length
      ? `Система памʼятає ${uniqueEvents.length.toLocaleString('uk')} рішень/подій і ${active.length.toLocaleString('uk')} активних експериментів.`
      : 'Памʼять ще порожня: натисніть “Почато” на першій дії, щоб система зафіксувала гіпотезу і базові метрики.',
    summary: {
      events: uniqueEvents.length,
      activeExperiments: active.length,
      completedExperiments: completed.length,
      learnings: (memory.learnings || []).length,
      lastEventAt: uniqueEvents[0]?.createdAtLocal || ''
    },
    active: active.slice(0, 5),
    completed: completed.slice(0, 5),
    recentEvents: uniqueEvents.slice(0, 10),
    learnings: (memory.learnings || []).slice(0, 6),
    latestByAction,
    currentSnapshot: commandMetricSnapshot(payload),
    dataGaps: payload.ownerBrief?.dataGaps || []
  };
}

function latestMemoryByActionId() {
  return buildBusinessMemoryDigest({}).latestByAction || {};
}

function recentlyEmailedSet(daysBack = 30) {
  const tracking = readEmailTracking();
  const messages = Array.isArray(tracking?.messages) ? tracking.messages : [];
  const cutoff = Date.now() - daysBack * 86400000;
  const latest = new Map();
  for (const msg of messages) {
    const email = String(msg.to || '').trim().toLowerCase();
    if (!email) continue;
    const ts = Date.parse(msg.sentAt || msg.createdAt || '') || 0;
    if (!ts || ts < cutoff) continue;
    const status = String(msg.status || '').toLowerCase();
    if (status === 'failed' || status === 'bounced') continue;
    const prev = latest.get(email);
    if (!prev || prev.ts < ts) {
      latest.set(email, { ts, subject: msg.subject || '', segmentId: msg.segmentId || '' });
    }
  }
  return latest;
}

function maskEmail(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at < 2) return s;
  return `${s.slice(0, 2)}***${s.slice(at)}`;
}

function customerDisplayName(name) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return 'клієнт';
  return clean;
}

function cleanCustomerNamePart(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function customerFullNameFromParts(firstName, lastName, fallback = '') {
  const full = [cleanCustomerNamePart(firstName), cleanCustomerNamePart(lastName)]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return full || customerDisplayName(fallback);
}

const DIRECTOR_DECISION_RULES = {
  done: { label: 'виконано', cooldownDays: 30 },
  deferred: { label: 'відкладено', cooldownDays: 7 },
  dismissed: { label: 'не зараз', cooldownDays: Infinity },
  not_now: { label: 'не зараз', cooldownDays: Infinity }
};

function directorPriorityKey(priorityId) {
  return String(priorityId || 'unknown')
    .trim()
    .replace(/^director-/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

function directorActionId(priorityId, customerId) {
  const safeCustomerId = String(customerId || 'unknown')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
  return `director-${directorPriorityKey(priorityId)}-${safeCustomerId}`;
}

function directorActionsForCustomer(priorityId, customerId, entries = readActionLog().entries) {
  const expectedId = directorActionId(priorityId, customerId);
  return (Array.isArray(entries) ? entries : [])
    .filter(entry => String(entry.actionId || '') === expectedId)
    .sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));
}

function activeDirectorDecisionForCustomer(priorityId, customerId, entries = []) {
  const latest = directorActionsForCustomer(priorityId, customerId, entries)[0];
  if (!latest) return null;
  const rawStatus = String(latest.status || '').toLowerCase();
  const status = rawStatus === 'not_now' ? 'dismissed' : rawStatus;
  const rule = DIRECTOR_DECISION_RULES[status];
  if (!rule) return null;

  const createdAtMs = Date.parse(latest.createdAt || '') || 0;
  if (!createdAtMs && Number.isFinite(rule.cooldownDays)) return null;
  if (Number.isFinite(rule.cooldownDays)) {
    const expiresAtMs = createdAtMs + rule.cooldownDays * 86400000;
    if (Date.now() >= expiresAtMs) return null;
    return {
      status,
      label: rule.label,
      actionId: latest.actionId,
      createdAt: latest.createdAt || '',
      expiresAt: new Date(expiresAtMs).toISOString(),
      cooldownDays: rule.cooldownDays
    };
  }

  return {
    status,
    label: rule.label,
    actionId: latest.actionId,
    createdAt: latest.createdAt || '',
    permanent: true
  };
}

function activeDirectorDecisionForActionId(actionId, entries = []) {
  const sorted = (Array.isArray(entries) ? entries : [])
    .filter(entry => String(entry.actionId || '') === String(actionId || ''))
    .sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));
  const latest = sorted[0];
  if (!latest) return null;
  const rawStatus = String(latest.status || '').toLowerCase();
  const status = rawStatus === 'not_now' ? 'dismissed' : rawStatus;
  const rule = DIRECTOR_DECISION_RULES[status];
  if (!rule) return null;
  const createdAtMs = Date.parse(latest.createdAt || '') || 0;
  if (!createdAtMs && Number.isFinite(rule.cooldownDays)) return null;
  if (Number.isFinite(rule.cooldownDays)) {
    const expiresAtMs = createdAtMs + rule.cooldownDays * 86400000;
    if (Date.now() >= expiresAtMs) return null;
    return {
      status,
      label: rule.label,
      actionId: latest.actionId,
      createdAt: latest.createdAt || '',
      expiresAt: new Date(expiresAtMs).toISOString(),
      cooldownDays: rule.cooldownDays
    };
  }
  return {
    status,
    label: rule.label,
    actionId: latest.actionId,
    createdAt: latest.createdAt || '',
    permanent: true
  };
}

function directorDecisionStatsText(stats = {}) {
  const rows = [
    ['done', 'виконано'],
    ['deferred', 'відкладено'],
    ['dismissed', 'не зараз']
  ]
    .filter(([key]) => Number(stats[key] || 0) > 0)
    .map(([key, label]) => `${label}: ${Number(stats[key] || 0)}`);
  return rows.length ? rows.join(', ') : '';
}

function daysSince(value) {
  const ts = Date.parse(value || '');
  if (!ts) return null;
  return Math.max(0, Math.round((Date.now() - ts) / 86400000));
}

function directorCadenceLabel(customer = {}) {
  const cadence = customer.cadence || {};
  const avg = Number(cadence.avgIntervalDays || 0);
  const next = Number(cadence.nextDueInDays);
  const days = Number(customer.daysSinceLastOrder ?? cadence.daysSinceLastOrder ?? 0);
  if (!avg) return '';
  if (Number.isFinite(next)) {
    if (next > 0) return `звичний цикл ~${Math.round(avg)} дн., до очікуваної покупки ще ${Math.round(next)} дн.`;
    if (next === 0) return `звичний цикл ~${Math.round(avg)} дн., саме в день очікуваної покупки`;
    return `звичний цикл ~${Math.round(avg)} дн., прострочив на ${Math.abs(Math.round(next))} дн.`;
  }
  return days ? `звичний цикл ~${Math.round(avg)} дн., останнє замовлення ${Math.round(days)} дн. тому` : `звичний цикл ~${Math.round(avg)} дн.`;
}

function shouldHoldRegularCadenceCustomer(customer = {}) {
  const orderCount = Number(customer.orderCount || 0);
  const frequencyScore = Number(customer.rfm?.frequency || 0);
  const cadence = customer.cadence || {};
  const avg = Number(cadence.avgIntervalDays || 0);
  const next = Number(cadence.nextDueInDays);
  const status = String(cadence.status || '');
  const regular = orderCount >= 4 || frequencyScore >= 4;
  if (!avg || !Number.isFinite(next)) return false;
  if (next > 0) return true;
  if (!regular) return false;
  const graceDays = Math.max(7, Math.min(14, Math.round(avg * 0.2)));
  if (status === 'due_soon' && next >= -graceDays) return true;
  if (status === 'overdue' && Math.abs(Math.min(next, 0)) <= graceDays) return true;
  return false;
}

function directorCadenceHoldReason(customer = {}) {
  const next = Number(customer.cadence?.nextDueInDays);
  if (Number.isFinite(next) && next > 0) {
    return 'Звичний момент покупки ще не настав. Не квапимо: краще поставити на контроль і повернутись ближче до дати.';
  }
  return 'Регулярний клієнт у своєму звичному циклі. Не квапимо: краще перевірити пізніше або писати тільки з реально сильним приводом.';
}

function directorPersonCandidate(r = {}, priorityId = '') {
  const lastProduct = r.recentOrders?.[0]?.products?.[0]
    || r.topProducts?.[0]?.name
    || r.recommendations?.[0]?.name
    || '';
  const daysAgo = daysSince(r.lastOrder);
  const preferenceTags = Array.isArray(r.preferenceTags) ? r.preferenceTags.slice(0, 5) : [];
  const recommendations = Array.isArray(r.recommendations)
    ? r.recommendations.slice(0, 3).map(item => item.name || item).filter(Boolean)
    : [];
  const cadenceLabel = directorCadenceLabel(r);
  return {
    customerId: r.customerId,
    actionId: priorityId ? directorActionId(priorityId, r.customerId) : '',
    name: customerDisplayName(r.name || r.fullName),
    fullName: customerDisplayName(r.fullName || r.name),
    firstName: cleanCustomerNamePart(r.firstName),
    lastName: cleanCustomerNamePart(r.lastName),
    emailMasked: maskEmail(r.email),
    lastOrder: r.lastOrder || '',
    daysSinceLastOrder: daysAgo,
    lastProduct,
    orderCount: Number(r.orderCount || 0),
    totalSpent: Number(r.totalSpent || 0),
    avgOrderValue: Math.round(Number(r.totalSpent || 0) / Math.max(1, Number(r.orderCount || 1))),
    cadenceDays: r.cadence?.avgIntervalDays || r.cadence?.avgDaysBetween || null,
    nextDueInDays: Number.isFinite(Number(r.cadence?.nextDueInDays)) ? Number(r.cadence.nextDueInDays) : null,
    cadenceStatus: r.cadence?.status || '',
    cadenceLabel,
    regularCadenceHold: shouldHoldRegularCadenceCustomer(r),
    preferenceTags,
    recommendations,
    preferenceProfile: [
      cadenceLabel ? `цикл: ${cadenceLabel}` : '',
      preferenceTags.length ? `профіль: ${preferenceTags.join(', ')}` : '',
      recommendations.length ? `орієнтири після перевірки наявності: ${recommendations.join(', ')}` : ''
    ].filter(Boolean).join('; '),
    suggestion: lastProduct
      ? `Згадати ${lastProduct}${daysAgo != null ? ` (купував ${daysAgo} днів тому)` : ''}, але пропонувати до покупки тільки підтверджений товар у наявності`
      : 'Персональне нагадування з рекомендацією від смакового профілю після перевірки наявності'
  };
}

function pickPersonalCandidates(segment, stopList, alreadyChosen, limit = 5, options = {}) {
  const recipients = Array.isArray(segment?.recipients) ? segment.recipients : [];
  const candidates = [];
  const priorityId = options.priorityId || '';
  const directorEntries = Array.isArray(options.directorEntries) ? options.directorEntries : [];
  const decisionStats = options.decisionStats || null;
  const skippedStats = options.skippedStats || null;
  const heldBackPeople = Array.isArray(options.heldBackPeople) ? options.heldBackPeople : null;
  const holdRegularCadence = Boolean(options.holdRegularCadence);
  for (const r of recipients) {
    if (candidates.length >= limit) break;
    const email = String(r.email || '').trim().toLowerCase();
    if (!email) continue;
    if (r.spam && r.spam.canEmail === false) continue;
    if (stopList.has(email)) {
      if (skippedStats) skippedStats.emailStopList = (skippedStats.emailStopList || 0) + 1;
      continue;
    }
    if (alreadyChosen.has(email)) continue;
    const directorDecision = priorityId ? activeDirectorDecisionForCustomer(priorityId, r.customerId, directorEntries) : null;
    if (directorDecision) {
      if (decisionStats) {
        decisionStats[directorDecision.status] = (decisionStats[directorDecision.status] || 0) + 1;
      }
      continue;
    }
    const candidate = directorPersonCandidate(r, priorityId);
    if (holdRegularCadence && candidate.regularCadenceHold) {
      if (skippedStats) skippedStats.regularCadenceHold = (skippedStats.regularCadenceHold || 0) + 1;
      if (heldBackPeople && heldBackPeople.length < 6) {
        heldBackPeople.push({
          ...candidate,
          holdReason: directorCadenceHoldReason(r)
        });
      }
      continue;
    }
    alreadyChosen.add(email);
    candidates.push(candidate);
  }
  return candidates;
}

function buildDirectorBriefing({ retention = {}, emailIntelligence = {}, customerIntelligence = {}, businessBrain = {}, moneyMissions = [], seoActions = [] }) {
  const metrics = businessBrain.metrics || {};
  const productLeaders = Array.isArray(businessBrain.productLeaders) ? businessBrain.productLeaders : [];
  const segments = retention.segments || [];
  const byId = Object.fromEntries(segments.map(s => [s.id, s]));
  const now = new Date();
  const weekday = now.toLocaleDateString('uk-UA', { weekday: 'long' });
  const dateLabel = now.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
  const hour = now.getHours();
  const greetingWord = hour < 5 ? 'Доброї ночі' : hour < 12 ? 'Доброго ранку' : hour < 17 ? 'Добрий день' : 'Добрий вечір';

  const orders1d = Number(metrics.orders1d || 0);
  const revenue1d = Number(metrics.revenue1d || 0);
  const orders7d = Number(metrics.orders7d || 0);
  const revenue7d = Number(metrics.revenue7d || 0);

  let pulse;
  if (orders1d > 0) {
    pulse = `Вчора: ${orders1d} замовлень на ${formatMoney(revenue1d)}. Тиждень: ${orders7d} замовлень на ${formatMoney(revenue7d)}.`;
  } else if (orders7d > 0) {
    pulse = `За тиждень: ${orders7d} замовлень на ${formatMoney(revenue7d)}. Вчора замовлень не було.`;
  } else {
    pulse = 'Свіжих замовлень у вибірці небагато. Сьогодні працюємо на створення наступних.';
  }

  // Stop-lists з різним cooldown для теплих/холодних
  const stopWarm = recentlyEmailedSet(14);  // replenishment / VIP / new
  const stopCold = recentlyEmailedSet(30);  // at_risk / sleeping
  const directorLogEntries = readActionLog().entries;

  // Чесна конверсія: гривень на лист з минулих кампаній. Якщо вибірка < 50 — консервативна оцінка.
  const sentTotal = Number(emailIntelligence.sent || 0);
  const orderedTotal = Number(emailIntelligence.ordered || 0);
  const revenueAfter = Number(emailIntelligence.revenueAfterCampaign || 0);
  const revenuePerSent = sentTotal >= 50 && revenueAfter > 0 ? revenueAfter / sentTotal : 10;
  const conversionPct = sentTotal >= 50 ? (orderedTotal / sentTotal) * 100 : null;
  const conversionEvidence = conversionPct != null
    ? `Минулі кампанії: ${sentTotal.toLocaleString('uk')} листів → ${orderedTotal} покупців (${conversionPct.toFixed(1)}%) → ${formatMoney(revenueAfter)}. Прогноз нижче рахується з цього темпу, не з історичної виручки сегмента.`
    : 'Минулих кампаній замало для точного прогнозу. Прогноз нижче — консервативна оцінка ~10 грн на лист, реальна цифра відкаліброється після першої хвилі.';

  const forecastFor = (people) => Math.round(people * revenuePerSent);
  const forecastNote = (people) => conversionPct != null
    ? `Чесний прогноз: ${people} × ${Math.round(revenuePerSent)} грн = ${formatMoney(forecastFor(people))}. Це не теоретичний максимум сегмента, а екстраполяція з реальної конверсії минулих кампаній.`
    : `Консервативний прогноз: ${people} × 10 грн = ${formatMoney(forecastFor(people))}. Перша хвиля відкалібрує цифру.`;

  const priorities = [];
  const dropped = []; // що НЕ показуємо і чому — для прозорості
  const alreadyChosen = new Set(); // одна людина — один пріоритет на день

  // Пріоритет 1: персональні нагадування про повторну покупку (warm, найбезпечніше)
  const replenishment = byId.replenishment_due || null;
	  if (replenishment && Number(replenishment.count || 0) > 0) {
	    const priorityId = 'director-replenishment-personal';
	    const directorDecisionStats = {};
	    const skippedStats = {};
	    const heldBackPeople = [];
	    const people = pickPersonalCandidates(replenishment, stopWarm, alreadyChosen, 5, {
	      priorityId,
	      directorEntries: directorLogEntries,
	      decisionStats: directorDecisionStats,
	      skippedStats,
	      heldBackPeople,
	      holdRegularCadence: true
	    });
	    if (people.length) {
	      priorities.push({
	        id: priorityId,
	        rank: priorities.length + 1,
	        title: `${people.length} клієнтів готові до повторної покупки`,
	        action: 'Надіслати персональні нагадування тільки тим, хто реально вийшов за свій цикл',
	        why: `Це найтепліша аудиторія, але регулярних клієнтів у межах їхнього нормального циклу не квапимо. ${conversionEvidence}`,
	        expectedImpact: forecastNote(people.length),
	        priority: 'high',
	        people,
	        heldBackPeople,
	        skippedStats,
	        stopList: { excluded: Math.max(0, Number(replenishment.count || 0) - people.length), cooldownDays: 14, directorDecisionStats, skippedStats },
	        cta: { tab: 'email', segmentId: 'replenishment_due', label: 'Відкрити сегмент' }
	      });
	    } else if (Number(replenishment.count || 0) > 0) {
	      const decisionText = directorDecisionStatsText(directorDecisionStats);
	      const held = Number(skippedStats.regularCadenceHold || 0);
	      dropped.push(held
	        ? `Replenishment: ${held} клієнтів ще в межах або біля свого звичного циклу — не квапимо; решта відсіяна stop-list або твоїми рішеннями${decisionText ? ` (${decisionText})` : ''}.`
	        : decisionText
	          ? `Replenishment: немає нових кандидатів після твоїх рішень (${decisionText}) і email stop-list.`
	          : `Replenishment: усім ${replenishment.count} клієнтам у вікні повтору вже писали за останні 14 днів. Чекаємо охолодження stop-list.`);
	    }
  }

  // Пріоритет 2: at_risk (тепліші за sleeping)
  if (priorities.length < 3 && byId.at_risk && Number(byId.at_risk.count || 0) > 0) {
    const priorityId = 'director-at-risk-personal';
    const directorDecisionStats = {};
    const people = pickPersonalCandidates(byId.at_risk, stopCold, alreadyChosen, 5, { priorityId, directorEntries: directorLogEntries, decisionStats: directorDecisionStats });
    if (people.length) {
      priorities.push({
        id: priorityId,
        rank: priorities.length + 1,
        title: `${people.length} клієнтів у ризику відтоку — теплі, ще не остигли`,
        action: 'Персональний лист "ми памʼятаємо вас" з посиланням на улюблений товар',
        why: `Цим клієнтам не варто слати масовий шаблон winback. Вони купували раніше, памʼятають Mercato. Лист має згадати конкретний товар, не загальну знижку. ${conversionEvidence}`,
        expectedImpact: forecastNote(people.length),
        priority: 'high',
        people,
        stopList: { excluded: Math.max(0, Number(byId.at_risk.count || 0) - people.length), cooldownDays: 30, directorDecisionStats },
        cta: { tab: 'email', segmentId: 'at_risk', label: 'Відкрити сегмент' }
      });
    } else {
      const decisionText = directorDecisionStatsText(directorDecisionStats);
      dropped.push(decisionText
        ? `At-risk: немає нових кандидатів після твоїх рішень (${decisionText}) і email stop-list.`
        : `At-risk: всім ${byId.at_risk.count} клієнтам у ризику вже писали за останні 30 днів.`);
    }
  }

  // Sleeping — тільки якщо є невідправлені і чесно називаємо це холодним експериментом
  if (priorities.length < 3 && byId.sleeping && Number(byId.sleeping.count || 0) > 0) {
    const priorityId = 'director-sleeping-tiny-test';
    const directorDecisionStats = {};
    const people = pickPersonalCandidates(byId.sleeping, stopCold, alreadyChosen, 3, { priorityId, directorEntries: directorLogEntries, decisionStats: directorDecisionStats });
    if (people.length) {
      priorities.push({
        id: priorityId,
        rank: priorities.length + 1,
        title: `Sleeping: ${people.length} нових кандидатів для маленького тесту`,
        action: 'Малий персональний тест (3-5 листів), НЕ масова розсилка',
        why: `Sleeping — холодна аудиторія. Уже відправили ${stopCold.size > 0 ? [...stopCold.values()].filter(v => v.segmentId === 'sleeping').length : 0} листів за останні 30 днів. Тільки ${people.length} ще ні. Малий тест покаже, чи варто масштабувати.`,
        expectedImpact: forecastNote(people.length),
        priority: 'medium',
        people,
        stopList: { excluded: Math.max(0, Number(byId.sleeping.count || 0) - people.length), cooldownDays: 30, directorDecisionStats },
        cta: { tab: 'email', segmentId: 'sleeping', label: 'Відкрити сегмент' }
      });
    } else {
      const decisionText = directorDecisionStatsText(directorDecisionStats);
      dropped.push(decisionText
        ? `Sleeping: немає нових кандидатів після твоїх рішень (${decisionText}) і 30-денного stop-list.`
        : `Sleeping: усім ${byId.sleeping.count} клієнтам уже писали за 30 днів. Не чіпаємо — інакше це спам.`);
    }
  }

  const seoDecisionStats = {};
  const activeSeoActions = (Array.isArray(seoActions) ? seoActions : []).filter(action => {
    const decision = activeDirectorDecisionForActionId(action.actionId || action.id, directorLogEntries);
    if (decision) {
      seoDecisionStats[decision.status] = (seoDecisionStats[decision.status] || 0) + 1;
      return false;
    }
    return true;
  });
  if (activeSeoActions.length) {
    const lead = activeSeoActions[0];
    const highCount = activeSeoActions.filter(action => action.priority === 'high').length;
    priorities.push({
      id: 'director-seo-action-queue',
      rank: priorities.length + 1,
      title: highCount
        ? `${highCount} SEO-дій з високим пріоритетом`
        : `${activeSeoActions.length} конкретних SEO-дій на сьогодні`,
      action: lead.action || 'Відкрити першу SEO-дію і довести її до publish/readback',
      why: lead.why || 'GSC/OpenCart audit вже дали вимірюваний сигнал, тому SEO має йти як операційна дія, не як загальна порада.',
      expectedImpact: lead.expectedImpact || 'Органіка росте повільніше за email, але ці дії підсилюють трафік і конверсію без повторного спаму клієнтам.',
      priority: highCount ? 'high' : 'medium',
      people: [],
      seoActions: activeSeoActions.slice(0, 4),
      stopList: { excluded: Math.max(0, (Array.isArray(seoActions) ? seoActions.length : 0) - activeSeoActions.length), cooldownDays: 7, directorDecisionStats: seoDecisionStats },
      cta: lead.primaryAction || { tab: 'generate', label: 'Відкрити SEO workflow' }
    });
  } else if ((Array.isArray(seoActions) ? seoActions.length : 0) > 0) {
    const decisionText = directorDecisionStatsText(seoDecisionStats);
    dropped.push(decisionText
      ? `SEO: усі сьогоднішні дії вже приглушені твоїми рішеннями (${decisionText}).`
      : 'SEO: усі поточні дії вже виконані або відкладені.');
  }

  // Якщо все винятково в stop-list — пропонуємо неперсональну дію (товар)
  if (priorities.length === 0 && productLeaders.length) {
    const leader = productLeaders[0];
    priorities.push({
      id: 'director-product-leader',
      rank: 1,
      title: `Сьогодні без email: підсилюємо лідера попиту — ${leader.name}`,
      action: 'Оновити картку товару, перевірити рекламу, додати в email-рекомендації наступної кампанії',
      why: `Усім тепло-холодним клієнтам уже писали за останні 14-30 днів. Друге торкання зараз = спам. Натомість інвестуємо в товар, що тягне продажі: ${leader.name}, ${Number(leader.count || 0)} продажів у вибірці.`,
      expectedImpact: 'Інвестиція в актив. Прямий ефект — через органіку і наступну хвилю, не сьогодні.',
      priority: 'medium',
      people: [],
      cta: { tab: 'generate', productName: leader.name, label: 'Відкрити товар' }
    });
  }

  let weekRecapNote;
  if (sentTotal > 0 && orderedTotal > 0) {
    weekRecapNote = `Минула кампанія: ${sentTotal.toLocaleString('uk')} листів → ${orderedTotal} покупців → ${formatMoney(revenueAfter)} виручки. Конверсія ${conversionPct.toFixed(1)}%. Воркфлоу довів цінність — повторюємо, але точково.`;
  } else if (sentTotal > 0) {
    weekRecapNote = `Минула кампанія: ${sentTotal.toLocaleString('uk')} листів, замовлень після email ще не зафіксовано. Перевір сегмент і пропозицію перед наступною хвилею.`;
  } else {
    weekRecapNote = 'Минулого тижня масових email-дій не запускали. Час дати магазину імпульс — починаємо з пріоритету №1.';
  }

  let closing;
  if (!priorities.length) {
    closing = 'Сьогодні нічого не відправляємо. Усім, кому треба було — вже написали. Перевір повертаються замовлення і працюй з товарами.';
  } else if (Array.isArray(priorities[0].seoActions) && priorities[0].seoActions.length) {
    closing = `Найважливіше — №1: ${priorities[0].seoActions.length} SEO-дії. Почни з першої, опублікуй і зроби readback.`;
  } else if (priorities[0].priority === 'high') {
    closing = `Найважливіше — №1: ${priorities[0].people.length} людей поіменно. Не масова розсилка — це окремий лист кожному. Затверди по одному.`;
  } else {
    closing = 'Це не пожежа. Малий персональний тест краще за велику масову атаку.';
  }

  return {
    title: 'Брифінг директора',
    greeting: `${greetingWord}. Сьогодні ${weekday}, ${dateLabel}.`,
    pulse,
    priorities,
    stopListInfo: {
      warmCooldownDays: 14,
      coldCooldownDays: 30,
      recentlyEmailedWarm: stopWarm.size,
      recentlyEmailedCold: stopCold.size
    },
    dropped,
    weekRecap: {
      sent: sentTotal,
      ordered: orderedTotal,
      revenue: Math.round(revenueAfter),
      conversionPct: conversionPct != null ? Number(conversionPct.toFixed(2)) : null,
      revenuePerSent: Math.round(revenuePerSent),
      note: weekRecapNote
    },
    closing,
    signature: 'AI-комерційний директор'
  };
}

function buildOwnerBrief({ retention = {}, emailIntelligence = {}, customerIntelligence = {}, businessBrain = {}, moneyMissions = [] }) {
  const segments = retention.segments || [];
  const byId = Object.fromEntries(segments.map(segment => [segment.id, segment]));
  const metrics = businessBrain.metrics || {};
  const productLeaders = Array.isArray(businessBrain.productLeaders) ? businessBrain.productLeaders : [];
  const topMission = Array.isArray(moneyMissions) ? moneyMissions[0] : null;
  const answers = [];
  const dataGaps = [];

  const addAnswer = (answer) => answers.push({
    id: answer.id,
    question: answer.question,
    answer: answer.answer,
    evidence: answer.evidence || [],
    next: answer.next || '',
    action: answer.action || null
  });

  if (topMission) {
    addAnswer({
      id: 'owner-where-money',
      question: 'Де зараз лежать найближчі гроші?',
      answer: `${topMission.title}. Поточний фокус: ${topMission.moneyValue ? formatMoney(topMission.moneyValue) : topMission.moneyLabel}.`,
      evidence: topMission.evidence || [],
      next: 'Не відкривати всі модулі одразу. Почати з цієї місії, виконати дію і повернутись до перевірки результату.',
      action: topMission.action
    });
  }

  const riskRevenue = Number(byId.at_risk?.revenue || 0) + Number(byId.sleeping?.revenue || 0);
  if (riskRevenue > 0) {
    addAnswer({
      id: 'owner-why-sales-leak',
      question: 'Чому продажі можуть бути нижчими, ніж могли б?',
      answer: `Велика частина потенціалу не в новому трафіку, а в людях, які вже купували і зникли. У retention-ризику видно ${formatMoney(riskRevenue)} історичної виручки.`,
      evidence: [
        `At-risk клієнтів: ${Number(byId.at_risk?.count || 0).toLocaleString('uk')}`,
        `Сплячих клієнтів: ${Number(byId.sleeping?.count || 0).toLocaleString('uk')}`,
        `Новий трафік ще не пояснює, чому старі клієнти не повертаються`
      ],
      next: 'Розділити теплих і холодних клієнтів. Не робити одну масову розсилку на всіх.',
      action: { tab: 'email', segmentId: byId.at_risk?.count ? 'at_risk' : 'sleeping', label: 'Відкрити retention' }
    });
  }

  if (customerIntelligence.readyToBuy) {
    addAnswer({
      id: 'owner-who-to-contact',
      question: 'Кому писати зараз, щоб це не виглядало як спам?',
      answer: `${Number(customerIntelligence.readyToBuy || 0).toLocaleString('uk')} клієнтів наблизились до власного циклу повторної покупки або вже його пропустили.`,
      evidence: [
        `Прогноз повтору: ${formatMoney(customerIntelligence.forecastRevenue)}`,
        `Наближаються: ${Number(customerIntelligence.dueSoon || 0).toLocaleString('uk')}`,
        `Прострочили цикл: ${Number(customerIntelligence.overdue || 0).toLocaleString('uk')}`
      ],
      next: 'Писати від улюбленого товару або смакового профілю, а не від загальної знижки.',
      action: { tab: 'email', segmentId: 'replenishment_due', label: 'Відкрити сегмент' }
    });
  }

  if (productLeaders.length) {
    const leader = productLeaders[0];
    addAnswer({
      id: 'owner-which-product',
      question: 'Який товар тягнути першим?',
      answer: `${leader.name}. Він уже має попит, тому його треба підсилити в SEO, email-рекомендаціях, рекламі і конкурентному порівнянні.`,
      evidence: [
        `${leader.name}: ${Number(leader.count || 0).toLocaleString('uk')} продажів у свіжій вибірці`,
        `Виручка 7 днів: ${formatMoney(metrics.revenue7d)}`,
        `Замовлень 7 днів: ${Number(metrics.orders7d || 0).toLocaleString('uk')}`
      ],
      next: 'Спочатку readback з OpenCart, потім атрибути/SEO, потім конкурентний аналіз і рекламний angle.',
      action: { tab: 'generate', productName: leader.name, label: 'Відкрити товар' }
    });
  }

  if (emailIntelligence.total) {
    addAnswer({
      id: 'owner-email-proof',
      question: 'Чи дають мої дії результат?',
      answer: emailIntelligence.ordered
        ? `Так, частина результату вже видима: ${Number(emailIntelligence.ordered || 0).toLocaleString('uk')} покупці після листів, ${formatMoney(emailIntelligence.revenueAfterCampaign)} виручки.`
        : 'Поки видно відправки й реакції, але замовлень після email ще немає або їх замало для висновку.',
      evidence: [
        `Відправлено: ${Number(emailIntelligence.sent || 0).toLocaleString('uk')}`,
        `Відкрито: ${Number(emailIntelligence.opened || 0).toLocaleString('uk')}`,
        `Кліків: ${Number(emailIntelligence.clicked || 0).toLocaleString('uk')}`
      ],
      next: 'Після кожної кампанії система має автоматично формувати stop-list, follow-up і висновок: повторювати, змінити або зупинити.',
      action: { tab: 'command', label: 'Дивитись email intelligence', focus: 'emailBrain' }
    });
  }

  if (emailIntelligence.publicTrackingConfigured === false) {
    dataGaps.push('Немає публічного tracking URL: відкриття і кліки реальних клієнтів можуть бути неповними.');
  }
  dataGaps.push('Немає рекламних витрат і ROAS: система бачить продажі, але ще не знає ціну залучення.');
  dataGaps.push('Немає маржі/собівартості по товарах: зараз пріоритети рахуються по виручці, не по прибутку.');
  dataGaps.push('Немає регулярного моніторингу цін конкурентів: конкурентний висновок поки запускається вручну.');

  const confidenceSignals = [
    Number(retention.totals?.customers || 0) > 0,
    Number(retention.totals?.orders || 0) > 0,
    productLeaders.length > 0,
    Number(customerIntelligence.readyToBuy || 0) > 0,
    Number(emailIntelligence.total || 0) > 0,
    emailIntelligence.publicTrackingConfigured !== false
  ].filter(Boolean).length;
  const confidence = Math.round((confidenceSignals / 6) * 100);

  return {
    title: 'Відповіді власнику',
    verdict: topMission
      ? `Найкращий наступний крок: ${topMission.title.toLowerCase()}. Це не “ще одна функція”, а робочий фокус на сьогодні.`
      : 'Система ще збирає достатньо сигналів, щоб дати сильний фокус на сьогодні.',
    confidence,
    answers: answers.slice(0, 5),
    dataGaps: dataGaps.slice(0, 4)
  };
}

function buildMoneyMissions({ retention = {}, emailIntelligence = {}, customerIntelligence = {}, businessBrain = {} }) {
  const segments = retention.segments || [];
  const byId = Object.fromEntries(segments.map(segment => [segment.id, segment]));
  const productLeaders = Array.isArray(businessBrain.productLeaders) ? businessBrain.productLeaders : [];
  const metrics = businessBrain.metrics || {};
  const missions = [];
  const add = (mission) => missions.push({
    id: mission.id,
    priority: mission.priority || 'medium',
    title: mission.title,
    subtitle: mission.subtitle || '',
    moneyLabel: mission.moneyLabel || 'потенціал',
    moneyValue: Math.round(Number(mission.moneyValue || 0)),
    why: mission.why || '',
    evidence: mission.evidence || [],
    steps: mission.steps || [],
    actionLabel: mission.actionLabel || 'Відкрити',
    action: mission.action || null
  });

  if (customerIntelligence.readyToBuy) {
    add({
      id: 'money-replenishment',
      priority: 'high',
      title: 'Повернути клієнтів у момент покупки',
      subtitle: `${Number(customerIntelligence.readyToBuy || 0).toLocaleString('uk')} клієнтів близько до повторного замовлення`,
      moneyLabel: 'прогноз повтору',
      moneyValue: customerIntelligence.forecastRevenue,
      why: 'Це найтепліша місія: люди вже купували, і система бачить їхній власний цикл повторної покупки.',
      evidence: [
        `Наближаються до покупки: ${Number(customerIntelligence.dueSoon || 0).toLocaleString('uk')}`,
        `Вже пропустили свій цикл: ${Number(customerIntelligence.overdue || 0).toLocaleString('uk')}`,
        `Топ товари для нагадування: ${(customerIntelligence.topDueProducts || []).slice(0, 3).map(p => p.name).join(', ') || '-'}`
      ],
      steps: ['відкрити сегмент', 'перевірити клієнтів', 'згенерувати персональні листи', 'після відправки дивитись замовлення'],
      actionLabel: 'Підготувати нагадування',
      action: { tab: 'email', segmentId: 'replenishment_due', label: 'Підготувати нагадування' }
    });
  }

  if (emailIntelligence.ordered) {
    add({
      id: 'money-repeat-email-winner',
      priority: 'high',
      title: 'Повторити те, що вже принесло замовлення',
      subtitle: `${Number(emailIntelligence.ordered || 0).toLocaleString('uk')} покупці після email`,
      moneyLabel: 'підтверджено після email',
      moneyValue: emailIntelligence.revenueAfterCampaign,
      why: 'Це доказова місія: система не спирається на відкриття, а бачить реальні замовлення в OpenCart після листів.',
      evidence: [
        `Відправлено: ${Number(emailIntelligence.sent || 0).toLocaleString('uk')}`,
        `Кліків: ${Number(emailIntelligence.clicked || 0).toLocaleString('uk')}`,
        `Унікальних покупців: ${Number(emailIntelligence.buyers || 0).toLocaleString('uk')}`
      ],
      steps: ['знайти кампанію-переможця', 'виключити тих, хто вже купив', 'зробити наступний follow-up'],
      actionLabel: 'Відкрити результат',
      action: { tab: 'command', label: 'Відкрити email intelligence', focus: 'emailBrain' }
    });
  }

  const warmRisk = byId.at_risk || byId.sleeping;
  const riskRevenue = Number(byId.at_risk?.revenue || 0) + Number(byId.sleeping?.revenue || 0);
  if (warmRisk?.count && riskRevenue > 0) {
    add({
      id: 'money-retention-risk',
      priority: 'high',
      title: 'Не дати старим грошам охолонути',
      subtitle: `${Number((byId.at_risk?.count || 0) + (byId.sleeping?.count || 0)).toLocaleString('uk')} клієнтів у retention-ризику`,
      moneyLabel: 'історична виручка',
      moneyValue: riskRevenue,
      why: 'Це клієнти, які вже довірились магазину. Повернути частину з них зазвичай дешевше, ніж купувати новий трафік.',
      evidence: [
        `At-risk: ${Number(byId.at_risk?.count || 0).toLocaleString('uk')}`,
        `Sleeping: ${Number(byId.sleeping?.count || 0).toLocaleString('uk')}`,
        `Середній чек: ${formatMoney(warmRisk.avgOrderValue || retention.totals?.avgOrderValue || 0)}`
      ],
      steps: ['почати з теплого at-risk', 'не змішувати холодних sleeping', 'запустити малий тест'],
      actionLabel: 'Зібрати winback',
      action: { tab: 'email', segmentId: byId.at_risk?.count ? 'at_risk' : 'sleeping', label: 'Зібрати winback' }
    });
  }

  if (productLeaders.length) {
    const leader = productLeaders[0];
    const avgOrder = Number(metrics.avgOrderValue || retention.totals?.avgOrderValue || 0);
    add({
      id: 'money-product-leader',
      priority: 'medium',
      title: 'Підсилити товар, який уже тягне попит',
      subtitle: leader.name,
      moneyLabel: 'попит у вибірці',
      moneyValue: avgOrder * Number(leader.count || 0),
      why: 'Якщо товар уже купують, його сторінка, SEO, email-рекомендації й реклама мають працювати як один цикл продажів.',
      evidence: [
        `${leader.name}: ${Number(leader.count || 0).toLocaleString('uk')} продажів у вибірці`,
        `Наступні сигнали: ${productLeaders.slice(1, 4).map(p => `${p.name} x${p.count}`).join(', ') || '-'}`,
        'Місія закінчується не текстом, а записом в OpenCart і readback-перевіркою'
      ],
      steps: ['прочитати товар із БД', 'оновити SEO/атрибути', 'перевірити сторінку', 'підготувати рекламний angle'],
      actionLabel: 'Відкрити SEO-картку',
      action: { tab: 'generate', productName: leader.name, label: 'Відкрити SEO-картку' }
    });

    add({
      id: 'money-competitor-gap',
      priority: 'medium',
      title: 'Знайти, чому конкурент може продавати краще',
      subtitle: leader.name,
      moneyLabel: 'товар для перевірки',
      moneyValue: 0,
      why: 'Власнику не потрібна абстрактна “аналітика конкурентів”; потрібен список конкретних прогалин у товарі, ціні, аргументах і довірі.',
      evidence: [
        `Почати з товару з реальним попитом: ${leader.name}`,
        'Порівняти вашу сторінку з 1-4 конкурентами',
        'Після аналізу перенести висновки в SEO-картку, рекламу або email'
      ],
      steps: ['вставити URL вашого товару', 'додати конкурентів', 'отримати прогалини', 'перетворити на дію'],
      actionLabel: 'Порівняти з конкурентами',
      action: { tab: 'analysis', productName: leader.name, label: 'Порівняти з конкурентами' }
    });
  }

  if (emailIntelligence.publicTrackingConfigured === false) {
    add({
      id: 'money-tracking-blindspot',
      priority: 'medium',
      title: 'Закрити сліпу зону після відправки',
      subtitle: 'Відкриття й кліки не будуть повними без публічного tracking URL',
      moneyLabel: 'контроль втрат',
      moneyValue: 0,
      why: 'Без нормального tracking власник бачить тільки частину воронки: лист пішов і, можливо, покупка була. Але не видно, де саме люди губляться.',
      evidence: [
        `Зараз відправлено в tracking: ${Number(emailIntelligence.sent || 0).toLocaleString('uk')}`,
        `Без реакції: ${Number(emailIntelligence.ignored || 0).toLocaleString('uk')}`,
        'Потрібно бачити: доставлено, відкрито, клікнув, купив, проігнорував'
      ],
      steps: ['налаштувати PUBLIC_BASE_URL', 'перевірити pixel/click', 'повернути списки в командний центр'],
      actionLabel: 'Відкрити tracking',
      action: { tab: 'email', label: 'Відкрити tracking' }
    });
  }

  const priorityWeight = { high: 0, medium: 1, low: 2 };
  return missions
    .sort((a, b) => (priorityWeight[a.priority] ?? 1) - (priorityWeight[b.priority] ?? 1) || Number(b.moneyValue || 0) - Number(a.moneyValue || 0))
    .slice(0, 5);
}

function buildProductSeoCockpit({ retention = {}, businessBrain = {} }) {
  const metrics = businessBrain.metrics || {};
  const measurement = seoMeasurementSnapshot();
  const leaders = (Array.isArray(businessBrain.productLeaders) && businessBrain.productLeaders.length)
    ? businessBrain.productLeaders
    : (Array.isArray(retention.topProducts) ? retention.topProducts : []);
  const avgOrderValue = Number(metrics.avgOrderValue || retention.totals?.avgOrderValue || 0);
  const products = leaders.slice(0, 6).map((product, index) => {
    const count = Number(product.count || 0);
    const demandValue = Math.round(count * avgOrderValue);
    return {
      name: product.name || `Товар ${index + 1}`,
      count,
      demandValue,
      priority: index === 0 ? 'high' : index < 3 ? 'medium' : 'low',
      seoFocus: [
        'readback поточної картки з OpenCart',
        'title / meta / H1 під реальний попит',
        'опис, FAQ і атрибути без переспаму',
        'публікація в OpenCart + readback'
      ],
      keywordHint: product.name || '',
      primaryAction: { tab: 'generate', productName: product.name || '', label: 'Зібрати SEO-пакет' },
      competitorAction: { tab: 'analysis', productName: product.name || '', label: 'Порівняти конкурентів' },
      emailAction: { tab: 'email', productName: product.name || '', label: 'Додати в retention' }
    };
  });
  const seoActions = buildSeoDirectorActions({ measurement, products });

  return {
    title: 'Товари & SEO',
    verdict: products.length
      ? 'SEO є, але його треба вести як товарний операційний цикл: сигнал → конкретна дія → publish → readback → GSC.'
      : 'SEO-цикл готовий, але потрібні товарні сигнали з замовлень або ручний вибір товару.',
    seoExists: true,
    seoMode: 'content + OpenCart publish workflow',
    currentCapabilities: [
      'генерація SEO title / meta / H1 / HTML-опису',
      'місячний market/SEO/UX research cache',
      'запис SEO-пакета в OpenCart через bridge',
      'readback-перевірка після публікації',
      measurement.sitemap ? 'sitemap audit підключено' : 'sitemap audit готовий до запуску',
      measurement.productAudit ? 'bulk OpenCart SEO audit підключено' : 'bulk OpenCart SEO audit готовий після оновлення bridge',
      measurement.gsc.configured ? 'Google Search Console підключено' : 'Google Search Console готовий до підключення'
    ],
    missingCapabilities: [
      !measurement.gsc.configured ? 'потрібні GSC credentials і доступ до property' : '',
      !measurement.productAudit ? 'потрібно завантажити оновлений bridge для audit усіх товарів' : '',
      !measurement.sitemap ? 'sitemap audit ще не запускався' : ''
    ].filter(Boolean),
    measurement,
    seoActions,
    products
  };
}

function startOfCurrentWeekMs() {
  const now = new Date();
  const day = now.getDay() || 7;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - day + 1);
  return start.getTime();
}

function directorTrackingActionId(message = {}) {
  const candidates = [message.actionId, message.campaignId, message.segmentId].map(value => String(value || '').trim());
  return candidates.find(value => value.startsWith('director-')) || '';
}

function directorOrderKey(order, email = '') {
  return String(order?.order_id || order?.id || `${email}-${order?.date_added || order?.date || ''}-${order?.total || ''}`);
}

function latestUniqueDirectorEntries(entries = []) {
  const sorted = (Array.isArray(entries) ? entries : [])
    .slice()
    .sort((a, b) => (Date.parse(b.createdAt || '') || 0) - (Date.parse(a.createdAt || '') || 0));
  const byAction = new Map();
  for (const entry of sorted) {
    const key = String(entry.actionId || entry.id || '').trim();
    if (!key || byAction.has(key)) continue;
    byAction.set(key, entry);
  }
  return [...byAction.values()];
}

function buildDirectorEmailAttribution(orders = [], options = {}) {
  const sinceMs = Number(options.sinceMs || 0);
  const untilMs = Number(options.untilMs || Date.now() + 86400000);
  const sentStatuses = new Set(['smtp_accepted', 'opened', 'clicked']);
  const messages = (readEmailTracking().messages || [])
    .filter(message => directorTrackingActionId(message))
    .filter(message => {
      const ts = parseStoreDateMs(message.sentAt || message.createdAt || '');
      return (!sinceMs || ts >= sinceMs) && (!untilMs || ts <= untilMs);
    });

  const orderByEmail = new Map();
  for (const order of orders || []) {
    const email = normalizeEmail(order.email).toLowerCase();
    if (!email) continue;
    if (!orderByEmail.has(email)) orderByEmail.set(email, []);
    orderByEmail.get(email).push(order);
  }
  for (const list of orderByEmail.values()) {
    list.sort((a, b) => parseStoreDateMs(a.date_added || a.date) - parseStoreDateMs(b.date_added || b.date));
  }

  const attributedOrders = new Set();
  const buyerEmails = new Set();
  let ordersAfter = 0;
  let revenueAfter = 0;
  let latestActivityAt = '';

  for (const message of messages) {
    const lastActivity = message.lastClickedAt || message.lastOpenedAt || message.sentAt || message.failedAt || message.createdAt || '';
    if (lastActivity > latestActivityAt) latestActivityAt = lastActivity;
    if (!sentStatuses.has(message.status)) continue;
    const email = normalizeEmail(message.to).toLowerCase();
    const sentAtMs = parseStoreDateMs(message.sentAt || message.createdAt || '');
    if (!email || !sentAtMs) continue;
    const attributionWindowMs = sentAtMs + 30 * 86400000;
    const matchingOrders = (orderByEmail.get(email) || []).filter(order => {
      const orderMs = parseStoreDateMs(order.date_added || order.date || '');
      return orderMs >= sentAtMs && orderMs <= attributionWindowMs;
    });
    for (const order of matchingOrders) {
      const key = directorOrderKey(order, email);
      if (attributedOrders.has(key)) continue;
      attributedOrders.add(key);
      buyerEmails.add(email);
      ordersAfter += 1;
      revenueAfter += Number(order.total || 0);
    }
  }

  const sent = messages.filter(message => sentStatuses.has(message.status)).length;
  return {
    total: messages.length,
    sent,
    opened: messages.filter(message => Number(message.openCount || 0) > 0).length,
    clicked: messages.filter(message => Number(message.clickCount || 0) > 0).length,
    failed: messages.filter(message => message.status === 'failed').length,
    orders: ordersAfter,
    buyers: buyerEmails.size,
    revenue: Math.round(revenueAfter),
    revenuePerSent: sent ? Math.round(revenueAfter / sent) : 0,
    latestActivityAt
  };
}

function buildDirectorDecisionMetrics({ orders = [], emailIntelligence = {} } = {}) {
  const entries = readActionLog().entries
    .filter(entry => String(entry.source || '') === 'director_briefing' || String(entry.actionId || '').startsWith('director-'));
  const decisionEntries = entries.filter(entry => ['started', 'done', 'deferred', 'dismissed'].includes(String(entry.status || '')));
  const latestDecisionEntries = latestUniqueDirectorEntries(decisionEntries);
  const weekStartMs = startOfCurrentWeekMs();
  const thisWeek = latestDecisionEntries.filter(entry => {
    const ts = Date.parse(entry.createdAt || '') || 0;
    return ts >= weekStartMs;
  });
  const emailThisWeek = buildDirectorEmailAttribution(orders, { sinceMs: weekStartMs });
  const emailAllTime = buildDirectorEmailAttribution(orders);
  const countStatus = (status) => thisWeek.filter(entry => entry.status === status).length;
  const target = 5;
  const done = countStatus('done');
  const total = thisWeek.length;
  return {
    weekStart: new Date(weekStartMs).toISOString(),
    weekStartLocal: new Date(weekStartMs).toLocaleDateString('uk-UA'),
    target,
    total,
    done,
    started: countStatus('started'),
    deferred: countStatus('deferred'),
    dismissed: countStatus('dismissed'),
    uniquePeople: new Set(thisWeek.map(entry => entry.actionId).filter(Boolean)).size,
    allTime: latestDecisionEntries.length,
    completionRate: total ? Math.round((done / total) * 100) : 0,
    emailThisWeek,
    emailAllTime,
    calibration: emailIntelligence.calibration || null,
    readiness: done >= target
      ? 'Сигнал готовності є: 5+ виконаних директорських рішень за тиждень.'
      : `Потрібно ще ${Math.max(0, target - done)} виконаних рішень до мінімального продуктового сигналу.`,
    attributionNote: emailThisWeek.sent
      ? 'Замовлення рахуються консервативно: той самий email зробив замовлення протягом 30 днів після director-листа.'
      : 'Гроші зʼявляться після першої директорської відправки з привʼязаним actionId.'
  };
}

function buildCommandCenter({ stats = {}, retention, orders = [] }) {
	  const segments = retention.segments || [];
	  const byId = Object.fromEntries(segments.map(segment => [segment.id, segment]));
	  const topProducts = retention.topProducts || [];
	  const emailIntelligence = buildEmailIntelligence(orders);
	  const customerIntelligence = buildCustomerIntelligence(retention);
	  const businessBrain = buildBusinessBrain({ stats, retention, orders, emailIntelligence, customerIntelligence });
  const productSeo = buildProductSeoCockpit({ retention, businessBrain });
  const productMatrix = buildProductMatrix({ orders });
  const directorMetrics = buildDirectorDecisionMetrics({ orders, emailIntelligence });
  const directorIssues = buildDirectorIssuesSummary();
  const actions = [];
  const add = (action) => actions.push({
    id: action.id,
    priority: action.priority || 'medium',
    title: action.title,
    why: action.why,
    expectedImpact: action.expectedImpact || '',
    modules: action.modules || [],
    data: action.data || [],
    productOpportunities: action.productOpportunities || [],
    emailTracking: action.emailTracking || null,
    log: action.log || null,
    primaryAction: action.primaryAction || null,
    secondaryAction: action.secondaryAction || null
  });

  const matrixPriority = productMatrix.topOpportunities?.[0];
  if (matrixPriority) {
    const moneyLabel = matrixPriority.potentialRevenue
      ? `${formatMoney(matrixPriority.potentialRevenue)} потенціалу`
      : 'потенціал потрібно уточнити';
    add({
      id: `business-dna-${matrixPriority.status}-${crypto.createHash('sha1').update(matrixPriority.key || matrixPriority.name || 'matrix').digest('hex').slice(0, 8)}`,
      priority: matrixPriority.status === 'money_leak' || matrixPriority.status === 'seo_hole' ? 'high' : 'medium',
      title: `${matrixPriority.label}: ${matrixPriority.name}`,
      why: `Матриця товарів поєднала GSC і OpenCart: ${Number(matrixPriority.gsc?.impressions || 0).toLocaleString('uk')} показів, ${Number(matrixPriority.gsc?.clicks || 0).toLocaleString('uk')} кліків, ${Number(matrixPriority.sales?.orders || 0).toLocaleString('uk')} замовлень.`,
      expectedImpact: `${matrixPriority.action}. Орієнтир: ${moneyLabel}.`,
      modules: ['Business DNA', 'SEO', 'OpenCart', 'Конверсія'],
      data: [
        `CTR: ${seoCtrLabel(matrixPriority.gsc?.ctr || 0)}`,
        `Позиція: ${Number(matrixPriority.gsc?.position || 0).toFixed(1)}`,
        `SEO score: ${Number(matrixPriority.seo?.score || 0).toLocaleString('uk')}/100`,
        `Продажі: ${Number(matrixPriority.sales?.orders || 0).toLocaleString('uk')} замовлень / ${formatMoney(matrixPriority.sales?.revenue || 0)}`
      ],
      primaryAction: { label: 'Виправити зараз', tab: 'generate', productName: matrixPriority.name, url: matrixPriority.url },
      secondaryAction: { label: 'Показати матрицю', tab: 'command' }
    });
  }

  if (byId.at_risk?.count) {
    const s = byId.at_risk;
    add({
      id: 'retain-at-risk',
      priority: 'high',
      title: `${s.count} клієнтів вийшли за свій цикл покупки`,
      why: `Це не правило “60+ днів”. Система порівняла паузу кожного клієнта з його власною періодичністю замовлень в OpenCart. Сегмент має ${Math.round(s.revenue || 0).toLocaleString('uk')} грн історичної виручки.`,
      expectedImpact: 'Повернення навіть кількох клієнтів може швидко окупити кампанію, але писати варто тільки тим, у кого пауза стала аномальною.',
      modules: ['Клієнти', 'Email', 'Купони', 'Товари'],
      data: [
        `Середній чек: ${Math.round(s.avgOrderValue || 0).toLocaleString('uk')} грн`,
        `Тригери: ${(s.triggers || []).map(t => `${t.label}: ${t.count}`).join(', ') || '-'}`,
        `Товари-магніти: ${(s.topProducts || []).slice(0, 3).map(p => p.name).join(', ') || '-'}`
      ],
      primaryAction: { label: 'Підготувати реактивацію', tab: 'email', segmentId: 'at_risk' },
      secondaryAction: { label: 'Подивитись клієнтів', tab: 'customers' },
      emailTracking: buildEmailTrackingSummary({ actionId: 'retain-at-risk', segmentId: 'at_risk' })
    });
  }

	  if (byId.new_customers?.count) {
    const s = byId.new_customers;
    add({
      id: 'second-purchase',
      priority: 'high',
      title: `${s.count} нових клієнтів без повторної звички`,
      why: 'Друга покупка часто важливіша за першу: після неї клієнт починає сприймати магазин як регулярне джерело кави.',
      expectedImpact: 'Welcome follow-up + рекомендація схожого товару підвищують шанс повторної покупки.',
      modules: ['Замовлення', 'Email', 'Рекомендації', 'Купони'],
      data: [
        `Середній чек: ${Math.round(s.avgOrderValue || 0).toLocaleString('uk')} грн`,
        `Теги: ${(s.preferenceTags || []).slice(0, 4).join(', ') || '-'}`,
        `Перші рекомендації: ${(s.topProducts || []).slice(0, 3).map(p => p.name).join(', ') || '-'}`
      ],
      primaryAction: { label: 'Створити follow-up', tab: 'email', segmentId: 'new_customers' },
      secondaryAction: { label: 'Перевірити замовлення', tab: 'orders' },
      emailTracking: buildEmailTrackingSummary({ actionId: 'second-purchase', segmentId: 'new_customers' })
    });
	  }

	  if (customerIntelligence.readyToBuy) {
	    const s = byId.replenishment_due;
	    add({
	      id: 'customer-replenishment-now',
	      priority: 'high',
	      title: `${customerIntelligence.readyToBuy} клієнтів близько до наступної покупки`,
	      why: 'Це не холодна реактивація: система бачить клієнтів, які наблизились до власного циклу повторного замовлення або вже трохи його пропустили.',
	      expectedImpact: 'Найкращий момент для персонального нагадування: висока доречність без знижкового тиску.',
	      modules: ['Клієнти', 'Прогноз', 'Email', 'Рекомендації'],
	      data: [
	        `Орієнтовний потенціал: ${Math.round(customerIntelligence.forecastRevenue || 0).toLocaleString('uk')} грн`,
	        `Прострочили свій цикл: ${Number(customerIntelligence.overdue || 0).toLocaleString('uk')}`,
	        `Наближаються до покупки: ${Number(customerIntelligence.dueSoon || 0).toLocaleString('uk')}`,
	        `Товари для нагадування: ${(customerIntelligence.topDueProducts || []).slice(0, 3).map(p => p.name).join(', ') || '-'}`
	      ],
	      primaryAction: { label: 'Підготувати нагадування', tab: 'email', segmentId: s?.count ? 'replenishment_due' : 'loyal_recent' },
	      secondaryAction: { label: 'Подивитись клієнтів', tab: 'customers' }
	    });
	  }

  if (byId.vip?.count) {
    const s = byId.vip;
    add({
      id: 'vip-premium',
      priority: 'medium',
      title: `${s.count} VIP клієнти потребують окремої пропозиції`,
      why: 'Це не сегмент для агресивних знижок. Їм краще давати ранній доступ, рідкісні лоти, персональні добірки.',
      expectedImpact: 'Підвищення LTV без знижкового тиску.',
      modules: ['Клієнти', 'Товари', 'Email', 'Реклама'],
      data: [
        `Історична виручка: ${Math.round(s.revenue || 0).toLocaleString('uk')} грн`,
        `RFM: ${s.rfmAvg || '-'}/15`,
        `Товари: ${(s.topProducts || []).slice(0, 3).map(p => p.name).join(', ') || '-'}`
      ],
      primaryAction: { label: 'Підготувати VIP лист', tab: 'email', segmentId: 'vip' },
      secondaryAction: { label: 'Зробити рекламний кут', tab: 'ads' },
      emailTracking: buildEmailTrackingSummary({ actionId: 'vip-premium', segmentId: 'vip' })
    });
  }

  if (topProducts.length) {
    add({
      id: 'top-products-content-loop',
      priority: 'medium',
      title: 'Топ товари мають пройти SEO production loop',
      why: 'SEO тут не просто текст. Для товарів із попитом потрібен цикл: прочитати поточну картку, зібрати SEO-пакет, записати в OpenCart, зробити readback і потім використати цей самий товар в email/ads.',
      expectedImpact: 'Краща товарна сторінка, зрозуміліший organic entry point і сильніші рекомендації в retention.',
      modules: ['Генерація', 'SEO', 'Email', 'Реклама'],
      data: topProducts.slice(0, 5).map(p => `${p.name}: ${p.count}`),
      productOpportunities: topProducts.slice(0, 5).map(p => ({
        name: p.name,
        count: Number(p.count || 0),
        why: 'Товар уже має попит, тому його title/meta/H1/опис, атрибути, email-рекомендації й рекламні angles мають працювати разом.'
      })),
      primaryAction: { label: 'Відкрити SEO loop', tab: 'generate' },
      secondaryAction: { label: 'Порівняти конкурентів', tab: 'analysis' }
    });
  }

  if (byId.sleeping?.count) {
    const s = byId.sleeping;
    add({
      id: 'sleeping-cleanup',
      priority: 'low',
      title: `${s.count} сплячих клієнтів: потрібна обережна реактивація`,
      why: 'Цей сегмент великий, але холодний. Його не варто атакувати масово без лімітів, тестів і частотних правил.',
      expectedImpact: 'Малий тест покаже, чи є сенс масштабувати winback.',
      modules: ['Email', 'Купони', 'Планування', 'Безпека'],
      data: [
        `Ліміт отримувачів у системі: ${(s.recipients || []).length}`,
        'Рекомендовано: тест 20-50 листів',
        'Обовʼязково: тест собі + unsubscribe'
      ],
      primaryAction: { label: 'Підготувати малий тест', tab: 'email', segmentId: 'sleeping' },
      secondaryAction: { label: 'Перевірити план', tab: 'email' },
      emailTracking: buildEmailTrackingSummary({ actionId: 'sleeping-cleanup', segmentId: 'sleeping' })
    });
  }

  const moneyMissions = buildMoneyMissions({ retention, emailIntelligence, customerIntelligence, businessBrain });
  const ownerBrief = buildOwnerBrief({ retention, emailIntelligence, customerIntelligence, businessBrain, moneyMissions });
	  const directorBriefing = buildDirectorBriefing({ retention, emailIntelligence, customerIntelligence, businessBrain, moneyMissions, seoActions: productSeo.seoActions || [] });
	  directorBriefing.directorMetrics = directorMetrics;
  directorBriefing.directorIssues = directorIssues;
  const latestMemory = latestMemoryByActionId();
  actions.forEach(action => {
    action.log = latestMemory[action.id] || action.log || null;
  });
  moneyMissions.forEach(mission => {
    mission.log = latestMemory[mission.id] || null;
  });

  return {
    generatedAt: new Date().toLocaleString('uk-UA'),
    stats: {
      customers: stats.totalCustomers || retention.totals.customers,
      orders: stats.totalOrders || retention.totals.orders,
      revenue: stats.totalRevenue || retention.totals.revenue,
      avgOrderValue: stats.avgOrderValue || retention.totals.avgOrderValue
    },
    summary: {
      segments: segments.length,
      moneyMissions: moneyMissions.length,
      actions: actions.length,
      highPriority: actions.filter(a => a.priority === 'high').length,
      productMatrix: productMatrix.summary
    },
    retention: {
      totals: retention.totals || {},
      topProducts: (retention.topProducts || []).slice(0, 8),
      segments: segments.map(segment => ({
        id: segment.id,
        title: segment.title,
        count: segment.count,
        revenue: segment.revenue,
        avgOrderValue: segment.avgOrderValue,
        topProducts: (segment.topProducts || []).slice(0, 4),
        preferenceTags: (segment.preferenceTags || []).slice(0, 6)
      }))
    },
	    businessBrain,
	    directorBriefing,
	    ownerBrief,
	    moneyMissions,
    productMatrix,
    productSeo,
    directorMetrics,
    directorIssues,
	    customerIntelligence,
	    emailIntelligence,
    monitoring: buildMonitoringSummary(),
    actions
  };
}

function orderDateMs(order) {
  return parseStoreDateMs(order?.date_added || order?.date || '');
}

function splitOrderProducts(value) {
  return String(value || '')
    .split(/\s*\|\|\s*|\s*,\s*/)
    .map(item => item.trim())
    .filter(Boolean);
}

function buildBusinessBrain({ stats = {}, retention = {}, orders = [], emailIntelligence = {}, customerIntelligence = {} }) {
  const now = Date.now();
  const validOrders = (orders || []).filter(order => orderDateMs(order)).sort((a, b) => orderDateMs(b) - orderDateMs(a));
  const revenueWindow = (days) => validOrders
    .filter(order => now - orderDateMs(order) <= days * 86400000)
    .reduce((sum, order) => sum + Number(order.total || 0), 0);
  const ordersWindow = (days) => validOrders.filter(order => now - orderDateMs(order) <= days * 86400000).length;
  const recentProducts = validOrders
    .slice(0, 200)
    .flatMap(order => splitOrderProducts(order.products_list));
  const productLeaders = topItemsFromProducts(recentProducts, 6);
  const segments = retention.segments || [];
  const byId = Object.fromEntries(segments.map(segment => [segment.id, segment]));
  const atRiskRevenue = Number(byId.at_risk?.revenue || 0) + Number(byId.sleeping?.revenue || 0);
  const insights = [];

  if (emailIntelligence?.ordered) {
    insights.push({
      id: 'email-revenue-proof',
      priority: 'high',
      title: 'Email уже дав підтверджені замовлення',
      signal: `${Number(emailIntelligence.ordered || 0).toLocaleString('uk')} покупці після листа, ${Math.round(Number(emailIntelligence.revenueAfterCampaign || 0)).toLocaleString('uk')} грн`,
      why: 'Це не метрика відкриттів, а фактичні замовлення в OpenCart після відправки на той самий email.',
      next: 'Закріпити це як campaign workflow: список отримувачів, купон, follow-up і stop-list для тих, хто вже купив.',
      action: { label: 'Подивитись Email intelligence', tab: 'command' }
    });
  }

	  if (atRiskRevenue > 0) {
    insights.push({
      id: 'retention-money-at-risk',
      priority: 'high',
      title: 'Гроші лежать у повторній покупці',
      signal: `${Math.round(atRiskRevenue).toLocaleString('uk')} грн історичної виручки у ризику/сплячих клієнтах`,
      why: 'Ці люди вже довірилися Mercato. Повернення навіть малої частини зазвичай дешевше, ніж новий трафік.',
      next: 'Розділити winback: теплі at-risk окремо, холодні sleeping окремо, без масової атаки одним листом.',
      action: { label: 'Підготувати retention-сценарій', tab: 'email', segmentId: byId.at_risk?.count ? 'at_risk' : 'sleeping' }
    });
	  }

	  if (customerIntelligence.readyToBuy) {
	    insights.push({
	      id: 'customer-replenishment-window',
	      priority: 'high',
	      title: 'Є клієнти у вікні повторної покупки',
	      signal: `${Number(customerIntelligence.readyToBuy || 0).toLocaleString('uk')} клієнтів, потенціал ~${Math.round(Number(customerIntelligence.forecastRevenue || 0)).toLocaleString('uk')} грн`,
	      why: 'Це найтепліші дії: не треба переконувати з нуля, треба вчасно нагадати про улюблений або близький товар.',
	      next: 'Запустити маленьку персональну хвилю для сегмента “Час повторної покупки” і не чіпати тих, хто купив після листа.',
	      action: { label: 'Підготувати нагадування', tab: 'email', segmentId: 'replenishment_due' }
	    });
	  }

  if (productLeaders.length) {
    insights.push({
      id: 'product-demand-loop',
      priority: 'medium',
      title: 'Товари з попитом мають стати центром контенту',
      signal: productLeaders.slice(0, 3).map(item => `${item.name} x${item.count}`).join(', '),
      why: 'Те, що вже купують, має отримувати найкращу SEO-картку, рекомендації в email і рекламні angles.',
      next: 'Взяти перший товар зі списку, прочитати його БД-стан, оновити SEO/атрибути і перевірити readback.',
      action: { label: 'Оновити топ товар', tab: 'generate', productName: productLeaders[0].name }
    });
  }

  if (emailIntelligence?.publicTrackingConfigured === false) {
    insights.push({
      id: 'tracking-blind-spot',
      priority: 'medium',
      title: 'Є сліпа зона в tracking',
      signal: 'PUBLIC_BASE_URL не налаштований',
      why: 'Замовлення після листа видно через OpenCart, але відкриття й кліки реальних клієнтів не будуть коректними з localhost.',
      next: 'Підключити публічний tracking URL, щоб бачити не лише покупки, а й поведінку до покупки.',
      action: { label: 'Перевірити tracking', tab: 'email' }
    });
  }

  const metrics = {
    sampleOrders: validOrders.length,
    revenue1d: Math.round(revenueWindow(1)),
    revenue7d: Math.round(revenueWindow(7)),
    revenue30d: Math.round(revenueWindow(30)),
    orders1d: ordersWindow(1),
    orders7d: ordersWindow(7),
    orders30d: ordersWindow(30),
	    avgOrderValue: Number(stats.avgOrderValue || retention.totals?.avgOrderValue || 0),
	    atRiskRevenue: Math.round(atRiskRevenue),
	    emailRevenue: Math.round(Number(emailIntelligence.revenueAfterCampaign || 0)),
	    replenishmentCustomers: Number(customerIntelligence.readyToBuy || 0),
	    replenishmentRevenue: Math.round(Number(customerIntelligence.forecastRevenue || 0))
	  };

  return {
    title: 'Що зараз найкраще зробити бізнесу і чому',
    metrics,
    productLeaders,
    insights: insights.slice(0, 6)
  };
}

// Batch-підготовка персональних email-драфтів для клієнтів сегмента
app.post('/generate-email-batch', async (req, res) => {
  try {
    const { segment, limit = 5, tone, discount } = req.body;
    if (!segment?.batchPreview?.length) return res.status(400).json({ error: 'Оберіть сегмент із клієнтами' });

    const customers = segment.batchPreview.slice(0, Math.min(Number(limit) || 5, 10));
    const emailSafety = await buildEmailInventoryGuard({ productOffer: segment.offerHint || '', segmentData: segment });
    const message = await client.messages.create({
      provider: EMAIL_AI_PROVIDER,
      fallback: false,
      model: 'claude-sonnet-4-6',
      max_tokens: 5000,
      messages: [{
        role: 'user',
        content: `Ти — retention-маркетолог Mercato. Зроби персональні email-драфти для клієнтів сегмента.

Сегмент:
${JSON.stringify({
  title: segment.title,
  description: segment.description,
  goal: segment.goal,
  offerHint: segment.offerHint,
  campaignBrief: segment.campaignBrief || req.body?.campaignBrief || null,
  rfmAvg: segment.rfmAvg,
  triggers: segment.triggers,
  topProducts: segment.topProducts,
  adAudience: segment.adAudience
}, null, 2)}

Клієнти:
${JSON.stringify(customers, null, 2)}

Тон: ${tone || 'теплий, експертний, без тиску'}
Знижка/бонус: ${discount || 'якщо доречно, запропонуй мʼякий персональний бонус'}

${emailSafety.prompt}

Правила:
- Мова тільки українська.
- Власника Mercato звати ${STORE_OWNER_NAME}; лист не може бути від Олега, Олексія, Алексія або будь-якого іншого імені. Якщо потрібен підпис — тільки "${STORE_OWNER_SIGNATURE}".
- Не вигадуй особисті факти поза даними.
- Не згадуй RFM прямо клієнту.
- Якщо spam.canEmail=false — не пиши лист, поверни reason.
- Кожен лист має бути персональним за історією покупок/рекомендацією/тригером.
- Конкретний товар можна пропонувати тільки якщо inventory guard підтвердив IN_STOCK; UNKNOWN і OUT_OF_STOCK не пропонувати як CTA.
- Основна рекомендація для кожного клієнта: 1-2 сорти або категорії, близькі до його смакового профілю. Дивись на куплені товари, країну, спосіб заварювання, смак, чай/кава.
- Decaf / каву без кофеїну не пропонуй за замовчуванням. Decaf доречний тільки якщо в конкретного клієнта є явна історія decaf/без кофеїну.
- Для decaf / кави без кофеїну не пропонуй кофеїнові лоти як альтернативу.
- Додай unsubscribeNote як нагадування для бізнесу, не в тіло листа.
- Не використовуй технічні placeholder-и у тілі листа: жодних {{first_name}}, {{purchased_product}} або схожих змінних.
- Додай ctaUrl: якщо є конкретна товарна/категорійна URL — її, інакше https://mercato.com.ua/.

Поверни ТІЛЬКИ валідний JSON:
{
  "segmentTitle": "${segment.title || ''}",
  "drafts": [
    {
      "customerId": 0,
      "name": "",
      "email": "",
      "canSend": true,
      "reason": "",
      "subject": "до 55 символів",
      "preheader": "до 90 символів",
      "body": "готовий лист 700-1100 символів",
      "cta": "короткий CTA",
      "ctaUrl": "https://mercato.com.ua/ або конкретний URL",
      "personalOffer": "що саме пропонуємо",
      "unsubscribeNote": "додати посилання відписки перед відправкою"
    }
  ]
}`
      }]
    });

    const data = await parseAiJson(message.content[0].text.trim(), 'generate-email-batch');
    if (Array.isArray(data?.drafts)) {
      const guardAdapter = { emails: data.drafts.map(draft => ({
        subject: draft.subject,
        preheader: draft.preheader,
        body: draft.body,
        cta: draft.cta,
        ctaUrl: draft.ctaUrl,
        whyItWorks: draft.personalOffer || ''
      })) };
      applyEmailSafetyGuards(guardAdapter, emailSafety);
      data.drafts.forEach((draft, index) => {
        const guarded = guardAdapter.emails[index] || {};
        if (!draft.cta) draft.cta = 'Перейти на Mercato';
        if (!draft.ctaUrl) draft.ctaUrl = 'https://mercato.com.ua/';
        draft.subject = guarded.subject || draft.subject;
        draft.preheader = guarded.preheader || draft.preheader;
        draft.body = guarded.body || draft.body;
        draft.cta = guarded.cta || draft.cta;
        draft.ctaUrl = guarded.ctaUrl || draft.ctaUrl;
        draft.personalOffer = guarded.whyItWorks || draft.personalOffer;
        draft.body = replaceEmailPlaceholders(draft.body, {
          firstName: String(draft.name || '').trim().split(/\s+/)[0] || '',
          purchasedProduct: draft.personalOffer || ''
        });
        draft.body = sanitizeOwnerNameInText(draft.body);
        draft.subject = sanitizeOwnerNameInText(draft.subject);
        draft.preheader = sanitizeOwnerNameInText(draft.preheader);
      });
    }
    data.notes = Array.isArray(data.notes) ? data.notes : [];
    data.notes.push(`Safety guard: власник ${STORE_OWNER_NAME}; конкретні товари тільки IN_STOCK; decaf не змішуємо з кофеїновою кавою.`);
    res.json(data);
  } catch (error) {
    console.error('Помилка batch email:', error.message);
    if (isRecoverableAiGenerationError(error)) {
      const { segment, limit = 5, discount } = req.body || {};
      const customers = Array.isArray(segment?.batchPreview)
        ? segment.batchPreview.slice(0, Math.min(Number(limit) || 5, 10))
        : [];
      return res.json(buildLocalEmailBatchFallback({ segment, customers, discount, aiError: error }));
    }
    res.status(500).json({ error: error.message });
  }
});

function generateCouponCode(prefix = 'MRC') {
  const cleanPrefix = String(prefix || 'MRC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'MRC';
  const suffixLength = Math.max(3, 10 - cleanPrefix.length);
  const suffix = Math.random().toString(36).slice(2).toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(suffixLength, '0').slice(0, suffixLength);
  return `${cleanPrefix}${suffix}`.slice(0, 10);
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.startsWith('0')) return `38${digits}`;
  if (digits.length === 12 && digits.startsWith('380')) return digits;
  if (digits.length >= 9 && digits.length <= 15) return digits;
  return '';
}

function firstOrderPopupContactKey({ email = '', phone = '' } = {}) {
  const cleanEmail = normalizeEmail(email).toLowerCase();
  if (cleanEmail) return `email:${cleanEmail}`;
  const cleanPhone = normalizePhone(phone);
  if (cleanPhone) return `phone:${cleanPhone}`;
  return '';
}

function firstOrderPopupPageExcluded(urlOrPath = '') {
  const raw = String(urlOrPath || '');
  let pathName = raw;
  try {
    pathName = new URL(raw, 'https://mercato.com.ua').pathname;
  } catch {}
  const pathLower = decodeURIComponent(pathName).toLowerCase();
  return /\/(?:checkout|payment|success|account)(?:\/|$)/i.test(pathLower)
    || /(?:horeca|ho-re-ca|hоreca|хорека)/i.test(pathLower)
    || /(?:\/opt(?:\/|$)|optom|опт|corporate|korporatyv|корпоратив)/i.test(pathLower);
}

function firstOrderPopupDeviceFromRequest(req, explicit = '') {
  const clean = String(explicit || '').trim().toLowerCase();
  if (['desktop', 'mobile', 'tablet'].includes(clean)) return clean;
  const ua = String(req?.get?.('user-agent') || '').toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod/.test(ua)) return 'mobile';
  return 'desktop';
}

function firstOrderPopupUtmPayload(source = {}) {
  const pick = key => String(source?.[key] || '').trim().slice(0, 250);
  return {
    utm_source: pick('utm_source'),
    utm_medium: pick('utm_medium'),
    utm_campaign: pick('utm_campaign'),
    utm_content: pick('utm_content'),
    utm_term: pick('utm_term'),
    gclid: pick('gclid')
  };
}

const DEFAULT_FIRST_ORDER_POPUP_CONFIG = {
  version: 1,
  enabled: false,
  campaignId: 'first_order_discount',
  publicBaseUrl: '',
  cooldownDays: 7,
  first: {
    prefix: 'F10',
    discount: 10,
    minTotal: 600,
    validDays: 3
  },
  second: {
    prefix: 'F15',
    discount: 15,
    minTotal: 800,
    validDays: 23
  },
  triggers: {
    timeMinSeconds: 10,
    timeMaxSeconds: 15,
    scrollPercent: 40,
    exitIntentDesktop: true
  },
  text: {
    title: '-10% на перше замовлення',
    subtitle: 'Залиште email або телефон — надішлемо персональний промокод',
    emailPlaceholder: 'Email',
    phonePlaceholder: 'Телефон',
    consent: 'Погоджуюсь отримати персональний промокод та повідомлення від Mercato',
    submit: 'Отримати промокод',
    loading: 'Створюємо код...',
    successTitle: 'Дякуємо!',
    successIntro: 'Ваш промокод на перше замовлення:',
    successNote: 'Знижка -10% від 600 грн, дійсний 3 дні',
    copyButton: 'Скопіювати код',
    copiedButton: 'Скопійовано',
    legal: 'Промокод персональний, одноразовий і не сумується з іншими акціями, накопичувальними знижками, HoReCa, оптом або корпоративними умовами.',
    contactError: 'Вкажіть email або телефон.',
    consentError: 'Потрібна згода на отримання промокоду та повідомлень.'
  },
  exclusions: {
    pages: ['checkout', 'payment', 'success', 'account', 'horeca', 'ho-re-ca', 'opt', 'optom', 'corporate', 'korporatyv']
  },
  updatedAt: ''
};

function cloneFirstOrderPopupDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_FIRST_ORDER_POPUP_CONFIG));
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function popupText(value, fallback, maxLength = 700) {
  const clean = String(value || '').trim();
  return (clean || fallback || '').slice(0, maxLength);
}

function normalizeFirstOrderPopupConfig(raw = {}) {
  const base = cloneFirstOrderPopupDefaultConfig();
  const input = raw && typeof raw === 'object' ? raw : {};
  const first = input.first && typeof input.first === 'object' ? input.first : {};
  const second = input.second && typeof input.second === 'object' ? input.second : {};
  const triggers = input.triggers && typeof input.triggers === 'object' ? input.triggers : {};
  const text = input.text && typeof input.text === 'object' ? input.text : {};
  const exclusions = input.exclusions && typeof input.exclusions === 'object' ? input.exclusions : {};

  const config = {
    ...base,
    enabled: Boolean(input.enabled),
    campaignId: popupText(input.campaignId, base.campaignId, 80).replace(/[^a-z0-9_-]/gi, '') || base.campaignId,
    publicBaseUrl: popupText(input.publicBaseUrl, base.publicBaseUrl, 300).replace(/\/+$/, ''),
    cooldownDays: Math.round(clampNumber(input.cooldownDays, base.cooldownDays, 1, 60)),
    first: {
      prefix: popupText(first.prefix, base.first.prefix, 8).toUpperCase().replace(/[^A-Z0-9]/g, '') || base.first.prefix,
      discount: Math.round(clampNumber(first.discount, base.first.discount, 1, 99)),
      minTotal: Math.round(clampNumber(first.minTotal, base.first.minTotal, 0, 100000)),
      validDays: Math.round(clampNumber(first.validDays, base.first.validDays, 1, 90))
    },
    second: {
      prefix: popupText(second.prefix, base.second.prefix, 8).toUpperCase().replace(/[^A-Z0-9]/g, '') || base.second.prefix,
      discount: Math.round(clampNumber(second.discount, base.second.discount, 1, 99)),
      minTotal: Math.round(clampNumber(second.minTotal, base.second.minTotal, 0, 100000)),
      validDays: Math.round(clampNumber(second.validDays, base.second.validDays, 1, 120))
    },
    triggers: {
      timeMinSeconds: Math.round(clampNumber(triggers.timeMinSeconds, base.triggers.timeMinSeconds, 0, 120)),
      timeMaxSeconds: Math.round(clampNumber(triggers.timeMaxSeconds, base.triggers.timeMaxSeconds, 0, 180)),
      scrollPercent: Math.round(clampNumber(triggers.scrollPercent, base.triggers.scrollPercent, 1, 95)),
      exitIntentDesktop: triggers.exitIntentDesktop !== false
    },
    text: { ...base.text },
    exclusions: {
      pages: Array.isArray(exclusions.pages)
        ? exclusions.pages.map(item => popupText(item, '', 80)).filter(Boolean).slice(0, 40)
        : base.exclusions.pages
    },
    updatedAt: popupText(input.updatedAt, '', 80)
  };
  if (config.triggers.timeMaxSeconds < config.triggers.timeMinSeconds) {
    config.triggers.timeMaxSeconds = config.triggers.timeMinSeconds;
  }
  Object.keys(config.text).forEach(key => {
    config.text[key] = popupText(text[key], base.text[key]);
  });
  return config;
}

function readFirstOrderPopupConfig() {
  return normalizeFirstOrderPopupConfig(readJsonFile(FIRST_ORDER_POPUP_CONFIG_PATH, cloneFirstOrderPopupDefaultConfig()));
}

function writeFirstOrderPopupConfig(patch = {}) {
  const current = readFirstOrderPopupConfig();
  const input = patch && typeof patch === 'object' ? patch : {};
  const next = normalizeFirstOrderPopupConfig({
    ...current,
    ...input,
    first: { ...current.first, ...(input.first || {}) },
    second: { ...current.second, ...(input.second || {}) },
    triggers: { ...current.triggers, ...(input.triggers || {}) },
    text: { ...current.text, ...(input.text || {}) },
    exclusions: { ...current.exclusions, ...(input.exclusions || {}) },
    updatedAt: new Date().toISOString()
  });
  writeJsonFile(FIRST_ORDER_POPUP_CONFIG_PATH, next);
  return next;
}

function publicFirstOrderPopupConfig(config = readFirstOrderPopupConfig()) {
  return {
    ok: true,
    enabled: Boolean(config.enabled),
    campaignId: config.campaignId,
    cooldownDays: config.cooldownDays,
    first: config.first,
    triggers: config.triggers,
    text: config.text,
    exclusions: config.exclusions,
    updatedAt: config.updatedAt
  };
}

function readFirstOrderPopupLeadsFile() {
  const data = readJsonFile(FIRST_ORDER_POPUP_LEADS_PATH, { leads: [] });
  return { leads: Array.isArray(data.leads) ? data.leads : [] };
}

function writeFirstOrderPopupLeadsFile(data = {}) {
  writeJsonFile(FIRST_ORDER_POPUP_LEADS_PATH, {
    version: 1,
    updatedAt: new Date().toISOString(),
    leads: (Array.isArray(data.leads) ? data.leads : []).slice(0, 10000)
  });
}

function firstOrderPopupLeadByContact(contactKey = '') {
  const key = String(contactKey || '').trim();
  if (!key) return null;
  const sqliteLead = operationalStore.readGrowthLeadByContact(key);
  if (sqliteLead) return sqliteLead;
  return readFirstOrderPopupLeadsFile().leads.find(item => item.contactKey === key) || null;
}

function firstOrderPopupLeads(limit = 500) {
  const sqliteData = operationalStore.readGrowthLeads(limit);
  if (sqliteData) return sqliteData.leads || [];
  return readFirstOrderPopupLeadsFile().leads.slice(0, Math.max(1, Math.min(Number(limit) || 500, 5000)));
}

function upsertFirstOrderPopupLead(lead = {}) {
  const contactKey = String(lead.contactKey || firstOrderPopupContactKey(lead)).trim();
  if (!contactKey) throw new Error('Lead contact key is empty');
  const existing = firstOrderPopupLeadByContact(contactKey) || {};
  const now = new Date().toISOString();
  const next = {
    ...existing,
    ...lead,
    id: lead.id || existing.id || `first-order-lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    contactKey,
    createdAt: lead.createdAt || existing.createdAt || now,
    updatedAt: now
  };
  const fileData = readFirstOrderPopupLeadsFile();
  const index = fileData.leads.findIndex(item => item.contactKey === contactKey);
  if (index >= 0) fileData.leads[index] = next;
  else fileData.leads.unshift(next);
  writeFirstOrderPopupLeadsFile(fileData);
  operationalStore.upsertGrowthLead(next);
  return next;
}

function firstOrderPopupLeadFromRequest(req) {
  const body = req.body || {};
  const contactRaw = String(body.contact || body.email || body.phone || '').trim();
  const email = normalizeEmail(body.email || (contactRaw.includes('@') ? contactRaw : ''));
  const phone = normalizePhone(body.phone || (!contactRaw.includes('@') ? contactRaw : ''));
  const contactKey = firstOrderPopupContactKey({ email, phone });
  const landingPage = String(body.landingPage || body.landing_page || body.pageUrl || body.url || '').trim().slice(0, 1000);
  const pageUrl = String(body.pageUrl || body.url || landingPage || '').trim().slice(0, 1000);
  const utm = firstOrderPopupUtmPayload({ ...(body.utm || {}), ...body });
  return {
    email,
    phone,
    contactKey,
    landingPage,
    pageUrl,
    referrer: String(body.referrer || '').trim().slice(0, 1000),
    device: firstOrderPopupDeviceFromRequest(req, body.device),
    consent: Boolean(body.consent),
    utm,
    gclid: utm.gclid
  };
}

async function firstOrderPopupExistingCustomerStatus({ email = '', phone = '' } = {}) {
  try {
    const data = await callBridge('growth_contact_status', { email, phone });
    return {
      ok: Boolean(data.ok),
      existingCustomer: Boolean(data.existing_customer),
      existingBuyer: Boolean(data.existing_buyer),
      existingLead: Boolean(data.existing_lead),
      blocked: Boolean(data.blocked),
      source: 'growth_contact_status',
      raw: data
    };
  } catch (error) {
    const exactEmail = normalizeEmail(email).toLowerCase();
    const exactPhone = normalizePhone(phone);
    const search = exactEmail || exactPhone;
    if (!search) return { ok: true, blocked: false, source: 'empty' };
    try {
      const data = await callBridge('customers', { search });
      const customers = Array.isArray(data.customers) ? data.customers : [];
      const exact = customers.find(customer => {
        const customerEmail = normalizeEmail(customer.email).toLowerCase();
        const customerPhone = normalizePhone(customer.telephone || customer.phone);
        return (exactEmail && customerEmail === exactEmail) || (exactPhone && customerPhone === exactPhone);
      });
      return {
        ok: true,
        existingCustomer: Boolean(exact),
        existingBuyer: Boolean(exact && Number(exact.order_count || 0) > 0),
        blocked: Boolean(exact),
        source: 'customers_fallback',
        bridgeWarning: explainBridgeError(error)
      };
    } catch (fallbackError) {
      return {
        ok: false,
        blocked: false,
        source: 'unavailable',
        bridgeWarning: explainBridgeError(error),
        fallbackWarning: explainBridgeError(fallbackError)
      };
    }
  }
}

async function syncFirstOrderPopupLeadToBridge(lead = {}) {
  const payload = {
    email: lead.email || '',
    phone: lead.phone || '',
    contact_key: lead.contactKey || firstOrderPopupContactKey(lead),
    status: lead.status || 'lead',
    first_coupon: lead.firstCoupon || '',
    second_coupon: lead.secondCoupon || '',
    used_promocode: lead.usedPromocode || '',
    first_order_id: lead.firstOrderId || '',
    second_order_id: lead.secondOrderId || '',
    landing_page: lead.landingPage || '',
    utms_json: JSON.stringify(lead.utm || {}),
    source: lead.source || 'first_order_popup',
    device: lead.device || '',
    gclid: lead.gclid || ''
  };
  return callBridge('growth_lead_upsert', payload, { timeoutMs: MERCHANT_BRIDGE_TIMEOUT_MS });
}

async function notifySecondCouponByEmail({ email = '', code = '', dateEnd = '', orderId = '' } = {}, req = null) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return { sent: false, channel: '', reason: 'email_missing' };
  if (!smtpConfigured()) return { sent: false, channel: 'email', reason: 'smtp_not_configured' };
  const minTotal = readFirstOrderPopupConfig().second.minTotal;
  const body = [
    'Дякуємо за перше замовлення в Mercato.',
    '',
    `Для наступного замовлення підготували персональний промокод ${code} на -15%.`,
    `Мінімальна сума замовлення: ${minTotal} грн.`,
    dateEnd ? `Код діє до ${dateEnd}.` : '',
    '',
    'Промокод персональний і не сумується з іншими акціями, накопичувальними знижками, HoReCa, оптом або корпоративними умовами.'
  ].filter(Boolean).join('\n');
  const info = await sendEmailMessage({
    to: cleanEmail,
    subject: 'Ваш персональний промокод -15% на наступне замовлення',
    preheader: `Промокод ${code} діє обмежений час.`,
    body,
    ctaLabel: 'Обрати каву або чай',
    ctaUrl: 'https://mercato.com.ua/',
    baseUrl: trackingBaseUrl(req),
    tracking: {
      campaign: 'first_order_popup_second_coupon',
      campaignId: orderId ? `order-${orderId}` : 'second-coupon',
      actionId: 'first-order-popup-second-coupon',
      segmentId: 'first_order_popup'
    }
  });
  return { sent: true, channel: 'email', trackingId: info.trackingId || '' };
}

function firstOrderPopupInstallSnippet(config = readFirstOrderPopupConfig()) {
  const base = (config.publicBaseUrl || process.env.PUBLIC_BASE_URL || process.env.TRACKING_BASE_URL || 'https://crm.mercato.com.ua').replace(/\/+$/, '');
  return `<script src="${base}/mercato-first-order-popup.js" async></script>`;
}

app.get('/api/first-order-popup/config', (req, res) => {
  res.json(publicFirstOrderPopupConfig());
});

app.get('/api/first-order-popup/admin-config', (req, res) => {
  const config = readFirstOrderPopupConfig();
  res.json({ ok: true, config, snippet: firstOrderPopupInstallSnippet(config) });
});

app.post('/api/first-order-popup/admin-config', (req, res) => {
  try {
    const config = writeFirstOrderPopupConfig(req.body?.config || req.body || {});
    res.json({ ok: true, config, public: publicFirstOrderPopupConfig(config), snippet: firstOrderPopupInstallSnippet(config) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || String(error) });
  }
});

app.get('/api/first-order-popup/leads', (req, res) => {
  const limit = Math.max(1, Math.min(Number(req.query.limit || 500) || 500, 5000));
  res.json({ ok: true, leads: firstOrderPopupLeads(limit) });
});

app.post('/api/first-order-popup/lead', async (req, res) => {
  try {
    const body = req.body || {};
    if (String(body.website || body.company || '').trim()) {
      return res.json({ ok: true, ignored: true });
    }
    const popupConfig = readFirstOrderPopupConfig();
    if (!popupConfig.enabled) {
      return res.status(403).json({ ok: false, reason: 'popup_disabled', error: 'Попап першого замовлення зараз вимкнений.' });
    }
    const leadInput = firstOrderPopupLeadFromRequest(req);
    if (!leadInput.consent) {
      return res.status(400).json({ ok: false, reason: 'consent_required', error: 'Потрібна згода на отримання персонального промокоду та повідомлень.' });
    }
    if (!leadInput.email && !leadInput.phone) {
      return res.status(400).json({ ok: false, reason: 'contact_required', error: 'Вкажіть email або телефон.' });
    }
    if (leadInput.pageUrl && firstOrderPopupPageExcluded(leadInput.pageUrl)) {
      return res.status(403).json({ ok: false, reason: 'excluded_page', error: 'Попап вимкнений для цієї сторінки.' });
    }
    const existingLead = firstOrderPopupLeadByContact(leadInput.contactKey);
    if (existingLead?.firstCoupon || existingLead?.status) {
      return res.status(409).json({ ok: false, reason: 'already_registered', error: 'Для цього контакту промокод уже створено.' });
    }

    const customerStatus = await firstOrderPopupExistingCustomerStatus(leadInput);
    if (customerStatus.blocked || customerStatus.existingCustomer || customerStatus.existingBuyer || customerStatus.existingLead) {
      return res.status(409).json({
        ok: false,
        reason: customerStatus.existingBuyer ? 'existing_buyer' : 'existing_customer',
        error: 'Ця пропозиція доступна тільки для нових відвідувачів.',
        customerStatus
      });
    }

    const first = popupConfig.first;
    const couponCode = generateCouponCode(first.prefix);
    const created = await callBridge('create_coupon', {
      code: couponCode,
      name: `Mercato first order popup ${leadInput.email || leadInput.phone}`,
      discount: first.discount,
      type: 'P',
      days: first.validDays,
      total: first.minTotal,
      uses_total: 1,
      uses_customer: 1,
      logged: 0
    });
    const lead = upsertFirstOrderPopupLead({
      ...leadInput,
      status: 'lead',
      source: 'first_order_popup',
      firstCoupon: created.code || couponCode,
      firstCouponId: created.coupon_id || created.id || '',
      firstCouponDiscount: first.discount,
      firstCouponMinTotal: first.minTotal,
      firstCouponDateEnd: created.date_end || '',
      secondCoupon: '',
      usedPromocode: '',
      events: [{
        name: 'first_discount_code_created',
        at: new Date().toISOString(),
        code: created.code || couponCode
      }]
    });
    let bridgeLeadSync = { ok: false, skipped: false };
    try {
      bridgeLeadSync = await syncFirstOrderPopupLeadToBridge(lead);
    } catch (syncError) {
      bridgeLeadSync = { ok: false, warning: explainBridgeError(syncError) };
      console.warn('first-order popup lead bridge sync failed:', syncError.message);
    }
    res.json({
      ok: true,
      code: lead.firstCoupon,
      discount: first.discount,
      minTotal: first.minTotal,
      currency: 'UAH',
      expiresAt: lead.firstCouponDateEnd,
      validDays: first.validDays,
      leadId: lead.id,
      bridgeLeadSync,
      events: ['popup_submit', 'first_discount_code_created']
    });
  } catch (error) {
    console.error('Помилка first-order popup lead:', error.message);
    res.status(500).json({ ok: false, error: explainBridgeError(error) });
  }
});

app.post('/api/first-order-popup/order-completed', async (req, res) => {
  try {
    const orderId = String(req.body?.orderId || req.body?.order_id || req.query.order_id || '').replace(/\D/g, '');
    if (!orderId) return res.status(400).json({ ok: false, error: 'order_id required' });
    const popupConfig = readFirstOrderPopupConfig();
    const secondDays = Math.max(21, Math.min(25, Number(req.body?.secondDays || req.body?.days || popupConfig.second.validDays) || popupConfig.second.validDays));
    const data = await callBridge('growth_order_complete', {
      order_id: orderId,
      first_prefix: popupConfig.first.prefix,
      second_prefix: popupConfig.second.prefix,
      second_discount: popupConfig.second.discount,
      second_days: secondDays,
      second_total: popupConfig.second.minTotal
    }, { timeoutMs: MERCHANT_BRIDGE_TIMEOUT_MS });
    let lead = null;
    if (data.lead?.contact_key) {
      lead = upsertFirstOrderPopupLead({
        contactKey: data.lead.contact_key,
        email: data.order?.email || data.lead.email || '',
        phone: data.order?.telephone || data.lead.phone || '',
        status: data.second_coupon_used ? 'second_order' : 'first_order',
        usedPromocode: data.first_coupon?.code || data.lead.used_promocode || '',
        firstCoupon: data.first_coupon?.code || data.lead.first_coupon || '',
        secondCoupon: data.second_coupon?.code || data.lead.second_coupon || '',
        secondCouponDateEnd: data.second_coupon?.date_end || data.lead.second_coupon_date_end || '',
        firstOrderId: orderId,
        source: 'first_order_popup',
        events: Array.isArray(data.events) ? data.events : []
      });
    }
    let notification = { sent: false, channel: '', reason: 'second_coupon_not_created' };
    if (data.second_coupon_created && data.second_coupon?.code) {
      try {
        notification = await notifySecondCouponByEmail({
          email: data.order?.email || '',
          code: data.second_coupon.code,
          dateEnd: data.second_coupon.date_end || '',
          orderId
        }, req);
      } catch (notifyError) {
        notification = { sent: false, channel: 'email', reason: explainSmtpError(notifyError) };
      }
    }
    res.json({ ok: true, bridge: data, lead, notification });
  } catch (error) {
    console.error('Помилка first-order popup order-completed:', error.message);
    res.status(500).json({ ok: false, error: explainBridgeError(error) });
  }
});

app.post('/api/first-order-popup/sync-second-coupons', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.body?.limit || req.query.limit || 25) || 25, 100));
    const days = Math.max(1, Math.min(Number(req.body?.days || req.query.days || 14) || 14, 90));
    const popupConfig = readFirstOrderPopupConfig();
    const secondDays = Math.max(21, Math.min(25, Number(popupConfig.second.validDays) || 23));
    const data = await callBridge('growth_second_coupon_sync', {
      first_prefix: popupConfig.first.prefix,
      second_prefix: popupConfig.second.prefix,
      second_discount: popupConfig.second.discount,
      second_days: secondDays,
      second_total: popupConfig.second.minTotal,
      limit,
      days
    }, { timeoutMs: MERCHANT_BRIDGE_TIMEOUT_MS });
    const notifications = [];
    for (const item of data.results || []) {
      if (!item.second_coupon_created || !item.second_coupon?.code) continue;
      if (item.lead?.contact_key) {
        upsertFirstOrderPopupLead({
          contactKey: item.lead.contact_key,
          email: item.order?.email || item.lead.email || '',
          phone: item.order?.telephone || item.lead.phone || '',
          status: 'first_order',
          usedPromocode: item.first_coupon?.code || '',
          firstCoupon: item.first_coupon?.code || item.lead.first_coupon || '',
          secondCoupon: item.second_coupon.code,
          secondCouponDateEnd: item.second_coupon.date_end || '',
          firstOrderId: item.order?.order_id || '',
          source: 'first_order_popup',
          events: Array.isArray(item.events) ? item.events : []
        });
      }
      try {
        notifications.push(await notifySecondCouponByEmail({
          email: item.order?.email || '',
          code: item.second_coupon.code,
          dateEnd: item.second_coupon.date_end || '',
          orderId: item.order?.order_id || ''
        }, req));
      } catch (notifyError) {
        notifications.push({ sent: false, channel: 'email', reason: explainSmtpError(notifyError) });
      }
    }
    res.json({ ok: true, bridge: data, notifications });
  } catch (error) {
    console.error('Помилка first-order popup sync:', error.message);
    res.status(500).json({ ok: false, error: explainBridgeError(error) });
  }
});

app.post('/email/create-coupon', async (req, res) => {
  try {
    const { customerName, discount = 10, type = 'P', days = 14, code } = req.body;
    const couponCode = String(code || generateCouponCode('MRC')).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (couponCode.length < 3 || couponCode.length > 12) {
      return res.status(400).json({ error: 'Код купона має містити від 3 до 12 символів для сумісності з OpenCart admin' });
    }
    const cleanup = await cleanupExpiredCouponsSafe({ prefix: 'MRC', mode: 'delete' });
    const data = await callBridge('create_coupon', {
      code: couponCode,
      name: `Mercato персональна знижка${customerName ? ` - ${customerName}` : ''}`,
      discount,
      type,
      days,
      uses_total: Number(req.body.uses_total || req.body.usesTotal || 1000),
      uses_customer: 1,
      logged: 0
    });
    res.json({ ...data, cleanup });
  } catch (error) {
    console.error('Помилка створення промокоду:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/email/repair-coupon', async (req, res) => {
  try {
    const { code, uses_total = 999, uses_customer = 1, days, date_end } = req.body || {};
    const couponCode = String(code || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!couponCode) return res.status(400).json({ error: 'Вкажіть код купона' });
    const data = await callBridge('repair_coupon', {
      code: couponCode,
      uses_total,
      uses_customer,
      days,
      date_end
    });
    res.json(data);
  } catch (error) {
    console.error('Помилка repair купона:', error.message);
    res.status(500).json({ error: explainBridgeError(error) });
  }
});

// Статистика магазину
app.get('/store/stats', async (req, res) => {
  try { res.json(await callBridge('stats')); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Список клієнтів
app.get('/store/customers', async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const search = String(req.query.search || '').trim();
    const sort = String(req.query.sort || 'last_order');
    const dir = String(req.query.dir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
    const data = await callBridge('customers', {
      page: req.query.page || 1,
      search,
      sort,
      dir
    });

    if (data.customers?.length && data.customers.some(c => c.order_count === undefined)) {
      try {
        const segmented = await callBridge('email_segments');
        const enriched = enrichCustomersFromSegments(data.customers, segmented.customers || []);
        return res.json({
          ...data,
          customers: sortCustomersPage(enriched, sort, dir),
          note: 'customers enriched from email_segments fallback'
        });
      } catch (fallbackError) {
        console.warn('customers enrichment fallback failed:', fallbackError.message);
      }
    }

    res.json(data);
  }
  catch (e) { res.status(500).json({ error: e.message }); }
});

function enrichCustomersFromSegments(customers, segmentCustomers) {
  const byId = new Map(segmentCustomers.map(c => [String(c.customer_id), c]));
  return customers.map(customer => {
    const full = byId.get(String(customer.customer_id));
    if (!full) return { ...customer, order_count: 0, total_spent: 0, last_order: '' };
    return {
      ...customer,
      order_count: Number(full.order_count || 0),
      total_spent: Number(full.total_spent || 0),
      last_order: full.last_order || ''
    };
  });
}

function sortCustomersPage(customers, sort, dir) {
  const factor = dir === 'asc' ? 1 : -1;
  const value = (customer) => {
    if (sort === 'name') return `${customer.firstname || ''} ${customer.lastname || ''}`.trim().toLowerCase();
    if (sort === 'email') return String(customer.email || '').toLowerCase();
    if (sort === 'phone') return String(customer.telephone || '').toLowerCase();
    if (sort === 'orders') return Number(customer.order_count || 0);
    if (sort === 'spent') return Number(customer.total_spent || 0);
    if (sort === 'last_order') return customer.last_order ? new Date(customer.last_order).getTime() : 0;
    return Number(customer.customer_id || 0);
  };
  return [...customers].sort((a, b) => {
    const av = value(a);
    const bv = value(b);
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    return Number(b.customer_id || 0) - Number(a.customer_id || 0);
  });
}

// Список замовлень
app.get('/store/orders', async (req, res) => {
  try { res.json(await callBridge('orders', { page: req.query.page || 1, search: req.query.search || '' })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Один клієнт із повною історією
app.get('/store/customer/:id', async (req, res) => {
  try {
    const data = await callBridge('customer', { id: req.params.id });
    res.json(enrichCustomer360(data));
  }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Зчитування та кешування стилів магазину
app.get('/store/style', async (req, res) => {
  // Повертаємо кеш якщо є і не запитують оновлення
  if (storeStyleCache && req.query.refresh !== '1') {
    return res.json({ ...storeStyleCache, cached: true });
  }

  if (req.query.ai !== '1') {
    const data = defaultMercatoStyle('');
    data.fallback = true;
    data.fallbackReason = 'Використано стабільний шаблон Mercato без завантаження сайту та AI-аналізу';
    saveStoreStyleCache(data);
    return res.json({ ...data, cached: false });
  }

  try {
    const home = await fetchPage('https://mercato.com.ua', BROWSER_HEADERS);
    if (!home.html || home.html.length < 500) throw new Error('Не вдалося завантажити сайт');

    // Шукаємо посилання на сторінку товару
    const links = [...home.html.matchAll(/href="(https:\/\/mercato\.com\.ua\/[^"#?]*(?:kava|chay|tea|coffee)[^"#?]*)"[^>]*>/gi)]
      .map(m => m[1]).filter(u => !u.includes('/category') && !u.includes('/blog'));
    let productHtml = '';
    let productUrl = '';
    if (links.length) {
      productUrl = links[0];
      const pr = await fetchPage(productUrl, BROWSER_HEADERS);
      productHtml = pr.html || '';
    }

    if (req.query.ai !== '1') {
      const data = defaultMercatoStyle(productUrl);
      data.fallback = true;
      data.fallbackReason = 'Використано стабільний шаблон Mercato без AI-аналізу стилів';
      saveStoreStyleCache(data);
      return res.json({ ...data, cached: false });
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: `Ти аналізуєш HTML інтернет-магазину щоб витягти точні стилі для генерації описів товарів.

Поверни ТІЛЬКИ валідний JSON:
- КРИТИЧНО: не використовуй подвійні лапки всередині значень рядків. Якщо треба виділити слово — використовуй одинарні лапки або без лапок.
- КРИТИЧНО: не вставляй перенос рядка всередині JSON string, використовуй короткі однорядкові значення.
- КРИТИЧНО: кожен обʼєкт і кожне поле має мати правильну кому.
{
  "colors": {
    "primary": "#hex — основний темний (заголовки, важливий текст)",
    "secondary": "#hex — другорядний (підзаголовки)",
    "accent": "#hex — акцентний (виділення, посилання)",
    "text": "#hex — основний текст",
    "bg": "#hex — фон сторінки",
    "cardBg": "#hex — фон карток/блоків",
    "border": "#hex — колір рамок"
  },
  "fonts": {
    "main": "точна назва або font-family стек",
    "headings": "для заголовків"
  },
  "borderRadius": "значення border-radius для карток",
  "syncedAt": "${new Date().toLocaleString('uk-UA')}",
  "productUrl": "${productUrl}",
  "htmlStructurePrompt": "Тут — детальний опис HTML структури для опису товару. Включи: точні inline-стилі з кольорами з полів colors вище, структуру блоків (intro, характеристики, смак, FAQ, посилання), конкретні CSS значення. Цей текст підставляється в системний промпт Claude замість шаблону — він має бути повним і точним."
}

HTML головної (до 15000 символів):
${home.html.substring(0, 15000)}

${productHtml ? `HTML сторінки товару (до 12000 символів):\n${productHtml.substring(0, 12000)}` : ''}`
      }]
    });

    let data;
    try {
      data = await parseAiJson(message.content[0].text.trim(), 'store-style');
    } catch (parseError) {
      console.warn('store-style: AI не повернув валідний JSON, використовую дефолт Mercato:', parseError.message);
      data = defaultMercatoStyle(productUrl);
      data.fallback = true;
      data.fallbackReason = parseError.message;
    }
    saveStoreStyleCache(data);
    res.json({ ...data, cached: false });
  } catch (e) {
    console.error('Помилка стилів:', e.message);
    const data = defaultMercatoStyle('');
    data.fallback = true;
    data.fallbackReason = e.message;
    saveStoreStyleCache(data);
    res.json({ ...data, cached: false });
  }
});

// Скинути кеш стилів
app.post('/store/style/clear', (req, res) => {
  storeStyleCache = null;
  try { if (fs.existsSync(STORE_STYLE_CACHE_PATH)) fs.unlinkSync(STORE_STYLE_CACHE_PATH); } catch {}
  res.json({ ok: true });
});

// API-friendly error handler: повертає JSON, якщо клієнт цього очікує
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  if (req.accepts('json')) {
    return res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  }
  res.status(err.status || 500).send('Internal server error');
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const onListen = () => {
  console.log(`\n✅ Mercato AI запущено: http://${HOST || 'localhost'}:${PORT}\n`);
};
if (require.main === module) {
  app.listen(PORT, HOST, onListen);
}

module.exports = {
  app,
  helpers: {
    activeDirectorDecisionForActionId,
    activeDirectorDecisionForCustomer,
    bridgeFormBody,
    bridgeHasPublishDiagnostics,
    buildProductConsistencyAudit,
    defaultTrustCheckCandidates,
    directorActionId,
    emailDraftSafetyIssues,
    emailUnsubscribeUrl,
    appendComplianceFooter,
	    apiContentWorkbenchFromPayload,
	    apiContentRepairDraft,
	    apiCustomerDnaFromPayload,
	    apiDashboardV2FromPayload,
	    apiCommercialValueFromPayload,
	    apiOperatingModelFromPayload,
	    appV2PricingModel,
	    apiSetupGuideFromPayload,
    apiDemoReadinessFromPayload,
    apiOwnerRouterFromPayload,
    apiOwnerRouterIntent,
    apiPublishApprovalError,
    apiPublishContractPayload,
    apiTodayFromPayload,
    apiWorkItemsFromPayload,
    buildCustomerIntelligence,
    buildEmailSegments,
    getSpamStatus,
    generateCouponCode,
    normalizePhone,
    firstOrderPopupContactKey,
    normalizeFirstOrderPopupConfig,
    readFirstOrderPopupConfig,
    publicFirstOrderPopupConfig,
    firstOrderPopupPageExcluded,
    firstOrderPopupUtmPayload,
    recordPublishRun,
    runProductConsistencyCheck,
    buildMercatoProductDescriptionHtml,
    localizeCountryNamesUa,
    productFeedSafeLine,
    productCategoryName,
    mergeMercatoGeneratedAttributes,
    sanitizeOpenCartPublishAttributes,
    seoBuildOnPageValue,
    seoFallbackMetaDescription,
    seoFinalizeMetaDescription,
    seoMetaDescriptionFromDescription,
    unsafePublishContentReasons,
    trustIssueCounts
  },
  operationalStore
};
