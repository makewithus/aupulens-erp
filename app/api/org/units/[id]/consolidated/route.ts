import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import OrgUnit from "@/models/OrgUnit";
import Employee from "@/models/Employee";
import { resolveLocalization } from "@/lib/org/hierarchy";

/**
 * Consolidated cross-entity report for an org unit's whole subtree (6.8):
 * descendant counts by level, effective (inherited) localization, and real
 * headcount rolled up from linked Departments + Employee-level nodes.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const guard = requireTenantId(session);
  if (guard) return guard;

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
  const tenantId = session.user.tenantId;

  await dbConnect();
  const node = await OrgUnit.findOne({ _id: id, tenantId }).lean<any>();
  if (!node) return NextResponse.json({ success: false, message: "Unit not found" }, { status: 404 });

  // Subtree = every node whose materialized path contains this node's id (+ self).
  const subtree = await OrgUnit.find({ tenantId, $or: [{ _id: id }, { path: id }] }).lean<any[]>();

  // Ancestors (root-first) for localization inheritance.
  const ancestors = node.path?.length
    ? await OrgUnit.find({ tenantId, _id: { $in: node.path } }).lean<any[]>()
    : [];
  const ancestorsRootFirst = (node.path || []).map((pid: any) => ancestors.find((a) => String(a._id) === String(pid))).filter(Boolean);
  const effectiveLocalization = resolveLocalization(node, ancestorsRootFirst);

  // Descendant counts by level.
  const countsByLevel: Record<string, number> = {};
  for (const u of subtree) countsByLevel[u.level] = (countsByLevel[u.level] || 0) + 1;

  // Real headcount: Employee-level nodes in the subtree + Employees whose
  // departmentId matches any linked Department in the subtree.
  const employeeNodeCount = subtree.filter((u) => u.level === "Employee").length;
  const linkedDeptIds = subtree.map((u) => u.linkedDepartmentId).filter(Boolean);
  const linkedEmployeeCount = linkedDeptIds.length
    ? await Employee.countDocuments({ tenantId, departmentId: { $in: linkedDeptIds } })
    : 0;

  return NextResponse.json({
    success: true,
    data: {
      unit: { id: String(node._id), name: node.name, level: node.level },
      subtreeSize: subtree.length,
      countsByLevel,
      effectiveLocalization,
      headcount: { employeeNodes: employeeNodeCount, linkedEmployees: linkedEmployeeCount, total: employeeNodeCount + linkedEmployeeCount },
    },
  });
}
