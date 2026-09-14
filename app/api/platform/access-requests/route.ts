import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import { listAccessRequests, requestOrgAccess, AccessRequestError } from "@/lib/platform/access/request";

export async function GET(request: Request) {
  try {
    const actor = await getAdminActorFromRequest(request);
    if (!actor) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }
    const url = new URL(request.url);
    const status = url.searchParams.get("status") || undefined;
    const requests = await listAccessRequests(status);
    return NextResponse.json({ success: true, data: requests });
  } catch (err) {
    console.error("[platform-access-requests] GET failed", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ success: false, message: "Failed to load access requests." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body?.tenantId || !body?.reason || !body?.requestedScope) {
    return NextResponse.json(
      { success: false, message: "tenantId, reason, and requestedScope are required." },
      { status: 400 },
    );
  }
  try {
    const id = await requestOrgAccess(actor, body.tenantId, body.reason, body.requestedScope);
    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
  } catch (err) {
    if (err instanceof AccessRequestError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    throw err;
  }
}
