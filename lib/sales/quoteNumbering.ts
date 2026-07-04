import { getDefaultPrefix, getNextSequence } from "@/lib/sales/invoiceNumbering";
import { SALES_DOCUMENT_TYPE } from "@/lib/constants/statuses";

// Same atomic-counter approach as lib/sales/invoiceNumbering.ts, namespaced
// under "quote:" so quote and invoice sequences never collide.
export async function generateQuoteNumber(
  tenantId: string,
  prefixOverride?: string,
): Promise<{ number: string; prefix: string; seq: number }> {
  const resolvedPrefix =
    prefixOverride && prefixOverride.trim() ? prefixOverride : await getDefaultPrefix(tenantId, SALES_DOCUMENT_TYPE.QUOTATION);
  const counter = await getNextSequence(tenantId, `quote:${resolvedPrefix}`);
  const number = `${resolvedPrefix}${String(counter).padStart(6, "0")}`;
  return { number, prefix: resolvedPrefix, seq: counter };
}
