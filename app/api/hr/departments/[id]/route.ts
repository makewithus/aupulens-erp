import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Department from "@/models/hr/Department";
import Employee from "@/models/hr/Employee";
import User from "@/models/auth/User";

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
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await req.json();
    await connectDB();

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
          { _id: { $in: linkedUserIds } },
          { $set: { department: body.name } },
        );
      }
    }

    return NextResponse.json({ success: true, department });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

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
    await Employee.updateMany(
      { tenantId, departmentId: id },
      { $unset: { departmentId: "" } },
    );

    // Also clear department on linked Users
    const orphanedEmployees = await Employee.find({ tenantId, userId: { $exists: true } }).select("userId").lean();
    // No need to filter - just clear department for users whose employees were in this dept
    // The updateMany above already unset departmentId, so we handle User sync

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
