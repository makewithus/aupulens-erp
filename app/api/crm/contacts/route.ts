import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmContact from "@/models/crm/Contact";
import { requireRole } from "@/lib/crm/rbac";
import { escapeRegex } from "@/lib/utils/regex";
import { sanitizeEnumFields } from "@/lib/db/sanitizeEnums";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  requireRole(session, ['contact.view', 'contact.read']);
  
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const account_id = searchParams.get('account_id');
  const search = searchParams.get('search');
  const query: any = { tenantId: session.user.tenantId };
  if (account_id) query.account_id = account_id;
  if (search) {
    const safeSearch = escapeRegex(search);
    query.$or = [
      { first_name: { $regex: safeSearch, $options: 'i' } },
      { last_name: { $regex: safeSearch, $options: 'i' } },
      { email: { $regex: safeSearch, $options: 'i' } }
    ];
  }

  try {
    const contacts = await CrmContact.find(query)
      .sort({ createdAt: -1 })
      .populate('account_id', 'company_name')
      .lean();
      
    // KPI stats
    const total = contacts.length;
    const decisionMakers = contacts.filter(c => c.is_decision_maker).length;
    const primary = contacts.filter(c => c.is_primary).length;
    const thisMonth = contacts.filter(c => new Date((c as any).createdAt).getMonth() === new Date().getMonth()).length;

    return NextResponse.json({ 
      success: true, 
      data: { 
        contacts,
        stats: { total, decisionMakers, primary, thisMonth }
      } 
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  const roleCheck = requireRole(session, ['contact.create', 'contact.write']);
  if (roleCheck) return roleCheck;

  await dbConnect();
  try {
    const body = await req.json();
    // Drop empty/invalid enum values (e.g. an unselected preferred_communication
    // "") so optional enum fields are omitted rather than 500ing.
    sanitizeEnumFields(CrmContact, body);

    if (!body.first_name) return NextResponse.json({ success: false, message: "First name is required" }, { status: 400 });

    // Fast, indexed exact-duplicate guard (email/phone) — one quick lookup, no AI.
    if (body.email || body.phone) {
      const orConditions: any[] = [];
      if (body.email) orConditions.push({ email: body.email });
      if (body.phone) orConditions.push({ phone: body.phone });

      const duplicate = await CrmContact.findOne({ tenantId: session.user.tenantId, $or: orConditions }).lean();
      if (duplicate) {
        return NextResponse.json({ success: false, duplicate: true, matches: [duplicate] }, { status: 409 });
      }
    }

    body.tenantId = session.user.tenantId;
    body.createdBy = session.user.id;

    const contact = await CrmContact.create(body);
    return NextResponse.json({ success: true, data: contact });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
