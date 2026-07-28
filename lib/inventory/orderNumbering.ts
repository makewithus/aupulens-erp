import Counter from "@/models/Counter";

const PREFIX = "ORD-";

/**
 * Atomic per-tenant order-number generator for Inventory fulfillment orders
 * (models/InventoryOrder.ts) — same Counter-based race-safe pattern as
 * lib/sales/invoiceNumbering.ts, kept separate rather than reused directly
 * since Inventory Orders have no Document Settings page to configure a
 * custom prefix from (fixed "ORD-" prefix), and reusing invoiceNumbering's
 * getNextSequence would share its "invoice:" counter namespace, which is
 * semantically wrong for a different document type.
 */
export async function generateInventoryOrderNumber(tenantId: string): Promise<string> {
  const counter = await Counter.findOneAndUpdate(
    { tenantId, key: `inventoryOrder:${PREFIX}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  return `${PREFIX}${String(counter!.seq).padStart(4, "0")}`;
}
