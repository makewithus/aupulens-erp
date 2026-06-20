import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmAccount from "@/models/crm/Account";
import CrmContact from "@/models/crm/Contact";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmCase from "@/models/crm/Case";
import CrmContract from "@/models/crm/Contract";
import { computeAndStoreAccountHealth, getHealthCategory } from "@/lib/crm/accountHealth";
import { computeAndStoreChurnRisk } from "@/lib/crm/churnRisk";
import { getExpansionSummary } from "@/lib/crm/expansionEngine";
import CrmLead from "@/models/crm/Lead";
import CrmQuote from "@/models/crm/Quote";
import CrmCampaign from "@/models/crm/Campaign";
import CrmFieldVisit from "@/models/crm/FieldVisit";
import CrmHandoff from "@/models/crm/Handoff";
import { predictChurn } from "@/lib/crm/ai/churnPrediction";
import { determineNextBestAction } from "@/lib/crm/ai/nextBestAction";
import { requireRole } from "@/lib/crm/rbac";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  requireRole(session, ['account.view', 'account.read']);

  await dbConnect();
  const tenantId = session.user.tenantId;

  const account = await CrmAccount.findOne({ _id: id, tenantId }).populate(
      "owner_id",
      "name email"
    ).lean();
  if (!account)
    return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 });

  // ── Parallel data fetch ────────────────────────────────────────────────────
  const [
    contactsCount,
    openOppsCount,
    openCasesCount,
    activeContractsCount,
    expiringContractsCount,
    upcomingContracts,
    fieldVisits,
    handoffs
  ] = await Promise.all([
    CrmContact.countDocuments({ account_id: id, tenantId }),
    CrmOpportunity.countDocuments({
      account_id: id,
      tenantId,
      stage: { $nin: ["Closed Won", "Closed Lost"] },
    }),
    CrmCase.countDocuments({
      account_id: id,
      tenantId,
      status: { $nin: ["Resolved", "Closed"] },
    }),
    CrmContract.countDocuments({ account_id: id, tenantId, status: "Active" }),
    CrmContract.countDocuments({
      account_id: id,
      tenantId,
      status: { $in: ["Renewal Due", "Expiring"] },
    }),
    CrmContract.find({ account_id: id, tenantId, status: { $in: ["Active", "Renewal Due", "Expiring"] } })
      .select("contract_number contract_value end_date status renewal_status churn_risk billing_frequency")
      .sort({ end_date: 1 })
      .limit(5)
      .lean(),
    CrmFieldVisit.find({ recordType: "Account", recordId: id, tenantId }).sort({ visit_start: -1 }).lean(),
    CrmHandoff.find({ recordType: "Account", recordId: id, tenantId }).populate("fromOwner toOwner", "name").sort({ createdAt: -1 }).lean()
  ]);

  // ── Customer Journey & Attribution ──────────────────────────────────────────
  const [leads, opps, quotes, contracts] = await Promise.all([
    CrmLead.find({ converted_account_id: id, tenantId }).populate("campaign_id", "campaign_name channel").lean(),
    CrmOpportunity.find({ account_id: id, tenantId }).populate("campaign_id", "campaign_name channel").lean(),
    CrmQuote.find({ account_id: id, tenantId }).lean(),
    CrmContract.find({ account_id: id, tenantId }).lean()
  ]);

  const journey = [];
  let primaryCampaign = null;

  for (const l of leads) {
    if ((l as any).campaign_id && !primaryCampaign) primaryCampaign = (l as any).campaign_id;
    journey.push({
      type: "Lead", id: l._id, title: (l as any).lead_name, status: (l as any).status,
      date: (l as any).createdAt, subtitle: `Source: ${(l as any).source || 'Unknown'}`
    });
  }
  for (const o of opps) {
    if ((o as any).campaign_id && !primaryCampaign) primaryCampaign = (o as any).campaign_id;
    journey.push({
      type: "Opportunity", id: o._id, title: (o as any).deal_name, status: (o as any).stage,
      amount: (o as any).amount, date: (o as any).createdAt
    });
  }
  for (const q of quotes) {
    journey.push({
      type: "Quote", id: q._id, title: (q as any).quote_number, status: (q as any).status,
      amount: (q as any).grand_total, date: (q as any).createdAt
    });
  }
  for (const c of contracts) {
    journey.push({
      type: "Contract", id: c._id, title: (c as any).contract_number, status: (c as any).status,
      amount: (c as any).contract_value, date: (c as any).createdAt
    });
  }

  journey.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (primaryCampaign) {
    journey.unshift({
      type: "Campaign", id: (primaryCampaign as any)._id, title: (primaryCampaign as any).campaign_name,
      subtitle: `Channel: ${(primaryCampaign as any).channel}`
    });
  }

  // ── Compute health + churn risk (also persists to DB) ──────────────────────
  const [healthResult, churnResult, expansionSummary] = await Promise.all([
    computeAndStoreAccountHealth(id, tenantId, session.user.id),
    computeAndStoreChurnRisk(id, tenantId, session.user.id),
    getExpansionSummary(id, tenantId),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      account,
      stats: {
        contactsCount,
        openOppsCount,
        openCasesCount,
        activeContractsCount,
        expiringContractsCount,
      },
      health: {
        score: healthResult.score,
        category: healthResult.category,
        breakdown: healthResult.breakdown,
      },
      churnRisk: {
        level: churnResult.level,
        score: churnResult.score,
        reasons: churnResult.reasons,
        daysSinceLastActivity: churnResult.daysSinceLastActivity,
      },
      expansion: expansionSummary,
      upcomingContracts,
      journey,
      attribution: primaryCampaign,
      fieldVisits,
      handoffs,
      aiAnalysis: {
        healthScore: healthResult.score,
        churnPrediction: predictChurn(account, [], []), // Passed empty for now, in a real implementation we would fetch these.
        nextBestActions: determineNextBestAction("Account", account)
      }
    },
  });
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId)
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  requireRole(session, ['account.edit', 'account.write']);

  await dbConnect();
  const body = await req.json();
  const account = await CrmAccount.findOneAndUpdate(
    { _id: id, tenantId: session.user.tenantId },
    body,
    { new: true }
  );
  if (!account)
    return NextResponse.json({ success: false, message: "Account not found" }, { status: 404 });

  return NextResponse.json({ success: true, data: account });
}
