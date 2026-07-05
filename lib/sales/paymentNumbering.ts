import { getDefaultPrefix, getNextSequence } from "@/lib/sales/invoiceNumbering";
import { SALES_DOCUMENT_TYPE } from "@/lib/constants/statuses";

// Same shape as saleOrderNumbering.ts/quoteNumbering.ts/subscriptionNumbering.ts.
// Caller must have already called connectDB().
export async function generatePaymentNumber(
  tenantId: string,
  prefixOverride?: string,
): Promise<{ number: string; prefix: string; seq: number }> {
  const prefix = prefixOverride && prefixOverride.trim()
    ? prefixOverride
    : await getDefaultPrefix(tenantId, SALES_DOCUMENT_TYPE.PAYMENT);
  const seq = await getNextSequence(tenantId, `payment:${prefix}`);
  const number = `${prefix}${String(seq).padStart(6, "0")}`;
  return { number, prefix, seq };
}
