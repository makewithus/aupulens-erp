import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Employee from "@/models/hr/Employee";
import User from "@/models/auth/User";
import "@/models/hr/Department";
import bcrypt from "bcryptjs";
import { ENTITY_STATUS } from "@/lib/constants/statuses";
import { safeEmitEvent } from "@/lib/aiRuntime/runtime/safeEmit";

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
      query.$or = [
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
        { employeeCode: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // Filters by dateOfJoining ("who joined in this window") — additive,
    // omitting these params leaves every existing unbounded consumer of
    // this route (dropdowns in leave/attendance/exit/onboarding/etc.)
    // untouched.
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom || dateTo) {
      const range: any = {};
      if (dateFrom && !isNaN(Date.parse(dateFrom))) range.$gte = new Date(dateFrom);
      if (dateTo && !isNaN(Date.parse(dateTo))) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        range.$lte = end;
      }
      if (Object.keys(range).length > 0) query.dateOfJoining = range;
    }

    // Stats (KPI cards) always reflect every employee tenant-wide — unaffected
    // by the current search/lifecycle/department/account filters, matching
    // the original page's behavior of computing KPIs from the full,
    // unfiltered employee set rather than just the current page.
    const [statsTotal, statsActive, statsLinked, statsUnlinked] = await Promise.all([
      Employee.countDocuments({ tenantId }),
      Employee.countDocuments({ tenantId, lifecycleStatus: "active" }),
      Employee.countDocuments({ tenantId, userId: { $ne: null } }),
      Employee.countDocuments({ tenantId, userId: null }),
    ]);
    const stats = { total: statsTotal, active: statsActive, linked: statsLinked, unlinked: statsUnlinked };

    const pageParam = searchParams.get("page");
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));

    if (pageParam) {
      // Paginated mode: only when caller explicitly passes ?page=
      const page = Math.max(1, parseInt(pageParam));
      const skip = (page - 1) * limit;
      const [total, employees] = await Promise.all([
        Employee.countDocuments(query),
        Employee.find(query)
          .populate("departmentId", "name code")
          .populate("reportingManagerId", "firstName lastName employeeCode")
          .populate("userId", "name email role status")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);
      return NextResponse.json({ items: employees, total, page, totalPages: Math.ceil(total / limit), stats });
    }

    // No ?page= → return all (backward-compat for dropdowns and cross-module consumers)
    const employees = await Employee.find(query)
      .populate("departmentId", "name code")
      .populate("reportingManagerId", "firstName lastName employeeCode")
      .populate("userId", "name email role status")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ items: employees, total: employees.length, page: 1, totalPages: 1, stats });
  } catch (error: any) {
    console.error("Get Employees Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    const body = await req.json();
    await connectDB();

    if (!body.firstName || !body.lastName || !body.email || !body.phone || !body.employeeCode) {
      return NextResponse.json(
        { error: "First name, last name, email, phone, and employee code are required" },
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
        { error: "Employee with this code already exists" },
        { status: 409 },
      );
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

    // ── User ↔ Employee Sync ──
    // Check if a User with the same email already exists in this tenant
    let linkedUserId = body.userId || null;
    const existingUser = await User.findOne({
      email: body.email.toLowerCase(),
      tenantId,
    });

    if (existingUser) {
      // Link to existing user
      linkedUserId = existingUser._id;
      // Sync employeeId on the user record
      await User.findOneAndUpdate(
        { _id: existingUser._id, tenantId },
        {
          $set: {
            employeeId: body.employeeCode,
            designation: body.designation || existingUser.designation,
            department: body.department || existingUser.department,
          },
        },
      );
    } else if (body.createUserAccount) {
      // Optionally create a new User account for this employee
      const defaultPassword = body.userPassword || "Aupulens@123";
      const hashedPassword = await bcrypt.hash(defaultPassword, 12);
      const newUser = await User.create({
        tenantId,
        name: `${body.firstName} ${body.lastName}`,
        email: body.email.toLowerCase(),
        phone: body.phone,
        password: hashedPassword,
        role: body.userRole || "hr",
        department: body.department || "",
        employeeId: body.employeeCode,
        designation: body.designation || "",
        status: ENTITY_STATUS.ACTIVE,
        dateOfJoining: body.dateOfJoining ? new Date(body.dateOfJoining) : new Date(),
        createdBy: session.user.id,
      });
      linkedUserId = newUser._id;
    }

    const employee = new Employee({
      ...body,
      tenantId,
      userId: linkedUserId,
      createdBy: session.user.id,
    });

    await employee.save();

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
