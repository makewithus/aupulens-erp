import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmContract from "@/models/crm/Contract";
import CrmAuditLog from "@/models/crm/CrmAuditLog";
import CrmOpportunity from "@/models/crm/Opportunity";
import { requireRole } from "@/lib/crm/rbac";

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const roleCheck = requireRole(session, ['contract.renew']);
  if (roleCheck) return roleCheck;

  await dbConnect();
  const contract = await CrmContract.findOne({ _id: params.id, tenantId: session.user.tenantId });
  if (!contract) return NextResponse.json({ success: false }, { status: 404 });

  const body = await req.json();

  // Create renewal opportunity
  const opp = await CrmOpportunity.create({
    tenantId: session.user.tenantId,
    deal_name: `Renewal: ${contract.contract_number}`,
    account_id: contract.account_id,
    amount: body.renewal_value || contract.contract_value,
    stage: 'Discovery',
    stage_history: [{ stage: 'Discovery', entered_at: new Date() }],
    probability: body.probability || 50,
    expected_close_date: contract.end_date,
    owner_id: contract.owner_id,
    createdBy: session.user.id,
  });

  // Update original contract
  contract.renewal_status = 'In Discussion';
  (contract as any).renewal_opportunity_id = opp._id;
  await contract.save();

  await CrmAuditLog.create({
    tenantId: session.user.tenantId,
    user_id: session.user.id,
    action: 'renewed',
    record_type: 'Contract',
    record_id: params.id,
    timestamp: new Date()
  });

  return NextResponse.json({ success: true, data: { contract, opportunity: opp } });
}
