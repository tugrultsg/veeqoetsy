const CARRIER_MAP: Record<string, string> = {
  usps: "USPS",
  ups: "UPS",
  fedex: "FedEx",
  dhl: "DHL",
  "dhl-express": "DHL Express",
  "royal-mail": "Royal Mail",
  "canada-post": "Canada Post",
  "australia-post": "Australia Post",
  other: "other",
};

export function etsyMoneyToFloat(money: { amount: number; divisor: number } | null): number {
  if (!money) return 0;
  return money.amount / money.divisor;
}

export function mapEtsyReceiptToVeeqoOrder(
  receipt: any,
  channelId: number,
  deliveryMethodId: number,
  skuToSellable: Map<string, number>
): {
  payload: Record<string, any>;
  skippedSkus: string[];
} | null {
  const transactions = receipt.transactions || [];
  if (!transactions.length) return null;

  const lineItems: { sellable_id: number; price_per_unit: number; quantity: number }[] = [];
  const skippedSkus: string[] = [];

  for (const txn of transactions) {
    const sku = (txn.sku || "").trim() || `ETSY-${txn.listing_id || "UNKNOWN"}`;
    const sellableId = skuToSellable.get(sku);

    if (!sellableId) {
      skippedSkus.push(sku);
      continue;
    }

    lineItems.push({
      sellable_id: sellableId,
      price_per_unit: etsyMoneyToFloat(txn.price),
      quantity: txn.quantity || 1,
    });
  }

  if (!lineItems.length) return null;

  const name = receipt.name || "";
  const parts = name.split(" ", 2);
  const firstName = parts[0] || "";
  const lastName = parts[1] || "";

  const payload: Record<string, any> = {
    channel_id: channelId,
    delivery_method_id: deliveryMethodId,
    line_items_attributes: lineItems,
    customer_attributes: {
      full_name: name,
      email: receipt.buyer_email || "",
      phone: receipt.buyer_phone || "",
    },
    deliver_to_attributes: {
      first_name: firstName,
      last_name: lastName,
      address1: receipt.first_line || "",
      address2: receipt.second_line || "",
      city: receipt.city || "",
      state: receipt.state || "",
      zip: receipt.zip || "",
      country: receipt.country_iso || "",
      phone: receipt.buyer_phone || "",
    },
    number: String(receipt.receipt_id),
    delivery_cost: etsyMoneyToFloat(receipt.total_shipping_cost),
    total_tax: etsyMoneyToFloat(receipt.total_tax_cost),
    total_discounts: etsyMoneyToFloat(receipt.discount_amt),
    payment_attributes: { payment_type: "etsy" },
  };

  if (receipt.message_from_buyer) {
    payload.customer_note_attributes = { text: receipt.message_from_buyer };
  }

  const notes: { text: string }[] = [];
  if (skippedSkus.length) {
    notes.push({ text: `Skipped SKUs: ${skippedSkus.join(", ")}` });
  }
  if (notes.length) {
    payload.employee_notes_attributes = notes;
  }

  return { payload, skippedSkus };
}

export function normalizeCarrierName(veeqoCarrier: string): string {
  const lower = veeqoCarrier.toLowerCase().trim();

  for (const [key, value] of Object.entries(CARRIER_MAP)) {
    if (lower.includes(key)) return value;
  }

  if (lower.includes("united states postal")) return "USPS";
  if (lower.includes("federal express")) return "FedEx";

  console.warn(`Unknown carrier '${veeqoCarrier}', using 'other'`);
  return "other";
}
