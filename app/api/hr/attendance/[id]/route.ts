import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Attendance from "@/models/Attendance";
import "@/models/Employee";
import "@/models/Department";

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
    const tenantId = (session.user as any).tenantId || "default-tenant";
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
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    const tenantId = (session.user as any).tenantId || "default-tenant";
    const body = await req.json();
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

    // Strip empty leaveType to avoid enum validation error
    if (!body.leaveType) delete body.leaveType;
    if (body.status !== "on-leave") delete body.leaveType;

    // Recalculate hours if check in/out provided
    if (body.checkIn && body.checkOut) {
      const checkIn = new Date(body.checkIn);
      const checkOut = new Date(body.checkOut);
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
    const tenantId = (session.user as any).tenantId || "default-tenant";
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
