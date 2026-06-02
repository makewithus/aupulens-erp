import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
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
    const date = searchParams.get("date");
    const employeeId = searchParams.get("employeeId");
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    const query: any = { tenantId };

    if (employeeId) query.employeeId = employeeId;

    if (date) {
      const d = new Date(date);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      query.date = { $gte: start, $lt: end };
    } else if (month && year) {
      const m = parseInt(month) - 1;
      const y = parseInt(year);
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 1);
      query.date = { $gte: start, $lt: end };
    }

    const attendance = await Attendance.find(query)
      .populate({
        path: "employeeId",
        select: "firstName lastName employeeCode departmentId designation",
        populate: { path: "departmentId", select: "name code" },
      })
      .sort({ date: -1 })
      .lean();

    return NextResponse.json({ items: attendance });
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

    if (!body.employeeId || !body.date || !body.status) {
      return NextResponse.json(
        { error: "Employee, date, and status are required" },
        { status: 400 },
      );
    }

    // Strip empty leaveType to avoid enum validation error
    if (!body.leaveType) delete body.leaveType;
    if (body.status !== "on-leave") delete body.leaveType;

    // Calculate hours worked if check-in and check-out are provided
    if (body.checkIn && body.checkOut) {
      const checkIn = new Date(body.checkIn);
      const checkOut = new Date(body.checkOut);
      body.hoursWorked = Math.round(
        ((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60)) * 100,
      ) / 100;
      // Overtime is anything beyond 8 hours
      body.overtime = Math.max(0, body.hoursWorked - 8);
    }

    // Check for existing attendance for same employee on same date
    const d = new Date(body.date);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const existing = await Attendance.findOne({
      tenantId,
      employeeId: body.employeeId,
      date: { $gte: start, $lt: end },
    });

    if (existing) {
      if (existing.isLocked) {
        return NextResponse.json(
          { error: "Attendance for this date is locked and cannot be modified" },
          { status: 400 },
        );
      }
      // Update existing record
      Object.assign(existing, body);
      if (body.status !== "on-leave") existing.leaveType = undefined;
      await existing.save();
      return NextResponse.json({ success: true, attendance: existing });
    }

    const attendance = new Attendance({
      ...body,
      tenantId,
      createdBy: session.user.id,
    });

    await attendance.save();

    return NextResponse.json(
      { success: true, attendance },
      { status: 201 },
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
