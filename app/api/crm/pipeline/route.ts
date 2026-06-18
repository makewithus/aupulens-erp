import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import CrmOpportunity from "@/models/crm/Opportunity";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  
  await dbConnect();
  const stages = ['Prospecting','Discovery','Requirement Gathering','Solution Fit','Proposal Sent','Negotiation','Approval'];
  
  const pipeline = await CrmOpportunity.aggregate([
    { $match: { tenantId: session.user.tenantId, stage: { $in: stages } } },
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
