/**
 * Scope F live verification: Finance anomaly detection + AI explanation, and
 * AI-drafted correspondence with deterministic fallback.
 *
 * Run: npx tsx scripts/verify-finance-ai.ts
 */
import "dotenv/config";
import mongoose from "mongoose";

const TENANT = "default-tenant";

async function main() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const { SalesInvoice } = await import("../models/SalesInvoice");
  const { detectInvoiceAnomalies, explainAnomalies } = await import("../lib/finance/anomalyDetection");
  const { draftPaymentReminder } = await import("../lib/finance/draftCorrespondence");

  // 1) anomaly detection over REAL invoices
  const invoices = await (SalesInvoice as any).find({ tenantId: TENANT }).select("number totalAmount amount status invoiceDate customerId").limit(500).lean();
  const report = detectInvoiceAnomalies(invoices);
  console.log(`1. Scanned ${report.stats.count} invoices (mean=${Math.round(report.stats.mean)}, stdDev=${Math.round(report.stats.stdDev)}, max=${report.stats.max})`);
  console.log(`   Anomalies: ${report.anomalies.length}`);
  const byType = report.anomalies.reduce((acc: Record<string, number>, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {});
  console.log(`   By type: ${JSON.stringify(byType)}`);

  // Inject a couple of synthetic anomalies to prove the detector + AI explanation fire,
  // WITHOUT writing to the DB (pure in-memory).
  const synthetic = [
    ...invoices.slice(0, 5).map((i: any) => ({ ...i, totalAmount: 1000 })),
    { _id: "syn-outlier", number: "INV-OUTLIER", totalAmount: 9_999_999, status: "overdue", invoiceDate: new Date(Date.now() - 200 * 864e5), customerId: "cust-x" },
    { _id: "syn-dup-1", number: "INV-DUP-1", totalAmount: 5000, status: "not_paid", invoiceDate: new Date(Date.now() - 3 * 864e5), customerId: "cust-dup" },
    { _id: "syn-dup-2", number: "INV-DUP-2", totalAmount: 5000, status: "not_paid", invoiceDate: new Date(Date.now() - 1 * 864e5), customerId: "cust-dup" },
  ];
  const synthReport = detectInvoiceAnomalies(synthetic as any);
  console.log(`2. Synthetic scan anomalies: ${synthReport.anomalies.length} → types ${JSON.stringify(synthReport.anomalies.map(a => a.type))}`);
  const explanation = await explainAnomalies(TENANT, synthReport);
  console.log(`   AI explanation (aiUsed=${explanation.aiUsed}): "${explanation.summary.slice(0, 160)}…"`);

  // 3) draft correspondence
  const draft = await draftPaymentReminder(TENANT, { invoiceNumber: "INV-OUTLIER", amount: 9999999, daysOverdue: 200, customerName: "Acme Corp" });
  console.log(`3. Draft correspondence (aiUsed=${draft.aiUsed}):`);
  console.log(`   subject: "${draft.subject}"`);
  console.log(`   body: "${draft.body.slice(0, 140)}…"`);

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
