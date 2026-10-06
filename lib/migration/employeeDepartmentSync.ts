import mongoose from "mongoose";
import Department from "@/models/hr/Department";
import Employee from "@/models/hr/Employee";
import MigrationRecord from "@/models/admin/MigrationRecord";
import { MIGRATION_ENTITY } from "@/lib/migration/constants";

function normalizeDepartmentName(value?: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function baseDepartmentCode(name: string) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
  const fallback = name.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase();
  return (initials || fallback || "DEPT").slice(0, 10);
}

function stableHash(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).toUpperCase().slice(0, 4).padStart(4, "0");
}

function departmentCodeCandidates(name: string) {
  const base = baseDepartmentCode(name);
  const hash = stableHash(name.toLowerCase());
  return [
    `${base}-${hash}`,
    `${base.slice(0, 8)}-${hash}`,
    ...Array.from({ length: 50 }, (_, index) => `${base.slice(0, 7)}-${hash}-${index + 1}`),
  ];
}

function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as any).code === 11000);
}

export async function ensureDepartmentForTenant(tenantId: string, departmentName?: string, userId?: string) {
  const name = normalizeDepartmentName(departmentName);
  if (!name) return undefined;

  const existing = await Department.findOne({
    tenantId,
    $or: [
      { name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
      { code: name },
    ],
  }).select("_id").lean();
  if (existing?._id) return existing._id;

  for (const code of departmentCodeCandidates(name)) {
    try {
      const department = await Department.create({
        tenantId,
        name,
        code,
        isActive: true,
        createdBy: userId && mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : undefined,
      });
      return department._id;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;

      const existingAfterRace = await Department.findOne({
        tenantId,
        $or: [
          { name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
          { code },
        ],
      }).select("_id name").lean();
      if (existingAfterRace && normalizeDepartmentName((existingAfterRace as any).name).toLowerCase() === name.toLowerCase()) {
        return existingAfterRace._id;
      }
    }
  }

  throw new Error(`Could not create a unique department code for "${name}".`);
}

export async function syncMigratedEmployeeDepartments(tenantId: string, userId?: string) {
  const records = await MigrationRecord.find({
    tenantId,
    entityType: MIGRATION_ENTITY.EMPLOYEE,
    status: "migrated",
    targetRecordId: { $exists: true },
    $or: [
      { "mappedData.department": { $exists: true, $nin: ["", null] } },
      { "sourceData.Department": { $exists: true, $nin: ["", null] } },
    ],
  })
    .select("targetRecordId mappedData.department sourceData.Department")
    .limit(1000)
    .lean();

  for (const record of records) {
    const departmentName = normalizeDepartmentName((record.mappedData as any)?.department || (record.sourceData as any)?.Department);
    if (!departmentName || !record.targetRecordId) continue;

    const employee = await Employee.findOne({ _id: record.targetRecordId, tenantId }).select("departmentId").lean();
    if (!employee || employee.departmentId) continue;

    const departmentId = await ensureDepartmentForTenant(tenantId, departmentName, userId);
    if (!departmentId) continue;
    await Employee.updateOne(
      {
        _id: record.targetRecordId,
        tenantId,
        $or: [{ departmentId: { $exists: false } }, { departmentId: null }],
      },
      { $set: { departmentId } },
    );
  }
}
