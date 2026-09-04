import connectDB from "@/lib/db";
import Invoice from "@/models/finance/Invoice";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import Expense from "@/models/finance/Expense";
import Customer from "@/models/sales/Customer";
import AiTaxTransaction, { AI_TAX_DIRECTION, type AiTaxDirection } from "@/models/ai/AiTaxTransaction";
import AiComplianceProfile from "@/models/ai/AiComplianceProfile";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

/**
 * AI-12's projection builder (docs/ai/BRIEF-06-BATCH-E.md A.1) — the ONLY place
 * `AiTaxTransaction` rows are written, and the only thing it ever does is re-shape tax amounts
 * the existing inline math already computed. Never computes a tax figure itself.
 *
 * **`taxRateRef`/`taxType` are `null` for every row, honestly** — no source document
 * (`Invoice`, `SalesInvoice`, `Expense`) carries a reliable link to the `TaxRate` that produced
 * its stored tax amount (`Invoice.invoiceLines[].taxIds` is the same vestigial field found in
 * Chunk 1/3 — never written by anything). Inventing one would be a guess, not a projection.
 *
 * **Jurisdiction resolution is a documented simplification**: with no place-of-supply field on
 * any source document, a transaction's jurisdiction can only be assigned unambiguously when the
 * tenant's `AiComplianceProfile` has exactly one registration (the overwhelmingly common single-
 * jurisdiction case) — otherwise it stays `null`, surfaced as `jurisdiction_unresolved`, never
 * guessed among several possibilities.
 */

function periodKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)) };
}

interface ProjectedRow {
  sourceRef: { model: string; id: string };
  direction: AiTaxDirection;
  jurisdiction: string | null;
  counterpartyTaxRegistrationNumber: string | null;
  taxableAmount: number;
  taxAmount: number;
  documentDate: Date;
  evidenceRefs: { kind: string; ref: string; label: string }[];
}

async function resolveJurisdiction(tenantId: string): Promise<string | null> {
  const profile = await AiComplianceProfile.findOne({ tenantId }).lean();
  if (!profile || profile.registrations.length !== 1) return null;
  return profile.registrations[0].jurisdiction;
}

export async function rebuildTaxProjection(tenantId: string, period: string): Promise<{ rowCount: number; projectionVersion: number }> {
  await connectDB();
  const { start, end } = monthBounds(period);
  const jurisdiction = await resolveJurisdiction(tenantId);
  const projectedAt = new Date();

  const existing = await AiTaxTransaction.findOne({ tenantId, periodKey: period }).sort({ projectionVersion: -1 }).lean();
  const projectionVersion = (existing?.projectionVersion ?? 0) + 1;

  const rows: ProjectedRow[] = [];

  // Finance Invoice — both directions, whichever tax the inline math already computed.
  const financeInvoices = await Invoice.find({ tenantId, invoiceDate: { $gte: start, $lte: end }, state: { $ne: DOCUMENT_STATUS.CANCELLED } })
    .select("_id moveType amountTax amountUntaxed invoiceDate partnerId")
    .lean();
  const partnerIds = financeInvoices.map((i) => i.partnerId).filter(Boolean);
  const partners = await Customer.find({ _id: { $in: partnerIds } }).select("gstin").lean();
  const gstinByPartner = new Map(partners.map((p) => [String(p._id), (p as { gstin?: string }).gstin ?? null]));

  for (const inv of financeInvoices) {
    const taxAmount = (inv as { amountTax?: number }).amountTax ?? 0;
    if (Math.abs(taxAmount) < 0.005) continue; // no tax on this document — nothing to project
    rows.push({
      sourceRef: { model: "Invoice", id: String(inv._id) },
      direction: inv.moveType === "out_invoice" ? AI_TAX_DIRECTION.OUTPUT : AI_TAX_DIRECTION.INPUT,
      jurisdiction,
      counterpartyTaxRegistrationNumber: gstinByPartner.get(String(inv.partnerId)) ?? null,
      taxableAmount: (inv as { amountUntaxed?: number }).amountUntaxed ?? 0,
      taxAmount,
      documentDate: (inv as { invoiceDate?: Date }).invoiceDate ?? projectedAt,
      evidenceRefs: [{ kind: "record", ref: String(inv._id), label: "Invoice" }],
    });
  }

  // SalesInvoice — output tax (GST breakup only; TDS/TCS are withholding, out of scope this batch).
  const salesInvoices = await (SalesInvoice as any)
    .find({ tenantId, invoiceDate: { $gte: start, $lte: end }, status: { $nin: ["draft", "cancelled"] } })
    .select("_id taxableAmount taxes invoiceDate customerId")
    .lean();
  const siCustomerIds = salesInvoices.map((i: any) => i.customerId).filter(Boolean);
  const siCustomers = await Customer.find({ _id: { $in: siCustomerIds } }).select("gstin").lean();
  const gstinBySiCustomer = new Map(siCustomers.map((c) => [String(c._id), (c as { gstin?: string }).gstin ?? null]));

  for (const inv of salesInvoices) {
    const gstBreakup = (inv.taxes?.gstBreakup ?? []) as { label: string; amount: number }[];
    const taxAmount = gstBreakup.reduce((s, b) => s + (Number(b.amount) || 0), 0);
    if (Math.abs(taxAmount) < 0.005) continue;
    rows.push({
      sourceRef: { model: "SalesInvoice", id: String(inv._id) },
      direction: AI_TAX_DIRECTION.OUTPUT,
      jurisdiction,
      counterpartyTaxRegistrationNumber: gstinBySiCustomer.get(String(inv.customerId)) ?? null,
      taxableAmount: inv.taxableAmount ?? 0,
      taxAmount,
      documentDate: inv.invoiceDate ?? projectedAt,
      evidenceRefs: [{ kind: "record", ref: String(inv._id), label: "SalesInvoice" }],
    });
  }

  // Expense — input tax. No counterparty (employee-submitted), no registration number concept.
  const expenses = await Expense.find({ tenantId, expenseDate: { $gte: start, $lte: end }, status: { $ne: DOCUMENT_STATUS.CANCELLED } })
    .select("_id total taxAmount expenseDate")
    .lean();
  for (const exp of expenses) {
    const taxAmount = (exp as { taxAmount?: number }).taxAmount ?? 0;
    if (Math.abs(taxAmount) < 0.005) continue;
    rows.push({
      sourceRef: { model: "Expense", id: String(exp._id) },
      direction: AI_TAX_DIRECTION.INPUT,
      jurisdiction,
      counterpartyTaxRegistrationNumber: null,
      taxableAmount: (exp.total ?? 0) - taxAmount,
      taxAmount,
      documentDate: (exp as { expenseDate?: Date }).expenseDate ?? projectedAt,
      evidenceRefs: [{ kind: "record", ref: String(exp._id), label: "Expense" }],
    });
  }

  // Rebuild is a real delete-then-recreate for this period — idempotent (rebuild twice, get
  // identical rows) and self-healing (a corrupted row is simply replaced, not patched in place).
  await AiTaxTransaction.deleteMany({ tenantId, periodKey: period });
  if (rows.length > 0) {
    await AiTaxTransaction.insertMany(
      rows.map((r) => ({
        tenantId,
        sourceRef: r.sourceRef,
        direction: r.direction,
        jurisdiction: r.jurisdiction,
        taxRateRef: null,
        taxType: null,
        counterpartyTaxRegistrationNumber: r.counterpartyTaxRegistrationNumber,
        taxableAmount: r.taxableAmount,
        taxAmount: r.taxAmount,
        documentDate: r.documentDate,
        periodKey: period,
        evidenceRefs: r.evidenceRefs,
        projectedAt,
        projectionVersion,
      })),
      { ordered: false },
    );
  }

  return { rowCount: rows.length, projectionVersion };
}

export { periodKeyOf, monthBounds };
