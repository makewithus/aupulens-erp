import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import MarketplacePackage from "@/models/MarketplacePackage";
import { installPackage } from "@/lib/marketplace/packages";

/**
 * Install a marketplace package into the CALLER's tenant (6.12). Creates fresh,
 * tenant-owned records from the package's sanitized payload — the mutation only
 * ever writes to the installing tenant, never the publisher's.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const guard = requireTenantId(session);
  if (guard) return guard;
  const adminGuard = requireAdmin(session);
  if (adminGuard) return adminGuard;

  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });

  await dbConnect();
  const pkg = await MarketplacePackage.findOne({ _id: id, published: true });
  if (!pkg) return NextResponse.json({ success: false, message: "Package not found" }, { status: 404 });

  try {
    const result = await installPackage(pkg.category, pkg.payload, session.user.tenantId, session.user.id);
    // Best-effort popularity counter (never blocks the install).
    await MarketplacePackage.updateOne({ _id: id }, { $inc: { installCount: 1 } }).catch(() => {});
    return NextResponse.json({ success: true, data: result });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message }, { status: 400 });
  }
}
