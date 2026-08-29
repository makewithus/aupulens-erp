import TaxRate from "@/models/finance/TaxRate";

// Common Indian withholding-tax defaults — editable/removable by the user
// afterward via the Tax Rates / TDS Rates / TCS Rates settings pages. These
// are sensible starting points, not a claim of legal completeness.
const DEFAULT_TDS_RATES = [
  { name: "TDS 194C - 1% (Individual/HUF)", ratePercent: 1, sectionCode: "194C" },
  { name: "TDS 194C - 2% (Others)", ratePercent: 2, sectionCode: "194C" },
  { name: "TDS 194J - 10% (Professional/Technical Services)", ratePercent: 10, sectionCode: "194J" },
];
const DEFAULT_TCS_RATES = [{ name: "TCS 206C(1H) - 0.1% (Sale of Goods)", ratePercent: 0.1, sectionCode: "206C(1H)" }];

/** Seeds default TDS/TCS tax rates for a tenant that has none yet, for either type independently. */
export async function ensureDefaultTdsTcsRates(tenantId: string, createdByUserId: string) {
  const [tdsCount, tcsCount] = await Promise.all([
    TaxRate.countDocuments({ tenantId, type: "tds" }),
    TaxRate.countDocuments({ tenantId, type: "tcs" }),
  ]);

  const toCreate: any[] = [];
  if (tdsCount === 0) {
    toCreate.push(
      ...DEFAULT_TDS_RATES.map((d) => ({
        tenantId,
        name: d.name,
        type: "tds",
        ratePercent: d.ratePercent,
        appliesTo: "both",
        sectionCode: d.sectionCode,
        status: "active",
        createdBy: createdByUserId,
      })),
    );
  }
  if (tcsCount === 0) {
    toCreate.push(
      ...DEFAULT_TCS_RATES.map((d) => ({
        tenantId,
        name: d.name,
        type: "tcs",
        ratePercent: d.ratePercent,
        appliesTo: "both",
        sectionCode: d.sectionCode,
        status: "active",
        createdBy: createdByUserId,
      })),
    );
  }

  if (toCreate.length) {
    await TaxRate.insertMany(toCreate, { ordered: false }).catch(() => {
      // Ignore duplicate-key races (two concurrent requests seeding at once) — not a real failure.
    });
  }
}
