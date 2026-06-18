import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmOpportunity from "@/models/crm/Opportunity";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const body = await req.json();
  const opp = await CrmOpportunity.findOne({ _id: params.id, tenantId: session.user.tenantId });
  if (!opp) return NextResponse.json({ success: false }, { status: 404 });
  
  if (opp.stage !== body.stage) {
    if (opp.stage_history && opp.stage_history.length > 0) {
      opp.stage_history[opp.stage_history.length - 1].exited_at = new Date();
    }
    opp.stage = body.stage;
    opp.stage_entered_at = new Date();
    opp.stage_history.push({ stage: body.stage, entered_at: new Date() });
    
    const probMap: any = { 'Prospecting': 10, 'Discovery': 20, 'Requirement Gathering': 30, 'Solution Fit': 40, 'Proposal Sent': 50, 'Negotiation': 70, 'Approval': 85, 'Closed Won': 100, 'Closed Lost': 0 };
    if (probMap[body.stage] !== undefined) opp.probability = probMap[body.stage];
    
    await opp.save();
  }
  
  return NextResponse.json({ success: true, data: opp });
}
