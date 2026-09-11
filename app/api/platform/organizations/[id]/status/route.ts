import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import {
  changeOrganizationStatus,
  OrganizationStatusError,
} from "@/lib/platform/organizations/statusTransition";

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
  if (!body?.status || !body?.reason) {
    return NextResponse.json(
      { success: false, message: "Both status and reason are required." },
      { status: 400 },
    );
  }

  try {
    await changeOrganizationStatus(actor, subdomain, body.status, body.reason);
    return NextResponse.json({ success: true, data: null });
  } catch (err) {
    if (err instanceof OrganizationStatusError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    throw err;
  }
}
