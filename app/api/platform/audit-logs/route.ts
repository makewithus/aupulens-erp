import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import { searchPlatformAuditLogs } from "@/lib/platform/audit/search";
import { PlatformEventCategory, PlatformSeverity } from "@/lib/constants/statuses";

export async function GET(request: Request) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const url = new URL(request.url);
  try {
    const result = await searchPlatformAuditLogs(actor, "platform audit log viewer", {
      page: Number(url.searchParams.get("page") ?? "1"),
      pageSize: Number(url.searchParams.get("pageSize") ?? "50"),
      tenantId: url.searchParams.get("tenantId") || undefined,
      eventCategory: (url.searchParams.get("eventCategory") as PlatformEventCategory) || undefined,
      severity: (url.searchParams.get("severity") as PlatformSeverity) || undefined,
      actorId: url.searchParams.get("actorId") || undefined,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    throw err;
  }
}
