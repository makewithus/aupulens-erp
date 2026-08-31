import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import LeaveRequest from "@/models/hr/LeaveRequest";
import Employee from "@/models/hr/Employee";

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
    const status = searchParams.get("status");
    const employeeId = searchParams.get("employeeId");
    const search = searchParams.get("search")?.trim();

    const query: any = { tenantId };
    if (status) query.status = status;
    if (employeeId) query.employeeId = employeeId;

    // A leave request spans [startDate, endDate], so "within this filter
    // window" means the two ranges overlap — not that startDate itself
    // falls inside the window — otherwise a multi-day leave that started
    // before the window but is still ongoing during it would be missed.
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (dateFrom && !isNaN(Date.parse(dateFrom))) {
      query.endDate = { $gte: new Date(dateFrom) };
    }
    if (dateTo && !isNaN(Date.parse(dateTo))) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      query.startDate = { $lte: end };
    }

    if (search) {
      const employeeIds = await Employee.find({
        tenantId,
        $or: [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { employeeCode: { $regex: search, $options: "i" } },
        ],
      }).distinct("_id");
      query.employeeId = employeeId ? employeeId : { $in: employeeIds };
    }

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const skip = (page - 1) * limit;

    // Stats (KPI cards) always reflect every leave request tenant-wide —
    // unaffected by the current status/search filters, matching the original
    // page's behavior of computing KPIs from the full unfiltered set rather
    // than just the current page.
    const [statsTotal, statsPending, statsApproved, statsRejected] = await Promise.all([
      LeaveRequest.countDocuments({ tenantId }),
      LeaveRequest.countDocuments({ tenantId, status: "pending" }),
      LeaveRequest.countDocuments({ tenantId, status: "approved" }),
      LeaveRequest.countDocuments({ tenantId, status: "rejected" }),
    ]);
    const stats = { total: statsTotal, pending: statsPending, approved: statsApproved, rejected: statsRejected };

    const [total, leaves] = await Promise.all([
      LeaveRequest.countDocuments(query),
      LeaveRequest.find(query)
        .populate({
          path: "employeeId",
          select: "firstName lastName employeeCode departmentId designation",
          populate: { path: "departmentId", select: "name code" },
        })
        .populate("approvedBy", "name")
        .populate("rejectedBy", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return NextResponse.json({ items: leaves, total, page, totalPages: Math.ceil(total / limit), stats });
  } catch (error: any) {
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

    if (!body.employeeId || !body.leaveType || !body.startDate || !body.endDate || !body.reason) {
      return NextResponse.json(
        { error: "Employee, leave type, dates, and reason are required" },
        { status: 400 },
      );
    }

    // Calculate total days
    const start = new Date(body.startDate);
    const end = new Date(body.endDate);
    const totalDays = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
    ) + 1;

    // Check leave balance
    const employee = await Employee.findOne({
      _id: body.employeeId,
      tenantId,
    });
    if (!employee) {
      return NextResponse.json(
        { error: "Employee not found" },
        { status: 404 },
      );
    }

    const balanceKey = body.leaveType as keyof typeof employee.leaveBalance;
    if (
      body.leaveType !== "unpaid" &&
      employee.leaveBalance[balanceKey] < totalDays
    ) {
      return NextResponse.json(
        {
          error: `Insufficient ${body.leaveType} leave balance. Available: ${employee.leaveBalance[balanceKey]}, Requested: ${totalDays}`,
        },
        { status: 400 },
      );
    }

    const leave = new LeaveRequest({
      ...body,
      totalDays,
      tenantId,
      createdBy: session.user.id,
    });

    await leave.save();

    return NextResponse.json({ success: true, leave }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
