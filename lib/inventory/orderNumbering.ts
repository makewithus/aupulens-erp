import Counter from "@/models/Counter";
import InventoryOrder from "@/models/InventoryOrder";

const PREFIX = "ORD-";
const MAX_ATTEMPTS = 50;

/**
 * Atomic per-tenant order-number generator for Inventory fulfillment orders
 * (models/InventoryOrder.ts) — same Counter-based race-safe pattern as
 * lib/sales/invoiceNumbering.ts, kept separate rather than reused directly
 * since Inventory Orders have no Document Settings page to configure a
 * custom prefix from (fixed "ORD-" prefix), and reusing invoiceNumbering's
 * getNextSequence would share its "invoice:" counter namespace, which is
 * semantically wrong for a different document type.
 *
 * Skips past any number that's already in use before returning it. This
 * matters for tenants with orders created before this counter existed (an
 * earlier version of the order form let the number be typed manually, so a
 * fresh counter starting at 1 could collide with a pre-existing "ORD-0001").
 */
export async function generateInventoryOrderNumber(tenantId: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const counter = await Counter.findOneAndUpdate(
      { tenantId, key: `inventoryOrder:${PREFIX}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true },
    );
    const candidate = `${PREFIX}${String(counter!.seq).padStart(4, "0")}`;
    const exists = await InventoryOrder.exists({ tenantId, orderNumber: candidate });
    if (!exists) return candidate;
  }
  throw new Error("Could not generate a unique order number. Please try again.");
}
