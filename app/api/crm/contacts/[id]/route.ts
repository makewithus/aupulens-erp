import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmContact from "@/models/crm/Contact";
import CrmActivity from "@/models/crm/Activity";
import CrmOpportunity from "@/models/crm/Opportunity";
import { calculateContactRelationshipScore } from "@/lib/crm/contactRelationship";
import { requireRole } from "@/lib/crm/rbac";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  requireRole(session, ['contact.view', 'contact.read']);

  await dbConnect();
  
  const contact = await CrmContact.findOne({ _id: params.id, tenantId: session.user.tenantId })
    .populate('account_id', 'company_name')
    .lean();
    
  if (!contact) return NextResponse.json({ success: false, message: "Contact not found" }, { status: 404 });

  // Fetch activities and opportunities linked to this contact (or account) to calculate relationship
  const activities = await CrmActivity.find({ linked_contact_id: params.id, tenantId: session.user.tenantId }).lean();
  
  // Since opportunities are linked to accounts, we fetch opps linked to the contact's account
  const opportunities = await CrmOpportunity.find({ account_id: contact.account_id?._id, tenantId: session.user.tenantId }).lean();
  
  const relationship = calculateContactRelationshipScore(activities, opportunities);

  return NextResponse.json({ 
    success: true, 
    data: { contact, relationship, stats: { activitiesCount: activities.length, oppsCount: opportunities.length } } 
  });
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const roleCheck = requireRole(session, ['contact.edit', 'contact.write']);
  if (roleCheck) return roleCheck;

  await dbConnect();
  const body = await req.json();
  const contact = await CrmContact.findOneAndUpdate(
    { _id: params.id, tenantId: session.user.tenantId },
    body,
    { new: true }
  );

  return NextResponse.json({ success: true, data: contact });
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const roleCheck = requireRole(session, ['contact.delete']);
  if (roleCheck) return roleCheck;

  await dbConnect();
  await CrmContact.findOneAndDelete({ _id: params.id, tenantId: session.user.tenantId });

  return NextResponse.json({ success: true });
}
