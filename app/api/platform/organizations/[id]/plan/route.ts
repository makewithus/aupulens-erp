import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import { assignPlan, AssignPlanError } from "@/lib/platform/entitlements/assignPlan";
import { resolveEntitlements } from "@/lib/platform/entitlements/resolve";
import { withCrossTenantRead } from "@/lib/platform/tenancy/crossTenant";
import { ADMIN_CAPABILITY, PLATFORM_EVENT_TYPE } from "@/lib/constants/statuses";
import OrganizationEntitlement from "@/models/platform/OrganizationEntitlement";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }
  const { id: subdomain } = await params;
  try {
    const entitlements = await withCrossTenantRead({
      actor,
      capability: ADMIN_CAPABILITY.VIEW_PLANS,
      reason: "platform organisation plan view",
      eventType: PLATFORM_EVENT_TYPE.ORGANIZATION_VIEWED,
      entityType: "Organization",
      entityId: subdomain,
      tenantId: subdomain,
      run: async () => {
        const resolved = await resolveEntitlements(subdomain);
        // §11: the RAW overrides layer (as distinct from the fully-resolved
        // limits above) — what an editor needs to show "what this
        // organisation's override is," not "what it resolves to once merged
        // with the base plan." Additive field, existing consumers unaffected.
        const entitlementDoc = await OrganizationEntitlement.findOne({ tenantId: subdomain })
          .select("overrides")
          .lean();
        return { ...resolved, overrides: entitlementDoc?.overrides ?? null };
      },
    });
    return NextResponse.json({ success: true, data: entitlements });
  } catch (err) {
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    throw err;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }
  const { id: subdomain } = await params;
  const body = await request.json().catch(() => null);
  if (!body?.planKey || !body?.reason) {
    return NextResponse.json(
      { success: false, message: "planKey and reason are required." },
      { status: 400 },
    );
  }

  try {
    await assignPlan(actor, subdomain, body.planKey, body.effective ?? "immediately", body.reason);
    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    if (err instanceof AssignPlanError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    throw err;
  }
}
