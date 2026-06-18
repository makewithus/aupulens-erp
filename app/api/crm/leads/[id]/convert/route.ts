import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmLead from "@/models/crm/Lead";
import CrmAccount from "@/models/crm/Account";
import CrmContact from "@/models/crm/Contact";
import CrmOpportunity from "@/models/crm/Opportunity";
import mongoose from "mongoose";
import { logSystemActivity } from "@/lib/crm/activityLogger";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  
  await dbConnect();
  const lead = await CrmLead.findOne({ _id: params.id, tenantId: session.user.tenantId });
  if (!lead) return NextResponse.json({ success: false, message: "Lead not found" }, { status: 404 });
  if (lead.status !== 'Qualified') return NextResponse.json({ success: false, message: "Lead must be Qualified to convert" }, { status: 422 });
  
  const body = await req.json();
  const sessionDb = await mongoose.startSession();
  
  try {
    sessionDb.startTransaction();
    let account, contact, opportunity;
    
    if (body.createAccount) {
      account = await CrmAccount.create([{
        tenantId: session.user.tenantId,
        company_name: body.accountData?.company_name || lead.company_name || lead.lead_name,
        createdBy: session.user.id,
        owner_id: lead.owner_id
      }], { session: sessionDb });
      account = account[0];
    }
    
    if (body.createContact) {
      contact = await CrmContact.create([{
        tenantId: session.user.tenantId,
        first_name: body.contactData?.first_name || lead.lead_name.split(' ')[0],
        last_name: body.contactData?.last_name || lead.lead_name.split(' ')[1] || '-',
        email: lead.email,
        mobile: lead.phone,
        account_id: account?._id,
        createdBy: session.user.id
      }], { session: sessionDb });
      contact = contact[0];
    }
    
    if (body.createOpportunity && account) {
      opportunity = await CrmOpportunity.create([{
        tenantId: session.user.tenantId,
        deal_name: body.opportunityData?.deal_name || `${lead.company_name || lead.lead_name} Deal`,
        account_id: account._id,
        contact_ids: contact ? [contact._id] : [],
        owner_id: lead.owner_id,
        lead_id: lead._id,
        createdBy: session.user.id,
        stage: 'Prospecting',
        stage_entered_at: new Date(),
        stage_history: [{ stage: 'Prospecting', entered_at: new Date() }]
      }], { session: sessionDb });
      opportunity = opportunity[0];
    }
    
    lead.status = 'Converted';
    lead.converted_at = new Date();
    if (account) lead.converted_account_id = account._id;
    if (contact) lead.converted_contact_id = contact._id;
    if (opportunity) lead.converted_opportunity_id = opportunity._id;
    await lead.save({ session: sessionDb });
    
    await sessionDb.commitTransaction();

    await logSystemActivity({
      tenantId: session.user.tenantId,
      userId: session.user.id,
      type: "Note",
      subject: `Lead Converted: ${lead.lead_name}`,
      description: `Lead was successfully converted.`,
      linked_lead_id: lead._id.toString(),
      linked_account_id: account?._id.toString(),
      linked_opportunity_id: opportunity?._id.toString(),
      linked_contact_id: contact?._id.toString()
    });

    return NextResponse.json({ success: true, data: { lead, account, contact, opportunity } });
  } catch (error: any) {
    await sessionDb.abortTransaction();
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  } finally {
    sessionDb.endSession();
  }
}
