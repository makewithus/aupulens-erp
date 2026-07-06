import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmAccount from "@/models/crm/Account";
import { requireRole } from "@/lib/crm/rbac";
import { escapeRegex } from "@/lib/utils/regex";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  requireRole(session, ['account.view', 'account.read']);
  
  await dbConnect();
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '25');
  const search = searchParams.get('search');
  
  const query: any = { tenantId: session.user.tenantId };
  if (search) {
    query.company_name = { $regex: escapeRegex(search), $options: 'i' };
  }
  
  const total = await CrmAccount.countDocuments(query);
  const accounts = await CrmAccount.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('owner_id', 'name email')
    .lean();
    
  return NextResponse.json({ success: true, data: { accounts, total, page, totalPages: Math.ceil(total / limit) } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  const roleCheck = requireRole(session, ['account.create', 'account.write']);
  if (roleCheck) return roleCheck;

  await dbConnect();
  try {
    const body = await req.json();
    if (!body.company_name) {
      return NextResponse.json({ success: false, message: "Company name is required" }, { status: 400 });
    }
    
    const duplicate = await CrmAccount.findOne({ 
      tenantId: session.user.tenantId, 
      company_name: { $regex: new RegExp('^' + escapeRegex(body.company_name) + '$', 'i') }
    });
    
    if (duplicate) {
      return NextResponse.json({ success: false, duplicate: true, matches: [duplicate] }, { status: 409 });
    }
    
    body.tenantId = session.user.tenantId;
    body.createdBy = session.user.id;
    if (!body.owner_id) body.owner_id = session.user.id;
    
    const account = await CrmAccount.create(body);
    return NextResponse.json({ success: true, data: account });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
