import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmOpportunity from "@/models/crm/Opportunity";
import { applyDemoScope } from "@/lib/auth/scopeFilter";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const tenantId = session.user.tenantId;
  const scopedMatch = applyDemoScope(session, { tenantId });
  const pipeline = await CrmOpportunity.aggregate([
    // Return all stages, including closed deals, so board counts reconcile
    // with the analytics Total Deals KPI.
    { $match: scopedMatch },
    { $group: { 
        _id: '$stage', 
        deals: { $push: '$$ROOT' }, 
        totalValue: { $sum: '$amount' }, 
        count: { $sum: 1 },
        weightedValue: { $sum: { $multiply: ['$amount', { $divide: ['$probability', 100] }] } }
    }}
  ]);

  return NextResponse.json({ success: true, data: pipeline });
}
