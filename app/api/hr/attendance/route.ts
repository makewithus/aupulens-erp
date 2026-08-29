import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Attendance from "@/models/Attendance";
import Employee from "@/models/Employee";
import "@/models/Department";

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

    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const employeeId = searchParams.get("employeeId");
    // Accepts either a "YYYY-MM" combined string (from an <input type="month">)
    // or separate `month`(1-12)/`year` params.
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    const search = searchParams.get("search")?.trim();

    const query: any = { tenantId };

    if (employeeId) query.employeeId = employeeId;

    let month: number | null = null;
    let year: number | null = null;
    if (monthParam && monthParam.includes("-")) {
      const [y, m] = monthParam.split("-");
      year = parseInt(y);
      month = parseInt(m);
    } else if (monthParam && yearParam) {
      month = parseInt(monthParam);
      year = parseInt(yearParam);
    }

    if (date) {
      const d = new Date(date);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      query.date = { $gte: start, $lt: end };
    } else if (month && year) {
      const m = month - 1;
      const start = new Date(year, m, 1);
      const end = new Date(year, m + 1, 1);
      query.date = { $gte: start, $lt: end };
    }

    if (search) {
      const employeeIds = await Employee.find({
        tenantId,
        $or: [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { employeeCode: { $regex: search, $options: "i" } },
        ],
      }).distinct("_id");
      query.employeeId = employeeId ? employeeId : { $in: employeeIds };
    }

    const baseQuery = Attendance.find(query)
      .populate({
        path: "employeeId",
        select: "firstName lastName employeeCode departmentId designation",
        populate: { path: "departmentId", select: "name code" },
      })
      .sort({ date: -1 });

    // Stats (summary cards) reflect every record within the applied
    // date/month/employee filter — unaffected by pagination, so they don't
    // undercount once the table itself is paginated.
    const [statsPresent, statsAbsent, statsOnLeave, statsLocked] = await Promise.all([
      Attendance.countDocuments({ ...query, status: "present" }),
      Attendance.countDocuments({ ...query, status: "absent" }),
      Attendance.countDocuments({ ...query, status: "on-leave" }),
      Attendance.countDocuments({ ...query, isLocked: true }),
    ]);
    const stats = { present: statsPresent, absent: statsAbsent, onLeave: statsOnLeave, locked: statsLocked };

    // Pagination is opt-in via `page` — no other consumer of this route
    // exists today, but omitting `page` still returns everything to stay
    // consistent with every other list API in this codebase.
    const pageParam = searchParams.get("page");
    if (!pageParam) {
      const attendance = await baseQuery.lean();
      return NextResponse.json({ items: attendance, total: attendance.length, page: 1, totalPages: 1, stats });
    }

    const page = Math.max(1, parseInt(pageParam));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25")));
    const skip = (page - 1) * limit;

    const [total, attendance] = await Promise.all([
      Attendance.countDocuments(query),
      baseQuery.skip(skip).limit(limit).lean(),
    ]);

    return NextResponse.json({ items: attendance, total, page, totalPages: Math.max(1, Math.ceil(total / limit)), stats });
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

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
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
