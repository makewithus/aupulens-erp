import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Employee from "@/models/Employee";
import Payroll from "@/models/Payroll";
import Attendance from "@/models/Attendance";
import LeaveRequest from "@/models/LeaveRequest";
import Department from "@/models/Department";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 },
      );
    }

    await connectDB();

    const data = await fetchHRData(tenantId);
    const response = await generateResponse(message, data);

    return NextResponse.json({ response });
  } catch (error) {
    console.error("HR AI Error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 },
    );
  }
}

async function fetchHRData(tenantId: string) {
  const [employees, departments, pendingLeaves, recentPayroll] =
    await Promise.all([
      Employee.find({ tenantId }).lean(),
      Department.find({ tenantId }).lean(),
      LeaveRequest.find({ tenantId, status: "pending" }).lean(),
      Payroll.find({ tenantId }).sort({ createdAt: -1 }).limit(3).lean(),
    ]);

  const activeEmployees = employees.filter(
    (e) => e.lifecycleStatus === "active",
  );
  const deptDistribution: Record<string, number> = {};
  activeEmployees.forEach((e: any) => {
    const dept = e.departmentId?.toString() || "Unassigned";
    deptDistribution[dept] = (deptDistribution[dept] || 0) + 1;
  });

  const totalSalaryBill = activeEmployees.reduce(
    (sum, e: any) => sum + (e.salary?.grossSalary || 0),
    0,
  );

  return {
    summary: {
      totalEmployees: employees.length,
      activeEmployees: activeEmployees.length,
      departments: departments.length,
      pendingLeaves: pendingLeaves.length,
      totalMonthlySalaryBill: totalSalaryBill,
    },
    recentPayroll: recentPayroll.map((p: any) => ({
      code: p.payrollCode,
      period: `${p.payrollPeriod?.month}/${p.payrollPeriod?.year}`,
      status: p.status,
      totalNet: p.totals?.totalNet || 0,
    })),
    lifecycleBreakdown: employees.reduce(
      (acc: Record<string, number>, e: any) => {
        acc[e.lifecycleStatus] = (acc[e.lifecycleStatus] || 0) + 1;
        return acc;
      },
      {},
    ),
  };
}

async function generateResponse(message: string, data: any): Promise<string> {
  const lower = message.toLowerCase();

  if (lower.includes("payroll") || lower.includes("salary")) {
    let response = `Payroll Summary:\n\n• Monthly Salary Bill: ₹${(data.summary.totalMonthlySalaryBill || 0).toLocaleString()}\n• Active Employees: ${data.summary.activeEmployees}`;

    if (data.recentPayroll.length > 0) {
      response += `\n\nRecent Payrolls:\n${data.recentPayroll
        .map(
          (p: any) =>
            `• ${p.code} (${p.period}) — Status: ${p.status}, Net: ₹${(p.totalNet || 0).toLocaleString()}`,
        )
        .join("\n")}`;
    }
    return response;
  }

  if (lower.includes("leave") || lower.includes("absence")) {
    return `Leave Management:\n\n• Pending Leave Requests: ${data.summary.pendingLeaves}\n• Active Employees: ${data.summary.activeEmployees}`;
  }

  if (lower.includes("department")) {
    return `Department Overview:\n\n• Total Departments: ${data.summary.departments}\n• Active Employees: ${data.summary.activeEmployees}`;
  }

  // Default overview
  let response = `HR Overview:\n\n• Total Employees: ${data.summary.totalEmployees}\n• Active Employees: ${data.summary.activeEmployees}\n• Departments: ${data.summary.departments}\n• Pending Leave Requests: ${data.summary.pendingLeaves}\n• Monthly Salary Bill: ₹${(data.summary.totalMonthlySalaryBill || 0).toLocaleString()}`;

  if (data.lifecycleBreakdown) {
    response += `\n\nEmployee Lifecycle:\n${Object.entries(data.lifecycleBreakdown)
      .map(([status, count]) => `• ${status}: ${count}`)
      .join("\n")}`;
  }

  return response;
}
