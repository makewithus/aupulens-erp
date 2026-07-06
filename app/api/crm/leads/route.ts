import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmLead from "@/models/crm/Lead";
import CrmActivity from "@/models/crm/Activity";
import { calculateLeadScore } from "@/lib/crm/leadScoring";
import { requireRole } from "@/lib/crm/rbac";

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
    
    body.tenantId = session.user.tenantId;
    body.createdBy = session.user.id;
    body.lead_score = calculateLeadScore(body);
    
    const lead = await CrmLead.create(body);
    
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
