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

// Chunk 10 (P0.3, docs/ai/BRIEF-10-PRE-QA.md / docs/ai/verification/AI-11.md §4/§9): this used to
// issue one `Stock.find()` per distinct product, plus one `Product.findOne()` per FLAGGED
// product — O(products) round trips for a computation that only needs the tenant's entire `Stock`
// ledger once. Root-cause fix: fetch every `Stock` row for the tenant in a single query, sorted
// by `(product, createdAt)` so each product's own entries arrive already grouped and in
// chronological order, then replay the running-balance logic in memory per product exactly as
// before. The one remaining query fetches all FLAGGED products' names in a single `$in` lookup
// instead of one `findOne` per flagged product.
export async function detectNegativeStock(tenantId: string): Promise<NegativeStockFinding[]> {
  await connectDB();
  const entries = await Stock.find({ tenantId }).sort({ product: 1, createdAt: 1 }).lean();

  const perProduct = new Map<string, { location: string; qty: number; causingSequence: NegativeStockFinding["causingSequence"] }>();
  let currentProductId: string | null = null;
  let running = 0;
  let wentNegativeAt = -1;
  let sequence: NegativeStockFinding["causingSequence"] = [];
  let currentEntries: typeof entries = [];

  const flush = () => {
    if (currentProductId !== null && wentNegativeAt !== -1) {
      perProduct.set(currentProductId, {
        location: currentEntries[wentNegativeAt]?.warehouse ?? "",
        qty: round2(running),
        causingSequence: sequence.slice(0, wentNegativeAt + 1),
      });
    }
  };

  for (const entry of entries) {
    const pid = String(entry.product);
    if (pid !== currentProductId) {
      flush();
      currentProductId = pid;
      running = 0;
      wentNegativeAt = -1;
      sequence = [];
      currentEntries = [];
    }
    currentEntries.push(entry);
    running += entry.quantity;
    sequence.push({ stockId: String(entry._id), reference: entry.reference, type: entry.type, quantity: entry.quantity, runningBalance: round2(running), date: new Date((entry as unknown as StockLeanWithTimestamps).createdAt) });
    if (running < -0.0001 && wentNegativeAt === -1) wentNegativeAt = sequence.length - 1;
  }
  flush();

  const findings: NegativeStockFinding[] = [];
  if (perProduct.size > 0) {
    const flaggedIds = Array.from(perProduct.keys()).map((id) => new mongoose.Types.ObjectId(id));
    const products = await Product.find({ tenantId, _id: { $in: flaggedIds } }).select("header").lean();
    const productById = new Map(products.map((p) => [String(p._id), p]));
    for (const [productId, result] of perProduct) {
      findings.push({ productId, productName: productById.get(productId)?.header?.name ?? "", location: result.location, qty: result.qty, causingSequence: result.causingSequence });
    }
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

interface WacStep {
  moveType: string;
  lineQty: number;
  unitCost: number;
}

/** Pure replay of the WAC recurrence over one product's already-extracted, already-chronological
 *  steps — shared by both the single-product and bulk paths below so the two can never drift. */
function replayWeightedAverageCost(productId: string, steps: WacStep[]): WeightedAverageCost {
  let qty = 0;
  let avgCost = 0;
  for (const step of steps) {
    if (step.moveType === "incoming") {
      const newQty = qty + step.lineQty;
      avgCost = newQty > 0 ? (qty * avgCost + step.lineQty * step.unitCost) / newQty : step.unitCost;
      qty = newQty;
    } else if (step.moveType === "outgoing") {
      qty = Math.max(0, qty - step.lineQty);
    }
  }
  return { productId, weightedAverageCost: round2(avgCost), onHandQty: round2(qty) };
}

/** Real WAC computation — replays a product's StockMove receipt/issue history in date order.
 *  On a receipt: newAvg = (oldQty*oldAvg + receiptQty*receiptCost) / (oldQty+receiptQty). On an
 *  issue: average is unchanged, only quantity drops. This is genuinely new logic — confirmed
 *  (docs/ai/SYSTEM_INVENTORY.md) nothing else in this codebase computes a weighted-average cost.
 *  Public single-product API, unchanged in shape/behavior — used directly by other callers
 *  (e.g. `tests/ai/aiRuntime/ai11InventoryCogs.test.ts`) that only need one product's figure. */
export async function computeWeightedAverageCost(tenantId: string, productId: string): Promise<WeightedAverageCost> {
  await connectDB();
  const moves = await StockMove.find({ tenantId, moveStatus: { $ne: "cancelled" }, "lines.productId": productId })
    .select("moveType effectiveDate createdAt lines")
    .sort({ effectiveDate: 1, createdAt: 1 })
    .lean();

  const steps: WacStep[] = [];
  for (const move of moves) {
    for (const line of move.lines ?? []) {
      if (String((line as { productId?: unknown }).productId) !== productId) continue;
      steps.push({
        moveType: move.moveType,
        lineQty: (line as { done?: number; demand?: number }).done || (line as { demand?: number }).demand || 0,
        unitCost: (line as { unitCost?: number }).unitCost ?? 0,
      });
    }
  }
  return replayWeightedAverageCost(productId, steps);
}

// Chunk 10 (P0.3): the tenant-wide equivalent of the function above — fetches EVERY non-cancelled
// StockMove for the tenant exactly ONCE (instead of once per product), groups each move's lines by
// productId in a single pass (already in chronological order, since the query itself is sorted),
// then replays the same WAC recurrence per product purely in memory. Used by every detector below
// that previously called `computeWeightedAverageCost()` inside a per-product loop.
async function computeWeightedAverageCostBulk(tenantId: string): Promise<Map<string, WeightedAverageCost>> {
  await connectDB();
  const moves = await StockMove.find({ tenantId, moveStatus: { $ne: "cancelled" } })
    .select("moveType effectiveDate createdAt lines")
    .sort({ effectiveDate: 1, createdAt: 1 })
    .lean();

  const stepsByProduct = new Map<string, WacStep[]>();
  for (const move of moves) {
    for (const line of move.lines ?? []) {
      const rawProductId = (line as { productId?: unknown }).productId;
      if (!rawProductId) continue;
      const pid = String(rawProductId);
      const step: WacStep = {
        moveType: move.moveType,
        lineQty: (line as { done?: number; demand?: number }).done || (line as { demand?: number }).demand || 0,
        unitCost: (line as { unitCost?: number }).unitCost ?? 0,
      };
      const existing = stepsByProduct.get(pid);
      if (existing) existing.push(step);
      else stepsByProduct.set(pid, [step]);
    }
  }

  const result = new Map<string, WeightedAverageCost>();
  for (const [productId, steps] of stepsByProduct) {
    result.set(productId, replayWeightedAverageCost(productId, steps));
  }
  return result;
}

const ZERO_WAC = (productId: string): WeightedAverageCost => ({ productId, weightedAverageCost: 0, onHandQty: 0 });

export async function detectValuationAnomalies(tenantId: string): Promise<ValuationAnomaly[]> {
  await connectDB();
  const findings: ValuationAnomaly[] = [];
  const [products, wacByProduct] = await Promise.all([
    Product.find({ tenantId }).select("header tab_general_information").lean(),
    computeWeightedAverageCostBulk(tenantId),
  ]);

  for (const p of products) {
    const productId = String(p._id);
    const cost = p.tab_general_information?.standard_price ?? 0;
    const wac = wacByProduct.get(productId) ?? ZERO_WAC(productId);
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

// Chunk 10 (P0.3): used to run a `Stock.aggregate()`, a `computeWeightedAverageCost()` (itself a
// full StockMove query), AND a `Product.findOne()` — THREE round trips — per counted product.
// Root-cause fix: resolve the (small) set of most-recently-counted products first, then fetch
// system quantities, weighted-average costs, and product names each with exactly ONE bulk
// query/computation for the whole set, regardless of how many products were counted.
export async function detectCountVariances(tenantId: string): Promise<CountVariance[]> {
  await connectDB();
  const counts = await AiInventoryCount.find({ tenantId }).sort({ countedAt: -1 }).lean();
  const seenProducts = new Set<string>();
  const latestCounts: typeof counts = [];
  for (const count of counts) {
    const productId = String(count.productId);
    if (seenProducts.has(productId)) continue; // only the most recent count per product
    seenProducts.add(productId);
    latestCounts.push(count);
  }
  if (latestCounts.length === 0) return [];

  const productObjectIds = latestCounts.map((c) => new mongoose.Types.ObjectId(String(c.productId)));
  const [systemQtyRows, wacByProduct, products] = await Promise.all([
    Stock.aggregate([
      { $match: { tenantId, product: { $in: productObjectIds } } },
      { $group: { _id: "$product", total: { $sum: "$quantity" } } },
    ]),
    computeWeightedAverageCostBulk(tenantId),
    Product.find({ tenantId, _id: { $in: productObjectIds } }).select("header").lean(),
  ]);
  const systemQtyByProduct = new Map(systemQtyRows.map((r) => [String(r._id), r.total as number]));
  const productById = new Map(products.map((p) => [String(p._id), p]));

  const findings: CountVariance[] = [];
  for (const count of latestCounts) {
    const productId = String(count.productId);
    const systemQty = systemQtyByProduct.get(productId) ?? 0;
    const variance = round2(count.countedQty - systemQty);
    if (Math.abs(variance) < 0.0001) continue;

    const wac = wacByProduct.get(productId) ?? ZERO_WAC(productId);
    const product = productById.get(productId);
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

// Chunk 10 (P0.3, docs/ai/BRIEF-10-PRE-QA.md): this used to run TWO round trips (Stock.findOne,
// Product.findOne) per distinct product — found and fixed while re-verifying this pass's own
// P0.3 claim that this function was already bulk (it wasn't). Root-cause fix: one aggregation
// gets each product's own latest stock-movement timestamp in a single pass; one bulk Product.find
// resolves names for only the products that actually turn out stale.
export async function detectSlowMoving(tenantId: string): Promise<SlowMovingFinding[]> {
  await connectDB();
  const findings: SlowMovingFinding[] = [];
  const now = Date.now();

  const latestByProduct = await Stock.aggregate([
    { $match: { tenantId } },
    { $group: { _id: "$product", latestCreatedAt: { $max: "$createdAt" } } },
  ]);
  const staleProductIds: mongoose.Types.ObjectId[] = [];
  const ageDaysByProduct = new Map<string, number>();
  for (const row of latestByProduct) {
    const ageDays = Math.floor((now - new Date(row.latestCreatedAt).getTime()) / (24 * 60 * 60 * 1000));
    if (ageDays >= STALE_MOVEMENT_DAYS) {
      staleProductIds.push(row._id);
      ageDaysByProduct.set(String(row._id), ageDays);
    }
  }
  if (staleProductIds.length > 0) {
    const products = await Product.find({ tenantId, _id: { $in: staleProductIds } }).select("header").lean();
    const productById = new Map(products.map((p) => [String(p._id), p]));
    for (const productId of staleProductIds) {
      const key = String(productId);
      const product = productById.get(key);
      findings.push({ productId: key, productName: product?.header?.name ?? "", what: "no_recent_movement", detail: `no stock movement in ${ageDaysByProduct.get(key)} day(s)` });
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

/** One bulk aggregation for an entire period, grouped by product — replaces what used to be a
 *  separate `Invoice.find()` PER PRODUCT that re-scanned the whole period's invoice set every
 *  time (see `computeMarginByProduct`'s own fix note below). */
async function revenueAndUnitsByProduct(tenantId: string, start: Date, end: Date): Promise<Map<string, { revenue: number; units: number }>> {
  const rows = await Invoice.aggregate([
    { $match: { tenantId, moveType: "out_invoice", invoiceDate: { $gte: start, $lte: end }, state: { $ne: "cancelled" } } },
    { $unwind: "$invoiceLines" },
    { $group: { _id: "$invoiceLines.productId", revenue: { $sum: "$invoiceLines.priceSubtotal" }, units: { $sum: "$invoiceLines.quantity" } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), { revenue: r.revenue as number, units: r.units as number }]));
}

function marginFromTotals(totals: { revenue: number; units: number } | undefined, cost: number): number | null {
  if (!totals || totals.revenue <= 0 || totals.units <= 0) return null;
  const estimatedCogs = totals.units * cost;
  return round2(((totals.revenue - estimatedCogs) / totals.revenue) * 100);
}

/** Estimated, not exact — no real COGS-on-fulfillment posting path exists anywhere in this
 *  codebase (confirmed by research, docs/ai/SYSTEM_INVENTORY.md), so this uses
 *  `Product.tab_general_information.standard_price` × units sold as the cost estimate. Documented
 *  as an estimate throughout, never presented as a real posted figure.
 *
 *  Chunk 10 (P0.3, docs/ai/BRIEF-10-PRE-QA.md / docs/ai/verification/AI-11.md §9): this used to
 *  call a per-product `marginForPeriod()` TWICE (current + prior month) for EVERY product, and
 *  each call re-ran a full-period `Invoice.find()` with no productId filter — an O(products ×
 *  invoices-in-period) shape, the worst of AI-11's four detectors. Root-cause fix: one bulk
 *  aggregation per period (current, prior), grouped by product server-side, regardless of how
 *  many products exist — 2 round trips total instead of up to 2×N. */
export async function computeMarginByProduct(tenantId: string, now: Date = new Date()): Promise<MarginByProduct[]> {
  await connectDB();
  const products = await Product.find({ tenantId }).select("header tab_general_information").lean();

  const curStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const curEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const priorStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const priorEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999));

  const [currentByProduct, priorByProduct] = await Promise.all([
    revenueAndUnitsByProduct(tenantId, curStart, curEnd),
    revenueAndUnitsByProduct(tenantId, priorStart, priorEnd),
  ]);

  const results: MarginByProduct[] = [];
  for (const p of products) {
    const productId = String(p._id);
    const cost = p.tab_general_information?.standard_price ?? 0;
    const currentMarginPercent = marginFromTotals(currentByProduct.get(productId), cost);
    if (currentMarginPercent === null) continue;
    const priorMarginPercent = marginFromTotals(priorByProduct.get(productId), cost);
    results.push({ productId, productName: p.header?.name ?? "", currentMarginPercent, priorMarginPercent });
  }
  return results;
}
