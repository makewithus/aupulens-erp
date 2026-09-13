import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import { assertOrganizationDetailAccess, AdminAccessGrantRequiredError } from "@/lib/platform/access/status";
import {
  getOrganizationActivity,
  getOrganizationAiUsage,
  getOrganizationAuditLogs,
  getOrganizationBillingEmptyState,
  getOrganizationConfiguration,
  getOrganizationModules,
  getOrganizationOverview,
  getOrganizationSecurity,
  getOrganizationSubscriptionHistory,
  getOrganizationUsageLimits,
  getOrganizationUsers,
} from "@/lib/platform/organizations/detail";

const VALID_TABS = [
  "overview",
  "users",
  "subscription",
  "activity",
  "audit",
  "ai-usage",
  "billing",
  "modules",
  "configuration",
  "security",
  "usage",
] as const;

// The route param is the tenant's own subdomain (tenantId), the natural
// identifier for an organisation everywhere else in this codebase — not a
// Mongo ObjectId. Matches the pre-existing master-admin tenants routes.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const { id: subdomain } = await params;
  const url = new URL(request.url);
  const tab = (url.searchParams.get("tab") ?? "overview") as (typeof VALID_TABS)[number];
  if (!VALID_TABS.includes(tab)) {
    return NextResponse.json({ success: false, message: "Unknown tab." }, { status: 400 });
  }

  const reason = `platform organisation detail view (${tab})`;
  try {
    await assertOrganizationDetailAccess(actor, subdomain);
    let data: unknown;
    switch (tab) {
      case "overview":
        data = await getOrganizationOverview(actor, reason, subdomain);
        if (!data) {
          return NextResponse.json({ success: false, message: "Organisation not found." }, { status: 404 });
        }
        break;
      case "users":
        data = await getOrganizationUsers(actor, reason, subdomain);
        break;
      case "subscription":
        data = await getOrganizationSubscriptionHistory(actor, reason, subdomain);
        break;
      case "activity":
        data = await getOrganizationActivity(actor, reason, subdomain, {
          userId: url.searchParams.get("userId") ?? undefined,
          dateFrom: url.searchParams.get("dateFrom") ?? undefined,
          dateTo: url.searchParams.get("dateTo") ?? undefined,
          ip: url.searchParams.get("ip") ?? undefined,
          device: url.searchParams.get("device") ?? undefined,
        });
        break;
      case "audit":
        data = await getOrganizationAuditLogs(actor, reason, subdomain);
        break;
      case "ai-usage":
        data = await getOrganizationAiUsage(actor, reason, subdomain);
        break;
      case "billing":
        data = getOrganizationBillingEmptyState();
        break;
      case "modules":
        data = await getOrganizationModules(actor, reason, subdomain);
        break;
      case "configuration":
        data = await getOrganizationConfiguration(actor, reason, subdomain);
        break;
      case "security":
        data = await getOrganizationSecurity(actor, reason, subdomain);
        break;
      case "usage":
        data = await getOrganizationUsageLimits(actor, reason, subdomain);
        break;
    }
    return NextResponse.json({ success: true, data });
  } catch (err) {
    if (err instanceof AdminForbiddenError || err instanceof AdminAccessGrantRequiredError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    throw err;
  }
}
