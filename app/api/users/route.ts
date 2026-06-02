import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import bcrypt from "bcryptjs";
import connectDB from "@/lib/db";
import User from "@/models/User";
import Employee from "@/models/Employee";
import { ENTITY_STATUS } from "@/lib/constants/statuses";

export async function GET() {
  try {
    const session = await auth();

    if (
      !session ||
      !["admin", "sales", "finance", "inventory", "hr", "master-admin"].includes(
        session.user.role,
      )
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }


    const tenantId = (session.user as any).tenantId || "default-tenant";
    await connectDB();

    // Filter by tenant ID
    const users = await User.find({ tenantId })
      .select("-password")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ users }, { status: 200 });
  } catch (error: unknown) {
    console.error("Get users error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Something went wrong" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }


    const tenantId = (session.user as any).tenantId || "default-tenant";
    const {
      name,
      email,
      phone,
      password,
      role,
      department,
      employeeId,
      designation,
    } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedEmployeeId = employeeId
      ? String(employeeId).trim() || undefined
      : undefined;

    if (!name || !email || !phone || !password || !role) {
      return NextResponse.json(
        { error: "Name, email, phone, password, and role are required" },
        { status: 400 },
      );
    }

    const validRoles = [
      "admin",
      "finance",
      "hr",
      "sales",
      "inventory",
      "project",
      "manufacturing",
    ];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    await connectDB();

    // Check for existing user in the same tenant
    const existingUser = await User.findOne({
      email: normalizedEmail,
      tenantId,
    });
    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists in your organization" },
        { status: 409 },
      );
    }

    if (normalizedEmployeeId) {
      const existingEmployeeId = await User.findOne({
        employeeId: normalizedEmployeeId,
        tenantId,
      });
      if (existingEmployeeId) {
        return NextResponse.json(
          { error: "Employee ID already exists in your organization" },
          { status: 409 },
        );
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email: normalizedEmail,
      phone,
      password: hashedPassword,
      role,
      department,
      employeeId: normalizedEmployeeId,
      designation,
      status: ENTITY_STATUS.ACTIVE,
      dateOfJoining: new Date(),
      createdBy: session.user.id,
      tenantId,
    });

    // ── Auto-link to existing Employee by email ──
    const existingEmployee = await Employee.findOne({
      tenantId,
      email: normalizedEmail,
    });
    if (existingEmployee && !existingEmployee.userId) {
      await Employee.findOneAndUpdate(
        { _id: existingEmployee._id, tenantId },
        { $set: { userId: user._id } },
      );
      // Also sync employeeId back to user if not set
      if (!employeeId && existingEmployee.employeeCode) {
        await User.findOneAndUpdate(
          { _id: user._id, tenantId },
          { $set: { employeeId: existingEmployee.employeeCode } },
        );
      }
    }

    return NextResponse.json(
      {
        message: "User created successfully",
        user: {
          id: String(user._id),
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          department: user.department,
          employeeId: user.employeeId,
          designation: user.designation,
          status: user.status,
          dateOfJoining: user.dateOfJoining,
          createdAt: user.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error("Create user error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Something went wrong" },
      { status: 500 },
    );
  }
}
