import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import OrgUnit, { ORG_LEVELS } from "@/models/OrgUnit";
import { buildTree, isValidChildLevel } from "@/lib/org/hierarchy";

/**
 * 8-level org hierarchy (6.8). GET returns the tenant's org tree; POST creates a
 * node, validating parent/child level order and computing the materialized path.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const guard = requireTenantId(session);
  if (guard) return guard;

  await dbConnect();
  const units = await OrgUnit.find({ tenantId: session.user.tenantId }).sort({ level: 1, name: 1 }).lean();
  return NextResponse.json({ success: true, data: { units, tree: buildTree(units as any[]) } });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const guard = requireTenantId(session);
  if (guard) return guard;

  const body = await req.json();
  const { name, level, parentId, code, localization, linkedDepartmentId, linkedEmployeeId } = body;

  if (!name || !level) return NextResponse.json({ success: false, message: "name and level are required" }, { status: 400 });
  if (!ORG_LEVELS.includes(level)) return NextResponse.json({ success: false, message: `level must be one of: ${ORG_LEVELS.join(", ")}` }, { status: 400 });

  await dbConnect();

  let path: any[] = [];
  let parentLevel: any = null;
  if (parentId) {
    const parent = await OrgUnit.findOne({ _id: parentId, tenantId: session.user.tenantId }).lean<{ _id: any; level: any; path: any[] }>();
    if (!parent) return NextResponse.json({ success: false, message: "Parent unit not found" }, { status: 404 });
    parentLevel = parent.level;
    path = [...(parent.path || []), parent._id];
  }

  const levelCheck = isValidChildLevel(parentLevel, level);
  if (!levelCheck.ok) return NextResponse.json({ success: false, message: levelCheck.error }, { status: 400 });

  const unit = await OrgUnit.create({
    tenantId: session.user.tenantId,
    name, code, level,
    parentId: parentId || null,
    path,
    localization: localization || {},
    linkedDepartmentId: linkedDepartmentId || undefined,
    linkedEmployeeId: linkedEmployeeId || undefined,
    createdBy: session.user.id,
  });

  return NextResponse.json({ success: true, data: unit });
}
