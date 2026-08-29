import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmContact from "@/models/crm/Contact";
import { requireRole } from "@/lib/crm/rbac";
import { escapeRegex } from "@/lib/utils/regex";
import { sanitizeEnumFields } from "@/lib/db/sanitizeEnums";

function computeContactStats(contacts: any[]) {
  const now = new Date();
  return {
    total: contacts.length,
    decisionMakers: contacts.filter((c) => c.is_decision_maker).length,
    primary: contacts.filter((c) => c.is_primary).length,
    thisMonth: contacts.filter((c) => new Date(c.createdAt).getMonth() === now.getMonth()).length,
  };
}

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
    const baseQuery = CrmContact.find(query).sort({ createdAt: -1 }).populate('account_id', 'company_name');

    // Pagination is opt-in via `page` — several other CRM pages (Cases,
    // the Account detail page) read this same list unbounded as a dropdown
    // source, so omitting `page` must keep returning everything.
    const pageParam = searchParams.get('page');
    if (!pageParam) {
      const contacts = await baseQuery.lean();
      const stats = computeContactStats(contacts);
      return NextResponse.json({ success: true, data: { contacts, total: contacts.length, page: 1, totalPages: 1, stats } });
    }

    const page = Math.max(1, parseInt(pageParam));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25')));

    // Stats reflect every contact matching the current search/account_id
    // filter — unaffected by pagination, matching this route's original
    // behavior of computing KPIs from the full filtered set.
    const [total, contacts, allMatching] = await Promise.all([
      CrmContact.countDocuments(query),
      baseQuery.skip((page - 1) * limit).limit(limit).lean(),
      CrmContact.find(query).select('is_decision_maker is_primary createdAt').lean(),
    ]);
    const stats = computeContactStats(allMatching);

    return NextResponse.json({ success: true, data: { contacts, total, page, totalPages: Math.max(1, Math.ceil(total / limit)), stats } });
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
