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
import { currentEmployeeFilter, onboardingEmployeeFilter } from "@/lib/hr/employeeLifecycle";
import { getCachedData, setCachedData } from "@/lib/api/serverCache";
import { applyDemoScope, getDemoCacheSegment } from "@/lib/auth/scopeFilter";

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
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const isFresh = req.nextUrl.searchParams.get("fresh") === "true";
    const cacheKey = `hr-summary:${tenantId}:${getDemoCacheSegment(session)}`;
    if (!isFresh) {
      const cached = getCachedData<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }
    await connectDB();

    const tenantMatch = { tenantId };
    const employeeTenantMatch = applyDemoScope(session, tenantMatch);

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
      Employee.countDocuments(employeeTenantMatch),
      Employee.countDocuments(applyDemoScope(session, currentEmployeeFilter(tenantId))),
      Employee.countDocuments(applyDemoScope(session, onboardingEmployeeFilter(tenantId))),
      Employee.countDocuments({
        ...employeeTenantMatch,
        lifecycleStatus: "exited",
        $or: [
          { lastWorkingDate: { $gte: thirtyDaysAgo, $lte: now } },
          { lastWorkingDate: { $exists: false }, updatedAt: { $gte: thirtyDaysAgo, $lte: now } },
        ],
      }),
      Department.countDocuments(applyDemoScope(session, { ...tenantMatch, isActive: { $ne: false } })),
      LeaveRequest.countDocuments(applyDemoScope(session, { ...tenantMatch, status: "pending" })),
      LeaveRequest.countDocuments(applyDemoScope(session, tenantMatch)),
      LeaveRequest.countDocuments(applyDemoScope(session, { ...tenantMatch, status: "approved" })),
      LeaveRequest.countDocuments(applyDemoScope(session, { ...tenantMatch, status: "rejected" })),
      Payroll.find({
        ...applyDemoScope(session, tenantMatch),
        "payrollPeriod.month": now.getMonth() + 1,
        "payrollPeriod.year": now.getFullYear(),
      }).sort({ updatedAt: -1 }).lean(),
      Employee.find({
        ...employeeTenantMatch,
        dateOfJoining: { $gte: fourteenDaysAgo, $lte: now },
      })
        .select("firstName lastName employeeCode designation dateOfJoining lifecycleStatus departmentId")
        .populate("departmentId", "name")
        .sort({ dateOfJoining: -1 })
        .limit(5)
        .lean(),
    ]);

    // Get attendance stats for today
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const todayAttendance = await Attendance.aggregate([
      {
        $match: {
          ...applyDemoScope(session, tenantMatch),
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
      const key = item._id === "on-leave" ? "onLeave" : item._id === "half-day" ? "present" : item._id;
      attendanceBreakdown[key] = (attendanceBreakdown[key] || 0) + item.count;
    });

    // Payroll totals come from payroll runs only; salary contracts are not
    // evidence that payroll was calculated or paid for this period.
    const disbursedPayrolls = currentMonthPayrolls.filter((payroll: any) => payroll.status === "disbursed" || payroll.disbursedAt);
    const payrollSummary = disbursedPayrolls.length > 0
      ? {
          totalGross: disbursedPayrolls.reduce(
            (sum: number, p: any) => sum + (p.totals?.totalGross || 0),
            0,
          ),
          totalNet: disbursedPayrolls.reduce(
            (sum: number, p: any) => sum + (p.totals?.totalNet || 0),
            0,
          ),
          status: "disbursed",
        }
      : {
          totalGross: 0,
          totalNet: 0,
          status: currentMonthPayrolls[0]?.status || "not_started",
        };

    // Department-wise employee distribution from authoritative Department master
    const allDepartments = await Department.find(applyDemoScope(session, { ...tenantMatch, isActive: { $ne: false } })).select("_id name code isActive").sort({ name: 1 }).lean();
    const workforceCount = activeEmployees + onboardingEmployees;
    const workforceEmployeeMatch = applyDemoScope(session, {
      tenantId,
      $or: [
        ...currentEmployeeFilter(tenantId).$or,
        ...onboardingEmployeeFilter(tenantId).$or,
      ],
    });
    const empDeptCounts = await Employee.aggregate([
      { $match: workforceEmployeeMatch },
      {
        $group: {
          _id: "$departmentId",
          count: { $sum: 1 },
        },
      },
    ]);
    const empCountByDeptId: Record<string, number> = {};
    for (const ec of empDeptCounts) {
      empCountByDeptId[ec._id ? String(ec._id) : "unassigned"] = ec.count;
    }
    const departmentDistribution = allDepartments.map((dept: any) => ({
      _id: dept._id,
      name: dept.name,
      departmentName: dept.name,
      code: dept.code,
      isActive: dept.isActive !== false,
      count: empCountByDeptId[String(dept._id)] || 0,
    }));
    const assignedDepartmentCount = departmentDistribution.reduce((sum: number, dept: any) => sum + dept.count, 0);
    // Reconcile employees with missing or stale department references into the
    // Unassigned slice so the chart total matches the workforce KPI.
    const unassignedCount = Math.max(0, workforceCount - assignedDepartmentCount);
    if (unassignedCount > 0) departmentDistribution.push({ _id: "unassigned", name: "Unassigned", departmentName: "Unassigned", code: "", isActive: true, count: unassignedCount });

    // Daily shift attendance trend
    const dailyAttendanceAgg = await Attendance.aggregate([
      {
        $match: {
          ...applyDemoScope(session, { tenantId }),
          date: { $gte: thirtyDaysAgo },
          status: { $in: ["present", "half-day"] },
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
