import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import { requireRole } from "@/lib/crm/rbac";
import { logSystemActivity } from "@/lib/crm/activityLogger";
import { sanitizeEnumFields } from "@/lib/db/sanitizeEnums";
import "@/models/crm/Account";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    requireRole(session, ['opportunity.view', 'opportunity.read']);

    await dbConnect();
    const { searchParams } = new URL(req.url);
    const tenantId = session.user.tenantId;

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25')));
    const skip = (page - 1) * limit;

    const query: any = { tenantId };
    if (searchParams.get('account_id')) query.account_id = searchParams.get('account_id');
    if (searchParams.get('stage')) query.stage = searchParams.get('stage');
    if (searchParams.get('owner_id')) query.owner_id = searchParams.get('owner_id');
    if (searchParams.get('source')) query.source = searchParams.get('source');
    if (searchParams.get('priority')) query.priority = searchParams.get('priority');
    if (searchParams.get('risk_level')) query.risk_level = searchParams.get('risk_level');

    const search = searchParams.get('search');
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { deal_name: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } },
      ];
    }

    const [total, data] = await Promise.all([
      CrmOpportunity.countDocuments(query),
      CrmOpportunity.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('account_id', 'company_name industry')
        .populate('owner_id', 'name email')
        .lean(),
    ]);

    return NextResponse.json({ success: true, data, total, page, totalPages: Math.ceil(total / limit) });
  } catch (error: any) {
    console.error("GET Opportunities Error:", error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    const roleCheck = requireRole(session, ['opportunity.create']);
    if (roleCheck) return roleCheck;

    await dbConnect();
    const body = await req.json();
    // Drop any invalid/empty enum values (e.g. an AI-invented stage like
    // "Proposal / Price Quote") so schema defaults apply instead of a 500.
    sanitizeEnumFields(CrmOpportunity, body);
    body.tenantId = session.user.tenantId;
    body.createdBy = session.user.id;
    // Handle both legacy and new fields
    body.name = body.name || body.deal_name;
    body.deal_name = body.deal_name || body.name;
    body.owner_id = body.owner_id || session.user.id;

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
