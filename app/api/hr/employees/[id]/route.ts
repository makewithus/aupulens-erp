import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Employee from "@/models/hr/Employee";
import User from "@/models/auth/User";
import "@/models/hr/Department";
import bcrypt from "bcryptjs";
import { ENTITY_STATUS } from "@/lib/constants/statuses";

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

    const employee = await Employee.findOne({ _id: id, tenantId })
      .populate("departmentId", "name code")
      .populate("reportingManagerId", "firstName lastName employeeCode")
      .populate("userId", "name email role status")
      .populate("chatter.authorId", "name")
      .lean();

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ employee });
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

    // Recalculate salary if salary fields are provided
    if (body.salary) {
      const s = body.salary;
      s.grossSalary = (s.basic || 0) + (s.hra || 0) + (s.da || 0) + (s.specialAllowance || 0);
      const d = s.deductions || {};
      const totalDeductions =
        (d.pf || 0) + (d.esi || 0) + (d.professionalTax || 0) + (d.tds || 0) + (d.otherDeductions || 0);
      s.netSalary = s.grossSalary - totalDeductions;
    }

    // ── Handle "Create User Account" from edit mode ──
    if (body.createUserAccount && !body.userId) {
      const existingUser = await User.findOne({
        email: (body.email || "").toLowerCase(),
        tenantId,
      });
      if (existingUser) {
        body.userId = existingUser._id;
        await User.findOneAndUpdate(
          { _id: existingUser._id, tenantId },
          {
            $set: {
              employeeId: body.employeeCode,
              designation: body.designation,
            },
          },
        );
      } else {
        const defaultPassword = body.userPassword || "Aupulens@123";
        const hashedPassword = await bcrypt.hash(defaultPassword, 12);
        const currentEmp = await Employee.findOne({ _id: id, tenantId }).lean();
        const newUser = await User.create({
          tenantId,
          name: `${body.firstName || currentEmp?.firstName || ""} ${body.lastName || currentEmp?.lastName || ""}`.trim(),
          email: (body.email || currentEmp?.email || "").toLowerCase(),
          phone: body.phone || currentEmp?.phone || "",
          password: hashedPassword,
          role: body.userRole || "hr",
          department: body.department || "",
          employeeId: body.employeeCode || currentEmp?.employeeCode || "",
          designation: body.designation || currentEmp?.designation || "",
          status: ENTITY_STATUS.ACTIVE,
          dateOfJoining: body.dateOfJoining ? new Date(body.dateOfJoining) : currentEmp?.dateOfJoining || new Date(),
          createdBy: session.user.id,
        });
        body.userId = newUser._id;
      }
    }
    // Remove helper flags before saving
    delete body.createUserAccount;
    delete body.userPassword;
    delete body.userRole;

    const employee = await Employee.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: body },
      { new: true },
    )
      .populate("departmentId", "name code")
      .populate("reportingManagerId", "firstName lastName employeeCode")
      .populate("userId", "name email role status");

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 },
      );
    }

    // ── Sync fields back to linked User ──
    if (employee.userId) {
      const userUpdate: any = {};
      if (body.firstName || body.lastName) {
        userUpdate.name = `${employee.firstName} ${employee.lastName}`;
      }
      if (body.email) userUpdate.email = employee.email;
      if (body.phone) userUpdate.phone = employee.phone;
      if (body.designation) userUpdate.designation = employee.designation;
      if (body.employeeCode) userUpdate.employeeId = employee.employeeCode;

      if (Object.keys(userUpdate).length > 0) {
        const userId = typeof employee.userId === "object" && "_id" in employee.userId
          ? (employee.userId as any)._id
          : employee.userId;
        await User.findOneAndUpdate(
          { _id: userId, tenantId },
          { $set: userUpdate },
        );
      }
    }

    return NextResponse.json({ success: true, employee });
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

    const employee = await Employee.findOneAndDelete({ _id: id, tenantId });

    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 },
      );
    }

    // ── Unlink from User ──
    if (employee.userId) {
      await User.findOneAndUpdate(
        { _id: employee.userId, tenantId },
        { $unset: { employeeId: "" } },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
