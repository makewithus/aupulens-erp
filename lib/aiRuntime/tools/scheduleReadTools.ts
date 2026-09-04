import connectDB from "@/lib/db";
import mongoose from "mongoose";
import PurchaseOrder from "@/models/finance/PurchaseOrder";
import StockMove from "@/models/inventory/StockMove";
import Asset from "@/models/finance/Asset";
import SaleOrder from "@/models/sales/SaleOrder";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import AiSchedule from "@/models/ai/AiSchedule";
import { AI_AUTONOMY_LEVEL, AI_TOOL_SIDE_EFFECT, STOCK_MOVE_STATUS } from "@/lib/constants/statuses";
import { registerTool } from "@/lib/aiRuntime/tools/registry";
import { computeMonthlyDepreciation } from "@/lib/accounting/depreciation";

/**
 * Batch B Read + Analyse tools (docs/ai/BRIEF-03-BATCH-B.md B.3). `get_sale_order` and
 * `get_sales_invoice` are structurally read-only — no write method exists on either wrapper at
 * all (docs/ai/BRIEF-02-BATCH-A.md A.1's Sales-module boundary, extended per A.2 of this batch:
 * AI-09 may read Sales, never write it). Verified by a source-grep test in
 * tests/ai/aiRuntime/ai09RevenueRecognition.test.ts, matching the existing safety.test.ts style.
 */

export async function getPurchaseOrderHandler(args: { tenantId: string; purchaseOrderId?: string; openOnly?: boolean }) {
  await connectDB();
  if (args.purchaseOrderId) {
    return PurchaseOrder.findOne({ _id: args.purchaseOrderId, tenantId: args.tenantId }).lean();
  }
  const orders = await PurchaseOrder.find({ tenantId: args.tenantId }).limit(500).lean();
  if (!args.openOnly) return orders;
  return orders
    .map((o) => ({ ...o, orderLines: (o.orderLines ?? []).filter((l: { receivedQty: number; billedQty: number }) => l.receivedQty !== l.billedQty) }))
    .filter((o) => o.orderLines.length > 0);
}

export async function getStockMovesHandler(args: { tenantId: string; moveStatus?: string; sinceDate?: string }) {
  await connectDB();
  const query: Record<string, unknown> = { tenantId: args.tenantId };
  if (args.moveStatus) query.moveStatus = args.moveStatus;
  if (args.sinceDate) query.effectiveDate = { $gte: new Date(args.sinceDate) };
  return StockMove.find(query).sort({ effectiveDate: -1 }).limit(500).lean();
}

export async function getAssetHandler(args: { tenantId: string; assetId?: string }) {
  await connectDB();
  if (args.assetId) return Asset.findOne({ _id: args.assetId, tenantId: args.tenantId }).lean();
  return Asset.find({ tenantId: args.tenantId }).limit(500).lean();
}

export async function getSaleOrderHandler(args: { tenantId: string; saleOrderId?: string }) {
  await connectDB();
  if (args.saleOrderId) return SaleOrder.findOne({ _id: args.saleOrderId, tenantId: args.tenantId }).lean();
  return SaleOrder.find({ tenantId: args.tenantId }).limit(500).lean();
}

export async function getSalesInvoiceHandler(args: { tenantId: string; customerId?: string; saleOrderRef?: string }) {
  await connectDB();
  const query: Record<string, unknown> = { tenantId: args.tenantId };
  if (args.customerId) query.customerId = args.customerId;
  // SalesInvoice's own `mongoose.models.X || mongoose.model<T>(...)` export pattern produces an
  // ambiguous Model union that mongoose's own .find() overloads can't resolve — a latent type
  // issue in the model file itself (not something Batch B changes), worked around at the call
  // site rather than touching an existing model per Hard Rule 1.
  return (SalesInvoice as unknown as mongoose.Model<Record<string, unknown>>).find(query).limit(500).lean();
}

export async function getScheduleHandler(args: { tenantId: string; scheduleId?: string; status?: string; dueBy?: string }) {
  await connectDB();
  if (args.scheduleId) return AiSchedule.findOne({ _id: args.scheduleId, tenantId: args.tenantId }).lean();
  const query: Record<string, unknown> = { tenantId: args.tenantId };
  if (args.status) query.status = args.status;
  if (args.dueBy) query.nextRunDate = { $lte: new Date(args.dueBy) };
  return AiSchedule.find(query).limit(500).lean();
}

/** Wraps the exact formula app/api/finance/assets/compute/route.ts uses (both now call the
 *  same lib/accounting/depreciation.ts function — a safe refactor, not a reimplementation). */
export async function runDepreciationComputeHandler(args: { tenantId: string; assetId: string }) {
  await connectDB();
  const asset = await Asset.findOne({ _id: args.assetId, tenantId: args.tenantId }).lean();
  if (!asset) throw new Error(`Asset ${args.assetId} not found`);
  return { assetId: args.assetId, monthlyDepreciation: computeMonthlyDepreciation(asset) };
}

export function registerScheduleReadTools(): void {
  registerTool({
    name: "get_purchase_order",
    description: "Reads PurchaseOrder(s) incl. orderLines[] qty fields; optionally only lines where receivedQty !== billedQty.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getPurchaseOrderHandler,
  });

  registerTool({
    name: "get_stock_moves",
    description: "Reads StockMove(s) by lifecycle state.",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getStockMovesHandler,
  });

  registerTool({
    name: "get_asset",
    description: "Reads Asset(s).",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getAssetHandler,
  });

  registerTool({
    name: "get_sale_order",
    description: "Reads SaleOrder(s) — read-only, structurally enforced (no write tool wraps this model).",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getSaleOrderHandler,
  });

  registerTool({
    name: "get_sales_invoice",
    description: "Reads SalesInvoice(s) — read-only, structurally enforced (no write tool wraps this model).",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getSalesInvoiceHandler,
  });

  registerTool({
    name: "get_schedule",
    description: "Reads AiSchedule(s).",
    sideEffect: AI_TOOL_SIDE_EFFECT.READ,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: getScheduleHandler,
  });

  registerTool({
    name: "run_depreciation_compute",
    description: "Computes an asset's monthly straight-line depreciation — wraps the same formula app/api/finance/assets/compute/route.ts uses.",
    sideEffect: AI_TOOL_SIDE_EFFECT.ANALYSE,
    reversible: true,
    maxAutonomyLevel: AI_AUTONOMY_LEVEL.CONTROLLED_AUTONOMOUS,
    handler: runDepreciationComputeHandler,
  });
}

export { STOCK_MOVE_STATUS };
