import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Department from "@/models/Department";
import Employee from "@/models/Employee";

// Default departments matching existing CRM modules
const DEFAULT_DEPARTMENTS = [
  { name: "Finance", code: "FIN", description: "Finance & Accounting department", costCenter: "CC-FIN" },
  { name: "Sales", code: "SALES", description: "Sales & Revenue department", costCenter: "CC-SALES" },
  { name: "Human Resources", code: "HR", description: "Human Resources & Payroll department", costCenter: "CC-HR" },
  { name: "Administration", code: "ADMIN", description: "Administration & Management department", costCenter: "CC-ADMIN" },
  { name: "Inventory", code: "INV", description: "Inventory & Warehouse management department", costCenter: "CC-INV" },
  { name: "Manufacturing", code: "MFG", description: "Manufacturing & Production department", costCenter: "CC-MFG" },
  { name: "Projects", code: "PROJ", description: "Project management department", costCenter: "CC-PROJ" },
];

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

    // Seed default departments if none exist for this tenant
    const count = await Department.countDocuments({ tenantId });
    if (count === 0) {
      const defaults = DEFAULT_DEPARTMENTS.map((dept) => ({
        ...dept,
        tenantId,
        isActive: true,
        createdBy: session.user.id,
      }));
      await Department.insertMany(defaults);
    }

    const departments = await Department.find({ tenantId })
      .populate("headOfDepartment", "firstName lastName employeeCode")
      .populate("parentDepartmentId", "name code")
      .sort({ name: 1 })
      .lean();

    // Add employee count per department
    const deptIds = departments.map((d: any) => d._id);
    const employeeCounts = await Employee.aggregate([
      { $match: { tenantId, departmentId: { $in: deptIds }, lifecycleStatus: { $ne: "exited" } } },
      { $group: { _id: "$departmentId", count: { $sum: 1 } } },
    ]);
    const countMap: Record<string, number> = {};
    employeeCounts.forEach((ec: any) => {
      countMap[ec._id.toString()] = ec.count;
    });
    const enriched = departments.map((d: any) => ({
      ...d,
      employeeCount: countMap[d._id.toString()] || 0,
    }));

    return NextResponse.json({ items: enriched });
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

    if (!body.name || !body.code) {
      return NextResponse.json(
        { error: "Name and code are required" },
        { status: 400 },
      );
    }

    const existing = await Department.findOne({ tenantId, code: body.code });
    if (existing) {
      return NextResponse.json(
        { error: "Department with this code already exists" },
        { status: 409 },
      );
    }

    const department = new Department({
      ...body,
      tenantId,
      createdBy: session.user.id,
    });

    await department.save();

    return NextResponse.json(
      { success: true, department },
      { status: 201 },
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
