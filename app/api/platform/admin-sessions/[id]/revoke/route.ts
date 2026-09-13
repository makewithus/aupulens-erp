import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import { revokeAdminSessionAsAdmin, AdminSessionActionError } from "@/lib/platform/auth/adminSessions";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const { id: sessionId } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    await revokeAdminSessionAsAdmin(actor, sessionId, body.reason ?? "");
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    if (err instanceof AdminSessionActionError) {
      return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    }
    throw err;
  }
}
