import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Product from "@/models/inventory/Product";
import Batch from "@/models/inventory/Batch";
import Warehouse from "@/models/inventory/Warehouse";
import StockTransfer from "@/models/inventory/StockTransfer";
import ManufacturingOrder from "@/models/manufacturing/ManufacturingOrder";
import StockMove from "@/models/inventory/StockMove";
import InventoryOrder from "@/models/inventory/InventoryOrder";
import InventoryItem from "@/models/inventory/InventoryItem";
import Customer from "@/models/sales/Customer";
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import {
  PRODUCT_STATUS_VALUES,
  BATCH_STATUS_VALUES,
  ENTITY_STATUS_VALUES,
  DOCUMENT_STATUS_VALUES,
  PRODUCTION_STATUS_VALUES,
  STOCK_MOVE_STATUS_VALUES,
} from "@/lib/constants/statuses";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatCurrency(n: number): string {
  return "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function formatDate(d: any): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function customerDisplayName(c: any): string {
  return c?.header?.displayName || c?.header?.companyName || c?.header?.name || "Unnamed customer";
}

/** Shared $gte/$lte range builder for a Date-typed field — end date is
 * inclusive through 23:59:59.999 so "up to 31 Aug" includes all of the 31st. */
function dateRangeFilter(fromValid: string, toValid: string): Record<string, Date> | undefined {
  if (!fromValid && !toValid) return undefined;
  const range: Record<string, Date> = {};
  if (fromValid) range.$gte = new Date(fromValid);
  if (toValid) {
    const end = new Date(toValid);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return range;
}

/** Shared $gte/$lte range builder for a numeric amount/quantity field. */
function amountRangeFilter(min: number | null, max: number | null): Record<string, number> | undefined {
  if (min == null && max == null) return undefined;
  const range: Record<string, number> = {};
  if (min != null) range.$gte = min;
  if (max != null) range.$lte = max;
  return range;
}

type MemoryEntity =
  | "product"
  | "batch"
  | "warehouse"
  | "receipt"
  | "delivery"
  | "manufacturing_order"
  | "return"
  | "stock_move"
  | "inventory_order"
  | "alert"
  | "none";

interface Extracted {
  entity: MemoryEntity;
  wantsToOpen: boolean;
  nameQuery: string;
  dateFrom: string;
  dateTo: string;
  status: string;
  amountMin: number | null;
  amountMax: number | null;
}

/**
 * "AI memory" for the Inventory module — real database lookups for factual
 * questions ("does this batch exist", "show me receipts from last month",
 * "manufacturing orders above 100 units", "low stock alerts"), mirroring
 * app/api/sales/ai-memory-query/route.ts's pattern. Gated behind
 * lib/ai/inventoryMemoryFlow.ts's cheap regex check on the client, so this
 * route is only hit for messages that plausibly ask about an Inventory record.
 *
 * The LLM is used ONLY to extract a structured query (entity/name/date-range/
 * status/amount-or-quantity-range/browse-intent) from the free-text question
 * — the actual answer shown to the user is built deterministically from real
 * query results, never LLM-generated prose.
 *
 * Always returns 200 with `handled: false` on anything it can't confidently
 * resolve so the caller can fall through to the normal conversational
 * assistant without ever breaking the chat.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ success: false, handled: false }, { status: 401 });
    }
    const tenantId = (session.user as any).tenantId as string | undefined;
    if (!tenantId) {
      return NextResponse.json({ success: false, handled: false }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const message: string = String(body.text || body.message || "").trim();
    if (!message) return NextResponse.json({ success: true, handled: false });

    await connectDB();

    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);

    const prompt = `You are extracting a structured lookup query from an Inventory-module chat question in an ERP system. Today's date is ${todayIso}.

User question: "${message}"

Return ONLY JSON (no markdown, no prose) in this exact shape:
{"entity": "product" | "batch" | "warehouse" | "receipt" | "delivery" | "manufacturing_order" | "return" | "stock_move" | "inventory_order" | "alert" | "none", "wantsToOpen": false, "nameQuery": "", "dateFrom": "", "dateTo": "", "status": "", "amountMin": null, "amountMax": null}

Rules:
- "entity": "product" for a product/item/SKU in the catalog. "batch" for a batch/lot. "warehouse" for a warehouse/storage location. "receipt" for an incoming receipt/GRN/goods received. "delivery" for an outgoing delivery/dispatch/shipment. "manufacturing_order" for a manufacturing/production order/MO. "return" for a return/RMA document. "stock_move" for a stock move/transfer/internal movement. "inventory_order" for a fulfillment/customer order in the Inventory module (not a Sales order). "alert" for a reorder/low-stock/out-of-stock alert. "none" if the question isn't actually asking to look up or list an Inventory record — when "none", leave every other field at its empty/null/false default.
- "wantsToOpen": true whenever the user is asking for a LIST or SET of records rather than a single yes/no fact — this includes "show me", "take me to", "open", "go to", "list all", "I want to see/the ...", but ALSO "give me all/the ...", "get me ...", "fetch ...", "pull up ...", "what are all the ...", "all the ...", or any plural request scoped by a filter (a date range, a status, a quantity/amount) with no single specific name/number mentioned. false only for a genuine yes/no or single-fact question ("does X exist", "was there a batch for X", "how many warehouses", "check if X exists").
- "nameQuery": a product/batch/warehouse/reference/order-number mentioned. Empty string if none mentioned.
- "dateFrom"/"dateTo": resolve ANY date-range phrasing to real YYYY-MM-DD dates using today (${todayIso}) as the anchor. An explicit date WITH a year is absolute — use that exact date, even if it's in the future relative to your training data; today's date above is the only source of truth for "now"/"future". "X till now"/"X to date"/"since X" → dateFrom = X, dateTo empty. "first week of August" → the 1st to the 7th of the nearest August not in the future. "last three months" → 3 months before today to today. "this month" → the 1st of the current month to today. "in August" with no year → the nearest August that is not in the future. For "batch"/"manufacturing_order" a date phrase like "expiring in September" or "scheduled for..." still maps to dateFrom/dateTo the same way. If there is NO date phrasing at all, leave both empty strings.
- "status": only when the user clearly names a status. Map their words to the closest ONE of these, depending on entity — product: draft, published. batch: active, expired, quarantine, released. warehouse: active, inactive, maintenance. receipt/delivery/return: draft, pending_approval, approved, posted, closed, rejected, cancelled. manufacturing_order: demand_forecast, production_order, material_reserved, material_issued, in_production, qc_pending, qc_passed, qc_failed, rework, finished, cancelled. stock_move: requested, source_validated, destination_assigned, move_executed, valuation_updated, accounting_created, cancelled. inventory_order: draft, pending_approval, approved, posted, closed, rejected, cancelled. alert: out_of_stock, critical, low_stock (map "out of stock"/"zero stock" → out_of_stock, "critical"/"urgent" → critical, "low stock"/"running low" → low_stock; "all alerts" → empty string). Empty string if no status named.
- "amountMin"/"amountMax": a plain number, no currency symbol or commas. For "batch" and "manufacturing_order" this is a QUANTITY (units). For "stock_move" and "inventory_order" this is a rupee AMOUNT/valuation. Not applicable to product, warehouse, receipt, delivery, return, or alert — leave both null for those. "above/over/more than/at least X" → amountMin = X. "below/under/less than X" → amountMax = X. "between X and Y" → amountMin = X, amountMax = Y. "at most X" → amountMax = X. If no such phrasing at all, leave both null.
- Never invent a name, a date, or an amount that isn't implied by the question. Output strict JSON, nothing else.`;

    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
    const result = await callClaudeForTenant(tenantId, tier, aiSettings, prompt, { maxTokens: 300 });
    if (!("text" in result)) {
      return NextResponse.json({ success: true, handled: false });
    }

    const VALID_ENTITIES: MemoryEntity[] = [
      "product",
      "batch",
      "warehouse",
      "receipt",
      "delivery",
      "manufacturing_order",
      "return",
      "stock_move",
      "inventory_order",
      "alert",
      "none",
    ];
    let extracted: Extracted | undefined;
    try {
      const m = result.text.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : result.text);
      if (parsed && VALID_ENTITIES.includes(parsed.entity)) {
        extracted = {
          entity: parsed.entity,
          wantsToOpen: Boolean(parsed.wantsToOpen),
          nameQuery: String(parsed.nameQuery || "").trim(),
          dateFrom: String(parsed.dateFrom || "").trim(),
          dateTo: String(parsed.dateTo || "").trim(),
          status: String(parsed.status || "").trim().toLowerCase(),
          amountMin: typeof parsed.amountMin === "number" && isFinite(parsed.amountMin) ? parsed.amountMin : null,
          amountMax: typeof parsed.amountMax === "number" && isFinite(parsed.amountMax) ? parsed.amountMax : null,
        };
      }
    } catch {
      // fall through — handled below
    }

    if (!extracted || extracted.entity === "none") {
      return NextResponse.json({ success: true, handled: false });
    }

    const dateFromValid = extracted.dateFrom && !isNaN(Date.parse(extracted.dateFrom)) ? extracted.dateFrom : "";
    const dateToValid = extracted.dateTo && !isNaN(Date.parse(extracted.dateTo)) ? extracted.dateTo : "";

    // Deterministic safety net: a request scoped by a date range, status, or
    // amount/quantity range with no single specific name is definitionally
    // "browse a filtered set", not a yes/no fact check.
    if (!extracted.nameQuery && (dateFromValid || dateToValid || extracted.status || extracted.amountMin != null || extracted.amountMax != null)) {
      extracted.wantsToOpen = true;
    }
    const rangeLabel =
      dateFromValid && dateToValid
        ? `${formatDate(dateFromValid)} – ${formatDate(dateToValid)}`
        : dateFromValid
          ? `since ${formatDate(dateFromValid)}`
          : dateToValid
            ? `up to ${formatDate(dateToValid)}`
            : "";

    // ---------------------------------------------------------------------
    // Product (narrow: name + status only — no stock-level filtering here)
    // ---------------------------------------------------------------------
    if (extracted.entity === "product") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [{ "header.name": rx }, { "tab_general_information.default_code": rx }];
      }
      if (extracted.status && (PRODUCT_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }

      const [total, products] = await Promise.all([
        Product.countDocuments(query),
        Product.find(query).sort({ createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("query", extracted.nameQuery);
        // Only echo a status the query above actually applied — a status the
        // model invented (not in this entity's real enum) would otherwise
        // land in the URL even though the query itself silently ignored it.
        if (extracted.status && (PRODUCT_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("status", extracted.status);
        route = `/inventory/stock${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (extracted.nameQuery && total > 0 && !extracted.wantsToOpen) {
        const p: any = products[0];
        const bits = [
          p.tab_general_information?.default_code ? `Code: ${p.tab_general_information.default_code}` : "",
          p.tab_general_information?.list_price != null ? `List price: ${formatCurrency(p.tab_general_information.list_price)}` : "",
          `Status: ${String(p.status || "draft").replace(/_/g, " ")}`,
        ].filter(Boolean);
        message2 = `Yes — **${p.header?.name}** exists in the catalog.\n\n${bits.map((b) => `• ${b}`).join("\n")}`;
      } else if (extracted.nameQuery && total === 0 && !extracted.wantsToOpen) {
        message2 = `No — I couldn't find a product named **${extracted.nameQuery}** in the system.`;
      } else if (total === 0) {
        message2 = `No products found${forWhom}.`;
      } else {
        const lines = products.slice(0, 10).map((p: any) => `• ${p.header?.name}${p.tab_general_information?.default_code ? ` (${p.tab_general_information.default_code})` : ""} — ${String(p.status || "draft").replace(/_/g, " ")}`);
        const more = total > 10 ? `\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Found **${total}** product${total === 1 ? "" : "s"}${forWhom}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    // ---------------------------------------------------------------------
    // Batch / Lot
    // ---------------------------------------------------------------------
    if (extracted.entity === "batch") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [{ batchNumber: rx }, { lotNumber: rx }, { itemCode: rx }, { itemName: rx }];
      }
      const expiryRange = dateRangeFilter(dateFromValid, dateToValid);
      if (expiryRange) query.expiryDate = expiryRange;
      if (extracted.status && (BATCH_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }
      const qtyRange = amountRangeFilter(extracted.amountMin, extracted.amountMax);
      if (qtyRange) query.quantity = qtyRange;

      const [total, batches] = await Promise.all([
        Batch.countDocuments(query),
        Batch.find(query).sort({ expiryDate: 1, createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied.
        if (extracted.status && (BATCH_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("status", extracted.status);
        if (extracted.amountMin != null) params.set("quantityMin", String(extracted.amountMin));
        if (extracted.amountMax != null) params.set("quantityMax", String(extracted.amountMax));
        route = `/inventory/batch${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any batches${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = batches.slice(0, 10).map((b: any) => `• ${b.batchNumber} — ${b.itemName} — Qty ${b.quantity} — ${String(b.status).replace(/_/g, " ")} — expires ${formatDate(b.expiryDate)}`);
        const more = total > 10 ? `\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** batch${total === 1 ? "" : "es"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    // ---------------------------------------------------------------------
    // Warehouse
    // ---------------------------------------------------------------------
    if (extracted.entity === "warehouse") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [{ name: rx }, { warehouseCode: rx }];
      }
      if (extracted.status && (ENTITY_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }

      const [total, warehouses] = await Promise.all([
        Warehouse.countDocuments(query),
        Warehouse.find(query).sort({ createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        // Only echo a status the query above actually applied.
        if (extracted.status && (ENTITY_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("status", extracted.status);
        route = `/inventory/warehouse${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (extracted.nameQuery && total > 0 && !extracted.wantsToOpen) {
        const w: any = warehouses[0];
        message2 = `Yes — **${w.name}** (${w.warehouseCode}) exists.\n\n• Location: ${w.location || "—"}\n• Status: ${String(w.status).replace(/_/g, " ")}`;
      } else if (extracted.nameQuery && total === 0 && !extracted.wantsToOpen) {
        message2 = `No — I couldn't find a warehouse named **${extracted.nameQuery}**.`;
      } else if (total === 0) {
        message2 = `No warehouses found${forWhom}.`;
      } else {
        const lines = warehouses.slice(0, 10).map((w: any) => `• ${w.name} (${w.warehouseCode}) — ${w.location || "—"} — ${String(w.status).replace(/_/g, " ")}`);
        const more = total > 10 ? `\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Found **${total}** warehouse${total === 1 ? "" : "s"}${forWhom}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    // ---------------------------------------------------------------------
    // Receipt / Delivery — same StockTransfer model, opposite operationType
    // ---------------------------------------------------------------------
    if (extracted.entity === "receipt" || extracted.entity === "delivery") {
      const isReceipt = extracted.entity === "receipt";
      const query: any = { tenantId, "header.operationType": isReceipt ? "incoming" : "outgoing" };
      let matchedPartnerName: string | undefined;
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        const partner: any = await Customer.findOne(
          { tenantId, $or: [{ "header.name": rx }, { "header.displayName": rx }, { "header.companyName": rx }] },
          "_id header",
        ).lean();
        if (partner) {
          matchedPartnerName = customerDisplayName(partner);
          query["header.partnerId"] = new mongoose.Types.ObjectId(String(partner._id));
        } else {
          query["header.name"] = rx;
        }
      }
      const schedRange = dateRangeFilter(dateFromValid, dateToValid);
      if (schedRange) query["header.scheduledDate"] = schedRange;
      if (extracted.status && (DOCUMENT_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }

      const [total, transfers] = await Promise.all([
        StockTransfer.countDocuments(query),
        StockTransfer.find(query)
          .populate("header.partnerId", "header.name")
          .sort({ "header.scheduledDate": -1, createdAt: -1 })
          .limit(10)
          .lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (matchedPartnerName) params.set("search", matchedPartnerName);
        else if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied.
        if (extracted.status && (DOCUMENT_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("status", extracted.status);
        route = `/inventory/operations/${isReceipt ? "receipts" : "deliveries"}${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const label = isReceipt ? "receipt" : "delivery";
      const labelPlural = isReceipt ? "receipts" : "deliveries";
      const forWhom = matchedPartnerName ? ` for **${matchedPartnerName}**` : extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any ${labelPlural}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = transfers.slice(0, 10).map((t: any) => {
          const partnerName = t.header?.partnerId ? customerDisplayName(t.header.partnerId) : t.header?.partnerName || "—";
          return `• ${t.header?.name} — ${partnerName} — ${String(t.status).replace(/_/g, " ")} — ${formatDate(t.header?.scheduledDate)}`;
        });
        const more = total > 10 ? `\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** ${total === 1 ? label : labelPlural}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    // ---------------------------------------------------------------------
    // Manufacturing Order
    // ---------------------------------------------------------------------
    if (extracted.entity === "manufacturing_order") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        query["header.name"] = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
      }
      const schedRange = dateRangeFilter(dateFromValid, dateToValid);
      if (schedRange) query["header.scheduledDate"] = schedRange;
      if (extracted.status && (PRODUCTION_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.productionStatus = extracted.status;
      }
      const qtyRange = amountRangeFilter(extracted.amountMin, extracted.amountMax);
      if (qtyRange) query["header.quantity"] = qtyRange;

      const [total, orders] = await Promise.all([
        ManufacturingOrder.countDocuments(query),
        ManufacturingOrder.find(query)
          .populate("header.productId", "header.name")
          .sort({ "header.scheduledDate": -1, createdAt: -1 })
          .limit(10)
          .lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied.
        if (extracted.status && (PRODUCTION_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("productionStatus", extracted.status);
        if (extracted.amountMin != null) params.set("quantityMin", String(extracted.amountMin));
        if (extracted.amountMax != null) params.set("quantityMax", String(extracted.amountMax));
        route = `/inventory/operations/manufacturing${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any manufacturing orders${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = orders.slice(0, 10).map((o: any) => {
          const productName = o.header?.productId?.header?.name || "—";
          return `• ${o.header?.name} — ${productName} — Qty ${o.header?.quantity} — ${String(o.productionStatus).replace(/_/g, " ")} — ${formatDate(o.header?.scheduledDate)}`;
        });
        const more = total > 10 ? `\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** manufacturing order${total === 1 ? "" : "s"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    // ---------------------------------------------------------------------
    // Return — StockTransfer identified by the same name/sourceDocument
    // convention used by app/api/inventory/operations/returns/route.ts
    // ---------------------------------------------------------------------
    if (extracted.entity === "return") {
      const isReturnOr = [
        { "header.name": { $regex: /RET/i } },
        { "header.sourceDocument": { $exists: true, $ne: "" } },
      ];
      const query: any = { tenantId, $or: isReturnOr };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$and = [{ $or: isReturnOr }, { $or: [{ "header.name": rx }, { "header.sourceDocument": rx }] }];
        delete query.$or;
      }
      const schedRange = dateRangeFilter(dateFromValid, dateToValid);
      if (schedRange) query["header.scheduledDate"] = schedRange;
      if (extracted.status && (DOCUMENT_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }

      const [total, returns] = await Promise.all([
        StockTransfer.countDocuments(query),
        StockTransfer.find(query).sort({ "header.scheduledDate": -1, createdAt: -1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied.
        if (extracted.status && (DOCUMENT_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("status", extracted.status);
        route = `/inventory/operations/returns${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any returns${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = returns.slice(0, 10).map((r: any) => `• ${r.header?.name} — ${String(r.status).replace(/_/g, " ")} — ${formatDate(r.header?.scheduledDate)}`);
        const more = total > 10 ? `\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** return${total === 1 ? "" : "s"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    // ---------------------------------------------------------------------
    // Stock Move
    // ---------------------------------------------------------------------
    if (extracted.entity === "stock_move") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        query.reference = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
      }
      const schedRange = dateRangeFilter(dateFromValid, dateToValid);
      if (schedRange) query.scheduledDate = schedRange;
      if (extracted.status && (STOCK_MOVE_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.moveStatus = extracted.status;
      }
      const valRange = amountRangeFilter(extracted.amountMin, extracted.amountMax);
      if (valRange) query["valuation.totalValue"] = valRange;

      const [total, moves] = await Promise.all([
        StockMove.countDocuments(query),
        StockMove.find(query).sort({ scheduledDate: -1, createdAt: -1 }).limit(10).lean(),
      ]);
      const totalAgg = total > 0 ? await StockMove.aggregate([{ $match: query }, { $group: { _id: null, sum: { $sum: "$valuation.totalValue" } } }]) : [];
      const sumAmount = totalAgg[0]?.sum || 0;

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied.
        if (extracted.status && (STOCK_MOVE_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("moveStatus", extracted.status);
        if (extracted.amountMin != null) params.set("amountMin", String(extracted.amountMin));
        if (extracted.amountMax != null) params.set("amountMax", String(extracted.amountMax));
        route = `/inventory/stock-moves${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any stock moves${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = moves.slice(0, 10).map((m: any) => `• ${m.reference} — ${m.moveType} — ${formatCurrency(m.valuation?.totalValue || 0)} — ${String(m.moveStatus).replace(/_/g, " ")} — ${formatDate(m.scheduledDate)}`);
        const more = total > 10 ? `\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** stock move${total === 1 ? "" : "s"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}, totaling ${formatCurrency(sumAmount)}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    // ---------------------------------------------------------------------
    // Inventory Order (fulfillment order — customerName is a plain string,
    // not a Customer ref, so no ObjectId-cast lookup is needed here)
    // ---------------------------------------------------------------------
    if (extracted.entity === "inventory_order") {
      const query: any = { tenantId };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [{ orderNumber: rx }, { customerName: rx }];
      }
      const orderDateRange = dateRangeFilter(dateFromValid, dateToValid);
      if (orderDateRange) query.orderDate = orderDateRange;
      if (extracted.status && (DOCUMENT_STATUS_VALUES as readonly string[]).includes(extracted.status)) {
        query.status = extracted.status;
      }
      const amountRange = amountRangeFilter(extracted.amountMin, extracted.amountMax);
      if (amountRange) query.totalAmount = amountRange;

      const [total, orders] = await Promise.all([
        InventoryOrder.countDocuments(query),
        InventoryOrder.find(query).sort({ orderDate: -1, createdAt: -1 }).limit(10).lean(),
      ]);
      const totalAgg = total > 0 ? await InventoryOrder.aggregate([{ $match: query }, { $group: { _id: null, sum: { $sum: "$totalAmount" } } }]) : [];
      const sumAmount = totalAgg[0]?.sum || 0;

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (dateFromValid) params.set("dateFrom", dateFromValid);
        if (dateToValid) params.set("dateTo", dateToValid);
        // Only echo a status the query above actually applied.
        if (extracted.status && (DOCUMENT_STATUS_VALUES as readonly string[]).includes(extracted.status)) params.set("status", extracted.status);
        if (extracted.amountMin != null) params.set("amountMin", String(extracted.amountMin));
        if (extracted.amountMax != null) params.set("amountMax", String(extracted.amountMax));
        route = `/inventory/orders${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No — I couldn't find any inventory orders${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}.`;
      } else {
        const lines = orders.slice(0, 10).map((o: any) => `• ${o.orderNumber} — ${o.customerName} — ${formatCurrency(o.totalAmount)} — ${String(o.status).replace(/_/g, " ")} — ${formatDate(o.orderDate)}`);
        const more = total > 10 ? `\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Yes — found **${total}** order${total === 1 ? "" : "s"}${forWhom}${rangeLabel ? ` ${rangeLabel}` : ""}, totaling ${formatCurrency(sumAmount)}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    // ---------------------------------------------------------------------
    // Alert — InventoryItem reorder alerts, replicating the exact band logic
    // from app/api/inventory/alerts/route.ts's buildExprConditions(). No
    // date/amount filtering here — alerts are a computed, point-in-time view.
    // ---------------------------------------------------------------------
    if (extracted.entity === "alert") {
      const ALERT_STATUS_VALUES = ["out_of_stock", "critical", "low_stock"];
      const statusFilter = ALERT_STATUS_VALUES.includes(extracted.status) ? extracted.status : null;
      const conditions: any[] = [{ $lte: ["$quantity", "$reorderLevel"] }];
      if (statusFilter === "out_of_stock") {
        conditions.push({ $eq: ["$quantity", 0] });
      } else if (statusFilter === "critical") {
        conditions.push({ $gt: ["$quantity", 0] });
        conditions.push({ $lte: ["$quantity", { $multiply: ["$reorderLevel", 0.5] }] });
      } else if (statusFilter === "low_stock") {
        conditions.push({ $gt: ["$quantity", { $multiply: ["$reorderLevel", 0.5] }] });
      }
      const query: any = { tenantId, $expr: conditions.length > 1 ? { $and: conditions } : conditions[0] };
      if (extracted.nameQuery) {
        const rx = { $regex: escapeRegex(extracted.nameQuery), $options: "i" };
        query.$or = [{ name: rx }, { itemCode: rx }, { category: rx }];
      }

      const [total, alerts] = await Promise.all([
        InventoryItem.countDocuments(query),
        InventoryItem.find(query).sort({ quantity: 1 }).limit(10).lean(),
      ]);

      let route: string | undefined;
      if (extracted.wantsToOpen) {
        const params = new URLSearchParams();
        if (extracted.nameQuery) params.set("search", extracted.nameQuery);
        if (statusFilter) params.set("status", statusFilter);
        route = `/inventory/alerts${params.toString() ? `?${params.toString()}` : ""}`;
      }

      const forWhom = extracted.nameQuery ? ` matching "${extracted.nameQuery}"` : "";
      let message2: string;
      if (total === 0) {
        message2 = `No active reorder alerts${forWhom}${statusFilter ? ` for ${statusFilter.replace(/_/g, " ")}` : ""} right now — stock levels look healthy.`;
      } else {
        const lines = alerts.slice(0, 10).map((a: any) => {
          const isOut = a.quantity === 0;
          const isCritical = a.quantity > 0 && a.quantity <= a.reorderLevel * 0.5;
          const sev = isOut ? "out of stock" : isCritical ? "critical" : "low stock";
          return `• ${a.name} (${a.itemCode}) — ${a.quantity} ${a.unit || "pcs"} on hand, reorder at ${a.reorderLevel} — ${sev} — ${a.warehouse}`;
        });
        const more = total > 10 ? `\n…and ${total - 10} more.` : "";
        const openNote = route ? "\n\nOpening the filtered list for you now." : "";
        message2 = `Found **${total}** active alert${total === 1 ? "" : "s"}${forWhom}:\n\n${lines.join("\n")}${more}${openNote}`;
      }

      return NextResponse.json({ success: true, handled: true, message: message2, route });
    }

    return NextResponse.json({ success: true, handled: false });
  } catch (error) {
    console.error("Inventory AI memory-query error:", error);
    return NextResponse.json({ success: true, handled: false });
  }
}
