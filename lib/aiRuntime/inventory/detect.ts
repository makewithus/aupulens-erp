import connectDB from "@/lib/db";
import mongoose from "mongoose";
import Product from "@/models/inventory/Product";
import Stock from "@/models/inventory/Stock";
import StockMove from "@/models/inventory/StockMove";
import Batch from "@/models/inventory/Batch";
import Invoice from "@/models/finance/Invoice";
import AiInventoryCount from "@/models/ai/AiInventoryCount";

/**
 * AI-11's real detectors (docs/ai/BRIEF-08a-BATCH-G.md, AI-11 algorithm). Every computation here
 * reads `Product`/`Stock`/`StockMove`/`Batch` directly — never posts, never adjusts. Confirmed via
 * research (not assumed): `Stock` is a signed ledger (`getOnHandQuantity` sums `quantity`
 * directly), `Stock.reference` matches the originating `StockMove.reference`, and no
 * weighted-average/FIFO computation exists anywhere else in this codebase — the WAC calculation
 * below is new, real, deterministic logic, not a wrapper over an existing one (there isn't one).
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** `Stock.ts`'s `IStock` doesn't declare `createdAt`/`updatedAt` even though the schema has
 *  `{ timestamps: true }` — a pre-existing gap in that model, not touched here (out of scope for
 *  AI-11). Local cast only, since the field is real at runtime. */
type StockLeanWithTimestamps = { createdAt: Date };

// ── Negative stock ──────────────────────────────────────────────────────────

export interface NegativeStockFinding {
  productId: string;
  productName: string;
  location: string;
  qty: number;
  causingSequence: { stockId: string; reference: string; type: string; quantity: number; runningBalance: number; date: Date }[];
}

export async function detectNegativeStock(tenantId: string): Promise<NegativeStockFinding[]> {
  await connectDB();
  const productIds: mongoose.Types.ObjectId[] = await Stock.distinct("product", { tenantId });
  const findings: NegativeStockFinding[] = [];

  for (const productId of productIds) {
    const entries = await Stock.find({ tenantId, product: productId }).sort({ createdAt: 1 }).lean();
    let running = 0;
    let wentNegativeAt = -1;
    const sequence: NegativeStockFinding["causingSequence"] = [];
    for (let i = 0; i < entries.length; i++) {
      running += entries[i].quantity;
      sequence.push({ stockId: String(entries[i]._id), reference: entries[i].reference, type: entries[i].type, quantity: entries[i].quantity, runningBalance: round2(running), date: new Date((entries[i] as unknown as StockLeanWithTimestamps).createdAt) });
      if (running < -0.0001 && wentNegativeAt === -1) wentNegativeAt = i;
    }
    if (wentNegativeAt === -1) continue;

    const product = await Product.findOne({ _id: productId, tenantId }).select("header").lean();
    findings.push({
      productId: String(productId),
      productName: product?.header?.name ?? "",
      location: entries[wentNegativeAt]?.warehouse ?? "",
      qty: round2(running),
      causingSequence: sequence.slice(0, wentNegativeAt + 1),
    });
  }
  return findings;
}

// ── Valuation anomalies (incl. weighted-average recompute) ─────────────────

export interface ValuationAnomaly {
  productId: string;
  productName: string;
  what: "zero_cost_with_quantity" | "cost_without_quantity" | "cost_swing";
  detail: string;
}

export interface WeightedAverageCost {
  productId: string;
  weightedAverageCost: number;
  onHandQty: number;
}

const COST_SWING_TOLERANCE = 0.25; // 25% — a documented heuristic, no tenant-specific tolerance policy exists

/** Real WAC computation — replays a product's StockMove receipt/issue history in date order.
 *  On a receipt: newAvg = (oldQty*oldAvg + receiptQty*receiptCost) / (oldQty+receiptQty). On an
 *  issue: average is unchanged, only quantity drops. This is genuinely new logic — confirmed
 *  (docs/ai/SYSTEM_INVENTORY.md) nothing else in this codebase computes a weighted-average cost. */
export async function computeWeightedAverageCost(tenantId: string, productId: string): Promise<WeightedAverageCost> {
  await connectDB();
  const moves = await StockMove.find({ tenantId, moveStatus: { $ne: "cancelled" }, "lines.productId": productId })
    .select("moveType effectiveDate createdAt lines")
    .sort({ effectiveDate: 1, createdAt: 1 })
    .lean();

  let qty = 0;
  let avgCost = 0;
  for (const move of moves) {
    for (const line of move.lines ?? []) {
      if (String((line as { productId?: unknown }).productId) !== productId) continue;
      const lineQty = (line as { done?: number; demand?: number }).done || (line as { demand?: number }).demand || 0;
      const unitCost = (line as { unitCost?: number }).unitCost ?? 0;
      if (move.moveType === "incoming") {
        const newQty = qty + lineQty;
        avgCost = newQty > 0 ? (qty * avgCost + lineQty * unitCost) / newQty : unitCost;
        qty = newQty;
      } else if (move.moveType === "outgoing") {
        qty = Math.max(0, qty - lineQty);
      }
    }
  }
  return { productId, weightedAverageCost: round2(avgCost), onHandQty: round2(qty) };
}

export async function detectValuationAnomalies(tenantId: string): Promise<ValuationAnomaly[]> {
  await connectDB();
  const findings: ValuationAnomaly[] = [];
  const products = await Product.find({ tenantId }).select("header tab_general_information").lean();

  for (const p of products) {
    const cost = p.tab_general_information?.standard_price ?? 0;
    const wac = await computeWeightedAverageCost(tenantId, String(p._id));
    if (wac.onHandQty > 0 && cost === 0) {
      findings.push({ productId: String(p._id), productName: p.header?.name ?? "", what: "zero_cost_with_quantity", detail: `${wac.onHandQty} unit(s) on hand with zero standard_price` });
    }
    if (wac.onHandQty === 0 && cost > 0) {
      // Not itself an anomaly worth flagging (cost without quantity is normal for a discontinued item) —
      // only flag when the weighted-average cost materially disagrees with the stated standard cost.
    }
    if (wac.onHandQty > 0 && cost > 0 && wac.weightedAverageCost > 0) {
      const swing = Math.abs(wac.weightedAverageCost - cost) / cost;
      if (swing >= COST_SWING_TOLERANCE) {
        findings.push({ productId: String(p._id), productName: p.header?.name ?? "", what: "cost_swing", detail: `standard_price ${cost} vs weighted-average ${wac.weightedAverageCost} (${round2(swing * 100)}% apart)` });
      }
    }
  }
  return findings;
}

// ── Count variances ──────────────────────────────────────────────────────────

export interface CountVariance {
  productId: string;
  productName: string;
  countedQty: number;
  systemQty: number;
  variance: number;
  valuedAt: number;
  countedAt: Date;
}

export async function detectCountVariances(tenantId: string): Promise<CountVariance[]> {
  await connectDB();
  const counts = await AiInventoryCount.find({ tenantId }).sort({ countedAt: -1 }).lean();
  const seenProducts = new Set<string>();
  const findings: CountVariance[] = [];

  for (const count of counts) {
    const productId = String(count.productId);
    if (seenProducts.has(productId)) continue; // only the most recent count per product
    seenProducts.add(productId);

    const rows = await Stock.aggregate([
      { $match: { tenantId, product: new mongoose.Types.ObjectId(productId) } },
      { $group: { _id: null, total: { $sum: "$quantity" } } },
    ]);
    const systemQty = rows[0]?.total ?? 0;
    const variance = round2(count.countedQty - systemQty);
    if (Math.abs(variance) < 0.0001) continue;

    const wac = await computeWeightedAverageCost(tenantId, productId);
    const product = await Product.findOne({ _id: productId, tenantId }).select("header").lean();
    findings.push({ productId, productName: product?.header?.name ?? "", countedQty: count.countedQty, systemQty: round2(systemQty), variance, valuedAt: round2(variance * wac.weightedAverageCost), countedAt: new Date(count.countedAt) });
  }
  return findings;
}

// ── Obsolescence / slow-moving ───────────────────────────────────────────────

export interface SlowMovingFinding {
  productId: string;
  productName: string;
  what: "no_recent_movement" | "expiring_batch";
  detail: string;
}

const STALE_MOVEMENT_DAYS = 180;
const EXPIRY_WARNING_DAYS = 30;

export async function detectSlowMoving(tenantId: string): Promise<SlowMovingFinding[]> {
  await connectDB();
  const findings: SlowMovingFinding[] = [];
  const now = Date.now();

  const productIds: mongoose.Types.ObjectId[] = await Stock.distinct("product", { tenantId });
  for (const productId of productIds) {
    const latest = await Stock.findOne({ tenantId, product: productId }).sort({ createdAt: -1 }).lean();
    if (!latest) continue;
    const ageDays = Math.floor((now - new Date((latest as unknown as StockLeanWithTimestamps).createdAt).getTime()) / (24 * 60 * 60 * 1000));
    if (ageDays >= STALE_MOVEMENT_DAYS) {
      const product = await Product.findOne({ _id: productId, tenantId }).select("header").lean();
      findings.push({ productId: String(productId), productName: product?.header?.name ?? "", what: "no_recent_movement", detail: `no stock movement in ${ageDays} day(s)` });
    }
  }

  const expiringBatches = await Batch.find({ tenantId, expiryDate: { $gte: new Date(now), $lte: new Date(now + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000) } })
    .select("itemName expiryDate batchNumber")
    .lean();
  for (const b of expiringBatches) {
    findings.push({ productId: b.batchNumber, productName: b.itemName, what: "expiring_batch", detail: `batch ${b.batchNumber} expires ${new Date(b.expiryDate!).toISOString().slice(0, 10)}` });
  }

  return findings;
}

// ── Margin analysis (feeds AI-15's ratio/trend detector family, never a new alert path) ─────

export interface MarginByProduct {
  productId: string;
  productName: string;
  currentMarginPercent: number | null;
  priorMarginPercent: number | null;
}

async function marginForPeriod(tenantId: string, productId: string, start: Date, end: Date, costByProduct: Map<string, number>): Promise<number | null> {
  const invoices = await Invoice.find({ tenantId, moveType: "out_invoice", invoiceDate: { $gte: start, $lte: end }, state: { $ne: "cancelled" } })
    .select("invoiceLines")
    .lean();
  let revenue = 0;
  let units = 0;
  for (const inv of invoices) {
    for (const line of inv.invoiceLines ?? []) {
      if (String((line as { productId?: unknown }).productId) !== productId) continue;
      revenue += (line as { priceSubtotal?: number }).priceSubtotal ?? 0;
      units += (line as { quantity?: number }).quantity ?? 0;
    }
  }
  if (revenue <= 0 || units <= 0) return null;
  const cost = costByProduct.get(productId) ?? 0;
  const estimatedCogs = units * cost;
  return round2(((revenue - estimatedCogs) / revenue) * 100);
}

/** Estimated, not exact — no real COGS-on-fulfillment posting path exists anywhere in this
 *  codebase (confirmed by research, docs/ai/SYSTEM_INVENTORY.md), so this uses
 *  `Product.tab_general_information.standard_price` × units sold as the cost estimate. Documented
 *  as an estimate throughout, never presented as a real posted figure. */
export async function computeMarginByProduct(tenantId: string, now: Date = new Date()): Promise<MarginByProduct[]> {
  await connectDB();
  const products = await Product.find({ tenantId }).select("header tab_general_information").lean();
  const costByProduct = new Map(products.map((p) => [String(p._id), p.tab_general_information?.standard_price ?? 0]));

  const curStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const curEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const priorStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const priorEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));

  const results: MarginByProduct[] = [];
  for (const p of products) {
    const productId = String(p._id);
    const currentMarginPercent = await marginForPeriod(tenantId, productId, curStart, curEnd, costByProduct);
    if (currentMarginPercent === null) continue;
    const priorMarginPercent = await marginForPeriod(tenantId, productId, priorStart, priorEnd, costByProduct);
    results.push({ productId, productName: p.header?.name ?? "", currentMarginPercent, priorMarginPercent });
  }
  return results;
}
