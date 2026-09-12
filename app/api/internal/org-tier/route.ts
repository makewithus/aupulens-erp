import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/db";
import Organization from "@/models/admin/Organization";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";
import { resolveEntitlements } from "@/lib/platform/entitlements/resolve";

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

  // docs/admin/BRIEF-PHASE-9a-ADDENDUM.md Part 1.2's resolution order: an
  // untouched tenant (no OrganizationEntitlement row) never calls
  // resolveEntitlements() at all — zero new code path, zero risk. Only a
  // tenant an admin has deliberately assigned a plan to resolves through
  // entitlements, and even then a resolver error (source: "permissive_default")
  // is NOT trusted as a real module list here — it would otherwise grant
  // every module regardless of tier, which is exactly the kind of silent
  // widening this bridge must never produce. That case falls through to
  // resolvedModules staying undefined, i.e. the legacy tiers.ts ceiling —
  // resolveEntitlements() has already audited its own error at SECURITY
  // severity by the time it returns that fallback value.
  let resolvedModules: string[] | undefined;
  const hasEntitlement = await OrganizationEntitlement.exists({ tenantId });
  if (hasEntitlement) {
    const resolved = await resolveEntitlements(tenantId);
    if (resolved.source !== "permissive_default") {
      resolvedModules = resolved.modules;
    }
  }

  return NextResponse.json({
    tier: org.tier ?? "starter",
    enabledModules: org.settings?.enabledModules ?? [],
    subscriptionStatus: org.subscriptionStatus ?? "trial",
    trialEndDate: org.trialEndDate ?? null,
    resolvedModules,
  });
}
