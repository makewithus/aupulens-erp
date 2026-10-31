import { employeeCodeForDisplay, sanitizeEmployeePayload, validateEmployee } from "@/lib/hr/employeeValidation";
import { friendlyError } from "@/lib/errors/friendlyError";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Employee from "@/models/hr/Employee";
import User from "@/models/auth/User";
import Department from "@/models/hr/Department";
import Attendance from "@/models/hr/Attendance";
import LeaveRequest from "@/models/hr/LeaveRequest";
import Payroll from "@/models/hr/Payroll";
import PerformanceReview from "@/models/hr/PerformanceReview";
import "@/models/hr/Department";
import bcrypt from "bcryptjs";
import { ENTITY_STATUS } from "@/lib/constants/statuses";
import { safeEmitEvent } from "@/lib/aiRuntime/runtime/safeEmit";
import { canAccessDemoDoc } from "@/lib/auth/scopeFilter";

import { validateObjectId, handleRouteError, stripProtectedFields } from "@/lib/api/validateId";

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

    const employee = await Employee.findOne({ _id: id, tenantId })
      .populate("departmentId", "name code")
      .populate("reportingManagerId", "firstName lastName employeeCode")
      .populate("userId", "name email role status")
      .populate("chatter.authorId", "name")
      .lean();

    if (!employee || !canAccessDemoDoc(session, employee)) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ employee: { ...employee, employeeCode: employeeCodeForDisplay(employee) } });
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
    const rawBody = await req.json();
    const clearDepartment = rawBody.departmentId === "" || rawBody.departmentId === null;
    const body = sanitizeEmployeePayload(rawBody);
    await connectDB();


const existing = await Employee.findOne({ _id: id, tenantId });
    if (!existing || !canAccessDemoDoc(session, existing)) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    const fieldErrors = validateEmployee(body, { partial: true });
    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json({ error: Object.values(fieldErrors)[0], fieldErrors }, { status: 400 });
    }

    if (body.employeeCode && body.employeeCode !== existing.employeeCode && await Employee.exists({ tenantId, _id: { $ne: id }, employeeCode: body.employeeCode })) {
      return NextResponse.json({ error: "Employee code already exists. Please use a different code.", fieldErrors: { employeeCode: "Employee code already exists." } }, { status: 409 });
    }
    if (body.email && body.email.toLowerCase() !== existing.email && await Employee.exists({ tenantId, _id: { $ne: id }, email: body.email.toLowerCase() })) {
      return NextResponse.json({ error: "An employee with this email already exists in this organization.", fieldErrors: { email: "This email is already linked to an employee." } }, { status: 409 });
    }

    const departmentChanged = Object.prototype.hasOwnProperty.call(rawBody, "departmentId");
    let departmentName: string | undefined;
    if (departmentChanged && !clearDepartment) {
      const department = await Department.findOne({ _id: body.departmentId, tenantId }).select("name").lean();
      if (!department) {
        return NextResponse.json({ error: "The selected department does not exist in this organization.", fieldErrors: { departmentId: "Select a department from this organization." } }, { status: 400 });
      }
      departmentName = department.name;
    }

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
          department: departmentName || body.department || "",
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

    const safeBody = stripProtectedFields(body);

    const update: Record<string, any> = { $set: safeBody };
    if (clearDepartment) update.$unset = { departmentId: "" };
    const employee = await Employee.findOneAndUpdate(
      { _id: id, tenantId },
      update,
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

    await safeEmitEvent(tenantId, "master_data.changed", { model: "Employee", id: String(employee._id), tenantId });

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
      if (departmentChanged) userUpdate.department = departmentName || "";

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
    return NextResponse.json({ error: friendlyError(error, "We couldn't complete this request. Please try again.") }, { status: 500 });
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


const existing = await Employee.findOne({ _id: id, tenantId });
    if (!existing || !canAccessDemoDoc(session, existing)) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 },
      );
    }

    const [attendanceCount, leaveCount, payrollCount, reviewCount] = await Promise.all([
      Attendance.countDocuments({ tenantId, employeeId: id }),
      LeaveRequest.countDocuments({ tenantId, employeeId: id }),
      Payroll.countDocuments({ tenantId, "lineItems.employeeId": id }),
      PerformanceReview.countDocuments({ tenantId, employeeId: id }),
    ]);
    if (attendanceCount + leaveCount + payrollCount + reviewCount > 0) {
      return NextResponse.json({ error: "This employee has HR history. Mark the employee as exited instead of deleting the record." }, { status: 409 });
    }

    const employee = await Employee.findOneAndDelete({ _id: id, tenantId });

    await Promise.all([
      Department.updateMany({ tenantId, headOfDepartment: id }, { $unset: { headOfDepartment: "" } }),
      Employee.updateMany({ tenantId, reportingManagerId: id }, { $unset: { reportingManagerId: "" } }),
    ]);

    // ── Unlink from User ──
    if (employee.userId) {
      await User.findOneAndUpdate(
        { _id: employee.userId, tenantId },
        { $unset: { employeeId: "", designation: "" }, $set: { department: "" } },
      );
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    return handleRouteError(error);
  }
}
