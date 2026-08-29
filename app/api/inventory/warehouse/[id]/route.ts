import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Warehouse from "@/models/inventory/Warehouse";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const { id } = await params;
    await connectDB();
    const warehouse = await Warehouse.findOne({ _id: id, tenantId }).lean();
    if (!warehouse)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ warehouse });
  } catch (e) {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await request.json(); // Fixed req -> request

    console.log(`PATCH Warehouse [${id}]`, body);

    await connectDB();

    const warehouse = await Warehouse.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: body },
      { new: true },
    );

    if (!warehouse) {
      console.error(`Warehouse [${id}] not found in DB.`);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ warehouse });
  } catch (e: any) {
    console.error("PATCH Warehouse Error:", e);
    return NextResponse.json(
      { error: "Update Failed: " + e.message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();

    const warehouse = await Warehouse.findOneAndDelete({ _id: id, tenantId });
    if (!warehouse)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ message: "Deleted" });
  } catch (e) {
    return NextResponse.json({ error: "Delete Failed" }, { status: 500 });
  }
}
