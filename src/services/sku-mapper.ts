import { Database } from "../db/client";
import { Env } from "../env";
import { shops, customers, inventoryMap } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { EtsyClient } from "./etsy-client";
import { VeeqoClient } from "./veeqo-client";
import { decrypt } from "../lib/crypto";

export async function buildSkuMap(
  db: Database,
  env: Env,
  shop: typeof shops.$inferSelect,
  customer: typeof customers.$inferSelect
): Promise<{ matched: number; veeqoOnly: number; etsyOnly: number }> {
  const etsy = await EtsyClient.create(db, env, shop.id);
  const veeqoApiKey = await decrypt(customer.veeqoApiKey, env.ENCRYPTION_KEY);
  const veeqo = new VeeqoClient(veeqoApiKey);

  // 1. Collect Veeqo SKUs
  const veeqoSkus = new Map<string, { productId: number; sellableId: number }>();
  let page = 1;
  while (true) {
    const products = await veeqo.getProducts(page, 100);
    if (!products.length) break;
    for (const product of products) {
      for (const sellable of product.sellables || []) {
        const sku = (sellable.sku_code || "").trim();
        if (sku) {
          veeqoSkus.set(sku, { productId: product.id, sellableId: sellable.id });
        }
      }
    }
    if (products.length < 100) break;
    page++;
  }

  // 2. Collect Etsy SKUs
  const etsySkus = new Map<string, { listingId: number; productId: number }>();
  let offset = 0;
  while (true) {
    const data = await etsy.getListings({ state: "active", limit: 100, offset });
    const listings = data.results || [];
    if (!listings.length) break;

    for (const listing of listings) {
      try {
        const inv = await etsy.getListingInventory(listing.listing_id);
        for (const product of inv.products || []) {
          const sku = (product.sku || "").trim();
          if (sku) {
            etsySkus.set(sku, { listingId: listing.listing_id, productId: product.product_id });
          }
        }
      } catch (e) {
        console.warn(`Failed inventory for listing ${listing.listing_id}: ${e}`);
      }
    }

    offset += 100;
    if (offset >= (data.count || 0)) break;
  }

  // 3. Match and store
  let matched = 0;
  const veeqoOnly: string[] = [];
  const etsyOnly: string[] = [];

  const allSkus = new Set([...veeqoSkus.keys(), ...etsySkus.keys()]);

  for (const sku of allSkus) {
    const v = veeqoSkus.get(sku);
    const e = etsySkus.get(sku);

    if (v && e) {
      // Upsert
      const existing = await db
        .select()
        .from(inventoryMap)
        .where(and(eq(inventoryMap.shopId, shop.id), eq(inventoryMap.sku, sku)))
        .get();

      if (existing) {
        await db
          .update(inventoryMap)
          .set({
            veeqoProductId: v.productId,
            veeqoSellableId: v.sellableId,
            etsyListingId: e.listingId,
            etsyProductId: e.productId,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(inventoryMap.id, existing.id));
      } else {
        await db.insert(inventoryMap).values({
          shopId: shop.id,
          sku,
          veeqoProductId: v.productId,
          veeqoSellableId: v.sellableId,
          etsyListingId: e.listingId,
          etsyProductId: e.productId,
        });
      }
      matched++;
    } else if (v) {
      veeqoOnly.push(sku);
    } else {
      etsyOnly.push(sku);
    }
  }

  return { matched, veeqoOnly: veeqoOnly.length, etsyOnly: etsyOnly.length };
}
