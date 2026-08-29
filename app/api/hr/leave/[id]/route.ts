import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import LeaveRequest from "@/models/hr/LeaveRequest";
import Employee from "@/models/hr/Employee";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await req.json();
    await connectDB();

    const leave = await LeaveRequest.findOne({ _id: id, tenantId });
    if (!leave) {
      return NextResponse.json(
        { error: "Leave request not found" },
        { status: 404 },
      );
    }

    // Handle approval
    if (body.status === "approved" && leave.status === "pending") {
      // Deduct from leave balance
      const employee = await Employee.findOne({ _id: leave.employeeId, tenantId });
      if (employee && leave.leaveType !== "unpaid") {
        const balanceKey =
          leave.leaveType as keyof typeof employee.leaveBalance;
        employee.leaveBalance[balanceKey] = Math.max(
          0,
          employee.leaveBalance[balanceKey] - leave.totalDays,
        );
        await employee.save();
      }

      leave.status = "approved";
      leave.approvedBy = session.user.id as any;
      leave.approvedAt = new Date();
    }

    // Handle rejection
    if (body.status === "rejected" && leave.status === "pending") {
      leave.status = "rejected";
      leave.rejectedBy = session.user.id as any;
      leave.rejectedAt = new Date();
      leave.rejectionReason = body.rejectionReason || "";
    }

    // Handle cancellation
    if (body.status === "cancelled") {
      // Restore leave balance if was approved
      if (leave.status === "approved") {
        const employee = await Employee.findOne({ _id: leave.employeeId, tenantId });
        if (employee && leave.leaveType !== "unpaid") {
          const balanceKey =
            leave.leaveType as keyof typeof employee.leaveBalance;
          employee.leaveBalance[balanceKey] += leave.totalDays;
          await employee.save();
        }
      }
      leave.status = "cancelled";
    }

    await leave.save();

    return NextResponse.json({ success: true, leave });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const leave = await LeaveRequest.findOneAndDelete({ _id: id, tenantId });
    if (!leave) {
      return NextResponse.json(
        { error: "Leave request not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
