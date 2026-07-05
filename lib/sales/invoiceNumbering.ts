import Counter from "@/models/Counter";
import DocumentPrefix from "@/models/DocumentPrefix";
import { SALES_DOCUMENT_TYPE, DOCUMENT_PREFIX_KIND } from "@/lib/constants/statuses";
import { DEFAULT_PREFIX_BY_DOCUMENT_TYPE } from "@/lib/sales/documentPrefixes";

// Caller must have already called connectDB().

export async function getDefaultPrefix(
  tenantId: string,
  documentType: string = SALES_DOCUMENT_TYPE.INVOICE,
): Promise<string> {
  const doc = await DocumentPrefix.findOne({
    tenantId,
    documentType,
    kind: DOCUMENT_PREFIX_KIND.PREFIX,
    isDefault: true,
  }).lean();
  if (doc) return (doc as any).value;
  // No DocumentPrefix row has been seeded for this tenant/documentType yet
  // (ensureDefaultPrefixes only runs when the Document Settings page is
  // visited) — fall back to the same per-document-type default it would
  // have seeded, instead of a generic "DOC-" that only ever matched INVOICE.
  return DEFAULT_PREFIX_BY_DOCUMENT_TYPE[documentType] || "DOC-";
}

/**
 * Atomically reserves the next sequence number for a (tenantId, prefix) pair.
 * Uses MongoDB's atomic findOneAndUpdate $inc — no read-then-write gap, so
 * concurrent requests for the same prefix never collide.
 */
export async function getNextSequence(tenantId: string, prefix: string): Promise<number> {
  const key = `invoice:${prefix}`;
  const counter = await Counter.findOneAndUpdate(
    { tenantId, key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  return counter!.seq;
}

export async function generateInvoiceNumber(
  tenantId: string,
  prefix?: string,
): Promise<{ number: string; prefix: string; seq: number }> {
  const resolvedPrefix = prefix && prefix.trim() ? prefix : await getDefaultPrefix(tenantId);
  const seq = await getNextSequence(tenantId, resolvedPrefix);
  const number = `${resolvedPrefix}${String(seq).padStart(4, "0")}`;
  return { number, prefix: resolvedPrefix, seq };
}
