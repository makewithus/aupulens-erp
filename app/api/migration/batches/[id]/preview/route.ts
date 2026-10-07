import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import mongoose from "mongoose";
import MigrationRecord from "@/models/admin/MigrationRecord";
import MigrationBatch from "@/models/admin/MigrationBatch";
import MigrationJob from "@/models/admin/MigrationJob";
import { getEntitySchema } from "@/lib/migration/entitySchemas";

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
  const [total, records, jobs] = await Promise.all([
    MigrationRecord.countDocuments(query),
    MigrationRecord.find(query)
      .sort({ _id: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    MigrationJob.find({ batchId: id, tenantId: session.user.tenantId, entityType })
      .select("columns mapping")
      .lean(),
  ]);

  const schema = getEntitySchema(entityType);
  const labelByKey = new Map((schema?.fields || []).map((field) => [field.key, field.label]));
  const mappedKeys = new Set<string>();
  const sourceColumnByField = new Map<string, string>();
  const mappedSourceColumns = new Set<string>();
  const sourceColumns = new Set<string>();

  for (const job of jobs) {
    Object.entries((job.mapping || {}) as Record<string, string>).forEach(([fieldKey, sourceColumn]) => {
      mappedKeys.add(fieldKey);
      if (sourceColumn) {
        mappedSourceColumns.add(sourceColumn);
        if (!sourceColumnByField.has(fieldKey)) sourceColumnByField.set(fieldKey, sourceColumn);
      }
    });
    ((job.columns || []) as string[]).forEach((column) => sourceColumns.add(column));
  }
  for (const record of records) {
    Object.entries(record.mappedData || {}).forEach(([key, value]) => {
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        mappedKeys.add(key);
      }
    });
    Object.keys(record.sourceData || {}).forEach((key) => sourceColumns.add(key));
  }

  const columns = [
    ...Array.from(mappedKeys).map((key) => ({
      key,
      label: labelByKey.get(key) || key,
      source: "mapped" as const,
      sourceColumn: sourceColumnByField.get(key) || null,
    })),
    ...Array.from(sourceColumns)
      .filter((key) => !mappedSourceColumns.has(key))
      .map((key) => ({
        key,
        label: key,
        source: "source" as const,
      })),
  ];

  return NextResponse.json({
    success: true,
    data: records,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      columns,
    },
  });
}
