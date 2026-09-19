import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";
import { AdminForbiddenError } from "@/lib/platform/auth/adminRbac";
import { setTenantMultilingual, MultilingualError } from "@/lib/platform/ai/multilingual";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  const { id: subdomain } = await params;
  const body = await request.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ success: false, message: "`enabled` (boolean) is required." }, { status: 400 });
  }
  try {
    await setTenantMultilingual(actor, subdomain, body.enabled, body.reason);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AdminForbiddenError) return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    if (err instanceof MultilingualError) return NextResponse.json({ success: false, message: err.message }, { status: err.status });
    throw err;
  }
}
