import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { determineNextBestAction } from "@/lib/crm/ai/nextBestAction";
import dbConnect from "@/lib/db";
import mongoose from "mongoose";

// Helper to grab real record
async function getRecord(entityType: string, entityId: string, tenantId: string) {
  const map: Record<string, string> = {
    "Lead": "CrmLead", "Opportunity": "CrmOpportunity", "Contract": "CrmContract"
  };
  const modelName = map[entityType];
  if (!modelName) return null;
  const Model = mongoose.models[modelName];
  if (!Model) return null;
  return Model.findOne({ _id: entityId, tenantId }).lean();
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();
  const url = new URL(req.url);
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");

  if (!entityType || !entityId) {
    return NextResponse.json({ success: false, message: "Missing params" }, { status: 400 });
  }

  const record = await getRecord(entityType, entityId, session.user.tenantId);
  if (!record) return NextResponse.json({ success: false, message: "Record not found" }, { status: 404 });

  const recommendations = determineNextBestAction(entityType, record);

  return NextResponse.json({ success: true, data: recommendations });
}
