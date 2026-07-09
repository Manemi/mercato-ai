export const state = {
  view: 'onboarding',
  today: null,
  workItems: [],
  contentItems: [],
  customerDna: null,
  productMatrix: null,
  emailSegments: {
    loading: false,
    error: '',
    data: null
  },
  emailTracking: {
    loading: false,
    error: '',
    data: null
  },
  emailWorkflow: {},
  setupGuide: null,
  demoReadiness: null,
  monitoring: null,
  ownerRouter: {
    query: '',
    loading: false,
    result: null,
    activeRoute: null,
    error: ''
  },
  publishResults: {},
  store: {
    tool: '',
    search: '',
    page: 1,
    loading: false,
    error: '',
    customers: null,
    orders: null,
    selectedCustomer: null
  },
  productCard: {
    loading: false,
    importLoading: false,
    readLoading: false,
    error: '',
    warning: '',
    form: {
      mode: 'existing',
      targetUrl: '',
      productName: '',
      productType: 'coffee',
      origin: '',
      region: '',
      processing: '',
      flavors: '',
      brewing: '',
      keywords: '',
      links: '',
      price: '',
      categoryName: '',
      manufacturerName: 'Mercato',
      seoKeyword: '',
      publishNow: false,
      useMarketContext: true
    },
    generated: null,
    current: null,
    publishResult: null
  },
  selectedId: '',
  selectedContentId: '',
  filters: {
    search: '',
    priority: '',
    type: '',
    contentType: ''
  }
};

const listeners = new Set();

export function setState(patch = {}) {
  Object.assign(state, patch);
  listeners.forEach(listener => listener(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function selectedWorkItem() {
  return state.workItems.find(item => item.id === state.selectedId) || state.workItems[0] || null;
}

export function filteredWorkItems() {
  const search = state.filters.search.trim().toLowerCase();
  return state.workItems.filter(item => {
    if (state.filters.priority && item.priority !== state.filters.priority) return false;
    if (state.filters.type && item.type !== state.filters.type) return false;
    if (!search) return true;
    const haystack = [
      item.title,
      item.why,
      item.expectedImpact,
      item.target?.name,
      item.target?.url,
      ...(item.modules || [])
    ].join(' ').toLowerCase();
    return haystack.includes(search);
  });
}

export function selectedContentItem() {
  return state.contentItems.find(item => item.id === state.selectedContentId) || state.contentItems[0] || null;
}

export function filteredContentItems() {
  const search = state.filters.search.trim().toLowerCase();
  return state.contentItems.filter(item => {
    if (state.filters.contentType && item.type !== state.filters.contentType) return false;
    if (!search) return true;
    const haystack = [
      item.name,
      item.summary,
      item.why,
      item.expectedImpact,
      item.url,
      item.typeLabel
    ].join(' ').toLowerCase();
    return haystack.includes(search);
  });
}
