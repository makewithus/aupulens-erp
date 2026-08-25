import { NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import Organization from "@/models/Organization";
import { buildTenantUrl, APP_BASE_URL } from "@/lib/config";

// The sentinel tenantId used app-wide for accounts that registered without
// picking a real organization/subdomain (see app/api/auth/register/route.ts).
// Even when a real Organization document exists for it (its name is looked
// up normally below, same as any other tenant), it was never provisioned as
// an actual routable subdomain, so building a tenant URL for it the normal
// way (buildTenantUrl) points at a dead host — every other place that
// handles this sentinel (TenantInitializer, tenant status route)
// special-cases the URL back to the root app; this route didn't, which is
// what made clicking it in the workspace switcher break the page.
const DEFAULT_TENANT_ID = "default-tenant";

/**
 * Real workspace-switching support (Phase 3): a person can hold a separate
 * User document per organization they belong to (same email, different
 * tenantId — created via the org-invite-accept flow, which reuses the same
 * password hash across orgs). This lists every workspace the currently
 * signed-in email belongs to, so the UI can offer a real "switch workspace"
 * list instead of requiring the user to already know every subdomain they
 * have access to.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ success: false }, { status: 401 });

  await dbConnect();

  const memberships = await User.find({ email: session.user.email.toLowerCase() })
    .select("tenantId role")
    .lean();

  const tenantIds = memberships.map((m) => m.tenantId);
  const orgs = await Organization.find({ subdomain: { $in: tenantIds } })
    .select("subdomain name")
    .lean();
  const orgBySubdomain = new Map(orgs.map((o) => [o.subdomain, o]));

  const workspaces = memberships.map((m) => ({
    tenantId: m.tenantId,
    role: m.role,
    name: orgBySubdomain.get(m.tenantId)?.name
      || (m.tenantId === DEFAULT_TENANT_ID ? "Aupulens (no organization)" : m.tenantId),
    url: m.tenantId === DEFAULT_TENANT_ID ? APP_BASE_URL : buildTenantUrl(m.tenantId),
    current: m.tenantId === session.user.tenantId,
  }));

  return NextResponse.json({ success: true, data: workspaces });
}
