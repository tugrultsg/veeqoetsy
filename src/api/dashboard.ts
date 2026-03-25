import { Hono } from "hono";
import { Env } from "../env";
import { getDb } from "../db/client";
import { customers, shops, etsyTokens, syncedOrders, syncedShipments, syncCursors, syncLogs } from "../db/schema";
import { eq, and, desc, gt } from "drizzle-orm";

export const dashboardRoutes = new Hono<{ Bindings: Env }>();

dashboardRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);

  const allCustomers = await db.select().from(customers).where(eq(customers.active, true)).all();
  const allShops = await db.select().from(shops).where(eq(shops.active, true)).all();

  const shopDetails = await Promise.all(
    allShops.map(async (shop) => {
      const customer = allCustomers.find((c) => c.id === shop.customerId);
      const token = await db.select().from(etsyTokens).where(eq(etsyTokens.shopId, shop.id)).get();
      const cursors = await db.select().from(syncCursors).where(eq(syncCursors.shopId, shop.id)).all();

      // Last sync log per type
      const lastLogs = await db
        .select()
        .from(syncLogs)
        .where(eq(syncLogs.shopId, shop.id))
        .orderBy(desc(syncLogs.createdAt))
        .limit(10)
        .all();

      // Counts (last 24h)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const recentOrders = await db
        .select()
        .from(syncedOrders)
        .where(and(eq(syncedOrders.shopId, shop.id), gt(syncedOrders.createdAt, oneDayAgo)))
        .all();

      const recentShipments = await db
        .select()
        .from(syncedShipments)
        .where(and(eq(syncedShipments.shopId, shop.id), gt(syncedShipments.syncedAt, oneDayAgo)))
        .all();

      return {
        id: shop.id,
        name: shop.name,
        customerName: customer?.name || "Unknown",
        customerId: shop.customerId,
        etsyShopId: shop.etsyShopId,
        hasToken: !!token,
        tokenExpiresAt: token?.expiresAt,
        cursors: Object.fromEntries(cursors.map((c) => [c.syncType, c.lastSyncAt])),
        lastLogs: lastLogs.reduce(
          (acc, log) => {
            if (!acc[log.syncType]) acc[log.syncType] = log;
            return acc;
          },
          {} as Record<string, (typeof lastLogs)[number]>
        ),
        stats24h: {
          ordersCreated: recentOrders.filter((o) => o.status === "completed").length,
          ordersFailed: recentOrders.filter((o) => o.status === "failed").length,
          shipmentsSynced: recentShipments.length,
        },
      };
    })
  );

  return c.json({
    customers: allCustomers,
    shops: shopDetails,
  });
});
