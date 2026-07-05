import { getDefaultPrefix, getNextSequence } from "@/lib/sales/invoiceNumbering";
import { SALES_DOCUMENT_TYPE } from "@/lib/constants/statuses";

// Same atomic-counter approach as lib/sales/quoteNumbering.ts, namespaced
// under "subscription:" so it never collides with invoice/quote sequences.
export async function generateSubscriptionNumber(
  tenantId: string,
  prefixOverride?: string,
): Promise<{ number: string; prefix: string; seq: number }> {
  const resolvedPrefix =
    prefixOverride && prefixOverride.trim()
      ? prefixOverride
      : await getDefaultPrefix(tenantId, SALES_DOCUMENT_TYPE.SUBSCRIPTION);
  const counter = await getNextSequence(tenantId, `subscription:${resolvedPrefix}`);
  const number = `${resolvedPrefix}${String(counter).padStart(6, "0")}`;
  return { number, prefix: resolvedPrefix, seq: counter };
}
