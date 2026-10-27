import { stripProtectedFields } from "@/lib/api/validateId";
import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Warehouse from "@/models/inventory/Warehouse";
import { validateObjectId, handleRouteError } from "@/lib/api/validateId";

export async function GET(
  request: Request,
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
    const warehouse = await Warehouse.findOne({ _id: id, tenantId }).lean();
    if (!warehouse)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ warehouse });
  } catch (e) {
    return handleRouteError(e);
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
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = stripProtectedFields(await request.json()); // Fixed req -> request

    for (const key of ["_id", "tenantId", "createdBy", "createdAt", "updatedAt"]) delete body[key];

    await connectDB();


const warehouse = await Warehouse.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: body },
      { new: true, runValidators: true },
    );

    if (!warehouse) {
      console.error(`Warehouse [${id}] not found in DB.`);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ warehouse });

  } catch (e: any) {
    if (e?.code === 11000) return NextResponse.json({ error: "That warehouse code is already in use." }, { status: 409 });
    if (e?.name === "ValidationError") return NextResponse.json({ error: Object.values(e.errors).map((v: any) => v.message).join(" ") }, { status: 400 });
    console.error("PATCH Warehouse Error:", e);
    return handleRouteError(e);
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
    const idGuard = validateObjectId(id);
    if (idGuard) return idGuard;

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    await connectDB();


const warehouse = await Warehouse.findOneAndDelete({ _id: id, tenantId });
    if (!warehouse)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ message: "Deleted" });

  } catch (e) {
    return handleRouteError(e);
  }
}
