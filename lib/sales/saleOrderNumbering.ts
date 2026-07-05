import { getDefaultPrefix, getNextSequence } from "@/lib/sales/invoiceNumbering";
import { SALES_DOCUMENT_TYPE } from "@/lib/constants/statuses";

// Same atomic-counter approach as lib/sales/quoteNumbering.ts /
// subscriptionNumbering.ts, namespaced under "saleorder:" so it never
// collides with invoice/quote/subscription sequences.
export async function generateSaleOrderNumber(
  tenantId: string,
  prefixOverride?: string,
): Promise<{ number: string; prefix: string; seq: number }> {
  const resolvedPrefix =
    prefixOverride && prefixOverride.trim()
      ? prefixOverride
      : await getDefaultPrefix(tenantId, SALES_DOCUMENT_TYPE.SALES_ORDER);
  const counter = await getNextSequence(tenantId, `saleorder:${resolvedPrefix}`);
  const number = `${resolvedPrefix}${String(counter).padStart(6, "0")}`;
  return { number, prefix: resolvedPrefix, seq: counter };
}
