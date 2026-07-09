const API_KEY_STORAGE = 'mercato.commandApiKey';

function apiHeaders(extra = {}) {
  const key = sessionStorage.getItem(API_KEY_STORAGE) || localStorage.getItem(API_KEY_STORAGE) || '';
  return {
    'Content-Type': 'application/json',
    ...(key ? { 'X-API-Key': key } : {}),
    ...extra
  };
}

async function parseResponse(response) {
  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 300) };
    }
  }
  if ((response.status === 401 || response.status === 403) && !sessionStorage.getItem(API_KEY_STORAGE)) {
    const key = prompt('Введіть COMMAND_API_KEY для захищеної дії Mercato AI:');
    if (key) {
      sessionStorage.setItem(API_KEY_STORAGE, key.trim());
      return null;
    }
  }
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

export async function apiFetch(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: apiHeaders(options.headers || {})
  });
  const data = await parseResponse(response);
  if (data === null) return apiFetch(path, options);
  return data;
}

export function getToday({ refresh = false } = {}) {
  return apiFetch(`/api/today${refresh ? '?refresh=1' : ''}`);
}

export function routeOwnerRequest(query, { refresh = false } = {}) {
  return apiFetch('/api/owner-router', {
    method: 'POST',
    body: JSON.stringify({ query, refresh })
  });
}

export function logCommandEvent(payload = {}) {
  return apiFetch('/command-center/log', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function getWorkItems({ refresh = false } = {}) {
  return apiFetch(`/api/work-items${refresh ? '?refresh=1' : ''}`);
}

export function getContentWorkbench({ refresh = false } = {}) {
  return apiFetch(`/api/content-workbench${refresh ? '?refresh=1' : ''}`);
}

export function getProductsMatrix({ refresh = false } = {}) {
  return apiFetch(`/api/products/matrix${refresh ? '?refresh=1' : ''}`);
}

export function repairContentDraft(payload = {}) {
  return apiFetch('/api/content-workbench/repair-draft', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function importSeoUrl(payload = {}) {
  return apiFetch('/import-url', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function generateSeoPackage(payload = {}) {
  return apiFetch('/generate', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function readOpenCartProduct(params = {}) {
  const search = new URLSearchParams();
  if (params.url) search.set('url', params.url);
  if (params.product_id || params.id) search.set('product_id', params.product_id || params.id);
  if (params.slug) search.set('slug', params.slug);
  return apiFetch(`/opencart/read-product?${search.toString()}`);
}

export function publishProductCard(payload = {}, { dryRun = true } = {}) {
  return apiFetch('/opencart/publish-content', {
    method: 'POST',
    body: JSON.stringify({
      ...(payload || {}),
      dryRun: Boolean(dryRun),
      source: dryRun ? 'app_v2_product_card_dry_run' : 'app_v2_product_card_publish'
    })
  });
}

export function getCustomerDna({ refresh = false } = {}) {
  return apiFetch(`/api/customer-dna${refresh ? '?refresh=1' : ''}`);
}

export function getEmailSegments() {
  return apiFetch('/email/segments');
}

export function getEmailTracking() {
  return apiFetch('/email/tracking');
}

export function getSetupGuide({ refresh = false } = {}) {
  return apiFetch(`/api/setup-guide${refresh ? '?refresh=1' : ''}`);
}

export function getDemoReadiness({ refresh = false } = {}) {
  return apiFetch(`/api/demo-readiness${refresh ? '?refresh=1' : ''}`);
}

export function getMonitoringStatus() {
  return apiFetch('/monitoring/status');
}

export function getStoreCustomers({ page = 1, search = '', sort = 'last_order', dir = 'desc' } = {}) {
  return apiFetch(`/store/customers?${new URLSearchParams({ page, search, sort, dir })}`);
}

export function getStoreOrders({ page = 1, search = '' } = {}) {
  return apiFetch(`/store/orders?${new URLSearchParams({ page, search })}`);
}

export function getStoreCustomer(id) {
  return apiFetch(`/store/customer/${encodeURIComponent(id)}`);
}

export function runCompetitorMonitoring(payload = {}) {
  return apiFetch('/monitoring/competitors/run', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function runUxMonitoring(payload = {}) {
  return apiFetch('/monitoring/ux/run', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function decideWorkItem(id, payload) {
  return apiFetch(`/api/work-items/${encodeURIComponent(id)}/decision`, {
    method: 'POST',
    body: JSON.stringify(payload || {})
  });
}

export function publishContent(payload, { dryRun = true } = {}) {
  const endpoint = dryRun ? '/api/publish/dry-run' : '/api/publish/approve';
  const body = dryRun
    ? { ...(payload || {}) }
    : { ...(payload || {}), confirmPhrase: 'PUBLISH_MERCATO_CONTENT' };
  return apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

export function generateEmail(payload = {}) {
  return apiFetch('/generate-email', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function generateEmailBatch(payload = {}) {
  return apiFetch('/generate-email-batch', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function sendEmailTest(payload = {}) {
  return apiFetch('/email/send-test', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function createEmailCoupon(payload = {}) {
  return apiFetch('/email/create-coupon', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function sendEmailOne(payload = {}) {
  return apiFetch('/email/send-one', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function sendEmailSegment(payload = {}) {
  return apiFetch('/email/send-segment', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function clearApiKey() {
  sessionStorage.removeItem(API_KEY_STORAGE);
  localStorage.removeItem(API_KEY_STORAGE);
}
