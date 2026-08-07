import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import Organization from "@/models/Organization";
import MarketplacePackage, { type MarketplaceCategory } from "@/models/MarketplacePackage";
import { sanitizeForCategory } from "@/lib/marketplace/packages";

const CATEGORIES: MarketplaceCategory[] = ["workflow", "approval-policy", "print-format"];

/**
 * Publish a config to the marketplace (6.12). The submitted config is SANITIZED
 * (tenant/user ids stripped, vocabulary-validated) before storing, so a
 * published package can never carry another workspace's data.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  const guard = requireTenantId(session);
  if (guard) return guard;
  const adminGuard = requireAdmin(session);
  if (adminGuard) return adminGuard;

  const body = await req.json();
  const { name, description, category, config } = body;
  if (!name || !CATEGORIES.includes(category)) {
    return NextResponse.json({ success: false, message: `name and a valid category (${CATEGORIES.join(", ")}) are required` }, { status: 400 });
  }

  const payload = sanitizeForCategory(category, config);
  if (!payload) return NextResponse.json({ success: false, message: "The provided config is invalid or empty for this category." }, { status: 400 });

  await dbConnect();
  const org = await Organization.findOne({ subdomain: session.user.tenantId }, { name: 1 }).lean<{ name?: string }>();

  const pkg = await MarketplacePackage.create({
    publisherTenantId: session.user.tenantId,
    publisherName: org?.name || session.user.tenantId,
    name: String(name),
    description: description ? String(description) : undefined,
    category,
    payload,
    createdBy: session.user.id,
  });

  return NextResponse.json({ success: true, data: { id: pkg._id, name: pkg.name, category: pkg.category } });
}
