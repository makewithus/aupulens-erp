import DocumentPrefix from "@/models/DocumentPrefix";
import { DOCUMENT_PREFIX_KIND, SALES_DOCUMENT_TYPE } from "@/lib/constants/statuses";

/** Default PREFIX value seeded per document type when a tenant has none yet. */
const DEFAULT_PREFIX_BY_DOCUMENT_TYPE: Record<string, string> = {
  [SALES_DOCUMENT_TYPE.INVOICE]: "INV-",
  [SALES_DOCUMENT_TYPE.PURCHASE]: "PUR-",
  [SALES_DOCUMENT_TYPE.SALES_RETURN]: "SR-",
  [SALES_DOCUMENT_TYPE.PURCHASE_RETURN]: "PR-",
  [SALES_DOCUMENT_TYPE.PURCHASE_ORDER]: "PO-",
  [SALES_DOCUMENT_TYPE.DELIVERY_CHALLAN]: "DC-",
  [SALES_DOCUMENT_TYPE.SALES_ORDER]: "SO-",
  [SALES_DOCUMENT_TYPE.QUOTATION]: "QUO-",
};

// Caller must have already called connectDB().

export interface CreatePrefixInput {
  tenantId: string;
  documentType: string;
  kind?: string;
  value: string;
  isDefault?: boolean;
  createdBy?: string;
}

/** Unsets isDefault on every other row of the same (tenantId, documentType, kind). */
export async function clearOtherDefaults(
  tenantId: string,
  documentType: string,
  kind: string,
  exceptId?: string,
): Promise<void> {
  await DocumentPrefix.updateMany(
    { tenantId, documentType, kind, ...(exceptId ? { _id: { $ne: exceptId } } : {}) },
    { $set: { isDefault: false } },
  );
}

/**
 * Creates a prefix/suffix row. The first row of its (tenantId, documentType,
 * kind) becomes the default automatically; exactly one default is enforced
 * by clearing any other default first.
 */
export async function createPrefix(input: CreatePrefixInput) {
  const kind = input.kind || DOCUMENT_PREFIX_KIND.PREFIX;
  const existingCount = await DocumentPrefix.countDocuments({ tenantId: input.tenantId, documentType: input.documentType, kind });
  const isDefault = input.isDefault ?? existingCount === 0;

  if (isDefault) {
    await clearOtherDefaults(input.tenantId, input.documentType, kind);
  }

  return DocumentPrefix.create({
    tenantId: input.tenantId,
    documentType: input.documentType,
    kind,
    value: input.value.trim(),
    isDefault,
    createdBy: input.createdBy,
  });
}

/** Sets a specific row as THE default for its (tenantId, documentType, kind), unsetting all others. */
export async function setAsDefault(tenantId: string, id: string) {
  const row = await DocumentPrefix.findOne({ _id: id, tenantId });
  if (!row) return null;
  await clearOtherDefaults(tenantId, row.documentType, row.kind, id);
  row.isDefault = true;
  await row.save();
  return row;
}

/**
 * Idempotently seeds one default PREFIX row per document type for a tenant
 * that has none yet — so a brand-new tenant sees a working "INV-" default
 * (etc.) instead of an empty "No prefixes yet" screen. Never touches a
 * document type that already has at least one PREFIX row.
 */
export async function ensureDefaultPrefixes(tenantId: string): Promise<void> {
  const existing = await DocumentPrefix.find({ tenantId, kind: DOCUMENT_PREFIX_KIND.PREFIX })
    .distinct("documentType");
  const existingSet = new Set<string>(existing);
  const missing = Object.keys(DEFAULT_PREFIX_BY_DOCUMENT_TYPE).filter((dt) => !existingSet.has(dt));
  if (!missing.length) return;

  await DocumentPrefix.insertMany(
    missing.map((documentType) => ({
      tenantId,
      documentType,
      kind: DOCUMENT_PREFIX_KIND.PREFIX,
      value: DEFAULT_PREFIX_BY_DOCUMENT_TYPE[documentType],
      isDefault: true,
    })),
    { ordered: false },
  ).catch(() => {
    // Concurrent request already seeded these rows — safe to ignore (unique index prevents duplicates).
  });
}

/** After deleting a default row, promotes the oldest remaining row so one default always exists. */
export async function promoteFallbackDefault(tenantId: string, documentType: string, kind: string) {
  const fallback = await DocumentPrefix.findOne({ tenantId, documentType, kind }).sort({ createdAt: 1 });
  if (fallback) {
    fallback.isDefault = true;
    await fallback.save();
  }
  return fallback;
}
