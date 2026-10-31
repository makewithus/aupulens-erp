import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { stripProtectedFields } from "@/lib/api/validateId";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmLead from "@/models/crm/Lead";
import CrmActivity from "@/models/crm/Activity";
import { scoreLeadWithAi, calculateLeadScore } from "@/lib/crm/leadScoring";
import { requireRole } from "@/lib/crm/rbac";
import { recordAiInsight } from "@/lib/crm/ai/recordInsight";
import { sanitizeEnumFields } from "@/lib/db/sanitizeEnums";
import { applyDemoScope } from "@/lib/auth/scopeFilter";
import { findDuplicateLead } from "@/lib/crm/leadDuplicate";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  requireRole(session, ['lead.view', 'lead.read']);
  
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search');

  const query: any = { tenantId: session.user.tenantId };
  if (search) {
    const words = search.trim().split(/\s+/).map(w => w.replace(/[.*+?^\$\{\}()|[\]\\]/g, "\\$&"));
      query.$and = words.map(word => ({
        $or: [
          { "lead_name": { $regex: word, $options: "i" } },
          { "company_name": { $regex: word, $options: "i" } },
          { "email": { $regex: word, $options: "i" } },
          { "phone": { $regex: word, $options: "i" } }
        ]
      }));
  }

  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  if (dateFrom || dateTo) {
    const range: any = {};
    if (dateFrom && !isNaN(Date.parse(dateFrom))) range.$gte = new Date(dateFrom);
    if (dateTo && !isNaN(Date.parse(dateTo))) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
    if (Object.keys(range).length > 0) query.createdAt = range;
  }

  const scopedQuery = applyDemoScope(session, query);
  const baseQuery = CrmLead.find(scopedQuery).sort({ createdAt: -1 }).populate('owner_id', 'name email');

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
    CrmLead.countDocuments(scopedQuery),
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
    const body = stripProtectedFields(await req.json());
    if (!body.lead_name || !body.source || !body.owner_id) {
      return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
    }
    // Drop any invalid/empty enum values (source/priority/status) so a bad AI
    // value can't 500 — schema defaults / omit take over.
    sanitizeEnumFields(CrmLead, body);

    body.email = String(body.email ?? "").trim().toLowerCase() || undefined;
    body.phone = typeof body.phone === "string" ? body.phone.trim() : body.phone;
    body.emailNormalized = body.email || undefined;
    const normalizedPhone = String(body.phone ?? "").replace(/\D/g, "");
    body.phoneNormalized = normalizedPhone.length >= 7 ? normalizedPhone : undefined;

    // Stop repeat submissions using normalized email or phone. Phone matching
    // ignores formatting differences such as spaces and hyphens.
    const { duplicate, matchedBy } = await findDuplicateLead(session.user.tenantId, body);
    if (duplicate) {
      return NextResponse.json({
        success: false,
        duplicate: true,
        message: `A lead already exists with this ${matchedBy}. Open the existing lead instead of creating another one.`,
        matches: [duplicate],
      }, { status: 409 });
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
    if (error?.code === 11000) {
      return NextResponse.json({
        success: false,
        duplicate: true,
        message: "A lead with this email or phone already exists. Open the existing lead instead of creating another one.",
      }, { status: 409 });
    }
    return NextResponse.json({ success: false, message: safeInternalErrorMessage() }, { status: 500 });
  }
}
