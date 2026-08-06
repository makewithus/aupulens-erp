import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Organization from "@/models/Organization";

/**
 * Real workspace settings read/write (Phase 3) — Organization.settings had
 * full schema support (branding, tax/GST, currency, AI preferences) and was
 * genuinely read/enforced downstream (lib/ai/tenantAi.ts reads settings.ai),
 * but no route ever let an admin change any of it after org creation. The
 * "Settings" sidebar entry was previously commented out + disabled for
 * exactly this reason.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  if (session.user.role !== "admin" && session.user.role !== "master-admin") {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const org = await Organization.findOne({ subdomain: session.user.tenantId })
    .select("name settings tier")
    .lean();
  if (!org) return NextResponse.json({ success: false, message: "Organization not found" }, { status: 404 });

  return NextResponse.json({ success: true, data: { name: org.name, tier: org.tier, settings: org.settings } });
}

const EDITABLE_SETTINGS_FIELDS = [
  "logo",
  "themeColor",
  "timezone",
  "currency",
  "country",
  "state",
  "industry",
  "isGstRegistered",
  "gstin",
  "addressLine1",
  "addressLine2",
  "city",
  "pincode",
] as const;

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });
  if (session.user.role !== "admin" && session.user.role !== "master-admin") {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await req.json();

  const org = await Organization.findOne({ subdomain: session.user.tenantId });
  if (!org) return NextResponse.json({ success: false, message: "Organization not found" }, { status: 404 });

  if (typeof body.name === "string" && body.name.trim()) {
    org.name = body.name.trim();
  }

  for (const field of EDITABLE_SETTINGS_FIELDS) {
    if (body.settings && body.settings[field] !== undefined) {
      (org.settings as any)[field] = body.settings[field];
    }
  }

  if (body.settings?.branding) {
    org.settings.branding = { ...org.settings.branding, ...body.settings.branding };
  }

  // AI preferences — model is an Azure deployment name override, left blank
  // to fall back to the platform default (see lib/ai/tenantAi.ts). Only
  // admin/master-admin can reach this route at all (checked above), so no
  // additional confirm step is layered on top of this write — it's a
  // configuration change, not a destructive/financial action.
  if (body.settings?.ai) {
    org.settings.ai = { ...org.settings.ai, ...body.settings.ai };
  }

  await org.save();

  return NextResponse.json({ success: true, data: { name: org.name, tier: org.tier, settings: org.settings } });
}
