import SaleOrder from "@/models/sales/SaleOrder";
import SalesQuotation from "@/models/sales/SalesQuotation";
import "@/models/sales/Customer";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import { computeInvoiceTotals } from "@/lib/sales/invoiceMath";
import { generateQuoteNumber } from "@/lib/sales/quoteNumbering";
import { generateSaleOrderNumber } from "@/lib/sales/saleOrderNumbering";
import { convertQuoteToInvoice, QuoteInvoiceError } from "@/lib/sales/quoteInvoice";
import {
  DOCUMENT_STATUS,
  Q2C_STATUS,
  QUOTE_STATUS,
  SALES_ORDER_STATUS,
  SALES_ORDER_SHIPMENT_STATUS,
  SALES_ORDER_INVOICING_STATUS,
  isValidQ2CTransition,
  Q2C_STATUS_LABELS,
  type Q2CStatus,
} from "@/lib/constants/statuses";

// Caller must have already called connectDB().
//
// A pipeline "deal" is ONE record that keeps its identity while moving through
// the Q2C stages; the document shown on the card follows the stage
//   Lead / Opportunity / Price Rules  -> Sales Order number  (SO-…)
//   Quote Generated / Discount Appr.  -> Quote number        (QT-…)
//   Quote Accepted … Fulfillment      -> Sales Order number  (SO-…)
//   Invoice Posted / Revenue Recog.   -> Invoice number      (INV-…)
// and every reference the deal has carried is kept in `refHistory`.

export class DealError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

type DocType = "SO" | "QT" | "INV";

const QUOTE_STAGES: Q2CStatus[] = [Q2C_STATUS.QUOTE_GENERATED, Q2C_STATUS.DISCOUNT_APPROVAL];
const INVOICE_STAGES: Q2CStatus[] = [Q2C_STATUS.INVOICE_POSTED, Q2C_STATUS.REVENUE_RECOGNIZED];

function docTypeForStage(stage: Q2CStatus, order: any): DocType {
  if (INVOICE_STAGES.includes(stage) && order.invoiceNumber) return "INV";
  if (QUOTE_STAGES.includes(stage) && order.quoteNumber) return "QT";
  return "SO";
}

function refFor(order: any, type: DocType): string {
  if (type === "INV") return order.invoiceNumber;
  if (type === "QT") return order.quoteNumber;
  return order.header?.name;
}

function customerName(p: any): string {
  return p?.header?.name || "No customer";
}

export function viewHrefForOrder(order: any, type: DocType): string {
  if (type === "QT" && order.quoteId) return `/sales/quotes/${order.quoteId}`;
  if (type === "INV") {
    const ids = order.salesInvoiceIds || [];
    if (ids.length) return `/sales/invoices/${ids[ids.length - 1]}`;
  }
  return `/sales/sales-orders/${order._id}`;
}

function quoteStage(q: any): Q2CStatus {
  if (q.pipelineStage === "cancelled") return Q2C_STATUS.CANCELLED;
  if (q.status === QUOTE_STATUS.REJECTED || q.pipelineStage === "lost") return Q2C_STATUS.LOST;
  if (q.status === QUOTE_STATUS.INVOICED) return Q2C_STATUS.INVOICE_POSTED;
  if (q.pipelineStage === Q2C_STATUS.DISCOUNT_APPROVAL) return Q2C_STATUS.DISCOUNT_APPROVAL;
  if (q.status === QUOTE_STATUS.ACCEPTED) return Q2C_STATUS.QUOTE_ACCEPTED;
  return Q2C_STATUS.QUOTE_GENERATED;
}

/** Everything the Q2C board needs: sales-order deals + quotes not yet ordered. */
export async function listDeals(tenantId: string) {
  const [orders, quotes] = await Promise.all([
    (SaleOrder as any)
      .find({ tenantId })
      .populate("header.partnerId", "header.name")
      .sort({ createdAt: -1 })
      .lean(),
    (SalesQuotation as any)
      .find({ tenantId })
      .populate("customerId", "header.name")
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const claimedQuoteIds = new Set<string>();
  const claimedNumbers = new Set<string>();
  for (const o of orders) {
    if (o.quoteId) claimedQuoteIds.add(String(o.quoteId));
    if (o.quoteNumber) claimedNumbers.add(o.quoteNumber);
    if (o.header?.name) claimedNumbers.add(o.header.name);
  }

  const deals: any[] = orders.map((o: any) => {
    const stage: Q2CStatus = o.q2cStatus || Q2C_STATUS.LEAD;
    const type = docTypeForStage(stage, o);
    const ref = refFor(o, type);
    return {
      _id: String(o._id),
      kind: "order",
      q2cStatus: stage,
      docType: type,
      header: { name: ref, partnerId: { header: { name: customerName(o.header?.partnerId) } } },
      totals: { amountTotal: o.totals?.amountTotal || 0 },
      createdAt: o.createdAt,
      viewHref: viewHrefForOrder(o, type),
      refHistory: o.refHistory || [],
    };
  });

  for (const q of quotes) {
    if (q.saleOrderId || claimedQuoteIds.has(String(q._id)) || claimedNumbers.has(q.quoteNumber)) continue;
    const stage = quoteStage(q);
    deals.push({
      _id: String(q._id),
      kind: "quote",
      q2cStatus: stage,
      docType: "QT",
      header: { name: q.quoteNumber, partnerId: { header: { name: customerName(q.customerId) } } },
      totals: { amountTotal: q.totalAmount || 0 },
      createdAt: q.createdAt,
      viewHref: `/sales/quotes/${q._id}`,
      refHistory: [{ docType: "QT", ref: q.quoteNumber, docId: q._id, stage, at: q.createdAt }],
    });
  }

  return deals;
}

// ── helpers ────────────────────────────────────────────────────────────────

function pushRef(order: any, type: DocType, ref: string | undefined, docId: any, stage: Q2CStatus) {
  if (!ref) return;
  const history = order.refHistory || (order.refHistory = []);
  if (history.length === 0 && type !== "SO" && order.header?.name) {
    history.push({ docType: "SO", ref: order.header.name, docId: order._id, stage: Q2C_STATUS.LEAD, at: order.createdAt || new Date() });
  }
  const last = history[history.length - 1];
  if (last && last.ref === ref && last.docType === type) return;
  history.push({ docType: type, ref, docId, stage, at: new Date() });
}

function orderLinesToQuoteLines(order: any) {
  const lines: any[] = order.orderLines || [];
  const untaxed = order.totals?.amountUntaxed || 0;
  const tax = order.totals?.amountTax || 0;
  const hasLineTax = lines.some((l) => Number(l.taxRate) > 0);
  // Orders created before per-line tax was stored only kept an aggregate tax
  // amount — spread it as one effective rate so the quote total still matches.
  const fallbackRate = !hasLineTax && untaxed > 0 && tax > 0 ? Math.round((tax / untaxed) * 10000) / 100 : 0;

  if (lines.length === 0) {
    const total = order.totals?.amountTotal || 0;
    return [{ name: `Deal ${order.header?.name || ""}`.trim(), qty: 1, unitPrice: total, discount: 0, discountMode: "percent", taxRate: 0, lineTotal: total }];
  }
  return lines.map((l) => ({
    itemId: l.productId || undefined,
    name: l.name,
    qty: Number(l.productQty) || 1,
    unitPrice: Number(l.priceUnit) || 0,
    discount: Number(l.discount) || 0,
    discountMode: l.discountMode || "percent",
    taxRate: hasLineTax ? Number(l.taxRate) || 0 : fallbackRate,
    hsn: l.hsn,
    lineTotal: 0,
  }));
}

/** Quote linked to this deal, created from the order's lines if none exists yet. */
async function ensureQuoteForOrder(tenantId: string, userId: string, order: any) {
  if (order.quoteId) {
    const existing = await SalesQuotation.findOne({ _id: order.quoteId, tenantId });
    if (existing) return existing;
  }
  if (!order.header?.partnerId) {
    throw new DealError("This deal has no customer. Add a customer before generating a quote.");
  }
  const lineItems: any[] = orderLinesToQuoteLines(order);
  const taxMode = order.taxMode || "none";
  const taxRate = taxMode !== "none" ? Number(order.taxRate) || 0 : 0;
  const totals = computeInvoiceTotals({
    lineItems,
    extraDiscount: Number(order.extraDiscount) || 0,
    extraDiscountMode: order.extraDiscountMode || "amount",
    tdsRate: taxMode === "tds" ? taxRate : 0,
    tcsRate: taxMode === "tcs" ? taxRate : 0,
  });
  const { number } = await generateQuoteNumber(tenantId);
  const quote = await SalesQuotation.create({
    tenantId,
    quoteNumber: number,
    customerId: order.header.partnerId?._id || order.header.partnerId,
    reference: order.otherInfo?.clientOrderRef,
    quoteDate: new Date(),
    lineItems,
    extraDiscount: Number(order.extraDiscount) || 0,
    extraDiscountMode: order.extraDiscountMode || "amount",
    taxes: { mode: taxMode, rate: taxRate, amount: taxMode === "tds" ? totals.tdsAmount : totals.tcsAmount },
    adjustment: Number(order.adjustment) || 0,
    taxableAmount: totals.taxableAmount,
    totalDiscount: totals.totalDiscount,
    totalAmount: totals.totalAmount + (Number(order.adjustment) || 0),
    customerNotes: order.customerNotes || undefined,
    terms: order.termsAndConditions,
    status: QUOTE_STATUS.DRAFT,
    saleOrderId: order._id,
    createdBy: userId,
  });
  order.quoteId = quote._id;
  order.quoteNumber = quote.quoteNumber;
  return quote;
}

/** Creates the Sales Order for a quote ("move quote to sales order"). */
export async function createOrderFromQuote(params: { tenantId: string; userId: string; quote: any }) {
  const { tenantId, quote } = params;
  if (quote.saleOrderId) {
    const existing: any = await (SaleOrder as any).findOne({ _id: quote.saleOrderId, tenantId }).lean();
    if (existing) {
      throw new DealError(`This quote has already been moved to sales order ${existing.header?.name}.`, 409);
    }
  }
  if (quote.status === QUOTE_STATUS.REJECTED) {
    throw new DealError("A rejected quote cannot be moved to a sales order. Re-open the quote first.", 409);
  }

  const totals = computeInvoiceTotals({
    lineItems: quote.lineItems as any,
    itemLevelDiscountPercent: quote.itemLevelDiscountPercent,
    extraDiscount: quote.extraDiscount,
    extraDiscountMode: quote.extraDiscountMode,
    tdsRate: quote.taxes?.mode === "tds" ? quote.taxes.rate : 0,
    tcsRate: quote.taxes?.mode === "tcs" ? quote.taxes.rate : 0,
  });
  const { number } = await generateSaleOrderNumber(tenantId);
  const now = new Date();

  const order: any = await (SaleOrder as any).create({
    tenantId,
    header: { name: number, partnerId: quote.customerId, dateOrder: now },
    orderLines: (quote.lineItems as any[]).map((li, i) => ({
      productId: li.itemId || undefined,
      name: li.name,
      productQty: Number(li.qty) || 1,
      priceUnit: Number(li.unitPrice) || 0,
      taxIds: [],
      discount: Number(li.discount) || 0,
      discountMode: li.discountMode || "percent",
      taxRate: Number(li.taxRate) || 0,
      hsn: li.hsn,
      priceSubtotal: totals.computedLines[i]?.lineTotal ?? 0,
    })),
    otherInfo: { clientOrderRef: quote.reference },
    totals: {
      amountUntaxed: totals.taxableAmount,
      amountTax: totals.totalTax,
      amountTotal: quote.totalAmount ?? totals.totalAmount,
    },
    status: DOCUMENT_STATUS.APPROVED,
    q2cStatus: Q2C_STATUS.SALES_ORDER,
    salesOrderStatus: SALES_ORDER_STATUS.CONFIRMED,
    shipmentStatus: SALES_ORDER_SHIPMENT_STATUS.NOT_SHIPPED,
    invoicingStatus: SALES_ORDER_INVOICING_STATUS.NOT_INVOICED,
    extraDiscount: quote.extraDiscount || 0,
    extraDiscountMode: quote.extraDiscountMode || "amount",
    taxMode: quote.taxes?.mode || "none",
    taxRate: quote.taxes?.rate || 0,
    adjustment: quote.adjustment || 0,
    subTotal: totals.subtotal,
    taxAmount: totals.totalTax,
    customerNotes: quote.customerNotes,
    termsAndConditions: quote.terms,
    attachments: quote.attachments || [],
    quoteId: quote._id,
    quoteNumber: quote.quoteNumber,
    refHistory: [
      { docType: "QT", ref: quote.quoteNumber, docId: quote._id, stage: Q2C_STATUS.QUOTE_GENERATED, at: quote.createdAt || now },
      { docType: "SO", ref: number, stage: Q2C_STATUS.SALES_ORDER, at: now },
    ],
    chatter: [],
  });

  quote.saleOrderId = order._id;
  if (quote.status !== QUOTE_STATUS.INVOICED) quote.status = QUOTE_STATUS.ACCEPTED;
  quote.pipelineStage = undefined;
  await quote.save();
  return order;
}

/** Posts an invoice for a sales order deal (idempotent: reuses an existing one). */
export async function createInvoiceForOrder(params: { tenantId: string; userId: string; order: any }) {
  const { tenantId, userId, order } = params;
  const existingIds: any[] = order.salesInvoiceIds || [];
  if (existingIds.length) {
    const inv: any = await SalesInvoice.findOne({ _id: existingIds[existingIds.length - 1], tenantId }).lean();
    if (inv) return inv;
  }
  if ((order.totals?.amountTotal || 0) <= 0) {
    throw new DealError("This deal has a value of ₹0, so an invoice can't be generated. Add items or an amount first.");
  }

  const quote = await ensureQuoteForOrder(tenantId, userId, order);
  let invoice: any;
  if (quote.convertedInvoiceId) {
    invoice = await SalesInvoice.findOne({ _id: quote.convertedInvoiceId, tenantId });
    if (!invoice) throw new DealError("The linked invoice could not be found.", 409);
  } else {
    if (quote.status === QUOTE_STATUS.DRAFT || quote.status === QUOTE_STATUS.SENT) quote.status = QUOTE_STATUS.ACCEPTED;
    try {
      invoice = await convertQuoteToInvoice({ tenantId, userId, quote });
    } catch (e) {
      if (e instanceof QuoteInvoiceError) throw new DealError(e.message, e.status);
      throw e;
    }
  }

  order.salesInvoiceIds = [...(order.salesInvoiceIds || []), invoice._id];
  order.invoiceNumber = invoice.number;
  order.invoicingStatus = SALES_ORDER_INVOICING_STATUS.INVOICED;
  pushRef(order, "INV", invoice.number, invoice._id, Q2C_STATUS.INVOICE_POSTED);
  return invoice;
}

// ── transitions ────────────────────────────────────────────────────────────

export async function transitionDeal(params: {
  tenantId: string;
  userId: string;
  kind: "order" | "quote";
  id: string;
  to: string;
}) {
  const { tenantId, userId, kind, id } = params;
  const to = params.to as Q2CStatus;
  if (!Object.values(Q2C_STATUS).includes(to)) throw new DealError("Unknown pipeline stage.");

  return kind === "quote"
    ? transitionQuoteDeal(tenantId, userId, id, to)
    : transitionOrderDeal(tenantId, userId, id, to);
}

function assertValid(current: Q2CStatus, to: Q2CStatus) {
  if (!isValidQ2CTransition(current, to)) {
    throw new DealError(
      `A deal in "${Q2C_STATUS_LABELS[current]}" can't be moved straight to "${Q2C_STATUS_LABELS[to]}".`,
    );
  }
}

async function transitionQuoteDeal(tenantId: string, userId: string, id: string, to: Q2CStatus) {
  const quote: any = await SalesQuotation.findOne({ _id: id, tenantId });
  if (!quote) throw new DealError("This quote no longer exists.", 404);
  const current = quoteStage(quote);

  // Re-open a lost quote back into the pipeline.
  if (current === Q2C_STATUS.LOST && (to === Q2C_STATUS.LEAD || to === Q2C_STATUS.QUOTE_GENERATED)) {
    quote.status = QUOTE_STATUS.DRAFT;
    quote.pipelineStage = undefined;
    await quote.save();
    return { kind: "quote", id, q2cStatus: Q2C_STATUS.QUOTE_GENERATED };
  }
  assertValid(current, to);

  switch (to) {
    case Q2C_STATUS.QUOTE_GENERATED:
      quote.pipelineStage = undefined;
      break;
    case Q2C_STATUS.DISCOUNT_APPROVAL:
      quote.pipelineStage = Q2C_STATUS.DISCOUNT_APPROVAL;
      break;
    case Q2C_STATUS.QUOTE_ACCEPTED:
      quote.status = QUOTE_STATUS.ACCEPTED;
      quote.pipelineStage = undefined;
      break;
    case Q2C_STATUS.SALES_ORDER: {
      const order = await createOrderFromQuote({ tenantId, userId, quote });
      return { kind: "order", id: String(order._id), q2cStatus: Q2C_STATUS.SALES_ORDER };
    }
    case Q2C_STATUS.LOST:
      quote.status = QUOTE_STATUS.REJECTED;
      break;
    case Q2C_STATUS.CANCELLED:
      quote.pipelineStage = "cancelled";
      break;
    default:
      throw new DealError("That stage change isn't available for a quote.");
  }
  await quote.save();
  return { kind: "quote", id, q2cStatus: to };
}

async function transitionOrderDeal(tenantId: string, userId: string, id: string, to: Q2CStatus) {
  const order: any = await (SaleOrder as any).findOne({ _id: id, tenantId });
  if (!order) throw new DealError("This deal no longer exists.", 404);
  const current: Q2CStatus = order.q2cStatus || Q2C_STATUS.LEAD;
  assertValid(current, to);

  const now = new Date();
  // Make sure the original SO reference is always the first history entry.
  if (!(order.refHistory || []).length) pushRef(order, "SO", order.header?.name, order._id, current);

  switch (to) {
    case Q2C_STATUS.QUOTE_GENERATED: {
      const quote = await ensureQuoteForOrder(tenantId, userId, order);
      if (quote.status === QUOTE_STATUS.DRAFT) quote.status = QUOTE_STATUS.SENT;
      await quote.save();
      order.status = DOCUMENT_STATUS.PENDING_APPROVAL;
      pushRef(order, "QT", quote.quoteNumber, quote._id, to);
      break;
    }
    case Q2C_STATUS.DISCOUNT_APPROVAL:
      order.discountApproval = { ...(order.discountApproval?.toObject?.() || order.discountApproval || {}), required: true };
      break;
    case Q2C_STATUS.QUOTE_ACCEPTED: {
      const quote = await ensureQuoteForOrder(tenantId, userId, order);
      quote.status = QUOTE_STATUS.ACCEPTED;
      await quote.save();
      if (current === Q2C_STATUS.DISCOUNT_APPROVAL) {
        order.discountApproval = { ...(order.discountApproval?.toObject?.() || order.discountApproval || {}), approvedAt: now, approvedBy: userId };
      }
      // Quote accepted -> the sales order reference is shown again.
      pushRef(order, "SO", order.header?.name, order._id, to);
      break;
    }
    case Q2C_STATUS.SALES_ORDER:
      order.status = DOCUMENT_STATUS.APPROVED;
      order.header.dateOrder = now;
      if (order.salesOrderStatus === SALES_ORDER_STATUS.DRAFT) order.salesOrderStatus = SALES_ORDER_STATUS.CONFIRMED;
      break;
    case Q2C_STATUS.FULFILLMENT:
      order.fulfillment = { ...(order.fulfillment?.toObject?.() || order.fulfillment || {}), triggeredAt: now, triggeredBy: userId };
      break;
    case Q2C_STATUS.INVOICE_POSTED:
      await createInvoiceForOrder({ tenantId, userId, order });
      break;
    case Q2C_STATUS.REVENUE_RECOGNIZED:
      order.revenueRecognition = {
        ...(order.revenueRecognition?.toObject?.() || order.revenueRecognition || {}),
        recognizedAt: now,
        recognizedBy: userId,
        amount: order.totals?.amountTotal || 0,
      };
      break;
    case Q2C_STATUS.CANCELLED:
      order.status = DOCUMENT_STATUS.CANCELLED;
      break;
    default:
      break;
  }

  order.q2cStatus = to;
  await order.save();
  return { kind: "order", id, q2cStatus: to };
}
