import { Database } from "../db/client";
import { Env } from "../env";
import { shops, customers, syncedOrders, syncedShipments, syncCursors } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { EtsyClient } from "./etsy-client";
import { VeeqoClient } from "./veeqo-client";
import { decrypt } from "../lib/crypto";
import { normalizeCarrierName } from "./mapper";

export async function syncShippingForShop(
  db: Database,
  env: Env,
  shop: typeof shops.$inferSelect,
  customer: typeof customers.$inferSelect
): Promise<{ synced: number; skipped: number; failed: number }> {
  const etsy = await EtsyClient.create(db, env, shop.id);
  const veeqoApiKey = await decrypt(customer.veeqoApiKey, env.ENCRYPTION_KEY);
  const veeqo = new VeeqoClient(veeqoApiKey);

  const cursor = await db
    .select()
    .from(syncCursors)
    .where(and(eq(syncCursors.shopId, shop.id), eq(syncCursors.syncType, "shipping")))
    .get();

  const updatedAtMin = cursor?.lastValue || undefined;
  const stats = { synced: 0, skipped: 0, failed: 0 };

  let page = 1;
  while (true) {
    const orders = await veeqo.getOrders({
      status: "shipped",
      updated_at_min: updatedAtMin,
      page,
      page_size: 50,
    });

    if (!orders.length) break;

    for (const order of orders) {
      const veeqoOrderId = order.id;

      // Only process orders we synced from Etsy
      const syncedOrder = await db
        .select()
        .from(syncedOrders)
        .where(
          and(
            eq(syncedOrders.shopId, shop.id),
            eq(syncedOrders.veeqoOrderId, veeqoOrderId),
            eq(syncedOrders.status, "completed")
          )
        )
        .get();

      if (!syncedOrder) continue;

      // Already pushed?
      const existing = await db
        .select()
        .from(syncedShipments)
        .where(and(eq(syncedShipments.shopId, shop.id), eq(syncedShipments.veeqoOrderId, veeqoOrderId)))
        .get();

      if (existing) {
        stats.skipped++;
        continue;
      }

      const shipments = order.shipments || [];
      if (!shipments.length) continue;

      const shipment = shipments[0];
      const trackingNumber = shipment.tracking_number;
      const carrier = shipment.carrier || "";

      if (!trackingNumber) continue;

      try {
        await etsy.createReceiptShipment(
          syncedOrder.etsyReceiptId,
          trackingNumber,
          normalizeCarrierName(carrier)
        );

        await db.insert(syncedShipments).values({
          shopId: shop.id,
          etsyReceiptId: syncedOrder.etsyReceiptId,
          veeqoOrderId,
          trackingNumber,
          carrier: normalizeCarrierName(carrier),
        });

        stats.synced++;
      } catch (e: any) {
        stats.failed++;
        console.error(`Failed shipping for receipt ${syncedOrder.etsyReceiptId}: ${e.message}`);
      }
    }

    if (orders.length < 50) break;
    page++;
  }

  // Update cursor
  const now = new Date().toISOString();
  if (cursor) {
    await db
      .update(syncCursors)
      .set({ lastValue: now, lastSyncAt: now, updatedAt: now })
      .where(eq(syncCursors.id, cursor.id));
  } else {
    await db.insert(syncCursors).values({
      shopId: shop.id,
      syncType: "shipping",
      lastValue: now,
      lastSyncAt: now,
    });
  }

  return stats;
}
