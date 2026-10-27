import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId, getEffectiveTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Employee from "@/models/hr/Employee";
import Department from "@/models/hr/Department";
import Payroll from "@/models/hr/Payroll";
import LeaveRequest from "@/models/hr/LeaveRequest";
import Attendance from "@/models/hr/Attendance";
import { getCachedData, setCachedData } from "@/lib/api/serverCache";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = getEffectiveTenantId(session);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const isFresh = req.nextUrl.searchParams.get("fresh") === "true";
    const cacheKey = `hr-summary:${tenantId}`;
    if (!isFresh) {
      const cached = getCachedData<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }
    await connectDB();

    const tenantMatch = { tenantId };

    // Get employee counts
    const [
      totalEmployees,
      activeEmployees,
      onboardingEmployees,
      exitedEmployees,
      totalDepartments,
      pendingLeaves,
      totalLeaves,
      approvedLeaves,
      rejectedLeaves,
      currentMonthPayrolls,
      recentHires,
    ] = await Promise.all([
      Employee.countDocuments(tenantMatch),
      Employee.countDocuments({ ...tenantMatch, lifecycleStatus: "active" }),
      Employee.countDocuments({ ...tenantMatch, lifecycleStatus: "onboarding" }),
      Employee.countDocuments({
        ...tenantMatch,
        lifecycleStatus: "exited",
        updatedAt: { $gte: thirtyDaysAgo },
      }),
      Department.countDocuments({ ...tenantMatch, isActive: { $ne: false } }),
      LeaveRequest.countDocuments({ ...tenantMatch, status: "pending" }),
      LeaveRequest.countDocuments(tenantMatch),
      LeaveRequest.countDocuments({ ...tenantMatch, status: "approved" }),
      LeaveRequest.countDocuments({ ...tenantMatch, status: "rejected" }),
      Payroll.find({
        ...tenantMatch,
        "payrollPeriod.month": now.getMonth() + 1,
        "payrollPeriod.year": now.getFullYear(),
      }).lean(),
      Employee.find(tenantMatch)
        .select("firstName lastName employeeCode designation dateOfJoining lifecycleStatus")
        .sort({ dateOfJoining: -1 })
        .limit(5)
        .lean(),
    ]);

    // Get attendance stats for today
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const todayAttendance = await Attendance.aggregate([
      {
        $match: {
          ...tenantMatch,
          date: { $gte: todayStart, $lt: todayEnd },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const attendanceBreakdown: Record<string, number> = {};
    todayAttendance.forEach((item: any) => {
      attendanceBreakdown[item._id] = item.count;
    });

    // Payroll totals come from payroll runs only; salary contracts are not
    // evidence that payroll was calculated or paid for this period.
    const payrollSummary = currentMonthPayrolls.length > 0
      ? {
          totalGross: currentMonthPayrolls.reduce(
            (sum: number, p: any) => sum + (p.totals?.totalGross || 0),
            0,
          ),
          totalNet: currentMonthPayrolls.reduce(
            (sum: number, p: any) => sum + (p.totals?.totalNet || 0),
            0,
          ),
          status: currentMonthPayrolls[0]?.status || "not_started",
        }
      : {
          totalGross: 0,
          totalNet: 0,
          status: "not_started",
        };

    // Department-wise employee distribution from authoritative Department master
    const allDepartments = await Department.find({ ...tenantMatch, isActive: { $ne: false } }).select("_id name code").sort({ name: 1 }).lean();
    const empDeptCounts = await Employee.aggregate([
      { $match: { ...tenantMatch, lifecycleStatus: { $ne: "exited" } } },
      {
        $group: {
          _id: "$departmentId",
          count: { $sum: 1 },
        },
      },
    ]);
    const empCountByDeptId: Record<string, number> = {};
    for (const ec of empDeptCounts) {
      if (ec._id) empCountByDeptId[String(ec._id)] = ec.count;
    }
    const departmentDistribution = allDepartments.map((dept: any) => ({
      _id: dept._id,
      name: dept.name,
      departmentName: dept.name,
      code: dept.code,
      count: empCountByDeptId[String(dept._id)] || 0,
    }));

    // Daily shift attendance trend
    const dailyAttendanceAgg = await Attendance.aggregate([
      {
        $match: {
          tenantId,
          date: { $gte: thirtyDaysAgo },
          status: { $in: ["present", "half_day"] },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const dailyAttendance = dailyAttendanceAgg.map((d: any) => ({
      date: d._id,
      count: d.count,
    }));

    const responsePayload = {
      stats: {
        totalEmployees,
        activeEmployees,
        onboardingEmployees,
        exitedLast30Days: exitedEmployees,
        totalDepartments,
        pendingLeaves,
        totalLeaves,
        approvedLeaves,
        rejectedLeaves,
      },
      leaveStats: {
        total: totalLeaves,
        pending: pendingLeaves,
        approved: approvedLeaves,
        rejected: rejectedLeaves,
      },
      todayAttendance: attendanceBreakdown,
      payrollSummary,
      departmentDistribution,
      recentHires,
      dailyAttendance,
    };

    setCachedData(cacheKey, responsePayload, 30_000);

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error("HR Summary Error:", error);
    return NextResponse.json({ error: safeInternalErrorMessage() }, { status: 500 });
  }
}
