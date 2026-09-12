import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import {
  setEntitlementOverride,
  clearEntitlementOverride,
  SetOverrideError,
} from "@/lib/platform/entitlements/setOverride";

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

  try {
    await setEntitlementOverride(actor, subdomain, body.overrides ?? {}, body.reason);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    if (err instanceof SetOverrideError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const { id: subdomain } = await params;
  const url = new URL(request.url);
  const reason = url.searchParams.get("reason") ?? "";

  try {
    await clearEntitlementOverride(actor, subdomain, reason);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    if (err instanceof SetOverrideError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    throw err;
  }
}
