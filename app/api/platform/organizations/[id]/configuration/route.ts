import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import {
  updateOrganizationConfiguration,
  OrganizationConfigurationError,
} from "@/lib/platform/organizations/configuration";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const { id: subdomain } = await params;
  const body = await request.json();

  // Only include a field if the caller actually sent it — an update object
  // built from a fixed key list would always have 4 keys (some `undefined`),
  // which would defeat updateOrganizationConfiguration()'s own "apply only
  // what's given" contract and its "no fields supplied" validation.
  const update: Record<string, string> = {};
  for (const field of ["country", "currency", "timezone", "taxJurisdiction"] as const) {
    if (typeof body[field] === "string") update[field] = body[field];
  }

  try {
    await updateOrganizationConfiguration(actor, subdomain, update, body.reason);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    if (err instanceof OrganizationConfigurationError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    throw err;
  }
}
