export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Warehouse from "@/models/Warehouse";

export async function GET() {
  try {
    const session = await auth();
    const allowedRoles = ["admin", "inventory", "sales"];
    if (!session || !allowedRoles.includes(session.user?.role || "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    await connectDB();
    const warehouses = await Warehouse.find({ tenantId })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({ warehouses });
  } catch (error) {
    console.error("Error fetching warehouses:", error);
    return NextResponse.json(
      { error: "Failed to fetch warehouses" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    const allowedRoles = ["admin", "inventory", "sales"];
    if (!session || !allowedRoles.includes(session.user?.role || "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    await connectDB();
    const body = await req.json();

    const warehouse = await Warehouse.create({
      ...body,
      createdBy: session.user.id,
      tenantId,
    });

    return NextResponse.json({ warehouse }, { status: 201 });
  } catch (error) {
    console.error("Error creating warehouse:", error);
    return NextResponse.json(
      { error: "Failed to create warehouse" },
      { status: 500 },
    );
  }
}
