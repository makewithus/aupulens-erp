import { NextResponse } from "next/server";
import { getAdminActorFromRequest } from "@/lib/platform/auth/adminSession";

export async function GET(request: Request) {
  const actor = await getAdminActorFromRequest(request);
  if (!actor) {
    return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
  }
  return NextResponse.json({
    success: true,
    data: { id: actor.id, email: actor.email, name: actor.name, role: actor.role },
  });
}
