import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Employee from "@/models/hr/Employee";
import Department from "@/models/hr/Department";
import Payroll from "@/models/hr/Payroll";
import LeaveRequest from "@/models/hr/LeaveRequest";
import Attendance from "@/models/hr/Attendance";

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

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get employee counts
    const [
      totalEmployees,
      activeEmployees,
      onboardingEmployees,
      exitedEmployees,
      totalDepartments,
      pendingLeaves,
      currentMonthPayrolls,
      recentHires,
    ] = await Promise.all([
      Employee.countDocuments({ tenantId }),
      Employee.countDocuments({ tenantId, lifecycleStatus: "active" }),
      Employee.countDocuments({ tenantId, lifecycleStatus: "onboarding" }),
      Employee.countDocuments({
        tenantId,
        lifecycleStatus: "exited",
        updatedAt: { $gte: thirtyDaysAgo },
      }),
      Department.countDocuments({ tenantId, isActive: true }),
      LeaveRequest.countDocuments({ tenantId, status: "pending" }),
      Payroll.find({
        tenantId,
        "payrollPeriod.month": now.getMonth() + 1,
        "payrollPeriod.year": now.getFullYear(),
      }).lean(),
      Employee.find({
        tenantId,
        dateOfJoining: { $gte: thirtyDaysAgo },
      })
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
          tenantId,
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

    // Payroll summary
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
      : { totalGross: 0, totalNet: 0, status: "not_started" };

    // Department-wise employee distribution
    const departmentDistribution = await Employee.aggregate([
      { $match: { tenantId, lifecycleStatus: "active" } },
      {
        $group: {
          _id: "$departmentId",
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "departments",
          localField: "_id",
          foreignField: "_id",
          as: "department",
        },
      },
      { $unwind: { path: "$department", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          departmentName: { $ifNull: ["$department.name", "Unassigned"] },
          count: 1,
        },
      },
      { $sort: { count: -1 } },
    ]);

    return NextResponse.json({
      stats: {
        totalEmployees,
        activeEmployees,
        onboardingEmployees,
        exitedLast30Days: exitedEmployees,
        totalDepartments,
        pendingLeaves,
      },
      todayAttendance: attendanceBreakdown,
      payrollSummary,
      departmentDistribution,
      recentHires,
    });
  } catch (error: any) {
    console.error("HR Summary Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
