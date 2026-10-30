import { getDefaultPrefix, getNextSequence } from "@/lib/sales/invoiceNumbering";
import { SALES_DOCUMENT_TYPE } from "@/lib/constants/statuses";
import Counter from "@/models/shared/Counter";
import SalesQuotation from "@/models/sales/SalesQuotation";

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Same atomic-counter approach as lib/sales/invoiceNumbering.ts, namespaced
// under "quote:" so quote and invoice sequences never collide.
export async function generateQuoteNumber(
  tenantId: string,
  prefixOverride?: string,
): Promise<{ number: string; prefix: string; seq: number }> {
  const resolvedPrefix =
    prefixOverride && prefixOverride.trim() ? prefixOverride : await getDefaultPrefix(tenantId, SALES_DOCUMENT_TYPE.QUOTATION);
  // Keep the namespaced counter ahead of legacy/manual quotes already in the
  // collection. This avoids starting a new AI quote sequence at 1 and
  // colliding repeatedly with existing quote numbers.
  const latest = await SalesQuotation.findOne({
    tenantId,
    quoteNumber: { $regex: `^${escapeRegex(resolvedPrefix)}\\d+$` },
  }).sort({ quoteNumber: -1 }).select("quoteNumber").lean() as { quoteNumber?: string } | null;
  const latestSequence = Number(latest?.quoteNumber?.match(/(\d+)$/)?.[1]) || 0;
  if (latestSequence > 0) {
    await Counter.updateOne(
      { tenantId, key: `invoice:quote:${resolvedPrefix}` },
      { $max: { seq: latestSequence } },
      { upsert: true },
    );
  }
  const counter = await getNextSequence(tenantId, `quote:${resolvedPrefix}`);
  const number = `${resolvedPrefix}${String(counter).padStart(6, "0")}`;
  return { number, prefix: resolvedPrefix, seq: counter };
}
