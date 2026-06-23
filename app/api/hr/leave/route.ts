import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import LeaveRequest from "@/models/LeaveRequest";
import Employee from "@/models/Employee";

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
    const employeeId = searchParams.get("employeeId");

    const query: any = { tenantId };
    if (status) query.status = status;
    if (employeeId) query.employeeId = employeeId;

    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const skip = (page - 1) * limit;

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

    return NextResponse.json({ items: leaves, total, page, totalPages: Math.ceil(total / limit) });
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
