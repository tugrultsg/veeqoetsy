import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// ─── Customers (Veeqo account holders) ──────────────────────────
export const customers = sqliteTable("customers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  veeqoApiKey: text("veeqo_api_key").notNull(), // encrypted
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// ─── Shops (Etsy shops, 1+ per customer) ────────────────────────
export const shops = sqliteTable("shops", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  customerId: integer("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  etsyApiKey: text("etsy_api_key").notNull(), // encrypted, per-shop
  etsyShopId: integer("etsy_shop_id"),
  etsyUserId: integer("etsy_user_id"),

  // Veeqo config per shop
  veeqoChannelId: integer("veeqo_channel_id").notNull(),
  veeqoWarehouseId: integer("veeqo_warehouse_id").notNull(),
  veeqoDeliveryMethodId: integer("veeqo_delivery_method_id").notNull(),

  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// ─── Etsy OAuth Tokens (per shop) ───────────────────────────────
export const etsyTokens = sqliteTable("etsy_tokens", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }).unique(),
  accessToken: text("access_token").notNull(), // encrypted
  refreshToken: text("refresh_token").notNull(), // encrypted
  expiresAt: text("expires_at").notNull(), // ISO timestamp
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
});

// ─── Synced Orders ──────────────────────────────────────────────
export const syncedOrders = sqliteTable("synced_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  etsyReceiptId: integer("etsy_receipt_id").notNull(),
  veeqoOrderId: integer("veeqo_order_id"),
  status: text("status").notNull().default("pending"), // pending | completed | failed
  etsyOrderTotal: integer("etsy_order_total"), // cents
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex("uq_shop_receipt").on(table.shopId, table.etsyReceiptId),
]);

// ─── Synced Shipments ───────────────────────────────────────────
export const syncedShipments = sqliteTable("synced_shipments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  etsyReceiptId: integer("etsy_receipt_id").notNull(),
  veeqoOrderId: integer("veeqo_order_id").notNull(),
  trackingNumber: text("tracking_number"),
  carrier: text("carrier"),
  syncedAt: text("synced_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex("uq_shop_shipment").on(table.shopId, table.veeqoOrderId),
]);

// ─── Inventory Map (SKU matching) ───────────────────────────────
export const inventoryMap = sqliteTable("inventory_map", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  sku: text("sku").notNull(),
  etsyListingId: integer("etsy_listing_id"),
  etsyProductId: integer("etsy_product_id"),
  veeqoProductId: integer("veeqo_product_id"),
  veeqoSellableId: integer("veeqo_sellable_id"),
  lastSyncedStock: integer("last_synced_stock"),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex("uq_shop_sku").on(table.shopId, table.sku),
]);

// ─── Sync Cursors ───────────────────────────────────────────────
export const syncCursors = sqliteTable("sync_cursors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  syncType: text("sync_type").notNull(), // orders | shipping | inventory
  lastSyncAt: text("last_sync_at"),
  lastValue: text("last_value"),
  updatedAt: text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex("uq_shop_sync_type").on(table.shopId, table.syncType),
]);

// ─── Sync Logs (dashboard visibility) ───────────────────────────
export const syncLogs = sqliteTable("sync_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  shopId: integer("shop_id").notNull().references(() => shops.id, { onDelete: "cascade" }),
  syncType: text("sync_type").notNull(),
  status: text("status").notNull(), // success | partial | error
  summary: text("summary"), // JSON string
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  createdAt: text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  index("idx_sync_logs_shop_created").on(table.shopId, table.createdAt),
]);
