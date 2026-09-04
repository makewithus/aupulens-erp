import connectDB from "@/lib/db";
import Customer from "@/models/sales/Customer";
import Invoice from "@/models/finance/Invoice";
import AiComplianceProfile from "@/models/ai/AiComplianceProfile";

/**
 * AI-19's missing-critical-field detection (docs/ai/BRIEF-08a-BATCH-G.md, AI-19 detection set
 * item 2) — reports gaps, never fills them. Tax registration number is only flagged when the
 * tenant's own `AiComplianceProfile` shows a real registration exists (i.e. the tenant genuinely
 * operates under a jurisdiction that requires one) — never an assumed "every vendor needs a
 * GSTIN" default, matching A.2's own compliance-profile discipline from Chunk 6.
 */

export interface MissingFieldFinding {
  model: string;
  recordId: string;
  missing: string[];
}

export async function findMissingFields(tenantId: string, role: "customer" | "vendor"): Promise<MissingFieldFinding[]> {
  await connectDB();
  const moveType = role === "customer" ? "out_invoice" : "in_invoice";
  const candidateIds = (await Invoice.distinct("partnerId", { tenantId, moveType })).map(String);
  if (candidateIds.length === 0) return [];

  const profile = await AiComplianceProfile.findOne({ tenantId }).lean();
  const registrationExpected = Boolean(profile && profile.registrations.length > 0);

  const records = await Customer.find({ tenantId, _id: { $in: candidateIds } })
    .select("gstin address_tab accounting_tab currencyId currency")
    .lean();

  const findings: MissingFieldFinding[] = [];
  for (const r of records) {
    const missing: string[] = [];
    if (registrationExpected && !r.gstin) missing.push("tax_registration_number");
    const addr = r.address_tab as { street?: string; city?: string } | undefined;
    if (!addr?.street && !addr?.city) missing.push("address");
    const acct = r.accounting_tab as { property_account_receivable_id?: unknown; property_account_payable_id?: unknown } | undefined;
    const relevantAccountField = role === "customer" ? acct?.property_account_receivable_id : acct?.property_account_payable_id;
    if (!relevantAccountField) missing.push("default_account");
    if (missing.length > 0) findings.push({ model: "Customer", recordId: String(r._id), missing });
  }
  return findings;
}
