import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmLead from "@/models/crm/Lead";
import CrmAccount from "@/models/crm/Account";
import CrmContact from "@/models/crm/Contact";
import CrmOpportunity from "@/models/crm/Opportunity";
import CrmQuote from "@/models/crm/Quote";
import CrmContract from "@/models/crm/Contract";
import CrmCase from "@/models/crm/Case";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const url = new URL(req.url);
  const term = url.searchParams.get("q");
  const tenantId = session.user.tenantId;

  if (!term || term.length < 2) {
    return NextResponse.json({ success: true, data: [] });
  }

  const regex = new RegExp(term, "i");

  // Perform parallel searches across key fields for each entity type.
  // Projection is used to keep the payload minimal.
  const [
    leads,
    accounts,
    contacts,
    opps,
    quotes,
    contracts,
    cases
  ] = await Promise.all([
    CrmLead.find({
      tenantId,
      $or: [{ lead_name: regex }, { company_name: regex }, { email: regex }]
    }).select("lead_name company_name email status").limit(5).lean(),
    
    CrmAccount.find({
      tenantId,
      $or: [{ company_name: regex }, { industry: regex }]
    }).select("company_name industry type").limit(5).lean(),
    
    CrmContact.find({
      tenantId,
      $or: [{ first_name: regex }, { last_name: regex }, { email: regex }]
    }).select("first_name last_name email title").limit(5).lean(),
    
    CrmOpportunity.find({
      tenantId,
      $or: [{ deal_name: regex }]
    }).select("deal_name stage amount").limit(5).lean(),
    
    CrmQuote.find({
      tenantId,
      $or: [{ quote_number: regex }]
    }).select("quote_number status grand_total").limit(5).lean(),
    
    CrmContract.find({
      tenantId,
      $or: [{ contract_number: regex }]
    }).select("contract_number status contract_value").limit(5).lean(),
    
    CrmCase.find({
      tenantId,
      $or: [{ subject: regex }, { case_number: regex }]
    }).select("subject case_number status priority").limit(5).lean(),
  ]);

  const results = [
    ...leads.map((l: any) => ({ type: "Lead", id: l._id, title: l.lead_name, subtitle: l.company_name, badge: l.status, url: `/crm/leads/${l._id}` })),
    ...accounts.map((a: any) => ({ type: "Account", id: a._id, title: a.company_name, subtitle: a.industry, badge: a.type, url: `/crm/accounts/${a._id}` })),
    ...contacts.map((c: any) => ({ type: "Contact", id: c._id, title: `${c.first_name} ${c.last_name}`, subtitle: c.email, badge: c.title, url: `/crm/contacts/${c._id}` })),
    ...opps.map((o: any) => ({ type: "Opportunity", id: o._id, title: o.deal_name, subtitle: `$${o.amount}`, badge: o.stage, url: `/crm/opportunities/${o._id}` })),
    ...quotes.map((q: any) => ({ type: "Quote", id: q._id, title: q.quote_number, subtitle: `$${q.grand_total}`, badge: q.status, url: `/crm/quotes/${q._id}` })),
    ...contracts.map((c: any) => ({ type: "Contract", id: c._id, title: c.contract_number, subtitle: `$${c.contract_value}`, badge: c.status, url: `/crm/contracts/${c._id}` })),
    ...cases.map((c: any) => ({ type: "Case", id: c._id, title: c.subject, subtitle: c.case_number, badge: c.status, url: `/crm/cases/${c._id}` })),
  ];

  return NextResponse.json({ success: true, data: results });
}
