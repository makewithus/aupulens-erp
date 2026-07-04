import { InvoiceTemplate } from "@/models/InvoiceTemplate";
import { TEMPLATE_DEFINITIONS } from "./definitions";

/**
 * Idempotently ensures the 14 global (tenantId: null) template catalog rows
 * exist. Safe to call on every read — a no-op after the first run.
 */
export async function ensureInvoiceTemplatesSeeded(): Promise<void> {
  const existing = await InvoiceTemplate.countDocuments({ tenantId: { $exists: false } });
  if (existing >= TEMPLATE_DEFINITIONS.length) return;

  for (const def of TEMPLATE_DEFINITIONS) {
    await (InvoiceTemplate as any).findOneAndUpdate(
      { tenantId: { $exists: false }, key: def.key },
      {
        $setOnInsert: {
          key: def.key,
          name: def.name,
          category: def.category,
          isDefault: def.key === "modern",
          previewData: { description: def.description },
        },
      },
      { upsert: true },
    );
  }
}
