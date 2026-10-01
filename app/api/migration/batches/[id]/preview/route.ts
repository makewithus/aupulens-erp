import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import mongoose from "mongoose";
import MigrationRecord from "@/models/admin/MigrationRecord";
import MigrationBatch from "@/models/admin/MigrationBatch";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  const searchParams = req.nextUrl.searchParams;
  const entityType = searchParams.get("entityType");

  await dbConnect();
  
  const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId }).lean();
  if (!batch) return NextResponse.json({ success: false }, { status: 404 });

  if (!entityType) {
    const counts = await MigrationRecord.aggregate([
      { $match: { batchId: new mongoose.Types.ObjectId(id), tenantId: session.user.tenantId, status: "valid" } },
      { $group: { _id: "$entityType", count: { $sum: 1 } } }
    ]);
    return NextResponse.json({ success: true, data: counts });
  }

  const records = await MigrationRecord.find({ batchId: id, tenantId: session.user.tenantId, status: "valid", entityType }).limit(10).lean();
  return NextResponse.json({ success: true, data: records });
}
