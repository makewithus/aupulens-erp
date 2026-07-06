import mongoose from "mongoose";
import Stock from "@/models/Stock";
import Product from "@/models/Product";

/**
 * Returns the current aggregated on-hand quantity for a product within a
 * tenant — the same {tenantId, product} scope GET /api/inventory/stock
 * already aggregates over (this system has no per-warehouse on-hand
 * tracking today, so the guard matches that existing scope).
 */
export async function getOnHandQuantity(tenantId: string, productId: string): Promise<number> {
  const result = await Stock.aggregate([
    { $match: { tenantId, product: new mongoose.Types.ObjectId(productId) } },
    { $group: { _id: null, total: { $sum: "$quantity" } } },
  ]);
  return result[0]?.total ?? 0;
}

/**
 * Rejects new stock movements that would take a product's on-hand quantity
 * below zero, unless the product has explicitly opted in via
 * Product.allowNegativeStock (default false). Only guards NEW movements —
 * never retroactively flags/blocks existing negative balances.
 */
export async function checkNegativeStockGuard(
  tenantId: string,
  productId: string,
  delta: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (delta >= 0) return { ok: true }; // stock increases never need this guard

  const product = await Product.findOne({ _id: productId, tenantId }).select("allowNegativeStock header.name").lean();
  if ((product as any)?.allowNegativeStock) return { ok: true };

  const onHand = await getOnHandQuantity(tenantId, productId);
  const resultingQuantity = onHand + delta;

  if (resultingQuantity < 0) {
    const name = (product as any)?.header?.name || productId;
    return {
      ok: false,
      message: `Insufficient stock for "${name}": on hand ${onHand}, this movement would result in ${resultingQuantity}.`,
    };
  }

  return { ok: true };
}
