import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Organization from "@/models/Organization";
import { evaluateInvoiceReminders, evaluateBillReminders } from "@/lib/sales/reminderEngine";

// Same CRON_SECRET bearer-check shape as app/api/cron/crm/automations —
// triggered by an external scheduler hitting this route periodically, no
// in-repo cron config exists (see app/api/cron/crm/* for precedent).
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const orgs = await Organization.find({}, "subdomain").lean();
  const results: Array<{ tenantId: string; invoices: any; bills: any }> = [];

  for (const org of orgs) {
    const tenantId = (org as any).subdomain;
    const invoices = await evaluateInvoiceReminders(tenantId);
    const bills = await evaluateBillReminders(tenantId);
    results.push({ tenantId, invoices, bills });
  }

  return NextResponse.json({ success: true, results });
}
