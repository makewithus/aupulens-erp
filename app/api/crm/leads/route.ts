import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmLead from "@/models/crm/Lead";
import CrmActivity from "@/models/crm/Activity";
import { scoreLeadWithAi } from "@/lib/crm/leadScoring";
import { requireRole } from "@/lib/crm/rbac";
import { detectDuplicatesWithAi } from "@/lib/crm/ai/duplicateAssistant";
import { recordAiInsight } from "@/lib/crm/ai/recordInsight";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  requireRole(session, ['lead.view', 'lead.read']);
  
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '25');
  const search = searchParams.get('search');
  
  const query: any = { tenantId: session.user.tenantId };
  if (search) {
    query.$or = [
      { lead_name: { $regex: search, $options: 'i' } },
      { company_name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }
  
  const total = await CrmLead.countDocuments(query);
  const leads = await CrmLead.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('owner_id', 'name email')
    .lean();
    
  return NextResponse.json({ success: true, data: { leads, total, page, totalPages: Math.ceil(total / limit) } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  const roleCheck = requireRole(session, ['lead.create', 'lead.write']);
  if (roleCheck) return roleCheck;

  await dbConnect();
  try {
    const body = await req.json();
    if (!body.lead_name || !body.source || !body.owner_id) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }
    
    if (body.email || body.phone) {
      const orConditions: any[] = [];
      if (body.email) orConditions.push({ email: body.email });
      if (body.phone) orConditions.push({ phone: body.phone });

      const duplicate = await CrmLead.findOne({ tenantId: session.user.tenantId, $or: orConditions });
      if (duplicate) {
        return NextResponse.json({ success: false, duplicate: true, matches: [duplicate] }, { status: 409 });
      }
    }

    // Fuzzy duplicate detection (name/email/phone similarity) — skipped when
    // the caller has already confirmed via the "Create anyway" dialog.
    if (!body.confirmDuplicate) {
      // Perf: don't scan every lead in the tenant (could be thousands). Fetch a
      // bounded, targeted candidate set — anything sharing the new lead's email,
      // phone or company (the fields dedup actually compares), plus the most
      // recent leads as a fallback net — capped so create stays fast.
      const or: any[] = [];
      if (body.email) or.push({ email: body.email });
      if (body.phone) or.push({ phone: body.phone });
      if (body.company_name) or.push({ company_name: body.company_name });
      const candidates = or.length
        ? await CrmLead.find({ tenantId: session.user.tenantId, $or: or }, "lead_name email phone company_name").limit(50).lean()
        : await CrmLead.find({ tenantId: session.user.tenantId }, "lead_name email phone company_name").sort({ createdAt: -1 }).limit(50).lean();
      const { duplicates: fuzzyMatches } = await detectDuplicatesWithAi(session.user.tenantId, body, candidates, "Lead");
      if (fuzzyMatches.length > 0) {
        const matches = fuzzyMatches.map((m) => ({
          ...m,
          record: candidates.find((c: any) => String(c._id) === String(m.recordId)),
        }));
        return NextResponse.json(
          { success: false, duplicate: true, fuzzy: true, matches },
          { status: 409 },
        );
      }
    }

    body.tenantId = session.user.tenantId;
    body.createdBy = session.user.id;

    // Real AI scoring (Phase 2): tries an LLM assessment of this specific
    // lead first, falls back to the deterministic rule-based score
    // (lib/crm/leadScoring.ts's calculateLeadScore) when AI is disabled,
    // over its monthly cap, or unavailable for any reason.
    const { score, insight } = await scoreLeadWithAi(session.user.tenantId, body);
    body.lead_score = score;

    const lead = await CrmLead.create(body);

    if (insight.ok) {
      // Severity here reflects "worth a rep's attention", not literal risk —
      // a low-scoring lead is the one worth flagging, a high-scoring one isn't.
      const severity = score < 30 ? "Medium" : "Low";
      await recordAiInsight({
        tenantId: session.user.tenantId,
        entityType: "Lead",
        entityId: String(lead._id),
        insightType: "Recommendation",
        insight,
        severity,
      });
    }

    await CrmActivity.create({
      tenantId: session.user.tenantId,
      type: 'Note',
      subject: `Lead Created: ${lead.lead_name}`,
      linked_lead_id: lead._id,
      performed_by_id: session.user.id,
      createdBy: session.user.id,
      activity_date: new Date()
    });

    return NextResponse.json({ success: true, data: lead });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
