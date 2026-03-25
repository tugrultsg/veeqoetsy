const BASE = "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (resp.status === 401) {
    if (!path.startsWith("/auth/")) {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error((data as any).error || `Request failed: ${resp.status}`);
  }

  return resp.json();
}

export const api = {
  // Auth
  login: (password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ password }) }),
  logout: () => request("/auth/logout", { method: "POST" }),

  // Dashboard
  getDashboard: () => request<any>("/dashboard"),

  // Customers
  getCustomers: () => request<any[]>("/customers"),
  getCustomer: (id: number) => request<any>(`/customers/${id}`),
  createCustomer: (name: string, veeqoApiKey: string) =>
    request<any>("/customers", { method: "POST", body: JSON.stringify({ name, veeqoApiKey }) }),
  deleteCustomer: (id: number) =>
    request("/customers/" + id, { method: "DELETE" }),

  // Shops
  getShop: (id: number) => request<any>(`/shops/${id}`),
  updateShopConfig: (id: number, config: { veeqoChannelId: number; veeqoWarehouseId: number; veeqoDeliveryMethodId: number }) =>
    request(`/shops/${id}/config`, { method: "PUT", body: JSON.stringify(config) }),
  getShopLogs: (id: number) => request<any[]>(`/shops/${id}/logs`),
  getShopOrders: (id: number) => request<any[]>(`/shops/${id}/orders`),
  getShopInventory: (id: number) => request<any[]>(`/shops/${id}/inventory`),
  buildMap: (id: number) =>
    request<any>(`/shops/${id}/build-map`, { method: "POST" }),
  triggerSync: (id: number, type: string) =>
    request<any>(`/shops/${id}/sync/${type}`, { method: "POST" }),
  toggleShop: (id: number) =>
    request<any>(`/shops/${id}/toggle`, { method: "PUT" }),

  // OAuth
  startEtsyOAuth: (customerId: number, etsyApiKey: string, shopName: string) =>
    request<{ authUrl: string; state: string }>(
      `/oauth/etsy/start?customerId=${customerId}&etsyApiKey=${encodeURIComponent(etsyApiKey)}&shopName=${encodeURIComponent(shopName)}`
    ),

  // Setup links
  generateSetupLink: (customerId: number, shopName: string) =>
    request<{ url: string; token: string; expiresAt: string }>(
      `/customers/${customerId}/setup-link`,
      { method: "POST", body: JSON.stringify({ shopName }) }
    ),
  getSetupLinks: (customerId: number) =>
    request<any[]>(`/customers/${customerId}/setup-links`),

  // Veeqo proxy (for setup)
  getVeeqoChannels: (apiKey: string) =>
    request<any[]>(`/veeqo/channels?apiKey=${encodeURIComponent(apiKey)}`),
  getVeeqoWarehouses: (apiKey: string) =>
    request<any[]>(`/veeqo/warehouses?apiKey=${encodeURIComponent(apiKey)}`),
  getVeeqoDeliveryMethods: (apiKey: string) =>
    request<any[]>(`/veeqo/delivery-methods?apiKey=${encodeURIComponent(apiKey)}`),
};
