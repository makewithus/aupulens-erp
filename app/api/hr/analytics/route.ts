import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId, getEffectiveTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Employee from "@/models/hr/Employee";
import Department from "@/models/hr/Department";
import Attendance from "@/models/hr/Attendance";
import LeaveRequest from "@/models/hr/LeaveRequest";
import PerformanceReview from "@/models/hr/PerformanceReview";
import { PAYROLL_STATUS } from "@/lib/constants/statuses";
import Payroll from "@/models/hr/Payroll";
import { currentEmployeeFilter, onboardingEmployeeFilter } from "@/lib/hr/employeeLifecycle";
import { getCachedData, setCachedData } from "@/lib/api/serverCache";
import { applyDemoScope, getDemoCacheSegment } from "@/lib/auth/scopeFilter";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = getEffectiveTenantId(session);

    const isFresh = req.nextUrl.searchParams.get("fresh") === "true";
    const requestedRange = req.nextUrl.searchParams.get("range") || "30d";
    const range = requestedRange.toUpperCase();
    const cacheKey = `hr-analytics-live:${tenantId}:${range}:${getDemoCacheSegment(session)}`;

    if (!isFresh) {
      const cached = getCachedData<any>(cacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    await connectDB();

    const rangeDays = range === "1Y" ? 365 : range === "90D" ? 90 : 30;
    const now = new Date();
    const rangeStartDate = new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000);
    const tenantMatch = { tenantId };
    const employeeTenantMatch = applyDemoScope(session, tenantMatch);

    // Empty workspaces are common during onboarding. Avoid launching the full
    // set of grouping/bucketing aggregations when there are no HR records at
    // all; indexed existence checks return as soon as they find one document.
    const employeeExists = await Employee.exists(employeeTenantMatch);
    if (!employeeExists) {
      const [departmentExists, attendanceExists, payrollExists, leaveExists, reviewExists] = await Promise.all([
        Department.exists({ tenantId }),
        Attendance.exists(tenantMatch),
        Payroll.exists(tenantMatch),
        LeaveRequest.exists(tenantMatch),
        PerformanceReview.exists(tenantMatch),
      ]);
      if (!departmentExists && !attendanceExists && !payrollExists && !leaveExists && !reviewExists) {
        const emptyPayload = {
          kpis: {
            totalHeadcount: 0,
            activeHeadcount: 0,
            onboardingCount: 0,
            periodExitRate: 0,
            attendanceCompliance: 0,
            avgTenureYears: 0,
            monthlyGrossPayroll: 0,
            openRequisitions: null,
            totalDepartments: 0,
          },
          headcountTrajectory: [],
          departmentDistribution: [],
          attendanceTrends: [],
          leaveTypeDistribution: [],
          payrollAllocation: [],
          tenureDistribution: [],
          performanceDistribution: [],
        };
        setCachedData(cacheKey, emptyPayload, 30_000);
        return NextResponse.json(emptyPayload);
      }
    }

    // 1. Live Core Aggregations from Database
    const [
      activeEmployees,
      onboardingEmployees,
      exitedEmployees,
      totalDepartments,
      deptsList,
      empDeptCountsRaw,
      trajectoryRaw,
      exitTrajectoryRaw,
      tenureRaw,
      avgTenureRaw,
      payrollAggRaw,
      leaveTypeRaw,
      perfAggRaw,
      attendanceAggRaw,
    ] = await Promise.all([
      // Active count
      Employee.countDocuments(applyDemoScope(session, currentEmployeeFilter(tenantId))),

      // Onboarding count
      Employee.countDocuments(applyDemoScope(session, onboardingEmployeeFilter(tenantId))),

      // Exited count (for turnover calculation)
      Employee.countDocuments({
        ...employeeTenantMatch,
        lifecycleStatus: "exited",
        $or: [
          { "exitDetails.lastWorkingDate": { $gte: rangeStartDate, $lte: now } },
          { "exitDetails.lastWorkingDate": null, "exitDetails.resignationDate": { $gte: rangeStartDate, $lte: now } },
        ],
      }),

      // Departments count
      Department.countDocuments({ tenantId, isActive: { $ne: false } }),

      // Authoritative Department Master List (preserving zero-staff departments)
      Department.find({ tenantId }).select("_id name code isActive").sort({ name: 1 }).lean(),

      // Employee counts grouped by departmentId
      Employee.aggregate([
        { $match: applyDemoScope(session, currentEmployeeFilter(tenantId)) },
        {
          $group: {
            _id: "$departmentId",
            count: { $sum: 1 },
          },
        },
      ]),

      // Trajectory: Group employees by dateOfJoining month
      Employee.aggregate([
        { $match: { ...employeeTenantMatch, dateOfJoining: { $gte: rangeStartDate, $lte: now } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$dateOfJoining" } },
            hires: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Actual exits by month. A resignation date is used only when no last
      // working date has been recorded.
      Employee.aggregate([
        { $match: { ...employeeTenantMatch, lifecycleStatus: "exited" } },
        {
          $project: {
            exitDate: { $ifNull: ["$exitDetails.lastWorkingDate", "$exitDetails.resignationDate"] },
          },
        },
        { $match: { exitDate: { $gte: rangeStartDate, $lte: now } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m", date: "$exitDate" } },
            exits: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Tenure Cohorts: Calculated tenure from dateOfJoining to now
      Employee.aggregate([
        {
          $match: {
            ...employeeTenantMatch,
            dateOfJoining: { $ne: null },
            $or: currentEmployeeFilter(tenantId).$or,
          },
        },
        {
          $project: {
            tenureYears: {
              $divide: [
                { $subtract: [new Date(), "$dateOfJoining"] },
                1000 * 60 * 60 * 24 * 365.25,
              ],
            },
          },
        },
        {
          $bucket: {
            groupBy: "$tenureYears",
            boundaries: [0, 1, 2, 5, 100],
            default: "Other",
            output: { count: { $sum: 1 } },
          },
        },
      ]),

      // Calculate average tenure directly from active employees, not from
      // the midpoint of broad tenure buckets.
      Employee.aggregate([
        {
          $match: {
            ...employeeTenantMatch,
            dateOfJoining: { $ne: null },
            $or: currentEmployeeFilter(tenantId).$or,
          },
        },
        {
          $project: {
            tenureYears: {
              $divide: [{ $subtract: [new Date(), "$dateOfJoining"] }, 1000 * 60 * 60 * 24 * 365.25],
            },
          },
        },
        { $group: { _id: null, averageYears: { $avg: "$tenureYears" } } },
      ]),

      // Payroll outflow is based on actually disbursed payroll runs, not
      // employee salary configuration or draft payroll calculations.
      Payroll.aggregate([
        {
          $match: {
            ...tenantMatch,
            status: { $in: [PAYROLL_STATUS.DISBURSED, PAYROLL_STATUS.POSTED_TO_GL] },
            disbursedAt: { $gte: rangeStartDate, $lte: now },
          },
        },
        { $unwind: "$lineItems" },
        {
          $group: {
            _id: null,
            totalBasic: { $sum: "$lineItems.basic" },
            totalHra: { $sum: "$lineItems.hra" },
            totalDa: { $sum: "$lineItems.da" },
            totalSpecial: { $sum: "$lineItems.specialAllowance" },
            totalGross: { $sum: "$lineItems.grossSalary" },
            totalNet: { $sum: "$lineItems.netSalary" },
            totalPf: { $sum: "$lineItems.deductions.pf" },
            totalEsi: { $sum: "$lineItems.deductions.esi" },
            totalTds: { $sum: "$lineItems.deductions.tds" },
          },
        },
      ]),

      // Leave Requests by type
      LeaveRequest.aggregate([
        {
          $match: {
            ...tenantMatch,
            status: "approved",
            startDate: { $lte: now },
            endDate: { $gte: rangeStartDate },
          },
        },
        {
          $group: {
            _id: "$leaveType",
            count: { $sum: 1 },
          },
        },
      ]),

      // Performance Reviews by rating (strict tenant isolation)
      PerformanceReview.aggregate([
        { $match: { ...tenantMatch, createdAt: { $gte: rangeStartDate, $lte: now } } },
        {
          $group: {
            _id: "$rating",
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Attendance grouped by actual weekday and status within selected period.
      Attendance.aggregate([
        { $match: { ...tenantMatch, date: { $gte: rangeStartDate, $lte: now } } },
        {
          $group: {
            _id: { $dayOfWeek: "$date" },
            total: { $sum: 1 },
            present: { $sum: { $cond: [{ $eq: ["$status", "present"] }, 1, 0] } },
            onLeave: { $sum: { $cond: [{ $eq: ["$status", "on-leave"] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const headcount = activeEmployees;
    const activeHeadcount = activeEmployees;

    // 2. Reconcile the trajectory to actual hires and recorded exits.
    const hiresByMonth = new Map<string, number>(trajectoryRaw.map((row: any) => [String(row._id), Number(row.hires) || 0]));
    const exitsByMonth = new Map<string, number>(exitTrajectoryRaw.map((row: any) => [String(row._id), Number(row.exits) || 0]));
    const monthKeys: string[] = [];
    const monthCursor = new Date(Date.UTC(rangeStartDate.getUTCFullYear(), rangeStartDate.getUTCMonth(), 1));
    const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    while (monthCursor <= lastMonth) {
      monthKeys.push(`${monthCursor.getUTCFullYear()}-${String(monthCursor.getUTCMonth() + 1).padStart(2, "0")}`);
      monthCursor.setUTCMonth(monthCursor.getUTCMonth() + 1);
    }
    const periodNetChange = monthKeys.reduce(
      (sum, month) => sum + (hiresByMonth.get(month) || 0) - (exitsByMonth.get(month) || 0),
      0,
    );
    let runningTotal = Math.max(0, activeHeadcount - periodNetChange);
    const hasTrajectoryRecords = trajectoryRaw.length > 0 || exitTrajectoryRaw.length > 0;
    const headcountTrajectory = hasTrajectoryRecords ? monthKeys.map((monthKey) => {
      const hires = hiresByMonth.get(monthKey) || 0;
      const exits = exitsByMonth.get(monthKey) || 0;
      runningTotal = Math.max(0, runningTotal + hires - exits);
      const [year, month] = monthKey.split("-").map(Number);
      const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
      return { month: monthLabel, headcount: runningTotal, hires, exits };
    }) : [];

    // 3. Dynamic Department Staffing Density from Authoritative Department Master
    const empCountByDeptId: Record<string, number> = {};
    for (const ec of empDeptCountsRaw) {
      empCountByDeptId[ec._id ? String(ec._id) : "unassigned"] = ec.count;
    }

    const deptColors = ["#3b82f6", "#8b5cf6", "#10b981", "#06b6d4", "#f59e0b", "#ec4899", "#6366f1", "#64748b"];
    const departmentDistribution = deptsList.map((d: any, idx: number) => {
      const count = empCountByDeptId[String(d._id)] || 0;
      const pct = headcount > 0 ? Math.round((count / headcount) * 100) : 0;
      return {
        _id: String(d._id),
        name: d.name || "General Operations",
        code: d.code,
        isActive: d.isActive !== false,
        count,
        value: pct,
        color: deptColors[idx % deptColors.length],
      };
    });
    const unassignedCount = empCountByDeptId.unassigned || 0;
    if (unassignedCount > 0) {
      const pct = headcount > 0 ? Math.round((unassignedCount / headcount) * 100) : 0;
      departmentDistribution.push({ _id: "unassigned", name: "Unassigned", code: "", isActive: true, count: unassignedCount, value: pct, color: deptColors[deptColors.length - 1] });
    }

    // 4. Dynamic Tenure Distribution
    const tenureLabels: Record<string, string> = {
      "0": "< 1 Year",
      "1": "1 - 2 Years",
      "2": "2 - 5 Years",
      "5": "5+ Years",
    };
    const tenureDistribution = tenureRaw.map((t: any) => {
      const cohortKey = String(t._id);
      const cohortName = tenureLabels[cohortKey] || `${cohortKey}+ Years`;
      const pct = headcount > 0 ? Math.round((t.count / headcount) * 100) : 0;
      return {
        cohort: cohortName,
        count: t.count,
        percentage: pct,
      };
    });

    // 5. Dynamic Payroll Allocation
    const payrollAgg = payrollAggRaw[0] || {};
    const baseFixed = Number(payrollAgg.totalBasic) || 0;
    const allowances = (Number(payrollAgg.totalHra) || 0) + (Number(payrollAgg.totalDa) || 0) + (Number(payrollAgg.totalSpecial) || 0);
    const grossPayroll = Number(payrollAgg.totalGross) || 0;

    const payrollAllocation = grossPayroll > 0 ? [
      {
        component: "Base Fixed Salaries",
        amount: baseFixed,
        percentage: Math.round((baseFixed / grossPayroll) * 100),
      },
      {
        component: "Allowances & Incentives (HRA/DA)",
        amount: allowances,
        percentage: Math.round((allowances / grossPayroll) * 100),
      },
    ] : [];

    // 6. Dynamic Weekly Attendance Trends
    const totalAttLogs = attendanceAggRaw.reduce((sum: number, day: any) => sum + day.total, 0);
    const presentCount = attendanceAggRaw.reduce((sum: number, day: any) => sum + day.present, 0);
    const attendanceCompliance = totalAttLogs > 0 ? Number(((presentCount / totalAttLogs) * 100).toFixed(1)) : 0;
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const attendanceTrends = attendanceAggRaw.map((day: any) => ({
      day: dayNames[day._id - 1],
      present: day.total > 0 ? Number(((day.present / day.total) * 100).toFixed(1)) : 0,
      onLeave: day.total > 0 ? Number(((day.onLeave / day.total) * 100).toFixed(1)) : 0,
      rate: day.total > 0 ? Number(((day.present / day.total) * 100).toFixed(1)) : 0,
      count: day.total,
    }));

    // 7. Dynamic Leave Type Distribution
    const leaveColors: Record<string, string> = {
      casual: "#10b981",
      sick: "#f59e0b",
      earned: "#3b82f6",
      unpaid: "#ef4444",
      maternity: "#ec4899",
      paternity: "#8b5cf6",
    };
    const totalLeaves = leaveTypeRaw.reduce((sum: number, l: any) => sum + (l.count || 0), 0);
    const leaveTypeDistribution = totalLeaves > 0
      ? leaveTypeRaw.map((l: any) => {
          const key = String(l._id || "casual").toLowerCase();
          const name = key.charAt(0).toUpperCase() + key.slice(1) + " Leave";
          return {
            name,
            value: Math.round((l.count / totalLeaves) * 100),
            count: l.count,
            color: leaveColors[key] || "#3b82f6",
          };
        })
      : [];

    // 8. Dynamic Performance Reviews Bell Curve (SYS-36)
    const perfTotal = perfAggRaw.reduce((sum: number, p: any) => sum + (p.count || 0), 0);
    const perfDistributionMap: Record<string, { label: string; color: string; count: number }> = {
      "1": { label: "Needs Coaching", color: "#ef4444", count: 0 },
      "2": { label: "Developing", color: "#f59e0b", count: 0 },
      "3": { label: "Meets Expectations", color: "#3b82f6", count: 0 },
      "4": { label: "Exceeds Expectations", color: "#10b981", count: 0 },
      "5": { label: "Outstanding Leader", color: "#8b5cf6", count: 0 },
      other: { label: "Other / Unmapped", color: "#64748b", count: 0 },
    };

    for (const p of perfAggRaw) {
      const key = String(p._id);
      if (perfDistributionMap[key]) {
        perfDistributionMap[key].count = p.count;
      } else {
        perfDistributionMap.other.count += p.count;
      }
    }

    const performanceDistribution = perfTotal > 0 ? Object.values(perfDistributionMap).map((item) => ({
      rating: item.label,
      count: item.count,
      percentage: perfTotal > 0 ? Math.round((item.count / perfTotal) * 100) : 0,
      color: item.color,
    })) : [];

    // Turnover Rate
    const turnoverDenominator = activeHeadcount + exitedEmployees;
    const turnoverRate = turnoverDenominator > 0 ? Number(((exitedEmployees / turnoverDenominator) * 100).toFixed(1)) : 0;

    const avgTenureYears = Number(Number(avgTenureRaw[0]?.averageYears || 0).toFixed(1));

    const resolvedDepartmentCount = Math.max(totalDepartments, deptsList.length);

    const responsePayload = {
      kpis: {
        totalHeadcount: headcount,
        activeHeadcount,
        onboardingCount: onboardingEmployees,
        periodExitRate: turnoverRate,
        attendanceCompliance,
        avgTenureYears,
        monthlyGrossPayroll: grossPayroll,
        openRequisitions: null,
        totalDepartments: resolvedDepartmentCount,
      },
      headcountTrajectory,
      departmentDistribution,
      attendanceTrends,
      leaveTypeDistribution,
      payrollAllocation,
      tenureDistribution,
      performanceDistribution,
    };

    // Store in server cache with 5s freshness
    // Analytics are expensive to aggregate and explicit Live Sync bypasses
    // this cache, so keep routine page loads responsive between syncs.
    setCachedData(cacheKey, responsePayload, 30_000);

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error("Error in live HR analytics API:", error);
    return NextResponse.json(
      { error: "Failed to generate dynamic HR analytics", details: safeInternalErrorMessage() },
      { status: 500 }
    );
  }
}
