import TaxRate from "@/models/finance/TaxRate";
import { TDS_RATES, TCS_RATES } from "@/lib/constants/taxRates";

/** Add missing defaults without overwriting tenant-edited rates or reactivating archived rows. */
export async function ensureDefaultTdsTcsRates(tenantId: string, createdByUserId: string) {
  // Retire only exact, unedited obsolete built-in presets. Existing documents
  // retain their stored rate and reference; tenant custom rows are untouched.
  const obsolete = [
    { name: "TDS 194H - Commission/Brokerage (5%)", type: "tds", ratePercent: 5, sectionCode: "194H" },
    { name: "TDS 192 - Salaries", type: "tds", ratePercent: 0, sectionCode: "192" },
    { name: "TCS 206C(1H) - Sale of Goods (0.1%)", type: "tcs", ratePercent: 0.1, sectionCode: "206C(1H)" },
    { name: "TCS 206C(1H) - 0.1% (Sale of Goods)", type: "tcs", ratePercent: 0.1, sectionCode: "206C(1H)" },
    { name: "TCS 206C - Scrap/Tendu/Forest (1%)", type: "tcs", ratePercent: 1, sectionCode: "206C" },
    { name: "TCS 206C - Minerals (0.25%)", type: "tcs", ratePercent: 0.25, sectionCode: "206C" },
  ];
  await TaxRate.updateMany({ tenantId, $or: obsolete }, { $set: { status: "inactive" } });
  const existing = await TaxRate.find({ tenantId, type: { $in: ["tds", "tcs"] } }).select("name type").lean();
  const names = new Set(existing.map((r) => `${r.type}:${r.name}`));
  for (const [type, rates] of [["tds", TDS_RATES], ["tcs", TCS_RATES]] as const) {
    for (const rate of rates) {
      const name = `${type.toUpperCase()} ${rate.label}`;
      if (names.has(`${type}:${name}`)) continue;
      try {
        await TaxRate.updateOne({ tenantId, type, name }, { $setOnInsert: {
          ratePercent: rate.rate, sectionCode: rate.sectionCode, appliesTo: "both", status: "active", createdBy: createdByUserId,
        } }, { upsert: true });
      } catch (error: any) { if (error?.code !== 11000) throw error; }
    }
  }
}
