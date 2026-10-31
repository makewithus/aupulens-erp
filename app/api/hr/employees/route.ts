import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { employeeCodeForDisplay, isValidEmployeeCode, sanitizeEmployeePayload, validateEmployee } from "@/lib/hr/employeeValidation";
import { allocateEmployeeCode } from "@/lib/hr/employeeCode";
import { friendlyError } from "@/lib/errors/friendlyError";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Employee from "@/models/hr/Employee";
import User from "@/models/auth/User";
import Department from "@/models/hr/Department";
import "@/models/hr/Department";
import bcrypt from "bcryptjs";
import { ENTITY_STATUS } from "@/lib/constants/statuses";
import { safeEmitEvent } from "@/lib/aiRuntime/runtime/safeEmit";
import { syncMigratedEmployeeDepartments } from "@/lib/migration/employeeDepartmentSync";
import { applyDemoScope, isAdminSession } from "@/lib/auth/scopeFilter";

const departmentSyncLastRun = new Map<string, number>();
const DEPARTMENT_SYNC_INTERVAL_MS = 60_000;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scheduleDepartmentSync(tenantId: string, userId?: string) {
  const lastRun = departmentSyncLastRun.get(tenantId) || 0;
  if (Date.now() - lastRun < DEPARTMENT_SYNC_INTERVAL_MS) return;
  departmentSyncLastRun.set(tenantId, Date.now());
  after(async () => {
    try {
      await syncMigratedEmployeeDepartments(tenantId, userId);
    } catch (error) {
      console.error("Employee department background sync failed:", error);
    }
  });
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();
    scheduleDepartmentSync(tenantId, session.user.id);

    const { searchParams } = new URL(req.url);
    // Accepts either a single lifecycle status or a comma-separated list
    // (e.g. "on_notice,exit_initiated,clearance") to let callers that need
    // several statuses fetch them in one request instead of one per value.
    const lifecycle = searchParams.get("lifecycle");
    const department = searchParams.get("department");
    const search = searchParams.get("search");
    const account = searchParams.get("account");

    const query: any = { tenantId };

    if (lifecycle) {
      const statuses = lifecycle.split(",").map((s) => s.trim()).filter(Boolean);
      query.lifecycleStatus = statuses.length > 1 ? { $in: statuses } : statuses[0];
    }
    if (department) query.departmentId = department;
    if (account === "linked") query.userId = { $ne: null };
    else if (account === "unlinked") query.userId = null;
    if (search) {
      const deptIds = await Department.find({
        tenantId,
        $or: [
          { name: { $regex: escapeRegex(search.trim()).replace(/\s+/g, ".*"), $options: "i" } },
          { code: { $regex: escapeRegex(search.trim()).replace(/\s+/g, ".*"), $options: "i" } },
        ],
      }).select("_id").lean();

      if (deptIds.length > 0) {
        query.$or = [
          { $text: { $search: search } },
          { departmentId: { $in: deptIds.map((dept) => dept._id) } }
        ];
      } else {
        query.$text = { $search: search };
      }
    }

    // Filters by dateOfJoining ("who joined in this window") — additive,
    // omitting these params leaves every existing unbounded consumer of
    // this route (dropdowns in leave/attendance/exit/onboarding/etc.)
    // untouched.
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom || dateTo) {
      if (dateFrom && dateTo && new Date(dateFrom).getTime() > new Date(dateTo).getTime()) {
        return NextResponse.json({ items: [], total: 0, page: 1, limit: 10, totalPages: 1 });
      }
      const range: any = {};
      if (dateFrom && !isNaN(Date.parse(dateFrom))) {
        const start = new Date(dateFrom);
        start.setUTCHours(0, 0, 0, 0);
        range.$gte = start;
      }
      if (dateTo && !isNaN(Date.parse(dateTo))) {
        const end = new Date(dateTo);
        end.setUTCHours(23, 59, 59, 999);
        range.$lte = end;
      }
      if (Object.keys(range).length > 0) query.dateOfJoining = range;
    }

    const scopedQuery = applyDemoScope(session, query);
    const statsMatch: any = { tenantId };
    if (!isAdminSession(session)) {
      statsMatch.isDemo = { $ne: true };
    }

    // Stats (KPI cards) reflect scoped employees tenant-wide — unaffected
    // by the current search/lifecycle/department/account filters.
    const statsResult = await Employee.aggregate([
      { $match: statsMatch },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $or: [{ $in: ["$lifecycleStatus", ["active", "on_notice"]] }, { $and: [{ $eq: [{ $type: "$lifecycleStatus" }, "missing"] }, { $eq: ["$status", "active"] }] }] }, 1, 0] } },
        linked: { $sum: { $cond: [{ $and: [{ $ne: ["$userId", null] }, { $ne: [{ $type: "$userId" }, "missing"] }] }, 1, 0] } },
        unlinked: { $sum: { $cond: [{ $or: [{ $eq: ["$userId", null] }, { $eq: [{ $type: "$userId" }, "missing"] }] }, 1, 0] } },
      }}
    ]);

    const stats = statsResult[0] || { total: 0, active: 0, linked: 0, unlinked: 0 };
    // Remove _id from stats if it exists
    delete stats._id;

    const pageParam = searchParams.get("page");
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));

    if (pageParam) {
      // Paginated mode: only when caller explicitly passes ?page=
      const page = Math.max(1, parseInt(pageParam));
      const skip = (page - 1) * limit;
      const [total, employees] = await Promise.all([
        Employee.countDocuments(scopedQuery),
        Employee.find(scopedQuery)
          .populate("departmentId", "name code")
          .populate("reportingManagerId", "firstName lastName employeeCode")
          .populate("userId", "name email role status")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);
      const normalizedEmployees = employees.map((employee: any) => ({
        ...employee,
        employeeCode: employeeCodeForDisplay(employee),
      }));
      return NextResponse.json({ items: normalizedEmployees, total, page, totalPages: Math.ceil(total / limit), stats });
    }

    // No ?page= → return all (backward-compat for dropdowns and cross-module consumers)
    const employees = await Employee.find(scopedQuery)
      .populate("departmentId", "name code")
      .populate("reportingManagerId", "firstName lastName employeeCode")
      .populate("userId", "name email role status")
      .sort({ createdAt: -1 })
      .lean();

    const normalizedEmployees = employees.map((employee: any) => ({
      ...employee,
      employeeCode: employeeCodeForDisplay(employee),
    }));
    return NextResponse.json({ items: normalizedEmployees, total: employees.length, page: 1, totalPages: 1, stats });
  } catch (error: any) {
    console.error("Get Employees Error:", error);
    return NextResponse.json({ error: safeInternalErrorMessage() }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = sanitizeEmployeePayload(await req.json());
    await connectDB();

    // Ignore malformed codes from legacy clients/AI payloads and issue a
    // tenant-scoped ID in the canonical EMP-#### format instead.
    if (!isValidEmployeeCode(body.employeeCode)) {
      body.employeeCode = await allocateEmployeeCode(tenantId);
    }


const fieldErrors = validateEmployee(body);
    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        { error: Object.values(fieldErrors)[0], fieldErrors },
        { status: 400 },
      );
    }

    // Check for duplicate employee code
    const existing = await Employee.findOne({
      tenantId,
      employeeCode: body.employeeCode,
    });
    if (existing) {
      return NextResponse.json(
        { error: "Employee code already exists. Please use a different code.", fieldErrors: { employeeCode: "Employee code already exists. Please use a different code." } },
        { status: 409 },
      );
    }
    if (await Employee.exists({ tenantId, email: body.email.toLowerCase() })) {
      return NextResponse.json({ error: "An employee with this email already exists in this organization.", fieldErrors: { email: "This email is already linked to an employee." } }, { status: 409 });
    }

    // Calculate salary fields
    if (body.salary) {
      const s = body.salary;
      s.grossSalary = (s.basic || 0) + (s.hra || 0) + (s.da || 0) + (s.specialAllowance || 0);
      const d = s.deductions || {};
      const totalDeductions =
        (d.pf || 0) + (d.esi || 0) + (d.professionalTax || 0) + (d.tds || 0) + (d.otherDeductions || 0);
      s.netSalary = s.grossSalary - totalDeductions;
    }

    // Resolve one tenant-owned department before syncing the linked User, so
    // Employee.departmentId and User.department are derived from the same row.
    let departmentName: string | undefined;
    if (body.departmentId) {
      const dept = await Department.findOne({ _id: body.departmentId, tenantId });
      if (!dept) {
        return NextResponse.json({ error: "The selected department does not exist in this organization.", fieldErrors: { departmentId: "Select a department from this organization." } }, { status: 400 });
      }
      departmentName = dept.name;
    } else if (typeof body.department === "string" && body.department.trim()) {
      departmentName = body.department.trim();
      let dept = await Department.findOne({ tenantId, name: new RegExp(`^${escapeRegex(departmentName)}$`, "i") });
      if (!dept) {
        const baseCode = departmentName.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase() || "DEPT";
        let code = baseCode;
        let suffix = 2;
        while (await Department.exists({ tenantId, code })) {
          code = `${baseCode.slice(0, 14)}_${suffix++}`;
        }
        dept = await Department.create({ tenantId, name: departmentName, code, isActive: true, createdBy: session.user.id });
      }
      body.departmentId = dept._id;
      departmentName = dept.name;
    }

    // ── User ↔ Employee Sync ──
    // Check if a User with the same email already exists in this tenant
    let linkedUserId = body.userId || null;
    const existingUser = await User.findOne({
      email: body.email.toLowerCase(),
      tenantId,
    });

    if (existingUser) linkedUserId = existingUser._id;

    const employee = new Employee({
      ...body,
      lifecycleStatus: body.lifecycleStatus || "active",
      tenantId,
      userId: linkedUserId,
      createdBy: session.user.id,
    });

    await employee.save();

    // Create/link the user only after the employee row is durable. If account
    // creation fails, remove the just-created employee so neither side remains
    // with a dangling employee code/reference.
    if (existingUser) {
      await User.findOneAndUpdate(
        { _id: existingUser._id, tenantId },
        { $set: {
          employeeId: body.employeeCode,
          designation: body.designation || existingUser.designation,
          department: departmentName || existingUser.department || "",
        } },
      );
    } else if (body.createUserAccount) {
      try {
        const defaultPassword = body.userPassword || "Aupulens@123";
        const hashedPassword = await bcrypt.hash(defaultPassword, 12);
        const newUser = await User.create({
          tenantId,
          name: `${body.firstName} ${body.lastName}`,
          email: body.email.toLowerCase(),
          phone: body.phone,
          password: hashedPassword,
          role: body.userRole || "hr",
          department: departmentName || "",
          employeeId: body.employeeCode,
          designation: body.designation || "",
          status: ENTITY_STATUS.ACTIVE,
          dateOfJoining: body.dateOfJoining ? new Date(body.dateOfJoining) : new Date(),
          createdBy: session.user.id,
        });
        employee.userId = newUser._id;
        await employee.save();
      } catch (error) {
        await Employee.deleteOne({ _id: employee._id, tenantId });
        throw error;
      }
    }

    // Additive (docs/ai/BRIEF-08a-BATCH-G.md 0.5) — never throws back into this route.
    await safeEmitEvent(tenantId, "master_data.changed", { model: "Employee", id: String(employee._id), tenantId });

    // Populate for response
    const populated = await Employee.findOne({ _id: employee._id, tenantId })
      .populate("departmentId", "name code")
      .populate("userId", "name email role status")
      .lean();

    return NextResponse.json(
      { success: true, employee: populated },
      { status: 201 },
    );

  } catch (error: any) {
    console.error("Create Employee Error:", error);
    return NextResponse.json(
      { error: friendlyError(error, "We couldn't save this employee. Please check the details and try again.") },
      { status: 500 },
    );
  }
}
