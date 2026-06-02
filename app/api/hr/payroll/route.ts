import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Payroll from "@/models/Payroll";
import Employee from "@/models/Employee";
import Attendance from "@/models/Attendance";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = (session.user as any).tenantId || "default-tenant";
    await connectDB();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    const query: any = { tenantId };
    if (status) query.status = status;
    if (month) query["payrollPeriod.month"] = parseInt(month);
    if (year) query["payrollPeriod.year"] = parseInt(year);

    const payrolls = await Payroll.find(query)
      .populate("departmentId", "name code")
      .populate("approvedBy", "name")
      .populate("computedBy", "name")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ items: payrolls });
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

    const tenantId = (session.user as any).tenantId || "default-tenant";
    const body = await req.json();
    await connectDB();

    // Accept both nested { payrollPeriod: { month, year } } and flat { month, year }
    const ppMonth = body.payrollPeriod?.month || body.month;
    const ppYear = body.payrollPeriod?.year || body.year;

    if (!ppMonth || !ppYear) {
      return NextResponse.json(
        { error: "Payroll period (month and year) is required" },
        { status: 400 },
      );
    }

    const month = Number(ppMonth);
    const year = Number(ppYear);

    // Check for existing payroll for same period
    const existing = await Payroll.findOne({
      tenantId,
      "payrollPeriod.month": month,
      "payrollPeriod.year": year,
      ...(body.departmentId ? { departmentId: body.departmentId } : {}),
    });

    if (existing) {
      return NextResponse.json(
        { error: "Payroll for this period already exists" },
        { status: 409 },
      );
    }

    // Generate payroll code
    const payrollCode = `PR-${year}-${String(month).padStart(2, "0")}-${Date.now().toString(36).toUpperCase()}`;

    // Calculate period dates
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // last day of month

    // Fetch all active employees for this tenant (optionally filtered by department)
    const employeeQuery: any = { tenantId, lifecycleStatus: "active" };
    if (body.departmentId) employeeQuery.departmentId = body.departmentId;

    const employees = await Employee.find(employeeQuery).lean();

    // Build initial line items from employee salary data
    const lineItems: any[] = [];
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    for (const emp of employees) {
      const sal = emp.salary || {
        basic: 0, hra: 0, da: 0, specialAllowance: 0, grossSalary: 0,
        deductions: { pf: 0, esi: 0, professionalTax: 0, tds: 0, otherDeductions: 0 },
        netSalary: 0,
      };

      const gross = (sal.basic || 0) + (sal.hra || 0) + (sal.da || 0) + (sal.specialAllowance || 0);
      const ded: any = sal.deductions || {};
      const totalDed = (ded.pf || 0) + (ded.esi || 0) + (ded.professionalTax || 0) + (ded.tds || 0) + (ded.otherDeductions || 0);
      const net = gross - totalDed;

      lineItems.push({
        employeeId: emp._id,
        employeeCode: emp.employeeCode,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        basic: sal.basic || 0,
        hra: sal.hra || 0,
        da: sal.da || 0,
        specialAllowance: sal.specialAllowance || 0,
        grossSalary: gross,
        deductions: {
          pf: ded.pf || 0,
          esi: ded.esi || 0,
          professionalTax: ded.professionalTax || 0,
          tds: ded.tds || 0,
          otherDeductions: ded.otherDeductions || 0,
          totalDeductions: totalDed,
        },
        netSalary: net,
        daysWorked: 0,
        daysAbsent: 0,
        overtime: 0,
        overtimeAmount: 0,
        lossOfPay: 0,
      });

      totalGross += gross;
      totalDeductions += totalDed;
      totalNet += net;
    }

    const payroll = new Payroll({
      payrollCode,
      payrollPeriod: {
        month,
        year,
        startDate,
        endDate,
      },
      departmentId: body.departmentId || undefined,
      lineItems,
      totals: {
        totalGross,
        totalDeductions,
        totalNet,
        totalOvertime: 0,
        totalLOP: 0,
        currency: "INR",
      },
      tenantId,
      createdBy: session.user.id,
    });

    await payroll.save();

    return NextResponse.json(
      { success: true, payroll, employeesIncluded: employees.length },
      { status: 201 },
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
