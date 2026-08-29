import { NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import { detectInvoiceAnomalies, explainAnomalies } from "@/lib/finance/anomalyDetection";

/**
 * Finance anomaly detection (Scope F). Deterministic scan over the tenant's
 * invoices (amount outliers, duplicate-suspects, long-overdue) + an optional AI
 * explanation of the findings. The scan is authoritative; AI only narrates.
 */
export async function GET() {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  if (!tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const invoices = await (SalesInvoice as any)
    .find({ tenantId })
    .select("number totalAmount amount status invoiceDate customerId")
    .sort({ invoiceDate: -1 })
    .limit(500)
    .lean();

  const report = detectInvoiceAnomalies(invoices);
  const explanation = await explainAnomalies(tenantId, report);

  return NextResponse.json({
    success: true,
    data: {
      anomalies: report.anomalies,
      stats: report.stats,
      explanation: explanation.summary,
      aiUsed: explanation.aiUsed,
    },
  });
}
