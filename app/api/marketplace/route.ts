import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import MarketplacePackage from "@/models/admin/MarketplacePackage";

/**
 * Marketplace catalog (6.12). GET browses PUBLISHED packages (a shared,
 * cross-tenant catalog — this is intentional; payloads carry no tenant data).
 * The caller must be authenticated with a real tenant.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const guard = requireTenantId(session);
  if (guard) return guard;

  await dbConnect();
  const category = new URL(req.url).searchParams.get("category");
  const query: any = { published: true };
  if (category) query.category = category;

  const packages = await MarketplacePackage.find(query)
    .select("publisherName name description category installCount createdAt")
    .sort({ installCount: -1, createdAt: -1 })
    .limit(100)
    .lean();

  return NextResponse.json({ success: true, data: packages });
}
