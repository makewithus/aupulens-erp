import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Organization from "@/models/Organization";

// Called by middleware (via fetch) to resolve a tenant's tier + enabledModules
// without holding a Mongoose connection inside the Edge-runtime middleware layer.
//
// Protected by MIDDLEWARE_INTERNAL_SECRET. If the env var is absent in production
// all requests are rejected to prevent enumeration.
// In development without a secret, requests are allowed (DX convenience).
export async function GET(req: NextRequest) {
  const secret = process.env.MIDDLEWARE_INTERNAL_SECRET;
  if (process.env.NODE_ENV === "production" || secret) {
    if (!secret || req.headers.get("x-middleware-secret") !== secret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }

  await connectDB();

  const org = await Organization.findOne(
    { subdomain: tenantId },
    { tier: 1, "settings.enabledModules": 1, subscriptionStatus: 1, trialEndDate: 1 }
  ).lean<{
    tier?: string;
    settings?: { enabledModules?: string[] };
    subscriptionStatus?: string;
    trialEndDate?: Date;
  }>();

  if (!org) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    tier: org.tier ?? "starter",
    enabledModules: org.settings?.enabledModules ?? [],
    subscriptionStatus: org.subscriptionStatus ?? "trial",
    trialEndDate: org.trialEndDate ?? null,
  });
}
