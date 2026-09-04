import connectDB from "@/lib/db";
import AiMasterDataSnapshot from "@/models/ai/AiMasterDataSnapshot";
import { maskValue } from "@/lib/aiRuntime/masterData/masking";

/**
 * AI-19's snapshot-diffing (docs/ai/BRIEF-08a-BATCH-G.md 0.5) — derives change history without
 * touching `Vendor`/`Customer`/`Employee`/`BankAccount`. Each model gets a small, explicit field
 * extractor naming exactly which fields are tracked and which of those are "bank fields" (the
 * ones that drive the highest-severity alert) — never a generic "snapshot everything" that would
 * capture fields nobody asked to watch.
 *
 * **Confirmed via docs/ai/SYSTEM_INVENTORY.md's 0.3 investigation**: neither `Vendor` nor
 * `Customer` (the real AP "vendor" model, Chunk 6) has any bank-detail field at all — so their
 * `bankFields` list is empty by construction, and a bank-change alert can never fire for them
 * until such a field is added. `Employee.bankDetails` and `BankAccount.{accountNumber,bankName,
 * ifsc}` are the only real, present-today bank fields this mechanism watches.
 */

export interface FieldExtractor {
  fields: (doc: Record<string, unknown>) => Record<string, unknown>;
  bankFields: string[];
}

const EXTRACTORS: Record<string, FieldExtractor> = {
  Vendor: {
    fields: (doc) => ({ name: doc.name, category: doc.category, contactEmail: doc.contactEmail, phone: doc.phone }),
    bankFields: [],
  },
  Customer: {
    fields: (doc) => {
      const header = (doc.header as Record<string, unknown>) ?? {};
      const contact = (doc.contact_details as Record<string, unknown>) ?? {};
      return { name: header.displayName ?? header.name, gstin: doc.gstin, email: contact.email };
    },
    bankFields: [],
  },
  Employee: {
    fields: (doc) => {
      const bank = (doc.bankDetails as Record<string, unknown>) ?? {};
      return { email: doc.email, bankName: bank.bankName, accountNumber: bank.accountNumber, ifscCode: bank.ifscCode };
    },
    bankFields: ["bankName", "accountNumber", "ifscCode"],
  },
  BankAccount: {
    fields: (doc) => ({ accountNumber: doc.accountNumber, bankName: doc.bankName, ifsc: doc.ifsc, isPrimary: doc.isPrimary }),
    bankFields: ["accountNumber", "bankName", "ifsc"],
  },
};

export function getExtractor(model: string): FieldExtractor | null {
  return EXTRACTORS[model] ?? null;
}

export interface SnapshotDiff {
  field: string;
  oldMasked: string;
  newMasked: string;
  isBankField: boolean;
}

export interface SnapshotResult {
  changed: boolean;
  isFirstSnapshot: boolean;
  diffs: SnapshotDiff[];
}

/** `rawDoc` is the already-fetched, plain-object record — this module never queries the core
 *  model itself, so it stays agnostic to which model called it. */
export async function snapshotAndDiff(tenantId: string, model: string, recordId: string, rawDoc: Record<string, unknown>): Promise<SnapshotResult> {
  await connectDB();
  const extractor = getExtractor(model);
  if (!extractor) return { changed: false, isFirstSnapshot: false, diffs: [] };

  const rawFields = extractor.fields(rawDoc);
  const maskedFields: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawFields)) maskedFields[k] = maskValue(v);

  const previous = await AiMasterDataSnapshot.findOne({ tenantId, entityModel: model, recordId }).sort({ snapshotAt: -1 }).lean();

  await AiMasterDataSnapshot.create({ tenantId, entityModel: model, recordId, fields: maskedFields, snapshotAt: new Date() });

  if (!previous) return { changed: false, isFirstSnapshot: true, diffs: [] };

  const diffs: SnapshotDiff[] = [];
  for (const [field, newMasked] of Object.entries(maskedFields)) {
    const oldMasked = previous.fields?.[field] ?? "";
    if (oldMasked !== newMasked) {
      diffs.push({ field, oldMasked, newMasked, isBankField: extractor.bankFields.includes(field) });
    }
  }

  return { changed: diffs.length > 0, isFirstSnapshot: false, diffs };
}
