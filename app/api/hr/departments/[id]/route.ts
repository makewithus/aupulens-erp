import { stripProtectedFields } from "@/lib/api/validateId";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Department from "@/models/hr/Department";
import Employee from "@/models/hr/Employee";
import User from "@/models/auth/User";
import Payroll from "@/models/hr/Payroll";
import { validateObjectId, handleRouteError } from "@/lib/api/validateId";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const department = await Department.findOne({ _id: id, tenantId })
      .populate("headOfDepartment", "firstName lastName employeeCode")
      .populate("parentDepartmentId", "name code")
      .lean();

    if (!department) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ department });
  } catch (error: any) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = stripProtectedFields(await req.json());
    await connectDB();

    // Strip protected fields from mass assignment

delete body._id;
    delete body.tenantId;
    delete body.createdAt;

    if (body.name !== undefined) body.name = String(body.name).trim();
    if (body.code !== undefined) body.code = String(body.code).trim().toUpperCase();
    if (body.name !== undefined && !body.name) {
      return NextResponse.json({ error: "Department name is required" }, { status: 400 });
    }
    if (body.code !== undefined && !/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(body.code)) {
      return NextResponse.json({ error: "Department code must be 2–20 letters, numbers, hyphens or underscores" }, { status: 400 });
    }
    const nameRegex = body.name === undefined ? null : new RegExp(`^${escapeRegex(body.name)}$`, "i");
    if (nameRegex && await Department.exists({ _id: { $ne: id }, tenantId, name: nameRegex })) {
      return NextResponse.json({ error: "A department with this name already exists" }, { status: 409 });
    }
    if (body.code !== undefined && await Department.exists({ _id: { $ne: id }, tenantId, code: body.code })) {
      return NextResponse.json({ error: "Department with this code already exists" }, { status: 409 });
    }
    if (body.headOfDepartment) {
      const headIdError = validateObjectId(String(body.headOfDepartment));
      if (headIdError) return NextResponse.json({ error: "Choose a valid department head." }, { status: 400 });
      if (!await Employee.exists({ _id: body.headOfDepartment, tenantId })) return NextResponse.json({ error: "The selected department head does not belong to this organization." }, { status: 400 });
    }
    if (body.parentDepartmentId) {
      const parentIdError = validateObjectId(String(body.parentDepartmentId));
      if (parentIdError || String(body.parentDepartmentId) === id) return NextResponse.json({ error: "Choose a valid parent department." }, { status: 400 });
      if (!await Department.exists({ _id: body.parentDepartmentId, tenantId })) return NextResponse.json({ error: "The selected parent department does not belong to this organization." }, { status: 400 });
    }

    const department = await Department.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: body },
      { new: true },
    )
      .populate("headOfDepartment", "firstName lastName employeeCode")
      .populate("parentDepartmentId", "name code");

    if (!department) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 },
      );
    }

    // Sync department name to linked Users' department field
    if (body.name) {
      const employeesInDept = await Employee.find({ tenantId, departmentId: id }).select("userId").lean();
      const linkedUserIds = employeesInDept
        .filter((e: any) => e.userId)
        .map((e: any) => e.userId);
      if (linkedUserIds.length > 0) {
        await User.updateMany(
          { _id: { $in: linkedUserIds }, tenantId },
          { $set: { department: body.name } },
        );
      }
    }

    return NextResponse.json({ success: true, department });

  } catch (error: any) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    if (!await Department.exists({ _id: id, tenantId })) {
      return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }
    if (await Payroll.exists({ tenantId, departmentId: id })) {
      return NextResponse.json({ error: "This department is referenced by payroll history. Deactivate it instead of deleting it." }, { status: 409 });
    }

    const affectedEmployees = await Employee.find({ tenantId, departmentId: id }).select("userId").lean();
    const linkedUserIds = affectedEmployees.map((employee: any) => employee.userId).filter(Boolean);
    const department = await Department.findOneAndDelete({
      _id: id,
      tenantId,
    });

    if (!department) {
      return NextResponse.json(
        { error: "Department not found" },
        { status: 404 },
      );
    }

    // Unlink employees from deleted department
    await Promise.all([
      Employee.updateMany({ tenantId, departmentId: id }, { $unset: { departmentId: "" } }),
      Department.updateMany({ tenantId, parentDepartmentId: id }, { $unset: { parentDepartmentId: "" } }),
    ]);

    // Also clear department on linked Users
    if (linkedUserIds.length) {
      await User.updateMany(
        { _id: { $in: linkedUserIds }, tenantId },
        { $set: { department: "" } },
      );
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    return handleRouteError(error);
  }
}
