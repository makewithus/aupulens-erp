import { stripProtectedFields } from "@/lib/api/validateId";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Warehouse from "@/models/inventory/Warehouse";
import { getCachedData, setCachedData, invalidateCache } from "@/lib/api/serverCache";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const allowedRoles = ["admin", "inventory", "sales"];
    if (!session || !allowedRoles.includes(session.user?.role || "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search")?.trim() || "";

    const cacheKey = `inv-warehouses:${tenantId}:${status}:${search}`;
    const cached = getCachedData<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    await connectDB();

    const query: any = { tenantId };
    if (status && status !== "all") query.status = status;
    if (search) {
      const words = search.trim().split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const re = { $regex: words.join(".*"), $options: "i" };
      query.$or = [{ name: re }, { warehouseCode: re }];
    }

    const warehouses = await Warehouse.find(query)
      .sort({ createdAt: -1 })
      .lean();

    const payload = { warehouses };
    setCachedData(cacheKey, payload, 20_000);
    return NextResponse.json(payload);
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

const body = stripProtectedFields(await req.json());

    const warehouse = await Warehouse.create({
      ...body,
      createdBy: session.user.id,
      tenantId,
    });

    invalidateCache(`inv-warehouses:${tenantId}`);
    return NextResponse.json({ warehouse }, { status: 201 });

  } catch (error: any) {
    if (error?.code === 11000) return NextResponse.json({ error: "That warehouse code is already in use." }, { status: 409 });
    if (error?.name === "ValidationError") return NextResponse.json({ error: Object.values(error.errors).map((e: any) => e.message).join(" ") }, { status: 400 });
    console.error("Error creating warehouse:", error);
    return NextResponse.json(
      { error: "Failed to create warehouse" },
      { status: 500 },
    );
  }
}
