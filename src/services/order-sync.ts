import { Database } from "../db/client";
import { Env } from "../env";
import { shops, customers, syncedOrders, inventoryMap, syncCursors } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { EtsyClient } from "./etsy-client";
import { VeeqoClient } from "./veeqo-client";
import { decrypt } from "../lib/crypto";
import { mapEtsyReceiptToVeeqoOrder } from "./mapper";

export async function syncOrdersForShop(
  db: Database,
  env: Env,
  shop: typeof shops.$inferSelect,
  customer: typeof customers.$inferSelect
): Promise<{ created: number; skipped: number; failed: number }> {
  const etsy = await EtsyClient.create(db, env, shop.id);
  const veeqoApiKey = await decrypt(customer.veeqoApiKey, env.ENCRYPTION_KEY);
  const veeqo = new VeeqoClient(veeqoApiKey);

  // Load SKU map
  const maps = await db
    .select()
    .from(inventoryMap)
    .where(eq(inventoryMap.shopId, shop.id))
    .all();
  const skuToSellable = new Map(
    maps.filter((m) => m.sku && m.veeqoSellableId).map((m) => [m.sku, m.veeqoSellableId!])
  );

  if (skuToSellable.size === 0) {
    console.warn(`No SKU map for shop ${shop.name}. Run build-map first.`);
    return { created: 0, skipped: 0, failed: 0 };
  }

  // Get cursor
  const cursor = await db
    .select()
    .from(syncCursors)
    .where(and(eq(syncCursors.shopId, shop.id), eq(syncCursors.syncType, "orders")))
    .get();

  const minModified = cursor?.lastValue ? parseInt(cursor.lastValue) : undefined;
  const stats = { created: 0, skipped: 0, failed: 0 };
  let maxModified = minModified || 0;
  let offset = 0;

  while (true) {
    const data = await etsy.getReceipts({
      minLastModified: minModified,
      wasPaid: true,
      limit: 25,
      offset,
    });

    const results = data.results || [];
    if (!results.length) break;

    for (const receipt of results) {
      const receiptId = receipt.receipt_id;
      const updatedTs = receipt.update_timestamp || 0;
      if (updatedTs > maxModified) maxModified = updatedTs;

      // Already synced?
      const existing = await db
        .select()
        .from(syncedOrders)
        .where(and(eq(syncedOrders.shopId, shop.id), eq(syncedOrders.etsyReceiptId, receiptId)))
        .get();

      if (existing) {
        stats.skipped++;
        continue;
      }

      // Pending record (crash safety)
      const [synced] = await db
        .insert(syncedOrders)
        .values({
          shopId: shop.id,
          etsyReceiptId: receiptId,
          status: "pending",
          etsyOrderTotal: receipt.grandtotal?.amount,
        })
        .returning();

      // Map to Veeqo
      const mapped = mapEtsyReceiptToVeeqoOrder(
        receipt,
        shop.veeqoChannelId,
        shop.veeqoDeliveryMethodId,
        skuToSellable
      );

      if (!mapped) {
        await db
          .update(syncedOrders)
          .set({ status: "failed", errorMessage: "No valid line items after SKU mapping" })
          .where(eq(syncedOrders.id, synced.id));
        stats.failed++;
        continue;
      }

      try {
        const veeqoOrder = await veeqo.createOrder(mapped.payload as any);
        await db
          .update(syncedOrders)
          .set({ veeqoOrderId: veeqoOrder.id, status: "completed" })
          .where(eq(syncedOrders.id, synced.id));
        stats.created++;
      } catch (e: any) {
        await db
          .update(syncedOrders)
          .set({ status: "failed", errorMessage: (e.message || "").substring(0, 500) })
          .where(eq(syncedOrders.id, synced.id));
        stats.failed++;
        console.error(`Failed order for receipt ${receiptId}: ${e.message}`);
      }
    }

    offset += 25;
    if (offset >= (data.count || 0)) break;
  }

  // Update cursor
  if (maxModified > (minModified || 0)) {
    if (cursor) {
      await db
        .update(syncCursors)
        .set({ lastValue: String(maxModified), lastSyncAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .where(eq(syncCursors.id, cursor.id));
    } else {
      await db.insert(syncCursors).values({
        shopId: shop.id,
        syncType: "orders",
        lastValue: String(maxModified),
        lastSyncAt: new Date().toISOString(),
      });
    }
  }

  return stats;
}
