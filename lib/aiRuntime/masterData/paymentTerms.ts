import connectDB from "@/lib/db";
import Invoice from "@/models/finance/Invoice";
import JournalEntry from "@/models/finance/JournalEntry";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

/**
 * AI-19's observed payment terms (docs/ai/BRIEF-08a-BATCH-G.md, AI-19 detection set item 7) —
 * closes AI-06's Chunk 5 `early_payment_discount` gap honestly, per A.2: no `Vendor.paymentTerms`
 * field exists anywhere to read, so this derives what a vendor has *actually* experienced from
 * real payment history instead — `lib/accounting/payments.ts::postInvoicePayment()`'s own
 * `JournalEntry` (`voucherType: "payment"`, `lineIds[].sourceId` = the bill) is real, structured
 * evidence, confirmed by `docs/ai/SYSTEM_INVENTORY.md`'s 0.3 investigation. An **observation**,
 * never a contractual fact: "this vendor has historically been paid in ~28 days" is not the same
 * claim as "this vendor's terms are net 30," and this module's own field names say so.
 */

const MIN_SAMPLE_FOR_DISCOUNT_CLAIM = 3;

export interface ObservedTerms {
  vendorId: string;
  netDays: number;
  discountPercent?: number;
  discountDays?: number;
  sampleSize: number;
  evidence: { kind: "record"; ref: string; label: string }[];
}

export async function computeObservedPaymentTerms(tenantId: string, vendorId: string): Promise<ObservedTerms | null> {
  await connectDB();
  const bills = await Invoice.find({ tenantId, partnerId: vendorId, moveType: "in_invoice", paymentState: "paid" })
    .select("_id name invoiceDate amountTotal")
    .lean();
  if (bills.length === 0) return null;

  const billIds = bills.map((b) => String(b._id));
  const payments = await JournalEntry.find({ tenantId, status: DOCUMENT_STATUS.POSTED, voucherType: "payment", "lineIds.sourceId": { $in: billIds } })
    .select("header lineIds")
    .lean();

  const paymentDateByBill = new Map<string, Date>();
  const paidAmountByBill = new Map<string, number>();
  for (const p of payments) {
    for (const line of p.lineIds ?? []) {
      const sourceId = (line as { sourceId?: unknown }).sourceId ? String((line as { sourceId?: unknown }).sourceId) : null;
      if (!sourceId || !billIds.includes(sourceId)) continue;
      const debit = (line as { debit?: number }).debit ?? 0;
      if (debit <= 0) continue; // the Dr leg of a vendor payment is the AP/open-item side, carrying the amount applied
      const existing = paymentDateByBill.get(sourceId);
      const date = new Date(p.header?.date ?? p.createdAt);
      if (!existing || date < existing) paymentDateByBill.set(sourceId, date);
      paidAmountByBill.set(sourceId, (paidAmountByBill.get(sourceId) ?? 0) + debit);
    }
  }

  const netDaysSamples: number[] = [];
  const discountSamples: { percent: number; days: number }[] = [];
  const evidence: ObservedTerms["evidence"] = [];

  for (const bill of bills) {
    const billId = String(bill._id);
    const paymentDate = paymentDateByBill.get(billId);
    if (!paymentDate) continue;
    const invoiceDate = new Date(bill.invoiceDate ?? bill.createdAt);
    const days = Math.round((paymentDate.getTime() - invoiceDate.getTime()) / (24 * 60 * 60 * 1000));
    if (days >= 0) netDaysSamples.push(days);
    evidence.push({ kind: "record", ref: billId, label: bill.name ?? "" });

    const paidAmount = paidAmountByBill.get(billId) ?? 0;
    const total = bill.amountTotal ?? 0;
    if (total > 0 && paidAmount > 0 && paidAmount < total * 0.999) {
      const percent = Math.round(((total - paidAmount) / total) * 10000) / 100;
      discountSamples.push({ percent, days });
    }
  }

  if (netDaysSamples.length === 0) return null;
  const netDays = Math.round(netDaysSamples.reduce((s, d) => s + d, 0) / netDaysSamples.length);

  let discountPercent: number | undefined;
  let discountDays: number | undefined;
  if (discountSamples.length >= MIN_SAMPLE_FOR_DISCOUNT_CLAIM) {
    discountPercent = Math.round((discountSamples.reduce((s, d) => s + d.percent, 0) / discountSamples.length) * 100) / 100;
    discountDays = Math.round(discountSamples.reduce((s, d) => s + d.days, 0) / discountSamples.length);
  }

  return { vendorId, netDays, discountPercent, discountDays, sampleSize: netDaysSamples.length, evidence: evidence.slice(0, 20) };
}
