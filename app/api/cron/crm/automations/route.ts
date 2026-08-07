import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import { triggerAutomation } from "@/lib/crm/automationEngine";
import CrmLead from "@/models/crm/Lead";
import CrmOpportunity from "@/models/crm/Opportunity";

/**
 * CRON endpoint to process time-based triggers:
 * - date_reached
 * - no_activity
 * - sla_breached
 * - contract_expiring
 * - task_overdue
 *
 * Real scheduling (Phase 4): nothing previously called this route at all —
 * no vercel.json crons block, no external scheduler config anywhere in the
 * repo. Now scheduled via vercel.json (repo root). Vercel Cron always sends
 * GET (with an auto-injected `Authorization: Bearer $CRON_SECRET` header
 * when a CRON_SECRET env var is set) — this route was POST-only, so GET is
 * exported as the same handler for that to actually work; POST is kept for
 * any manual/external trigger that already targets it.
 */
async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  await dbConnect();
  const results = [];

  // 1. Process "no_activity" for Leads (Cold Lead Nurture)
  // E.g., Leads not contacted in 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const coldLeads = await CrmLead.find({
    status: { $in: ["New", "Attempting Contact"] },
    $or: [{ last_contact_date: { $lte: sevenDaysAgo } }, { last_contact_date: null }],
  }).lean();

  for (const lead of coldLeads) {
    await triggerAutomation(lead.tenantId, "no_activity", "Lead", String(lead._id), lead);
    results.push(`Triggered no_activity for Lead ${lead._id}`);
  }

  // 2. Process "stuck_deal" (Manager Notify Rule)
  // E.g., Opportunities stuck in Negotiation for 14 days
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const stuckOpps = await CrmOpportunity.find({
    stage: "Negotiation",
    stage_entered_at: { $lte: fourteenDaysAgo }
  }).lean();

  for (const opp of stuckOpps) {
    await triggerAutomation(opp.tenantId, "no_activity", "Opportunity", String(opp._id), opp);
    results.push(`Triggered no_activity for Opportunity ${opp._id}`);
  }

  return NextResponse.json({ success: true, executed: results });
}

export { handler as GET, handler as POST };
