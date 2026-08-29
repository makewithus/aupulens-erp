import { InvoiceTemplate } from "@/models/sales/InvoiceTemplate";
import { TEMPLATE_DEFINITIONS, ACTIVE_TEMPLATE_KEYS } from "./definitions";

/**
 * Idempotently ensures the global (tenantId: null) template catalog rows
 * exist for every ACTIVE template, and removes catalog rows for any
 * currently-inactive template key (the 5 categories out of scope for now —
 * they stay defined in code/`TEMPLATE_DEFINITIONS` so they can be
 * re-activated later, but must not appear in the gallery/selector). Safe to
 * call on every read.
 */
export async function ensureInvoiceTemplatesSeeded(): Promise<void> {
  await (InvoiceTemplate as any).deleteMany({ tenantId: { $exists: false }, key: { $nin: ACTIVE_TEMPLATE_KEYS } });

  const existing = await InvoiceTemplate.countDocuments({ tenantId: { $exists: false } });
  const activeDefs = TEMPLATE_DEFINITIONS.filter((d) => ACTIVE_TEMPLATE_KEYS.includes(d.key));
  if (existing >= activeDefs.length) return;

  for (const def of activeDefs) {
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
