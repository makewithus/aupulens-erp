import { NextResponse } from "next/server";
import {
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
} from "@/lib/constants/statuses";
import {
  buildAdminSessionClearCookie,
  getAdminActorFromRequest,
  revokeAdminSession,
} from "@/lib/platform/auth/adminSession";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";

export async function POST(request: Request) {
  const actor = await getAdminActorFromRequest(request);
  if (actor) {
    await revokeAdminSession(actor.sessionId, "user_logout");
    await emitPlatformAuditEvent({
      actor,
      eventCategory: PLATFORM_EVENT_CATEGORY.AUTH,
      eventType: PLATFORM_EVENT_TYPE.LOGOUT,
      severity: PLATFORM_SEVERITY.INFO,
      ipAddress: actor.ip,
      userAgent: actor.userAgent,
    });
  }
  const response = NextResponse.json({ success: true, data: null });
  response.headers.set("Set-Cookie", buildAdminSessionClearCookie());
  return response;
}
