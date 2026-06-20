import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { requireRole } from "@/lib/crm/rbac";
import { logSystemActivity } from "@/lib/crm/activityLogger";
import "@/models/crm/Account";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    requireRole(session, ['opportunity.view', 'opportunity.read']);

    await dbConnect();
    const { searchParams } = new URL(req.url);
    const tenantId = session.user.tenantId;

    // Filters
    const query: any = { tenantId };
    if (searchParams.get('account_id')) query.account_id = searchParams.get('account_id');
    if (searchParams.get('stage')) query.stage = searchParams.get('stage');
    if (searchParams.get('owner_id')) query.ownerId = searchParams.get('owner_id');
    if (searchParams.get('source')) query.source = searchParams.get('source');
    if (searchParams.get('priority')) query.priority = searchParams.get('priority');
    if (searchParams.get('risk_level')) query.risk_level = searchParams.get('risk_level');

    // Search
    const search = searchParams.get('search');
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { deal_name: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    const opps = await CrmOpportunity.find(query)
      .sort({ updatedAt: -1 })
      .populate('account_id', 'company_name industry')
      .populate('owner_id', 'name email')
      .lean();

    // Generate KPIs
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let totalPipelineValue = 0;
    let weightedPipelineValue = 0;
    let openOpps = 0;
    let dealsAtRisk = 0;
    let closingThisMonth = 0;
    let closedWonThisMonth = 0;
    let closedLostThisMonth = 0;

    for (const opp of opps) {
      const isClosedWon = opp.stage === 'Closed Won';
      const isClosedLost = opp.stage === 'Closed Lost';
      const isOpen = !isClosedWon && !isClosedLost;

      if (isOpen) {
        totalPipelineValue += opp.amount || 0;
        weightedPipelineValue += (opp.amount || 0) * ((opp.probability || 0) / 100);
        openOpps++;

        if (opp.risk_level === 'High' || opp.risk_level === 'Critical' || opp.is_at_risk) {
          dealsAtRisk++;
        }

        if (opp.expected_close_date) {
          const closeDate = new Date(opp.expected_close_date);
          if (closeDate.getMonth() === currentMonth && closeDate.getFullYear() === currentYear) {
            closingThisMonth++;
          }
        }
      } else {
        // Closed logic
        if (opp.stage_history) {
          // Look for entry into closed status
          const closedStatus = opp.stage_history.find((s: any) => s.stage === opp.stage).lean();
          if (closedStatus && closedStatus.entered_at) {
            const entered = new Date(closedStatus.entered_at);
            if (entered.getMonth() === currentMonth && entered.getFullYear() === currentYear) {
              if (isClosedWon) closedWonThisMonth++;
              if (isClosedLost) closedLostThisMonth++;
            }
          } else {
            // Fallback to updatedAt
            const updated = new Date(opp.updatedAt);
            if (updated.getMonth() === currentMonth && updated.getFullYear() === currentYear) {
               if (isClosedWon) closedWonThisMonth++;
               if (isClosedLost) closedLostThisMonth++;
            }
          }
        }
      }
    }

    const avgDealSize = openOpps > 0 ? totalPipelineValue / openOpps : 0;

    const kpis = {
      totalPipelineValue,
      weightedPipelineValue,
      openOpportunities: openOpps,
      dealsAtRisk,
      closingThisMonth,
      closedWonThisMonth,
      closedLostThisMonth,
      avgDealSize
    };

    return NextResponse.json({ success: true, data: opps, kpis });
  } catch (error: any) {
    console.error("GET Opportunities Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    requireRole(session, ['opportunity.create']);

    await dbConnect();
    const body = await req.json();
    body.tenantId = session.user.tenantId;
    body.createdBy = session.user.id;
    // Handle both legacy and new fields
    body.name = body.name || body.deal_name;
    body.deal_name = body.deal_name || body.name;
    body.owner_id = body.owner_id || session.user.id;
    body.ownerId = body.ownerId || body.owner_id;
    
    body.stage = body.stage || 'Prospecting';
    body.stage_history = [{ stage: body.stage, entered_at: new Date() }];

    const opp = await CrmOpportunity.create(body);

    await CrmAuditLog.create({
      tenantId: session.user.tenantId,
      user_id: session.user.id,
      action: 'created',
      record_type: 'Opportunity',
      record_id: opp._id,
      timestamp: new Date()
    });

    await logSystemActivity({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      subject: `Opportunity Created: ${opp.deal_name}`,
      linked_opportunity_id: opp._id.toString(),
      linked_account_id: opp.account_id?.toString()
    });

    return NextResponse.json({ success: true, data: opp });
  } catch (error: any) {
    console.error("POST Opportunity Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
