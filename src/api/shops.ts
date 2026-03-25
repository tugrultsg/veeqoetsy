import { Hono } from "hono";
import { Env } from "../env";
import { getDb } from "../db/client";
import { shops, customers, etsyTokens, syncedOrders, syncedShipments, inventoryMap, syncLogs } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { syncOrdersForShop } from "../services/order-sync";
import { syncShippingForShop } from "../services/shipping-sync";
import { syncInventoryForShop } from "../services/inventory-sync";
import { buildSkuMap } from "../services/sku-mapper";

export const shopRoutes = new Hono<{ Bindings: Env }>();

// Update shop Veeqo config (after OAuth, user picks channel/warehouse/delivery)
shopRoutes.put("/:id/config", async (c) => {
  const db = getDb(c.env.DB);
  const id = parseInt(c.req.param("id"));
  const body = await c.req.json<{
    veeqoChannelId: number;
    veeqoWarehouseId: number;
    veeqoDeliveryMethodId: number;
  }>();

  await db
    .update(shops)
    .set({
      veeqoChannelId: body.veeqoChannelId,
      veeqoWarehouseId: body.veeqoWarehouseId,
      veeqoDeliveryMethodId: body.veeqoDeliveryMethodId,
    })
    .where(eq(shops.id, id));

  return c.json({ ok: true });
});

// Get shop detail
shopRoutes.get("/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = parseInt(c.req.param("id"));

  const shop = await db.select().from(shops).where(eq(shops.id, id)).get();
  if (!shop) return c.json({ error: "Not found" }, 404);

  const token = await db.select().from(etsyTokens).where(eq(etsyTokens.shopId, id)).get();
  const orderCount = await db.select().from(syncedOrders).where(and(eq(syncedOrders.shopId, id), eq(syncedOrders.status, "completed"))).all();
  const shipmentCount = await db.select().from(syncedShipments).where(eq(syncedShipments.shopId, id)).all();
  const mapCount = await db.select().from(inventoryMap).where(eq(inventoryMap.shopId, id)).all();

  return c.json({
    ...shop,
    hasToken: !!token,
    tokenExpiresAt: token?.expiresAt,
    orderCount: orderCount.length,
    shipmentCount: shipmentCount.length,
    skuMapCount: mapCount.length,
  });
});

// Get shop sync logs
shopRoutes.get("/:id/logs", async (c) => {
  const db = getDb(c.env.DB);
  const id = parseInt(c.req.param("id"));
  const limit = parseInt(c.req.query("limit") || "50");

  const logs = await db
    .select()
    .from(syncLogs)
    .where(eq(syncLogs.shopId, id))
    .orderBy(desc(syncLogs.createdAt))
    .limit(limit)
    .all();

  return c.json(logs);
});

// Get synced orders
shopRoutes.get("/:id/orders", async (c) => {
  const db = getDb(c.env.DB);
  const id = parseInt(c.req.param("id"));
  const limit = parseInt(c.req.query("limit") || "50");

  const orders = await db
    .select()
    .from(syncedOrders)
    .where(eq(syncedOrders.shopId, id))
    .orderBy(desc(syncedOrders.createdAt))
    .limit(limit)
    .all();

  return c.json(orders);
});

// Get inventory map
shopRoutes.get("/:id/inventory", async (c) => {
  const db = getDb(c.env.DB);
  const id = parseInt(c.req.param("id"));

  const items = await db
    .select()
    .from(inventoryMap)
    .where(eq(inventoryMap.shopId, id))
    .all();

  return c.json(items);
});

// Build SKU map
shopRoutes.post("/:id/build-map", async (c) => {
  const db = getDb(c.env.DB);
  const id = parseInt(c.req.param("id"));

  const shop = await db.select().from(shops).where(eq(shops.id, id)).get();
  if (!shop) return c.json({ error: "Shop not found" }, 404);

  const customer = await db.select().from(customers).where(eq(customers.id, shop.customerId)).get();
  if (!customer) return c.json({ error: "Customer not found" }, 404);

  const result = await buildSkuMap(db, c.env, shop, customer);
  return c.json(result);
});

// Manual sync trigger
shopRoutes.post("/:id/sync/:type", async (c) => {
  const db = getDb(c.env.DB);
  const id = parseInt(c.req.param("id"));
  const syncType = c.req.param("type");

  const shop = await db.select().from(shops).where(eq(shops.id, id)).get();
  if (!shop) return c.json({ error: "Shop not found" }, 404);

  const customer = await db.select().from(customers).where(eq(customers.id, shop.customerId)).get();
  if (!customer) return c.json({ error: "Customer not found" }, 404);

  let result: any;
  switch (syncType) {
    case "orders":
      result = await syncOrdersForShop(db, c.env, shop, customer);
      break;
    case "shipping":
      result = await syncShippingForShop(db, c.env, shop, customer);
      break;
    case "inventory":
      result = await syncInventoryForShop(db, c.env, shop, customer);
      break;
    default:
      return c.json({ error: "Invalid sync type" }, 400);
  }

  return c.json(result);
});

// Toggle shop active
shopRoutes.put("/:id/toggle", async (c) => {
  const db = getDb(c.env.DB);
  const id = parseInt(c.req.param("id"));

  const shop = await db.select().from(shops).where(eq(shops.id, id)).get();
  if (!shop) return c.json({ error: "Not found" }, 404);

  await db.update(shops).set({ active: !shop.active }).where(eq(shops.id, id));
  return c.json({ active: !shop.active });
});
