export interface QuoteLineItem {
  item_name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  tax_percent: number;
  line_total?: number;
  is_optional?: boolean;
  is_bundled?: boolean;
  bundle_name?: string;
}

export interface QuoteTotals {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  avgDiscountPercent: number;
}

/**
 * Calculate totals for a set of line items.
 * Returns per-item line_total and aggregate totals.
 */
export function calculateQuoteTotals(
  lineItems: QuoteLineItem[]
): { items: QuoteLineItem[]; totals: QuoteTotals } {
  let subtotal = 0;
  let discountTotal = 0;
  let taxTotal = 0;
  let grandTotal = 0;

  const items = lineItems.map((item) => {
    const q = Math.max(Number(item.quantity) || 0, 0);
    const p = Math.max(Number(item.unit_price) || 0, 0);
    const dp = Math.min(Math.max(Number(item.discount_percent) || 0, 0), 100);
    const tp = Math.max(Number(item.tax_percent) || 0, 0);

    const lineBase = q * p;
    const discAmt = lineBase * (dp / 100);
    const afterDiscount = lineBase - discAmt;
    const taxAmt = afterDiscount * (tp / 100);
    const lineTotal = afterDiscount + taxAmt;

    subtotal += lineBase;
    discountTotal += discAmt;
    taxTotal += taxAmt;
    grandTotal += lineTotal;

    return { ...item, line_total: lineTotal };
  });

  const avgDiscountPercent =
    lineItems.length > 0
      ? lineItems.reduce((acc, i) => acc + (Number(i.discount_percent) || 0), 0) /
        lineItems.length
      : 0;

  return {
    items,
    totals: { subtotal, discountTotal, taxTotal, grandTotal, avgDiscountPercent },
  };
}

/**
 * Client-side convenience: same logic, simpler return shape.
 * @deprecated use calculateQuoteTotals
 */
export function calculateQuoteClientSide(lineItems: QuoteLineItem[]) {
  const { items, totals } = calculateQuoteTotals(lineItems);
  return {
    items,
    discountTotal: totals.discountTotal,
    taxTotal: totals.taxTotal,
    grandTotal: totals.grandTotal,
  };
}

/**
 * Determine the approval tier based on average line-item discount.
 */
export function discountApprovalTier(
  avgDiscountPercent: number
): "auto" | "manager" | "executive" {
  if (avgDiscountPercent <= 5) return "auto";
  if (avgDiscountPercent <= 20) return "manager";
  return "executive";
}

export const APPROVAL_TIER_LABELS: Record<string, string> = {
  auto: "Auto-approved (≤5% discount)",
  manager: "Manager approval required (>5% discount)",
  executive: "Executive approval required (>20% discount)",
};
