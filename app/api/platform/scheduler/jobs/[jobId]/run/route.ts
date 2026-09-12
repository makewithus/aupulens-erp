import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import { runJobNow } from "@/lib/platform/scheduler/runner";
import { requireCapability } from "@/lib/platform/auth/adminRbac";
import { ADMIN_CAPABILITY } from "@/lib/constants/statuses";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }

  const { jobId } = await params;

  try {
    await requireCapability(actor, ADMIN_CAPABILITY.MANAGE_SCHEDULED_JOBS);
    const outcome = await runJobNow(jobId, actor);
    return NextResponse.json({ success: true, data: outcome });
  } catch (err) {
    if (err instanceof AdminForbiddenError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    if (err instanceof Error && err.message.startsWith("Unknown job")) {
      return NextResponse.json({ success: false, message: err.message }, { status: 404 });
    }
    throw err;
  }
}
