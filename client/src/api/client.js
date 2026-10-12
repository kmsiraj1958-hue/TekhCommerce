const API_BASE = '';

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;

  const isForm = options.body instanceof FormData;
  if (!isForm && options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  getRuntime: () => request('/api/runtime'),
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
  getInvoices: () => request('/api/invoices'),
  getInvoice: (id) => request(`/api/invoices/${id}`),
  getDocumentMeta: () => request('/api/documents/meta'),
  getDocumentCandidates: () => request('/api/documents/candidates'),
  getDocuments: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/documents${q ? `?${q}` : ''}`);
  },
  getDocument: (id) => request(`/api/documents/${encodeURIComponent(id)}`),
  issueDocument: (body) => request('/api/documents', { method: 'POST', body }),
  voidDocument: (id, reason) => request(`/api/documents/${encodeURIComponent(id)}/void`, { method: 'POST', body: { reason } }),
  getReportFamilies: () => request('/api/reports/centre'),
  getReportCentre: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/reports/centre?${q}`);
  },
  getReportCentreCsv: async (params = {}) => {
    const q = new URLSearchParams({ ...params, format: 'csv' }).toString();
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/reports/centre?${q}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('Could not export CSV');
    return res.blob();
  },
  getFinanceEntries: () => request('/api/finance/entries'),
  getProducts: () => request('/api/products'),
  getProduct: (code) => request(`/api/products/${code}`),
  createProduct: (formData) => request('/api/products', { method: 'POST', body: formData }),
  updateProduct: (code, formData) => request(`/api/products/${code}`, { method: 'PUT', body: formData }),
  deleteProduct: (code) => request(`/api/products/${code}`, { method: 'DELETE' }),
  checkout: (payload) => request('/api/orders/checkout', { method: 'POST', body: payload }),
  singleOrder: (payload) => request('/api/orders/single', { method: 'POST', body: payload }),
  tiktokOrder: (payload) => request('/api/orders/tiktok', { method: 'POST', body: payload }),
  trackOrder: (orderId) => request(`/api/orders/track/${orderId}`),
  getOrders: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/orders${q ? `?${q}` : ''}`);
  },
  getDashboard: (params = {}) => {
    const q = new URLSearchParams();
    if (params.start) q.set('start', params.start);
    if (params.end) q.set('end', params.end);
    const qs = q.toString();
    return request(`/api/orders/dashboard${qs ? `?${qs}` : ''}`);
  },
  updateStatus: (orderId, status) => request(`/api/orders/${orderId}/status`, { method: 'PATCH', body: { status } }),
  deleteOrder: (orderId) => request(`/api/orders/${orderId}`, { method: 'DELETE' }),
  previewOnboarding: (formData) => request('/api/onboarding/preview', { method: 'POST', body: formData }),
  applyOnboarding: (body) => request('/api/onboarding/apply', { method: 'POST', body }),
  getManufacturing: () => request('/api/manufacturing'),
  saveBom: (body) => request('/api/manufacturing/boms', { method: 'POST', body }),
  createProduction: (body) => request('/api/manufacturing/production', { method: 'POST', body }),
  getProduction: (id) => request(`/api/manufacturing/production/${id}`),
  updateProduction: (id, body) => request(`/api/manufacturing/production/${id}`, { method: 'PATCH', body }),
  previewProduction: (id) => request(`/api/manufacturing/production/${id}/preview`),
  postProduction: (id) => request(`/api/manufacturing/production/${id}/post`, { method: 'POST' }),
  reverseProduction: (id) => request(`/api/manufacturing/production/${id}/reverse`, { method: 'POST' }),
  getInventory: () => request('/api/inventory'),
  addMovement: (payload) => request('/api/inventory/movements', { method: 'POST', body: payload }),
  importDaily: (formData) => request('/api/inventory/import-daily', { method: 'POST', body: formData }),
  importPayout: (formData) => request('/api/inventory/import-payout', { method: 'POST', body: formData }),
  syncMnp: () => request('/api/inventory/sync', { method: 'POST' }),
  getMasterReport: (params) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/reports/master?${q}`);
  },
  getFinancialReport: (date) => request(`/api/reports/financial?date=${date}`),
  saveAdSpend: (date, amount) => request('/api/reports/financial/ad-spend', { method: 'POST', body: { date, amount } }),
  getPayoutReport: () => request('/api/reports/payout'),
  getWeeklyReport: () => request('/api/reports/weekly'),
  generateWeekly: () => request('/api/reports/weekly/generate', { method: 'POST' }),
  getCourierBalance: (params) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/reports/courier-balance?${q}`);
  },
  getVendorLicenseStatus: () => request('/api/vendor-license/status'),
  getCourierAccounts: () => request('/api/courier/accounts'),
  getCourierShipments: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/courier/shipments${q ? `?${q}` : ''}`);
  },
  getCourierReturns: () => request('/api/courier/returns'),
  receiveCourierReturn: (orderId, body) => request(`/api/courier/returns/${orderId}/receive`, { method: 'POST', body }),
  getCourierReconciliation: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/courier/reconciliation${q ? `?${q}` : ''}`);
  },
  getCourierWeekly: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/courier/weekly${q ? `?${q}` : ''}`);
  },
  getCourierWeeklyCsv: async (params = {}) => {
    const q = new URLSearchParams({ ...params, format: 'csv' }).toString();
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/courier/weekly?${q}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('Could not export CSV');
    return res.blob();
  },
  getCourierAlerts: () => request('/api/courier/alerts'),
  getCourierSettings: () => request('/api/courier/settings'),
  saveCourierSettings: (body) => request('/api/courier/settings', { method: 'PUT', body }),
  syncCourier: () => request('/api/courier/sync', { method: 'POST' }),
  previewCourierDaily: (formData) => request('/api/courier/import-daily/preview', { method: 'POST', body: formData }),
  applyCourierDaily: (formData) => request('/api/courier/import-daily/apply', { method: 'POST', body: formData }),
};

export function imageUrl(filename) {
  if (!filename) return 'https://placehold.co/400x400/f5f5f4/a8a29e?text=No+Image';
  return `/static/images/${encodeURIComponent(filename)}`;
}
