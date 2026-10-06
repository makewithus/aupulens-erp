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
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(10, Number(searchParams.get("pageSize") || "10")));

  await dbConnect();
  
  const batch = await MigrationBatch.findOne({ _id: id, tenantId: session.user.tenantId }).lean();
  if (!batch) return NextResponse.json({ success: false }, { status: 404 });

  const previewMatch = {
    $or: [
      { status: "valid" },
      { status: "duplicate", duplicateAction: { $ne: "skip" } },
    ],
  };

  if (!entityType) {
    const counts = await MigrationRecord.aggregate([
      { $match: { batchId: new mongoose.Types.ObjectId(id), tenantId: session.user.tenantId, ...previewMatch } },
      { $group: { _id: "$entityType", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    return NextResponse.json({ success: true, data: counts });
  }

  const query = { batchId: id, tenantId: session.user.tenantId, entityType, ...previewMatch };
  const [total, records] = await Promise.all([
    MigrationRecord.countDocuments(query),
    MigrationRecord.find(query)
      .sort({ _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
  ]);

  return NextResponse.json({
    success: true,
    data: records,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
