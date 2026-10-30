import { stripProtectedFields } from "@/lib/api/validateId";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Attendance from "@/models/hr/Attendance";
import Employee from "@/models/hr/Employee";
import "@/models/hr/Department";
import { validateObjectId, handleRouteError } from "@/lib/api/validateId";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const attendance = await Attendance.findOne({ _id: id, tenantId })
      .populate("employeeId", "firstName lastName employeeCode departmentId designation")
      .lean();

    if (!attendance) {
      return NextResponse.json(
        { error: "Attendance record not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ item: attendance });
  } catch (error: any) {
    return handleRouteError(error);
  }
}

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
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = stripProtectedFields(await req.json());
    await connectDB();


const attendance = await Attendance.findOne({ _id: id, tenantId });
    if (!attendance) {
      return NextResponse.json(
        { error: "Attendance record not found" },
        { status: 404 },
      );
    }

    if (attendance.isLocked) {
      return NextResponse.json(
        { error: "This attendance record is locked and cannot be modified" },
        { status: 400 },
      );
    }

    if (body.status && !["present", "absent", "half-day", "on-leave", "holiday", "week-off"].includes(body.status)) {
      return NextResponse.json({ error: "Choose a valid attendance status." }, { status: 400 });
    }
    if (body.employeeId) {
      const employee = await Employee.findOne({ _id: body.employeeId, tenantId }).select("_id").lean();
      if (!employee) return NextResponse.json({ error: "Employee not found in this organization." }, { status: 404 });
    }

    // Strip empty leaveType to avoid enum validation error
    if (!body.leaveType) delete body.leaveType;
    if (body.status !== "on-leave") delete body.leaveType;

    // Recalculate hours if check in/out provided
    const checkInValue = body.checkIn ?? attendance.checkIn;
    const checkOutValue = body.checkOut ?? attendance.checkOut;
    if (checkInValue && checkOutValue) {
      const checkIn = new Date(checkInValue);
      const checkOut = new Date(checkOutValue);
      if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime()) || checkOut < checkIn) {
        return NextResponse.json({ error: "Check-out time must be after check-in time." }, { status: 400 });
      }
      body.hoursWorked =
        Math.round(
          ((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60)) * 100,
        ) / 100;
      body.overtime = Math.max(0, body.hoursWorked - 8);
    }

    Object.assign(attendance, body);
    if (body.status !== "on-leave") attendance.leaveType = undefined;
    await attendance.save();

    return NextResponse.json({ success: true, attendance });

  } catch (error: any) {
    return handleRouteError(error);
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
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();


const attendance = await Attendance.findOne({ _id: id, tenantId });
    if (!attendance) {
      return NextResponse.json(
        { error: "Attendance record not found" },
        { status: 404 },
      );
    }

    if (attendance.isLocked) {
      return NextResponse.json(
        { error: "Locked attendance records cannot be deleted" },
        { status: 400 },
      );
    }

    await Attendance.findOneAndDelete({ _id: id, tenantId });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    return handleRouteError(error);
  }
}
