import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Organization from "@/models/Organization";
import { runSubscriptionBilling } from "@/lib/sales/subscriptionBillingRunner";
import { processDunningRetries } from "@/lib/sales/dunningEngine";

// Same CRON_SECRET bearer-check shape as app/api/cron/crm/automations and
// app/api/cron/sales/reminders-evaluation — triggered by an external
// scheduler. Runs both the billing cycle (invoice generation) and dunning
// retry processing in one pass since they share the same "once per day is
// plenty" cadence.
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
  const results: Array<{ tenantId: string; billing: any; dunning: any }> = [];

  for (const org of orgs) {
    const tenantId = (org as any).subdomain;
    const billing = await runSubscriptionBilling(tenantId);
    const dunning = await processDunningRetries(tenantId);
    results.push({ tenantId, billing, dunning });
  }

  return NextResponse.json({ success: true, results });
}
