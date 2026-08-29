import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmLead from "@/models/crm/Lead";
import CrmActivity from "@/models/crm/Activity";
import { scoreLeadWithAi, calculateLeadScore } from "@/lib/crm/leadScoring";
import { requireRole } from "@/lib/crm/rbac";
import { recordAiInsight } from "@/lib/crm/ai/recordInsight";
import { sanitizeEnumFields } from "@/lib/db/sanitizeEnums";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  requireRole(session, ['lead.view', 'lead.read']);
  
  await dbConnect();
  const { searchParams } = new URL(req.url);
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

  const baseQuery = CrmLead.find(query).sort({ createdAt: -1 }).populate('owner_id', 'name email');

  // Pagination is opt-in via `page` — omitting it keeps returning everything,
  // matching the convention used across the rest of this codebase.
  const pageParam = searchParams.get('page');
  if (!pageParam) {
    const leads = await baseQuery.lean();
    return NextResponse.json({ success: true, data: { leads, total: leads.length, page: 1, totalPages: 1 } });
  }

  const page = Math.max(1, parseInt(pageParam));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25')));

  const [total, leads] = await Promise.all([
    CrmLead.countDocuments(query),
    baseQuery.skip((page - 1) * limit).limit(limit).lean(),
  ]);

  return NextResponse.json({ success: true, data: { leads, total, page, totalPages: Math.max(1, Math.ceil(total / limit)) } });
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
    // Drop any invalid/empty enum values (source/priority/status) so a bad AI
    // value can't 500 — schema defaults / omit take over.
    sanitizeEnumFields(CrmLead, body);

    // Fast, indexed exact-duplicate guard (email/phone) — a single quick lookup,
    // enough to stop obvious re-submissions without any AI cost.
    if (body.email || body.phone) {
      const orConditions: any[] = [];
      if (body.email) orConditions.push({ email: body.email });
      if (body.phone) orConditions.push({ phone: body.phone });

      const duplicate = await CrmLead.findOne({ tenantId: session.user.tenantId, $or: orConditions }).lean();
      if (duplicate) {
        return NextResponse.json({ success: false, duplicate: true, matches: [duplicate] }, { status: 409 });
      }
    }

    body.tenantId = session.user.tenantId;
    body.createdBy = session.user.id;

    // Instant deterministic score so the lead is immediately useful. The LLM
    // refines it in the background (below) — it must NOT block the response
    // (that LLM round-trip was the multi-second create latency users hit).
    body.lead_score = calculateLeadScore(body);

    const lead = await CrmLead.create(body);

    // Respond immediately; everything non-essential runs after (fire-and-forget
    // on the Node server). The user's form returns as soon as the row is saved.
    const tenantId = session.user.tenantId;
    const userId = session.user.id;
    void (async () => {
      try {
        await CrmActivity.create({
          tenantId, type: 'Note',
          subject: `Lead Created: ${lead.lead_name}`,
          linked_lead_id: lead._id,
          performed_by_id: userId,
          createdBy: userId,
          activity_date: new Date(),
        });
        // Refine the score with the LLM and store an insight — best-effort.
        const { score, insight } = await scoreLeadWithAi(tenantId, body);
        if (typeof score === "number" && score !== lead.lead_score) {
          await CrmLead.updateOne({ _id: lead._id, tenantId }, { $set: { lead_score: score } });
        }
        if (insight?.ok) {
          await recordAiInsight({
            tenantId, entityType: "Lead", entityId: String(lead._id),
            insightType: "Recommendation", insight,
            severity: score < 30 ? "Medium" : "Low",
          });
        }
      } catch { /* background best-effort — never affects the create response */ }
    })();

    return NextResponse.json({ success: true, data: lead });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
