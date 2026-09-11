import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import { denyOrgAccess, AccessRequestError } from "@/lib/platform/access/request";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    await denyOrgAccess(actor, id, body?.reason ?? "No reason given.");
    return NextResponse.json({ success: true, data: null });
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
