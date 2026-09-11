import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { getActiveAccessGrant } from "@/lib/platform/access/status";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }
  const { id: subdomain } = await params;
  const grant = await getActiveAccessGrant(actor.id, subdomain);
  return NextResponse.json({
    success: true,
    data: grant
      ? { active: true, ...grant, adminName: actor.name }
      : { active: false },
  });
}
