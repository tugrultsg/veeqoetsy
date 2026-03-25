import { Env } from "../env";
import { getDb } from "../db/client";
import { shops, customers, syncLogs } from "../db/schema";
import { eq, and, lt } from "drizzle-orm";
import { syncOrdersForShop } from "../services/order-sync";
import { syncShippingForShop } from "../services/shipping-sync";
import { syncInventoryForShop } from "../services/inventory-sync";
import { alertSyncFailure } from "../lib/email";

type SyncFn = (
  db: any,
  env: Env,
  shop: typeof shops.$inferSelect,
  customer: typeof customers.$inferSelect
) => Promise<any>;

async function runSyncForAllShops(
  env: Env,
  syncType: string,
  syncFn: SyncFn
): Promise<void> {
  const db = getDb(env.DB);

  const activeShops = await db
    .select({ shop: shops, customer: customers })
    .from(shops)
    .innerJoin(customers, eq(shops.customerId, customers.id))
    .where(and(eq(shops.active, true), eq(customers.active, true)))
    .all();

  for (const { shop, customer } of activeShops) {
    const startTime = Date.now();
    try {
      const result = await syncFn(db, env, shop, customer);
      const failed = result.failed || 0;

      await db.insert(syncLogs).values({
        shopId: shop.id,
        syncType,
        status: failed > 0 ? "partial" : "success",
        summary: JSON.stringify(result),
        durationMs: Date.now() - startTime,
      });

      if (failed > 0) {
        await alertSyncFailure(env, shop.name, syncType, `${failed} items failed`);
      }
    } catch (e: any) {
      await db.insert(syncLogs).values({
        shopId: shop.id,
        syncType,
        status: "error",
        errorMessage: (e.message || "").substring(0, 500),
        durationMs: Date.now() - startTime,
      });

      await alertSyncFailure(env, shop.name, syncType, e.message || "Unknown error");
      console.error(`Sync ${syncType} failed for ${shop.name}: ${e.message}`);
    }
  }

  // Prune old logs (30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.delete(syncLogs).where(lt(syncLogs.createdAt, thirtyDaysAgo));
}

export async function handleScheduled(
  controller: ScheduledController,
  env: Env
): Promise<void> {
  const cron = controller.cron;
  console.log(`Cron triggered: ${cron}`);

  if (cron === "*/5 * * * *") {
    await runSyncForAllShops(env, "orders", syncOrdersForShop);
  }

  if (cron === "*/10 * * * *") {
    await runSyncForAllShops(env, "shipping", syncShippingForShop);
  }

  if (cron === "0,30 * * * *") {
    await runSyncForAllShops(env, "inventory", syncInventoryForShop);
  }
}
