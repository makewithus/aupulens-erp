import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { SalesInvoice } from "@/models/sales/SalesInvoice";
import Customer from "@/models/sales/Customer";
import { draftPaymentReminder, type CorrespondenceTone } from "@/lib/finance/draftCorrespondence";

/**
 * Draft a payment-reminder for an invoice (Scope F). Returns editable subject +
 * body for a human to review and send — it does NOT send anything. Falls back
 * to a deterministic template when AI is gated/unavailable.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const tenantId = (session?.user as any)?.tenantId as string | undefined;
  if (!tenantId) return NextResponse.json({ success: false }, { status: 401 });

  const { invoiceId, tone } = await req.json();
  if (!invoiceId) return NextResponse.json({ success: false, message: "invoiceId is required" }, { status: 400 });

  await dbConnect();
  const invoice = await (SalesInvoice as any).findOne({ _id: invoiceId, tenantId }).lean();
  if (!invoice) return NextResponse.json({ success: false, message: "Invoice not found" }, { status: 404 });

  let customerName: string | undefined;
  if (invoice.customerId) {
    const c = await (Customer as any).findOne({ _id: invoice.customerId, tenantId }).select("name displayName companyName").lean();
    customerName = c?.displayName || c?.name || c?.companyName;
  }

  const daysOverdue = invoice.invoiceDate
    ? Math.max(0, Math.round((Date.now() - new Date(invoice.invoiceDate).getTime()) / 86_400_000))
    : 0;

  const draft = await draftPaymentReminder(tenantId, {
    invoiceNumber: invoice.number ?? String(invoice._id),
    amount: invoice.totalAmount ?? invoice.amount ?? 0,
    daysOverdue,
    customerName,
    tone: tone as CorrespondenceTone | undefined,
  });

  return NextResponse.json({ success: true, data: draft });
}
