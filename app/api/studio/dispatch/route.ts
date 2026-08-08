import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import dbConnect from "@/lib/db";
import "@/models/crm/Notification";
import { dispatchEvent } from "@/lib/studio/dispatch";

// POST /api/studio/dispatch — emit an event so matching enabled event-workflows
// run. Body: { eventKey, payload }. Authed (tenant-scoped); other server code
// calls dispatchEvent() directly rather than round-tripping through HTTP.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.tenantId) return NextResponse.json({ success: false }, { status: 401 });

  const body = await req.json();
  const eventKey = String(body.eventKey || "").trim();
  if (!eventKey) return NextResponse.json({ success: false, message: "eventKey is required." }, { status: 400 });
  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};

  await dbConnect();
  const result = await dispatchEvent(session.user.tenantId, eventKey, payload);
  return NextResponse.json({ success: true, data: result });
}
