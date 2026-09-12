import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { hasCapability } from "@/lib/platform/auth/adminRbac";
import { ADMIN_CAPABILITY } from "@/lib/constants/statuses";
import { getJobStatuses } from "@/lib/platform/scheduler/runner";

export async function GET(request: Request) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }
  if (!(await hasCapability(actor, ADMIN_CAPABILITY.MANAGE_SCHEDULED_JOBS))) {
    return NextResponse.json({ success: false, message: "Forbidden." }, { status: 403 });
  }

  const statuses = await getJobStatuses();
  return NextResponse.json({ success: true, data: statuses });
}
