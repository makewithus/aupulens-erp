import { NextRequest, NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Vendor from "@/models/admin/Vendor";
import { safeEmitEvent } from "@/lib/aiRuntime/runtime/safeEmit";

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    await connectDB();
    const vendors = await Vendor.find({
          tenantId,
        }).sort({ createdAt: -1 }).lean();

    return NextResponse.json({ vendors });
  } catch (error) {
    console.error("Fetch vendors error:", error);
    return NextResponse.json(
      { error: "Failed to fetch vendors" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await request.json();

    await connectDB();

    const vendor = await Vendor.create({
      ...body,
      tenantId,
    });

    // Additive (docs/ai/BRIEF-08a-BATCH-G.md 0.5) — never throws back into this route.
    await safeEmitEvent(tenantId, "master_data.changed", { model: "Vendor", id: String(vendor._id), tenantId });

    return NextResponse.json({ vendor });
  } catch (error) {
    console.error("Create vendor error:", error);
    return NextResponse.json(
      { error: "Failed to create vendor" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;
    const body = await request.json();
    const { _id, ...updateData } = body;

    if (!_id) {
      return NextResponse.json({ error: "Vendor ID is required" }, { status: 400 });
    }

    await connectDB();
    const vendor = await Vendor.findOneAndUpdate(
      { _id, tenantId },
      { $set: updateData },
      { new: true },
    );

    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    await safeEmitEvent(tenantId, "master_data.changed", { model: "Vendor", id: String(vendor._id), tenantId });

    return NextResponse.json({ vendor });
  } catch (error) {
    console.error("Update vendor error:", error);
    return NextResponse.json(
      { error: "Failed to update vendor" },
      { status: 500 },
    );
  }
}
