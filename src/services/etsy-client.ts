import { fetchWithRetry } from "./base-client";
import { ensureValidToken } from "../auth/etsy-oauth";
import { decrypt } from "../lib/crypto";
import { Database } from "../db/client";
import { shops } from "../db/schema";
import { eq } from "drizzle-orm";
import { Env } from "../env";

const ETSY_BASE = "https://api.etsy.com/v3";

export class EtsyClient {
  private db: Database;
  private env: Env;
  private shopId: number;
  private etsyShopId: number;
  private apiKey: string;
  private accessToken: string;

  constructor(
    db: Database,
    env: Env,
    shopId: number,
    etsyShopId: number,
    apiKey: string,
    accessToken: string
  ) {
    this.db = db;
    this.env = env;
    this.shopId = shopId;
    this.etsyShopId = etsyShopId;
    this.apiKey = apiKey;
    this.accessToken = accessToken;
  }

  static async create(db: Database, env: Env, shopId: number): Promise<EtsyClient> {
    const shop = await db.select().from(shops).where(eq(shops.id, shopId)).get();
    if (!shop) throw new Error(`Shop ${shopId} not found`);
    if (!shop.etsyShopId) throw new Error(`Shop ${shopId} has no Etsy shop ID`);

    const apiKey = await decrypt(shop.etsyApiKey, env.ENCRYPTION_KEY);
    const accessToken = await ensureValidToken(db, env, shopId);

    return new EtsyClient(db, env, shopId, shop.etsyShopId, apiKey, accessToken);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "x-api-key": this.apiKey,
    };
  }

  private async request(method: string, path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${ETSY_BASE}${path}`;
    const resp = await fetchWithRetry(url, {
      method,
      headers: { ...this.headers(), ...(options.headers as Record<string, string> || {}) },
      ...options,
    });

    // Auto-refresh on 401
    if (resp.status === 401) {
      this.accessToken = await ensureValidToken(this.db, this.env, this.shopId);
      return fetchWithRetry(url, {
        method,
        headers: { ...this.headers(), ...(options.headers as Record<string, string> || {}) },
        ...options,
      });
    }

    return resp;
  }

  // ── Receipts ─────────────────────────────────────────
  async getReceipts(params: {
    minLastModified?: number;
    wasPaid?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<any> {
    const qs = new URLSearchParams();
    qs.set("limit", String(params.limit || 25));
    qs.set("offset", String(params.offset || 0));
    if (params.wasPaid !== false) qs.set("was_paid", "true");
    if (params.minLastModified) qs.set("min_last_modified", String(params.minLastModified));

    const resp = await this.request("GET", `/application/shops/${this.etsyShopId}/receipts?${qs}`);
    if (!resp.ok) throw new Error(`getReceipts failed: ${resp.status}`);
    return resp.json();
  }

  // ── Shipments ────────────────────────────────────────
  async createReceiptShipment(
    receiptId: number,
    trackingCode: string,
    carrierName: string
  ): Promise<any> {
    const resp = await this.request(
      "POST",
      `/application/shops/${this.etsyShopId}/receipts/${receiptId}/tracking`,
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          tracking_code: trackingCode,
          carrier_name: carrierName,
          send_bcc: "false",
        }),
      }
    );
    if (!resp.ok) throw new Error(`createShipment failed: ${resp.status}`);
    return resp.json();
  }

  // ── Inventory ────────────────────────────────────────
  async getListingInventory(listingId: number): Promise<any> {
    const resp = await this.request("GET", `/application/listings/${listingId}/inventory`);
    if (!resp.ok) throw new Error(`getListingInventory failed: ${resp.status}`);
    return resp.json();
  }

  async updateListingInventory(listingId: number, payload: any): Promise<any> {
    const resp = await this.request("PUT", `/application/listings/${listingId}/inventory`, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error(`updateListingInventory failed: ${resp.status}`);
    return resp.json();
  }

  // ── Listings ─────────────────────────────────────────
  async getListings(params: { state?: string; limit?: number; offset?: number }): Promise<any> {
    const qs = new URLSearchParams({
      state: params.state || "active",
      limit: String(params.limit || 100),
      offset: String(params.offset || 0),
    });
    const resp = await this.request("GET", `/application/shops/${this.etsyShopId}/listings?${qs}`);
    if (!resp.ok) throw new Error(`getListings failed: ${resp.status}`);
    return resp.json();
  }
}
