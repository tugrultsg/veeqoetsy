import { fetchWithRetry } from "./base-client";

const VEEQO_BASE = "https://api.veeqo.com";

export class VeeqoClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    return {
      "x-api-key": this.apiKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  private async request(method: string, path: string, options: RequestInit = {}): Promise<Response> {
    return fetchWithRetry(`${VEEQO_BASE}${path}`, {
      method,
      headers: { ...this.headers(), ...(options.headers as Record<string, string> || {}) },
      ...options,
    });
  }

  // ── Orders ───────────────────────────────────────────
  async createOrder(payload: {
    channel_id: number;
    delivery_method_id: number;
    line_items_attributes: { sellable_id: number; price_per_unit: number; quantity: number }[];
    customer_attributes: { full_name: string; email: string; phone: string };
    deliver_to_attributes: Record<string, string>;
    number?: string;
    delivery_cost?: number;
    total_tax?: number;
    total_discounts?: number;
    payment_attributes?: { payment_type: string };
    customer_note_attributes?: { text: string };
    employee_notes_attributes?: { text: string }[];
  }): Promise<any> {
    const resp = await this.request("POST", "/orders", {
      body: JSON.stringify({ order: payload }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`createOrder failed: ${resp.status} ${text}`);
    }
    return resp.json();
  }

  async getOrders(params: {
    status?: string;
    updated_at_min?: string;
    page?: number;
    page_size?: number;
  }): Promise<any[]> {
    const qs = new URLSearchParams();
    qs.set("page", String(params.page || 1));
    qs.set("page_size", String(params.page_size || 50));
    if (params.status) qs.set("status", params.status);
    if (params.updated_at_min) qs.set("updated_at_min", params.updated_at_min);

    const resp = await this.request("GET", `/orders?${qs}`);
    if (!resp.ok) throw new Error(`getOrders failed: ${resp.status}`);
    return resp.json();
  }

  // ── Products ─────────────────────────────────────────
  async getProducts(page = 1, pageSize = 100): Promise<any[]> {
    const resp = await this.request("GET", `/products?page=${page}&page_size=${pageSize}`);
    if (!resp.ok) throw new Error(`getProducts failed: ${resp.status}`);
    return resp.json();
  }

  async getProduct(productId: number): Promise<any> {
    const resp = await this.request("GET", `/products/${productId}`);
    if (!resp.ok) throw new Error(`getProduct failed: ${resp.status}`);
    return resp.json();
  }

  // ── Setup helpers ────────────────────────────────────
  async getChannels(): Promise<any[]> {
    const resp = await this.request("GET", "/channels");
    if (!resp.ok) throw new Error(`getChannels failed: ${resp.status}`);
    return resp.json();
  }

  async getWarehouses(): Promise<any[]> {
    const resp = await this.request("GET", "/warehouses");
    if (!resp.ok) throw new Error(`getWarehouses failed: ${resp.status}`);
    return resp.json();
  }

  async getDeliveryMethods(): Promise<any[]> {
    const resp = await this.request("GET", "/delivery_methods");
    if (!resp.ok) throw new Error(`getDeliveryMethods failed: ${resp.status}`);
    return resp.json();
  }
}
