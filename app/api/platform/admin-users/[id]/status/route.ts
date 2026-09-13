import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import { suspendAdminUser, reactivateAdminUser, AdminUserActionError } from "@/lib/platform/auth/adminUsers";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json();
  try {
    if (body.status === "suspended") {
      await suspendAdminUser(actor, id, body.reason);
    } else if (body.status === "active") {
      await reactivateAdminUser(actor, id, body.reason);
    } else {
      return NextResponse.json({ success: false, message: "status must be \"active\" or \"suspended\"." }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    if (err instanceof AdminUserActionError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    throw err;
  }
}
