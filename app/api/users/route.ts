import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import User from "@/models/auth/User";
import Employee from "@/models/hr/Employee";
import { ENTITY_STATUS } from "@/lib/constants/statuses";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (
      !session ||
      !["admin", "sales", "finance", "inventory", "hr", "master-admin"].includes(
        session.user.role,
      )
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }


    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim();
    const role = searchParams.get("role");
    const userStatus = searchParams.get("status");

    const query: any = { tenantId };
    if (role && role !== "all") query.role = role;
    if (userStatus && userStatus !== "all") query.status = userStatus;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { employeeId: { $regex: search, $options: "i" } },
      ];
    }

    // Additive: omitting these params leaves every existing unbounded
    // consumer of this route (assignee/user pickers across every module)
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
      if (Object.keys(range).length > 0) query.createdAt = range;
    }

    // Stats (KPI cards) always reflect every user tenant-wide — unaffected by
    // the current search/role/status filters, matching the original page's
    // behavior of computing KPIs from the full unfiltered user set rather
    // than just the current page.
    const [statsTotal, statsActive, statsInactive] = await Promise.all([
      User.countDocuments({ tenantId }),
      User.countDocuments({ tenantId, status: "active" }),
      User.countDocuments({ tenantId, status: "inactive" }),
    ]);
    const stats = { total: statsTotal, active: statsActive, inactive: statsInactive };

    const baseQuery = User.find(query).select("-password").sort({ createdAt: -1 });

    // Pagination is opt-in via `page` — many other modules' user-picker
    // dropdowns and this endpoint's own POST-adjacent dialogs read this same
    // list unbounded, so omitting `page` must keep returning everything.
    const pageParam = searchParams.get("page");
    if (!pageParam) {
      const users = await baseQuery.lean();
      return NextResponse.json({ users, total: users.length, page: 1, totalPages: 1, stats }, { status: 200 });
    }

    const page = Math.max(1, parseInt(pageParam));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const skip = (page - 1) * limit;

    const [total, users] = await Promise.all([
      User.countDocuments(query),
      baseQuery.skip(skip).limit(limit).lean(),
    ]);

    return NextResponse.json({ users, total, page, totalPages: Math.max(1, Math.ceil(total / limit)), stats }, { status: 200 });
  } catch (error: unknown) {
    console.error("Get users error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Something went wrong" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }


    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const {
      name,
      email,
      phone,
      password,
      role,
      department,
      employeeId,
      designation,
    } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedEmployeeId = employeeId
      ? String(employeeId).trim() || undefined
      : undefined;

    if (!name || !email || !phone || !password || !role) {
      return NextResponse.json(
        { error: "Name, email, phone, password, and role are required" },
        { status: 400 },
      );
    }

    const validRoles = [
      "admin",
      "finance",
      "hr",
      "sales",
      "inventory",
      "project",
      "manufacturing",
    ];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    await connectDB();

    // Check for existing user in the same tenant
    const existingUser = await User.findOne({
      email: normalizedEmail,
      tenantId,
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists in your organization" },
        { status: 409 },
      );
    }

    if (normalizedEmployeeId) {
      const existingEmployeeId = await User.findOne({
        employeeId: normalizedEmployeeId,
        tenantId,
      });
      if (existingEmployeeId) {
        return NextResponse.json(
          { error: "Employee ID already exists in your organization" },
          { status: 409 },
        );
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email: normalizedEmail,
      phone,
      password: hashedPassword,
      role,
      department,
      employeeId: normalizedEmployeeId,
      designation,
      status: ENTITY_STATUS.ACTIVE,
      dateOfJoining: new Date(),
      createdBy: session.user.id,
      tenantId,
    });

    // ── Auto-link to existing Employee by email ──
    const existingEmployee = await Employee.findOne({
      tenantId,
      email: normalizedEmail,
    });
    if (existingEmployee && !existingEmployee.userId) {
      await Employee.findOneAndUpdate(
        { _id: existingEmployee._id, tenantId },
        { $set: { userId: user._id } },
      );
      // Also sync employeeId back to user if not set
      if (!employeeId && existingEmployee.employeeCode) {
        await User.findOneAndUpdate(
          { _id: user._id, tenantId },
          { $set: { employeeId: existingEmployee.employeeCode } },
        );
      }
    }

    return NextResponse.json(
      {
        message: "User created successfully",
        user: {
          id: String(user._id),
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          department: user.department,
          employeeId: user.employeeId,
          designation: user.designation,
          status: user.status,
          dateOfJoining: user.dateOfJoining,
          createdAt: user.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Create user error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Something went wrong" },
      { status: 500 },
    );
  }
}
