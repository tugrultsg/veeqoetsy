import { Database } from "../db/client";
import { Env } from "../env";
import { shops, customers, inventoryMap, syncCursors } from "../db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { EtsyClient } from "./etsy-client";
import { VeeqoClient } from "./veeqo-client";
import { decrypt } from "../lib/crypto";
import { buildSkuMap } from "./sku-mapper";

export async function syncInventoryForShop(
  db: Database,
  env: Env,
  shop: typeof shops.$inferSelect,
  customer: typeof customers.$inferSelect
): Promise<{ updated: number; unchanged: number; failed: number; mapRefreshed: boolean }> {
  // Auto-refresh SKU map first
  let mapRefreshed = false;
  try {
    await buildSkuMap(db, env, shop, customer);
    mapRefreshed = true;
  } catch (e) {
    console.warn(`SKU map refresh failed for ${shop.name}: ${e}`);
  }

  const etsy = await EtsyClient.create(db, env, shop.id);
  const veeqoApiKey = await decrypt(customer.veeqoApiKey, env.ENCRYPTION_KEY);
  const veeqo = new VeeqoClient(veeqoApiKey);

  const maps = await db
    .select()
    .from(inventoryMap)
    .where(
      and(
        eq(inventoryMap.shopId, shop.id),
        isNotNull(inventoryMap.veeqoSellableId),
        isNotNull(inventoryMap.etsyListingId)
      )
    )
    .all();

  if (!maps.length) {
    return { updated: 0, unchanged: 0, failed: 0, mapRefreshed };
  }

  const stats = { updated: 0, unchanged: 0, failed: 0, mapRefreshed };

  // Group by Etsy listing
  const listings = new Map<number, typeof maps>();
  for (const m of maps) {
    const listingId = m.etsyListingId!;
    if (!listings.has(listingId)) listings.set(listingId, []);
    listings.get(listingId)!.push(m);
  }

  for (const [listingId, listingMaps] of listings) {
    try {
      const stockChanges = new Map<number, number>(); // etsyProductId → newQty

      for (const m of listingMaps) {
        const veeqoProduct = await veeqo.getProduct(m.veeqoProductId!);
        for (const sellable of veeqoProduct.sellables || []) {
          if (sellable.id === m.veeqoSellableId) {
            let available = 0;
            for (const wh of sellable.warehouse_stock_levels || []) {
              available += wh.sellable_on_hand_quantity || 0;
            }

            if (m.lastSyncedStock !== available) {
              stockChanges.set(m.etsyProductId!, available);
              await db
                .update(inventoryMap)
                .set({ lastSyncedStock: available, updatedAt: new Date().toISOString() })
                .where(eq(inventoryMap.id, m.id));
            }
            break;
          }
        }
      }

      if (stockChanges.size === 0) {
        stats.unchanged += listingMaps.length;
        continue;
      }

      // GET → modify → PUT
      const etsyInv = await etsy.getListingInventory(listingId);
      const products = etsyInv.products || [];
      let modified = false;

      for (const product of products) {
        const newQty = stockChanges.get(product.product_id);
        if (newQty !== undefined) {
          for (const offering of product.offerings || []) {
            offering.quantity = newQty;
          }
          modified = true;
        }
      }

      if (modified) {
        await etsy.updateListingInventory(listingId, { products });
        stats.updated += stockChanges.size;
      } else {
        stats.unchanged += listingMaps.length;
      }
    } catch (e) {
      stats.failed += listingMaps.length;
      console.error(`Inventory sync failed for listing ${listingId}: ${e}`);
    }
  }

  // Update cursor
  const now = new Date().toISOString();
  const cursor = await db
    .select()
    .from(syncCursors)
    .where(and(eq(syncCursors.shopId, shop.id), eq(syncCursors.syncType, "inventory")))
    .get();

  if (cursor) {
    await db
      .update(syncCursors)
      .set({ lastSyncAt: now, updatedAt: now })
      .where(eq(syncCursors.id, cursor.id));
  } else {
    await db.insert(syncCursors).values({
      shopId: shop.id,
      syncType: "inventory",
      lastSyncAt: now,
    });
  }

  return stats;
}
