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
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
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
  getDashboard: () => request('/api/orders/dashboard'),
  updateStatus: (orderId, status) => request(`/api/orders/${orderId}/status`, { method: 'PATCH', body: { status } }),
  deleteOrder: (orderId) => request(`/api/orders/${orderId}`, { method: 'DELETE' }),
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
};

export function imageUrl(filename) {
  if (!filename) return 'https://placehold.co/400x400/f5f5f4/a8a29e?text=No+Image';
  return `/static/images/${encodeURIComponent(filename)}`;
}
