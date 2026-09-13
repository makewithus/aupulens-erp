import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import { listAdminSessions } from "@/lib/platform/auth/adminSessions";

export async function GET(request: Request) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const url = new URL(request.url);
  try {
    const sessions = await listAdminSessions(actor, "platform admin sessions view", {
      search: url.searchParams.get("search") || undefined,
      role: url.searchParams.get("role") || undefined,
    });
    return NextResponse.json({ success: true, data: sessions });
  } catch (err) {
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    throw err;
  }
}
