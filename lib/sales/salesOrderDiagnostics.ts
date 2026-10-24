import { computeInvoiceTotals, InvoiceLineInput } from "@/lib/sales/invoiceMath";

export interface SalesOrderDiscrepancy {
  field: string;
  storedValue: number;
  expectedValue: number;
  difference: number;
  description: string;
}

export interface SalesOrderAuditResult {
  orderNumber: string;
  orderId?: string;
  isValid: boolean;
  discrepancies: SalesOrderDiscrepancy[];
  storedTotals: {
    amountUntaxed: number;
    amountTax: number;
    amountTotal: number;
    subTotal?: number;
  };
  expectedTotals: {
    amountUntaxed: number;
    amountTax: number;
    amountTotal: number;
    subTotal: number;
  };
  canAutoRepair: boolean;
  notes?: string;
}

/**
 * Pure function to diagnose discrepancies in a Sales Order's financial totals.
 * Flags orders where lines do not add up to amountTotal, tax was omitted, or
 * untaxed subtotal was miscalculated during legacy import.
 */
export function diagnoseSalesOrder(order: any): SalesOrderAuditResult {
  const orderNumber = order?.header?.name || order?.number || "Unknown";
  const orderId = order?._id ? String(order._id) : undefined;
  const orderLines = order?.orderLines || [];

  const storedTotals = {
    amountUntaxed: Number(order?.totals?.amountUntaxed ?? order?.subTotal ?? 0),
    amountTax: Number(order?.totals?.amountTax ?? order?.taxAmount ?? 0),
    amountTotal: Number(order?.totals?.amountTotal ?? 0),
    subTotal: Number(order?.subTotal ?? order?.totals?.amountUntaxed ?? 0),
  };

  if (!orderLines.length) {
    const isZeroValid = storedTotals.amountTotal === 0;
    return {
      orderNumber,
      orderId,
      isValid: isZeroValid,
      discrepancies: isZeroValid
        ? []
        : [
            {
              field: "amountTotal",
              storedValue: storedTotals.amountTotal,
              expectedValue: 0,
              difference: storedTotals.amountTotal,
              description: "Order has zero lines but non-zero total amount.",
            },
          ],
      storedTotals,
      expectedTotals: { amountUntaxed: 0, amountTax: 0, amountTotal: 0, subTotal: 0 },
      canAutoRepair: false,
      notes: "No lines present to compute authoritative totals.",
    };
  }

  const lineInputs: InvoiceLineInput[] = orderLines.map((l: any) => ({
    name: l.name || "Item",
    qty: Number(l.productQty ?? l.qty ?? 1),
    unitPrice: Number(l.priceUnit ?? l.unitPrice ?? 0),
    discount: Number(l.discount ?? 0),
    discountMode: "percent",
    taxRate: Number(l.taxRate ?? (l.taxIds && l.taxIds[0]?.rate) ?? 0),
  }));

  const computed = computeInvoiceTotals({
    lineItems: lineInputs,
    roundOff: true,
  });

  const discrepancies: SalesOrderDiscrepancy[] = [];
  const TOLERANCE = 0.05;

  if (Math.abs(storedTotals.amountTotal - computed.totalAmount) > TOLERANCE) {
    discrepancies.push({
      field: "amountTotal",
      storedValue: storedTotals.amountTotal,
      expectedValue: computed.totalAmount,
      difference: Math.round((storedTotals.amountTotal - computed.totalAmount) * 100) / 100,
      description: `Stored amountTotal (${storedTotals.amountTotal}) mismatches recomputed total (${computed.totalAmount}).`,
    });
  }

  if (Math.abs(storedTotals.amountUntaxed - computed.taxableAmount) > TOLERANCE) {
    discrepancies.push({
      field: "amountUntaxed",
      storedValue: storedTotals.amountUntaxed,
      expectedValue: computed.taxableAmount,
      difference: Math.round((storedTotals.amountUntaxed - computed.taxableAmount) * 100) / 100,
      description: `Stored amountUntaxed (${storedTotals.amountUntaxed}) mismatches recomputed taxable amount (${computed.taxableAmount}).`,
    });
  }

  const expectedTotals = {
    amountUntaxed: computed.taxableAmount,
    amountTax: computed.totalTax,
    amountTotal: computed.totalAmount,
    subTotal: computed.subtotal,
  };

  const hasLineDetails = lineInputs.every((l) => l.qty > 0 && l.unitPrice >= 0);
  const canAutoRepair = discrepancies.length > 0 && hasLineDetails;

  return {
    orderNumber,
    orderId,
    isValid: discrepancies.length === 0,
    discrepancies,
    storedTotals,
    expectedTotals,
    canAutoRepair,
    notes:
      discrepancies.length > 0
        ? `Detected ${discrepancies.length} discrepancy/discrepancies. Check legacy import discount and tax mapping.`
        : undefined,
  };
}

/**
 * Dry-run repair proposing patches without mutating any database record.
 */
export function dryRunRepairSalesOrder(order: any): {
  orderNumber: string;
  canRepair: boolean;
  audit: SalesOrderAuditResult;
  proposedPatch?: Record<string, any>;
} {
  const audit = diagnoseSalesOrder(order);
  if (audit.isValid || !audit.canAutoRepair) {
    return {
      orderNumber: audit.orderNumber,
      canRepair: false,
      audit,
    };
  }

  const proposedPatch = {
    "totals.amountUntaxed": audit.expectedTotals.amountUntaxed,
    "totals.amountTax": audit.expectedTotals.amountTax,
    "totals.amountTotal": audit.expectedTotals.amountTotal,
    subTotal: audit.expectedTotals.subTotal,
    taxAmount: audit.expectedTotals.amountTax,
  };

  return {
    orderNumber: audit.orderNumber,
    canRepair: true,
    audit,
    proposedPatch,
  };
}

export function normalizeSalesOrderStatus(status?: string): string {
  if (!status) return "draft";
  const s = String(status).toLowerCase();
  if (["confirmed", "approved", "sale"].includes(s)) return "confirmed";
  if (["closed", "done", "posted"].includes(s)) return "closed";
  if (["void", "cancelled", "cancel", "rejected"].includes(s)) return "void";
  if (["on_hold", "hold"].includes(s)) return "on_hold";
  if (["pending_approval", "sent"].includes(s)) return "pending_approval";
  return "draft";
}

export function getEquivalentSalesOrderStatuses(status: string): { salesOrderStatuses: string[]; legacyStatuses: string[] } {
  const norm = normalizeSalesOrderStatus(status);
  if (norm === "confirmed") {
    return { salesOrderStatuses: ["confirmed", "approved"], legacyStatuses: ["confirmed", "approved", "sale"] };
  }
  if (norm === "closed") {
    return { salesOrderStatuses: ["closed"], legacyStatuses: ["closed", "done", "posted"] };
  }
  if (norm === "void") {
    return { salesOrderStatuses: ["void"], legacyStatuses: ["void", "cancelled", "cancel", "rejected"] };
  }
  if (norm === "on_hold") {
    return { salesOrderStatuses: ["on_hold"], legacyStatuses: ["on_hold"] };
  }
  if (norm === "pending_approval") {
    return { salesOrderStatuses: ["pending_approval"], legacyStatuses: ["pending_approval", "sent"] };
  }
  return { salesOrderStatuses: ["draft"], legacyStatuses: ["draft"] };
}
