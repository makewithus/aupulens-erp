import mongoose from "mongoose";
import Stock from "@/models/inventory/Stock";
import Product from "@/models/inventory/Product";

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

/**
 * Same guard as checkNegativeStockGuard, batched for a whole outgoing move's
 * lines — one Product lookup and one Stock aggregate for every line instead
 * of 2 round trips per line. Each line is still evaluated independently
 * against the same on-hand snapshot (matching the original per-line
 * behavior: nothing is actually decremented between checks, so two lines
 * referencing the same product were never checked cumulatively either).
 * Returns results in the same order as `lines`.
 */
export async function checkNegativeStockGuardBatch(
  tenantId: string,
  lines: { productId: string; delta: number }[],
): Promise<Array<{ ok: true } | { ok: false; message: string }>> {
  const relevantIds = Array.from(
    new Set(lines.filter((l) => l.delta < 0).map((l) => l.productId)),
  );

  if (relevantIds.length === 0) return lines.map(() => ({ ok: true as const }));

  const [products, onHandAgg] = await Promise.all([
    Product.find({ _id: { $in: relevantIds }, tenantId })
      .select("allowNegativeStock header.name")
      .lean(),
    Stock.aggregate([
      {
        $match: {
          tenantId,
          product: { $in: relevantIds.map((id) => new mongoose.Types.ObjectId(id)) },
        },
      },
      { $group: { _id: "$product", total: { $sum: "$quantity" } } },
    ]),
  ]);

  const productMap = new Map(products.map((p: any) => [String(p._id), p]));
  const onHandMap = new Map(onHandAgg.map((r: any) => [String(r._id), r.total]));

  return lines.map((line) => {
    if (line.delta >= 0) return { ok: true };

    const product = productMap.get(line.productId);
    if ((product as any)?.allowNegativeStock) return { ok: true };

    const onHand = onHandMap.get(line.productId) ?? 0;
    const resultingQuantity = onHand + line.delta;

    if (resultingQuantity < 0) {
      const name = (product as any)?.header?.name || line.productId;
      return {
        ok: false,
        message: `Insufficient stock for "${name}": on hand ${onHand}, this movement would result in ${resultingQuantity}.`,
      };
    }

    return { ok: true };
  });
}
